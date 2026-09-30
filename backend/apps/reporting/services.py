"""
reporting -- services

Per Design Spec Sec 3.1: all business logic and cross-model orchestration
lives here. This is the layer that enforces the business rules from
Document 02 and is unit-tested directly (NFR-MAINT-001) without spinning
up HTTP requests.

This module owns no tables (models.py) -- every function here is a
read-only query over `apps.bookings.Booking`, `apps.payments.Payment`,
and `apps.refunds.Refund` (Document 05 Sec 7).

Shared vocabulary used by both functions below:

- "Reportable" bookings (`_reportable_bookings_queryset`) are those whose
  status is one of the four FR-REPORT-001 calls out by name -- Pending,
  Visited, Cancelled, Refunded. `AwaitingPayment` is deliberately
  excluded: that's a pre-checkout state a booking may never emerge from
  (an abandoned checkout), so it was never a completed "digital booking"
  for reporting purposes -- counting it would overstate both revenue
  potential and visitor interest. This is the set used for headcounts
  (`visitor_counts_by_group`/`visitor_counts_by_category`), the group-
  vs-individual split, `booking_count`, and the status mix -- a Manager
  planning tomorrow needs to see Pending (paid, arriving later) bookings
  in those numbers, not just who's already walked in.
- "Revenue" (`_visited_bookings_queryset`, `_net_revenue_by_category`,
  `_net_revenue_total`) is recognized at check-in, not at payment: only
  `Visited` bookings count. A `Pending` booking has been paid for, but
  paid-and-not-yet-arrived is still a liability, not revenue earned, until
  the visitor actually shows up -- a booking for next month that happens
  to be paid today shouldn't inflate today's revenue figure, and a no-
  show that's later cancelled/refunded (`Cancelled`/`Refunded`) never
  becomes revenue at all under this rule, matching what actually happened
  (nobody visited). Net of completed `Refund` amounts either way
  (`Refund.amount_etb` is already the net figure returned to the
  Visitor, per `apps.refunds.models.Refund`'s own docstring) -- this
  still matters for a `Visited` booking, since a partial-shortfall
  refund (paid-but-unattended tickets on an otherwise-attended booking,
  `apps.refunds.services.request_partial_shortfall_refund`) reduces what
  was actually earned without moving the booking off `Visited` -- mirrors
  the "net figure (revenue minus refunds)" framing Document 02 Sec 2.7
  uses for the Finance-facing transfer receipt, applied here to the
  Manager-facing dashboard/report instead.
"""

import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Case, Count, F, Sum, TextField, Value, When
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.accounts.models import Account
from apps.bookings.models import Booking, BookingItem, DateAvailability
from apps.institutions.models import Institution
from apps.payments.models import Payment
from apps.refunds.models import Refund
from apps.settlement.models import CashierReconciliation

# The four FR-REPORT-001 statuses -- see module docstring.
_REPORTABLE_STATUSES = [
    Booking.Status.PENDING,
    Booking.Status.VISITED,
    Booking.Status.CANCELLED,
    Booking.Status.REFUNDED,
]

_VALID_PERIODS = {"daily", "weekly", "monthly", "yearly"}

# Phase 7b (UAT round 1) additions -- every report in this module takes
# an arbitrary `from`/`to` range (no hardcoded quarters at the query
# level), but the reports UI's preset chips still need names to resolve
# against, same as the four original `_VALID_PERIODS` above. Kept as a
# second set, not merged into `_VALID_PERIODS`, because these five are
# resolved by `resolve_period_range` the same way but are NOT valid
# values for `ReportSummarySerializer.period`'s `yearly`-means-fiscal-year
# contract -- `this_fiscal_year` is this set's own explicit name for that
# same range instead, so the two sets never need reconciling field-by-field.
_EXTENDED_PRESETS = {
    "this_quarter",
    "last_quarter",
    "this_fiscal_year",
    "last_30_days",
    "custom",
}

_INDIVIDUAL_GROUP_KEY = "Individual"

# The five statuses FR-REPORT-004's timeline buckets per visit_date --
# unlike `_REPORTABLE_STATUSES` above, `AwaitingPayment` IS included here
# on purpose: see `get_booking_timeline`'s docstring for why a Manager
# deciding whether to close a crowded date needs to see abandoned
# checkouts too, not just completed ones.
_TIMELINE_STATUSES = [
    Booking.Status.AWAITING_PAYMENT,
    Booking.Status.PENDING,
    Booking.Status.VISITED,
    Booking.Status.CANCELLED,
    Booking.Status.REFUNDED,
]

_DEFAULT_TIMELINE_DAYS = 14
_MAX_TIMELINE_DAYS = 92


# --------------------------------------------------------------------------
# Shared querysets
# --------------------------------------------------------------------------


def _reportable_bookings_queryset():
    """Every booking FR-REPORT-001/002 count towards visitor counts,
    the group/individual split, `booking_count`, or the status mix --
    see module docstring for why AwaitingPayment bookings are excluded,
    and `_visited_bookings_queryset` below for why revenue does NOT use
    this queryset."""
    return Booking.objects.filter(status__in=_REPORTABLE_STATUSES)


def _visited_bookings_queryset():
    """The queryset revenue is computed over -- see module docstring's
    "Revenue" entry for why this is narrower than
    `_reportable_bookings_queryset` (Pending/Cancelled/Refunded all
    mean "not revenue yet", not just "AwaitingPayment does")."""
    return Booking.objects.filter(status=Booking.Status.VISITED)


def _net_revenue_by_booking(*, bookings_queryset):
    """Completed-payment total minus completed-refund total, per booking
    -- the shared core both `_net_revenue_by_category` below and every
    Phase 7b report in this module build on, extracted out of what used
    to be `_net_revenue_by_category`'s own first half so the same
    booking-level netting logic isn't re-derived (and risk drifting) in
    every report that needs a per-booking revenue figure (institutions,
    revenue-by-period-bucket, individual-vs-institutional split)."""
    booking_ids = list(bookings_queryset.values_list("id", flat=True))

    payments_by_booking = dict(
        Payment.objects.filter(status=Payment.Status.COMPLETED, booking_id__in=booking_ids)
        .values_list("booking_id")
        .annotate(total=Sum("amount_etb"))
    )
    refunds_by_booking = dict(
        Refund.objects.filter(status=Refund.Status.COMPLETED, booking_id__in=booking_ids)
        .values_list("booking_id")
        .annotate(total=Sum("amount_etb"))
    )
    return {
        booking_id: (
            payments_by_booking.get(booking_id, Decimal("0"))
            - refunds_by_booking.get(booking_id, Decimal("0"))
        )
        for booking_id in set(payments_by_booking) | set(refunds_by_booking)
    }


