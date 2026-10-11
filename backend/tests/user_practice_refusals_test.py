"""What the people routes answer when setting practice is refused.

The rules are in ``app.users.practice`` and are tested there. This
drives the routes, to pin what a caller is sent: the status and the
``detail`` each route gave when the rules were written inside
``app.main``. No test pinned these two refusals by their words before
the rules moved. The third, which joins what ``practice_refusal``
answers, is pinned in ``org_unit_practice_refusals_test.py``.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.grants import sync_competency_rows
from app.models import OrgUnit, PractisingCompetency, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

#: Held by a consultant, from their profession.
HELD = "perform_venepuncture"

MAY_NOT_SET_PRACTICE = "You may not set where somebody practises."


def _not_a_member_of(*units: OrgUnit) -> str:
    listed = ", ".join(str(unit.id) for unit in units)

    return (
        "Practice can be set only where they belong. Not a member of "
        f"place {listed}."
    )


def _person(db: Session, username: str, *units: OrgUnit) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.flush()

    for unit in units:
        add_org_unit_member(db, unit.id, user.id, "staff")

    db.commit()
    db.refresh(user)

    return user


def _new_user(*units: OrgUnit, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "New Starter",
        "username": "new.starter",
        "email": "new.starter@example.test",
        "password": "NewStarter123!",
        "base_profession": "consultant",
        "org_unit_ids": [unit.id for unit in units],
    }
    body.update(overrides)

    return body


def _at(unit: OrgUnit, *competencies: str) -> dict[str, Any]:
    return {"org_unit_id": unit.id, "competencies": list(competencies)}


def _rows(db: Session, user: User, unit: OrgUnit) -> set[str]:
    return set(
        db.execute(
            select(PractisingCompetency.competency).where(
                PractisingCompetency.user_id == user.id,
                PractisingCompetency.org_unit_id == unit.id,
            )
        )
        .scalars()
        .all()
    )


def _created(db: Session) -> User | None:
    return db.scalar(select(User).where(User.username == "new.starter"))


def _unit(
    db: Session, admin: User, name: str, type_: str, parent: int | None = None
) -> OrgUnit:
    """An org unit the admin administers."""
    unit = OrgUnit(name=name, type=type_, parent_id=parent)
    db.add(unit)
    db.commit()
    db.refresh(unit)
    administers(db, admin.id, unit.id)
    db.commit()

    return unit


@pytest.fixture
def trust(db_session: Session, test_admin: User) -> OrgUnit:
    unit = _unit(db_session, test_admin, "Own Trust", "hospital_team")
    add_org_unit_member(db_session, unit.id, test_admin.id, "staff")
    db_session.commit()

    return unit


@pytest.fixture
def ward(db_session: Session, trust: OrgUnit, test_admin: User) -> OrgUnit:
    return _unit(db_session, test_admin, "Ward A", "ward", trust.id)


@pytest.fixture
def second_ward(
    db_session: Session, trust: OrgUnit, test_admin: User
) -> OrgUnit:
    return _unit(db_session, test_admin, "Ward B", "ward", trust.id)


@pytest.fixture
def without_practice(db_session: Session, test_admin: User) -> None:
    """Leave the admin holding ``manage_users`` and not the other."""
    sync_competency_rows(
        test_admin,
        additional=[],
        removed=["manage_practising_competencies"],
        source="admin",
    )
    db_session.commit()


# --- where they belong ------------------------------------------------------


def test_updating_practice_where_they_do_not_belong_names_the_place(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    visitor = _person(db_session, "visitor", trust)

    resp = authenticated_admin_client.patch(
        f"/api/users/{visitor.id}",
        json={"practising": [_at(trust, HELD), _at(ward, HELD)]},
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": _not_a_member_of(ward)}
    assert _rows(db_session, visitor, trust) == set()


def test_updating_names_every_such_place_lowest_first(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    ward: OrgUnit,
    second_ward: OrgUnit,
) -> None:
    """Sent highest first, and the word stays "place"."""
    visitor = _person(db_session, "visitor", trust)

    resp = authenticated_admin_client.patch(
        f"/api/users/{visitor.id}",
        json={"practising": [_at(second_ward, HELD), _at(ward, HELD)]},
    )

    assert ward.id < second_ward.id
    assert resp.status_code == 422
    assert resp.json() == {"detail": _not_a_member_of(ward, second_ward)}


def test_creating_with_practice_where_they_are_not_put_names_the_place(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    ward: OrgUnit,
    second_ward: OrgUnit,
) -> None:
    resp = authenticated_admin_client.post(
        "/api/users",
        json=_new_user(
            trust, practising=[_at(second_ward, HELD), _at(ward, HELD)]
        ),
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": _not_a_member_of(ward, second_ward)}
    assert _created(db_session) is None


# --- who may set practice at all --------------------------------------------


def test_updating_practice_without_the_competency_is_refused(
    authenticated_admin_client: TestClient,
    db_session: Session,
    without_practice: None,
    trust: OrgUnit,
) -> None:
    surgeon = _person(db_session, "surgeon", trust)

    resp = authenticated_admin_client.patch(
        f"/api/users/{surgeon.id}", json={"practising": [_at(trust, HELD)]}
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": MAY_NOT_SET_PRACTICE}
    assert _rows(db_session, surgeon, trust) == set()


def test_creating_with_practice_without_the_competency_is_refused(
    authenticated_admin_client: TestClient,
    db_session: Session,
    without_practice: None,
    trust: OrgUnit,
) -> None:
    resp = authenticated_admin_client.post(
        "/api/users", json=_new_user(trust, practising=[_at(trust, HELD)])
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": MAY_NOT_SET_PRACTICE}
    assert _created(db_session) is None
