"""
Unit tests against settlement/services.py directly (Design Spec Sec 3.1),
per the coverage target in NFR-MAINT-001. Prefer these over HTTP-level
tests for business-rule coverage.

Every test here mocks `call_chapa_transfer_api` -- the one function that
actually talks to Chapa -- rather than the network, mirroring how
`apps.refunds`'s tests mock `call_chapa_refund_api` instead of `requests`.
"""

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import Account
from apps.bookings.models import Booking, BookingItem
from apps.catalog.models import Category
from apps.core.models import AuditLogEntry
from apps.payments.models import Payment
from apps.refunds.models import Refund
from apps.settlement import services
from apps.settlement.models import CashierReconciliation

pytestmark = pytest.mark.django_db

TOMORROW = date.today() + timedelta(days=1)
FAKE_TRANSFER_REFERENCE = "chapa-transfer-ref-abc123"


# --------------------------------------------------------------------------
# Fixtures / factories
# --------------------------------------------------------------------------


def _make_cashier(email="cashier@example.com"):
    account = Account(
        email=email,
        phone=f"+2519{abs(hash(email)) % 10_000_000:07d}",
        full_name="Cashier Person",
        role=Account.Role.CASHIER,
    )
    account.set_password("a-strong-password-1")
    account.save()
    return account


def _make_museum_manager(email="manager@example.com"):
    account = Account(
        email=email,
        phone=f"+2519{abs(hash(email)) % 10_000_000:07d}",
        full_name="Manager Person",
        role=Account.Role.MUSEUM_MANAGER,
    )
    account.set_password("a-strong-password-1")
    account.save()
    return account


def _make_visitor(email="visitor@example.com"):
    account = Account(
        email=email,
        phone=f"+2519{abs(hash(email)) % 10_000_000:07d}",
        full_name="Visitor Person",
        role=Account.Role.VISITOR,
    )
    account.set_unusable_password()
    account.email_verified_at = timezone.now()
    account.phone_verified_at = timezone.now()
    account.save()
    return account


def _make_visited_booking(*, cashier, quantity=1, unit_price=Decimal("100.00"), visitor=None):
    """A `Visited` booking checked in by `cashier`, unreconciled --
    exactly the row shape `_outstanding_bookings_queryset` selects."""
    visitor = visitor or _make_visitor(email=f"visitor-{Account.objects.count()}@example.com")
    category = Category.objects.create(
        name_en="Adult", name_am="Adult", price_etb=unit_price
    )
    booking = Booking.objects.create(
        visitor=visitor,
        visit_date=TOMORROW,
        booking_type=Booking.BookingType.INDIVIDUAL,
        booked_quantity=quantity,
        attended_quantity=quantity,
        total_amount_etb=category.price_etb * quantity,
        status=Booking.Status.VISITED,
        checked_in_at=timezone.now(),
        checked_in_by_user_id=cashier,
    )
    BookingItem.objects.create(
        booking=booking,
        category=category,
        category_name_en=category.name_en,
        category_name_am=category.name_am,
        unit_price_etb=category.price_etb,
        quantity=quantity,
        subtotal_etb=category.price_etb * quantity,
    )
    return booking


def _make_completed_refund(*, booking, amount):
    """A completed, undeducted refund against `booking` -- exactly the
    row shape `_undeducted_refunds_queryset` selects."""
    payment = Payment.objects.create(
        booking=booking,
        tx_ref=f"museum-{booking.id.hex}-{Payment.objects.count()}",
        amount_etb=booking.total_amount_etb,
        status=Payment.Status.COMPLETED,
        confirmed_at=timezone.now(),
    )
    return Refund.objects.create(
        booking=booking,
        payment=payment,
        amount_etb=amount,
        reason=Refund.Reason.PARTIAL_SHORTFALL,
        status=Refund.Status.COMPLETED,
    )


# --------------------------------------------------------------------------
# get_outstanding_balance
# --------------------------------------------------------------------------


def test_balance_is_zero_with_no_bookings():
    cashier = _make_cashier()
    assert services.get_outstanding_balance(cashier=cashier) == Decimal("0")


