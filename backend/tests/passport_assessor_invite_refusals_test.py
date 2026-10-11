"""What an assessor's invitation answers when it is not allowed.

The rules are in ``app.features.passport.assessor_invites`` and are
tested there. This drives the two routes that ask them, neither of which
needs a sign-in, to pin what a caller is sent: the status and the
``detail`` each gave when the rule was written inside
``app.features.passport.router``.

One refusal of that module is not here. "This invitation is no longer
valid." is kept for a passport that has gone, and removing a passport
removes its invitations with it, so the token is refused first. It is
tested on the function.

Covers:
- GET  /api/passport/assessor-invites/preview
- POST /api/passport/assessor-invites/accept
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport import router
from app.features.passport.blobs import BlobStore
from app.features.passport.models import (
    PassportAssessorInvite,
    PassportSignOffRequest,
)
from app.features.passport.store import LocalPassportStore
from app.main import app
from app.models import OrgUnit, OrgUnitFeature, User, org_unit_member
from app.organisations import add_org_unit_member
from app.passport_storage import get_blob_store, get_passport_store
from app.registrations import REGISTRATION_AUTHORITIES
from app.security import hash_password
from tests.competencies import hold

PASSWORD = "Made-up-password-1"
COMPETENCY = "uk_sact_board_2023_prescribe_sact"
WORKING_TO = {"frameworks": ["clinical", "uk_sact_board_2023"]}
#: An address with no account.
OUTSIDE = "outside.assessor@example.com"

NOT_VALID = "This invitation link is not valid or has expired."

ACCEPT = "/api/passport/assessor-invites/accept"
PREVIEW = "/api/passport/assessor-invites/preview"


@pytest.fixture
def passport_store(tmp_path: Path) -> Iterator[LocalPassportStore]:
    """Point every route at a passport store under a temporary directory."""
    root = tmp_path / "passports"
    store = LocalPassportStore(root)
    blobs = BlobStore(root)
    app.dependency_overrides[get_passport_store] = lambda: store
    app.dependency_overrides[get_blob_store] = lambda: blobs

    yield store

    app.dependency_overrides.pop(get_passport_store, None)
    app.dependency_overrides.pop(get_blob_store, None)


@pytest.fixture
def team(db_session: Session) -> OrgUnit:
    """Where the holder is, with the passport switched on."""
    unit = OrgUnit(name="Made-up Team", type="hospital_team")
    db_session.add(unit)
    db_session.flush()
    db_session.add(OrgUnitFeature(org_unit_id=unit.id, feature_key="passport"))
    db_session.commit()
    db_session.refresh(unit)

    return unit


@pytest.fixture
def holder(db_session: Session, team: OrgUnit) -> User:
    user = User(
        username="holder",
        email="holder@example.com",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="specialty_trainee_3_plus",
    )
    hold(user, "passport_write")
    db_session.add(user)
    db_session.flush()
    add_org_unit_member(db_session, team.id, user.id, "trainee")
    db_session.commit()
    db_session.refresh(user)

    return user


@pytest.fixture
def mailed(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """The body of each email, in place of sending anything."""
    bodies: list[str] = []
    monkeypatch.setattr(
        router, "send_email", lambda **kw: bodies.append(str(kw["html_body"]))
    )

    return bodies


@pytest.fixture
def holder_client(
    test_client: TestClient,
    passport_store: LocalPassportStore,
    holder: User,
) -> TestClient:
    """The holder, signed in on a client of their own.

    Apart from ``test_client``, which stays signed out to be whoever
    holds the link. It is asked for first, since it is what points the
    application at the test database.
    """
    client = TestClient(app)
    response = client.post(
        "/api/auth/login",
        json={"username": holder.username, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = client.cookies["XSRF-TOKEN"]

    return client


@pytest.fixture
def asked(
    test_client: TestClient, holder_client: TestClient, mailed: list[str]
) -> dict[str, str]:
    """A sign-off asked of an address with no account.

    Returns:
        The passport, the request's name and the token that was emailed.
    """
    created = holder_client.post("/api/passport", json=WORKING_TO)
    assert created.status_code == 201, created.text
    passport_id = str(created.json()["passport_id"])

    response = holder_client.post(
        f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
        json={
            "assessor_email": OUTSIDE,
            "scope_id": "lung",
            "observed_on": "2026-03-14",
            "level_id": "review_and_authorise",
        },
    )
    assert response.status_code == 201, response.text

    return {
        "passport_id": passport_id,
        "name": str(response.json()["name"]),
        "token": mailed[-1].split("token=")[1].split('"')[0],
    }


def _accept(client: TestClient, token: str, **changed: object) -> Response:
    body: dict[str, object] = {
        "token": token,
        "username": "outside",
        "password": PASSWORD,
        "full_name": "Made-up Assessor",
        "registration_authority": "GMC",
        "registration_number": "0000000",
    }
    body.update(changed)

    return client.post(
        ACCEPT,
        json={key: value for key, value in body.items() if value is not None},
    )


def _invite(db: Session) -> PassportAssessorInvite:
    db.expire_all()
    row = db.scalar(select(PassportAssessorInvite))
    assert row is not None

    return row


def _account(db: Session, username: str = "outside") -> User | None:
    db.expire_all()

    return db.scalar(select(User).where(User.username == username))


# --- a token that is no good ------------------------------------------------


def test_a_token_that_cannot_be_read_is_a_400_on_both_routes(
    test_client: TestClient,
) -> None:
    preview = test_client.get(PREVIEW, params={"token": "not-a-token"})
    accepted = _accept(test_client, "not-a-token")

    assert preview.status_code == 400
    assert preview.json() == {"detail": NOT_VALID}
    assert accepted.status_code == 400
    assert accepted.json() == {"detail": NOT_VALID}


def test_an_invitation_past_its_fortnight_is_answered_in_the_same_words(
    test_client: TestClient, asked: dict[str, str], db_session: Session
) -> None:
    """A caller learns that the token is bad, and never which way."""
    _invite(db_session).expires_at = datetime.now(UTC) - timedelta(days=1)
    db_session.commit()

    preview = test_client.get(PREVIEW, params={"token": asked["token"]})
    accepted = _accept(test_client, asked["token"])

    assert preview.status_code == 400
    assert preview.json() == {"detail": NOT_VALID}
    assert accepted.status_code == 400
    assert accepted.json() == {"detail": NOT_VALID}
    assert _account(db_session) is None


def test_a_token_whose_invitation_is_gone_is_answered_in_the_same_words(
    test_client: TestClient, asked: dict[str, str], db_session: Session
) -> None:
    db_session.delete(_invite(db_session))
    db_session.commit()

    accepted = _accept(test_client, asked["token"])

    assert accepted.status_code == 400
    assert accepted.json() == {"detail": NOT_VALID}


# --- an invitation already spent --------------------------------------------


def test_accepting_twice_is_a_409_and_makes_no_second_account(
    test_client: TestClient, asked: dict[str, str], db_session: Session
) -> None:
    first = _accept(test_client, asked["token"])
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "registered"

    again = _accept(test_client, asked["token"], username="somebody-else")

    assert again.status_code == 409
    assert again.json() == {
        "detail": (
            "This invitation has already been accepted. "
            "Please sign in instead."
        )
    }
    assert _account(db_session, "somebody-else") is None


def test_a_spent_invitation_is_refused_before_what_was_sent_is_read(
    test_client: TestClient, asked: dict[str, str]
) -> None:
    assert _accept(test_client, asked["token"]).status_code == 200

    again = _accept(test_client, asked["token"], username=None, password=None)

    assert again.status_code == 409


# --- what a new account needs -----------------------------------------------


@pytest.mark.parametrize(
    ("changed", "status_code", "detail"),
    [
        (
            {"username": None},
            422,
            "A username and password are needed to create your account.",
        ),
        (
            {"password": None},
            422,
            "A username and password are needed to create your account.",
        ),
        (
            {"password": "seven77"},
            400,
            "Password must be at least 8 characters",
        ),
        (
            {"full_name": "   "},
            422,
            "Your full name is needed to create your account.",
        ),
        (
            {"registration_authority": None},
            422,
            "Your registering body and registration number are "
            "needed to create your account.",
        ),
        (
            {"registration_number": "  "},
            422,
            "Your registering body and registration number are "
            "needed to create your account.",
        ),
        (
            {"registration_authority": "Made-up Council"},
            422,
            "That registering body is not one Quill recognises. "
            "Choose one of: " + ", ".join(REGISTRATION_AUTHORITIES) + ".",
        ),
        (
            {"username": "holder"},
            409,
            "That username is already taken.",
        ),
    ],
)
def test_a_new_account_missing_something_is_refused_and_nothing_is_spent(
    test_client: TestClient,
    asked: dict[str, str],
    db_session: Session,
    changed: dict[str, object],
    status_code: int,
    detail: str,
) -> None:
    response = _accept(test_client, asked["token"], **changed)

    assert response.status_code == status_code
    assert response.json() == {"detail": detail}
    assert _invite(db_session).accepted_at is None
    assert _account(db_session) is None

    # The same link still works once it is put right.
    assert _accept(test_client, asked["token"]).status_code == 200


def test_a_registering_body_that_is_not_listed_does_not_come_back(
    test_client: TestClient, asked: dict[str, str]
) -> None:
    """The words list the bodies there are, never what was typed."""
    response = _accept(
        test_client, asked["token"], registration_authority="Made-up Council"
    )

    assert "Made-up Council" not in response.text


# --- a holder who has since left everywhere ---------------------------------


def test_a_holder_who_now_belongs_nowhere_is_a_409_and_leaves_no_account(
    test_client: TestClient,
    asked: dict[str, str],
    holder: User,
    db_session: Session,
) -> None:
    """The account is made before this is found, and rolled back with it."""
    db_session.execute(
        org_unit_member.delete().where(org_unit_member.c.user_id == holder.id)
    )
    db_session.commit()

    response = _accept(test_client, asked["token"])

    assert response.status_code == 409
    assert response.json() == {
        "detail": (
            "The clinician who invited you does not belong anywhere on "
            "Quill, so there is nowhere to add you."
        )
    }
    assert _account(db_session) is None
    assert _invite(db_session).accepted_at is None


# --- found on the way, and pinned as it stands ------------------------------


def test_an_invitation_still_lets_its_holder_in_after_the_ask_is_withdrawn(
    test_client: TestClient,
    holder_client: TestClient,
    asked: dict[str, str],
    team: OrgUnit,
    db_session: Session,
) -> None:
    """Found while moving this rule, and pinned, not fixed.

    Withdrawing a request closes its row and leaves the invitation it
    sent as it was. Nothing withdraws an invitation, so for the rest of
    its fortnight the link still makes an account that holds
    ``assess_clinician_passport`` and is an external member of the
    holder's org_unit.
    """
    withdrawn = holder_client.post(
        f"/api/passport/{asked['passport_id']}/sign-offs/"
        f"{asked['name']}/withdraw"
    )
    assert withdrawn.status_code == 200, withdrawn.text
    db_session.expire_all()
    assert db_session.scalar(select(PassportSignOffRequest.status)) == (
        "withdrawn"
    )

    response = _accept(test_client, asked["token"])

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "registered"
    assert response.json()["org_unit_id"] == team.id

    made = _account(db_session)
    assert made is not None
    assert "assess_clinician_passport" in made.get_final_competencies()


def test_each_ask_of_one_address_sends_an_invitation_of_its_own(
    test_client: TestClient,
    holder_client: TestClient,
    asked: dict[str, str],
    mailed: list[str],
    db_session: Session,
) -> None:
    """Found while moving this rule, and pinned, not fixed.

    An invitation is spent once, but an address asked twice holds two.
    The first accepted makes the account; the second is then accepted
    as that account, with no sign-in, and answers "linked".
    """
    second = holder_client.post(
        f"/api/passport/{asked['passport_id']}/competencies/"
        f"{COMPETENCY}/requests",
        json={
            "assessor_email": OUTSIDE,
            "scope_id": "lung",
            "observed_on": "2026-03-15",
            "level_id": "review_and_authorise",
        },
    )
    assert second.status_code == 201, second.text
    other_token = mailed[-1].split("token=")[1].split('"')[0]
    assert other_token != asked["token"]

    first = _accept(test_client, asked["token"])
    again = _accept(test_client, other_token, username=None, password=None)

    assert first.json()["status"] == "registered"
    assert again.status_code == 200, again.text
    assert again.json()["status"] == "linked"
    assert again.json()["user_id"] == first.json()["user_id"]