def _net_revenue_by_category(*, bookings_queryset):
    """Completed-payment total minus completed-refund total, grouped by
    `BookingItem.category_name_en` (the bilingual snapshot taken at
    booking time, per `apps.bookings.models.BookingItem` -- never a live
    join to `catalog.Category`, so a since-retired or renamed category
    still reports correctly against historical bookings).

    A `Payment`/`Refund` is still recorded once per *booking*, not once
    per category (Chapa is only ever charged/refunded a single lump sum
    per booking, per `apps.payments`/`apps.refunds`) -- so a booking's net
    revenue is first computed per booking (`_net_revenue_by_booking`
    above), then split across that booking's `BookingItem`s in proportion
    to each item's share of `Booking.total_amount_etb`. For a
    single-category booking (still the common case) every cent of its
    net revenue lands on that one category, unchanged from before; a
    mixed booking (e.g. one Adult plus two Student tickets) instead
    attributes its net revenue proportionally across both.
    """
    booking_ids = list(bookings_queryset.values_list("id", flat=True))
    net_revenue_by_booking = _net_revenue_by_booking(bookings_queryset=bookings_queryset)

    items = BookingItem.objects.filter(booking_id__in=booking_ids).values_list(
        "booking_id", "category_name_en", "subtotal_etb", "booking__total_amount_etb"
    )

    revenue_by_category = {}
    for booking_id, category, subtotal, booking_total in items:
        # Every category on a booking that never had a completed
        # payment/refund still shows up, at zero, same as the old
        # per-category `.distinct()` list did.
        revenue_by_category.setdefault(category, Decimal("0"))
        net = net_revenue_by_booking.get(booking_id)
        if not net or not booking_total:
            continue
        revenue_by_category[category] += (subtotal / booking_total) * net

    return revenue_by_category


def _net_revenue_total(*, bookings_queryset):
    payments_total = Payment.objects.filter(
        status=Payment.Status.COMPLETED, booking__in=bookings_queryset
    ).aggregate(total=Coalesce(Sum("amount_etb"), Decimal("0")))["total"]
    refunds_total = Refund.objects.filter(
        status=Refund.Status.COMPLETED, booking__in=bookings_queryset
    ).aggregate(total=Coalesce(Sum("amount_etb"), Decimal("0")))["total"]
    return payments_total - refunds_total


# --------------------------------------------------------------------------
# 1. Dashboard (FR-REPORT-001 -- GET /reports/dashboard)
# --------------------------------------------------------------------------


def get_dashboard():
    """Implements `GET /reports/dashboard`. A live snapshot, not scoped to
    any date range (Document 04 defines no query parameters for this
    endpoint) -- NFR-PERF-001 requires it reflect a change within
    seconds, which only makes sense read against current totals, not a
    fixed historical window (that's what `get_report_summary` is for).
    """
    bookings = _reportable_bookings_queryset()

    # Summed over `BookingItem.quantity`, not `Booking.booked_quantity`
    # directly -- a booking's `booked_quantity` is now a cross-category
    # total (FR-BOOK-001 no longer limits a booking to one category), so
    # the per-category breakdown has to come from the line items instead.
    visitor_counts_by_category = dict(
        BookingItem.objects.filter(booking__in=bookings)
        .values_list("category_name_en")
        .annotate(total=Sum("quantity"))
        .order_by()
    )

    group_counts = dict(
        bookings.values_list("booking_type").annotate(total=Count("id")).order_by()
    )
    group_vs_individual_split = {
        "group": group_counts.get(Booking.BookingType.GROUP, 0),
        "individual": group_counts.get(Booking.BookingType.INDIVIDUAL, 0),
    }

    status_counts = dict(
        bookings.values_list("status").annotate(total=Count("id")).order_by()
    )
    status_mix = {
        "pending": status_counts.get(Booking.Status.PENDING, 0),
        "visited": status_counts.get(Booking.Status.VISITED, 0),
        "cancelled": status_counts.get(Booking.Status.CANCELLED, 0),
        "refunded": status_counts.get(Booking.Status.REFUNDED, 0),
    }

    return {
        # Deliberately NOT `bookings` -- see `_visited_bookings_queryset`.
        # A Pending (paid, not yet arrived) booking must still show up in
        # `status_mix`/`visitor_counts_by_category`/`group_vs_individual_split`
        # below (all still computed off the full `bookings` queryset), just
        # not counted as revenue yet.
        "revenue_total_etb": _net_revenue_total(
            bookings_queryset=_visited_bookings_queryset()
        ),
        "visitor_counts_by_category": visitor_counts_by_category,
        "group_vs_individual_split": group_vs_individual_split,
        "status_mix": status_mix,
    }


# --------------------------------------------------------------------------
# 2. Period resolution (shared by get_report_summary)
# --------------------------------------------------------------------------


def _fiscal_year_bounds(*, on_date):
    """The fiscal year `on_date` falls in, per `FISCAL_YEAR_START_MONTH`/
    `FISCAL_YEAR_START_DAY` (config/settings/base.py) -- a configuration
    value, not a schema/code constant, per Document 05 Sec 5's note that
    the exact boundary is still an open question with the Finance Office
    (Document 02 Sec 5). A fiscal year starting on `(month, day)` in year
    Y runs from that date up to (but not including) the same date in
    year Y+1.
    """
    start_month = settings.FISCAL_YEAR_START_MONTH
    start_day = settings.FISCAL_YEAR_START_DAY

    candidate_start = date(on_date.year, start_month, start_day)
    if on_date >= candidate_start:
        start = candidate_start
        end_year = on_date.year + 1
    else:
        start = date(on_date.year - 1, start_month, start_day)
        end_year = on_date.year

    end = date(end_year, start_month, start_day) - timedelta(days=1)
    return start, end


