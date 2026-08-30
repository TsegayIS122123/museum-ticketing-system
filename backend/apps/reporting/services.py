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
  Visited, Cancelled, Refunded. `AwaitingPayment` and `PendingApproval`
  are deliberately excluded: those are pre-checkout/pre-approval states a
  booking may never emerge from (an abandoned checkout, a declined group
  request), so they were never a completed "digital booking" for
  reporting purposes -- counting them would overstate both revenue
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

from apps.bookings.models import Booking
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
    AwaitingPayment/PendingApproval bookings are excluded."""
    return Booking.objects.filter(status__in=_REPORTABLE_STATUSES)


def _net_revenue_by_category(*, bookings_queryset):
    """Completed-payment total minus completed-refund total, grouped by
    `Booking.category_name_en` (the bilingual snapshot taken at booking
    time, per `apps.bookings.models.Booking` -- never a live join to
    `catalog.Category`, so a since-retired or renamed category still
    reports correctly against historical bookings).

    Computed as two independent aggregations (payments, then refunds) and
    combined in Python rather than one query joining both `payments` and
    `refunds` off the same booking -- a single joined query would fan out
    across both child tables at once and double-count whichever side has
    more than one row per booking (e.g. a booking with two payment
    attempts and one refund).
    """
    categories = list(
        bookings_queryset.values_list("category_name_en", flat=True).distinct()
    )

    payments_by_category = dict(
        Payment.objects.filter(
            status=Payment.Status.COMPLETED, booking__in=bookings_queryset
        )
        .values_list("booking__category_name_en")
        .annotate(total=Sum("amount_etb"))
    )
    refunds_by_category = dict(
        Refund.objects.filter(
            status=Refund.Status.COMPLETED, booking__in=bookings_queryset
        )
        .values_list("booking__category_name_en")
        .annotate(total=Sum("amount_etb"))
    )

    return {
        category: (
            payments_by_category.get(category, Decimal("0"))
            - refunds_by_category.get(category, Decimal("0"))
        )
        for category in categories
    }


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

    visitor_counts_by_category = dict(
        bookings.values_list("category_name_en")
        .annotate(total=Sum("booked_quantity"))
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
