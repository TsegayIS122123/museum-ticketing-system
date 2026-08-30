"""
payments -- Celery tasks (queue: documents per Sec 6.1-6.2)

`render_and_store_receipt` runs once, triggered by payment confirmation
(`services.confirm_payment_from_webhook`). This is the Visitor-facing
receipt for her booking payment -- distinct from
`apps.settlement.tasks.render_and_store_transfer_receipt`, the
Cashier-facing receipt proving a reconciliation transfer to Finance went
through. Same once-and-store pattern (ADR-009), different audience and
document.
"""

import io
import logging

from celery import shared_task
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)

# ADR-009: rendered once, at issuance, and never regenerated -- a template
# change later must not alter an already-issued receipt. The path shape
# itself (receipts/temporary/{booking_id}.pdf) is Document 03 Sec 6.3's.
_RECEIPT_STORAGE_PATH = "receipts/temporary/{booking_id}.pdf"


def _render_receipt_pdf(*, booking) -> bytes:
    """FR-LOC-002/003: every generated document presents Amharic and
    English together, not as a language the Visitor has to switch to.
    Kept deliberately simple (a plain two-column bilingual layout) --
    this is the only generated financial document in this system; a
    cashier's reconciliation transfer (apps.settlement) produces no
    document of its own (per the IFMIS decision)."""
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, _height = A4
    left = 20 * mm
    y = 270 * mm
    line_height = 8 * mm

    def write_row(label_en, label_am, value):
        nonlocal y
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(left, y, label_en)
        pdf.setFont("Helvetica", 9)
        pdf.drawString(left, y - 4.5 * mm, label_am)
        pdf.setFont("Helvetica", 11)
        pdf.drawString(left + 70 * mm, y, str(value))
        y -= line_height

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(left, y, "Temporary Receipt / ጊዜያዊ ደረሰኝ")
    y -= line_height * 1.5

    write_row("Booking reference", "የቦታ ማስያዣ ቁጥር", booking.reference)
    write_row("Visitor", "ጎብኚ", booking.visitor.full_name)
    write_row("Category", "ምድብ", f"{booking.category_name_en} / {booking.category_name_am}")
    write_row("Visit date", "የጉብኝት ቀን", booking.visit_date.isoformat())
    write_row("Quantity", "ብዛት", booking.booked_quantity)
    write_row("Amount paid (ETB)", "የተከፈለ መጠን (ብር)", booking.total_amount_etb)
    write_row("Status", "ሁኔታ", booking.get_status_display())

    y -= line_height
    pdf.setFont("Helvetica-Oblique", 9)
    pdf.drawString(
        left,
        y,
        "This is a temporary receipt. Final status depends on your visit date outcome.",
    )
    pdf.drawString(
        left,
        y - 4.5 * mm,
        "ይህ ጊዜያዊ ደረሰኝ ነው። የመጨረሻው ሁኔታ በጉብኝት ቀንዎ ውጤት ላይ የተመሠረተ ነው።",
    )

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


@shared_task(bind=True, max_retries=5)
def render_and_store_receipt(self, *, booking_id):
    """Implements FR-PAY-002, FR-LOC-002/003.

    Per ADR-009: rendered ONCE at issuance and stored in object storage at
    receipts/temporary/{booking_id}.pdf -- never regenerated on demand, so
    a template change later must not alter an already-issued receipt.
    """
    # Local import: avoids a Django app-loading-order import of
    # apps.bookings.models at task-module import time (mirrors the local
    # imports used for cross-app Celery task references elsewhere in this
    # codebase, e.g. apps.accounts.services -> apps.notifications.tasks).
    from apps.bookings.models import Booking

    try:
        booking = Booking.objects.select_related("visitor").get(id=booking_id)
    except Booking.DoesNotExist:
        # Nothing sensible to retry -- the booking this task was enqueued
        # for no longer exists.
        logger.error("render_and_store_receipt: booking %s not found", booking_id)
        return

    storage_path = _RECEIPT_STORAGE_PATH.format(booking_id=booking_id)

    if booking.receipt_url and default_storage.exists(storage_path):
        # Already rendered (ADR-009: never regenerated) -- a retried task
        # run (e.g. after a transient failure past this point) must not
        # overwrite the original.
        return

    try:
        pdf_bytes = _render_receipt_pdf(booking=booking)
        default_storage.save(storage_path, ContentFile(pdf_bytes))
    except Exception as exc:
        # Retried below, then re-raised (as MaxRetriesExceededError) once
        # Celery's own retry budget for this task is exhausted.
        logger.exception("render_and_store_receipt failed for booking %s", booking_id)
        raise self.retry(exc=exc, countdown=min(60 * (2**self.request.retries), 900))

    booking.receipt_url = default_storage.url(storage_path)
    booking.save(update_fields=["receipt_url", "updated_at"])
