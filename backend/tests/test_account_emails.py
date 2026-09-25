"""The account emails in main.py are sent through the branded templates.

Verification, password reset and the account invitation: what the routes
hand to ``send_email``, and what each template says.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.email.render import render_email
from app.models import User


class TestRoutesSendBrandedEmail:
    def test_registering_sends_the_welcome_verification(
        self, test_client: TestClient
    ) -> None:
        with patch("app.main.send_email") as mock_send:
            test_client.post(
                "/api/auth/register",
                json={
                    "username": "newuser",
                    "email": "new@example.com",
                    "password": "StrongPass1!",
                },
            )

        sent = mock_send.call_args.kwargs
        assert sent["subject"] == "Verify your Quill email address"
        assert "Welcome to Quill!" in sent["html_body"]
        assert "/verify-email?token=" in sent["html_body"]
        assert "/verify-email?token=" in sent["text_body"]
        assert sent["from_name"] == "Quill Medical"
        assert sent["reply_to"] is None

    def test_forgot_password_sends_the_reset_email(
        self, test_client: TestClient, test_user: User
    ) -> None:
        with patch("app.main.send_email") as mock_send:
            test_client.post(
                "/api/auth/forgot-password", json={"email": test_user.email}
            )

        sent = mock_send.call_args.kwargs
        assert sent["to"] == test_user.email
        assert sent["subject"] == "Reset your Quill password"
        assert "/reset-password?token=" in sent["html_body"]
        assert "expires in 30 minutes" in sent["text_body"]


class TestTemplates:
    def test_verification_greets_only_on_registering(self) -> None:
        values = {"verify_url": "https://example.com/v", "ttl_minutes": 60}
        welcome = render_email(
            "email_verification.html.j2", "quill", values | {"welcome": True}
        )
        again = render_email(
            "email_verification.html.j2", "quill", values | {"welcome": False}
        )

        assert "Welcome to Quill!" in welcome["html_body"]
        assert "Welcome to Quill!" not in again["html_body"]
        assert "expires in 60 minutes" in again["text_body"]

    def test_account_invite_escapes_the_username(self) -> None:
        rendered = render_email(
            "account_invite.html.j2",
            "quill",
            {
                "username": "<b>sam</b>",
                "setup_url": "https://example.com/s",
                "ttl_minutes": 30,
            },
        )

        assert "<b>sam</b>" not in rendered["html_body"]
        assert "&lt;b&gt;sam&lt;/b&gt;" in rendered["html_body"]
        assert "Hi <b>sam</b>," in rendered["text_body"]
        assert rendered["subject"] == (
            "You're invited to Quill – set up your account"
        )
