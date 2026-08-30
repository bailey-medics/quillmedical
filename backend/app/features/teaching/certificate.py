"""Certificate PDF generation for teaching assessments.

Generates a PDF certificate by compositing text over a
``certificate-blank.png`` background image in the question bank.

Layout, fonts, and colours are driven by the ``certificate`` section of
each bank's ``config.yaml``.  The Pydantic models below are the single
source of truth for what that section may contain.  Bank configs are
authored outside this repository, so parsing is defensive: every value
is validated, and anything invalid is discarded with a warning and
replaced by its default rather than raising.  Certificate generation
must never fail because of a malformed style block.
"""

from __future__ import annotations

import io
import logging
import re
import tempfile
from pathlib import Path
from typing import Annotated, Literal, Protocol

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    ValidationError,
)
from reportlab.lib.pagesizes import (  # type: ignore[import-untyped]
    A4,
    landscape,
)
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

# Tolerant pattern used when converting a stored colour to RGB.
_HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")

# Strict pattern enforced on config input (leading "#" required).
_HEX_COLOUR_PATTERN = r"^#[0-9a-fA-F]{6}$"

# Fallback colour (mid grey) for a colour string that cannot be parsed.
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
_BOLD_FONT: dict[CertificateFont, CertificateFont] = {
    "Helvetica": "Helvetica-Bold",
    "Helvetica-Bold": "Helvetica-Bold",
    "Times-Roman": "Times-Bold",
    "Times-Bold": "Times-Bold",
    "Courier": "Courier-Bold",
    "Courier-Bold": "Courier-Bold",
}


class Canvas(Protocol):
    """Structural type for the ReportLab canvas methods used here.

    ``reportlab`` ships no type stubs, so its ``Canvas`` is untyped.
    Depending on this protocol instead keeps our own call sites
    type-checked under ``mypy --strict``.
    """

    def setFont(self, psfontname: str, size: float) -> None: ...

    def setFillColorRGB(self, r: float, g: float, b: float) -> None: ...

    def drawCentredString(self, x: float, y: float, text: str) -> None: ...

    def stringWidth(
        self, text: str, fontName: str, fontSize: float
    ) -> float: ...

    def drawImage(
        self,
        image: str,
        x: float,
        y: float,
        width: float | None = None,
        height: float | None = None,
        *,
        preserveAspectRatio: bool = False,
        anchor: str = "c",
    ) -> None: ...

    def showPage(self) -> None: ...

    def save(self) -> None: ...


def _reject_bool(value: object) -> object:
    """Reject booleans where a number is expected.

    ``bool`` subclasses ``int`` in Python, so without this a YAML
    ``size: yes`` would silently validate as ``1``.
    """
    if isinstance(value, bool):
        raise ValueError("must be a number, not a boolean")
    return value


#: An int/float that will not silently accept a YAML boolean.
Number = Annotated[float, BeforeValidator(_reject_bool)]
Whole = Annotated[int, BeforeValidator(_reject_bool)]


def _parse_hex_colour(value: str) -> tuple[float, float, float]:
    """Convert a hex colour string like ``#404040`` to RGB floats."""
    m = _HEX_RE.match(value)
    if not m:
        return _FALLBACK_RGB
    h = m.group(1)
    return (
        int(h[0:2], 16) / 255,
        int(h[2:4], 16) / 255,
        int(h[4:6], 16) / 255,
    )


# ------------------------------------------------------------------
# Style models
# ------------------------------------------------------------------


class TextFieldStyle(BaseModel):
    """Style for a single text field on the certificate."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    font: CertificateFont = "Helvetica"
    size: Whole = Field(default=14, ge=6, le=72)
    bold: bool = False
    colour: str = Field(default="#404040", pattern=_HEX_COLOUR_PATTERN)
    y: Number = Field(default=0.5, ge=0.0, le=1.0)
    # Static text override (e.g. the subtitle line).
    text: str | None = None

    @property
    def resolved_font(self) -> CertificateFont:
        """The font to pass to ReportLab, honouring ``bold``."""
        return _BOLD_FONT[self.font] if self.bold else self.font

    @property
    def rgb(self) -> tuple[float, float, float]:
        """``colour`` as ReportLab RGB floats."""
        return _parse_hex_colour(self.colour)


class CertificateStyle(BaseModel):
    """Full certificate layout style parsed from config.yaml."""

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


# ------------------------------------------------------------------
# Config parsing
# ------------------------------------------------------------------


def _text_field_defaults(
    defaults: CertificateStyle,
) -> dict[str, TextFieldStyle]:
    """Map each text-field name to its default style."""
    return {
        "title": defaults.title,
        "subtitle": defaults.subtitle,
        "candidate_name": defaults.candidate_name,
        "pass_summary": defaults.pass_summary,
        "date": defaults.date,
        "exam_ref": defaults.exam_ref,
    }


def _as_str_keyed(raw: dict[object, object]) -> dict[str, object]:
    """Coerce a YAML mapping's keys to strings."""
    return {str(key): value for key, value in raw.items()}


def _validate_with_recovery(payload: dict[str, object]) -> CertificateStyle:
    """Validate *payload*, dropping invalid top-level keys.

    Each failing key falls back to its default rather than losing the
    whole style block, so one bad setting cannot blank a certificate.
    """
    candidate = dict(payload)
    # Bounded: every pass removes at least one key, or returns/breaks.
    for _ in range(len(candidate) + 1):
        try:
            return CertificateStyle.model_validate(candidate)
        except ValidationError as exc:
            bad = {
                str(err["loc"][0]) for err in exc.errors() if err["loc"]
            } & set(candidate)
            if not bad:
                logger.warning(
                    "Unusable certificate style config; using defaults: %s",
                    exc,
                )
                break
            logger.warning(
                "Ignoring invalid certificate style key(s) %s: %s",
                sorted(bad),
                exc,
            )
            for key in bad:
                del candidate[key]
    return CertificateStyle()


