"""
bookings -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests.

Authorization (Museum-Manager-only for date closure, Visitor-only for
creation/cancel/reschedule, Cashier-only for a gate-side category
correction) is the view layer's job (permission classes), not this
module's -- services assume the caller has already been authorized,
mirroring accounts/services.py and catalog/services.py's own division of
labor. What this module *does* check is ownership (a Visitor can only
cancel/reschedule their own booking) and state (only a `Pending` booking
can be cancelled/rescheduled/category-corrected) -- those are business
rules, not authorization.

Payment-gateway integration (Chapa checkout session creation) is
deliberately absent here: per Design Spec Sec 3.2, `payments` depends on
`bookings`, not the reverse. A booking this app creates is left in
`awaiting_payment` with `chapa_checkout_url` unset; `apps.payments` is
what populates it once that app exists (Sec 4.2's sequence). Likewise,
cancellation/no-response/category-correction here only transition
`status`/pricing fields and write an audit-log entry -- the actual
refund/top-up-checkout call (FR-REFUND-001a/c, and the ID-verification
category-correction addendum) is `apps.refunds`'/`apps.payments`' job,
called from the view layer, not from this module (Sec 3.2).
"""

from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.catalog.models import Category
from apps.core.exceptions import Conflict
from apps.core.services import write_audit_log

from .models import Booking, BookingItem, DateAvailability

# Document 02 Sec 5 / Document 07: a sensible ceiling on a single
# GET /availability query so a caller can't force an unbounded scan --
# generous enough for the "yearly" reporting granularity in FR-REPORT-002.
MAX_AVAILABILITY_RANGE_DAYS = 366


# --------------------------------------------------------------------------
# Date availability (FR-BOOK-008)
# --------------------------------------------------------------------------


def is_date_open_for_booking(visit_date) -> bool:
    """A date with no row is open by default -- "the system does not
    calculate or track overall museum capacity itself" (FR-BOOK-008); a
    row only exists once the Museum Manager has explicitly acted on it."""
    row = DateAvailability.objects.filter(visit_date=visit_date).first()
    return row is None or row.is_open_for_booking


def list_date_availability(*, date_from, date_to):
    """Implements `GET /availability` (FR-BOOK-008). Returns one entry per
    calendar date in the inclusive range, materializing the "open by
    default" rule for dates that have no row rather than only returning
    dates the Museum Manager has explicitly touched."""
    if date_from > date_to:
        raise ValidationError({"to": "Must not be before 'from'."})
    if (date_to - date_from).days + 1 > MAX_AVAILABILITY_RANGE_DAYS:
        raise ValidationError(
            {"to": f"Range must not exceed {MAX_AVAILABILITY_RANGE_DAYS} days."}
        )

    existing = {
        row.visit_date: row
        for row in DateAvailability.objects.filter(
            visit_date__gte=date_from, visit_date__lte=date_to
        )
    }

    results = []
    current = date_from
    while current <= date_to:
        row = existing.get(current)
        if row is not None:
            results.append(row)
        else:
            # Materialized default -- open, never explicitly touched.
            results.append(DateAvailability(visit_date=current, is_open_for_booking=True))
        current += timedelta(days=1)
    return results


def set_date_availability(*, visit_date, is_open_for_booking, actor):
    """Implements the Museum-Manager-only `PUT /availability/{date}`
    (FR-BOOK-008). "Closing a date does not affect bookings already made
    for it" -- this function never touches an existing `Booking` row."""
    now = timezone.now()
    row, _created = DateAvailability.objects.get_or_create(visit_date=visit_date)
    row.is_open_for_booking = is_open_for_booking
    row.closed_by_user_id = actor
    row.closed_at = now
    row.save()

    write_audit_log(
        actor_id=actor.id,
        action="date_availability.changed",
        target_type="date_availability",
        target_id=visit_date.isoformat(),
        metadata={"is_open_for_booking": is_open_for_booking},
    )
    return row


# --------------------------------------------------------------------------
# Booking creation (FR-BOOK-001, FR-BOOK-003)
# --------------------------------------------------------------------------


