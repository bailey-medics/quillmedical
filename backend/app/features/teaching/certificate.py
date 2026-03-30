"""Certificate PDF generation for teaching assessments.

Generates a PDF certificate by compositing text over a
``certificate-blank.png`` background image in the question bank.
"""

# cspell:words pagesizes pdfgen pagesize fontname fontsize

from __future__ import annotations

import io
import logging
from pathlib import Path

from reportlab.lib.pagesizes import A4  # type: ignore[import-untyped]
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

# A4 in points (reportlab default unit)
_A4_W, _A4_H = A4


def find_certificate_background(
    bank_path: Path,
    bank_id: str,
) -> Path | None:
    """Find ``<bank_path>/<bank_id>/certificate-blank.png``.

    Returns None if the file does not exist.
    """
    cert_file = bank_path / bank_id / "certificate-blank.png"
    if cert_file.is_file():
        return cert_file
    return None


def generate_certificate_pdf(
    background_path: Path,
    exam_title: str,
    candidate_name: str,
    pass_summary: str,
    completion_date: str,
) -> bytes:
    """Render a PDF certificate with text overlaid on the background.

    Parameters
    ----------
    background_path:
        Path to the certificate background PNG.
    exam_title:
        Title of the exam / question bank.
    candidate_name:
        Full name of the candidate.
    pass_summary:
        Short pass summary, e.g. "Pass — 90% accuracy".
    completion_date:
        Human-readable completion date string.

    Returns
    -------
    Raw PDF bytes.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # Draw background scaled to fill A4
    c.drawImage(
        str(background_path),
        0,
        0,
        width=_A4_W,
        height=_A4_H,
        preserveAspectRatio=True,
        anchor="c",
    )

    # Centre-x for all text
    cx = _A4_W / 2

    # --- Exam title ---
    c.setFont("Helvetica-Bold", 22)
    c.setFillColorRGB(0.25, 0.25, 0.25)
    _draw_centred(c, exam_title, cx, _A4_H * 0.62, max_width=_A4_W - 60)

    # --- "This certifies that" ---
    c.setFont("Helvetica", 13)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.drawCentredString(cx, _A4_H * 0.56, "This certifies that")

    # --- Candidate name ---
    c.setFont("Helvetica-Bold", 26)
    c.setFillColorRGB(0.15, 0.15, 0.15)
    _draw_centred(c, candidate_name, cx, _A4_H * 0.50, max_width=_A4_W - 60)

    # --- Pass summary ---
    c.setFont("Helvetica", 15)
    c.setFillColorRGB(0.2, 0.5, 0.2)
    c.drawCentredString(cx, _A4_H * 0.44, pass_summary)

    # --- Completion date ---
    c.setFont("Helvetica", 12)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.drawCentredString(cx, _A4_H * 0.39, completion_date)

    c.showPage()
    c.save()
    return buf.getvalue()


def _draw_centred(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
) -> None:
    """Draw centred text, reducing font size if it exceeds *max_width*."""
    font_name = c._fontname
    font_size = c._fontsize
    while c.stringWidth(text, font_name, font_size) > max_width:
        font_size -= 1
        if font_size < 8:
            break
    c.setFont(font_name, font_size)
    c.drawCentredString(x, y, text)
