"""Tests for security module (password hashing, JWT, CSRF, TOTP)."""

from datetime import UTC, datetime, timedelta

import pyotp
import pytest
from jose import JWTError, jwt

from app.config import settings
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_totp_secret,
    hash_password,
    make_csrf,
    totp_provisioning_uri,
    verify_csrf,
    verify_password,
    verify_totp_code,
)


class TestPasswordHashing:
    """Test password hashing and verification."""

    def test_hash_password(self):
        """Test password hashing produces different hashes."""
        password = "TestPassword123!"
        hash1 = hash_password(password)
        hash2 = hash_password(password)

        # Hashes should be different (salt is random)
        assert hash1 != hash2
        # Both should verify
        assert verify_password(password, hash1)
        assert verify_password(password, hash2)

    def test_verify_password_success(self):
        """Test password verification with correct password."""
        password = "CorrectPassword123"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_verify_password_failure(self):
        """Test password verification with incorrect password."""
        password = "CorrectPassword123"
        wrong_password = "WrongPassword456"
        hashed = hash_password(password)
        assert verify_password(wrong_password, hashed) is False

    def test_hash_empty_password(self):
        """Test hashing empty password."""
        # Should not raise exception
        hashed = hash_password("")
        assert hashed
        assert verify_password("", hashed) is True


class TestJWTTokens:
    """Test JWT token creation and decoding."""

    def test_create_access_token(self):
        """Test access token creation."""
        username = "testuser"
        roles = ["Clinician", "Admin"]
        token = create_access_token(username, roles)

        # Decode and verify payload
        decoded = decode_token(token)
        assert decoded["sub"] == username
        assert decoded["roles"] == roles
        assert "exp" in decoded

        # Verify expiration is in the future
        exp_time = datetime.fromtimestamp(decoded["exp"], UTC)
        assert exp_time > datetime.now(UTC)

    def test_create_refresh_token(self):
        """Test refresh token creation."""
        username = "testuser"
        token = create_refresh_token(username)

        # Decode and verify payload
        decoded = decode_token(token)
        assert decoded["sub"] == username
        assert decoded["type"] == "refresh"
        assert "exp" in decoded

        # Verify expiration is in the future
        exp_time = datetime.fromtimestamp(decoded["exp"], UTC)
        assert exp_time > datetime.now(UTC)

    def test_decode_token_expired(self):
        """Test decoding an expired token raises exception."""
        # Create token that expired 1 day ago
        payload = {
            "sub": "testuser",
            "roles": [],
            "exp": datetime.now(UTC) - timedelta(days=1),
        }
        token = jwt.encode(
            payload,
            settings.JWT_SECRET.get_secret_value(),
            algorithm=settings.JWT_ALG,
        )

        # Should raise JWTError
        with pytest.raises(JWTError):
            decode_token(token)

    def test_decode_token_invalid_signature(self):
        """Test decoding token with invalid signature raises exception."""
        # Create token with wrong secret
        payload = {
            "sub": "testuser",
            "roles": [],
            "exp": datetime.now(UTC) + timedelta(minutes=15),
        }
        token = jwt.encode(
            payload,
            "wrong_secret",
            algorithm=settings.JWT_ALG,
        )

        # Should raise JWTError
        with pytest.raises(JWTError):
            decode_token(token)

    def test_token_expiration_times(self):
        """Test tokens have correct expiration times."""
        username = "testuser"

        # Access token should expire in ACCESS_TTL_MIN minutes
        access_token = create_access_token(username, [])
        decoded_access = decode_token(access_token)
        access_exp = datetime.fromtimestamp(decoded_access["exp"], UTC)
        expected_access_exp = datetime.now(UTC) + timedelta(
            minutes=settings.ACCESS_TTL_MIN
        )
        # Allow 5 second difference for test execution time
        assert abs((access_exp - expected_access_exp).total_seconds()) < 5

        # Refresh token should expire in REFRESH_TTL_DAYS days
        refresh_token = create_refresh_token(username)
        decoded_refresh = decode_token(refresh_token)
        refresh_exp = datetime.fromtimestamp(decoded_refresh["exp"], UTC)
        expected_refresh_exp = datetime.now(UTC) + timedelta(
            days=settings.REFRESH_TTL_DAYS
        )
        # Allow 5 second difference for test execution time
        assert abs((refresh_exp - expected_refresh_exp).total_seconds()) < 5


