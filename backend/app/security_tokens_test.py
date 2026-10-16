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

They were written against python-jose and judged the move to PyJWT on
12 October 2026. Two things changed with that move, on purpose, and
are marked where they are: a token must say what kind it is, and a
token with no expiry is refused.
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
    InviteClaims,
    PassportInviteClaims,
    SessionClaims,
    create_access_token,
    create_invite_token,
    create_passport_invite_token,
    create_refresh_token,
    decode_invite_token,
    decode_passport_invite_token,
    decode_refresh_token,
    decode_token,
)

Decoder = Callable[[str], object]

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


ACCESS = {"sub": "ada", "type": "access", "tv": 0}
REFRESH = {"sub": "ada", "type": "refresh", "tv": 0}
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

# Each decoder with a payload it reads, and what it hands back for it.
DECODERS: list[tuple[str, Decoder, dict[str, Any], object]] = [
    ("decode_token", decode_token, ACCESS, SessionClaims("ada", 0)),
    (
        "decode_refresh_token",
        decode_refresh_token,
        REFRESH,
        SessionClaims("ada", 0),
    ),
    (
        "decode_invite_token",
        decode_invite_token,
        INVITE,
        InviteClaims("p-1", "ada@example.com", "external_hcp"),
    ),
    (
        "decode_passport_invite_token",
        decode_passport_invite_token,
        PASSPORT_INVITE,
        PassportInviteClaims("i-1", "ada@example.com"),
    ),
]
EVERY_DECODER = pytest.mark.parametrize(
    "decode,payload",
    [(decode, payload) for _, decode, payload, _ in DECODERS],
    ids=[name for name, _, _, _ in DECODERS],
)


class TestWhatEachDecoderTakes:
    @pytest.mark.parametrize(
        "decode,payload,expected",
        [
            (decode, payload, expected)
            for _, decode, payload, expected in DECODERS
        ],
        ids=[name for name, _, _, _ in DECODERS],
    )
    def test_a_token_signed_with_our_secret_is_read(
        self, decode: Decoder, payload: dict[str, Any], expected: object
    ) -> None:
        token = forge({**payload, "exp": _in(60)})

        assert decode(token) == expected

    def test_the_tokens_this_app_makes_are_read(self) -> None:
        assert decode_token(create_access_token("ada", 3)) == SessionClaims(
            "ada", 3
        )
        assert decode_refresh_token(
            create_refresh_token("ada", 3)
        ) == SessionClaims("ada", 3)
        assert decode_invite_token(
            create_invite_token("p-1", "ada@example.com", "external_hcp")
        ) == InviteClaims("p-1", "ada@example.com", "external_hcp")
        assert decode_passport_invite_token(
            create_passport_invite_token("i-1", "ada@example.com")
        ) == PassportInviteClaims("i-1", "ada@example.com")


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

    def test_a_refresh_token_is_not_an_access_token(self) -> None:
        """Changed with the move to PyJWT, on purpose. It was read: a
        request's token was checked for everything but its kind."""
        token = forge({**REFRESH, "exp": _in(60)})

        assert refused(decode_token, token)

    def test_an_access_token_is_not_a_refresh_token(self) -> None:
        assert refused(decode_refresh_token, forge({**ACCESS, "exp": _in(60)}))

    def test_an_access_token_that_does_not_say_so_is_not_one(self) -> None:
        """What every access token looked like before 12 October 2026.
        One still in a browser is refused once, and the page then gets a
        new one with its refresh token, as it does every fifteen
        minutes anyway."""
        untyped = {k: v for k, v in ACCESS.items() if k != "type"}

        assert refused(decode_token, forge({**untyped, "exp": _in(60)}))

    def test_an_invite_is_neither(self) -> None:
        for payload in (INVITE, PASSPORT_INVITE):
            token = forge({**payload, "exp": _in(60)})

            assert refused(decode_token, token)
            assert refused(decode_refresh_token, token)

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
    """Refused. Changed with the move to PyJWT, on purpose.

    Every token this app makes carries an expiry, so one without could
    only be made by somebody who already holds the secret. It used to
    be read all the same. A token that never runs out is not one this
    app issues, so it is not one it takes.
    """

    @EVERY_DECODER
    def test_is_refused(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        assert refused(decode, forge(dict(payload)))


class TestATokenMissingAClaim:
    """Refused, as a forged one is.

    Its signature is good, so only somebody holding the secret could make
    it, but every token this app makes carries each claim its kind needs.
    One that does not is not a token this app made.
    """

    @EVERY_DECODER
    def test_each_claim_left_out(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        for name in payload.keys() - {"type"}:
            without = {k: v for k, v in payload.items() if k != name}

            assert refused(decode, forge({**without, "exp": _in(60)})), name

    @EVERY_DECODER
    def test_each_claim_of_the_wrong_type(
        self, decode: Decoder, payload: dict[str, Any]
    ) -> None:
        for name in payload.keys() - {"type"}:
            token = forge({**payload, name: [name], "exp": _in(60)})

            assert refused(decode, token), name

    def test_a_token_version_of_true(self) -> None:
        """Python counts ``bool`` as an ``int``; a token version is not."""
        token = forge({**ACCESS, "tv": True, "exp": _in(60)})

        assert refused(decode_token, token)


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
            test_user.username, test_user.token_version
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
            "type": "access",
            "tv": test_user.token_version,
        }

        assert _me(test_client, make(payload)) == 401

    def test_a_token_for_somebody_who_does_not_exist_is_answered_401(
        self, test_client: TestClient, test_user: User
    ) -> None:
        token = forge(
            {
                "sub": "nobody-at-all",
                "type": "access",
                "tv": 0,
                "exp": _in(60),
            }
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
                "type": "access",
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

    def test_a_refresh_token_in_the_access_cookie_is_answered_401(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Changed with the move to PyJWT, on purpose. It signed the
        caller in, for its seven days and not fifteen minutes."""
        token = create_refresh_token(
            test_user.username, test_user.token_version
        )

        assert _me(test_client, token) == 401
