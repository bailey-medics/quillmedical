"""Tests for security module (password hashing, JWT, CSRF, TOTP)."""

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from unittest.mock import patch

import jwt
import pyotp
import pytest
from argon2 import PasswordHasher, Type
from itsdangerous import URLSafeTimedSerializer

from app.config import settings
from app.security import (
    SessionClaims,
    TokenNotAcceptable,
    create_access_token,
    create_email_verify_token,
    create_password_reset_token,
    create_refresh_token,
    decode_refresh_token,
    decode_token,
    generate_totp_secret,
    hash_password,
    make_csrf,
    password_needs_rehash,
    totp_provisioning_uri,
    totp_step_matched,
    verify_csrf,
    verify_email_verify_token,
    verify_password,
    verify_password_reset_token,
)


def _raw(token: str) -> dict[str, Any]:
    """Every claim a token carries, read past the decoder.

    For tests of what a token is made with. The decoders hand back only
    the claims a caller uses, so the expiry and the type are read here.
    """
    claims: dict[str, Any] = jwt.decode(
        token,
        settings.JWT_SECRET.get_secret_value(),
        algorithms=[settings.JWT_ALG],
    )

    return claims


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
        """Test hashing empty password raises ValueError."""
        # Defensive programming: empty passwords should be rejected
        with pytest.raises(ValueError, match="Password cannot be empty"):
            hash_password("")


class TestProductionPasswordHasher:
    """The suite hashes cheaply; production must not.

    conftest.py swaps the hasher for a cheap one so the tests run quickly.
    These pin what a deployment uses, so weakening it fails here.
    """

    def test_production_hasher_keeps_the_strong_parameters(
        self, production_password_hasher: PasswordHasher
    ) -> None:
        """Argon2id at argon2-cffi's defaults, as security.py documents."""
        assert production_password_hasher.type is Type.ID
        assert production_password_hasher.time_cost == 3
        assert production_password_hasher.memory_cost == 65536
        assert production_password_hasher.parallelism == 4

    def test_production_hash_carries_those_parameters(
        self, production_password_hasher: PasswordHasher
    ) -> None:
        """What is written to the database says how it was made."""
        hashed = production_password_hasher.hash("TestPassword123!")

        assert hashed.startswith("$argon2id$")
        assert "m=65536,t=3,p=4" in hashed

    def test_production_hash_verifies_in_the_test_process(
        self, production_password_hasher: PasswordHasher
    ) -> None:
        """verify_password reads the parameters from the hash, so a hash
        made at full strength still verifies with the cheap hasher in
        place, and a wrong password is still refused."""
        hashed = production_password_hasher.hash("TestPassword123!")

        assert verify_password("TestPassword123!", hashed)
        assert not verify_password("WrongPassword123!", hashed)

    def test_a_hash_under_other_parameters_needs_making_again(
        self, production_password_hasher: PasswordHasher
    ) -> None:
        """The suite's cheap hasher stands in for a raised setting: a
        hash made under different parameters reports it, and one made
        under the current ones does not."""
        assert password_needs_rehash(production_password_hasher.hash("pw"))
        assert not password_needs_rehash(hash_password("pw"))

    def test_an_empty_hash_is_refused(self) -> None:
        with pytest.raises(ValueError, match="cannot be empty"):
            password_needs_rehash("")

    def test_the_suite_itself_hashes_cheaply(self) -> None:
        """The other half: without this the speed-up could quietly go."""
        assert "m=8,t=1,p=1" in hash_password("TestPassword123!")


