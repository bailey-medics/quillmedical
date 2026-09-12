"""Tests for the passport assessor invite token.

The first direct tests of any invite token in this codebase — the
patient-sharing pair in ``security.py`` has never had its own, and is
covered only incidentally through the messaging routes.

What these pin, and why each earns its place:

**A patient invite cannot be presented as a passport invite.** Both are
signed with the same key, so a patient-sharing token decodes cleanly
unless the type is checked. Without that check, a token minted to share
one patient's record would be accepted as authority to sign off a
clinician's competency.

**Expiry is real, not decorative.** Tested by minting a token that has
already expired rather than by reading the payload, because a claim that
is never verified is not an expiry.

**Single use is deliberately absent here.** A JWT carries no record of
having been spent, so nothing in this module can enforce it. The
``passport_assessor_invite`` row does, through ``token_hash`` and
``accepted_at``. A test asserting single use here would pass while
testing nothing, so instead one asserts the token is *replayable* —
documenting the gap the row has to close.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from jose import jwt

from app.config import settings
from app.security import (
    PASSPORT_INVITE_TTL_DAYS,
    PASSPORT_INVITE_TYPE,
    _now,
    create_invite_token,
    create_passport_invite_token,
    decode_invite_token,
    decode_passport_invite_token,
)

INVITE_ID = "7f4e9a21-0000-4000-8000-000000000001"
EMAIL = "amara@example.nhs.uk"


class TestItRoundTrips:
    def test_a_token_decodes_to_what_went_in(self) -> None:
        token = create_passport_invite_token(INVITE_ID, EMAIL)

        payload = decode_passport_invite_token(token)

        assert payload["invite_id"] == INVITE_ID
        assert payload["email"] == EMAIL

    def test_the_email_is_lowercased(self) -> None:
        """So a forwarded link cannot be matched case-sensitively later."""
        token = create_passport_invite_token(INVITE_ID, "Amara@Example.NHS.UK")

        assert decode_passport_invite_token(token)["email"] == EMAIL

    def test_surrounding_whitespace_is_trimmed(self) -> None:
        token = create_passport_invite_token(f"  {INVITE_ID}  ", f" {EMAIL} ")

        payload = decode_passport_invite_token(token)

        assert payload["invite_id"] == INVITE_ID
        assert payload["email"] == EMAIL


class TestItRefusesTheWrongThing:
    def test_a_patient_invite_is_not_a_passport_invite(self) -> None:
        """The one that would matter most if it were missing.

        Both are signed with the same key, so without a type check a
        token minted to share one patient's record would be accepted as
        authority to sign off somebody's clinical competency.
        """
        patient_token = create_invite_token(
            patient_id="patient-123",
            email=EMAIL,
            user_type="external_hcp",
        )

        with pytest.raises(jwt.JWTError, match="Not a passport"):
            decode_passport_invite_token(patient_token)

    def test_a_passport_invite_is_not_a_patient_invite(self) -> None:
        """And the reverse, so neither can stand in for the other."""
        token = create_passport_invite_token(INVITE_ID, EMAIL)

        with pytest.raises(jwt.JWTError, match="Not an invite token"):
            decode_invite_token(token)

    def test_an_access_token_is_refused(self) -> None:
        """A session token carries no type at all and must not pass."""
        from app.security import create_access_token

        with pytest.raises(jwt.JWTError, match="Not a passport"):
            decode_passport_invite_token(
                create_access_token("someone", ["Clinician"])
            )

    def test_a_tampered_token_is_refused(self) -> None:
        token = create_passport_invite_token(INVITE_ID, EMAIL)
        head, payload, signature = token.split(".")

        with pytest.raises(jwt.JWTError):
            decode_passport_invite_token(f"{head}.{payload}x.{signature}")

    def test_a_token_signed_with_another_key_is_refused(self) -> None:
        """Signature verification, not merely decoding."""
        forged = jwt.encode(
            {
                "type": PASSPORT_INVITE_TYPE,
                "invite_id": INVITE_ID,
                "email": EMAIL,
                "exp": _now() + timedelta(days=1),
            },
            "a" * 40,
            algorithm=settings.JWT_ALG,
        )

        with pytest.raises(jwt.JWTError):
            decode_passport_invite_token(forged)


class TestExpiry:
    def test_the_default_is_a_fortnight(self) -> None:
        """A consultant may be on nights, on leave, or slow to read email.

        A link that dies over a fortnight's annual leave means the holder
        has to ask twice.
        """
        assert PASSPORT_INVITE_TTL_DAYS == 14

        token = create_passport_invite_token(INVITE_ID, EMAIL)
        payload = decode_passport_invite_token(token)

        expected = _now() + timedelta(days=14)
        assert abs(payload["exp"] - expected.timestamp()) < 60

    def test_an_expired_token_is_refused(self) -> None:
        """Minted already expired, so the check is real rather than read."""
        expired = jwt.encode(
            {
                "type": PASSPORT_INVITE_TYPE,
                "invite_id": INVITE_ID,
                "email": EMAIL,
                "exp": _now() - timedelta(seconds=1),
            },
            settings.JWT_SECRET.get_secret_value(),
            algorithm=settings.JWT_ALG,
        )

        with pytest.raises(jwt.ExpiredSignatureError):
            decode_passport_invite_token(expired)

    def test_a_shorter_lifetime_can_be_asked_for(self) -> None:
        token = create_passport_invite_token(INVITE_ID, EMAIL, ttl_days=1)
        payload = decode_passport_invite_token(token)

        expected = _now() + timedelta(days=1)
        assert abs(payload["exp"] - expected.timestamp()) < 60


class TestItValidatesItsArguments:
    @pytest.mark.parametrize("bad", ["", "   "])
    def test_an_empty_invite_id_is_refused(self, bad: str) -> None:
        with pytest.raises(ValueError, match="invite_id"):
            create_passport_invite_token(bad, EMAIL)

    @pytest.mark.parametrize("bad", ["", "   "])
    def test_an_empty_email_is_refused(self, bad: str) -> None:
        with pytest.raises(ValueError, match="email"):
            create_passport_invite_token(INVITE_ID, bad)

    @pytest.mark.parametrize("bad", [0, -1, 366])
    def test_an_absurd_lifetime_is_refused(self, bad: int) -> None:
        with pytest.raises(ValueError, match="ttl_days"):
            create_passport_invite_token(INVITE_ID, EMAIL, ttl_days=bad)


class TestSingleUseIsNotEnforcedHere:
    def test_a_token_can_be_decoded_twice(self) -> None:
        """Documenting the gap rather than pretending it is closed.

        A JWT carries no record of having been spent. What makes a
        passport invite single-use is the ``passport_assessor_invite``
        row — ``token_hash`` identifies it and ``accepted_at`` records
        that it has been consumed. A test asserting single use *here*
        would pass while testing nothing, so this asserts the opposite
        and names where the real check belongs.
        """
        token = create_passport_invite_token(INVITE_ID, EMAIL)

        first = decode_passport_invite_token(token)
        second = decode_passport_invite_token(token)

        assert first == second
