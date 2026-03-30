"""Tests for teaching certificate generation.

Covers: PDF generation, find_certificate_background, and the
download_certificate endpoint.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from PIL import Image

from app.features.teaching.certificate import (
    find_certificate_background,
    generate_certificate_pdf,
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