def test_balance_sums_visited_unreconciled_bookings():
    cashier = _make_cashier()
    _make_visited_booking(cashier=cashier, quantity=2, unit_price=Decimal("100.00"))
    _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("50.00"))

    assert services.get_outstanding_balance(cashier=cashier) == Decimal("250.00")


def test_balance_excludes_bookings_not_checked_in_by_this_cashier():
    cashier = _make_cashier()
    other_cashier = _make_cashier(email="other-cashier@example.com")
    _make_visited_booking(cashier=other_cashier, quantity=1, unit_price=Decimal("100.00"))

    assert services.get_outstanding_balance(cashier=cashier) == Decimal("0")


def test_balance_excludes_non_visited_bookings():
    cashier = _make_cashier()
    booking = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status"])

    assert services.get_outstanding_balance(cashier=cashier) == Decimal("0")


def test_balance_excludes_already_reconciled_bookings():
    cashier = _make_cashier()
    booking = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier,
        amount_etb=Decimal("100.00"),
        status=CashierReconciliation.Status.COMPLETED,
    )
    booking.reconciliation = reconciliation
    booking.save(update_fields=["reconciliation"])

    assert services.get_outstanding_balance(cashier=cashier) == Decimal("0")


def test_balance_nets_off_undeducted_completed_refunds():
    cashier = _make_cashier()
    booking = _make_visited_booking(cashier=cashier, quantity=2, unit_price=Decimal("100.00"))
    _make_completed_refund(booking=booking, amount=Decimal("40.00"))

    assert services.get_outstanding_balance(cashier=cashier) == Decimal("160.00")


def test_balance_ignores_pending_refunds():
    cashier = _make_cashier()
    booking = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    payment = Payment.objects.create(
        booking=booking,
        tx_ref="pending-refund-tx",
        amount_etb=Decimal("100.00"),
        status=Payment.Status.COMPLETED,
        confirmed_at=timezone.now(),
    )
    Refund.objects.create(
        booking=booking,
        payment=payment,
        amount_etb=Decimal("40.00"),
        reason=Refund.Reason.PARTIAL_SHORTFALL,
        status=Refund.Status.PENDING,
    )

    assert services.get_outstanding_balance(cashier=cashier) == Decimal("100.00")


def test_balance_ignores_already_deducted_refunds():
    cashier = _make_cashier()
    booking = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier,
        amount_etb=Decimal("1.00"),
        status=CashierReconciliation.Status.COMPLETED,
    )
    refund = _make_completed_refund(booking=booking, amount=Decimal("40.00"))
    refund.deducted_in_transfer_id = reconciliation
    refund.save(update_fields=["deducted_in_transfer_id"])

    assert services.get_outstanding_balance(cashier=cashier) == Decimal("100.00")


def test_balance_never_mixes_across_cashiers():
    """The one thing most worth a dedicated test (per the build prompt):
    two cashiers' bookings/refunds must never cross-contaminate each
    other's balance."""
    cashier_a = _make_cashier(email="cashier-a@example.com")
    cashier_b = _make_cashier(email="cashier-b@example.com")

    booking_a = _make_visited_booking(cashier=cashier_a, quantity=1, unit_price=Decimal("300.00"))
    _make_completed_refund(booking=booking_a, amount=Decimal("50.00"))

    booking_b = _make_visited_booking(cashier=cashier_b, quantity=1, unit_price=Decimal("900.00"))
    _make_completed_refund(booking=booking_b, amount=Decimal("100.00"))

    assert services.get_outstanding_balance(cashier=cashier_a) == Decimal("250.00")
    assert services.get_outstanding_balance(cashier=cashier_b) == Decimal("800.00")


# --------------------------------------------------------------------------
# initiate_reconciliation
# --------------------------------------------------------------------------


@mock.patch("apps.settlement.services.call_chapa_transfer_api")
def test_initiate_reconciliation_creates_pending_row_and_stores_chapa_reference(mock_call):
    mock_call.return_value = FAKE_TRANSFER_REFERENCE
    cashier = _make_cashier()
    _make_visited_booking(cashier=cashier, quantity=2, unit_price=Decimal("100.00"))

    reconciliation = services.initiate_reconciliation(cashier=cashier)

    assert reconciliation.status == CashierReconciliation.Status.PENDING
    assert reconciliation.amount_etb == Decimal("200.00")
    assert reconciliation.chapa_transfer_reference == FAKE_TRANSFER_REFERENCE
    assert reconciliation.initiated_at is not None
    mock_call.assert_called_once_with(amount=Decimal("200.00"), reference=reconciliation.id)