def _resolve_items(items):
    """Validates and merges the raw `[{category_id, quantity}, ...]` list
    a caller passes into `create_booking` -- this is the multi-category
    equivalent of the single `category_id`/`quantity` validation the old
    single-line version of this function used to do inline.

    A visitor picking the same category twice (e.g. bumping the Adult
    quantity up in two separate clicks that both end up in the same
    request) is merged into one line rather than rejected -- `BookingItem`
    itself enforces at most one row per category per booking
    (`booking_item_unique_category_per_booking`), so merging here is what
    keeps a well-formed multi-select request from ever hitting that
    constraint. Order of the input list still determines the order
    categories are first seen in, for a stable, predictable receipt/
    summary ordering.
    """
    if not items:
        raise ValidationError({"items": "At least one category is required."})

    merged_quantities = {}
    order = []
    for raw in items:
        category_id = raw["category_id"]
        quantity = raw["quantity"]
        if quantity < 1:
            raise ValidationError({"items": "Each item's quantity must be at least 1."})
        if category_id not in merged_quantities:
            order.append(category_id)
            merged_quantities[category_id] = 0
        merged_quantities[category_id] += quantity

    categories = {
        str(category.id): category
        for category in Category.objects.filter(id__in=order, active=True)
    }
    missing = [category_id for category_id in order if str(category_id) not in categories]
    if missing:
        raise ValidationError({"items": "Not a known, active category."})

    return [
        {"category": categories[str(category_id)], "quantity": merged_quantities[category_id]}
        for category_id in order
    ]


@transaction.atomic
def create_booking(
    *,
    visitor,
    items,
    visit_date,
    booking_type,
    group_name=None,
    group_contact_phone=None,
    group_tin=None,
):
    """Implements FR-BOOK-001 (individual) and FR-BOOK-003 (group).

    `items` is a non-empty list of `{"category_id": ..., "quantity": ...}`
    -- one entry per visitor category in this single checkout (FR-BOOK-001
    doesn't limit a booking to one category: a party mixing categories,
    e.g. one Adult plus two Student tickets, is one `Booking` with one
    `BookingItem` per category, not one `Booking` per category).

    A group booking is otherwise identical to an individual one -- it
    starts `awaiting_payment` just the same, ready for `apps.payments` to
    create a Chapa checkout session against it. There is no Museum
    Manager approval step: `DateAvailability` (FR-BOOK-008) is the only
    capacity control, and it already governs every booking, individual or
    group, by rejecting the request outright when the date is closed.
    `group_name`/`group_contact_phone` are retained purely as manifest
    metadata for the Cashier at the gate (FR-BOOK-003), not as a workflow
    gate. `group_tin` -- the institutional payer's Tax Identification
    Number -- is required alongside `group_name` for a group booking: the
    finance office's IFMIS receipt voucher for one of these bookings
    needs it for reconciliation (see `Booking.group_tin`'s own field
    comment). It's never set for an individual booking.
    """
    if not visitor.email_verified_at or not visitor.phone_verified_at:
        # FR-ACC-003: both must be verified before an online booking can
        # proceed -- there is no separate account-creation step besides
        # completing FR-ACC-001's OTP-and-email-link verification.
        raise ValidationError(
            "Both your email and phone must be verified before you can book online."
        )

    if booking_type == Booking.BookingType.GROUP and not group_name:
        raise ValidationError({"groupName": "Required for a group booking."})
    if booking_type == Booking.BookingType.GROUP and not group_tin:
        raise ValidationError({"groupTin": "Required for a group booking."})

    resolved_items = _resolve_items(items)

    if not is_date_open_for_booking(visit_date):
        raise Conflict("This date is closed to online booking.")

    booked_quantity = sum(item["quantity"] for item in resolved_items)
    total_amount_etb = sum(
        item["category"].price_etb * item["quantity"] for item in resolved_items
    )

    is_group = booking_type == Booking.BookingType.GROUP
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=visit_date,
        booking_type=booking_type,
        group_name=group_name if is_group else None,
        group_contact_phone=group_contact_phone,
        group_tin=group_tin if is_group else None,
        booked_quantity=booked_quantity,
        total_amount_etb=total_amount_etb,
        status=Booking.Status.AWAITING_PAYMENT,
    )

    BookingItem.objects.bulk_create(
        BookingItem(
            booking=booking,
            category=item["category"],
            category_name_en=item["category"].name_en,
            category_name_am=item["category"].name_am,
            unit_price_etb=item["category"].price_etb,
            quantity=item["quantity"],
            subtotal_etb=item["category"].price_etb * item["quantity"],
        )
        for item in resolved_items
    )

    write_audit_log(
        actor_id=visitor.id,
        action="booking.created",
        target_type="booking",
        target_id=booking.id,
        metadata={"booking_type": booking_type, "visit_date": visit_date.isoformat()},
    )
    return booking


