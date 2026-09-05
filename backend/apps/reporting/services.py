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
  potential and visitor interest.
- "Revenue" is net money actually collected: completed `Payment` amounts
  minus completed `Refund` amounts (`Refund.amount_etb` is already the
  net figure returned to the Visitor, per `apps.refunds.models.Refund`'s
  own docstring) -- mirrors the "net figure (revenue minus refunds)"
  framing Document 02 Sec 2.7 uses for the Finance-facing transfer
  receipt, applied here to the Manager-facing dashboard/report instead.
"""

import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Case, Count, F, Sum, TextField, Value, When
from django.db.models.functions import Coalesce
from rest_framework.exceptions import ValidationError

from apps.bookings.models import Booking, BookingItem
from apps.payments.models import Payment
from apps.refunds.models import Refund

# The four FR-REPORT-001 statuses -- see module docstring.
_REPORTABLE_STATUSES = [
    Booking.Status.PENDING,
    Booking.Status.VISITED,
    Booking.Status.CANCELLED,
    Booking.Status.REFUNDED,
]

_VALID_PERIODS = {"daily", "weekly", "monthly", "yearly"}

_INDIVIDUAL_GROUP_KEY = "Individual"


# --------------------------------------------------------------------------
# Shared querysets
# --------------------------------------------------------------------------


def _reportable_bookings_queryset():
    """Every booking FR-REPORT-001/002 count towards revenue, visitor
    counts, or the status mix -- see module docstring for why
    AwaitingPayment bookings are excluded."""
    return Booking.objects.filter(status__in=_REPORTABLE_STATUSES)


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
        "revenue_total_etb": _net_revenue_total(bookings_queryset=bookings),
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

    today = date.today()

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

    revenue_by_category = _net_revenue_by_category(bookings_queryset=bookings)

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
        "revenue_by_category": revenue_by_category,
        "visitor_counts_by_group": visitor_counts_by_group,
    }
