"""Tests for email sending module."""

import logging
from unittest.mock import MagicMock, patch

import pytest

from app.email_send import (
    Attachment,
    EmailNotAllowedError,
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


class TestFailedSendsDoNotCountAgainstTheLimit:
    """The allowance counts what was sent, not what was attempted.

    Counting attempts meant an unreachable mail server spent the budget:
    ten retries, nothing delivered, and the address locked for an hour.
    """

    def setup_method(self) -> None:
        _rate_log.clear()

    @patch("app.email_send.resend.Emails.send")
    @patch("app.email_send.settings")
    def test_a_failed_send_is_not_charged(
        self, mock_settings: MagicMock, mock_send: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
        mock_settings.RESEND_API_KEY = MagicMock()
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = "key"
        mock_send.side_effect = RuntimeError("mail server unreachable")

        for _ in range(20):
            with pytest.raises(RuntimeError):
                send_email(
                    to="unreachable@example.com",
                    subject="Nope",
                    html_body="<p>x</p>",
                )

        assert _rate_log.get("unreachable@example.com", []) == []

    @patch("app.email_send.resend.Emails.send")
    @patch("app.email_send.settings")
    def test_the_allowance_survives_an_outage(
        self, mock_settings: MagicMock, mock_send: MagicMock
    ) -> None:
        """Retrying through an outage must not lock the address out."""
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
        mock_settings.RESEND_API_KEY = MagicMock()
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = "key"
        mock_send.side_effect = RuntimeError("down")

        for _ in range(15):
            with pytest.raises(RuntimeError):
                send_email(
                    to="patient@example.com",
                    subject="Retry",
                    html_body="<p>x</p>",
                )

        # The outage ends. The next one must go out rather than be
        # refused for an hour on the strength of failures alone.
        mock_send.side_effect = None
        send_email(
            to="patient@example.com",
            subject="At last",
            html_body="<p>x</p>",
        )

        assert len(_rate_log["patient@example.com"]) == 1

    @patch("app.email_send.settings")
    def test_a_dry_run_is_charged(self, mock_settings: MagicMock) -> None:
        """A dry run did everything but leave the machine."""
        mock_settings.EMAIL_DRY_RUN = True
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""

        send_email(to="logged@example.com", subject="x", html_body="<p>x</p>")

        assert len(_rate_log["logged@example.com"]) == 1


class TestAllowedRecipients:
    """Which addresses this environment may write to at all."""

    def setup_method(self) -> None:
        _rate_log.clear()

    @patch("app.email_send.settings")
    def test_an_empty_list_allows_anybody(
        self, mock_settings: MagicMock
    ) -> None:
        """Production sets nothing, and mails its users."""
        mock_settings.EMAIL_DRY_RUN = True
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""

        send_email(to="anybody@example.com", subject="x", html_body="<p>x</p>")

    @patch("app.email_send.settings")
    def test_an_address_on_the_list_is_allowed(
        self, mock_settings: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = True
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = (
            "me@example.com, other@example.com"
        )

        send_email(to="me@example.com", subject="x", html_body="<p>x</p>")

    @patch("app.email_send.settings")
    def test_an_address_not_on_the_list_is_refused(
        self, mock_settings: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = True
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = "me@example.com"

        with pytest.raises(EmailNotAllowedError):
            send_email(
                to="stranger@example.com",
                subject="x",
                html_body="<p>x</p>",
            )

    @patch("app.email_send.settings")
    def test_matching_ignores_case_and_spacing(
        self, mock_settings: MagicMock
    ) -> None:
        """An address typed into a form is not normalised for us."""
        mock_settings.EMAIL_DRY_RUN = True
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = "  Me@Example.com ,, "

        send_email(to="ME@EXAMPLE.COM", subject="x", html_body="<p>x</p>")

    @patch("app.email_send.settings")
    def test_a_refusal_is_not_charged(self, mock_settings: MagicMock) -> None:
        """Refused before the limiter, so it costs nothing."""
        mock_settings.EMAIL_DRY_RUN = True
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = "me@example.com"

        with pytest.raises(EmailNotAllowedError):
            send_email(
                to="stranger@example.com",
                subject="x",
                html_body="<p>x</p>",
            )

        assert _rate_log.get("stranger@example.com", []) == []

    @patch("app.email_send.settings")
    def test_a_refusal_names_the_setting(
        self,
        mock_settings: MagicMock,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """So a tester reads a configuration problem, not an outage."""
        mock_settings.EMAIL_DRY_RUN = True
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = "me@example.com"

        with caplog.at_level(logging.WARNING, logger="app.email_send"):
            with pytest.raises(EmailNotAllowedError) as caught:
                send_email(
                    to="stranger@example.com",
                    subject="x",
                    html_body="<p>x</p>",
                )

        assert "EMAIL_ALLOWED_RECIPIENTS" in str(caught.value)
        assert "EMAIL_ALLOWED_RECIPIENTS" in caplog.text
