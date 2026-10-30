"""Tests for authentication endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import main
from app.email_send import (
    EmailNotAllowedError,
    EmailRateLimitError,
    EmailSendError,
)
from app.models import User
from app.security import generate_totp_secret
from tests.competencies import hold


def _csrf(client: TestClient) -> dict[str, str]:
    """The header a page sends with a request that changes something."""
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


class TestRegister:
    """Test user registration endpoint."""

    def test_register_success(self, test_client: TestClient):
        """Test successful user registration."""
        response = test_client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "SecurePassword123!",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"detail": "created"}

    def test_a_failed_email_creates_no_account(
        self,
        test_client: TestClient,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """No verification email, no account, and the address stays free.

        An account whose link never arrived cannot be recovered by the
        person who made it: the address is taken, so registering again
        is refused as a duplicate.
        """

        def _explode(**_kwargs: object) -> None:
            raise RuntimeError("mail server unreachable")

        monkeypatch.setattr(main, "send_email", _explode)

        response = test_client.post(
            "/api/auth/register",
            json={
                "username": "unreachable",
                "email": "unreachable@example.com",
                "password": "SecurePassword123!",
            },
        )

        assert response.status_code == 502, response.text
        assert (
            db_session.scalar(
                select(User).where(User.email == "unreachable@example.com")
            )
            is None
        )

    def test_the_address_can_be_registered_again_afterwards(
        self, test_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The point of rolling back: they can simply try again."""

        def _explode(**_kwargs: object) -> None:
            raise RuntimeError("down")

        monkeypatch.setattr(main, "send_email", _explode)

        payload = {
            "username": "retrying",
            "email": "retrying@example.com",
            "password": "SecurePassword123!",
        }
        assert (
            test_client.post("/api/auth/register", json=payload).status_code
            == 502
        )

        # The outage ends.
        monkeypatch.setattr(main, "send_email", lambda **_kwargs: None)

        assert (
            test_client.post("/api/auth/register", json=payload).status_code
            == 200
        )

    def test_a_rate_limited_address_is_a_429(
        self, test_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def _limited(**_kwargs: object) -> None:
            raise EmailRateLimitError("too many")

        monkeypatch.setattr(main, "send_email", _limited)

        response = test_client.post(
            "/api/auth/register",
            json={
                "username": "limited",
                "email": "limited@example.com",
                "password": "SecurePassword123!",
            },
        )

        assert response.status_code == 429, response.text

    def test_register_duplicate_username(
        self, test_client: TestClient, test_user: User
    ):
        """Test registration with existing username."""
        response = test_client.post(
            "/api/auth/register",
            json={
                "username": test_user.username,
                "email": "different@example.com",
                "password": "Password123!",
            },
        )
        assert response.status_code == 400
        assert "already in use" in response.json()["detail"].lower()

    def test_register_duplicate_email(
        self, test_client: TestClient, test_user: User
    ):
        """Test registration with existing email."""
        response = test_client.post(
            "/api/auth/register",
            json={
                "username": "differentuser",
                "email": test_user.email,
                "password": "Password123!",
            },
        )
        assert response.status_code == 400
        assert "already in use" in response.json()["detail"].lower()

    def test_register_password_too_short(self, test_client: TestClient):
        """Test registration with password too short."""
        response = test_client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "12345",  # Too short
            },
        )
        assert response.status_code == 400
        assert "at least 8 characters" in response.json()["detail"].lower()

    def test_register_missing_fields(self, test_client: TestClient):
        """Test registration with missing required fields."""
        response = test_client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                # Missing email and password
            },
        )
        assert response.status_code == 422  # Validation error


