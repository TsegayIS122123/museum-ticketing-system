"""
notifications -- models

Implements FR modules: Cross-cutting (consumed by every module that issues a receipt or notice)
Depends on: core

Per Design Spec Sec 3.1: data shape and database-level constraints ONLY.
No business logic here -- see services.py.

Per Design Spec Sec 6.4: any staff-editable text (names, templates, notices)
is stored as a parallel English/Amharic column pair, not a single column
with runtime translation -- see Document 05 for the exact fields/tables.

Per ADR-004: this project has no multi-tenancy layer (single venue) --
do NOT reach for a tenant-scoped manager pattern here.

Per Document 05 Sec 3.9: `notification` is an *event* record ("an email/SMS
was triggered for this account"), never itself updated once written -- it
deliberately has no `updated_at` column, unlike every other table in this
codebase (which use `core.TimeStampedModel`). Per-channel delivery outcome
(queued/sent/failed) lives on the child `notification_delivery` row
instead, since one notification can fan out to more than one channel
(FR-PAY-005's no-show notice sends both email and SMS) and each channel
succeeds or fails independently.
"""

import uuid

from django.db import models


class Notification(models.Model):
    """
    One row per notification *event* -- e.g. "booking X's payment was
    confirmed" -- regardless of how many channels it fans out to. Created
    by `services.record_notification`, never by a view directly (Sec 3.1).
    """

    class NotificationType(models.TextChoices):
        # Visitor OTP / magic-link verification (apps.accounts Sec 4.1).
        VISITOR_OTP = "visitor_otp", "Visitor OTP"
        VISITOR_EMAIL_VERIFICATION = "visitor_email_verification", "Visitor email verification"
        # Staff-only password reset (FR-ACC-006).
        STAFF_PASSWORD_RESET = "staff_password_reset", "Staff password reset"
        # Booking lifecycle (FR-BOOK, FR-PAY, FR-REFUND).
        BOOKING_PAYMENT_CONFIRMED = "booking_payment_confirmed", "Booking payment confirmed"
        NO_SHOW_NOTICE = "no_show_notice", "No-show notice"
        REFUND_CONFIRMED = "refund_confirmed", "Refund confirmed"
        RESCHEDULE_CONFIRMED = "reschedule_confirmed", "Reschedule confirmed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    account = models.ForeignKey(
        "accounts.Account",
        on_delete=models.CASCADE,
        related_name="notifications",
        db_column="account_id",
        help_text="The recipient.",
    )
    booking = models.ForeignKey(
        "bookings.Booking",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="notifications",
        db_column="booking_id",
        help_text="Nullable -- most notifications are booking-related, but not necessarily "
        "all (e.g. visitor_otp, staff_password_reset).",
    )
    notification_type = models.CharField(max_length=40, choices=NotificationType.choices)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"
        db_table = "notification"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["account"], name="notification_account_idx"),
            models.Index(fields=["booking"], name="notification_booking_idx"),
        ]

    def __str__(self):
        return f"{self.notification_type} -> {self.account_id}"


class NotificationDelivery(models.Model):
    """
    One row per channel a `Notification` fanned out to. `status` is the
    per-channel delivery outcome; a slow/failed SMS gateway never blocks
    or hides a successful email on the same notification (Design Spec
    Sec 6.1's off-request-path job design).
    """

    class Channel(models.TextChoices):
        EMAIL = "email", "Email"
        SMS = "sms", "SMS"

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    notification = models.ForeignKey(
        Notification,
        on_delete=models.CASCADE,
        related_name="deliveries",
        db_column="notification_id",
    )

    channel = models.CharField(max_length=5, choices=Channel.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.QUEUED)

    sent_at = models.DateTimeField(null=True, blank=True)
    # Populated on final job exhaustion only (Document 03 Sec 6.1) -- a
    # single transient failure that a later retry recovers from never
    # touches this field.
    error_message = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "notifications"
        db_table = "notification_delivery"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["notification"], name="notif_delivery_notif_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["notification", "channel"],
                name="notification_delivery_unique_channel",
            ),
        ]

    def __str__(self):
        return f"{self.notification_id} [{self.channel}] {self.status}"
