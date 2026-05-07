"""Tests for email sending module."""

import logging
from unittest.mock import MagicMock, patch

import pytest

from app.email_send import (
    Attachment,
    EmailRateLimitError,
    _rate_log,
    send_email,
)


class TestSendEmailDryRun:
    """Test email dry-run mode (default in development)."""

    @patch("app.email_send.settings")
    def test_dry_run_logs_instead_of_sending(
        self, mock_settings: MagicMock, caplog: pytest.LogCaptureFixture
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = True

        with caplog.at_level(logging.INFO, logger="app.email_send"):
            send_email(
                to="student@example.com",
                subject="Certificate: Test Exam",
                html_body="<p>Congratulations</p>",
            )

        assert "EMAIL DRY RUN" in caplog.text
        assert "student@example.com" in caplog.text
        assert "Certificate: Test Exam" in caplog.text

    @patch("app.email_send.settings")
    def test_dry_run_logs_attachment_names(
        self, mock_settings: MagicMock, caplog: pytest.LogCaptureFixture
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = True

        attachments: list[Attachment] = [
            {"filename": "certificate.pdf", "content": b"%PDF-fake"},
        ]

        with caplog.at_level(logging.INFO, logger="app.email_send"):
            send_email(
                to="coord@example.com",
                subject="Certificate: Test Exam",
                html_body="<p>See attached</p>",
                attachments=attachments,
            )

        assert "certificate.pdf" in caplog.text

    @patch("app.email_send.resend")
    @patch("app.email_send.settings")
    def test_dry_run_does_not_call_resend(
        self, mock_settings: MagicMock, mock_resend: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = True

        send_email(
            to="test@example.com",
            subject="Test",
            html_body="<p>Test</p>",
        )

        mock_resend.Emails.send.assert_not_called()


class TestSendEmailLive:
    """Test email sending with Resend API."""

    @patch("app.email_send.resend")
    @patch("app.email_send.settings")
    def test_missing_api_key_logs_error(
        self,
        mock_settings: MagicMock,
        mock_resend: MagicMock,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.RESEND_API_KEY = None

        with caplog.at_level(logging.ERROR, logger="app.email_send"):
            send_email(
                to="test@example.com",
                subject="Test",
                html_body="<p>Test</p>",
            )

        assert "RESEND_API_KEY is not configured" in caplog.text
        mock_resend.Emails.send.assert_not_called()

    @patch("app.email_send.resend")
    @patch("app.email_send.settings")
    def test_sends_email_via_resend(
        self, mock_settings: MagicMock, mock_resend: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = (
            "re_test_key"
        )
        mock_settings.EMAIL_FROM = "noreply@quillmedical.com"

        send_email(
            to="student@example.com",
            subject="Your certificate",
            html_body="<p>Attached</p>",
        )

        mock_resend.Emails.send.assert_called_once()
        call_args = mock_resend.Emails.send.call_args[0][0]
        assert call_args["to"] == ["student@example.com"]
        assert call_args["subject"] == "Your certificate"
        assert call_args["html"] == "<p>Attached</p>"
        assert call_args["from"] == "noreply@quillmedical.com"

    @patch("app.email_send.resend")
    @patch("app.email_send.settings")
    def test_sends_with_attachment(
        self, mock_settings: MagicMock, mock_resend: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = (
            "re_test_key"
        )
        mock_settings.EMAIL_FROM = "noreply@quillmedical.com"

        attachments: list[Attachment] = [
            {"filename": "cert.pdf", "content": b"\x00\x01\x02"},
        ]

        send_email(
            to="student@example.com",
            subject="Certificate",
            html_body="<p>Here</p>",
            attachments=attachments,
        )

        call_args = mock_resend.Emails.send.call_args[0][0]
        assert "attachments" in call_args
        assert len(call_args["attachments"]) == 1


class TestEmailRateLimiting:
    """Test per-recipient email rate limiting."""

    def setup_method(self) -> None:
        """Clear rate limit state before each test."""
        _rate_log.clear()

    @patch("app.email_send.settings")
    def test_allows_emails_under_limit(self, mock_settings: MagicMock) -> None:
        """Emails within rate limit should succeed."""
        mock_settings.EMAIL_DRY_RUN = True

        # Send 10 emails (the limit) — all should succeed
        for i in range(10):
            send_email(
                to="user@example.com",
                subject=f"Email {i}",
                html_body=f"<p>Body {i}</p>",
            )

    @patch("app.email_send.settings")
    def test_blocks_emails_over_limit(self, mock_settings: MagicMock) -> None:
        """11th email to same recipient within window should be blocked."""
        mock_settings.EMAIL_DRY_RUN = True

        for i in range(10):
            send_email(
                to="spammed@example.com",
                subject=f"Email {i}",
                html_body=f"<p>Body {i}</p>",
            )

        with pytest.raises(EmailRateLimitError):
            send_email(
                to="spammed@example.com",
                subject="One too many",
                html_body="<p>Blocked</p>",
            )

    @patch("app.email_send.settings")
    def test_different_recipients_have_separate_limits(
        self, mock_settings: MagicMock
    ) -> None:
        """Rate limit is per-recipient, not global."""
        mock_settings.EMAIL_DRY_RUN = True

        for i in range(10):
            send_email(
                to="user-a@example.com",
                subject=f"Email {i}",
                html_body=f"<p>Body {i}</p>",
            )

        # Different recipient should still be allowed
        send_email(
            to="user-b@example.com",
            subject="Fine",
            html_body="<p>OK</p>",
        )

    @patch("app.email_send._EMAIL_WINDOW_SECONDS", 1)
    @patch("app.email_send._EMAIL_MAX_PER_WINDOW", 2)
    @patch("app.email_send.settings")
    def test_expired_entries_are_pruned(
        self, mock_settings: MagicMock
    ) -> None:
        """Old timestamps outside the window are cleaned up."""
        import time

        mock_settings.EMAIL_DRY_RUN = True

        send_email(
            to="prune@example.com",
            subject="First",
            html_body="<p>1</p>",
        )
        send_email(
            to="prune@example.com",
            subject="Second",
            html_body="<p>2</p>",
        )

        # At limit now — wait for window to expire
        time.sleep(1.1)

        # Should succeed because old entries expired
        send_email(
            to="prune@example.com",
            subject="After expiry",
            html_body="<p>OK</p>",
        )

    @patch("app.email_send.settings")
    def test_rate_limit_logs_warning(
        self,
        mock_settings: MagicMock,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Rate limit violation should log a warning."""
        mock_settings.EMAIL_DRY_RUN = True

        for i in range(10):
            send_email(
                to="warned@example.com",
                subject=f"Email {i}",
                html_body=f"<p>{i}</p>",
            )

        with caplog.at_level(logging.WARNING, logger="app.email_send"):
            with pytest.raises(EmailRateLimitError):
                send_email(
                    to="warned@example.com",
                    subject="Blocked",
                    html_body="<p>No</p>",
                )

        assert "rate limit exceeded" in caplog.text.lower()