class TestCSRF:
    """Test CSRF token creation and verification."""

    def test_make_csrf_token(self):
        """Test CSRF token creation."""
        username = "testuser"
        token = make_csrf(username)
        assert token
        assert isinstance(token, str)

    def test_verify_csrf_success(self):
        """Test CSRF verification with correct token."""
        username = "testuser"
        token = make_csrf(username)
        assert verify_csrf(token, username) is True

    def test_verify_csrf_wrong_user(self):
        """Test CSRF verification with wrong username."""
        token = make_csrf("user1")
        assert verify_csrf(token, "user2") is False

    def test_verify_csrf_invalid_token(self):
        """Test CSRF verification with invalid token."""
        assert verify_csrf("invalid_token_string", "testuser") is False

    def test_csrf_tokens_are_different(self):
        """Test that CSRF tokens for different users are different."""
        token1 = make_csrf("user1")
        token2 = make_csrf("user2")
        assert token1 != token2

    def test_csrf_token_consistent(self):
        """Test that CSRF tokens are consistent for same user."""
        username = "testuser"
        token1 = make_csrf(username)
        token2 = make_csrf(username)
        # Both should be valid
        assert verify_csrf(token1, username) is True
        assert verify_csrf(token2, username) is True


class TestTOTP:
    """Test TOTP (Time-based One-Time Password) functions."""

    def test_generate_totp_secret(self):
        """Test TOTP secret generation."""
        secret = generate_totp_secret()
        assert secret
        assert isinstance(secret, str)
        assert len(secret) == 32  # pyotp default is 32 characters

    def test_generate_unique_secrets(self):
        """Test that generated secrets are unique."""
        secret1 = generate_totp_secret()
        secret2 = generate_totp_secret()
        assert secret1 != secret2

    def test_totp_provisioning_uri(self):
        """Test TOTP provisioning URI generation."""
        secret = generate_totp_secret()
        username = "testuser"
        issuer = "QuillMedical"

        uri = totp_provisioning_uri(secret, username, issuer)

        assert uri.startswith("otpauth://totp/")
        assert username in uri
        assert secret in uri
        assert issuer in uri

    def test_totp_provisioning_uri_no_issuer(self):
        """Test TOTP provisioning URI without issuer."""
        secret = generate_totp_secret()
        username = "testuser"

        uri = totp_provisioning_uri(secret, username)

        assert uri.startswith("otpauth://totp/")
        assert username in uri
        assert secret in uri

    def test_verify_totp_code_success(self):
        """Test TOTP code verification with correct code."""
        secret = generate_totp_secret()
        totp = pyotp.TOTP(secret)
        current_code = totp.now()

        assert verify_totp_code(secret, current_code) is True

    def test_verify_totp_code_failure(self):
        """Test TOTP code verification with incorrect code."""
        secret = generate_totp_secret()
        wrong_code = "000000"

        assert verify_totp_code(secret, wrong_code) is False

    def test_verify_totp_code_invalid_secret(self):
        """Test TOTP code verification with invalid secret."""
        # Should return False, not raise exception
        assert verify_totp_code("invalid_secret", "123456") is False

    def test_verify_totp_code_exception_handling(self):
        """Test TOTP code verification handles exceptions gracefully."""
        # Empty secret should trigger exception path
        assert verify_totp_code("", "123456") is False

    def test_verify_totp_code_invalid_input(self):
        """Test TOTP code verification with invalid input."""
        secret = generate_totp_secret()
        # Non-numeric code
        assert verify_totp_code(secret, "abcdef") is False
        # Too short
        assert verify_totp_code(secret, "123") is False

    def test_totp_code_expires(self):
        """Test that TOTP codes are time-based."""
        secret = generate_totp_secret()
        totp = pyotp.TOTP(secret)

        # Get code for a past time (more than 30 seconds ago)
        past_code = totp.at(datetime.now(UTC) - timedelta(seconds=60))

        # Old code should not verify (outside valid_window)
        # Note: valid_window=1 in verify_totp_code allows ±30 seconds
        # So we need to go further back
        assert verify_totp_code(secret, past_code) is False