def resolve_period_range(*, period, date_from=None, date_to=None):
    """Implements `GET /reports/summary`'s `period`/`from`/`to` query
    parameters (Document 04). An explicit `from`/`to` pair always wins
    (lets a Manager pull an arbitrary custom range under any granularity
    label); with neither supplied, the range defaults to the current
    instance of `period` -- e.g. `monthly` with no dates means "this
    calendar month so far". `yearly` is the one granularity that does
    NOT mean the Gregorian calendar year -- it follows the organization's
    fiscal year (FR-REPORT-002), per `_fiscal_year_bounds` above.
    """
    if period not in _VALID_PERIODS:
        raise ValidationError(
            {"period": f"Must be one of {sorted(_VALID_PERIODS)}."}
        )

    if bool(date_from) != bool(date_to):
        raise ValidationError(
            {"from": "Provide both `from` and `to`, or neither."}
        )

    if date_from and date_to:
        if date_from > date_to:
            raise ValidationError({"from": "Must not be after `to`."})
        return date_from, date_to

    # `timezone.localdate()`, NOT the naive `date.today()` -- the latter
    # reads the *host process's* clock (UTC on most deployment targets),
    # while `TIME_ZONE` (config/settings/base.py) is "Africa/Addis_Ababa"
    # (UTC+3). For the first three hours of every Addis Ababa calendar
    # day, `date.today()` on a UTC-clocked host still reports the
    # *previous* day -- so a Visitor who books and a Cashier who checks
    # them in at, say, 1am Addis Ababa time both correctly stamp
    # `visit_date`/`checked_in_at` against "today" in the museum's own
    # timezone, but this function's old `date.today()` would then look
    # for "today" one calendar day too early and never find that
    # booking -- exactly the bug report behind this fix: a Visitor paid,
    # a Cashier checked them in, and the Manager's dashboard still showed
    # ETB 0 for "today's revenue" (GET /reports/summary?period=daily,
    # frontend/.../staff/dashboard/page.tsx's `revenueToday`).
    # `apps.bookings.tasks` already gets this right via
    # `timezone.localdate()`; this was the one place in the reporting
    # path that didn't.
    today = timezone.localdate()

    if period == "daily":
        return today, today

    if period == "weekly":
        start = today - timedelta(days=today.weekday())
        end = start + timedelta(days=6)
        return start, end

    if period == "monthly":
        start = today.replace(day=1)
        end = today.replace(day=calendar.monthrange(today.year, today.month)[1])
        return start, end

    # period == "yearly"
    return _fiscal_year_bounds(on_date=today)


# --------------------------------------------------------------------------
# 3. Periodic report (FR-REPORT-002 -- GET /reports/summary)
# --------------------------------------------------------------------------


def get_report_summary(*, period, date_from=None, date_to=None):
    """Implements `GET /reports/summary`. Scoped by `Booking.visit_date`
    (the date of the museum visit itself, not when it was booked or paid
    for) -- the natural reporting period for a venue is "how much
    revenue/how many visitors did this day/week/month/year of *operation*
    bring in", which is what `visit_date` represents; `created_at` would
    instead measure booking-office activity, a different question
    Document 02 doesn't ask for here.
    """
    start, end = resolve_period_range(
        period=period, date_from=date_from, date_to=date_to
    )

    bookings = _reportable_bookings_queryset().filter(
        visit_date__gte=start, visit_date__lte=end
    )

    # Revenue is scoped to Visited bookings only, same date range --
    # NOT `bookings` above, which still includes Pending (paid, not yet
    # arrived). See `_visited_bookings_queryset` / module docstring.
    revenue_by_category = _net_revenue_by_category(
        bookings_queryset=_visited_bookings_queryset().filter(
            visit_date__gte=start, visit_date__lte=end
        )
    )

    group_key = Case(
        When(booking_type=Booking.BookingType.GROUP, then=F("group_name")),
        default=Value(_INDIVIDUAL_GROUP_KEY),
        output_field=TextField(),
    )
    visitor_counts_by_group = dict(
        bookings.annotate(group_key=group_key)
        .values_list("group_key")
        .annotate(total=Sum("booked_quantity"))
        .order_by()
    )

    return {
        "period": period,
        "from": start,
        "to": end,
        # Distinct `Booking` rows in the period -- deliberately separate
        # from `visitor_counts_by_group` below, which sums
        # `booked_quantity` (ticket/headcount, not booking count): one
        # booking for a family of four is 1 booking but 4 visitors, and
        # conflating the two is exactly what made the Manager dashboard's
        # "bookings today" figure read as a visitor count instead
        # (frontend/.../staff/dashboard/page.tsx).
        "booking_count": bookings.count(),
        "revenue_by_category": revenue_by_category,
        "visitor_counts_by_group": visitor_counts_by_group,
    }


# --------------------------------------------------------------------------
# 4. Cashier balances (FR-REPORT-003 -- GET /reports/cashier-balances)
# --------------------------------------------------------------------------
#
# Document 05 Sec 7 scoped FR-REPORT-001 - FR-REPORT-003 as reporting's
# full remit ("Derived from `booking`, `payment`, `cashier_reconciliation`")
# and `reporting/models.py`'s own docstring names "per-cashier settlement
# position" as in-scope -- but only 001/002 ever got a view. This is 003:
# a Manager-facing rollup of every Cashier's current outstanding balance
# (`apps.settlement.services.get_outstanding_balance` already computes
# this, but only ever for the one Cashier making the request against
# `GET /settlement/my-balance/` -- there is no cross-cashier view there,
# by design, per that module's own docstring). Reused here read-only,
# for every Cashier at once, which is exactly the "read, never write"
# boundary Design Spec Sec 3.1 draws for this app.


