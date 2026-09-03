"""
settlement -- Celery tasks

`render_and_store_transfer_receipt` runs once, triggered by
`services.confirm_reconciliation_success`, mirroring
`apps.payments.tasks.render_and_store_receipt`'s own once-and-store
pattern (ADR-009).

This exists because of how the manual process it replaces actually works:
a Cashier who deposits cash at a bank gets a paper deposit slip from the
bank, and *that* slip -- not anything from IFMIS -- is what she carries to
Finance to reconcile. IFMIS only records what she owes, never what she's
already paid in. Digitizing the deposit onto Chapa's Transfer API doesn't
remove her need for that proof-of-payment; it just means the platform has
to generate it instead of a bank teller.

No polling task was added: Chapa's Transfer (Payout) API supports a
webhook for transfer status
(https://developer.chapa.co/integrations/webhooks -- `"type": "Payout"`
events, e.g. `event: "payout.success"` / `"payout.failed"`), so
`apps.settlement.views.ChapaTransferWebhookView` is sufficient on its own
to drive `confirm_reconciliation_success`/`confirm_reconciliation_failure`.
If Chapa's webhook delivery ever proves unreliable in practice, a polling
task calling `GET /v1/transfers/verify/<reference>` could be added here as
a fallback -- but nothing today requires it.
"""

import io
import logging

from celery import shared_task
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.conf import settings
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from apps.core.pdf_fonts import ETHIOPIC_BOLD, ETHIOPIC_REGULAR, ensure_ethiopic_fonts_registered

logger = logging.getLogger(__name__)

# ADR-009: rendered once, at issuance, and never regenerated -- a template
# change later must not alter an already-issued receipt. Mirrors
# apps.payments.tasks._RECEIPT_STORAGE_PATH's shape.
_RECEIPT_STORAGE_PATH = "receipts/transfers/{reconciliation_id}.pdf"


def _render_transfer_receipt_pdf(*, reconciliation) -> bytes:
    """FR-LOC-002/003: bilingual (EN/AM), same layout convention as
    apps.payments.tasks._render_receipt_pdf. This is the document a
    Cashier carries to Finance alongside her IFMIS vouchers -- it proves
    the reconciled amount actually left Chapa's pooled balance and landed
    in the university's account, the digital equivalent of a bank
    deposit slip.

    Uses the Noto Sans Ethiopic fonts from apps.core.pdf_fonts for every
    string, rather than ReportLab's "Helvetica"/"Helvetica-Bold" -- those
    base-14 fonts have no Ethiopic glyphs, so Amharic text drawn with
    them renders as empty boxes instead of characters.
    """
    ensure_ethiopic_fonts_registered()
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    _width, _height = A4
    left = 20 * mm
    y = 270 * mm
    line_height = 8 * mm

    def write_row(label_en, label_am, value):
        nonlocal y
        pdf.setFont(ETHIOPIC_BOLD, 11)
        pdf.drawString(left, y, label_en)
        pdf.setFont(ETHIOPIC_REGULAR, 9)
        pdf.drawString(left, y - 4.5 * mm, label_am)
        pdf.setFont(ETHIOPIC_REGULAR, 11)
        pdf.drawString(left + 70 * mm, y, str(value))
        y -= line_height

    pdf.setFont(ETHIOPIC_BOLD, 16)
    pdf.drawString(left, y, "Cashier Transfer Receipt / የገንዘብ ተቀባይ ማስተላለፊያ ደረሰኝ")
    y -= line_height * 1.5

    write_row("Reconciliation ID", "የማስታረቂያ መለያ ቁጥር", reconciliation.id)
    write_row("Cashier", "ገንዘብ ተቀባይ", reconciliation.cashier.full_name)
    write_row("Amount transferred (ETB)", "የተላለፈ መጠን (ብር)", reconciliation.amount_etb)
    write_row(
        "Destination account",
        "የደረሰበት ሂሳብ",
        f"{settings.FINANCE_BANK_ACCOUNT_NAME} ({settings.FINANCE_BANK_ACCOUNT_NUMBER})",
    )
    write_row(
        "Chapa transfer reference",
        "የቻፓ ማስተላለፊያ ቁጥር",
        reconciliation.chapa_transfer_reference or "—",
    )
    write_row(
        "Completed at",
        "የተጠናቀቀበት ሰዓት",
        reconciliation.completed_at.isoformat() if reconciliation.completed_at else "—",
    )
    write_row("Status", "ሁኔታ", reconciliation.get_status_display())

    y -= line_height
    pdf.setFont(ETHIOPIC_REGULAR, 9)
    pdf.drawString(
        left,
        y,
        "Present this receipt to Finance together with your IFMIS voucher references.",
    )
    pdf.drawString(
        left,
        y - 4.5 * mm,
        "ይህን ደረሰኝ ከIFMIS ቫውቸር ማጣቀሻዎችዎ ጋር ለፋይናንስ ያቅርቡ።",
    )

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


@shared_task(bind=True, max_retries=5)
def render_and_store_transfer_receipt(self, *, reconciliation_id):
    """Implements FR-LOC-002/003 for the settlement flow.

    Per ADR-009: rendered ONCE, only once `confirm_reconciliation_success`
    has committed a COMPLETED row, and stored in object storage at
    receipts/transfers/{reconciliation_id}.pdf -- never regenerated on
    demand, so a template change later must not alter an already-issued
    receipt. Mirrors apps.payments.tasks.render_and_store_receipt.
    """
    # Local import: avoids a Django app-loading-order import at task-module
    # import time (mirrors apps.payments.tasks's own local import of
    # apps.bookings.models).
    from .models import CashierReconciliation

    try:
        reconciliation = CashierReconciliation.objects.select_related("cashier").get(
            id=reconciliation_id
        )
    except CashierReconciliation.DoesNotExist:
        # Nothing sensible to retry -- the row this task was enqueued for
        # no longer exists.
        logger.error(
            "render_and_store_transfer_receipt: reconciliation %s not found",
            reconciliation_id,
        )
        return

    storage_path = _RECEIPT_STORAGE_PATH.format(reconciliation_id=reconciliation_id)

    if reconciliation.transfer_receipt_url and default_storage.exists(storage_path):
        # Already rendered (ADR-009: never regenerated) -- a retried task
        # run (e.g. after a transient failure past this point) must not
        # overwrite the original.
        return

    try:
        pdf_bytes = _render_transfer_receipt_pdf(reconciliation=reconciliation)
        default_storage.save(storage_path, ContentFile(pdf_bytes))
    except Exception as exc:
        # Retried below, then re-raised (as MaxRetriesExceededError) once
        # Celery's own retry budget for this task is exhausted.
        logger.exception(
            "render_and_store_transfer_receipt failed for reconciliation %s",
            reconciliation_id,
        )
        raise self.retry(exc=exc, countdown=min(60 * (2**self.request.retries), 900))

    # See apps.payments.tasks.render_and_store_receipt for why this can't
    # be the bare relative path default_storage.url() returns: whatever
    # origin later renders this URL (e.g. the frontend, on a different
    # port/host) would otherwise be treated as the base, producing a
    # broken link.
    relative_url = default_storage.url(storage_path)
    if relative_url.startswith("http://") or relative_url.startswith("https://"):
        reconciliation.transfer_receipt_url = relative_url
    else:
        reconciliation.transfer_receipt_url = (
            f"{settings.PUBLIC_API_BASE_URL.rstrip('/')}{relative_url}"
        )
    reconciliation.save(update_fields=["transfer_receipt_url", "updated_at"])
