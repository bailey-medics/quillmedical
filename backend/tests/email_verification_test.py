"""Tests for email verification flow."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.security import (
    create_email_verify_token,
    hash_password,
    verify_email_verify_token,
)


class TestRegisterSendsVerificationEmail:
    """Registration should create unverified user and send email."""

    def test_register_creates_unverified_user(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """New user has email_verified=False."""
        with patch("app.main.send_email") as mock_send:
            resp = test_client.post(
                "/api/auth/register",
                json={
                    "username": "newuser",
                    "email": "new@example.com",
                    "password": "StrongPass1!",
                },
            )
        assert resp.status_code == 200
        user = db_session.scalar(
            select(User).where(User.username == "newuser")
        )
        assert user is not None
        assert user.email_verified is False
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args.kwargs
        assert call_kwargs["to"] == "new@example.com"
        assert "verify" in call_kwargs["subject"].lower()


class TestLoginBlocksUnverified:
    """Login should reject unverified users with error_code."""

    def test_login_rejects_unverified_user(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Unverified user gets 403 with email_not_verified code."""
        user = User(
            username="unverified",
            email="unverified@example.com",
            password_hash=hash_password("TestPass123!"),
            is_active=True,
            email_verified=False,
        )
        db_session.add(user)
        db_session.commit()

        resp = test_client.post(
            "/api/auth/login",
            json={"username": "unverified", "password": "TestPass123!"},
        )
        assert resp.status_code == 403
        detail = resp.json()["detail"]
        assert detail["error_code"] == "email_not_verified"
        assert detail["email"] == "unverified@example.com"

    def test_login_allows_verified_user(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Verified user can log in normally."""
        user = User(
            username="verified",
            email="verified@example.com",
            password_hash=hash_password("TestPass123!"),
            is_active=True,
            email_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        resp = test_client.post(
            "/api/auth/login",
            json={"username": "verified", "password": "TestPass123!"},
        )
        assert resp.status_code == 200


class TestVerifyEmailEndpoint:
    """POST /auth/verify-email tests."""

    def test_valid_token_verifies_user(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Valid token marks user as verified."""
        user = User(
            username="pending",
            email="pending@example.com",
            password_hash=hash_password("TestPass123!"),
            is_active=True,
            email_verified=False,
        )
        db_session.add(user)
        db_session.commit()

        token = create_email_verify_token("pending@example.com")
        resp = test_client.post(
            "/api/auth/verify-email", json={"token": token}
        )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "verified"

        db_session.refresh(user)
        assert user.email_verified is True

    def test_invalid_token_rejected(self, test_client: TestClient) -> None:
        """Invalid token returns 400."""
        resp = test_client.post(
            "/api/auth/verify-email", json={"token": "bogus-token"}
        )
        assert resp.status_code == 400

    def test_already_verified_is_idempotent(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Already-verified user still gets success response."""
        user = User(
            username="alreadyok",
            email="alreadyok@example.com",
            password_hash=hash_password("TestPass123!"),
            is_active=True,
            email_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        token = create_email_verify_token("alreadyok@example.com")
        resp = test_client.post(
            "/api/auth/verify-email", json={"token": token}
        )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "verified"


class TestResendVerificationEndpoint:
    """POST /auth/resend-verification tests."""

    def test_resend_for_unverified_user_sends_email(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Resend sends email for unverified user."""
        user = User(
            username="resendme",
            email="resend@example.com",
            password_hash=hash_password("TestPass123!"),
            is_active=True,
            email_verified=False,
        )
        db_session.add(user)
        db_session.commit()

        with patch("app.main.send_email") as mock_send:
            resp = test_client.post(
                "/api/auth/resend-verification",
                json={"email": "resend@example.com"},
            )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "ok"
        mock_send.assert_called_once()

    def test_resend_for_verified_user_does_not_send(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Resend does not send for already-verified user."""
        user = User(
            username="alreadydone",
            email="done@example.com",
            password_hash=hash_password("TestPass123!"),
            is_active=True,
            email_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        with patch("app.main.send_email") as mock_send:
            resp = test_client.post(
                "/api/auth/resend-verification",
                json={"email": "done@example.com"},
            )
        assert resp.status_code == 200
        mock_send.assert_not_called()

    def test_resend_for_nonexistent_user_returns_ok(
        self, test_client: TestClient
    ) -> None:
        """Resend returns ok for unknown email (no enumeration)."""
        with patch("app.main.send_email") as mock_send:
            resp = test_client.post(
                "/api/auth/resend-verification",
                json={"email": "nobody@example.com"},
            )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "ok"
        mock_send.assert_not_called()


class TestEmailVerifyTokens:
    """Unit tests for token creation/verification."""

    def test_roundtrip(self) -> None:
        """Token can be created and verified."""
        token = create_email_verify_token("user@example.com")
        result = verify_email_verify_token(token)
        assert result == "user@example.com"

    def test_invalid_token_returns_none(self) -> None:
        """Garbage token returns None."""
        result = verify_email_verify_token("not-a-real-token")
        assert result is None

    def test_email_normalised(self) -> None:
        """Email is lowercased and stripped."""
        token = create_email_verify_token("  USER@Example.COM  ")
        result = verify_email_verify_token(token)
        assert result == "user@example.com"
