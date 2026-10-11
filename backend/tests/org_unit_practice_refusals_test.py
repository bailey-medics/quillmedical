"""What the practice routes answer when a change is not allowed.

The rule is in ``app.org_units.practice`` and is tested there. This
drives the routes that ask it, to pin what a caller is sent: the status
and the ``detail`` each gave when the rule was written inside
``app.org_units.router``. The route tests checked the statuses and, at
most, a word of the detail before the rule moved.

Covers:
- POST   /api/org-units/{unit_id}/practising-competencies
- DELETE /api/org-units/{unit_id}/practising-competencies/{user_id}/{competency}
- PATCH  /api/users/{user_id}, which gathers the same refusals
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, PractisingCompetency, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

PASSWORD = "Password123!"
#: An id no org unit and no user has.
NOWHERE = 999_999
NOBODY = 999_999
#: Held by a consultant, from their profession.
HELD = "perform_venepuncture"
#: Not held by a consultant.
NOT_HELD = "manage_users"
ALSO_NOT_HELD = "manage_teaching"
#: One a teaching admin may grant.
TEACHING = "view_teaching_analytics"

NOT_FOUND = "Place not found"
OFF_THE_WHITELIST = "You may not grant or remove: perform_venepuncture."


def _person(
    db: Session, username: str, profession: str, *units: OrgUnit
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()
    for unit in units:
        add_org_unit_member(db, unit.id, user.id, "staff")
    db.commit()
    db.refresh(user)

    return user


def _org_unit(
    db: Session, name: str, type_: str, parent: OrgUnit | None = None
) -> OrgUnit:
    unit = OrgUnit(
        name=name,
        type=type_,
        parent_id=parent.id if parent is not None else None,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)

    return unit


def _rows(db: Session, user: User, unit: OrgUnit) -> set[str]:
    return set(
        db.scalars(
            select(PractisingCompetency.competency).where(
                PractisingCompetency.user_id == user.id,
                PractisingCompetency.org_unit_id == unit.id,
            )
        ).all()
    )


def _practice(unit_id: int) -> str:
    return f"/api/org-units/{unit_id}/practising-competencies"


@pytest.fixture
def trust(db_session: Session, test_admin: User) -> OrgUnit:
    """Where the administrator belongs, and administers."""
    org = _org_unit(db_session, "Severn Trust", "organisation")
    add_org_unit_member(db_session, org.id, test_admin.id, "staff")
    administers(db_session, test_admin.id, org.id)
    db_session.commit()

    return org


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """Somebody else's tree: it exists, outside the caller's reach."""
    return _org_unit(db_session, "Wye Trust", "organisation")


@pytest.fixture
def surgeon(db_session: Session, trust: OrgUnit) -> User:
    """A consultant at the trust."""
    return _person(db_session, "surgeon", "consultant", trust)


@pytest.fixture
def coordinator_client(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> TestClient:
    """Signed in as a teaching admin at the trust: a scoped manager."""
    coordinator = _person(db_session, "coordinator", "teaching_admin", trust)
    response = test_client.post(
        "/api/auth/login",
        json={"username": coordinator.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")

    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf

    return test_client


# --- the org unit named -----------------------------------------------------


def test_authorising_at_an_id_no_org_unit_has_is_not_found(
    authenticated_admin_client: TestClient, surgeon: User
) -> None:
    resp = authenticated_admin_client.post(
        _practice(NOWHERE), json={"user_id": surgeon.id, "competency": HELD}
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": NOT_FOUND}


def test_authorising_at_an_org_unit_outside_their_reach_reads_the_same(
    authenticated_admin_client: TestClient,
    db_session: Session,
    other_trust: OrgUnit,
    surgeon: User,
) -> None:
    """The same words, so the answer does not confirm it exists."""
    resp = authenticated_admin_client.post(
        _practice(other_trust.id),
        json={"user_id": surgeon.id, "competency": HELD},
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": NOT_FOUND}
    assert _rows(db_session, surgeon, other_trust) == set()


def test_withdrawing_at_an_id_no_org_unit_has_is_not_found(
    authenticated_admin_client: TestClient, surgeon: User
) -> None:
    resp = authenticated_admin_client.delete(
        f"{_practice(NOWHERE)}/{surgeon.id}/{HELD}"
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": NOT_FOUND}


def test_withdrawing_at_an_org_unit_outside_their_reach_reads_the_same(
    authenticated_admin_client: TestClient,
    db_session: Session,
    other_trust: OrgUnit,
    surgeon: User,
) -> None:
    db_session.add(
        PractisingCompetency(
            user_id=surgeon.id, org_unit_id=other_trust.id, competency=HELD
        )
    )
    db_session.commit()

    resp = authenticated_admin_client.delete(
        f"{_practice(other_trust.id)}/{surgeon.id}/{HELD}"
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": NOT_FOUND}
    assert _rows(db_session, surgeon, other_trust) == {HELD}


# --- what may be authorised, and for whom -----------------------------------


def test_authorising_at_a_room_names_the_type(
    authenticated_admin_client: TestClient,
    db_session: Session,
    test_admin: User,
    trust: OrgUnit,
    surgeon: User,
) -> None:
    room = _org_unit(db_session, "Room 4", "room", trust)
    # Authorised at the room itself, so the refusal is about what a room
    # holds and not about seeing it.
    administers(db_session, test_admin.id, room.id)

    resp = authenticated_admin_client.post(
        _practice(room.id), json={"user_id": surgeon.id, "competency": HELD}
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": "Nobody practises anything at a room."}
    assert _rows(db_session, surgeon, room) == set()


def test_authorising_for_an_id_nobody_has_is_not_found(
    authenticated_admin_client: TestClient, trust: OrgUnit
) -> None:
    resp = authenticated_admin_client.post(
        _practice(trust.id), json={"user_id": NOBODY, "competency": HELD}
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": "User not found"}


def test_authorising_a_competency_they_do_not_hold_names_it(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    surgeon: User,
) -> None:
    resp = authenticated_admin_client.post(
        _practice(trust.id),
        json={"user_id": surgeon.id, "competency": NOT_HELD},
    )

    assert resp.status_code == 422
    assert resp.json() == {
        "detail": (
            "They do not hold manage_users, so it cannot be authorised "
            "here. Grant it to them first."
        )
    }
    assert _rows(db_session, surgeon, trust) == set()


# --- a caller acting through a scoped manager -------------------------------


def test_a_scoped_manager_authorising_a_non_member_is_told_member_not_found(
    coordinator_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    outsider = _person(db_session, "outsider", "teaching_admin")

    resp = coordinator_client.post(
        _practice(trust.id),
        json={"user_id": outsider.id, "competency": TEACHING},
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Member not found"}
    assert _rows(db_session, outsider, trust) == set()


def test_a_scoped_manager_authorising_off_its_whitelist_names_the_competency(
    coordinator_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    surgeon: User,
) -> None:
    resp = coordinator_client.post(
        _practice(trust.id), json={"user_id": surgeon.id, "competency": HELD}
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": OFF_THE_WHITELIST}
    assert _rows(db_session, surgeon, trust) == set()


def test_a_scoped_manager_withdrawing_off_its_whitelist_names_the_competency(
    coordinator_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    surgeon: User,
) -> None:
    db_session.add(
        PractisingCompetency(
            user_id=surgeon.id, org_unit_id=trust.id, competency=HELD
        )
    )
    db_session.commit()

    resp = coordinator_client.delete(
        f"{_practice(trust.id)}/{surgeon.id}/{HELD}"
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": OFF_THE_WHITELIST}
    assert _rows(db_session, surgeon, trust) == {HELD}


# --- the user form, which gathers every refusal -----------------------------


def test_the_user_form_joins_every_distinct_reason_under_the_first_status(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    surgeon: User,
) -> None:
    """One message naming everything wrong, each reason once."""
    resp = authenticated_admin_client.patch(
        f"/api/users/{surgeon.id}",
        json={
            "practising": [
                {
                    "org_unit_id": trust.id,
                    "competencies": [NOT_HELD, HELD, ALSO_NOT_HELD],
                }
            ]
        },
    )

    assert resp.status_code == 422
    assert resp.json() == {
        "detail": (
            "They do not hold manage_teaching, so it cannot be authorised "
            "here. Grant it to them first. "
            "They do not hold manage_users, so it cannot be authorised "
            "here. Grant it to them first."
        )
    }
    assert _rows(db_session, surgeon, trust) == set()


def test_the_user_form_says_a_repeated_reason_once(
    coordinator_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    surgeon: User,
) -> None:
    """Two org units refusing in the same words are one reason."""
    ward = _org_unit(db_session, "Ward 4", "site", trust)
    add_org_unit_member(db_session, ward.id, surgeon.id, "staff")
    db_session.commit()

    resp = coordinator_client.patch(
        f"/api/users/{surgeon.id}",
        json={
            "practising": [
                {"org_unit_id": trust.id, "competencies": [HELD]},
                {"org_unit_id": ward.id, "competencies": [HELD]},
            ]
        },
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": OFF_THE_WHITELIST}
    assert _rows(db_session, surgeon, trust) == set()
