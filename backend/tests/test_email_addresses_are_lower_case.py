"""Every email address is held in lower case, whoever typed it.

Somebody who registered as ``Jane.Smith@nhs.net`` was stored with the
capitals, and asking for a new verification link looked them up in lower
case: nothing was found, nothing was sent, and the page said it had been.
The address is now lower-cased on the way in, on the model, so it covers
every route, script and seed, and each route that looks somebody up by an
address lower-cases what it was given.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import main
from app.models import User, normalise_email
from app.security import hash_password

MIXED = "Jane.Smith@NHS.net"
LOWER = "jane.smith@nhs.net"


def _register(client: TestClient, username: str, email: str) -> int:
    response = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": email,
            "password": "SecurePassword123!",
        },
    )

    return response.status_code


def _stored_email(db: Session, username: str) -> str | None:
    return db.scalar(select(User.email).where(User.username == username))


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """The address of each email the routes try to send."""
    addresses: list[str] = []

    def _record(**kwargs: object) -> None:
        addresses.append(str(kwargs.get("to")))

    monkeypatch.setattr(main, "send_email", _record)

    return addresses


class TestNormaliseEmail:
    def test_lower_cases(self) -> None:
        assert normalise_email(MIXED) == LOWER

    def test_trims(self) -> None:
        assert normalise_email(f"  {MIXED}\n") == LOWER

    def test_leaves_a_lower_case_address_alone(self) -> None:
        assert normalise_email(LOWER) == LOWER


class TestTheModel:
    """The rule is on ``User``, so no path can store capitals."""

    def test_a_new_user_is_held_lower_case(self, db_session: Session) -> None:
        user = User(
            username="jane",
            email=f" {MIXED} ",
            password_hash=hash_password("SecurePassword123!"),
        )
        db_session.add(user)
        db_session.commit()

        assert _stored_email(db_session, "jane") == LOWER

    def test_a_changed_address_is_held_lower_case(
        self, db_session: Session, test_user: User
    ) -> None:
        test_user.email = "New.Address@Example.COM"
        db_session.commit()

        assert (
            _stored_email(db_session, test_user.username)
            == "new.address@example.com"
        )

    def test_a_second_account_differing_only_by_case_is_refused(
        self, db_session: Session
    ) -> None:
        for username, email in (("first", LOWER), ("second", MIXED)):
            db_session.add(
                User(
                    username=username,
                    email=email,
                    password_hash=hash_password("SecurePassword123!"),
                )
            )

        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()


class TestRegistration:
    def test_capitals_are_stored_lower_case(
        self, test_client: TestClient, db_session: Session, sent: list[str]
    ) -> None:
        assert _register(test_client, "jane", MIXED) == 200

        assert _stored_email(db_session, "jane") == LOWER

    def test_the_verification_email_goes_to_the_lower_case_address(
        self, test_client: TestClient, sent: list[str]
    ) -> None:
        _register(test_client, "jane", MIXED)

        assert sent == [LOWER]

    def test_the_same_address_in_another_case_is_a_duplicate(
        self, test_client: TestClient, sent: list[str]
    ) -> None:
        assert _register(test_client, "jane", LOWER) == 200

        assert _register(test_client, "janet", MIXED) == 400


class TestLookingSomebodyUp:
    """Typed in any case, the address finds the account."""

    @pytest.mark.parametrize("typed", [MIXED, LOWER, LOWER.upper()])
    def test_a_new_verification_link_is_sent(
        self, test_client: TestClient, sent: list[str], typed: str
    ) -> None:
        _register(test_client, "jane", MIXED)
        sent.clear()

        response = test_client.post(
            "/api/auth/resend-verification", json={"email": typed}
        )

        assert response.status_code == 200
        assert sent == [LOWER]

    @pytest.mark.parametrize("typed", ["Test@Example.com", "TEST@EXAMPLE.COM"])
    def test_a_password_reset_is_sent(
        self,
        test_client: TestClient,
        test_user: User,
        sent: list[str],
        typed: str,
    ) -> None:
        response = test_client.post(
            "/api/auth/forgot-password", json={"email": typed}
        )

        assert response.status_code == 200
        assert sent == [test_user.email]


class TestChangingYourOwnAddress:
    def test_capitals_are_stored_lower_case(
        self,
        authenticated_client: TestClient,
        db_session: Session,
        test_user: User,
        sent: list[str],
    ) -> None:
        response = authenticated_client.patch(
            "/api/auth/profile",
            json={"email": "Moved.House@Example.org"},
            headers={
                "X-CSRF-Token": authenticated_client.cookies.get("XSRF-TOKEN")
                or ""
            },
        )

        assert response.status_code == 200, response.text
        db_session.refresh(test_user)
        assert test_user.email == "moved.house@example.org"
