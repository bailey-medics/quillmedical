"""Tests for email sending module."""

import logging
from email import message_from_bytes, policy
from email.message import EmailMessage
from unittest.mock import MagicMock, patch

import pytest

from app.email_send import (
    Attachment,
    EmailNotAllowedError,
    EmailRateLimitError,
    EmailSendError,
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
        # The address is masked: a log is no place for who was emailed.
        assert "s***@e***.com" in caplog.text
        assert "student@example.com" not in caplog.text
        # Nor is the subject logged: a certificate's names the person.
        assert "Certificate: Test Exam" not in caplog.text

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

        # Attachments are counted, not named: a file name can carry a
        # person's name as surely as a subject can.
        assert "attachments=1" in caplog.text
        assert "certificate.pdf" not in caplog.text

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

        # Send 10 emails (the limit) – all should succeed
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

        # At limit now – wait for window to expire
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


class TestTextReplyToAndSenderName:
    """The parts a branded email adds: plain text, reply-to, display name."""

    @patch("app.email_send.resend")
    @patch("app.email_send.settings")
    def test_passes_text_reply_to_and_a_named_sender(
        self, mock_settings: MagicMock, mock_resend: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = "re_k"
        mock_settings.EMAIL_FROM = "info@quill-medical.com"

        send_email(
            to="trainee@example.com",
            subject="Your certificate",
            html_body="<p>Well done</p>",
            text_body="Well done",
            reply_to="coordinator@partner.example",
            from_name="EoEETA via Quill Medical",
        )

        params = mock_resend.Emails.send.call_args[0][0]
        assert params["text"] == "Well done"
        assert params["reply_to"] == "coordinator@partner.example"
        assert params["from"] == (
            '"EoEETA via Quill Medical" <info@quill-medical.com>'
        )

    @patch("app.email_send.resend")
    @patch("app.email_send.settings")
    def test_leaves_them_out_when_not_given(
        self, mock_settings: MagicMock, mock_resend: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = "re_k"
        mock_settings.EMAIL_FROM = "info@quill-medical.com"

        send_email(to="a@example.com", subject="S", html_body="<p>B</p>")

        params = mock_resend.Emails.send.call_args[0][0]
        assert "text" not in params
        assert "reply_to" not in params
        assert params["from"] == "info@quill-medical.com"

    @pytest.mark.parametrize(
        "name",
        [
            'Quill" <attacker@example.com>',
            "Quill\r\nBcc: attacker@example.com",
            "Quill <x>",
            "   ",
        ],
    )
    @patch("app.email_send.settings")
    def test_refuses_a_sender_name_that_could_break_the_header(
        self, mock_settings: MagicMock, name: str
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = True
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
        mock_settings.EMAIL_FROM = "info@quill-medical.com"

        with pytest.raises(ValueError, match="Unsafe sender name"):
            send_email(
                to="a@example.com",
                subject="S",
                html_body="<p>B</p>",
                from_name=name,
            )


class TestTheApiKey:
    """The Resend key, as it arrives from Secret Manager."""

    def setup_method(self) -> None:
        _rate_log.clear()

    @patch("app.email_send.resend")
    @patch("app.email_send.settings")
    def test_a_trailing_newline_is_ignored(
        self, mock_settings: MagicMock, mock_resend: MagicMock
    ) -> None:
        """Stored with `echo`, the key ends in a newline, which `requests`
        refuses in a header. Every production email failed this way."""
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = (
            "re_test_key\n"
        )
        mock_settings.EMAIL_FROM = "noreply@quillmedical.com"

        send_email(to="a@example.com", subject="Hi", html_body="<p>x</p>")

        assert mock_resend.api_key == "re_test_key"

    @patch("app.email_send.resend.Emails.send")
    @patch("app.email_send.settings")
    def test_a_failed_send_never_carries_the_key(
        self, mock_settings: MagicMock, mock_send: MagicMock
    ) -> None:
        """The error callers log must not quote the key, and must not
        carry the original exception, whose message does."""
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
        mock_settings.RESEND_API_KEY = MagicMock()
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = (
            "re_secret_value"
        )
        mock_send.side_effect = RuntimeError(
            "Invalid header value: 'Bearer re_secret_value'"
        )

        with pytest.raises(EmailSendError) as raised:
            send_email(to="a@example.com", subject="Hi", html_body="<p>x</p>")

        assert "re_secret_value" not in str(raised.value)
        assert "[redacted]" in str(raised.value)
        assert raised.value.__cause__ is None
        assert raised.value.__suppress_context__


def _ses_settings(mock_settings: MagicMock) -> None:
    """Settings for a live send through SES, with working credentials."""
    mock_settings.EMAIL_DRY_RUN = False
    mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
    mock_settings.EMAIL_PROVIDER = "ses"
    mock_settings.EMAIL_FROM = "info@quill-medical.com"
    mock_settings.SES_REGION = "eu-west-2"
    mock_settings.SES_ACCESS_KEY_ID.get_secret_value.return_value = (
        "test-key-id"
    )
    mock_settings.SES_SECRET_ACCESS_KEY.get_secret_value.return_value = (
        "ses_secret_value"
    )


def _sent_message(mock_boto3: MagicMock) -> EmailMessage:
    """The MIME message the mocked SES client was handed, parsed."""
    send = mock_boto3.client.return_value.send_email
    raw = send.call_args.kwargs["Content"]["Raw"]["Data"]
    parsed = message_from_bytes(raw, policy=policy.default)
    assert isinstance(parsed, EmailMessage)
    return parsed


class TestSendingThroughSes:
    """``EMAIL_PROVIDER`` set to ``ses``: Amazon SES in London."""

    def setup_method(self) -> None:
        _rate_log.clear()

    @patch("app.email_send.resend")
    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_sends_from_the_pinned_region_and_not_through_resend(
        self,
        mock_settings: MagicMock,
        mock_boto3: MagicMock,
        mock_resend: MagicMock,
    ) -> None:
        """Every SES resource is per region. A client made anywhere but
        London would be email data outside the UK."""
        _ses_settings(mock_settings)

        send_email(
            to="student@example.com",
            subject="Verify your email",
            html_body="<p>Hello</p>",
        )

        client_call = mock_boto3.client.call_args
        assert client_call.args == ("sesv2",)
        assert client_call.kwargs["region_name"] == "eu-west-2"
        send = mock_boto3.client.return_value.send_email
        send.assert_called_once()
        assert send.call_args.kwargs["FromEmailAddress"] == (
            "info@quill-medical.com"
        )
        assert send.call_args.kwargs["Destination"] == {
            "ToAddresses": ["student@example.com"]
        }
        mock_resend.Emails.send.assert_not_called()

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_html_alone_is_sent_as_an_html_message(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        _ses_settings(mock_settings)

        send_email(
            to="student@example.com",
            subject="Verify your email",
            html_body="<p>Hello</p>",
        )

        message = _sent_message(mock_boto3)
        assert message["Subject"] == "Verify your email"
        assert message["To"] == "student@example.com"
        assert message["Reply-To"] is None
        assert message.get_content_type() == "text/html"
        assert "<p>Hello</p>" in message.get_content()

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_carries_the_text_body_the_reply_to_and_the_sender_name(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        _ses_settings(mock_settings)

        send_email(
            to="student@example.com",
            subject="Your invitation",
            html_body="<p>Rich</p>",
            text_body="Plain",
            reply_to="coordinator@example.org",
            from_name="EoEETA via Quill Medical",
        )

        message = _sent_message(mock_boto3)
        assert message["Reply-To"] == "coordinator@example.org"
        assert "EoEETA via Quill Medical" in message["From"]
        assert "info@quill-medical.com" in message["From"]
        plain = message.get_body(preferencelist=("plain",))
        rich = message.get_body(preferencelist=("html",))
        assert plain is not None
        assert rich is not None
        assert plain.get_content().strip() == "Plain"
        assert "<p>Rich</p>" in rich.get_content()

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_carries_an_attachment(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        """Why the message is raw MIME: a certificate is an attachment."""
        _ses_settings(mock_settings)
        pdf = b"%PDF-1.4 certificate"

        send_email(
            to="student@example.com",
            subject="Your certificate",
            html_body="<p>Attached</p>",
            attachments=[Attachment(filename="certificate.pdf", content=pdf)],
        )

        attached = list(_sent_message(mock_boto3).iter_attachments())
        assert len(attached) == 1
        assert attached[0].get_filename() == "certificate.pdf"
        assert attached[0].get_content_type() == "application/pdf"
        assert attached[0].get_content() == pdf

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_trailing_newlines_on_the_credentials_are_ignored(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        _ses_settings(mock_settings)
        mock_settings.SES_ACCESS_KEY_ID.get_secret_value.return_value = (
            "test-key-id\n"
        )
        mock_settings.SES_SECRET_ACCESS_KEY.get_secret_value.return_value = (
            "ses_secret_value\n"
        )

        send_email(to="a@example.com", subject="Hi", html_body="<p>x</p>")

        kwargs = mock_boto3.client.call_args.kwargs
        assert kwargs["aws_access_key_id"] == "test-key-id"
        assert kwargs["aws_secret_access_key"] == "ses_secret_value"

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_a_failed_send_never_carries_the_credentials(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        _ses_settings(mock_settings)
        mock_boto3.client.return_value.send_email.side_effect = RuntimeError(
            "Refused for test-key-id signed with ses_secret_value"
        )

        with pytest.raises(EmailSendError) as raised:
            send_email(to="a@example.com", subject="Hi", html_body="<p>x</p>")

        assert "ses_secret_value" not in str(raised.value)
        assert "test-key-id" not in str(raised.value)
        assert "[redacted]" in str(raised.value)
        assert raised.value.__cause__ is None
        assert raised.value.__suppress_context__

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_a_failed_send_is_not_charged_to_the_allowance(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        _ses_settings(mock_settings)
        mock_boto3.client.return_value.send_email.side_effect = RuntimeError(
            "unreachable"
        )

        with pytest.raises(EmailSendError):
            send_email(to="a@example.com", subject="Hi", html_body="<p>x</p>")

        assert _rate_log.get("a@example.com", []) == []

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_missing_credentials_send_nothing_and_say_so(
        self,
        mock_settings: MagicMock,
        mock_boto3: MagicMock,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        _ses_settings(mock_settings)
        mock_settings.SES_SECRET_ACCESS_KEY = None

        with caplog.at_level(logging.ERROR, logger="app.email_send"):
            send_email(to="a@example.com", subject="Hi", html_body="<p>x</p>")

        assert "SES_SECRET_ACCESS_KEY are not configured" in caplog.text
        mock_boto3.client.assert_not_called()
        assert _rate_log.get("a@example.com", []) == []

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_a_dry_run_does_not_reach_ses(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        _ses_settings(mock_settings)
        mock_settings.EMAIL_DRY_RUN = True

        send_email(to="a@example.com", subject="Hi", html_body="<p>x</p>")

        mock_boto3.client.assert_not_called()

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_a_recipient_off_the_allow_list_does_not_reach_ses(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        _ses_settings(mock_settings)
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = "mark@example.org"

        with pytest.raises(EmailNotAllowedError):
            send_email(
                to="stranger@example.com", subject="Hi", html_body="<p>x</p>"
            )

        mock_boto3.client.assert_not_called()


class TestExtraHeaders:
    """The ``List-Unsubscribe`` pair a newsletter carries."""

    HEADERS = {
        "List-Unsubscribe": "<https://app.example/api/x?token=abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }

    def setup_method(self) -> None:
        _rate_log.clear()

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_ses_carries_them_in_the_message(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        _ses_settings(mock_settings)

        send_email(
            to="a@example.com",
            subject="News",
            html_body="<p>x</p>",
            headers=self.HEADERS,
        )

        message = _sent_message(mock_boto3)
        assert message["List-Unsubscribe"] == (
            "<https://app.example/api/x?token=abc>"
        )
        assert message["List-Unsubscribe-Post"] == (
            "List-Unsubscribe=One-Click"
        )

    @patch("app.email_send.resend")
    @patch("app.email_send.settings")
    def test_resend_is_given_them(
        self, mock_settings: MagicMock, mock_resend: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = "re_k"
        mock_settings.EMAIL_FROM = "info@quill-medical.com"

        send_email(
            to="a@example.com",
            subject="News",
            html_body="<p>x</p>",
            headers=self.HEADERS,
        )

        params = mock_resend.Emails.send.call_args[0][0]
        assert params["headers"] == self.HEADERS

    @patch("app.email_send.resend")
    @patch("app.email_send.settings")
    def test_none_are_sent_when_none_are_given(
        self, mock_settings: MagicMock, mock_resend: MagicMock
    ) -> None:
        mock_settings.EMAIL_DRY_RUN = False
        mock_settings.EMAIL_ALLOWED_RECIPIENTS = ""
        mock_settings.RESEND_API_KEY.get_secret_value.return_value = "re_k"
        mock_settings.EMAIL_FROM = "info@quill-medical.com"

        send_email(to="a@example.com", subject="Hi", html_body="<p>x</p>")

        assert "headers" not in mock_resend.Emails.send.call_args[0][0]

    @pytest.mark.parametrize(
        "headers",
        [
            {"List-Unsubscribe": "<https://x>\r\nBcc: eve@example.com"},
            {"List-Unsubscribe": "<https://x>\nBcc: eve@example.com"},
            {"Bad Name": "x"},
            {"X:Y": "x"},
            {"": "x"},
            {"Subject": "Not the real one"},
            {"bcc": "eve@example.com"},
            {"From": "eve@example.com"},
        ],
    )
    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_a_header_that_could_do_harm_sends_nothing(
        self,
        mock_settings: MagicMock,
        mock_boto3: MagicMock,
        headers: dict[str, str],
    ) -> None:
        """A line break would start another header: a hidden recipient."""
        _ses_settings(mock_settings)

        with pytest.raises(ValueError):
            send_email(
                to="a@example.com",
                subject="News",
                html_body="<p>x</p>",
                headers=headers,
            )

        mock_boto3.client.assert_not_called()


class TestSendingFromAnotherAddress:
    """A newsletter sent as another brand goes from that brand's address."""

    def setup_method(self) -> None:
        _rate_log.clear()

    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_the_address_given_is_the_one_sent_from(
        self, mock_settings: MagicMock, mock_boto3: MagicMock
    ) -> None:
        _ses_settings(mock_settings)

        send_email(
            to="a@example.com",
            subject="News",
            html_body="<p>x</p>",
            from_name="Mark at Let's Do Digital",
            from_address="news@letsdodigital.example",
        )

        send = mock_boto3.client.return_value.send_email
        assert send.call_args.kwargs["FromEmailAddress"] == (
            '"Mark at Let\'s Do Digital" <news@letsdodigital.example>'
        )

    @pytest.mark.parametrize(
        "address",
        [
            "",
            "no-at-sign",
            "a@b@c",
            "news@x.example\r\nBcc: eve@example.com",
            "news@x.example, eve@example.com",
            "<news@x.example>",
            "news @x.example",
        ],
    )
    @patch("app.email_send.boto3")
    @patch("app.email_send.settings")
    def test_an_address_that_is_not_one_sends_nothing(
        self, mock_settings: MagicMock, mock_boto3: MagicMock, address: str
    ) -> None:
        _ses_settings(mock_settings)

        with pytest.raises(ValueError, match="Unsafe sender address"):
            send_email(
                to="a@example.com",
                subject="News",
                html_body="<p>x</p>",
                from_address=address,
            )

        mock_boto3.client.assert_not_called()


class TestMaskingAnAddress:
    """An address in a log line is personal data, so most of it is hidden."""

    def test_keeps_a_letter_of_each_half_and_the_ending(self) -> None:
        from app.email_send import mask_email

        assert mask_email("mark@example.org") == "m***@e***.org"

    def test_keeps_only_the_last_part_of_a_longer_domain(self) -> None:
        from app.email_send import mask_email

        assert mask_email("a.nurse@ward.trust.nhs.uk") == "a***@w***.uk"

    def test_hides_a_domain_with_no_dot_altogether(self) -> None:
        from app.email_send import mask_email

        assert mask_email("root@localhost") == "r***@***"

    @pytest.mark.parametrize("value", ["", "not-an-address", "@nobody", "x@"])
    def test_hides_anything_that_is_not_an_address(self, value: str) -> None:
        from app.email_send import mask_email

        assert mask_email(value) == "***"

    def test_a_refused_recipient_is_not_named_in_the_rate_limit_error(
        self,
    ) -> None:
        from app import email_send

        email_send._rate_log.clear()
        for _ in range(email_send._EMAIL_MAX_PER_WINDOW):
            email_send._record_send("busy@example.com")

        with pytest.raises(email_send.EmailRateLimitError) as caught:
            email_send._check_rate_limit("busy@example.com")

        assert "busy@example.com" not in str(caught.value)
        assert "b***@e***.com" in str(caught.value)
        email_send._rate_log.clear()


class TestHowResendIsReached:
    """Cloud Run has no IPv6 route out, and Resend has IPv6 addresses."""

    def test_the_sdk_uses_the_ipv4_client(self) -> None:
        import resend

        from app.email_send import _Ipv4Client

        assert isinstance(resend.default_http_client, _Ipv4Client)

    def test_it_gives_up_on_a_connection_quickly(self) -> None:
        from app.email_send import _Ipv4Client

        assert _Ipv4Client.TIMEOUT.connect == 3.0
        assert _Ipv4Client.TIMEOUT.read == 20.0

    def test_it_returns_what_the_sdk_expects(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        import httpx

        from app import email_send

        seen: dict[str, object] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["method"] = request.method
            seen["url"] = str(request.url)
            seen["auth"] = request.headers.get("authorization")
            seen["body"] = request.content
            return httpx.Response(200, json={"id": "email_1"})

        real_client = httpx.Client

        def stub_client(**kwargs: object) -> httpx.Client:
            seen["local_address"] = kwargs["transport"]._pool._local_address  # type: ignore[attr-defined]
            return real_client(transport=httpx.MockTransport(handler))

        monkeypatch.setattr(email_send.httpx, "Client", stub_client)

        content, status, headers = email_send._Ipv4Client().request(
            "post",
            "https://api.resend.com/emails",
            {"Authorization": "Bearer re_test"},
            json={"to": ["a@example.com"]},
        )

        assert status == 200
        assert b"email_1" in content
        assert "content-type" in headers
        assert seen["method"] == "POST"
        assert seen["url"] == "https://api.resend.com/emails"
        assert seen["auth"] == "Bearer re_test"
        assert b"a@example.com" in seen["body"]  # type: ignore[operator]
        assert seen["local_address"] == "0.0.0.0"