def get_cashier_balances():
    """Implements `GET /reports/cashier-balances`. For every Cashier
    account, her current outstanding balance -- money already collected
    (a `Visited` booking she personally checked in) but not yet swept
    into a completed Chapa Transfer to the university's bank account
    (`apps.settlement.models.CashierReconciliation`) -- computed with the
    exact same rule `apps.settlement.services.get_outstanding_balance`
    uses for a Cashier's own "my balance" screen: her unreconciled
    `Visited` bookings' `total_amount_etb`, minus her unreconciled
    completed refunds against those same bookings.

    This is the reconciliation check FR-REPORT-003 exists for: summed
    across every Cashier, `total_outstanding_etb` (still sitting in
    Chapa's pooled balance) plus `total_reconciled_etb` (every completed
    `CashierReconciliation.amount_etb` -- money already transferred out)
    should equal `get_dashboard()["revenue_total_etb"]` (`total_revenue_etb`
    below, computed independently off `Payment`/`Refund` rather than off
    `Booking`/`CashierReconciliation`, so the two numbers cross-check each
    other rather than trivially agreeing by construction). A mismatch
    between `total_revenue_etb` and `total_outstanding_etb +
    total_reconciled_etb` means a booking's recorded `Payment` didn't
    equal its `total_amount_etb` -- worth a Manager's attention -- rather
    than something this endpoint should silently paper over.
    """
    cashiers = list(
        Account.objects.filter(role=Account.Role.CASHIER).order_by("full_name")
    )
    cashier_ids = [cashier.id for cashier in cashiers]

    # One query for every cashier's unreconciled `Visited` bookings --
    # mirrors `apps.settlement.services._outstanding_bookings_queryset`,
    # generalized from "one cashier" to "every cashier, grouped".
    booked_rows = (
        Booking.objects.filter(
            checked_in_by_user_id__in=cashier_ids,
            status=Booking.Status.VISITED,
            reconciliation__isnull=True,
        )
        .values_list("checked_in_by_user_id")
        .annotate(total=Sum("total_amount_etb"), count=Count("id"))
    )
    booked_totals = {row[0]: row[1] for row in booked_rows}
    booked_counts = {row[0]: row[2] for row in booked_rows}

    # Mirrors `apps.settlement.services._undeducted_refunds_queryset`,
    # likewise generalized across every cashier at once.
    refunded_rows = (
        Refund.objects.filter(
            booking__checked_in_by_user_id__in=cashier_ids,
            status=Refund.Status.COMPLETED,
            deducted_in_transfer_id__isnull=True,
        )
        .values_list("booking__checked_in_by_user_id")
        .annotate(total=Sum("amount_etb"))
    )
    refunded_totals = {row[0]: row[1] for row in refunded_rows}

    balances = []
    total_outstanding = Decimal("0")
    for cashier in cashiers:
        booked = booked_totals.get(cashier.id, Decimal("0"))
        refunded = refunded_totals.get(cashier.id, Decimal("0"))
        outstanding = booked - refunded
        total_outstanding += outstanding
        balances.append(
            {
                "cashier_id": cashier.id,
                "cashier_name": cashier.full_name,
                "outstanding_balance_etb": outstanding,
                "unreconciled_booking_count": booked_counts.get(cashier.id, 0),
            }
        )

    total_reconciled = CashierReconciliation.objects.filter(
        status=CashierReconciliation.Status.COMPLETED
    ).aggregate(total=Coalesce(Sum("amount_etb"), Decimal("0")))["total"]

    # Independently derived from `Payment`/`Refund` (see `_net_revenue_total`)
    # rather than from `total_outstanding + total_reconciled` -- see this
    # function's docstring on why the two are meant to be compared, not
    # unified into one code path.
    total_revenue = _net_revenue_total(bookings_queryset=_visited_bookings_queryset())

    return {
        "cashiers": balances,
        "total_outstanding_etb": total_outstanding,
        "total_reconciled_etb": total_reconciled,
        "total_revenue_etb": total_revenue,
    }


# --------------------------------------------------------------------------
# 5. Booking timeline (new -- GET /reports/booking-timeline)
# --------------------------------------------------------------------------


def get_booking_timeline(*, date_from=None, date_to=None):
    """Implements `GET /reports/booking-timeline`. A day-by-day breakdown
    (by `Booking.visit_date`, same field `get_report_summary` scopes by)
    of how many bookings/visitors fall into each status on each date in
    range -- the view `get_report_summary`/`get_dashboard` don't cover:
    both give a Manager a single number for a single period, never "day 3
    of this range looks a lot busier than day 4".

    Unlike every other function in this module, `AwaitingPayment` bookings
    ARE included (`_TIMELINE_STATUSES`, not `_REPORTABLE_STATUSES`) --
    this view exists so a Manager can decide whether to close a date in
    Availability (`apps.bookings.models.DateAvailability`,
    `PUT /availability/{date}/`) before it fills up, and an abandoned
    checkout still occupied a visitor's mental "I tried to book that day"
    slot even though it will never become revenue; excluding it here
    would hide exactly the kind of demand signal (many failed/abandoned
    checkouts on one date) a Manager might want to see alongside
    confirmed bookings.

    Every date in `[date_from, date_to]` is represented in the result --
    including ones with zero bookings -- so the frontend can render a
    continuous calendar/chart without gap-filling itself. Defaults to the
    next `_DEFAULT_TIMELINE_DAYS` days starting today (the museum's local
    "today", `timezone.localdate()` -- see `resolve_period_range`'s own
    fix for why that matters) when no range is given, since the primary
    use case (deciding whether to close an upcoming date) looks forward,
    not back; an explicit `from`/`to` pair still works for a historical
    look, capped at `_MAX_TIMELINE_DAYS` so this can't be used to force
    an unbounded per-day scan.
    """
    if bool(date_from) != bool(date_to):
        raise ValidationError(
            {"from": "Provide both `from` and `to`, or neither."}
        )

    if date_from and date_to:
        if date_from > date_to:
            raise ValidationError({"from": "Must not be after `to`."})
        start, end = date_from, date_to
    else:
        start = timezone.localdate()
        end = start + timedelta(days=_DEFAULT_TIMELINE_DAYS - 1)

    if (end - start).days + 1 > _MAX_TIMELINE_DAYS:
        raise ValidationError(
            {"to": f"Range must not exceed {_MAX_TIMELINE_DAYS} days."}
        )

    rows = (
        Booking.objects.filter(
            visit_date__gte=start, visit_date__lte=end, status__in=_TIMELINE_STATUSES
        )
        .values("visit_date", "status")
        .annotate(booking_count=Count("id"), headcount=Coalesce(Sum("booked_quantity"), 0))
    )
    by_date = {}
    for row in rows:
        by_date.setdefault(row["visit_date"], {})[row["status"]] = row

    # Only dates the Manager has explicitly closed -- see
    # `DateAvailability`'s own docstring: a date with no row is open by
    # default, resolved here rather than assumed by the caller, same as
    # `apps.bookings.services` does for the booking flow itself.
    closed_dates = set(
        DateAvailability.objects.filter(
            visit_date__gte=start,
            visit_date__lte=end,
            is_open_for_booking=False,
        ).values_list("visit_date", flat=True)
    )

    def _headcount(day_rows, status):
        return day_rows.get(status, {}).get("headcount", 0)

    def _count(day_rows, status):
        return day_rows.get(status, {}).get("booking_count", 0)

    days = []
    current = start
    while current <= end:
        day_rows = by_date.get(current, {})
        pending_headcount = _headcount(day_rows, Booking.Status.PENDING)
        visited_headcount = _headcount(day_rows, Booking.Status.VISITED)
        days.append(
            {
                "visit_date": current,
                "is_open_for_booking": current not in closed_dates,
                "awaiting_payment_count": _count(day_rows, Booking.Status.AWAITING_PAYMENT),
                "pending_count": _count(day_rows, Booking.Status.PENDING),
                "visited_count": _count(day_rows, Booking.Status.VISITED),
                "cancelled_count": _count(day_rows, Booking.Status.CANCELLED),
                "refunded_count": _count(day_rows, Booking.Status.REFUNDED),
                "awaiting_payment_headcount": _headcount(
                    day_rows, Booking.Status.AWAITING_PAYMENT
                ),
                "pending_headcount": pending_headcount,
                "visited_headcount": visited_headcount,
                # "How many people are actually still expected/arrived on
                # this date" -- Pending (paid, not yet arrived) plus
                # Visited (already arrived), the same two statuses
                # `get_dashboard`'s module docstring treats as "reportable
                # and not yet resolved away" -- deliberately excludes
                # AwaitingPayment (never completed checkout) and
                # Cancelled/Refunded (no longer coming), which is exactly
                # the number a Manager weighs against real capacity when
                # deciding whether to close this date.
                "expected_headcount": pending_headcount + visited_headcount,
            }
        )
        current += timedelta(days=1)

    return {"from": start, "to": end, "days": days}


