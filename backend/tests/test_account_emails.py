"""The account emails in main.py are sent through the branded templates.

Verification, password reset and the account invitation: what the routes
hand to ``send_email``, and what each template says.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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
        assert "Hi newuser," in sent["text_body"]
        assert "Your username is newuser." in sent["text_body"]
        assert "This email was sent to new@example.com." in sent["text_body"]
        assert "This email was sent to new@example.com." in sent["html_body"]
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
        assert f"Your username is {test_user.username}." in sent["text_body"]
        assert (
            f"This email was sent to {test_user.email}." in sent["text_body"]
        )
        assert (
            f"This email was sent to {test_user.email}." in sent["html_body"]
        )

    @pytest.mark.parametrize(
        ("full_name", "greeting"),
        [("Sam Patel", "Hi Sam Patel,"), (None, "Hi invited,")],
    )
    def test_the_invite_greets_by_full_name_and_gives_the_username(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        full_name: str | None,
        greeting: str,
    ) -> None:
        """They log in with the username, so it is stated either way."""
        user = User(
            username="invited",
            full_name=full_name,
            email="invited@example.com",
            password_hash="x",
            email_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        with patch("app.main.send_email") as mock_send:
            response = authenticated_superadmin_client.post(
                f"/api/users/{user.id}/send-invite"
            )

        assert response.status_code == 200, response.text
        sent = mock_send.call_args.kwargs
        assert greeting in sent["text_body"]
        assert "Your username is invited." in sent["text_body"]
        assert (
            "Your username is <strong>invited</strong>." in sent["html_body"]
        )
        assert (
            "This email was sent to invited@example.com." in sent["text_body"]
        )


class TestTemplates:
    def test_verification_greets_only_on_registering(self) -> None:
        values = {
            "name": "Sam Patel",
            "username": "sam.patel",
            "email": "sam@example.com",
            "verify_url": "https://example.com/v",
            "ttl_minutes": 60,
        }
        welcome = render_email(
            "email_verification.html.j2", "quill", values | {"welcome": True}
        )
        again = render_email(
            "email_verification.html.j2", "quill", values | {"welcome": False}
        )

        assert "Welcome to Quill!" in welcome["html_body"]
        assert "Welcome to Quill!" not in again["html_body"]
        assert "expires in 60 minutes" in again["text_body"]

    def test_account_invite_escapes_the_name_and_the_username(self) -> None:
        rendered = render_email(
            "account_invite.html.j2",
            "quill",
            {
                "name": "<b>Sam</b>",
                "username": "<i>sam</i>",
                "email": "sam@example.com",
                "setup_url": "https://example.com/s",
                "ttl_minutes": 30,
            },
        )

        assert "<b>Sam</b>" not in rendered["html_body"]
        assert "<i>sam</i>" not in rendered["html_body"]
        assert "&lt;b&gt;Sam&lt;/b&gt;" in rendered["html_body"]
        assert "&lt;i&gt;sam&lt;/i&gt;" in rendered["html_body"]
        assert "Hi <b>Sam</b>," in rendered["text_body"]
        assert "Your username is <i>sam</i>." in rendered["text_body"]
        assert rendered["subject"] == (
            "You're invited to Quill - set up your account"
        )

    @pytest.mark.parametrize(
        ("template", "link"),
        [
            ("email_verification.html.j2", "verify_url"),
            ("password_reset.html.j2", "reset_url"),
            ("account_invite.html.j2", "setup_url"),
        ],
    )
    def test_every_account_email_says_whose_account_and_where_it_went(
        self, template: str, link: str
    ) -> None:
        """Somebody reading several addresses in one mailbox can tell."""
        rendered = render_email(
            template,
            "quill",
            {
                "name": "Sam Patel",
                "username": "sam.patel",
                "email": "sam@example.com",
                link: "https://example.com/x",
                "ttl_minutes": 30,
                "welcome": False,
            },
        )

        for body in (rendered["html_body"], rendered["text_body"]):
            assert "Hi Sam Patel," in body
            assert "This email was sent to sam@example.com." in body

        # Bold in the HTML, so it can be found at a glance; plain text
        # has no bold to give.
        assert (
            "Your username is <strong>sam.patel</strong>."
            in rendered["html_body"]
        )
        assert "Your username is sam.patel." in rendered["text_body"]