class TestLogin:
    """Test user login endpoint."""

    def test_login_success(self, test_client: TestClient, test_user: User):
        """Test successful login."""
        response = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPassword123!"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["detail"] == "ok"
        assert "user" in data
        assert data["user"]["username"] == "testuser"

        # Check cookies are set
        assert "access_token" in response.cookies
        assert "refresh_token" in response.cookies
        assert "XSRF-TOKEN" in response.cookies

    def test_login_makes_a_weaker_hash_again(
        self, test_client: TestClient, test_user: User, db_session: Session
    ):
        """A hash made under other parameters than the hasher's is
        replaced on a successful login, and the password still works.
        The suite's cheap hasher plays today's setting; a full-strength
        hash plays the one stored before a setting was raised."""
        from argon2 import PasswordHasher

        strong = PasswordHasher(time_cost=2, memory_cost=1024, parallelism=2)
        test_user.password_hash = strong.hash("TestPassword123!")
        db_session.commit()

        response = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPassword123!"},
        )

        assert response.status_code == 200
        db_session.refresh(test_user)
        assert "m=8,t=1,p=1" in test_user.password_hash
        assert (
            test_client.post(
                "/api/auth/login",
                json={"username": "testuser", "password": "TestPassword123!"},
            ).status_code
            == 200
        )

    def test_login_wrong_username(self, test_client: TestClient):
        """Test login with non-existent username."""
        response = test_client.post(
            "/api/auth/login",
            json={"username": "wronguser", "password": "Password123!"},
        )
        assert response.status_code == 400
        assert "invalid credentials" in response.json()["detail"].lower()

    def test_login_wrong_password(
        self, test_client: TestClient, test_user: User
    ):
        """Test login with incorrect password."""
        response = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "WrongPassword123!"},
        )
        assert response.status_code == 400
        assert "invalid credentials" in response.json()["detail"].lower()

    def test_login_inactive_user(
        self, test_client: TestClient, test_user: User, db_session
    ):
        """A deactivated account answers exactly as a wrong password does."""
        test_user.is_active = False
        db_session.commit()

        response = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPassword123!"},
        )
        wrong_password = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "WrongPassword123!"},
        )

        assert response.status_code == 400
        assert response.json() == wrong_password.json()
        assert "access_token" not in response.cookies
        assert "refresh_token" not in response.cookies

    def test_login_inactive_unverified_user_sends_no_email(
        self,
        test_client: TestClient,
        test_user: User,
        db_session,
        monkeypatch: pytest.MonkeyPatch,
    ):
        """No verification email goes to a deactivated account."""
        test_user.is_active = False
        test_user.email_verified = False
        db_session.commit()

        sent: list[object] = []
        monkeypatch.setattr(
            main, "send_email", lambda **kwargs: sent.append(kwargs)
        )

        response = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPassword123!"},
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid credentials"
        assert sent == []

    def test_login_with_totp_not_provided(
        self, test_client: TestClient, test_user: User, db_session
    ):
        """Test login when TOTP is enabled but code not provided."""
        # Enable TOTP
        test_user.totp_secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        db_session.commit()

        response = test_client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPassword123!"},
        )
        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["error_code"] == "two_factor_required"

    def test_login_with_invalid_totp(
        self, test_client: TestClient, test_user: User, db_session
    ):
        """Test login with invalid TOTP code."""
        # Enable TOTP
        test_user.totp_secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        db_session.commit()

        response = test_client.post(
            "/api/auth/login",
            json={
                "username": "testuser",
                "password": "TestPassword123!",
                "totp_code": "000000",
            },
        )
        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["error_code"] == "invalid_totp"

    def test_a_two_factor_code_signs_in_once_only(
        self, test_client: TestClient, test_user: User, db_session
    ):
        """RFC 6238 section 5.2: a code accepted once is refused after,
        so somebody who saw it typed cannot sign in with it too."""
        import pyotp

        test_user.totp_secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        db_session.commit()
        code = pyotp.TOTP(test_user.totp_secret).now()
        sign_in = {
            "username": "testuser",
            "password": "TestPassword123!",
            "totp_code": code,
        }

        first = test_client.post("/api/auth/login", json=sign_in)
        second = test_client.post("/api/auth/login", json=sign_in)

        assert first.status_code == 200
        assert second.status_code == 400
        assert second.json()["detail"]["error_code"] == "invalid_totp"

    def test_three_wrong_codes_lock_two_factor_sign_in(
        self, test_client: TestClient, test_user: User, db_session
    ):
        """After the third wrong code in a row, even the right code is
        refused until the lockout ends, so guessing gets nowhere."""
        import pyotp

        test_user.totp_secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        db_session.commit()
        totp = pyotp.TOTP(test_user.totp_secret)
        wrong = str((int(totp.now()) + 500_000) % 1_000_000).zfill(6)
        sign_in = {"username": "testuser", "password": "TestPassword123!"}

        for _ in range(3):
            refused = test_client.post(
                "/api/auth/login", json={**sign_in, "totp_code": wrong}
            )
            assert refused.json()["detail"]["error_code"] == "invalid_totp"

        locked = test_client.post(
            "/api/auth/login", json={**sign_in, "totp_code": totp.now()}
        )

        assert locked.status_code == 429
        assert locked.json()["detail"]["error_code"] == "totp_locked"
        assert "15 minutes" in locked.json()["detail"]["message"]

    def test_two_wrong_codes_then_the_right_one_signs_in(
        self, test_client: TestClient, test_user: User, db_session
    ):
        import pyotp

        test_user.totp_secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        db_session.commit()
        totp = pyotp.TOTP(test_user.totp_secret)
        wrong = str((int(totp.now()) + 500_000) % 1_000_000).zfill(6)
        sign_in = {"username": "testuser", "password": "TestPassword123!"}

        for _ in range(2):
            test_client.post(
                "/api/auth/login", json={**sign_in, "totp_code": wrong}
            )
        right = test_client.post(
            "/api/auth/login", json={**sign_in, "totp_code": totp.now()}
        )

        assert right.status_code == 200
        db_session.refresh(test_user)
        assert test_user.totp_failed_attempts == 0

    def test_an_unknown_username_still_costs_a_password_check(
        self, test_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        """Otherwise the time taken says which usernames exist."""
        spent: list[str] = []
        monkeypatch.setattr(main, "spend_password_check", spent.append)

        response = test_client.post(
            "/api/auth/login",
            json={"username": "nobody-here", "password": "a guess"},
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid credentials"
        assert spent == ["a guess"]


class TestLogout:
    """Test user logout endpoint."""

    def test_logout_success(self, authenticated_client: TestClient):
        """Test successful logout."""
        response = authenticated_client.post(
            "/api/auth/logout", headers=_csrf(authenticated_client)
        )
        assert response.status_code == 200
        assert response.json() == {"detail": "ok"}

        # Client cookies should no longer contain access token
        token = authenticated_client.cookies.get("access_token")
        assert token in (None, "")

    def test_logout_without_the_csrf_token_is_refused(
        self, authenticated_client: TestClient
    ):
        """Another site must not be able to sign somebody out."""
        response = authenticated_client.post("/api/auth/logout")

        assert response.status_code == 403
        assert authenticated_client.cookies.get("access_token")


class TestAuthMe:
    """Test /auth/me endpoint for getting current user."""

    def test_auth_me_authenticated(
        self, authenticated_client: TestClient, test_user: User
    ):
        """Test getting current user when authenticated."""
        response = authenticated_client.get("/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == test_user.username
        assert data["email"] == test_user.email
        assert "roles" in data
        assert "id" in data

    def test_auth_me_includes_competencies(
        self, authenticated_client: TestClient, test_user: User
    ):
        """Test /auth/me returns competencies list."""
        response = authenticated_client.get("/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert "competencies" in data
        assert isinstance(data["competencies"], list)

    def test_auth_me_competencies_populated(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test /auth/me returns additional competencies when set."""
        hold(test_user, "manage_teaching")
        db_session.commit()

        response = authenticated_client.get("/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert "manage_teaching" in data["competencies"]

    def test_auth_me_includes_platform_role(
        self, authenticated_client: TestClient, test_user: User
    ):
        """Test /auth/me exposes platform_role for the frontend guard."""
        response = authenticated_client.get("/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["platform_role"] == "standard"

    def test_auth_me_platform_role_reports_an_operator(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test /auth/me reports platform_role.

        Once asserted independence from ``system_permissions``, so the
        migration could not look finished while the two disagreed. That
        column is gone; the field itself still wants covering.
        """
        test_user.platform_role = "superadmin"
        db_session.commit()

        response = authenticated_client.get("/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["platform_role"] == "superadmin"

    def test_auth_me_unauthenticated(self, test_client: TestClient):
        """Test /auth/me without authentication."""
        response = test_client.get("/api/auth/me")
        assert response.status_code == 401


class TestRefreshToken:
    """Test token refresh endpoint."""

    def test_refresh_token_success(self, authenticated_client: TestClient):
        """Test successful token refresh."""
        response = authenticated_client.post("/api/auth/refresh")
        assert response.status_code == 200
        assert response.json() == {"detail": "refreshed"}

        # Client cookies should have been updated
        assert authenticated_client.cookies.get("access_token") is not None
        assert authenticated_client.cookies.get("refresh_token") is not None
        assert authenticated_client.cookies.get("XSRF-TOKEN") is not None

    def test_refresh_token_without_refresh_cookie(
        self, test_client: TestClient
    ):
        """Test refresh without valid refresh token cookie."""
        response = test_client.post("/api/auth/refresh")
        assert response.status_code == 401


class TestTOTPSetup:
    """Test TOTP setup endpoint."""

    def test_totp_setup_success(self, authenticated_client: TestClient):
        """Test TOTP setup returns provisioning URI."""
        response = authenticated_client.post(
            "/api/auth/totp/setup", headers=_csrf(authenticated_client)
        )
        assert response.status_code == 200
        data = response.json()
        assert "provision_uri" in data
        assert data["provision_uri"].startswith("otpauth://totp/")

    def test_totp_setup_without_the_csrf_token_is_refused(
        self, authenticated_client: TestClient
    ):
        """Setting up a second factor is a change to the account."""
        response = authenticated_client.post("/api/auth/totp/setup")

        assert response.status_code == 403
        assert response.json()["detail"] == "CSRF failed"

    def test_totp_setup_unauthenticated(self, test_client: TestClient):
        """Test TOTP setup without authentication."""
        response = test_client.post("/api/auth/totp/setup")
        assert response.status_code == 401

    def test_setup_once_two_factor_is_on_hands_out_no_secret(
        self, authenticated_client: TestClient, test_user: User, db_session
    ):
        """The enrolled secret is the second factor itself. A session
        alone must not be able to read it back."""
        test_user.totp_secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        db_session.commit()

        response = authenticated_client.post(
            "/api/auth/totp/setup", headers=_csrf(authenticated_client)
        )

        assert response.status_code == 409
        assert response.json()["detail"]["error_code"] == (
            "totp_already_enabled"
        )
        assert test_user.totp_secret not in response.text

    def test_setup_before_verifying_shows_the_same_secret_again(
        self, authenticated_client: TestClient
    ):
        """Not yet a factor, so reused: opening the page twice must not
        leave the QR code showing a secret that is no longer stored."""
        first = authenticated_client.post(
            "/api/auth/totp/setup", headers=_csrf(authenticated_client)
        )
        second = authenticated_client.post(
            "/api/auth/totp/setup", headers=_csrf(authenticated_client)
        )

        assert first.json()["provision_uri"] == second.json()["provision_uri"]

    def test_setup_works_again_after_two_factor_is_turned_off(
        self, authenticated_client: TestClient, test_user: User, db_session
    ):
        test_user.totp_secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        db_session.commit()
        old_secret = test_user.totp_secret

        authenticated_client.post(
            "/api/auth/totp/disable",
            json={"password": "TestPassword123!"},
            headers=_csrf(authenticated_client),
        )
        response = authenticated_client.post(
            "/api/auth/totp/setup", headers=_csrf(authenticated_client)
        )

        assert response.status_code == 200
        assert old_secret not in response.json()["provision_uri"]


class TestTOTPVerify:
    """Test TOTP verification endpoint."""

    def test_totp_verify_success(
        self, authenticated_client: TestClient, test_user: User, db_session
    ):
        """Test successful TOTP verification."""
        # Setup TOTP
        response = authenticated_client.post(
            "/api/auth/totp/setup", headers=_csrf(authenticated_client)
        )
        provision_uri = response.json()["provision_uri"]

        # Extract secret from provision_uri
        import re

        match = re.search(r"secret=([A-Z2-7]+)", provision_uri)
        assert match
        secret = match.group(1)

        # Generate valid code
        import pyotp

        totp = pyotp.TOTP(secret)
        valid_code = totp.now()

        # Verify code
        response = authenticated_client.post(
            "/api/auth/totp/verify",
            json={"code": valid_code},
            headers=_csrf(authenticated_client),
        )
        assert response.status_code == 200
        assert response.json()["detail"] == "enabled"

        # Verify in database
        db_session.refresh(test_user)
        assert test_user.is_totp_enabled is True
        assert test_user.totp_secret == secret

    def test_totp_verify_invalid_code(self, authenticated_client: TestClient):
        """Test TOTP verification with invalid code."""
        # Setup TOTP first
        authenticated_client.post(
            "/api/auth/totp/setup", headers=_csrf(authenticated_client)
        )

        # Try to verify with wrong code
        response = authenticated_client.post(
            "/api/auth/totp/verify",
            json={"code": "000000"},
            headers=_csrf(authenticated_client),
        )
        assert response.status_code == 400
        detail = response.json()["detail"]

        if isinstance(detail, dict):
            assert "invalid" in detail.get("message", "").lower()
            assert detail.get("error_code") == "invalid_totp"
        else:
            assert "invalid" in str(detail).lower()

    def test_totp_verify_unauthenticated(self, test_client: TestClient):
        """Test TOTP verification without authentication."""
        response = test_client.post(
            "/api/auth/totp/verify", json={"code": "123456"}
        )
        assert response.status_code == 401


class TestTOTPVerifyLockout:
    def test_three_wrong_codes_lock_enrolment_too(
        self, authenticated_client: TestClient
    ):
        """The verify route counts wrong codes the same way, so a stolen
        session cannot guess its way through enrolment either."""
        authenticated_client.post(
            "/api/auth/totp/setup", headers=_csrf(authenticated_client)
        )

        for _ in range(3):
            authenticated_client.post(
                "/api/auth/totp/verify",
                json={"code": "abcdef"},
                headers=_csrf(authenticated_client),
            )
        locked = authenticated_client.post(
            "/api/auth/totp/verify",
            json={"code": "123456"},
            headers=_csrf(authenticated_client),
        )

        assert locked.status_code == 429
        assert locked.json()["detail"]["error_code"] == "totp_locked"


class TestTOTPDisable:
    """Test TOTP disable endpoint."""

    def test_totp_disable_success(
        self, authenticated_client: TestClient, test_user: User, db_session
    ):
        """Test successful TOTP disable."""
        # Enable TOTP first
        test_user.totp_secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        db_session.commit()

        # Get CSRF token from cookies
        authenticated_client.get("/api/auth/me")
        csrf_token = authenticated_client.cookies.get("XSRF-TOKEN")

        # Disable TOTP (requires password re-entry)
        response = authenticated_client.post(
            "/api/auth/totp/disable",
            json={"password": "TestPassword123!"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert response.status_code == 200
        assert response.json()["detail"] == "disabled"

        # Verify in database
        db_session.refresh(test_user)
        assert test_user.is_totp_enabled is False
        assert test_user.totp_secret is None

    def test_totp_disable_wrong_password(
        self, authenticated_client: TestClient, test_user: User, db_session
    ):
        """Test TOTP disable with wrong password."""
        test_user.totp_secret = generate_totp_secret()
        test_user.is_totp_enabled = True
        db_session.commit()

        authenticated_client.get("/api/auth/me")
        csrf_token = authenticated_client.cookies.get("XSRF-TOKEN")

        response = authenticated_client.post(
            "/api/auth/totp/disable",
            json={"password": "wrong_password1"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert response.status_code == 400

    def test_totp_disable_without_csrf(self, authenticated_client: TestClient):
        """Test TOTP disable without CSRF token."""
        response = authenticated_client.post(
            "/api/auth/totp/disable",
            json={"password": "TestPassword123!"},
        )
        assert response.status_code == 403

    def test_totp_disable_unauthenticated(self, test_client: TestClient):
        """Test TOTP disable without authentication."""
        response = test_client.post(
            "/api/auth/totp/disable",
            json={"password": "TestPassword123!"},
        )
        assert response.status_code == 401


class TestForgotPassword:
    """Test forgot-password endpoint."""

    def test_forgot_password_existing_email(
        self, test_client: TestClient, test_user: User
    ):
        """Test forgot-password with existing email returns ok."""
        response = test_client.post(
            "/api/auth/forgot-password",
            json={"email": test_user.email},
        )
        assert response.status_code == 200
        assert response.json() == {"detail": "ok"}

    def test_forgot_password_nonexistent_email(self, test_client: TestClient):
        """Test forgot-password with unknown email still returns ok (no enumeration)."""
        response = test_client.post(
            "/api/auth/forgot-password",
            json={"email": "nobody@example.com"},
        )
        assert response.status_code == 200
        assert response.json() == {"detail": "ok"}

    def test_forgot_password_case_insensitive(
        self, test_client: TestClient, test_user: User
    ):
        """Test forgot-password normalises email to lowercase."""
        response = test_client.post(
            "/api/auth/forgot-password",
            json={"email": test_user.email.upper()},
        )
        assert response.status_code == 200
        assert response.json() == {"detail": "ok"}

    def test_forgot_password_inactive_user_sends_no_email(
        self,
        test_client: TestClient,
        test_user: User,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ):
        """A deactivated account is treated as an unknown address."""
        test_user.is_active = False
        db_session.commit()

        sent: list[object] = []
        monkeypatch.setattr(
            main, "send_email", lambda **kwargs: sent.append(kwargs)
        )

        response = test_client.post(
            "/api/auth/forgot-password",
            json={"email": test_user.email},
        )

        assert response.status_code == 200
        assert response.json() == {"detail": "ok"}
        assert sent == []


class TestForgotPasswordEmails:
    """What each address is sent, while the reply stays the same for all.

    The page says "check your inbox" whatever the address, so it never
    shows who has an account. The email says what is true, as the OWASP
    Forgot Password Cheat Sheet advises.
    """

    @staticmethod
    def _ask(
        test_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
        email: str,
    ) -> tuple[dict[str, object], list[dict[str, object]]]:
        sent: list[dict[str, object]] = []
        monkeypatch.setattr(
            main, "send_email", lambda **kwargs: sent.append(kwargs)
        )

        response = test_client.post(
            "/api/auth/forgot-password", json={"email": email}
        )
        assert response.status_code == 200

        return response.json(), sent

    def test_an_address_with_no_account_is_told_how_to_register(
        self, test_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ):
        reply, sent = self._ask(test_client, monkeypatch, "nobody@example.com")

        assert reply == {"detail": "ok"}
        assert len(sent) == 1
        assert sent[0]["to"] == "nobody@example.com"
        assert sent[0]["subject"] == "You do not have a Quill account yet"
        assert "/register" in str(sent[0]["html_body"])
        assert "/reset-password" not in str(sent[0]["html_body"])

    def test_an_unconfirmed_address_is_sent_confirm_and_set(
        self,
        test_client: TestClient,
        test_user: User,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ):
        test_user.email_verified = False
        db_session.commit()

        reply, sent = self._ask(test_client, monkeypatch, test_user.email)

        assert reply == {"detail": "ok"}
        assert len(sent) == 1
        assert sent[0]["subject"] == (
            "Confirm your email and set your Quill password"
        )
        assert "/reset-password?token=" in str(sent[0]["text_body"])
        assert "&confirm=1" in str(sent[0]["text_body"])

    def test_a_confirmed_address_is_sent_the_reset(
        self,
        test_client: TestClient,
        test_user: User,
        monkeypatch: pytest.MonkeyPatch,
    ):
        _reply, sent = self._ask(test_client, monkeypatch, test_user.email)

        assert sent[0]["subject"] == "Reset your Quill password"
        assert "confirm=1" not in str(sent[0]["text_body"])

    def test_every_address_gets_the_same_reply(
        self,
        test_client: TestClient,
        test_user: User,
        monkeypatch: pytest.MonkeyPatch,
    ):
        known, _ = self._ask(test_client, monkeypatch, test_user.email)
        unknown, _ = self._ask(test_client, monkeypatch, "x@example.com")

        assert known == unknown

    @pytest.mark.parametrize(
        "error",
        [
            EmailRateLimitError("limited"),
            EmailNotAllowedError("not allowed"),
            EmailSendError("down"),
        ],
    )
    def test_a_failed_send_still_answers_ok(
        self,
        test_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
        error: Exception,
    ):
        """A send that fails must not show the address has an account."""

        def refuse(**_kwargs: object) -> None:
            raise error

        monkeypatch.setattr(main, "send_email", refuse)

        response = test_client.post(
            "/api/auth/forgot-password", json={"email": "nobody@example.com"}
        )

        assert response.status_code == 200
        assert response.json() == {"detail": "ok"}


class TestResetPassword:
    """Test reset-password endpoint."""

    def test_a_reset_confirms_the_address(
        self, test_client: TestClient, test_user: User, db_session: Session
    ):
        """Following a link sent to the address proves it is theirs, so
        signing in straight afterwards is not refused as unconfirmed."""
        from app.security import create_password_reset_token

        test_user.email_verified = False
        db_session.commit()
        token = create_password_reset_token(
            test_user.email, test_user.token_version
        )

        response = test_client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "ConfirmedPass123!"},
        )

        assert response.status_code == 200
        db_session.refresh(test_user)
        assert test_user.email_verified is True
        signed_in = test_client.post(
            "/api/auth/login",
            json={
                "username": test_user.username,
                "password": "ConfirmedPass123!",
            },
        )
        assert signed_in.status_code == 200

    def test_reset_password_inactive_user(
        self, test_client: TestClient, test_user: User, db_session: Session
    ):
        """A link sent before deactivation is refused as an expired one."""
        from app.security import create_password_reset_token

        token = create_password_reset_token(
            test_user.email, test_user.token_version
        )
        test_user.is_active = False
        db_session.commit()
        old_hash = test_user.password_hash

        response = test_client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "NewSecurePass123!"},
        )

        assert response.status_code == 400
        assert "invalid or expired" in response.json()["detail"].lower()
        db_session.refresh(test_user)
        assert test_user.password_hash == old_hash

    def test_reset_password_success(
        self, test_client: TestClient, test_user: User
    ):
        """Test successful password reset with valid token."""
        from app.security import create_password_reset_token

        token = create_password_reset_token(
            test_user.email, test_user.token_version
        )
        response = test_client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "NewSecurePass123!"},
        )
        assert response.status_code == 200
        assert response.json() == {"detail": "Password reset successfully"}

        # Verify new password works for login
        response = test_client.post(
            "/api/auth/login",
            json={
                "username": test_user.username,
                "password": "NewSecurePass123!",
            },
        )
        assert response.status_code == 200

    def test_reset_link_is_spent_once_used(
        self, test_client: TestClient, test_user: User, db_session: Session
    ):
        """A link names the token_version it was made under. The reset
        moves that on, so opening the same link again is refused as an
        expired one would be, and the password set the first time
        stays."""
        from app.security import create_password_reset_token

        token = create_password_reset_token(
            test_user.email, test_user.token_version
        )
        first = test_client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "FirstPass123!"},
        )
        assert first.status_code == 200
        db_session.refresh(test_user)
        hash_after_first = test_user.password_hash

        second = test_client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "SecondPass123!"},
        )

        assert second.status_code == 400
        assert "invalid or expired" in second.json()["detail"].lower()
        db_session.refresh(test_user)
        assert test_user.password_hash == hash_after_first

    def test_reset_password_invalid_token(self, test_client: TestClient):
        """Test reset-password with invalid token."""
        response = test_client.post(
            "/api/auth/reset-password",
            json={"token": "bad-token", "new_password": "NewPassword123!"},
        )
        assert response.status_code == 400
        assert "invalid or expired" in response.json()["detail"].lower()

    def test_reset_password_too_short(
        self, test_client: TestClient, test_user: User
    ):
        """Test reset-password rejects passwords shorter than 8 chars."""
        from app.security import create_password_reset_token

        token = create_password_reset_token(
            test_user.email, test_user.token_version
        )
        response = test_client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "short"},
        )
        assert response.status_code == 400
        assert "8 characters" in response.json()["detail"]

    def test_reset_password_expired_token(
        self, test_client: TestClient, test_user: User
    ):
        """Test reset-password with expired token."""
        from unittest.mock import patch

        from app.security import create_password_reset_token

        token = create_password_reset_token(
            test_user.email, test_user.token_version
        )

        # Patch verify to simulate expired token (max_age=0 seconds)
        with patch("app.main.verify_password_reset_token", return_value=None):
            response = test_client.post(
                "/api/auth/reset-password",
                json={
                    "token": token,
                    "new_password": "NewPassword123!",
                },
            )
        assert response.status_code == 400
        assert "invalid or expired" in response.json()["detail"].lower()