@mock.patch("apps.settlement.services.call_chapa_transfer_api")
def test_initiate_reconciliation_does_not_mark_bookings_reconciled_yet(mock_call):
    mock_call.return_value = FAKE_TRANSFER_REFERENCE
    cashier = _make_cashier()
    booking = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))

    services.initiate_reconciliation(cashier=cashier)

    booking.refresh_from_db()
    assert booking.reconciliation is None
    assert booking.status == Booking.Status.VISITED


@mock.patch("apps.settlement.services.call_chapa_transfer_api")
def test_initiate_reconciliation_rejects_zero_balance(mock_call):
    cashier = _make_cashier()

    with pytest.raises(ValidationError):
        services.initiate_reconciliation(cashier=cashier)

    mock_call.assert_not_called()
    assert CashierReconciliation.objects.count() == 0


@mock.patch("apps.settlement.services.call_chapa_transfer_api")
def test_initiate_reconciliation_rejects_negative_balance(mock_call):
    cashier = _make_cashier()
    booking = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    _make_completed_refund(booking=booking, amount=Decimal("100.00"))

    with pytest.raises(ValidationError):
        services.initiate_reconciliation(cashier=cashier)

    mock_call.assert_not_called()
    assert CashierReconciliation.objects.count() == 0


@mock.patch("apps.settlement.services.call_chapa_transfer_api")
def test_initiate_reconciliation_marks_row_failed_if_chapa_call_raises(mock_call):
    mock_call.side_effect = services.SettlementGatewayError()
    cashier = _make_cashier()
    booking = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))

    with pytest.raises(services.SettlementGatewayError):
        services.initiate_reconciliation(cashier=cashier)

    reconciliation = CashierReconciliation.objects.get(cashier=cashier)
    assert reconciliation.status == CashierReconciliation.Status.FAILED
    assert reconciliation.failure_reason
    assert reconciliation.chapa_transfer_reference is None

    # The underlying booking was locked but never written to -- still
    # eligible for the next attempt.
    booking.refresh_from_db()
    assert booking.reconciliation is None
    assert services.get_outstanding_balance(cashier=cashier) == Decimal("100.00")


@mock.patch("apps.settlement.services.call_chapa_transfer_api")
def test_initiate_reconciliation_scoped_to_one_cashier_only(mock_call):
    """A second cashier's outstanding balance is untouched by the first
    cashier's reconciliation attempt."""
    mock_call.return_value = FAKE_TRANSFER_REFERENCE
    cashier_a = _make_cashier(email="cashier-a@example.com")
    cashier_b = _make_cashier(email="cashier-b@example.com")
    _make_visited_booking(cashier=cashier_a, quantity=1, unit_price=Decimal("100.00"))
    _make_visited_booking(cashier=cashier_b, quantity=1, unit_price=Decimal("500.00"))

    services.initiate_reconciliation(cashier=cashier_a)

    mock_call.assert_called_once()
    assert mock_call.call_args.kwargs["amount"] == Decimal("100.00")
    assert services.get_outstanding_balance(cashier=cashier_b) == Decimal("500.00")


# --------------------------------------------------------------------------
# confirm_reconciliation_success
# --------------------------------------------------------------------------


