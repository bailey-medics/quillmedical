"""What each kind of signed token does today, said without naming a library.

`security.py` signs and reads four kinds of JWT: the access token and the
refresh token a browser carries, an invite to a conversation, and an
invite to assess a passport. These tests pin what happens to each, good
and bad, so that the library underneath can be changed and the same
tests say whether anything moved.

Two rules keep them fit for that. Every bad token here is built by hand,
from base64 and an HMAC, so no test leans on a library to make the thing
it then asks a library to refuse. And a refusal is "it raised", or "the
request was answered 401": never the name of an error class, which is
exactly what a change of library changes.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.models import User
from app.security import (
    PASSPORT_INVITE_TYPE,
    create_access_token,
    create_invite_token,
    create_passport_invite_token,
    create_refresh_token,
    decode_invite_token,
    decode_jwt_with_competencies,
    decode_passport_invite_token,
    decode_token,
)

Decoder = Callable[[str], dict[str, Any]]

HASHES = {
    "HS256": hashlib.sha256,
    "HS384": hashlib.sha384,
    "HS512": hashlib.sha512,
}


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _secret() -> str:
    return settings.JWT_SECRET.get_secret_value()


def forge(
    payload: dict[str, Any],
    *,
    alg: str = "HS256",
    secret: str | None = None,
    signature: str | None = None,
) -> str:
    """A JWT made by hand: this payload, signed as asked.

    With `alg="none"` it carries no signature at all, which is the token
    a library must never take. `signature` puts in one of the caller's
    choosing.
    """
    header = _b64(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    body = _b64(json.dumps(payload).encode())
    signing_input = f"{header}.{body}".encode()

    if signature is not None:
        return f"{header}.{body}.{signature}"

    if alg == "none":
        return f"{header}.{body}."

    key = (secret if secret is not None else _secret()).encode()
    made = hmac.new(key, signing_input, HASHES[alg]).digest()

    return f"{header}.{body}.{_b64(made)}"


def refused(decode: Decoder, token: str) -> bool:
    """Whether a decoder would not read a token, whatever it raised."""
    try:
        decode(token)
    except Exception:
        return True

    return False


def _in(seconds: int) -> int:
    return int(time.time()) + seconds


ACCESS = {"sub": "ada", "roles": [], "tv": 0}
INVITE = {
    "type": "invite",
    "patient_id": "p-1",
    "email": "ada@example.com",
    "user_type": "external_hcp",
}
PASSPORT_INVITE = {
    "type": PASSPORT_INVITE_TYPE,
    "invite_id": "i-1",
    "email": "ada@example.com",
}

# Each decoder with a payload it reads.
DECODERS: list[tuple[str, Decoder, dict[str, Any]]] = [
    ("decode_token", decode_token, ACCESS),
    ("decode_jwt_with_competencies", decode_jwt_with_competencies, ACCESS),
    ("decode_invite_token", decode_invite_token, INVITE),
    (
        "decode_passport_invite_token",
        decode_passport_invite_token,
        PASSPORT_INVITE,
    ),
]
EVERY_DECODER = pytest.mark.parametrize(
    "decode,payload",
    [(decode, payload) for _, decode, payload in DECODERS],
    ids=[name for name, _, _ in DECODERS],
)


class TestWhatEachDecoderTakes:
    @EVERY_DECODER
    def test_a_token_signed_with_our_secret_is_read(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        token = forge({**payload, "exp": _in(60)})

        read = decode(token)

        for key, value in payload.items():
            assert read[key] == value

    def test_the_tokens_this_app_makes_are_read(self) -> None:
        access = decode_token(create_access_token("ada", ["Clinician"], 3))

        assert access["sub"] == "ada"
        assert access["roles"] == ["Clinician"]
        assert access["tv"] == 3
        assert (
            decode_token(create_refresh_token("ada", 3))["type"] == "refresh"
        )
        assert (
            decode_invite_token(
                create_invite_token("p-1", "ada@example.com", "external_hcp")
            )["patient_id"]
            == "p-1"
        )
        assert (
            decode_passport_invite_token(
                create_passport_invite_token("i-1", "ada@example.com")
            )["invite_id"]
            == "i-1"
        )


class TestWhatEachDecoderRefuses:
    @EVERY_DECODER
    def test_one_that_has_run_out(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        assert refused(decode, forge({**payload, "exp": _in(-60)}))

    @EVERY_DECODER
    def test_one_signed_with_another_secret(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        token = forge({**payload, "exp": _in(60)}, secret="not-our-secret")

        assert refused(decode, token)

    @EVERY_DECODER
    def test_one_whose_payload_was_changed_after_signing(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        good = forge({**payload, "exp": _in(60)})
        header, _, signature = good.split(".")
        changed = _b64(
            json.dumps({**payload, "sub": "root", "exp": _in(60)}).encode()
        )

        assert refused(decode, f"{header}.{changed}.{signature}")

    @EVERY_DECODER
    def test_one_that_says_it_needs_no_signature(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        """`alg: none`, the oldest forgery there is."""
        assert refused(decode, forge({**payload, "exp": _in(60)}, alg="none"))

    @EVERY_DECODER
    def test_one_with_alg_none_and_a_signature_stuck_on(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        token = forge(
            {**payload, "exp": _in(60)}, alg="none", signature="AAAA"
        )

        assert refused(decode, token)

    @EVERY_DECODER
    @pytest.mark.parametrize("alg", ["HS384", "HS512"])
    def test_one_signed_with_our_secret_but_another_algorithm(
        self, decode: Decoder, payload: dict[str, Any], alg: str
    ) -> None:
        """The token does not get to choose how it is checked."""
        assert settings.JWT_ALG == "HS256"

        assert refused(decode, forge({**payload, "exp": _in(60)}, alg=alg))

    @EVERY_DECODER
    def test_one_with_an_empty_signature(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        token = forge({**payload, "exp": _in(60)}, signature="")

        assert refused(decode, token)

    @EVERY_DECODER
    @pytest.mark.parametrize(
        "token",
        ["", "not-a-token", "a.b", "a.b.c", "a.b.c.d", "..", "🙂.🙂.🙂"],
    )
    def test_what_is_not_a_token_at_all(
        self, decode: Decoder, payload: dict[str, Any], token: str
    ) -> None:
        assert refused(decode, token)


class TestOneKindOfTokenIsNotAnother:
    def test_an_access_token_is_not_an_invite(self) -> None:
        token = forge({**ACCESS, "exp": _in(60)})

        assert refused(decode_invite_token, token)
        assert refused(decode_passport_invite_token, token)

    def test_one_invite_is_not_the_other(self) -> None:
        assert refused(
            decode_passport_invite_token, forge({**INVITE, "exp": _in(60)})
        )
        assert refused(
            decode_invite_token, forge({**PASSPORT_INVITE, "exp": _in(60)})
        )

    def test_an_invite_with_no_type_is_not_an_invite(self) -> None:
        untyped = {k: v for k, v in INVITE.items() if k != "type"}

        assert refused(decode_invite_token, forge({**untyped, "exp": _in(60)}))


class TestATokenWithNoExpiry:
    """Pinned as it is today, not as it ought to be.

    Every token this app makes carries an expiry, so one without could
    only be made by somebody who already holds the secret. The decoders
    read it. A library that refuses it instead would be a change of
    behaviour, and this is where that would show.
    """

    @EVERY_DECODER
    def test_is_read(self, decode: Decoder, payload: dict[str, Any]) -> None:
        assert not refused(decode, forge(dict(payload)))


def _me(client: TestClient, token: str) -> int:
    client.cookies.clear()
    client.cookies.set("access_token", token)

    return client.get("/api/auth/me").status_code


class TestWhatARequestIsAnswered:
    """The same, from the outside: the cookie a browser sends."""

    def test_a_good_access_token_is_signed_in(
        self, test_client: TestClient, test_user: User
    ) -> None:
        token = create_access_token(
            test_user.username, [], test_user.token_version
        )

        assert _me(test_client, token) == 200

    def test_no_token_is_not(self, test_client: TestClient) -> None:
        test_client.cookies.clear()

        assert test_client.get("/api/auth/me").status_code == 401

    @pytest.mark.parametrize(
        "make",
        [
            lambda p: forge({**p, "exp": _in(-60)}),
            lambda p: forge({**p, "exp": _in(60)}, secret="not-our-secret"),
            lambda p: forge({**p, "exp": _in(60)}, alg="none"),
            lambda p: forge({**p, "exp": _in(60)}, alg="HS512"),
            lambda p: forge({**p, "exp": _in(60)}, signature=""),
            lambda p: "not-a-token",
        ],
        ids=[
            "run out",
            "another secret",
            "alg none",
            "another algorithm",
            "empty signature",
            "not a token",
        ],
    )
    def test_a_bad_token_is_answered_401(
        self,
        test_client: TestClient,
        test_user: User,
        make: Callable[[dict[str, Any]], str],
    ) -> None:
        payload = {
            "sub": test_user.username,
            "roles": [],
            "tv": test_user.token_version,
        }

        assert _me(test_client, make(payload)) == 401

    def test_a_token_for_somebody_who_does_not_exist_is_answered_401(
        self, test_client: TestClient, test_user: User
    ) -> None:
        token = forge(
            {"sub": "nobody-at-all", "roles": [], "tv": 0, "exp": _in(60)}
        )

        assert _me(test_client, token) == 401

    def test_a_token_from_before_a_sign_out_everywhere_is_answered_401(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """`tv` is the user's token version. It moves on when every
        session is ended, and a token carrying the old one stops
        working."""
        token = forge(
            {
                "sub": test_user.username,
                "roles": [],
                "tv": test_user.token_version + 1,
                "exp": _in(60),
            }
        )

        assert _me(test_client, token) == 401

    def test_an_invite_token_is_not_a_way_to_sign_in(
        self, test_client: TestClient, test_user: User
    ) -> None:
        token = create_invite_token("p-1", "ada@example.com", "external_hcp")

        assert _me(test_client, token) == 401

    def test_a_refresh_token_in_the_access_cookie(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Pinned as it is today: it signs the caller in.

        A request's token is checked for its signature, its expiry, its
        user and its version, and not for its type. A refresh token has
        all four, so offered as the access cookie it is taken as one,
        for its seven days and not fifteen minutes. It gives nobody a
        power they did not hold: whoever has the refresh token could
        exchange it for an access token anyway. It is written down here
        so that a change either way is seen, and the plan carries the
        question of whether the type should be checked.
        """
        token = create_refresh_token(
            test_user.username, test_user.token_version
        )

        assert _me(test_client, token) == 200
