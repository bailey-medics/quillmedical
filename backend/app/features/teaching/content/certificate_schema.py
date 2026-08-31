"""Schema for the ``certificate`` section of a bank's assessment config.

Moved out of ``app.features.teaching.certificate`` so that both gates can
share it: the content validator checks a bank against these models before a
pull request merges, and the PDF renderer parses against the same models at
request time.  One definition, so the two cannot disagree.

The two consumers want opposite failure behaviour, and that split is
deliberate: the validator raises and reports every problem, while the
renderer drops an offending key and falls back to a default so a
certificate download never returns a 500.  The recovery logic therefore
stays in ``certificate.py``; only the schema lives here.

Only the standard library and ``pydantic`` may be imported — see the
package docstring.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.features.teaching.content.annotations import Number, Whole

#: Strict pattern enforced on config input (leading "#" required).
HEX_COLOUR_PATTERN = r"^#[0-9a-fA-F]{6}$"

#: Tolerant pattern used when converting a stored colour to RGB.
_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")

#: Fallback colour (mid grey) for a colour string that cannot be parsed.
_FALLBACK_RGB = (0.25, 0.25, 0.25)

#: ReportLab base-14 fonts a bank may select.
CertificateFont = Literal[
    "Helvetica",
    "Helvetica-Bold",
    "Times-Roman",
    "Times-Bold",
    "Courier",
    "Courier-Bold",
]

#: Page orientations a bank may select.
Orientation = Literal["portrait", "landscape"]

#: Bold counterpart of each allowed font.
BOLD_FONT: dict[CertificateFont, CertificateFont] = {
    "Helvetica": "Helvetica-Bold",
    "Helvetica-Bold": "Helvetica-Bold",
    "Times-Roman": "Times-Bold",
    "Times-Bold": "Times-Bold",
    "Courier": "Courier-Bold",
    "Courier-Bold": "Courier-Bold",
}

#: The text fields a certificate style may configure, in render order.
CERTIFICATE_TEXT_FIELDS = (
    "title",
    "subtitle",
    "candidate_name",
    "pass_summary",
    "date",
    "exam_ref",
)


def parse_hex_colour(value: str) -> tuple[float, float, float]:
    """Convert a hex colour string like ``#404040`` to RGB floats.

    Tolerant of a missing leading ``#`` and falls back to mid grey, so a
    value that slipped past validation still renders something sane.
    """
    m = _HEX_RE.match(value)
    if not m:
        return _FALLBACK_RGB
    h = m.group(1)
    return (
        int(h[0:2], 16) / 255,
        int(h[2:4], 16) / 255,
        int(h[4:6], 16) / 255,
    )


class TextFieldStyle(BaseModel):
    """Style for a single text field on the certificate."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    font: CertificateFont = "Helvetica"
    size: Whole = Field(default=14, ge=6, le=72)
    bold: bool = False
    colour: str = Field(default="#404040", pattern=HEX_COLOUR_PATTERN)
    y: Number = Field(default=0.5, ge=0.0, le=1.0)
    # Static text override (e.g. the subtitle line).
    text: str | None = None

    @property
    def resolved_font(self) -> CertificateFont:
        """The font to pass to ReportLab, honouring ``bold``."""
        return BOLD_FONT[self.font] if self.bold else self.font

    @property
    def rgb(self) -> tuple[float, float, float]:
        """``colour`` as ReportLab RGB floats."""
        return parse_hex_colour(self.colour)


class CertificateStyle(BaseModel):
    """Full certificate layout style parsed from a bank's config."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    orientation: Orientation = "portrait"
    title: TextFieldStyle = TextFieldStyle(
        size=22, bold=True, colour="#404040", y=0.62
    )
    subtitle: TextFieldStyle = TextFieldStyle(
        size=13,
        bold=False,
        colour="#666666",
        y=0.56,
        text="This certifies that",
    )
    candidate_name: TextFieldStyle = TextFieldStyle(
        size=26, bold=True, colour="#262626", y=0.50
    )
    pass_summary: TextFieldStyle = TextFieldStyle(
        size=15, bold=False, colour="#338033", y=0.44
    )
    date: TextFieldStyle = TextFieldStyle(
        size=12, bold=False, colour="#666666", y=0.39
    )
    exam_ref: TextFieldStyle = TextFieldStyle(
        size=11, bold=False, colour="#888888", y=0.34
    )
    margin: Whole = Field(default=30, ge=0, le=200)

    def text_fields(self) -> dict[str, TextFieldStyle]:
        """Map each text-field name to its style, in render order."""
        return {
            "title": self.title,
            "subtitle": self.subtitle,
            "candidate_name": self.candidate_name,
            "pass_summary": self.pass_summary,
            "date": self.date,
            "exam_ref": self.exam_ref,
        }