# --------------------------------------------------------------------------
# Cashier-only category/quantity correction (ID-verification addendum)
# --------------------------------------------------------------------------


def correct_booking_category(*, booking, item_id, actor, category_id=None, quantity=None):
    """Implements the Cashier-only `PATCH /bookings/{id}/category-correction`
    (ID-verification addendum to Document 02 Sec 2.2): at the gate, before
    check-in, a Cashier discovers one of the booking's ticket-holders'
    ID doesn't match the category they booked under (e.g. booked as
    Student, no valid student ID), or that the party's actual headcount
    for one line item doesn't match what was booked (e.g. 3 tickets
    bought under one category but only 2 people show up under it, or the
    reverse), and corrects it here.

    `item_id` identifies *which* `BookingItem` on this booking to correct
    -- a party booked under a single category still has exactly one item
    to pick from, but a mixed-category booking (e.g. one Adult plus two
    Student tickets) can have the Cashier discover the problem is with
    just one of several ticket-holders, not the whole party.

    `category_id`/`quantity` are each optional, but at least one must be
    given -- a Cashier may be fixing just the category (a bad ID), just
    the quantity (a headcount mismatch), or both at once (e.g. one of
    three "Student" ticket-holders lacks an ID *and* it turns out only
    one of the remaining two actually showed up under that ticket).
    Whichever is omitted is left exactly as it was; there's no "no
    correction" default to fall back on for either field individually.
    Only that one item's category/quantity/price/subtotal is corrected;
    `Booking.total_amount_etb`/`booked_quantity` are then recomputed as
    the sum across every item (corrected or not).

    Only ever on a `Pending` booking -- i.e. paid, but not yet checked
    in. Once `apps.entrance.services.check_in_booking` has run, the
    booking is `Visited` and this is no longer reachable, mirroring how
    `_require_own_pending_booking` above already gates cancel/reschedule
    the same way (both are "before the Cashier has acted" windows, just
    for different actors).

    This function only ever mutates the item's own category/quantity/
    price fields and the booking's aggregate total/headcount (and, for
    an undercharge, reopens `status` for payment) -- it never calls into
    `apps.payments` or `apps.refunds` itself. Creating the follow-up
    top-up checkout session (undercharge) or issuing the refund
    (overcharge) is the view layer's job, exactly like
    `BookingCancelView`/`BookingListCreateView.post` already compose
    `apps.refunds`/`apps.payments` at that layer, never from this module
    (Design Spec Sec 3.2). This is deliberately the same money-math path
    for a category correction, a quantity correction, or both together
    -- the view layer only ever looks at the returned `delta`, never at
    which field(s) changed, so there's exactly one undercharge/overcharge
    code path to keep correct rather than two nearly-identical ones.

    Returns `(booking, delta)`, where `delta = new_total - old_total`:
    positive means the visitor now owes the difference (undercharge),
    negative means they're owed a refund (overcharge), zero means the
    correction happens to leave the total unchanged.
    """
    if booking.status != Booking.Status.PENDING:
        raise Conflict("Only a Pending booking's category can be corrected.")

    if category_id is None and quantity is None:
        raise ValidationError(
            {"categoryId": "Provide categoryId, quantity, or both -- at least one is required."}
        )

    if quantity is not None and quantity < 1:
        raise ValidationError({"quantity": "Must be at least 1."})

    try:
        item = booking.items.get(id=item_id)
    except BookingItem.DoesNotExist:
        raise ValidationError({"itemId": "Not one of this booking's line items."})

    category = item.category
    if category_id is not None:
        try:
            category = Category.objects.get(id=category_id, active=True)
        except Category.DoesNotExist:
            raise ValidationError({"categoryId": "Not a known, active category."})

        if category.id == item.category_id:
            raise ValidationError({"categoryId": "This is already the item's category."})
        if booking.items.filter(category=category).exclude(id=item.id).exists():
            # This booking already has a separate line for that category
            # -- merging into it would collide with `BookingItem`'s own
            # `booking_item_unique_category_per_booking` constraint, and
            # simply bumping that other line's quantity instead is a
            # different operation than "correct this ticket-holder's
            # category" (it would also misattribute this item's price
            # history). Not expected to come up often in practice, but
            # rejected explicitly rather than left to the DB constraint
            # to surface as an opaque IntegrityError.
            raise ValidationError(
                {"categoryId": "This booking already has a separate line for that category."}
            )

    new_quantity = item.quantity if quantity is None else quantity
    if quantity is not None and category_id is None and new_quantity == item.quantity:
        raise ValidationError({"quantity": "This is already the item's quantity."})

    old_total = booking.total_amount_etb
    old_booked_quantity = booking.booked_quantity
    old_item_subtotal = item.subtotal_etb
    old_item_quantity = item.quantity
    old_category_id = item.category_id
    # `category.price_etb` is the category's *current* active price --
    # deliberately re-snapshotted here even when `category_id` wasn't
    # given (i.e. `category is item.category`), for the same reason the
    # category-change branch above always did: at the gate, this is a
    # correction to what's actually true right now, not a re-application
    # of whatever price happened to be in effect when the booking was
    # first made.
    new_unit_price = category.price_etb
    new_item_subtotal = new_unit_price * new_quantity

    item.category = category
    item.category_name_en = category.name_en
    item.category_name_am = category.name_am
    item.unit_price_etb = new_unit_price
    item.quantity = new_quantity
    item.subtotal_etb = new_item_subtotal
    item.save(
        update_fields=[
            "category",
            "category_name_en",
            "category_name_am",
            "unit_price_etb",
            "quantity",
            "subtotal_etb",
            "updated_at",
        ]
    )

    new_total = old_total - old_item_subtotal + new_item_subtotal
    new_booked_quantity = old_booked_quantity - old_item_quantity + new_quantity
    delta = new_total - old_total

    booking.total_amount_etb = new_total
    booking.booked_quantity = new_booked_quantity
    booking.category_corrected_at = timezone.now()
    booking.category_corrected_by_user_id = actor

    update_fields = [
        "total_amount_etb",
        "booked_quantity",
        "category_corrected_at",
        "category_corrected_by_user_id",
        "updated_at",
    ]

    if delta > 0:
        # Undercharge: reopen payment for just the difference, exactly
        # like a fresh booking's first payment -- see
        # apps.payments.services.create_checkout_session's own
        # `amount` parameter for why this is a *second* Payment against
        # the same booking, not a re-charge of the full corrected total.
        # FR-TICKET-003's Pending-only check-in guard then does the rest:
        # this booking cannot be checked in again until that top-up
        # payment is confirmed and this status moves back to Pending.
        booking.status = Booking.Status.AWAITING_PAYMENT
        update_fields.append("status")
    # delta <= 0 (overcharge or exact match): status is left untouched --
    # a `Pending` booking that's owed a refund is still checkable-in right
    # away, it just also gets money back (delta == 0 needs neither a
    # top-up nor a refund, but the item's category/quantity/price fields
    # are still corrected for accuracy at the gate and on any future
    # receipt).

    booking.save(update_fields=update_fields)

    write_audit_log(
        actor_id=actor.id,
        action="booking.category_corrected",
        target_type="booking",
        target_id=booking.id,
        metadata={
            "item_id": str(item.id),
            "old_category_id": str(old_category_id),
            "new_category_id": str(category.id),
            "old_quantity": old_item_quantity,
            "new_quantity": new_quantity,
            "old_item_subtotal_etb": str(old_item_subtotal),
            "new_item_subtotal_etb": str(new_item_subtotal),
            "old_total_amount_etb": str(old_total),
            "new_total_amount_etb": str(new_total),
            "old_booked_quantity": old_booked_quantity,
            "new_booked_quantity": new_booked_quantity,
            "delta_etb": str(delta),
        },
    )
    return booking, delta