def parse_certificate_style(data: object) -> CertificateStyle:
    """Parse the ``certificate`` section of config.yaml.

    Accepts the raw value straight from ``yaml.safe_load``.  Missing or
    invalid settings fall back to their defaults, with a warning logged
    naming what was rejected.
    """
    defaults = CertificateStyle()
    if data is None:
        return defaults
    if not isinstance(data, dict):
        logger.warning(
            "certificate config is %s, not a mapping; using defaults",
            type(data).__name__,
        )
        return defaults

    section = _as_str_keyed(data)
    if not section:
        return defaults

    payload: dict[str, object] = dict(section)
    for name, field_defaults in _text_field_defaults(defaults).items():
        raw = section.get(name)
        if raw is None:
            payload.pop(name, None)
            continue
        if not isinstance(raw, dict):
            logger.warning(
                "certificate.%s must be a mapping, got %s; using defaults",
                name,
                type(raw).__name__,
            )
            payload.pop(name, None)
            continue
        # Merge over the defaults so a partial block keeps the rest.
        payload[name] = {
            **field_defaults.model_dump(),
            **_as_str_keyed(raw),
        }

    return _validate_with_recovery(payload)


# ------------------------------------------------------------------
# Background image lookup
# ------------------------------------------------------------------


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


def download_certificate_background_from_gcs(
    bucket_name: str,
    bank_id: str,
) -> Path | None:
    """Download ``certificate-blank.png`` from GCS to a temp file.

    Returns the path to the temporary file, or None if the blob
    does not exist.  The caller is responsible for cleaning up
    the temp file.
    """
    from google.cloud import storage  # type: ignore[import-untyped]

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob_path = f"questions/{bank_id}/certificate-blank.png"
    blob = bucket.blob(blob_path)

    if not blob.exists():
        logger.info(
            "certificate-blank.png not found at gs://%s/%s",
            bucket_name,
            blob_path,
        )
        return None

    tmp = tempfile.NamedTemporaryFile(
        suffix=".png", prefix=f"cert_{bank_id}_", delete=False
    )
    blob.download_to_filename(tmp.name)
    tmp.close()
    logger.info("Downloaded certificate background from GCS to %s", tmp.name)
    return Path(tmp.name)


# ------------------------------------------------------------------
# PDF rendering
# ------------------------------------------------------------------


def generate_certificate_pdf(
    background_path: Path,
    exam_title: str,
    candidate_name: str,
    pass_summary: str,
    completion_date: str,
    style: CertificateStyle | None = None,
    exam_ref: str | None = None,
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
    exam_ref:
        Optional exam reference number, e.g. "eoeeta-1-42".

    Returns
    -------
    Raw PDF bytes.
    """
    if style is None:
        style = CertificateStyle()

    # Page size (reportlab is untyped, so pin the dimensions to float).
    page_w: float
    page_h: float
    if style.orientation == "landscape":
        page_w, page_h = landscape(A4)
    else:
        page_w, page_h = A4

    buf = io.BytesIO()
    c: Canvas = canvas.Canvas(buf, pagesize=(page_w, page_h))

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

    # --- Exam reference ---
    if exam_ref:
        ref_text = f"Exam reference: {exam_ref}"
        _draw_field(c, ref_text, style.exam_ref, cx, page_h, max_text_width)

    c.showPage()
    c.save()
    return buf.getvalue()


def _draw_field(
    c: Canvas,
    text: str,
    field_style: TextFieldStyle,
    cx: float,
    page_h: float,
    max_width: float,
) -> None:
    """Draw a single styled text field, centred on the page."""
    font_name = field_style.resolved_font
    font_size = field_style.size
    c.setFont(font_name, font_size)
    r, g, b = field_style.rgb
    c.setFillColorRGB(r, g, b)
    _draw_centred(
        c,
        text,
        cx,
        page_h * field_style.y,
        max_width,
        font_name,
        font_size,
    )


def _draw_centred(
    c: Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font_name: str,
    font_size: float,
) -> None:
    """Draw centred text, wrapping onto multiple lines if needed."""
    lines = _wrap_text(c, text, font_name, font_size, max_width)
    line_height = font_size * 1.2
    # Centre the block vertically around the target y
    total_height = line_height * (len(lines) - 1)
    top_y = y + total_height / 2
    for i, line in enumerate(lines):
        c.drawCentredString(x, top_y - i * line_height, line)


def _wrap_text(
    c: Canvas,
    text: str,
    font_name: str,
    font_size: float,
    max_width: float,
) -> list[str]:
    """Split *text* into lines that fit within *max_width*.

    Explicit newlines in *text* are always honoured.  Each resulting
    paragraph is then word-wrapped to *max_width*.
    """
    paragraphs = text.split("\n")
    lines: list[str] = []
    for para in paragraphs:
        para = para.strip()
        if not para:
            lines.append("")
            continue
        if c.stringWidth(para, font_name, font_size) <= max_width:
            lines.append(para)
            continue
        words = para.split()
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if c.stringWidth(candidate, font_name, font_size) <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines or [text]