# ============================================================================
# Phase 7b (UAT round 1) -- the manager reporting layer proper. Everything
# below takes an arbitrary `date_from`/`date_to` range (resolved from a
# preset chip or a custom picker by `resolve_report_range`, never
# hardcoded to a fixed period), and is scoped to `Booking.visit_date`,
# same convention as `get_report_summary` above. Every revenue figure
# reuses `_net_revenue_by_booking`/`_net_revenue_by_category` above --
# there is exactly one place completed-payment-minus-completed-refund
# netting happens in this codebase, not a second one re-derived here.
# ============================================================================


def _quarter_bounds(*, on_date, offset=0):
    """Calendar quarter (Jan-Mar/Apr-Jun/Jul-Sep/Oct-Dec) containing
    `on_date`, shifted back `offset` quarters (0 = this quarter, 1 = last
    quarter). Deliberately calendar, not fiscal -- `this_fiscal_year`
    below is the fiscal-aligned preset; a bare "quarter" without that
    qualifier is the ordinary calendar one, the more common everyday
    meaning and the one that needs no extra settings lookup to explain."""
    quarter_index = (on_date.month - 1) // 3
    total_quarters = on_date.year * 4 + quarter_index - offset
    year, quarter_index = divmod(total_quarters, 4)
    start_month = quarter_index * 3 + 1
    start = date(year, start_month, 1)
    end_month = start_month + 2
    end_year = year
    if end_month > 12:
        end_month -= 12
        end_year += 1
    end = date(end_year, end_month, calendar.monthrange(end_year, end_month)[1])
    return start, end


def resolve_report_range(*, preset=None, date_from=None, date_to=None):
    """Shared period resolution for every report function below --
    sibling to `resolve_period_range` above, which stays untouched for
    `get_report_summary`'s own four-value `period` contract. Kept
    separate because the reports UI's preset chips (Today / This week /
    This month / This quarter / Last quarter / This year / Last 30 days,
    plus a custom from-to picker) don't map 1:1 onto `_VALID_PERIODS` --
    "This quarter"/"Last quarter"/"Last 30 days" have no equivalent
    there at all, and this UI's "This year" means the fiscal year, so
    it's spelled `this_fiscal_year` here to stay unambiguous next to a
    literal calendar-quarter preset.

    An explicit `from`/`to` pair always wins (must be given together, and
    `from` must not be after `to`). Without one, `preset` is required and
    is resolved against `timezone.localdate()` (Africa/Addis_Ababa, never
    a UTC host clock) -- the same rule `resolve_period_range` already
    documents and every date-scoped report in this module follows."""
    if bool(date_from) != bool(date_to):
        raise ValidationError({"from": "Provide both `from` and `to`, or neither."})
    if date_from and date_to:
        if date_from > date_to:
            raise ValidationError({"from": "Must not be after `to`."})
        return date_from, date_to

    if not preset:
        raise ValidationError({"preset": "Required when `from`/`to` are not both given."})
    valid = _VALID_PERIODS | _EXTENDED_PRESETS
    if preset not in valid:
        raise ValidationError({"preset": f"Must be one of {sorted(valid)}."})
    if preset == "custom":
        raise ValidationError({"from": "Required when preset is `custom`."})

    if preset in _VALID_PERIODS:
        return resolve_period_range(period=preset)

    today = timezone.localdate()
    if preset == "last_30_days":
        return today - timedelta(days=29), today
    if preset == "this_quarter":
        return _quarter_bounds(on_date=today, offset=0)
    if preset == "last_quarter":
        return _quarter_bounds(on_date=today, offset=1)
    # preset == "this_fiscal_year"
    return resolve_period_range(period="yearly")


def _choose_bucket_granularity(*, date_from, date_to):
    """Auto-picks how coarsely to bucket a period-over-time chart so a
    year-long range doesn't render 365 unreadable daily bars, and a
    single week doesn't collapse into one monthly blob: <=31 days ->
    daily, <=180 days -> weekly, else monthly. Not user-configurable --
    every range this module resolves already has a natural bucket size,
    so exposing a separate granularity control would just be one more
    setting for the Manager to get wrong."""
    days = (date_to - date_from).days + 1
    if days <= 31:
        return "daily"
    if days <= 180:
        return "weekly"
    return "monthly"


