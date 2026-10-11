"""What the accept-invite route answers, refused or not.

The rules are in ``app.users.invites`` and are tested there. This
drives the route, to pin what a caller is sent: the status and the
``detail`` the route gave when the rules were written inside it. Only
the status of a wrong token was pinned before the rules moved.
"""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ExternalPatientAccess, User
from app.security import create_invite_token, hash_password

PATIENT = "patient-abc"
INVITED = "invited@example.com"


def _person(db: Session, username: str, email: str | None = None) -> User:
    user = User(
        username=username,
        email=email or f"{username}@example.com",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def _invite() -> str:
    return create_invite_token(
        patient_id=PATIENT, email=INVITED, user_type="external_hcp"
    )


def _run_out() -> str:
    return str(
        jwt.encode(
            {
                "type": "invite",
                "patient_id": PATIENT,
                "email": INVITED,
                "user_type": "external_hcp",
                "exp": datetime.now(UTC) - timedelta(minutes=1),
            },
            settings.JWT_SECRET.get_secret_value(),
            algorithm=settings.JWT_ALG,
        )
    )


def _altered() -> str:
    # The first character of the signature, never the last. The last one
    # carries two bits that are not part of the signature, so swapping an
    # "A" there for a "B" leaves a token that still verifies.
    head, signature = _invite().rsplit(".", 1)
    swapped = "A" if signature[0] != "A" else "B"

    return f"{head}.{swapped}{signature[1:]}"


def _accounts(db: Session) -> list[str]:
    return sorted(db.scalars(select(User.username)).all())


def _patients_of(db: Session, user_id: int) -> list[str]:
    return list(
        db.scalars(
            select(ExternalPatientAccess.patient_id).where(
                ExternalPatientAccess.user_id == user_id
            )
        ).all()
    )


@pytest.mark.parametrize(
    "token",
    ["invalid.token.here", "run out", "altered"],
)
def test_a_wrong_token_is_refused_in_the_same_words_whatever_is_wrong(
    test_client: TestClient, db_session: Session, token: str
) -> None:
    sent = {"run out": _run_out(), "altered": _altered()}.get(token, token)

    response = test_client.post(
        "/api/accept-invite",
        json={"token": sent, "username": "newcomer", "password": "Pass123!"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid or expired invite token"}
    assert _accounts(db_session) == []


@pytest.mark.parametrize(
    "sent",
    [{}, {"username": "newcomer"}, {"password": "Pass123!"}],
    ids=["neither", "no password", "no username"],
)
def test_a_new_account_needs_a_username_and_a_password(
    test_client: TestClient, db_session: Session, sent: dict[str, str]
) -> None:
    response = test_client.post(
        "/api/accept-invite", json={"token": _invite(), **sent}
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "username and password required for new registration"
    }
    assert _accounts(db_session) == []


def test_a_username_another_account_has_is_refused(
    test_client: TestClient, db_session: Session
) -> None:
    _person(db_session, "colleague")

    response = test_client.post(
        "/api/accept-invite",
        json={
            "token": _invite(),
            "username": "colleague",
            "password": "Pass123!",
        },
    )

    assert response.status_code == 409
    assert response.json() == {"detail": "Username already taken"}
    assert _accounts(db_session) == ["colleague"]


def test_a_new_account_is_answered_as_registered_and_signed_in_nowhere(
    test_client: TestClient, db_session: Session
) -> None:
    response = test_client.post(
        "/api/accept-invite",
        json={
            "token": _invite(),
            "username": "newcomer",
            "password": "Pass123!",
        },
    )

    made = db_session.scalar(select(User).where(User.username == "newcomer"))

    assert made is not None
    assert response.status_code == 200
    assert response.json() == {"status": "registered", "user_id": made.id}
    assert "set-cookie" not in response.headers
    assert _patients_of(db_session, made.id) == [PATIENT]


def test_an_account_with_the_address_is_answered_as_given_access(
    test_client: TestClient, db_session: Session
) -> None:
    invited = _person(db_session, "invited", INVITED)

    response = test_client.post(
        "/api/accept-invite", json={"token": _invite()}
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "access_granted",
        "user_id": invited.id,
    }
    assert "set-cookie" not in response.headers
    assert _patients_of(db_session, invited.id) == [PATIENT]


def test_the_same_token_sent_again_is_answered_as_given_access(
    test_client: TestClient, db_session: Session
) -> None:
    """Nothing records that a token was used."""
    body = {"token": _invite(), "username": "newcomer", "password": "Pass123!"}

    first = test_client.post("/api/accept-invite", json=body)
    second = test_client.post("/api/accept-invite", json=body)

    assert first.json()["status"] == "registered"
    assert second.status_code == 200
    assert second.json() == {
        "status": "access_granted",
        "user_id": first.json()["user_id"],
    }
    assert _accounts(db_session) == ["newcomer"]
