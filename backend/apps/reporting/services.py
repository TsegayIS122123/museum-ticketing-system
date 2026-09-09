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
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Account
from apps.bookings.models import Booking, BookingItem, DateAvailability
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


def _net_revenue_by_category(*, bookings_queryset):
    """Completed-payment total minus completed-refund total, grouped by
    `BookingItem.category_name_en` (the bilingual snapshot taken at
    booking time, per `apps.bookings.models.BookingItem` -- never a live
    join to `catalog.Category`, so a since-retired or renamed category
    still reports correctly against historical bookings).

    A `Payment`/`Refund` is still recorded once per *booking*, not once
    per category (Chapa is only ever charged/refunded a single lump sum
    per booking, per `apps.payments`/`apps.refunds`) -- so a booking's net
    revenue is first computed per booking exactly as before, then split
    across that booking's `BookingItem`s in proportion to each item's
    share of `Booking.total_amount_etb`. For a single-category booking
    (still the common case) every cent of its net revenue lands on that
    one category, unchanged from before; a mixed booking (e.g. one Adult
    plus two Student tickets) instead attributes its net revenue
    proportionally across both.
    """
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
    net_revenue_by_booking = {
        booking_id: (
            payments_by_booking.get(booking_id, Decimal("0"))
            - refunds_by_booking.get(booking_id, Decimal("0"))
        )
        for booking_id in set(payments_by_booking) | set(refunds_by_booking)
    }

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