def _bucket_start(*, on_date, granularity):
    if granularity == "daily":
        return on_date
    if granularity == "weekly":
        return on_date - timedelta(days=on_date.weekday())
    return on_date.replace(day=1)


# --------------------------------------------------------------------------
# Institutions report (Phase 7b)
# --------------------------------------------------------------------------


def get_institutions_report(*, date_from, date_to, institution_id=None, limit=25, offset=0, sort="-revenue_etb"):
    """Per-institution rollup over the range: visit count, distinct visit
    dates, booked/attended headcount, net revenue, first/last visit.

    Scoped to `Visited` group bookings only -- a "visit" the Manager is
    counting here is one that actually happened, same convention
    `get_report_summary`'s own revenue figure already uses. Grouped by
    `Booking.institution_id` when set; a legacy/unlinked group booking
    (no `institution` FK -- `apps.institutions`' own backfill migration
    docstring covers why this can still happen) falls back to a
    `(group_name, group_tin)` identity instead, so it's still represented
    rather than silently dropped, just not mergeable with a same-school
    booking that *did* resolve to a real `Institution` row.
    """
    if date_from > date_to:
        raise ValidationError({"from": "Must not be after `to`."})

    bookings = Booking.objects.filter(
        status=Booking.Status.VISITED,
        booking_type=Booking.BookingType.GROUP,
        visit_date__gte=date_from,
        visit_date__lte=date_to,
    )
    if institution_id:
        bookings = bookings.filter(institution_id=institution_id)

    rows = list(
        bookings.values(
            "id",
            "visit_date",
            "booked_quantity",
            "attended_quantity",
            "institution_id",
            "institution__name",
            "institution__tin",
            "group_name",
            "group_tin",
        )
    )
    net_by_booking = _net_revenue_by_booking(bookings_queryset=bookings)

    grouped = {}
    for row in rows:
        key = row["institution_id"] or f"legacy:{row['group_name']}:{row['group_tin']}"
        entry = grouped.setdefault(
            key,
            {
                "institution_id": row["institution_id"],
                "name": row["institution__name"] or row["group_name"],
                "tin": row["institution__tin"] or row["group_tin"],
                "visit_count": 0,
                "visit_dates": set(),
                "booked_total": 0,
                "attended_total": 0,
                "revenue_etb": Decimal("0"),
                "first_visit": None,
                "last_visit": None,
            },
        )
        entry["visit_count"] += 1
        entry["visit_dates"].add(row["visit_date"])
        entry["booked_total"] += row["booked_quantity"]
        entry["attended_total"] += row["attended_quantity"] or 0
        entry["revenue_etb"] += net_by_booking.get(row["id"], Decimal("0"))
        if entry["first_visit"] is None or row["visit_date"] < entry["first_visit"]:
            entry["first_visit"] = row["visit_date"]
        if entry["last_visit"] is None or row["visit_date"] > entry["last_visit"]:
            entry["last_visit"] = row["visit_date"]

    results = [
        {
            "institution_id": entry["institution_id"],
            "name": entry["name"],
            "tin": entry["tin"],
            "visit_count": entry["visit_count"],
            "distinct_visit_dates": len(entry["visit_dates"]),
            "booked_total": entry["booked_total"],
            "attended_total": entry["attended_total"],
            "revenue_etb": entry["revenue_etb"],
            "first_visit": entry["first_visit"],
            "last_visit": entry["last_visit"],
        }
        for entry in grouped.values()
    ]

    sort_key_map = {
        "name": lambda r: (r["name"] or "").lower(),
        "visit_count": lambda r: r["visit_count"],
        "revenue_etb": lambda r: r["revenue_etb"],
        "attended_total": lambda r: r["attended_total"],
    }
    sort_field = sort[1:] if sort.startswith("-") else sort
    key_fn = sort_key_map.get(sort_field, sort_key_map["revenue_etb"])
    results.sort(key=key_fn, reverse=sort.startswith("-"))

    total = len(results)
    page = results[offset : offset + limit]

    return {
        "from": date_from,
        "to": date_to,
        "data": page,
        "meta": {"limit": limit, "offset": offset, "total": total},
    }


def get_institution_detail(*, institution_id, date_from=None, date_to=None):
    """One institution's own visit history -- every `Visited` group
    booking linked to it, newest first, each with its per-category
    headcount, net amount, and IFMIS voucher identifiers (Phase 6). No
    date range required (unlike every other report here): a school's
    whole history is a small, naturally bounded list, and a Manager
    drilling into one institution is usually asking "when has this
    school visited, ever", not "in this specific window" -- `date_from`/
    `date_to` narrow it when given, same `both-or-neither` rule as
    everywhere else, but neither is required.
    """
    try:
        institution = Institution.objects.get(id=institution_id)
    except Institution.DoesNotExist:
        raise NotFound("Institution not found.")

    bookings = Booking.objects.filter(
        institution_id=institution_id,
        booking_type=Booking.BookingType.GROUP,
        status=Booking.Status.VISITED,
    )
    if bool(date_from) != bool(date_to):
        raise ValidationError({"from": "Provide both `from` and `to`, or neither."})
    if date_from and date_to:
        if date_from > date_to:
            raise ValidationError({"from": "Must not be after `to`."})
        bookings = bookings.filter(visit_date__gte=date_from, visit_date__lte=date_to)

    bookings = bookings.order_by("-visit_date", "-checked_in_at").prefetch_related("items")
    net_by_booking = _net_revenue_by_booking(bookings_queryset=bookings)

    visits = []
    for booking in bookings:
        headcount_by_category = {}
        for item in booking.items.all():
            attended = item.attended_quantity if item.attended_quantity is not None else item.quantity
            headcount_by_category[item.category_name_en] = attended
        visits.append(
            {
                "booking_id": booking.id,
                "reference": booking.reference,
                "visit_date": booking.visit_date,
                "checked_in_at": booking.checked_in_at,
                "headcount_by_category": headcount_by_category,
                "booked_quantity": booking.booked_quantity,
                "attended_quantity": booking.attended_quantity,
                "amount_etb": net_by_booking.get(booking.id, Decimal("0")),
                "ifmis_document_no": booking.ifmis_document_no,
                "ifmis_voucher_reference": booking.ifmis_voucher_reference,
            }
        )

    return {
        "institution": {
            "id": institution.id,
            "name": institution.name,
            "name_am": institution.name_am,
            "tin": institution.tin,
        },
        "from": date_from,
        "to": date_to,
        "visits": visits,
    }


