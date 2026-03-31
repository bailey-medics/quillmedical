"""Certificate PDF generation for teaching assessments.

Generates a PDF certificate by compositing text over a
``certificate-blank.png`` background image in the question bank.

Layout, fonts, and colours are driven by the ``certificate`` section
of each bank's ``config.yaml``.  When no style config is provided the
built-in defaults are used.
"""

# cspell:words pagesizes pdfgen pagesize fontname fontsize

from __future__ import annotations

import io
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from reportlab.lib.pagesizes import (  # type: ignore[import-untyped]
    A4,
    landscape,
)
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")

# A4 in points (reportlab default unit)
_A4_W, _A4_H = A4


# ------------------------------------------------------------------
# Style data classes
# ------------------------------------------------------------------


def _parse_hex_colour(value: str) -> tuple[float, float, float]:
    """Convert a hex colour string like ``#404040`` to RGB floats."""
    m = _HEX_RE.match(value)
    if not m:
        return (0.25, 0.25, 0.25)
    h = m.group(1)
    return (
        int(h[0:2], 16) / 255,
        int(h[2:4], 16) / 255,
        int(h[4:6], 16) / 255,
    )


@dataclass
class TextFieldStyle:
    """Style for a single text field on the certificate."""

    font: str = "Helvetica"
    size: int = 14
    bold: bool = False
    colour: str = "#404040"
    y: float = 0.5
    text: str | None = None  # static text override (e.g. subtitle)

    @property
    def resolved_font(self) -> str:
        if self.bold and not self.font.endswith("-Bold"):
            return f"{self.font}-Bold"
        return self.font

    @property
    def rgb(self) -> tuple[float, float, float]:
        return _parse_hex_colour(self.colour)


@dataclass
class CertificateStyle:
    """Full certificate layout style parsed from config.yaml."""

    orientation: str = "portrait"
    title: TextFieldStyle = field(
        default_factory=lambda: TextFieldStyle(
            size=22, bold=True, colour="#404040", y=0.62
        )
    )
    subtitle: TextFieldStyle = field(
        default_factory=lambda: TextFieldStyle(
            size=13,
            bold=False,
            colour="#666666",
            y=0.56,
            text="This certifies that",
        )
    )
    candidate_name: TextFieldStyle = field(
        default_factory=lambda: TextFieldStyle(
            size=26, bold=True, colour="#262626", y=0.50
        )
    )
    pass_summary: TextFieldStyle = field(
        default_factory=lambda: TextFieldStyle(
            size=15, bold=False, colour="#338033", y=0.44
        )
    )
    date: TextFieldStyle = field(
        default_factory=lambda: TextFieldStyle(
            size=12, bold=False, colour="#666666", y=0.39
        )
    )
    margin: int = 30


def _parse_field_style(
    data: dict[str, Any], defaults: TextFieldStyle
) -> TextFieldStyle:
    """Parse a single field style dict, falling back to defaults."""
    return TextFieldStyle(
        font=str(data.get("font", defaults.font)),
        size=int(data.get("size", defaults.size)),
        bold=bool(data.get("bold", defaults.bold)),
        colour=str(data.get("colour", defaults.colour)),
        y=float(data.get("y", defaults.y)),
        text=data.get("text", defaults.text),
    )


def parse_certificate_style(
    data: dict[str, Any] | None,
) -> CertificateStyle:
    """Parse the ``certificate`` section of config.yaml.

    Returns defaults for any missing fields.
    """
    if not data:
        return CertificateStyle()

    defaults = CertificateStyle()
    return CertificateStyle(
        orientation=str(data.get("orientation", defaults.orientation)),
        title=_parse_field_style(data.get("title", {}), defaults.title),
        subtitle=_parse_field_style(
            data.get("subtitle", {}), defaults.subtitle
        ),
        candidate_name=_parse_field_style(
            data.get("candidate_name", {}), defaults.candidate_name
        ),
        pass_summary=_parse_field_style(
            data.get("pass_summary", {}), defaults.pass_summary
        ),
        date=_parse_field_style(data.get("date", {}), defaults.date),
        margin=int(data.get("margin", defaults.margin)),
    )


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
    style: CertificateStyle | None = None,
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
    style:
        Optional certificate style from config.yaml.  Uses defaults
        when None.

    Returns
    -------
    Raw PDF bytes.
    """
    if style is None:
        style = CertificateStyle()

    # Page size
    if style.orientation == "landscape":
        page_w, page_h = landscape(A4)
    else:
        page_w, page_h = A4

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))

    # Draw background scaled to fill page
    c.drawImage(
        str(background_path),
        0,
        0,
        width=page_w,
        height=page_h,
        preserveAspectRatio=True,
        anchor="c",
    )

    # Centre-x for all text
    cx = page_w / 2
    max_text_width = page_w - (style.margin * 2)

    # --- Exam title ---
    _draw_field(c, exam_title, style.title, cx, page_h, max_text_width)

    # --- "This certifies that" (or custom subtitle) ---
    subtitle_text = style.subtitle.text or "This certifies that"
    _draw_field(c, subtitle_text, style.subtitle, cx, page_h, max_text_width)

    # --- Candidate name ---
    _draw_field(
        c, candidate_name, style.candidate_name, cx, page_h, max_text_width
    )

    # --- Pass summary ---
    _draw_field(
        c, pass_summary, style.pass_summary, cx, page_h, max_text_width
    )

    # --- Completion date ---
    _draw_field(c, completion_date, style.date, cx, page_h, max_text_width)

    c.showPage()
    c.save()
    return buf.getvalue()


def _draw_field(
    c: canvas.Canvas,
    text: str,
    field_style: TextFieldStyle,
    cx: float,
    page_h: float,
    max_width: float,
) -> None:
    """Draw a single styled text field, centred on the page."""
    c.setFont(field_style.resolved_font, field_style.size)
    r, g, b = field_style.rgb
    c.setFillColorRGB(r, g, b)
    _draw_centred(c, text, cx, page_h * field_style.y, max_width)


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