# --------------------------------------------------------------------------
# Cashier-only batched correction (fixes the "Too many reopening changes"
# gate-workflow gap: multiple undercharging edits in one visit)
# --------------------------------------------------------------------------


def apply_booking_corrections(*, booking, actor, ops):
    """Batch sibling of `correct_booking_category`/`add_booking_item` above.

    Those two functions are each single-item and each independently flip
    a `Pending` booking to `AwaitingPayment` the moment their own change is
    an undercharge -- fine for a lone correction, but it means a Cashier
    who needs to bump *two* categories' headcounts in the same visit (both
    undercharges) can't: the first PATCH reopens payment and the second
    then 409s against the `Pending`-only guard, because the booking isn't
    Pending any more. `CategoryCorrectionPanel` (frontend) used to detect
    this ahead of time and refuse to submit ("Too many reopening
    changes...") rather than let the second call fail server-side.

    This function is the real fix: it takes the *whole* batch of edits/
    adds the Cashier queued up and applies them as ONE atomic operation
    against the booking, so there's only ever one combined delta and the
    booking is reopened for payment (or refunded) at most once, no matter
    how many of the individual line changes are themselves undercharges.

    `ops` is a list of dicts, each shaped like one call to
    `correct_booking_category` (edit) or `add_booking_item` (add):
        {"item_id": UUID | None, "category_id": UUID | None, "quantity": int | None}
    `item_id=None` means "add a new line" -- mirroring `add_booking_item`,
    both `category_id` and `quantity` are then required. Otherwise it's an
    edit of that existing `BookingItem` -- mirroring
    `correct_booking_category`, `category_id`/`quantity` are each
    individually optional but at least one must be given.

    A category move (an edit whose `category_id` points at a category
    another item on the booking currently holds) is applied in dependency
    order within the batch -- once that other item's own edit in this same
    batch has moved it off that category -- for the same
    `booking_item_unique_category_per_booking` reason
    `correct_booking_category`'s own docstring explains; a genuine two-way
    swap (A wants B's category, B wants A's, both in the same batch) has
    no valid order and is rejected with a `Conflict`, same as the
    frontend's own `buildCorrectionPlan` used to detect client-side.

    Only on a `Pending` booking, same window as the two single-item
    functions. Returns `(booking, delta)`, same contract as
    `correct_booking_category`: positive is a combined undercharge
    (reopens payment for the whole difference at once), negative is a
    combined overcharge (one refund for the whole difference), zero means
    the batch nets out to no change in total owed.
    """
    if booking.status != Booking.Status.PENDING:
        raise Conflict("Only a Pending booking's category can be corrected.")

    if not ops:
        raise ValidationError({"ops": "At least one correction is required."})

    edit_ops = [o for o in ops if o.get("item_id") is not None]
    add_ops = [o for o in ops if o.get("item_id") is None]

    item_ids = [o["item_id"] for o in edit_ops]
    if len(set(item_ids)) != len(item_ids):
        raise ValidationError({"itemId": "Each line item can only be corrected once per batch."})

    for o in edit_ops:
        if o.get("category_id") is None and o.get("quantity") is None:
            raise ValidationError(
                {"categoryId": "Provide categoryId, quantity, or both for each corrected item."}
            )
        if o.get("quantity") is not None and o["quantity"] < 1:
            raise ValidationError({"quantity": "Must be at least 1."})

    for o in add_ops:
        if o.get("category_id") is None or o.get("quantity") is None:
            raise ValidationError({"categoryId": "A new (walk-up) line needs both categoryId and quantity."})
        if o["quantity"] < 1:
            raise ValidationError({"quantity": "Must be at least 1."})

    with transaction.atomic():
        # Lock this booking's items for the duration -- same reasoning as
        # any other read-then-write correction, just now covering several
        # rows at once instead of one.
        items_by_id = {
            str(item.id): item for item in booking.items.select_for_update()
        }
        missing = [str(o["item_id"]) for o in edit_ops if str(o["item_id"]) not in items_by_id]
        if missing:
            raise ValidationError({"itemId": "Not one of this booking's line items."})

        # Category currently (pre-batch) held by each item -- the
        # dependency map a category-move's ordering is resolved against,
        # exactly like `originalOwnerByCategory` in the frontend panel.
        owner_by_category = {str(item.category_id): str(item.id) for item in items_by_id.values()}

        resolved = []
        for o in edit_ops:
            item = items_by_id[str(o["item_id"])]
            category = item.category
            category_changed = o.get("category_id") is not None
            if category_changed:
                try:
                    category = Category.objects.get(id=o["category_id"], active=True)
                except Category.DoesNotExist:
                    raise ValidationError({"categoryId": "Not a known, active category."})
                if category.id == item.category_id:
                    raise ValidationError({"categoryId": "This is already the item's category."})

            new_quantity = item.quantity if o.get("quantity") is None else o["quantity"]
            if o.get("quantity") is not None and not category_changed and new_quantity == item.quantity:
                raise ValidationError({"quantity": "This is already the item's quantity."})

            resolved.append(
                {
                    "item": item,
                    "category": category,
                    "category_changed": category_changed,
                    "quantity": new_quantity,
                }
            )

        # Order the edits (Kahn's algorithm) so a category-move only ever
        # runs once whatever item currently owns that category has itself
        # already been moved off it -- see this function's own docstring.
        ordered = []
        done_ids = set()
        remaining = resolved
        while remaining:
            ready, blocked = [], []
            for r in remaining:
                blocker_id = owner_by_category.get(str(r["category"].id)) if r["category_changed"] else None
                if not blocker_id or blocker_id == str(r["item"].id) or blocker_id in done_ids:
                    ready.append(r)
                else:
                    blocked.append(r)
            if not ready:
                raise Conflict(
                    "Two of the queued changes need to swap categories directly with each "
                    "other -- that can't be applied in one batch. Apply one on its own, let "
                    "it save, then apply the other."
                )
            ordered.extend(ready)
            done_ids.update(str(r["item"].id) for r in ready)
            remaining = blocked

        # Final category each existing item will hold once the edits
        # above are applied -- what add_ops below are validated against,
        # same "no duplicate category on the booking" rule
        # `add_booking_item` enforces, just accounting for this batch's
        # own edits rather than only the booking's pre-batch state.
        final_category_ids = {str(r["item"].category_id if not r["category_changed"] else r["category"].id) for r in ordered}
        for item_id, item in items_by_id.items():
            if item_id not in {str(r["item"].id) for r in ordered}:
                final_category_ids.add(str(item.category_id))

        resolved_adds = []
        for o in add_ops:
            try:
                category = Category.objects.get(id=o["category_id"], active=True)
            except Category.DoesNotExist:
                raise ValidationError({"categoryId": "Not a known, active category."})
            if str(category.id) in final_category_ids:
                raise ValidationError(
                    {"categoryId": "This booking already has a line for that category -- correct its quantity instead."}
                )
            final_category_ids.add(str(category.id))
            resolved_adds.append({"category": category, "quantity": o["quantity"]})

        old_total = booking.total_amount_etb
        old_booked_quantity = booking.booked_quantity
        running_total = old_total
        running_booked_quantity = old_booked_quantity
        op_audit_entries = []

        for r in ordered:
            item = r["item"]
            old_subtotal = item.subtotal_etb
            old_quantity = item.quantity
            old_category_id = item.category_id
            new_unit_price = r["category"].price_etb
            new_subtotal = new_unit_price * r["quantity"]

            item.category = r["category"]
            item.category_name_en = r["category"].name_en
            item.category_name_am = r["category"].name_am
            item.unit_price_etb = new_unit_price
            item.quantity = r["quantity"]
            item.subtotal_etb = new_subtotal
            item.save(
                update_fields=[
                    "category",
                    "category_name_en",
                    "category_name_am",
                    "unit_price_etb",
                    "quantity",
                    "subtotal_etb",
                    "updated_at",
                ]
            )

            running_total = running_total - old_subtotal + new_subtotal
            running_booked_quantity = running_booked_quantity - old_quantity + r["quantity"]
            op_audit_entries.append(
                {
                    "item_id": str(item.id),
                    "old_category_id": str(old_category_id),
                    "new_category_id": str(r["category"].id),
                    "old_quantity": old_quantity,
                    "new_quantity": r["quantity"],
                    "old_item_subtotal_etb": str(old_subtotal),
                    "new_item_subtotal_etb": str(new_subtotal),
                }
            )

        for a in resolved_adds:
            subtotal = a["category"].price_etb * a["quantity"]
            new_item = BookingItem.objects.create(
                booking=booking,
                category=a["category"],
                category_name_en=a["category"].name_en,
                category_name_am=a["category"].name_am,
                unit_price_etb=a["category"].price_etb,
                quantity=a["quantity"],
                subtotal_etb=subtotal,
            )
            running_total = running_total + subtotal
            running_booked_quantity = running_booked_quantity + a["quantity"]
            op_audit_entries.append(
                {
                    "item_id": str(new_item.id),
                    "old_category_id": None,
                    "new_category_id": str(a["category"].id),
                    "old_quantity": 0,
                    "new_quantity": a["quantity"],
                    "old_item_subtotal_etb": "0",
                    "new_item_subtotal_etb": str(subtotal),
                }
            )

        new_total = running_total
        new_booked_quantity = running_booked_quantity
        delta = new_total - old_total

        booking.total_amount_etb = new_total
        booking.booked_quantity = new_booked_quantity
        booking.category_corrected_at = timezone.now()
        booking.category_corrected_by_user_id = actor

        update_fields = [
            "total_amount_etb",
            "booked_quantity",
            "category_corrected_at",
            "category_corrected_by_user_id",
            "updated_at",
        ]
        if delta > 0:
            # One combined reopen for however many of the batch's own
            # edits/adds were individually undercharges -- this is the
            # whole point of this function over calling
            # correct_booking_category/add_booking_item in a loop.
            booking.status = Booking.Status.AWAITING_PAYMENT
            update_fields.append("status")

        booking.save(update_fields=update_fields)

        write_audit_log(
            actor_id=actor.id,
            action="booking.corrections_applied",
            target_type="booking",
            target_id=booking.id,
            metadata={
                "ops": op_audit_entries,
                "old_total_amount_etb": str(old_total),
                "new_total_amount_etb": str(new_total),
                "old_booked_quantity": old_booked_quantity,
                "new_booked_quantity": new_booked_quantity,
                "delta_etb": str(delta),
            },
        )

    return booking, delta


