"""What ``POST /api/users`` answers when the new account is an operator.

The rule is in ``app.users.competencies``, where saving a page asks it
too, and is tested there and in ``app.users.create``. This drives the
route, to pin what a caller is sent.

Only an operator may make another. Somebody holding ``manage_users``
who is not one is refused in the words a refused promotion gives, and
an operator made here holds the operator competencies, as one promoted
does. Before 11 October 2026 the create route asked neither, so the
refusal on a save could be stepped round by making a new account.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.base_professions import (
    SUPERADMIN_PROFESSION,
    get_profession_base_competencies,
)
from app.models import OrgUnit, User, org_unit_member
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

PASSWORD = "Administrator123!"

NO_PROMOTION = "Cannot grant the superadmin platform role"


def _administrator(
    db: Session,
    org: OrgUnit,
    username: str,
    profession: str,
    platform_role: str,
) -> User:
    """Somebody at *org* who administers it."""
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, org.id, user.id, "staff")
    administers(db, user.id, org.id)
    db.commit()
    db.refresh(user)

    return user


def _sign_in(client: TestClient, user: User) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = client.cookies.get("XSRF-TOKEN")

    if csrf:
        client.headers["X-CSRF-Token"] = csrf

    return client


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture
def user_manager_client(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> TestClient:
    """Signed in holding ``manage_users``, and not an operator."""
    manager = _administrator(
        db_session, trust, "manager", "system_administrator", "standard"
    )

    return _sign_in(test_client, manager)


@pytest.fixture
def operator_client(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> TestClient:
    """Signed in as somebody who operates Quill."""
    operator = _administrator(
        db_session, trust, "operator", "superadmin_profession", "superadmin"
    )

    return _sign_in(test_client, operator)


def _new_user(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "New Starter",
        "username": "new_starter",
        "email": "new_starter@example.test",
        "password": "NewStarter123!",
        "base_profession": "receptionist",
    }
    body.update(overrides)

    return body


def _made(db: Session) -> User | None:
    db.expire_all()

    return db.scalar(select(User).where(User.username == "new_starter"))


def _members(db: Session) -> set[int]:
    """Everybody who belongs to an org unit."""
    members: set[int] = set()

    for (user_id,) in db.execute(select(org_unit_member.c.user_id)):
        members.add(user_id)

    return members


def test_making_an_operator_without_being_one_is_a_403_with_the_reason(
    user_manager_client: TestClient, trust: OrgUnit
) -> None:
    response = user_manager_client.post(
        "/api/users",
        json=_new_user(platform_role="superadmin", org_unit_ids=[trust.id]),
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PROMOTION}


def test_a_refused_operator_leaves_nobody_and_nothing_behind(
    user_manager_client: TestClient, trust: OrgUnit, db_session: Session
) -> None:
    """Refused before the account is written, so no part of it is there."""
    members_before = _members(db_session)
    accounts_before = set(db_session.scalars(select(User.id)).all())

    response = user_manager_client.post(
        "/api/users",
        json=_new_user(
            platform_role="superadmin",
            additional_competencies=["view_teaching_analytics"],
            org_unit_ids=[trust.id],
            practising=[
                {
                    "org_unit_id": trust.id,
                    "competencies": ["view_teaching_analytics"],
                }
            ],
        ),
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PROMOTION}
    assert _made(db_session) is None
    assert set(db_session.scalars(select(User.id)).all()) == accounts_before
    assert _members(db_session) == members_before


def test_an_operator_makes_an_operator_who_holds_the_operator_competencies(
    operator_client: TestClient, trust: OrgUnit, db_session: Session
) -> None:
    """Otherwise every competency gate would refuse the new operator."""
    response = operator_client.post(
        "/api/users",
        json=_new_user(platform_role="superadmin", org_unit_ids=[trust.id]),
    )

    made = _made(db_session)

    assert response.status_code == 200, response.text
    assert made is not None
    assert made.platform_role == "superadmin"
    # The profession they were given is not overwritten.
    assert made.base_profession == "receptionist"
    assert set(made.get_final_competencies()) == set(
        get_profession_base_competencies("receptionist")
    ) | set(get_profession_base_competencies(SUPERADMIN_PROFESSION))


def test_a_user_manager_still_makes_a_standard_account_as_before(
    user_manager_client: TestClient, trust: OrgUnit, db_session: Session
) -> None:
    """Sent as ``standard`` or left out, and given nothing beyond it."""
    response = user_manager_client.post(
        "/api/users",
        json=_new_user(platform_role="standard", org_unit_ids=[trust.id]),
    )

    made = _made(db_session)

    assert response.status_code == 200, response.text
    assert made is not None
    assert made.platform_role == "standard"
    assert set(made.get_final_competencies()) == set(
        get_profession_base_competencies("receptionist")
    )
