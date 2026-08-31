"""Certificate schema shared between the validator and the renderer.

The point of moving these models into ``content/`` is that the gate which
blocks a bad certificate block at merge time and the code that renders the
PDF cannot disagree about what is valid.  These tests hold that property:
if someone re-declares a model in ``certificate.py``, or the two drift, the
identity assertions below fail.

Behavioural coverage of the models themselves lives in
``test_teaching_certificate.py``, which exercises them through
``parse_certificate_style``.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.features.teaching import certificate
from app.features.teaching.content import certificate_schema
from app.features.teaching.content.certificate_schema import (
    BOLD_FONT,
    CERTIFICATE_TEXT_FIELDS,
    CertificateStyle,
    TextFieldStyle,
    parse_hex_colour,
)


class TestSingleDefinition:
    """The renderer must use the shared models, not its own copies."""

    def test_renderer_uses_the_shared_style_model(self) -> None:
        assert certificate.CertificateStyle is CertificateStyle

    def test_renderer_uses_the_shared_field_model(self) -> None:
        assert certificate.TextFieldStyle is TextFieldStyle

    def test_schema_module_holds_no_reportlab_dependency(self) -> None:
        """The schema must stay importable without the PDF stack."""
        import sys

        # certificate.py imports reportlab; the schema module must not.
        source = certificate_schema.__file__
        assert source is not None
        with open(source, encoding="utf-8") as f:
            text = f.read()
        assert "reportlab" not in text
        assert "app.models" not in text
        # Sanity: the renderer really does depend on reportlab.
        assert "reportlab" in sys.modules


class TestSharedAnnotation:
    """Both schemas reject YAML booleans through the same annotation."""

    def test_boolean_size_is_rejected(self) -> None:
        """``size: yes`` must not silently validate as 1."""
        with pytest.raises(ValidationError):
            TextFieldStyle(size=True)

    def test_boolean_margin_is_rejected(self) -> None:
        with pytest.raises(ValidationError):
            CertificateStyle(margin=True)


class TestTextFieldsHelper:
    """``text_fields()`` replaces the renderer's private mapping."""

    def test_covers_every_declared_text_field(self) -> None:
        style = CertificateStyle()
        assert set(style.text_fields()) == set(CERTIFICATE_TEXT_FIELDS)

    def test_returns_the_live_styles(self) -> None:
        style = CertificateStyle(
            title=TextFieldStyle(size=40, colour="#123456")
        )
        fields = style.text_fields()
        assert fields["title"].size == 40
        assert fields["title"].colour == "#123456"
        assert fields["date"] == CertificateStyle().date


class TestBoldFontMapping:
    """Every allowed font maps to a real ReportLab bold face."""

    @pytest.mark.parametrize("font", sorted(BOLD_FONT))
    def test_bold_resolves_within_the_allowed_set(self, font: str) -> None:
        style = TextFieldStyle(font=font, bold=True)  # type: ignore[arg-type]
        assert style.resolved_font in BOLD_FONT

    def test_every_font_has_a_bold_counterpart(self) -> None:
        fonts = set(TextFieldStyle.model_fields["font"].annotation.__args__)  # type: ignore[union-attr]
        assert fonts == set(BOLD_FONT)


class TestParseHexColour:
    def test_accepts_with_and_without_hash(self) -> None:
        assert parse_hex_colour("#FF8000") == parse_hex_colour("FF8000")

    def test_falls_back_to_grey_on_nonsense(self) -> None:
        assert parse_hex_colour("not-a-colour") == (0.25, 0.25, 0.25)

    def test_converts_to_reportlab_floats(self) -> None:
        r, g, b = parse_hex_colour("#FF8000")
        assert abs(r - 1.0) < 0.01
        assert abs(g - 0.502) < 0.01
        assert b == 0.0