def add_booking_item(*, booking, actor, category_id, quantity):
    """Implements the Cashier-only `POST /bookings/{id}/items` (walk-up
    addendum to the ID-verification correction flow above).

    `correct_booking_category` only ever touches an *existing*
    `BookingItem` -- it re-prices or re-sizes one already-booked category
    line, or moves one ticket-holder from one category to another.
    Neither branch covers a walk-up party joining an already-paid booking
    under a category that wasn't on it at all (e.g. a group booked as 3
    Students shows up with 2 Adults in tow who were never part of the
    original booking) -- there is no existing item for the Cashier to
    "correct" into that category, and forcing this through
    `correct_booking_category` would either collide with
    `booking_item_unique_category_per_booking` (if another Adult line
    already existed) or silently reassign one of the Students' tickets to
    Adult (wrong: that Student ticket-holder is still there too). This
    function creates the missing line instead of repurposing one.

    Always an undercharge -- a brand-new item only ever adds to the
    total, unlike `correct_booking_category` where the delta can go
    either way -- so, mirroring that function's undercharge branch
    exactly, this always reopens payment for the new item's full price
    and never calls into `apps.payments` itself (view layer's job, same
    boundary reasons as `BookingCategoryCorrectionView` above).

    Only on a `Pending` booking, same gate-side window as
    `correct_booking_category` (before `apps.entrance.services.
    check_in_booking` has moved it to `Visited`).

    Returns `(booking, new_item)`.
    """
    if booking.status != Booking.Status.PENDING:
        raise Conflict("Items can only be added to a Pending booking.")

    if quantity < 1:
        raise ValidationError({"quantity": "Must be at least 1."})

    try:
        category = Category.objects.get(id=category_id, active=True)
    except Category.DoesNotExist:
        raise ValidationError({"categoryId": "Not a known, active category."})

    if booking.items.filter(category=category).exists():
        # Already has a line for this category -- that's a quantity
        # correction on the existing item (`correct_booking_category`),
        # not a new one; adding a second row here would collide with
        # `booking_item_unique_category_per_booking`.
        raise ValidationError(
            {"categoryId": "This booking already has a line for that category -- correct its quantity instead."}
        )

    old_total = booking.total_amount_etb
    old_booked_quantity = booking.booked_quantity

    unit_price = category.price_etb
    subtotal = unit_price * quantity

    new_item = BookingItem.objects.create(
        booking=booking,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=unit_price,
        quantity=quantity,
        subtotal_etb=subtotal,
    )

    new_total = old_total + subtotal
    new_booked_quantity = old_booked_quantity + quantity
    delta = new_total - old_total

    booking.total_amount_etb = new_total
    booking.booked_quantity = new_booked_quantity
    booking.category_corrected_at = timezone.now()
    booking.category_corrected_by_user_id = actor
    # Same reopen-for-the-difference path as correct_booking_category's
    # undercharge branch: this is unconditional here since a brand-new
    # item is always additive.
    booking.status = Booking.Status.AWAITING_PAYMENT

    booking.save(
        update_fields=[
            "total_amount_etb",
            "booked_quantity",
            "category_corrected_at",
            "category_corrected_by_user_id",
            "status",
            "updated_at",
        ]
    )

    write_audit_log(
        actor_id=actor.id,
        action="booking.item_added",
        target_type="booking",
        target_id=booking.id,
        metadata={
            "item_id": str(new_item.id),
            "category_id": str(category.id),
            "quantity": quantity,
            "subtotal_etb": str(subtotal),
            "old_total_amount_etb": str(old_total),
            "new_total_amount_etb": str(new_total),
            "old_booked_quantity": old_booked_quantity,
            "new_booked_quantity": new_booked_quantity,
            "delta_etb": str(delta),
        },
    )
    return booking, new_item