# --------------------------------------------------------------------------
# Categories report (Phase 7b)
# --------------------------------------------------------------------------


def get_categories_report(*, date_from, date_to):
    """Headcount and revenue by category over the range, plus a
    per-period time series (bucketed by `_choose_bucket_granularity`) of
    attended headcount per category -- the chart data behind "which
    categories are trending".

    `booked_total` comes from every reportable booking (FR-REPORT-ish
    "what was sold"); `attended_total`/`revenue_etb` are `Visited`-only
    (what actually happened / was actually earned), same split
    `get_report_summary` already draws. `revenue_share_pct` is `None`,
    not `0`, when there's no revenue at all to share -- a real 0% share
    and "nothing to compute a percentage of" are different states, and
    conflating them would make an all-free-category range look like
    every category earned nothing, rather than like there was nothing to
    measure at all.
    """
    if date_from > date_to:
        raise ValidationError({"from": "Must not be after `to`."})
    granularity = _choose_bucket_granularity(date_from=date_from, date_to=date_to)

    reportable = _reportable_bookings_queryset().filter(visit_date__gte=date_from, visit_date__lte=date_to)
    visited = reportable.filter(status=Booking.Status.VISITED)

    booked_by_category = dict(
        BookingItem.objects.filter(booking__in=reportable)
        .values_list("category_name_en")
        .annotate(total=Sum("quantity"))
    )
    attended_by_category = dict(
        BookingItem.objects.filter(booking__in=visited)
        .values_list("category_name_en")
        .annotate(total=Coalesce(Sum("attended_quantity"), 0))
    )
    revenue_by_category = _net_revenue_by_category(bookings_queryset=visited)
    total_revenue = sum(revenue_by_category.values()) if revenue_by_category else Decimal("0")

    categories = sorted(set(booked_by_category) | set(attended_by_category) | set(revenue_by_category))
    category_rows = [
        {
            "category": category,
            "booked_total": booked_by_category.get(category, 0),
            "attended_total": attended_by_category.get(category, 0),
            "revenue_etb": revenue_by_category.get(category, Decimal("0")),
            "revenue_share_pct": (
                float(revenue_by_category.get(category, Decimal("0")) / total_revenue * 100)
                if total_revenue
                else None
            ),
        }
        for category in categories
    ]

    buckets = {}
    for category, visit_date, attended in BookingItem.objects.filter(booking__in=visited).values_list(
        "category_name_en", "booking__visit_date", "attended_quantity"
    ):
        bucket_start = _bucket_start(on_date=visit_date, granularity=granularity)
        bucket = buckets.setdefault(bucket_start, {})
        bucket[category] = bucket.get(category, 0) + (attended or 0)

    period_buckets = [
        {"bucket_start": bucket_start, "counts_by_category": counts}
        for bucket_start, counts in sorted(buckets.items())
    ]

    return {
        "from": date_from,
        "to": date_to,
        "granularity": granularity,
        "categories": category_rows,
        "period_buckets": period_buckets,
    }


# --------------------------------------------------------------------------
# Attendance report (Phase 7b)
# --------------------------------------------------------------------------


def get_attendance_report(*, date_from, date_to):
    """Booked vs. attended vs. shortfall over the range, overall and by
    category, plus how much of that shortfall the Manager's own
    correction workflow (Phase 3) actually touched -- `corrected_booking_
    count` (bookings whose category/quantity she corrected) and
    `currently_flagged_count` (bookings a Cashier has flagged that are
    STILL awaiting her correction, right now, not scoped to the date
    range -- a flag has no "when it happened" that matters to this
    report the way a completed correction's date does; it matters that
    it's *still open*).

    `shortfall_total`/`shortfall_rate_pct` reflect `Visited` bookings
    only -- by Phase 3's own design, a mismatch can no longer reach
    check-in uncorrected (`apps.entrance.services.check_in_booking`'s own
    docstring), so a nonzero shortfall here is only ever legacy data
    predating that change, not something new bookings can still produce.
    Kept anyway, not assumed zero, so this report still tells the truth
    about older data.
    """
    if date_from > date_to:
        raise ValidationError({"from": "Must not be after `to`."})

    visited = _visited_bookings_queryset().filter(visit_date__gte=date_from, visit_date__lte=date_to)

    overall = visited.aggregate(
        booked=Coalesce(Sum("booked_quantity"), 0),
        attended=Coalesce(Sum("attended_quantity"), 0),
    )
    booked_total = overall["booked"]
    attended_total = overall["attended"]
    shortfall_total = booked_total - attended_total
    shortfall_rate_pct = float(shortfall_total / booked_total * 100) if booked_total else None

    by_category = [
        {
            "category": category,
            "booked_total": booked,
            "attended_total": attended,
            "shortfall_total": booked - attended,
            "shortfall_rate_pct": float((booked - attended) / booked * 100) if booked else None,
        }
        for category, booked, attended in BookingItem.objects.filter(booking__in=visited)
        .values_list("category_name_en")
        .annotate(booked=Sum("quantity"), attended=Coalesce(Sum("attended_quantity"), 0))
    ]

    corrected_booking_count = visited.filter(category_corrected_at__isnull=False).count()
    currently_flagged_count = Booking.objects.filter(flagged_mismatch_at__isnull=False).count()

    return {
        "from": date_from,
        "to": date_to,
        "booked_total": booked_total,
        "attended_total": attended_total,
        "shortfall_total": shortfall_total,
        "shortfall_rate_pct": shortfall_rate_pct,
        "by_category": by_category,
        "corrected_booking_count": corrected_booking_count,
        "currently_flagged_count": currently_flagged_count,
    }


# --------------------------------------------------------------------------
# Revenue report (Phase 7b)
# --------------------------------------------------------------------------