@mock.patch("apps.settlement.tasks.render_and_store_transfer_receipt.delay")
def test_confirm_success_marks_completed_and_attributes_bookings_and_refunds(mock_render):
    cashier = _make_cashier()
    booking_one = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    booking_two = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    refund = _make_completed_refund(booking=booking_two, amount=Decimal("20.00"))
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier,
        amount_etb=Decimal("180.00"),
        status=CashierReconciliation.Status.PENDING,
        chapa_transfer_reference=FAKE_TRANSFER_REFERENCE,
    )

    services.confirm_reconciliation_success(reconciliation=reconciliation)

    reconciliation.refresh_from_db()
    booking_one.refresh_from_db()
    booking_two.refresh_from_db()
    refund.refresh_from_db()

    assert reconciliation.status == CashierReconciliation.Status.COMPLETED
    assert reconciliation.completed_at is not None
    assert booking_one.reconciliation_id == reconciliation.id
    assert booking_two.reconciliation_id == reconciliation.id
    assert refund.deducted_in_transfer_id_id == reconciliation.id
    assert services.get_outstanding_balance(cashier=cashier) == Decimal("0")
    mock_render.assert_called_once_with(reconciliation_id=str(reconciliation.id))


@mock.patch("apps.settlement.tasks.render_and_store_transfer_receipt.delay")
def test_confirm_success_writes_audit_log_entry(mock_render):
    cashier = _make_cashier()
    _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier, amount_etb=Decimal("100.00"), status=CashierReconciliation.Status.PENDING
    )

    services.confirm_reconciliation_success(reconciliation=reconciliation)

    entry = AuditLogEntry.objects.get(action="settlement.reconciliation_completed")
    assert entry.target_id == str(reconciliation.id)
    assert entry.metadata["cashier_id"] == str(cashier.id)
    assert entry.metadata["booking_count"] == 1


@mock.patch("apps.settlement.tasks.render_and_store_transfer_receipt.delay")
def test_confirm_success_does_not_touch_other_cashiers_bookings(mock_render):
    cashier_a = _make_cashier(email="cashier-a@example.com")
    cashier_b = _make_cashier(email="cashier-b@example.com")
    _make_visited_booking(cashier=cashier_a, quantity=1, unit_price=Decimal("100.00"))
    booking_b = _make_visited_booking(cashier=cashier_b, quantity=1, unit_price=Decimal("500.00"))
    reconciliation_a = CashierReconciliation.objects.create(
        cashier=cashier_a, amount_etb=Decimal("100.00"), status=CashierReconciliation.Status.PENDING
    )

    services.confirm_reconciliation_success(reconciliation=reconciliation_a)

    booking_b.refresh_from_db()
    assert booking_b.reconciliation is None
    assert services.get_outstanding_balance(cashier=cashier_b) == Decimal("500.00")


def test_confirm_success_enqueues_transfer_receipt_render_task():
    """Only on the COMPLETED path -- a FAILED transfer has nothing to
    prove, so `confirm_reconciliation_failure` (below) must never enqueue
    this."""
    cashier = _make_cashier()
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier, amount_etb=Decimal("100.00"), status=CashierReconciliation.Status.PENDING
    )

    with mock.patch(
        "apps.settlement.tasks.render_and_store_transfer_receipt.delay"
    ) as mock_render:
        services.confirm_reconciliation_success(reconciliation=reconciliation)

    mock_render.assert_called_once_with(reconciliation_id=str(reconciliation.id))


# --------------------------------------------------------------------------
# confirm_reconciliation_failure
# --------------------------------------------------------------------------


def test_confirm_failure_marks_failed_and_leaves_bookings_eligible():
    cashier = _make_cashier()
    booking = _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier, amount_etb=Decimal("100.00"), status=CashierReconciliation.Status.PENDING
    )

    services.confirm_reconciliation_failure(reconciliation=reconciliation, reason="Insufficient funds.")

    reconciliation.refresh_from_db()
    booking.refresh_from_db()
    assert reconciliation.status == CashierReconciliation.Status.FAILED
    assert reconciliation.failure_reason == "Insufficient funds."
    assert booking.reconciliation is None
    assert services.get_outstanding_balance(cashier=cashier) == Decimal("100.00")


def test_confirm_failure_does_not_enqueue_transfer_receipt_render_task():
    """A FAILED transfer has nothing to prove -- no receipt should ever be
    generated for it."""
    cashier = _make_cashier()
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier, amount_etb=Decimal("100.00"), status=CashierReconciliation.Status.PENDING
    )

    with mock.patch(
        "apps.settlement.tasks.render_and_store_transfer_receipt.delay"
    ) as mock_render:
        services.confirm_reconciliation_failure(reconciliation=reconciliation, reason="Insufficient funds.")

    mock_render.assert_not_called()


