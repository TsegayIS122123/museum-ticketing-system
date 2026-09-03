"""
Shared font registration for every ReportLab-generated PDF in this
project (apps.payments.tasks.render_and_store_receipt and
apps.settlement.tasks.render_and_store_transfer_receipt, currently --
both bilingual English/Amharic documents per FR-LOC-002/003).

WHY THIS EXISTS: ReportLab's built-in "Helvetica"/"Helvetica-Bold" fonts
are the PDF spec's base-14 fonts, which only ship Latin (WinAnsi) glyphs.
They have no Ethiopic (Ge'ez script) glyphs at all, so any Amharic text
drawn with them renders as .notdef boxes ("tofu") instead of the actual
characters -- this is a font-coverage problem, not an encoding bug. Any
canvas that draws Amharic text MUST use one of the font names registered
here instead of "Helvetica"/"Helvetica-Bold".

Font: Noto Sans Ethiopic (SIL Open Font License), chosen because it's
one of the few widely-available fonts with full Ethiopic coverage AND
decent Latin coverage, so the same font can render the bilingual
English/Amharic strings this project uses (e.g. "Temporary Receipt /
ጊዜያዊ ደረሰኝ") without switching fonts mid-string.

The two .ttf files here are static Regular/Bold instances extracted
from Google Fonts' variable-font release via `fonttools varLib.instancer`
(ReportLab's TTFont doesn't reliably select a weight axis from a
variable font, so we ship fixed-weight instances instead -- smaller
files too: ~360KB each vs. ~1.1MB for the variable font).
"""

from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = Path(__file__).resolve().parent / "fonts"

# Public font names -- use these, never "Helvetica"/"Helvetica-Bold", for
# any text that may contain Amharic.
ETHIOPIC_REGULAR = "NotoSansEthiopic"
ETHIOPIC_BOLD = "NotoSansEthiopic-Bold"

_registered = False


def ensure_ethiopic_fonts_registered() -> None:
    """Idempotent: registerFont raises if called twice with the same name
    in some ReportLab versions, and this is called once per Celery worker
    process per task invocation, so guard against re-registering."""
    global _registered
    if _registered:
        return
    pdfmetrics.registerFont(TTFont(ETHIOPIC_REGULAR, str(FONT_DIR / "NotoSansEthiopic-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(ETHIOPIC_BOLD, str(FONT_DIR / "NotoSansEthiopic-Bold.ttf")))
    _registered = True