def get_revenue_report(*, date_from, date_to):
    """Gross payments, refunds, and net revenue over the range -- a
    per-period time series (same auto-bucketing as the categories
    report), by category, and split individual vs. institutional
    (`Booking.booking_type`).

    Every figure here is `Visited`-only and completed-payment-minus-
    completed-refund, same convention as everywhere else in this module
    -- an `AwaitingPayment`/`Pending` booking hasn't earned anything yet
    to report, and a non-completed refund hasn't actually left the
    account.
    """
    if date_from > date_to:
        raise ValidationError({"from": "Must not be after `to`."})
    granularity = _choose_bucket_granularity(date_from=date_from, date_to=date_to)

    visited = _visited_bookings_queryset().filter(visit_date__gte=date_from, visit_date__lte=date_to)
    booking_ids = list(visited.values_list("id", flat=True))

    gross_etb = Payment.objects.filter(
        status=Payment.Status.COMPLETED, booking_id__in=booking_ids
    ).aggregate(total=Coalesce(Sum("amount_etb"), Decimal("0")))["total"]
    refunds_etb = Refund.objects.filter(
        status=Refund.Status.COMPLETED, booking_id__in=booking_ids
    ).aggregate(total=Coalesce(Sum("amount_etb"), Decimal("0")))["total"]
    net_etb = gross_etb - refunds_etb

    revenue_by_category = _net_revenue_by_category(bookings_queryset=visited)

    net_by_booking = _net_revenue_by_booking(bookings_queryset=visited)
    type_by_booking = dict(visited.values_list("id", "booking_type"))
    split = {"individual": Decimal("0"), "group": Decimal("0")}
    for booking_id, net_amount in net_by_booking.items():
        bucket_key = "group" if type_by_booking.get(booking_id) == Booking.BookingType.GROUP else "individual"
        split[bucket_key] += net_amount

    buckets = {}
    for visit_date, amount in Payment.objects.filter(
        status=Payment.Status.COMPLETED, booking_id__in=booking_ids
    ).values_list("booking__visit_date", "amount_etb"):
        bucket = buckets.setdefault(
            _bucket_start(on_date=visit_date, granularity=granularity),
            {"gross_etb": Decimal("0"), "refunds_etb": Decimal("0")},
        )
        bucket["gross_etb"] += amount
    for visit_date, amount in Refund.objects.filter(
        status=Refund.Status.COMPLETED, booking_id__in=booking_ids
    ).values_list("booking__visit_date", "amount_etb"):
        bucket = buckets.setdefault(
            _bucket_start(on_date=visit_date, granularity=granularity),
            {"gross_etb": Decimal("0"), "refunds_etb": Decimal("0")},
        )
        bucket["refunds_etb"] += amount

    period_buckets = [
        {
            "bucket_start": bucket_start,
            "gross_etb": values["gross_etb"],
            "refunds_etb": values["refunds_etb"],
            "net_etb": values["gross_etb"] - values["refunds_etb"],
        }
        for bucket_start, values in sorted(buckets.items())
    ]

    return {
        "from": date_from,
        "to": date_to,
        "granularity": granularity,
        "gross_etb": gross_etb,
        "refunds_etb": refunds_etb,
        "net_etb": net_etb,
        "revenue_by_category": revenue_by_category,
        "individual_etb": split["individual"],
        "institutional_etb": split["group"],
        "period_buckets": period_buckets,
    }


# --------------------------------------------------------------------------
# Period-over-period comparison (Phase 7b) -- powers the Overview tab's
# "+12% vs previous period" KPI deltas. Deliberately a separate function
# from `get_dashboard` above rather than a change to it: `get_dashboard`'s
# own docstring is explicit that it's a live, unscoped snapshot ("right
# now", not bound to any date range), and bolting a date-scoped
# comparison onto it would contradict that contract for every existing
# caller. This is the reports UI's own KPI-comparison function instead,
# called once for whatever range the Overview tab's own date picker is
# currently showing.
# --------------------------------------------------------------------------


def get_period_comparison(*, date_from, date_to):
    """Current range vs. the immediately preceding range of the same
    length (e.g. this 30 days vs. the 30 days before that) -- always the
    prior period, never a fixed "same period last year", since a
    Manager's whole workflow here is comparing against *recent* trend,
    not year-over-year seasonality this platform has too little history
    to make meaningful yet.

    A delta is `None`, not `0`, when the previous period's own figure was
    zero -- there's no percentage change to compute from a zero baseline
    (would-be division by zero), and reporting `0%`/`+∞%` would both be
    misleading in different ways; `None` lets the frontend render "New"
    or "--" instead of a number that looks precise but isn't.
    """
    if date_from > date_to:
        raise ValidationError({"from": "Must not be after `to`."})

    days = (date_to - date_from).days + 1
    previous_to = date_from - timedelta(days=1)
    previous_from = previous_to - timedelta(days=days - 1)

    def _totals(start, end):
        visited = _visited_bookings_queryset().filter(visit_date__gte=start, visit_date__lte=end)
        reportable = _reportable_bookings_queryset().filter(visit_date__gte=start, visit_date__lte=end)
        agg = visited.aggregate(
            booked=Coalesce(Sum("booked_quantity"), 0),
            attended=Coalesce(Sum("attended_quantity"), 0),
        )
        return {
            "revenue_etb": _net_revenue_total(bookings_queryset=visited),
            "booking_count": reportable.count(),
            "attended_total": agg["attended"],
            "shortfall_rate_pct": (
                float((agg["booked"] - agg["attended"]) / agg["booked"] * 100) if agg["booked"] else None
            ),
        }

    def _delta_pct(current_value, previous_value):
        if not previous_value:
            return None
        return float((current_value - previous_value) / previous_value * 100)

    current = _totals(date_from, date_to)
    previous = _totals(previous_from, previous_to)

    return {
        "current": {"from": date_from, "to": date_to, **current},
        "previous": {"from": previous_from, "to": previous_to, **previous},
        "deltas": {
            "revenue_etb_pct": _delta_pct(current["revenue_etb"], previous["revenue_etb"]),
            "booking_count_pct": _delta_pct(current["booking_count"], previous["booking_count"]),
            "attended_total_pct": _delta_pct(current["attended_total"], previous["attended_total"]),
        },
    }