# --------------------------------------------------------------------------
# Cancel / reschedule (FR-BOOK-005 - FR-BOOK-007)
# --------------------------------------------------------------------------


def _require_own_pending_booking(*, booking, visitor):
    if booking.visitor_id != visitor.id:
        # Deliberately 403, not 404 -- the booking exists, this Visitor
        # just doesn't own it (mirrors accounts' identical-error
        # discipline for auth, applied here to ownership instead).
        raise PermissionDenied("This booking does not belong to you.")
    if booking.status != Booking.Status.PENDING:
        # FR-BOOK-005/FR-TICKET-003: once the Cashier has begun
        # processing arrival (status is no longer Pending), the Visitor
        # can no longer cancel or reschedule it themselves.
        raise Conflict("This booking is no longer Pending and can't be changed by you.")


def cancel_booking(*, booking, visitor):
    """Implements FR-BOOK-005/006. Only transitions status here -- the
    "full, automatic refund" itself (FR-BOOK-006) is `apps.refunds`'
    responsibility, triggered off this status change, not called
    directly from this module (Sec 3.2: `refunds` depends on `bookings`,
    not the reverse)."""
    _require_own_pending_booking(booking=booking, visitor=visitor)

    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status", "updated_at"])

    write_audit_log(
        actor_id=visitor.id,
        action="booking.cancelled",
        target_type="booking",
        target_id=booking.id,
        metadata={},
    )
    return booking


