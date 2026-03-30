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


@pytest.fixture()
def coordinator_template_file(bank_dir: Path) -> Path:
    """Write a coordinator email template YAML."""
    content = {
        "subject": "Certificate: $exam_title",
        "body": (
            "Dear $recipient_name,\n\n"
            "$student_name has passed **$exam_title** "
            "on $completion_date.\n\n"
            "The certificate is attached."
        ),
        "attach_certificate": True,
    }
    path = bank_dir / "coordinator-email.yaml"
    path.write_text(yaml.dump(content), encoding="utf-8")
    return path


@pytest.fixture()
def student_template_file(bank_dir: Path) -> Path:
    """Write a student email template YAML."""
    content = {
        "subject": "Your certificate for $exam_title",
        "body": (
            "Hi $student_name,\n\n"
            "Congratulations on passing **$exam_title**!\n\n"
            "Your certificate is attached."
        ),
        "attach_certificate": True,
    }
    path = bank_dir / "student-email.yaml"
    path.write_text(yaml.dump(content), encoding="utf-8")
    return path


class TestLoadEmailTemplate:
    """Test loading email templates from YAML files."""

    def test_loads_coordinator_template(
        self,
        tmp_path: Path,
        coordinator_template_file: Path,
    ) -> None:
        result = load_email_template(
            tmp_path, "test-bank", "coordinator-email"
        )
        assert result is not None
        assert "$exam_title" in result["subject"]
        assert "$recipient_name" in result["body"]
        assert result["attach_certificate"] is True

    def test_loads_student_template(
        self,
        tmp_path: Path,
        student_template_file: Path,
    ) -> None:
        result = load_email_template(tmp_path, "test-bank", "student-email")
        assert result is not None
        assert "$exam_title" in result["subject"]
        assert "$student_name" in result["body"]

    def test_returns_none_for_missing_file(
        self, tmp_path: Path, bank_dir: Path
    ) -> None:
        result = load_email_template(tmp_path, "test-bank", "nonexistent")
        assert result is None

    def test_returns_none_for_missing_bank(self, tmp_path: Path) -> None:
        result = load_email_template(
            tmp_path, "no-such-bank", "coordinator-email"
        )
        assert result is None

    def test_defaults_attach_certificate_to_true(
        self, tmp_path: Path, bank_dir: Path
    ) -> None:
        content = {"subject": "Test", "body": "Body"}
        path = bank_dir / "minimal-email.yaml"
        path.write_text(yaml.dump(content), encoding="utf-8")

        result = load_email_template(tmp_path, "test-bank", "minimal-email")
        assert result is not None
        assert result["attach_certificate"] is True


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
