"""Certificate PDF generation for teaching assessments.

Generates a PDF certificate by compositing text over a
``certificate-blank.png`` background image in the question bank.

Layout, fonts, and colours are driven by the ``certificate`` section of
each bank's ``config.yaml``.  The schema for that section lives in
``app.features.teaching.content.certificate_schema``, shared with the
content validator so the two gates cannot disagree about what is valid.

What lives here is the *rendering* half, and its opposite failure policy.
Bank configs are authored outside this repository, so parsing is
defensive: anything invalid is discarded with a warning and replaced by
its default rather than raising.  A certificate download must never fail
because of a malformed style block — where the validator, by contrast,
raises and reports every problem it finds.
"""

from __future__ import annotations

import io
import logging
import tempfile
from pathlib import Path
from typing import Protocol

from pydantic import ValidationError
from reportlab.lib.pagesizes import (  # type: ignore[import-untyped]
    A4,
    landscape,
)
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]

from app.features.teaching.content.certificate_schema import (
    CertificateStyle,
    TextFieldStyle,
)

# Re-exported: callers have always imported the models from here, and
# they moved to content/certificate_schema.py without changing that.
# The Literals are not re-exported — import them from the schema.
__all__ = [
    "Canvas",
    "CertificateStyle",
    "TextFieldStyle",
    "download_certificate_background_from_gcs",
    "find_certificate_background",
    "generate_certificate_pdf",
    "parse_certificate_style",
]

logger = logging.getLogger(__name__)


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


# ------------------------------------------------------------------
# Config parsing
# ------------------------------------------------------------------


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
    for name, field_defaults in defaults.text_fields().items():
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
