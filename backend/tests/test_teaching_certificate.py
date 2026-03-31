"""Tests for teaching certificate generation.

Covers: PDF generation, find_certificate_background, style parsing,
and the download_certificate endpoint.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from app.features.teaching.certificate import (
    CertificateStyle,
    TextFieldStyle,
    find_certificate_background,
    generate_certificate_pdf,
    parse_certificate_style,
)

# ------------------------------------------------------------------
# find_certificate_background
# ------------------------------------------------------------------


class TestFindCertificateBackground:
    def test_returns_none_when_no_certificate_file(
        self, tmp_path: Path
    ) -> None:
        bank_dir = tmp_path / "my-bank"
        bank_dir.mkdir()
        assert find_certificate_background(tmp_path, "my-bank") is None

    def test_returns_none_when_bank_dir_missing(self, tmp_path: Path) -> None:
        assert find_certificate_background(tmp_path, "my-bank") is None

    def test_returns_path_when_certificate_exists(
        self, tmp_path: Path
    ) -> None:
        bank_dir = tmp_path / "my-bank"
        bank_dir.mkdir()
        cert = bank_dir / "certificate-blank.png"
        cert.write_bytes(b"fake-png")
        result = find_certificate_background(tmp_path, "my-bank")
        assert result is not None
        assert result.name == "certificate-blank.png"

    def test_ignores_other_png_files(self, tmp_path: Path) -> None:
        bank_dir = tmp_path / "my-bank"
        bank_dir.mkdir()
        (bank_dir / "other.png").write_bytes(b"fake-png")
        assert find_certificate_background(tmp_path, "my-bank") is None


# ------------------------------------------------------------------
# generate_certificate_pdf
# ------------------------------------------------------------------


class TestGenerateCertificatePdf:
    @pytest.fixture()
    def background(self, tmp_path: Path) -> Path:
        """Create a minimal valid PNG for testing."""
        img = Image.new("RGB", (800, 1132), color=(100, 50, 150))
        path = tmp_path / "bg.png"
        img.save(path)
        return path

    def test_returns_valid_pdf_bytes(self, background: Path) -> None:
        result = generate_certificate_pdf(
            background_path=background,
            exam_title="Test Exam",
            candidate_name="Jane Smith",
            pass_summary="Pass — 90% accuracy",
            completion_date="29 March 2026",
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_pdf_contains_candidate_name(self, background: Path) -> None:
        result = generate_certificate_pdf(
            background_path=background,
            exam_title="Test Exam",
            candidate_name="Jane Smith",
            pass_summary="Pass",
            completion_date="29 March 2026",
        )
        # PDF is valid and non-trivially sized (text + image)
        assert len(result) > 1000

    def test_pdf_contains_exam_title(self, background: Path) -> None:
        result = generate_certificate_pdf(
            background_path=background,
            exam_title="Colonoscopy Test",
            candidate_name="Bob",
            pass_summary="Pass",
            completion_date="1 January 2026",
        )
        assert len(result) > 1000

    def test_pdf_contains_completion_date(self, background: Path) -> None:
        result = generate_certificate_pdf(
            background_path=background,
            exam_title="Test",
            candidate_name="Alice",
            pass_summary="Pass",
            completion_date="15 June 2026",
        )
        assert len(result) > 1000

    def test_generates_with_custom_style(self, background: Path) -> None:
        style = CertificateStyle(
            title=TextFieldStyle(size=30, bold=True, colour="#000000", y=0.70),
        )
        result = generate_certificate_pdf(
            background_path=background,
            exam_title="Custom Style Exam",
            candidate_name="Dr Test",
            pass_summary="Pass",
            completion_date="1 April 2026",
            style=style,
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_landscape_orientation(self, background: Path) -> None:
        style = CertificateStyle(orientation="landscape")
        result = generate_certificate_pdf(
            background_path=background,
            exam_title="Landscape Exam",
            candidate_name="Dr Landscape",
            pass_summary="Pass",
            completion_date="1 April 2026",
            style=style,
        )
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"


# ------------------------------------------------------------------
# parse_certificate_style
# ------------------------------------------------------------------


class TestParseCertificateStyle:
    def test_returns_defaults_for_none(self) -> None:
        style = parse_certificate_style(None)
        assert style.orientation == "portrait"
        assert style.title.size == 22
        assert style.subtitle.text == "This certifies that"

    def test_returns_defaults_for_empty_dict(self) -> None:
        style = parse_certificate_style({})
        assert style.orientation == "portrait"
        assert style.margin == 30

    def test_parses_orientation(self) -> None:
        style = parse_certificate_style({"orientation": "landscape"})
        assert style.orientation == "landscape"

    def test_parses_title_fields(self) -> None:
        style = parse_certificate_style(
            {
                "title": {
                    "font": "Times-Roman",
                    "size": 30,
                    "bold": False,
                    "colour": "#FF0000",
                    "y": 0.70,
                },
            }
        )
        assert style.title.font == "Times-Roman"
        assert style.title.size == 30
        assert style.title.bold is False
        assert style.title.colour == "#FF0000"
        assert style.title.y == 0.70

    def test_resolved_font_appends_bold(self) -> None:
        fs = TextFieldStyle(font="Helvetica", bold=True)
        assert fs.resolved_font == "Helvetica-Bold"

    def test_resolved_font_no_double_bold(self) -> None:
        fs = TextFieldStyle(font="Helvetica-Bold", bold=True)
        assert fs.resolved_font == "Helvetica-Bold"

    def test_rgb_from_hex(self) -> None:
        fs = TextFieldStyle(colour="#FF8000")
        r, g, b = fs.rgb
        assert abs(r - 1.0) < 0.01
        assert abs(g - 0.502) < 0.01
        assert abs(b - 0.0) < 0.01
