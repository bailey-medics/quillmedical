"""Accepting an invite to a patient's record: who gets in, and how."""

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ExternalPatientAccess, User
from app.security import (
    create_access_token,
    create_invite_token,
    create_passport_invite_token,
    hash_password,
    verify_password,
)
from app.users.errors import (
    InviteNeedsUsernameAndPassword,
    InviteTokenInvalid,
    InviteUsernameTaken,
    UserAdminError,
)
from app.users.invites import accept_external_invite

PATIENT = "patient-abc"
INVITED = "invited@example.test"
PASSWORD = "Password123!"


def _person(
    db: Session,
    username: str,
    email: str | None = None,
    *,
    active: bool = True,
) -> User:
    user = User(
        username=username,
        email=email or f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=active,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def _invite(
    email: str = INVITED,
    patient_id: str = PATIENT,
    user_type: str = "external_hcp",
) -> str:
    return create_invite_token(
        patient_id=patient_id, email=email, user_type=user_type
    )


def _signed(**claims: Any) -> str:
    """A token signed as the real ones are, saying whatever a test wants."""
    payload: dict[str, Any] = {
        "type": "invite",
        "patient_id": PATIENT,
        "email": INVITED,
        "user_type": "external_hcp",
        "exp": datetime.now(UTC) + timedelta(days=1),
    }
    payload.update(claims)

    return str(
        jwt.encode(
            payload,
            settings.JWT_SECRET.get_secret_value(),
            algorithm=settings.JWT_ALG,
        )
    )


def _altered(token: str) -> str:
    """The same token with the first character of its signature changed.

    The first and not the last. The last character of a signature holds
    only some of its bits, so two different characters there can stand
    for the same signature, and a token "altered" that way still passed
    about one time in sixteen.
    """
    body, signature = token.rsplit(".", 1)
    swapped = "A" if signature[0] != "A" else "B"

    return f"{body}.{swapped}{signature[1:]}"


def _grants(db: Session, user: User) -> list[ExternalPatientAccess]:
    return list(
        db.scalars(
            select(ExternalPatientAccess).where(
                ExternalPatientAccess.user_id == user.id
            )
        )
        .unique()
        .all()
    )


def _accounts(db: Session) -> list[str]:
    return sorted(db.scalars(select(User.username)).all())


@pytest.fixture
def invited(db_session: Session) -> User:
    """Somebody who already has an account with the address invited."""
    return _person(db_session, "invited", INVITED)


# --- the token --------------------------------------------------------------


def _wrong_tokens() -> dict[str, str]:
    return {
        "not a token": "invalid.token.here",
        "empty": "",
        "altered": _altered(_invite()),
        "run out": _signed(exp=datetime.now(UTC) - timedelta(minutes=1)),
        "signed with another secret": str(
            jwt.encode(
                {
                    "type": "invite",
                    "patient_id": PATIENT,
                    "email": INVITED,
                    "user_type": "external_hcp",
                    "exp": datetime.now(UTC) + timedelta(days=1),
                },
                "not-the-secret",
                algorithm=settings.JWT_ALG,
            )
        ),
        "a sign-in token": create_access_token("invited", ["clinician"]),
        "a passport assessor's invite": create_passport_invite_token(
            "invite-1", INVITED
        ),
        "of no type": _signed(type=None),
    }


@pytest.mark.parametrize("wrong", list(_wrong_tokens()))
def test_a_token_that_is_no_invite_is_refused(
    db_session: Session, invited: User, wrong: str
) -> None:
    with pytest.raises(InviteTokenInvalid) as refusal:
        accept_external_invite(
            db_session,
            _wrong_tokens()[wrong],
            username="newcomer",
            password=PASSWORD,
        )

    assert refusal.value.status_code == 400
    assert refusal.value.message == "Invalid or expired invite token"
    assert _grants(db_session, invited) == []
    assert _accounts(db_session) == ["invited"]


def test_every_wrong_token_is_answered_exactly_alike(
    db_session: Session,
) -> None:
    """So the answer never says why a token was not taken."""
    answers = set()

    for token in _wrong_tokens().values():
        with pytest.raises(UserAdminError) as refusal:
            accept_external_invite(db_session, token)

        answers.add(
            (
                type(refusal.value),
                refusal.value.status_code,
                refusal.value.message,
            )
        )

    assert answers == {
        (InviteTokenInvalid, 400, "Invalid or expired invite token")
    }


def test_a_wrong_token_is_reported_before_anything_missing(
    db_session: Session,
) -> None:
    with pytest.raises(InviteTokenInvalid):
        accept_external_invite(db_session, "invalid.token.here")


# --- an address an account already has --------------------------------------


def test_an_account_with_the_address_is_given_access(
    db_session: Session, invited: User
) -> None:
    """Named as having granted it themselves: nobody is signed in."""
    accepted = accept_external_invite(db_session, _invite())
    db_session.commit()

    assert accepted.user.id == invited.id
    assert accepted.registered is False

    (grant,) = _grants(db_session, invited)

    assert grant.patient_id == PATIENT
    assert grant.granted_by_user_id == invited.id
    assert grant.revoked_at is None
    assert _accounts(db_session) == ["invited"]


def test_the_address_is_matched_in_any_capitals(
    db_session: Session, invited: User
) -> None:
    accepted = accept_external_invite(
        db_session, _invite(email=" Invited@Example.Test ")
    )

    assert accepted.user.id == invited.id
    assert accepted.registered is False


def test_nothing_else_about_an_existing_account_is_touched(
    db_session: Session, invited: User
) -> None:
    """Not its password, its username, nor what it is."""
    accept_external_invite(
        db_session,
        _invite(user_type="patient_advocate"),
        username="somebody-else",
        password="AnotherPassword123!",
    )
    db_session.commit()
    db_session.refresh(invited)

    assert invited.username == "invited"
    assert verify_password(PASSWORD, invited.password_hash)
    assert invited.base_profession == "patient"
    assert _accounts(db_session) == ["invited"]


def test_an_existing_account_needs_no_username_or_password(
    db_session: Session, invited: User
) -> None:
    accepted = accept_external_invite(
        db_session, _invite(), username=None, password=None
    )

    assert accepted.registered is False


def test_a_username_another_account_has_does_not_matter_to_an_existing_one(
    db_session: Session, invited: User
) -> None:
    _person(db_session, "colleague")

    accepted = accept_external_invite(
        db_session, _invite(), username="colleague", password=PASSWORD
    )

    assert accepted.user.id == invited.id


def test_access_already_held_is_not_written_twice(
    db_session: Session, invited: User
) -> None:
    accept_external_invite(db_session, _invite())
    db_session.commit()

    accept_external_invite(db_session, _invite())
    db_session.commit()

    assert len(_grants(db_session, invited)) == 1


def test_access_that_was_taken_away_is_given_back(
    db_session: Session, invited: User
) -> None:
    """What the route does today: the same token undoes a revocation."""
    accept_external_invite(db_session, _invite())
    db_session.commit()
    (grant,) = _grants(db_session, invited)
    grant.revoked_at = datetime.now(UTC)
    db_session.commit()

    accept_external_invite(db_session, _invite())
    db_session.commit()

    (grant,) = _grants(db_session, invited)

    assert grant.revoked_at is None


def test_access_to_one_patient_says_nothing_of_another(
    db_session: Session, invited: User
) -> None:
    accept_external_invite(db_session, _invite())
    accept_external_invite(db_session, _invite(patient_id="patient-xyz"))
    db_session.commit()

    assert {grant.patient_id for grant in _grants(db_session, invited)} == {
        PATIENT,
        "patient-xyz",
    }


def test_a_deactivated_account_is_still_given_access(
    db_session: Session,
) -> None:
    """What the route does today: it does not ask whether it is active.

    The account stays deactivated, so nobody can sign in to use it.
    """
    gone = _person(db_session, "gone", INVITED, active=False)

    accepted = accept_external_invite(db_session, _invite())
    db_session.commit()
    db_session.refresh(gone)

    assert accepted.user.id == gone.id
    assert accepted.registered is False
    assert gone.is_active is False
    assert len(_grants(db_session, gone)) == 1


# --- an address no account has ----------------------------------------------


@pytest.mark.parametrize(
    "sent",
    [
        {},
        {"username": "newcomer"},
        {"password": PASSWORD},
        {"username": "", "password": PASSWORD},
        {"username": "newcomer", "password": ""},
    ],
    ids=[
        "neither",
        "no password",
        "no username",
        "an empty username",
        "an empty password",
    ],
)
def test_a_new_account_needs_a_username_and_a_password(
    db_session: Session, sent: dict[str, str]
) -> None:
    with pytest.raises(InviteNeedsUsernameAndPassword) as refusal:
        accept_external_invite(db_session, _invite(), **sent)

    assert refusal.value.status_code == 422
    assert (
        refusal.value.message
        == "username and password required for new registration"
    )
    assert _accounts(db_session) == []


def test_a_username_another_account_has_is_refused(
    db_session: Session,
) -> None:
    _person(db_session, "colleague")

    with pytest.raises(InviteUsernameTaken) as refusal:
        accept_external_invite(
            db_session, _invite(), username="colleague", password=PASSWORD
        )

    assert refusal.value.status_code == 409
    assert refusal.value.message == "Username already taken"
    assert _accounts(db_session) == ["colleague"]


def test_something_missing_is_reported_before_a_taken_username(
    db_session: Session,
) -> None:
    _person(db_session, "colleague")

    with pytest.raises(InviteNeedsUsernameAndPassword):
        accept_external_invite(db_session, _invite(), username="colleague")


def test_a_new_account_is_made_with_access_to_the_patient(
    db_session: Session,
) -> None:
    accepted = accept_external_invite(
        db_session, _invite(), username="newcomer", password=PASSWORD
    )
    db_session.commit()

    made = accepted.user

    assert accepted.registered is True
    assert made.id is not None
    assert made.username == "newcomer"
    assert made.email == INVITED
    assert made.password_hash != PASSWORD
    assert verify_password(PASSWORD, made.password_hash)
    assert made.is_active is True
    assert made.platform_role == "standard"

    (grant,) = _grants(db_session, made)

    assert grant.patient_id == PATIENT
    assert grant.granted_by_user_id == made.id
    assert grant.revoked_at is None


def test_the_address_comes_from_the_token_tidied(
    db_session: Session,
) -> None:
    accepted = accept_external_invite(
        db_session,
        _invite(email=" Invited@Example.Test "),
        username="newcomer",
        password=PASSWORD,
    )

    assert accepted.user.email == INVITED


def test_a_new_accounts_address_is_not_marked_verified(
    db_session: Session,
) -> None:
    """What the route does today, though the invite went to the address."""
    accepted = accept_external_invite(
        db_session, _invite(), username="newcomer", password=PASSWORD
    )
    db_session.commit()

    assert accepted.user.email_verified is False


@pytest.mark.parametrize("user_type", ["external_hcp", "patient_advocate"])
def test_what_the_new_account_is_comes_from_the_token(
    db_session: Session, user_type: str
) -> None:
    """Holding what that profession gives, written as rows."""
    accepted = accept_external_invite(
        db_session,
        _invite(user_type=user_type),
        username="newcomer",
        password=PASSWORD,
    )
    db_session.commit()

    assert accepted.user.base_profession == user_type
    assert set(accepted.user.get_final_competencies()) == {
        "access_granted_patient_records"
    }


def test_the_username_is_held_as_sent(db_session: Session) -> None:
    """Not trimmed, so one with spaces round it is another username."""
    _person(db_session, "colleague")

    accepted = accept_external_invite(
        db_session, _invite(), username=" colleague ", password=PASSWORD
    )

    assert accepted.user.username == " colleague "


def test_no_length_is_asked_of_the_password(db_session: Session) -> None:
    """What the route does today: one character will do."""
    accepted = accept_external_invite(
        db_session, _invite(), username="newcomer", password="1"
    )

    assert verify_password("1", accepted.user.password_hash)


# --- a token used again -----------------------------------------------------


def test_a_token_used_again_finds_the_account_it_made(
    db_session: Session,
) -> None:
    """Nothing records that a token was used, so it works until it runs out.

    The second use makes nobody and changes no password: the address now
    has an account, so what was sent is not looked at.
    """
    token = _invite()
    first = accept_external_invite(
        db_session, token, username="newcomer", password=PASSWORD
    )
    db_session.commit()

    second = accept_external_invite(
        db_session, token, username="intruder", password="Intruder123!"
    )
    db_session.commit()

    assert second.registered is False
    assert second.user.id == first.user.id
    assert _accounts(db_session) == ["newcomer"]
    assert verify_password(PASSWORD, first.user.password_hash)
    assert len(_grants(db_session, first.user)) == 1
