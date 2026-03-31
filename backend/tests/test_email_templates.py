"""Tests for email template loading and rendering."""

from pathlib import Path

import pytest
import yaml

from app.features.teaching.email_templates import (
    EmailTemplate,
    load_email_template,
    render_email,
)


@pytest.fixture()
def bank_dir(tmp_path: Path) -> Path:
    """Create a fake question bank directory."""
    bank = tmp_path / "test-bank"
    bank.mkdir()
    return bank


def _write_config(bank_dir: Path, extra: dict) -> None:  # type: ignore[type-arg]
    """Write a config.yaml with merged email sections."""
    base = {
        "id": "test-bank",
        "version": 1,
        "title": "Test",
        "description": "Test bank",
        "type": "uniform",
    }
    base.update(extra)
    (bank_dir / "config.yaml").write_text(
        yaml.dump(base, default_flow_style=False), encoding="utf-8"
    )


@pytest.fixture()
def coordinator_config(bank_dir: Path) -> Path:
    """Write config.yaml with a coordinator_email section."""
    _write_config(
        bank_dir,
        {
            "coordinator_email": {
                "subject": "Certificate: $exam_title",
                "body": (
                    "Dear $recipient_name,\n\n"
                    "$student_name has passed **$exam_title** "
                    "on $completion_date.\n\n"
                    "The certificate is attached."
                ),
                "attach_certificate": True,
            },
        },
    )
    return bank_dir


@pytest.fixture()
def student_config(bank_dir: Path) -> Path:
    """Write config.yaml with a student_email section."""
    _write_config(
        bank_dir,
        {
            "student_email": {
                "subject": "Your certificate for $exam_title",
                "body": (
                    "Hi $student_name,\n\n"
                    "Congratulations on passing **$exam_title**!\n\n"
                    "Your certificate is attached."
                ),
                "attach_certificate": True,
            },
        },
    )
    return bank_dir


class TestLoadEmailTemplate:
    """Test loading email templates from config.yaml sections."""

    def test_loads_coordinator_template(
        self,
        tmp_path: Path,
        coordinator_config: Path,
    ) -> None:
        result = load_email_template(
            tmp_path, "test-bank", "coordinator_email"
        )
        assert result is not None
        assert "$exam_title" in result["subject"]
        assert "$recipient_name" in result["body"]
        assert result["attach_certificate"] is True

    def test_loads_student_template(
        self,
        tmp_path: Path,
        student_config: Path,
    ) -> None:
        result = load_email_template(tmp_path, "test-bank", "student_email")
        assert result is not None
        assert "$exam_title" in result["subject"]
        assert "$student_name" in result["body"]

    def test_returns_none_for_missing_section(
        self, tmp_path: Path, bank_dir: Path
    ) -> None:
        _write_config(bank_dir, {})
        result = load_email_template(tmp_path, "test-bank", "nonexistent")
        assert result is None

    def test_returns_none_for_missing_bank(self, tmp_path: Path) -> None:
        result = load_email_template(
            tmp_path, "no-such-bank", "coordinator_email"
        )
        assert result is None

    def test_defaults_attach_certificate_to_true(
        self, tmp_path: Path, bank_dir: Path
    ) -> None:
        _write_config(
            bank_dir,
            {"minimal_email": {"subject": "Test", "body": "Body"}},
        )
        result = load_email_template(tmp_path, "test-bank", "minimal_email")
        assert result is not None
        assert result["attach_certificate"] is True

    def test_normalises_hyphenated_key(
        self,
        tmp_path: Path,
        coordinator_config: Path,
    ) -> None:
        """Legacy hyphenated key names are normalised to underscores."""
        result = load_email_template(
            tmp_path, "test-bank", "coordinator-email"
        )
        assert result is not None


class TestRenderEmail:
    """Test variable substitution and Markdown to HTML conversion."""

    def test_substitutes_variables_in_subject(self) -> None:
        template = EmailTemplate(
            subject="Certificate: $exam_title",
            body="Body",
            attach_certificate=True,
        )
        result = render_email(template, {"exam_title": "Chest X-ray Test"})
        assert result["subject"] == "Certificate: Chest X-ray Test"

    def test_substitutes_variables_in_body(self) -> None:
        template = EmailTemplate(
            subject="Test",
            body="Dear $recipient_name, $student_name passed.",
            attach_certificate=True,
        )
        result = render_email(
            template,
            {
                "recipient_name": "Dr Smith",
                "student_name": "Jane Doe",
            },
        )
        assert "Dr Smith" in result["html_body"]
        assert "Jane Doe" in result["html_body"]

    def test_converts_markdown_to_html(self) -> None:
        template = EmailTemplate(
            subject="Test",
            body="**bold** and *italic*",
            attach_certificate=True,
        )
        result = render_email(template, {})
        assert "<strong>bold</strong>" in result["html_body"]
        assert "<em>italic</em>" in result["html_body"]

    def test_safe_substitute_leaves_unknown_vars(self) -> None:
        template = EmailTemplate(
            subject="$unknown_var",
            body="$another_unknown",
            attach_certificate=True,
        )
        result = render_email(template, {})
        assert result["subject"] == "$unknown_var"
        assert "$another_unknown" in result["html_body"]