def reschedule_booking(*, booking, visitor, new_visit_date):
    """Implements FR-BOOK-007: same eligibility window as cancellation,
    at most one reschedule ever (also enforced at the DB level by
    `Booking`'s `rescheduled_count <= 1` CheckConstraint)."""
    _require_own_pending_booking(booking=booking, visitor=visitor)

    if booking.rescheduled_count >= 1:
        raise Conflict("This booking has already been rescheduled once.")

    if not is_date_open_for_booking(new_visit_date):
        raise Conflict("This date is closed to online booking.")

    booking.visit_date = new_visit_date
    booking.rescheduled_count += 1
    booking.save(update_fields=["visit_date", "rescheduled_count", "updated_at"])

    write_audit_log(
        actor_id=visitor.id,
        action="booking.rescheduled",
        target_type="booking",
        target_id=booking.id,
        metadata={"new_visit_date": new_visit_date.isoformat()},
    )
    return booking


# --------------------------------------------------------------------------
# Listing (FR-ACC-004, staff filtering)
# --------------------------------------------------------------------------


def list_my_bookings(*, visitor, status=None):
    """Implements `GET /users/me/bookings` (FR-ACC-004) -- a Visitor's own
    booking history, whether they've booked once or many times."""
    queryset = (
        Booking.objects.select_related("visitor").prefetch_related("items").filter(visitor=visitor)
    )
    if status:
        queryset = queryset.filter(status=status)
    return queryset


def list_bookings_for_staff(*, status=None, visit_date=None, booking_type=None):
    """Implements `GET /bookings` (Staff only). Visitors use
    `list_my_bookings` above -- this has no ownership scoping at all,
    matching the single-venue, flat-role authorization model (Sec 4.3)."""
    # select_related("visitor") -- BookingSerializer reads
    # visitor.full_name/email/phone for every row in this list.
    # prefetch_related("items") -- BookingSerializer now reads the full
    # per-category line-item list (`items`) for every row too.
    queryset = Booking.objects.select_related("visitor").prefetch_related("items")
    if status:
        queryset = queryset.filter(status=status)
    if visit_date:
        queryset = queryset.filter(visit_date=visit_date)
    if booking_type:
        queryset = queryset.filter(booking_type=booking_type)
    return queryset