# --------------------------------------------------------------------------
# list_reconciliations
# --------------------------------------------------------------------------


def test_list_reconciliations_cashier_sees_only_her_own():
    cashier_a = _make_cashier(email="cashier-a@example.com")
    cashier_b = _make_cashier(email="cashier-b@example.com")
    own = CashierReconciliation.objects.create(cashier=cashier_a, amount_etb=Decimal("10.00"))
    CashierReconciliation.objects.create(cashier=cashier_b, amount_etb=Decimal("20.00"))

    results = list(services.list_reconciliations(user=cashier_a))

    assert [r.id for r in results] == [own.id]


def test_list_reconciliations_museum_manager_sees_all():
    cashier_a = _make_cashier(email="cashier-a@example.com")
    cashier_b = _make_cashier(email="cashier-b@example.com")
    manager = _make_museum_manager()
    CashierReconciliation.objects.create(cashier=cashier_a, amount_etb=Decimal("10.00"))
    CashierReconciliation.objects.create(cashier=cashier_b, amount_etb=Decimal("20.00"))

    results = list(services.list_reconciliations(user=manager))

    assert len(results) == 2


# --------------------------------------------------------------------------
# handle_chapa_transfer_webhook
# --------------------------------------------------------------------------


def test_webhook_success_event_confirms_reconciliation():
    cashier = _make_cashier()
    _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier, amount_etb=Decimal("100.00"), status=CashierReconciliation.Status.PENDING
    )

    with mock.patch("apps.settlement.tasks.render_and_store_transfer_receipt.delay"):
        services.handle_chapa_transfer_webhook(
            payload={"event": "payout.success", "status": "success", "reference": str(reconciliation.id)}
        )

    reconciliation.refresh_from_db()
    assert reconciliation.status == CashierReconciliation.Status.COMPLETED


def test_webhook_failure_status_marks_reconciliation_failed():
    cashier = _make_cashier()
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier, amount_etb=Decimal("100.00"), status=CashierReconciliation.Status.PENDING
    )

    services.handle_chapa_transfer_webhook(
        payload={"event": "payout.failed", "status": "failed", "reference": str(reconciliation.id)}
    )

    reconciliation.refresh_from_db()
    assert reconciliation.status == CashierReconciliation.Status.FAILED
    assert reconciliation.failure_reason


def test_webhook_unknown_reference_is_a_validation_error():
    with pytest.raises(ValidationError):
        services.handle_chapa_transfer_webhook(
            payload={"status": "success", "reference": "00000000-0000-0000-0000-000000000000"}
        )


def test_webhook_missing_reference_is_a_validation_error():
    with pytest.raises(ValidationError):
        services.handle_chapa_transfer_webhook(payload={"status": "success"})


def test_webhook_is_idempotent_on_replay():
    cashier = _make_cashier()
    _make_visited_booking(cashier=cashier, quantity=1, unit_price=Decimal("100.00"))
    reconciliation = CashierReconciliation.objects.create(
        cashier=cashier, amount_etb=Decimal("100.00"), status=CashierReconciliation.Status.PENDING
    )
    payload = {"status": "success", "reference": str(reconciliation.id)}

    with mock.patch("apps.settlement.tasks.render_and_store_transfer_receipt.delay") as mock_render:
        services.handle_chapa_transfer_webhook(payload=payload)
        first_completed_at = CashierReconciliation.objects.get(id=reconciliation.id).completed_at

        # A replayed webhook delivery for the same (already COMPLETED)
        # reference must not error or re-run the attribution/audit-log side
        # effects a second time.
        services.handle_chapa_transfer_webhook(payload=payload)

    reconciliation.refresh_from_db()
    assert reconciliation.status == CashierReconciliation.Status.COMPLETED
    assert reconciliation.completed_at == first_completed_at
    assert AuditLogEntry.objects.filter(action="settlement.reconciliation_completed").count() == 1
    # The replay must not re-enqueue rendering either -- an already-issued
    # transfer receipt is never regenerated (ADR-009).
    mock_render.assert_called_once()