class TestJWTTokens:
    """Test JWT token creation and decoding."""

    def test_create_access_token(self):
        """Test access token creation."""
        username = "testuser"
        token = create_access_token(username, 3)

        assert decode_token(token) == SessionClaims(username, 3)

    def test_access_token_names_the_user_and_nothing_more(self):
        """Roles and competencies are read from the database on every
        request, never from the cookie, so the token does not carry
        them: a claim that crept back in would grow the cookie with
        every competency granted."""
        decoded = _raw(create_access_token("testuser"))

        assert set(decoded) == {"sub", "type", "tv", "exp"}

        # Verify expiration is in the future
        exp_time = datetime.fromtimestamp(decoded["exp"], UTC)
        assert exp_time > datetime.now(UTC)

    def test_create_refresh_token_refuses_an_empty_subject(self):
        with pytest.raises(ValueError, match="cannot be empty"):
            create_refresh_token("   ")

    def test_create_refresh_token(self):
        """Test refresh token creation."""
        username = "testuser"
        token = create_refresh_token(username)

        assert decode_refresh_token(token) == SessionClaims(username, 0)

        decoded = _raw(token)
        assert decoded["type"] == "refresh"

        # Verify expiration is in the future
        exp_time = datetime.fromtimestamp(decoded["exp"], UTC)
        assert exp_time > datetime.now(UTC)

    def test_decode_token_expired(self):
        """Test decoding an expired token raises exception."""
        # Create token that expired 1 day ago
        payload = {
            "sub": "testuser",
            "type": "access",
            "exp": datetime.now(UTC) - timedelta(days=1),
        }
        token = jwt.encode(
            payload,
            settings.JWT_SECRET.get_secret_value(),
            algorithm=settings.JWT_ALG,
        )

        # Should be refused
        with pytest.raises(TokenNotAcceptable):
            decode_token(token)

    def test_decode_token_invalid_signature(self):
        """Test decoding token with invalid signature raises exception."""
        # Create token with wrong secret
        payload = {
            "sub": "testuser",
            "type": "access",
            "exp": datetime.now(UTC) + timedelta(minutes=15),
        }
        token = jwt.encode(
            payload,
            "wrong_secret",
            algorithm=settings.JWT_ALG,
        )

        # Should be refused
        with pytest.raises(TokenNotAcceptable):
            decode_token(token)

    def test_token_expiration_times(self):
        """Test tokens have correct expiration times."""
        username = "testuser"

        # Access token should expire in ACCESS_TTL_MIN minutes
        access_token = create_access_token(username)
        decoded_access = _raw(access_token)
        access_exp = datetime.fromtimestamp(decoded_access["exp"], UTC)
        expected_access_exp = datetime.now(UTC) + timedelta(
            minutes=settings.ACCESS_TTL_MIN
        )
        # Allow 5 second difference for test execution time
        assert abs((access_exp - expected_access_exp).total_seconds()) < 5

        # Refresh token should expire in REFRESH_TTL_DAYS days
        refresh_token = create_refresh_token(username)
        decoded_refresh = _raw(refresh_token)
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

    def test_make_csrf_refuses_an_empty_subject(self):
        with pytest.raises(ValueError, match="cannot be empty"):
            make_csrf("")

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

    def test_verify_csrf_accepts_a_non_ascii_username(self):
        """The subjects are compared as bytes, so a name outside ASCII
        is not a TypeError from ``hmac.compare_digest``."""
        username = "zoë"
        assert verify_csrf(make_csrf(username), username) is True

    def test_verify_csrf_refuses_a_token_that_names_no_subject(self):
        """A good signature over the wrong shape is still refused."""
        from app.security import _csrf

        assert verify_csrf(_csrf.dumps(["not", "a", "dict"]), "u") is False
        assert verify_csrf(_csrf.dumps({"sub": 7}), "7") is False

    def test_verify_csrf_does_not_swallow_a_fault_in_our_code(self):
        """Only a bad signature reads as a wrong token. Anything else
        raised in the check is a bug, and must surface."""
        with pytest.raises(TypeError):
            verify_csrf(cast(str, None), "testuser")


