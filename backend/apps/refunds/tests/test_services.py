"""
Unit tests against refunds/services.py and refunds/tasks.py directly
(Design Spec Sec 3.1), per the coverage target in NFR-MAINT-001. Prefer
these over HTTP-level tests for business-rule coverage.

Every test here mocks `fetch_chapa_transaction_fee` and
`call_chapa_refund_api` -- the two functions that actually talk to Chapa
-- rather than the network, mirroring how `apps.payments`' tests mock
`_initialize_chapa_checkout` instead of `requests`.
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied

from apps.accounts.models import Account
from apps.bookings.models import Booking
from apps.catalog.models import Category
from apps.core.exceptions import Conflict
from apps.core.models import AuditLogEntry
from apps.payments.models import Payment
from apps.refunds import services
from apps.refunds.models import Refund
from apps.refunds.tasks import process_refund

pytestmark = pytest.mark.django_db

TOMORROW = date.today() + timedelta(days=1)
YESTERDAY = date.today() - timedelta(days=1)
FAKE_REF_ID = "MERC-DIS-REF-abc123"


def _make_visitor(email="visitor@example.com", phone=None):
    # `phone` is unique on Account -- derive a distinct default from the
    # email so tests that create more than one visitor (e.g. an owner and
    # a stranger) don't collide on a single hardcoded number.
    account = Account(
        email=email,
        phone=phone or f"+2519{abs(hash(email)) % 10_000_000:07d}",
        full_name="Hana Bekele",
        role=Account.Role.VISITOR,
    )
    account.set_unusable_password()
    account.email_verified_at = timezone.now()
    account.phone_verified_at = timezone.now()
    account.save()
    return account


def _make_booking(
    *,
    visitor=None,
    status=Booking.Status.PENDING,
    quantity=2,
    attended_quantity=None,
    unit_price=Decimal("100.00"),
    visit_date=TOMORROW,
):
    visitor = visitor or _make_visitor()
    category = Category.objects.create(name_en="Adult", name_am="Adult", price_etb=unit_price)
    return Booking.objects.create(
        visitor=visitor,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=category.price_etb,
        visit_date=visit_date,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=quantity,
        attended_quantity=attended_quantity,
        total_amount_etb=category.price_etb * quantity,
        status=status,
    )


def _make_completed_payment(*, booking, tx_ref=None):
    return Payment.objects.create(
        booking=booking,
        tx_ref=tx_ref or f"museum-{booking.id.hex}-test",
        amount_etb=booking.total_amount_etb,
        status=Payment.Status.COMPLETED,
        confirmed_at=timezone.now(),
    )


def _process(refund):
    """Runs the Celery task body synchronously against a real refund row,
    mirroring how the other apps' tests call a task function directly
    rather than through `.delay()` (CELERY_TASK_ALWAYS_EAGER isn't relied
    on anywhere else in this codebase's tests)."""
    return process_refund.run(refund_id=str(refund.id))


# --------------------------------------------------------------------------
# compute_refundable_amount (FR-REFUND-002)
# --------------------------------------------------------------------------


def test_compute_refundable_amount_cancellation_is_full_total():
    booking = _make_booking(status=Booking.Status.PENDING, quantity=3, unit_price=Decimal("50"))
    amount = services.compute_refundable_amount(booking=booking, reason=Refund.Reason.CANCELLATION)
    assert amount == Decimal("150")


def test_compute_refundable_amount_no_response_is_full_total():
    booking = _make_booking(status=Booking.Status.PENDING, quantity=2, unit_price=Decimal("100"))
    amount = services.compute_refundable_amount(booking=booking, reason=Refund.Reason.NO_RESPONSE)
    assert amount == Decimal("200")


def test_compute_refundable_amount_shortfall_is_unattended_portion_only():
    # Booked 20, attended 15 -- FR-REFUND-002's headline example.
    booking = _make_booking(
        status=Booking.Status.VISITED, quantity=20, attended_quantity=15, unit_price=Decimal("100")
    )
    amount = services.compute_refundable_amount(
        booking=booking, reason=Refund.Reason.PARTIAL_SHORTFALL
    )
    assert amount == Decimal("500")  # 5 unattended x 100 ETB


# --------------------------------------------------------------------------
# trigger_cancellation_refund (FR-REFUND-001a, FR-BOOK-006)
# --------------------------------------------------------------------------


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_trigger_cancellation_refund_creates_pending_refund_and_enqueues_task(mock_delay):
    booking = _make_booking(status=Booking.Status.CANCELLED)
    payment = _make_completed_payment(booking=booking)

    refund = services.trigger_cancellation_refund(booking=booking)

    assert refund.status == Refund.Status.PENDING
    assert refund.reason == Refund.Reason.CANCELLATION
    assert refund.payment_id == payment.id
    assert refund.amount_etb == booking.total_amount_etb
    assert refund.requested_by_user_id_id is None
    mock_delay.assert_called_once_with(refund_id=str(refund.id))
    assert AuditLogEntry.objects.filter(action="refund.requested").exists()


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_trigger_cancellation_refund_requires_a_completed_payment(mock_delay):
    booking = _make_booking(status=Booking.Status.CANCELLED)  # no Payment created

    with pytest.raises(Conflict):
        services.trigger_cancellation_refund(booking=booking)
    mock_delay.assert_not_called()


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_trigger_cancellation_refund_is_not_duplicated_for_the_same_booking(mock_delay):
    booking = _make_booking(status=Booking.Status.CANCELLED)
    _make_completed_payment(booking=booking)

    services.trigger_cancellation_refund(booking=booking)
    with pytest.raises(Conflict):
        services.trigger_cancellation_refund(booking=booking)

    assert Refund.objects.filter(booking=booking).count() == 1


# --------------------------------------------------------------------------
# request_partial_shortfall_refund (FR-REFUND-001b, FR-TICKET-002)
# --------------------------------------------------------------------------


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_request_partial_shortfall_refund_success(mock_delay):
    visitor = _make_visitor()
    booking = _make_booking(
        visitor=visitor,
        status=Booking.Status.VISITED,
        quantity=20,
        attended_quantity=15,
        unit_price=Decimal("100"),
    )
    _make_completed_payment(booking=booking)

    refund = services.request_partial_shortfall_refund(
        booking=booking, visitor=visitor, note="5 people missed the bus"
    )

    assert refund.reason == Refund.Reason.PARTIAL_SHORTFALL
    assert refund.amount_etb == Decimal("500")
    assert refund.requested_by_user_id_id == visitor.id
    assert refund.note == "5 people missed the bus"
    mock_delay.assert_called_once()


def test_request_partial_shortfall_refund_rejects_other_visitors_booking():
    owner = _make_visitor(email="owner@example.com")
    stranger = _make_visitor(email="stranger@example.com")
    booking = _make_booking(
        visitor=owner, status=Booking.Status.VISITED, quantity=10, attended_quantity=8
    )
    _make_completed_payment(booking=booking)

    with pytest.raises(PermissionDenied):
        services.request_partial_shortfall_refund(booking=booking, visitor=stranger)


def test_request_partial_shortfall_refund_rejects_fully_attended_booking():
    visitor = _make_visitor()
    booking = _make_booking(
        visitor=visitor, status=Booking.Status.VISITED, quantity=10, attended_quantity=10
    )
    _make_completed_payment(booking=booking)

    with pytest.raises(Conflict):
        services.request_partial_shortfall_refund(booking=booking, visitor=visitor)


def test_request_partial_shortfall_refund_rejects_non_visited_booking():
    visitor = _make_visitor()
    booking = _make_booking(visitor=visitor, status=Booking.Status.PENDING, quantity=10)
    _make_completed_payment(booking=booking)

    with pytest.raises(Conflict):
        services.request_partial_shortfall_refund(booking=booking, visitor=visitor)


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_request_partial_shortfall_refund_is_capped_per_booking(mock_delay):
    visitor = _make_visitor()
    booking = _make_booking(
        visitor=visitor, status=Booking.Status.VISITED, quantity=10, attended_quantity=8
    )
    _make_completed_payment(booking=booking)

    services.request_partial_shortfall_refund(booking=booking, visitor=visitor)
    with pytest.raises(Conflict):
        services.request_partial_shortfall_refund(booking=booking, visitor=visitor)

    assert Refund.objects.filter(booking=booking).count() == 1


# --------------------------------------------------------------------------
# trigger_no_response_refund (FR-REFUND-001c, FR-PAY-005)
# --------------------------------------------------------------------------


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_trigger_no_response_refund_creates_pending_refund(mock_delay):
    booking = _make_booking(
        status=Booking.Status.PENDING,
        visit_date=YESTERDAY,
    )
    booking.notice_sent_at = timezone.now() - timedelta(days=8)
    booking.save(update_fields=["notice_sent_at"])
    _make_completed_payment(booking=booking)

    refund = services.trigger_no_response_refund(booking=booking)

    assert refund.reason == Refund.Reason.NO_RESPONSE
    assert refund.requested_by_user_id_id is None
    mock_delay.assert_called_once()


# --------------------------------------------------------------------------
# trigger_category_correction_refund (ID-verification addendum)
# --------------------------------------------------------------------------


def _make_cashier(email="cashier@example.com"):
    account = Account(email=email, full_name="Cashier Person", role=Account.Role.CASHIER)
    account.set_password("a-strong-password-1")
    account.save()
    return account


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_trigger_category_correction_refund_uses_the_given_amount_not_the_full_booking(
    mock_delay,
):
    """Unlike the three FR-REFUND-001 triggers, the refundable amount
    here is an explicit `amount` -- the overcharge difference the caller
    already computed *before* correcting the booking's own price fields
    (booking.total_amount_etb is the new, lower total by the time this
    runs, so it can no longer be diffed against the old one)."""
    cashier = _make_cashier()
    # Booking is Pending (still checking in), total already corrected
    # down to 50.00 by the caller -- the overcharge being refunded (450)
    # is unrelated to the booking's current total.
    booking = _make_booking(status=Booking.Status.PENDING, quantity=1, unit_price=Decimal("50"))
    _make_completed_payment(booking=booking, tx_ref="museum-original-payment")

    refund = services.trigger_category_correction_refund(
        booking=booking, amount=Decimal("450.00"), actor=cashier
    )

    assert refund.reason == Refund.Reason.CATEGORY_CORRECTION
    assert refund.amount_etb == Decimal("450.00")
    assert refund.requested_by_user_id_id == cashier.id
    mock_delay.assert_called_once_with(refund_id=str(refund.id))


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_category_correction_refund_does_not_block_a_later_shortfall_refund(mock_delay):
    """The one real interaction to get right: a booking corrected (and
    partially refunded) at the gate can still, later, have an attendance
    shortfall at check-in -- that Visitor must still be able to request a
    partial_shortfall refund afterward. `_ensure_no_existing_refund`
    excludes `category_correction` from the "one refund per booking" cap
    specifically so this sequence works."""
    visitor = _make_visitor()
    cashier = _make_cashier()
    booking = _make_booking(
        visitor=visitor, status=Booking.Status.PENDING, quantity=1, unit_price=Decimal("50")
    )
    _make_completed_payment(booking=booking)
    services.trigger_category_correction_refund(
        booking=booking, amount=Decimal("450.00"), actor=cashier
    )

    # ... time passes, the visitor is checked in with a shortfall ...
    booking.status = Booking.Status.VISITED
    booking.booked_quantity = 20
    booking.attended_quantity = 15
    booking.save(update_fields=["status", "booked_quantity", "attended_quantity"])

    refund = services.request_partial_shortfall_refund(booking=booking, visitor=visitor)

    assert refund.reason == Refund.Reason.PARTIAL_SHORTFALL
    assert Refund.objects.filter(booking=booking).count() == 2


@mock.patch("apps.notifications.tasks.send_notification.delay")
@mock.patch("apps.refunds.services.call_chapa_refund_api", return_value=FAKE_REF_ID)
@mock.patch("apps.refunds.services.fetch_chapa_transaction_fee", return_value=Decimal("2.00"))
@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_process_refund_category_correction_does_not_change_booking_status(
    mock_enqueue, mock_fee, mock_refund_call, mock_notify
):
    """Unlike cancellation/no_response, and just like partial_shortfall,
    a category-correction refund must never flip the booking to
    `Refunded` -- it fires mid check-in, on a booking that's still very
    much alive."""
    cashier = _make_cashier()
    booking = _make_booking(status=Booking.Status.PENDING, quantity=1, unit_price=Decimal("50"))
    _make_completed_payment(booking=booking)
    refund = services.trigger_category_correction_refund(
        booking=booking, amount=Decimal("450.00"), actor=cashier
    )

    result = _process(refund)

    booking.refresh_from_db()
    assert result.status == Refund.Status.COMPLETED
    assert booking.status == Booking.Status.PENDING


# --------------------------------------------------------------------------
# process_refund task (FR-REFUND-003, FR-REFUND-004, NFR-IDEMPOTENT-001)
# --------------------------------------------------------------------------


@mock.patch("apps.notifications.tasks.send_notification.delay")
@mock.patch("apps.refunds.services.call_chapa_refund_api", return_value=FAKE_REF_ID)
@mock.patch("apps.refunds.services.fetch_chapa_transaction_fee", return_value=Decimal("4.50"))
@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_process_refund_nets_out_chapa_fee_and_completes_cancellation(
    mock_enqueue, mock_fee, mock_refund_call, mock_notify
):
    booking = _make_booking(status=Booking.Status.CANCELLED, quantity=2, unit_price=Decimal("100"))
    _make_completed_payment(booking=booking)
    refund = services.trigger_cancellation_refund(booking=booking)

    result = _process(refund)

    result.refresh_from_db()
    booking.refresh_from_db()
    assert result.status == Refund.Status.COMPLETED
    assert result.aggregator_fee_etb == Decimal("4.50")
    # Gross 200.00 minus Chapa's 4.50 fee (FR-REFUND-003).
    assert result.amount_etb == Decimal("195.50")
    assert result.chapa_refund_reference == FAKE_REF_ID
    assert booking.status == Booking.Status.REFUNDED
    mock_notify.assert_called_once()
    assert AuditLogEntry.objects.filter(action="refund.issued").exists()


@mock.patch("apps.notifications.tasks.send_notification.delay")
@mock.patch("apps.refunds.services.call_chapa_refund_api", return_value=FAKE_REF_ID)
@mock.patch("apps.refunds.services.fetch_chapa_transaction_fee", return_value=Decimal("2.00"))
@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_process_refund_partial_shortfall_does_not_change_booking_status(
    mock_enqueue, mock_fee, mock_refund_call, mock_notify
):
    visitor = _make_visitor()
    booking = _make_booking(
        visitor=visitor,
        status=Booking.Status.VISITED,
        quantity=20,
        attended_quantity=15,
        unit_price=Decimal("100"),
    )
    _make_completed_payment(booking=booking)
    refund = services.request_partial_shortfall_refund(booking=booking, visitor=visitor)

    result = _process(refund)

    booking.refresh_from_db()
    assert result.status == Refund.Status.COMPLETED
    # A Visited booking's shortfall refund never re-labels the booking --
    # it's already resolved.
    assert booking.status == Booking.Status.VISITED


@mock.patch("apps.refunds.services.call_chapa_refund_api")
@mock.patch("apps.refunds.services.fetch_chapa_transaction_fee", return_value=Decimal("0"))
@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_process_refund_is_idempotent_and_never_double_refunds(
    mock_enqueue, mock_fee, mock_refund_call
):
    mock_refund_call.return_value = FAKE_REF_ID
    booking = _make_booking(status=Booking.Status.CANCELLED)
    _make_completed_payment(booking=booking)
    refund = services.trigger_cancellation_refund(booking=booking)

    _process(refund)
    # A retried task run against the now-`completed` refund must be a
    # pure no-op -- no second Chapa call.
    _process(refund)

    mock_refund_call.assert_called_once()


@mock.patch("apps.notifications.tasks.send_notification.delay")
@mock.patch(
    "apps.refunds.services.call_chapa_refund_api",
    side_effect=services.RefundGatewayError(),
)
@mock.patch("apps.refunds.services.fetch_chapa_transaction_fee", return_value=Decimal("0"))
@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_process_refund_retries_on_gateway_failure_without_completing(
    mock_enqueue, mock_fee, mock_refund_call, mock_notify
):
    booking = _make_booking(status=Booking.Status.CANCELLED)
    _make_completed_payment(booking=booking)
    refund = services.trigger_cancellation_refund(booking=booking)

    with pytest.raises(Exception):
        # Celery's `self.retry()` raises `Retry` outside of a real worker
        # -- what matters here is that the refund is left `pending`, not
        # silently marked `completed`/`failed` on a single transient
        # failure (NFR-CONSIST-001).
        _process(refund)

    refund.refresh_from_db()
    assert refund.status == Refund.Status.PENDING
    mock_notify.assert_not_called()


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_process_refund_missing_refund_row_is_a_safe_no_op(mock_enqueue):
    # Simulates a task enqueued for a refund that (somehow) no longer
    # exists -- must not raise.
    process_refund.run(refund_id="00000000-0000-0000-0000-000000000000")


# --------------------------------------------------------------------------
# list_refunds (`GET /refunds`)
# --------------------------------------------------------------------------


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_list_refunds_scopes_visitors_to_their_own(mock_delay):
    owner = _make_visitor(email="owner@example.com")
    other = _make_visitor(email="other@example.com")

    owner_booking = _make_booking(visitor=owner, status=Booking.Status.CANCELLED)
    _make_completed_payment(booking=owner_booking)
    services.trigger_cancellation_refund(booking=owner_booking)

    other_booking = _make_booking(visitor=other, status=Booking.Status.CANCELLED)
    _make_completed_payment(booking=other_booking)
    services.trigger_cancellation_refund(booking=other_booking)

    results = list(services.list_refunds(user=owner))

    assert len(results) == 1
    assert results[0].booking_id == owner_booking.id


@mock.patch("apps.refunds.tasks.process_refund.delay")
def test_list_refunds_staff_sees_all_and_can_filter_by_reason(mock_delay):
    cashier = Account(
        email="cashier@example.com", full_name="Cashier Person", role=Account.Role.CASHIER
    )
    cashier.set_password("a-strong-password-1")
    cashier.save()

    visitor = _make_visitor()
    cancelled_booking = _make_booking(visitor=visitor, status=Booking.Status.CANCELLED)
    _make_completed_payment(booking=cancelled_booking)
    services.trigger_cancellation_refund(booking=cancelled_booking)

    shortfall_booking = _make_booking(
        visitor=visitor, status=Booking.Status.VISITED, quantity=10, attended_quantity=7
    )
    _make_completed_payment(booking=shortfall_booking)
    services.request_partial_shortfall_refund(booking=shortfall_booking, visitor=visitor)

    assert services.list_refunds(user=cashier).count() == 2
    assert services.list_refunds(user=cashier, reason="cancellation").count() == 1