class TestTimedTokens:
    """Password reset and email verification tokens."""

    def test_reset_token_tampered_is_refused(self):
        token = create_password_reset_token("ada@example.com", 0)
        assert verify_password_reset_token(token + "x") is None

    def test_reset_token_expired_is_refused(self):
        """A lifetime below zero makes any token too old, which is the
        same ``SignatureExpired`` an old one raises."""
        token = create_password_reset_token("ada@example.com", 0)
        with patch.object(settings, "PASSWORD_RESET_TTL_MIN", -1):
            assert verify_password_reset_token(token) is None

    def test_verify_token_tampered_is_refused(self):
        token = create_email_verify_token("ada@example.com")
        assert verify_email_verify_token(token + "x") is None

    def test_verify_token_expired_is_refused(self):
        token = create_email_verify_token("ada@example.com")
        with patch.object(settings, "EMAIL_VERIFY_TTL_MIN", -1):
            assert verify_email_verify_token(token) is None

    @pytest.mark.parametrize(
        "payload",
        ["ada@example.com", ["ada@example.com"], {}, {"email": 7}],
        ids=["a bare string", "a list", "no address", "a number"],
    )
    def test_verify_token_without_an_address_is_refused(
        self, payload: object
    ) -> None:
        """Signed with our key and salt, so only a fault in our own code
        could make one. It is refused, rather than raising or handing
        back something that is not an address."""
        token = URLSafeTimedSerializer(
            settings.JWT_SECRET.get_secret_value(), salt="email-verify"
        ).dumps(payload)

        assert verify_email_verify_token(token) is None


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

    def test_totp_step_matched_success(self):
        """Test TOTP code verification with correct code."""
        secret = generate_totp_secret()
        totp = pyotp.TOTP(secret)
        current_code = totp.now()

        assert totp_step_matched(secret, current_code) is not None

    def test_totp_step_matched_failure(self):
        """Test TOTP code verification with incorrect code."""
        secret = generate_totp_secret()
        wrong_code = "000000"

        assert totp_step_matched(secret, wrong_code) is None

    def test_totp_step_matched_invalid_secret(self):
        """A secret that is not Base32 is refused, not raised on. That
        is the one error ``totp_step_matched`` catches."""
        assert totp_step_matched("invalid_secret", "123456") is None
        assert totp_step_matched("not base32!", "123456") is None

    def test_totp_step_matched_exception_handling(self):
        """Test TOTP code verification handles exceptions gracefully."""
        # Empty secret should trigger exception path
        assert totp_step_matched("", "123456") is None

    def test_totp_step_matched_invalid_input(self):
        """Test TOTP code verification with invalid input."""
        secret = generate_totp_secret()
        # Non-numeric code
        assert totp_step_matched(secret, "abcdef") is None
        # Too short
        assert totp_step_matched(secret, "123") is None

    def test_totp_code_expires(self):
        """Test that TOTP codes are time-based."""
        secret = generate_totp_secret()
        totp = pyotp.TOTP(secret)
        moment = datetime(2026, 10, 16, 12, 0, 15, tzinfo=UTC)

        # Two steps back, a minute ago, is outside the window of one step
        # either side, so it is refused.
        past_code = totp.at(moment - timedelta(seconds=60))

        assert totp_step_matched(secret, past_code, at=moment) is None

    @pytest.mark.parametrize("steps_away", [-1, 1], ids=["before", "after"])
    def test_a_code_one_step_either_side_is_accepted(
        self, steps_away: int
    ) -> None:
        """RFC 6238 section 5.2: one step for network delay, so a code
        typed just before the step rolls over still works."""
        secret = generate_totp_secret()
        moment = datetime(2026, 10, 16, 12, 0, 15, tzinfo=UTC)
        now = int(moment.timestamp() // 30)
        code = pyotp.TOTP(secret).generate_otp(now + steps_away)

        assert totp_step_matched(secret, code, at=moment) == now + steps_away

    @pytest.mark.parametrize("steps_away", [-2, 2], ids=["before", "after"])
    def test_a_code_two_steps_away_is_refused(self, steps_away: int) -> None:
        # A fixed secret and moment, so the digits are the same every
        # run: two steps can give the same six by chance, and these are
        # checked not to.
        secret = "JBSWY3DPEHPK3PXP"  # nosec B105 - a test's own secret
        moment = datetime(2026, 10, 16, 12, 0, 15, tzinfo=UTC)
        now = int(moment.timestamp() // 30)
        totp = pyotp.TOTP(secret)
        code = totp.generate_otp(now + steps_away)
        in_window = {totp.generate_otp(now + step) for step in (-1, 0, 1)}

        assert code not in in_window
        assert totp_step_matched(secret, code, at=moment) is None

    @pytest.mark.parametrize(
        ("matching", "returned"),
        [((-1, 0), 0), ((0, 1), 1), ((-1, 1), 1), ((-1, 0, 1), 1)],
        ids=["before and now", "now and after", "both ends", "all three"],
    )
    def test_the_latest_step_the_digits_match_is_returned(
        self, matching: tuple[int, ...], returned: int
    ) -> None:
        """The step returned is the one recorded as used. Were it the
        earlier of two that give the same digits, the same digits would
        pass again at the later one."""
        moment = datetime(2026, 10, 16, 12, 0, 15, tzinfo=UTC)
        now = int(moment.timestamp() // 30)

        def digits(_totp: pyotp.TOTP, step: int) -> str:
            return "123456" if step - now in matching else "999999"

        with patch.object(pyotp.TOTP, "generate_otp", digits):
            matched = totp_step_matched(
                generate_totp_secret(), "123456", at=moment
            )

        assert matched == now + returned

    def test_the_step_matched_is_the_step_of_the_moment(self):
        """The step is what is recorded as used, so it must be the one
        the code belongs to."""
        secret = generate_totp_secret()
        moment = datetime(2026, 10, 16, 12, 0, 15, tzinfo=UTC)
        code = pyotp.TOTP(secret).at(moment)

        assert totp_step_matched(secret, code, at=moment) == int(
            moment.timestamp() // 30
        )
