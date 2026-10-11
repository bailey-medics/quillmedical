"""What the member routes of an org unit answer when it is not allowed.

The rules are in ``app.org_units.members`` and ``app.org_units.practice``
and are tested there. This drives the routes that ask them, to pin what
a caller is sent: the status and the ``detail`` each gave when the rule
was written inside ``app.org_units.router``.

Covers:
- POST   /api/org-units/{unit_id}/members
- DELETE /api/org-units/{unit_id}/members/{user_id}
- PUT    /api/org-units/{unit_id}/clinical-lead
- POST   /api/org-units/{unit_id}/members/{user_id}/grant-and-authorise
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.practising import competencies_at
from app.models import OrgUnit, Position, User, org_unit_member
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold
from tests.places import administers

PASSWORD = "Password123!"
#: An id no org unit and no user has.
NOWHERE = 999_999
NOBODY = 999_999

NOT_FOUND = "Place not found"


def _person(
    db: Session,
    username: str,
    profession: str,
    *units: OrgUnit,
    platform_role: str = "standard",
) -> User:
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
def site(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _org_unit(db_session, "Ward 4", "site", trust)


@pytest.fixture
def coordinator_client(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> TestClient:
    """Signed in as a teaching admin at the trust: a scoped manager."""
    coordinator = _person(db_session, "coordinator", "teaching_admin", trust)

    return _sign_in(test_client, coordinator)


#: Held by a consultant, from their profession, and by no delegate.
CLINICAL = "perform_venepuncture"
#: One a teaching admin may grant, which a delegate does not hold.
TEACHING = "view_teaching_analytics"

ACCOUNT_OUT_OF_SCOPE = "This account is outside what you may manage."
OFF_THE_WHITELIST = "You may not grant or remove: perform_venepuncture."


def _capacity(db: Session, unit: OrgUnit, user: User) -> str | None:
    db.expire_all()

    return db.scalar(
        select(org_unit_member.c.capacity).where(
            org_unit_member.c.org_unit_id == unit.id,
            org_unit_member.c.user_id == user.id,
        )
    )


def _members(unit_id: int) -> str:
    return f"/api/org-units/{unit_id}/members"


def _lead(unit_id: int) -> str:
    return f"/api/org-units/{unit_id}/clinical-lead"


def _grant(unit_id: int, user_id: int) -> str:
    return f"/api/org-units/{unit_id}/members/{user_id}/grant-and-authorise"


@pytest.fixture
def room(db_session: Session, trust: OrgUnit) -> OrgUnit:
    """Inside the trust: nobody belongs to, leads or practises at a room."""
    return _org_unit(db_session, "Room 4", "room", trust)


@pytest.fixture
def surgeon(db_session: Session) -> User:
    """A consultant, who belongs nowhere."""
    return _person(db_session, "surgeon", "consultant")


@pytest.fixture
def colleague(db_session: Session, trust: OrgUnit) -> User:
    """A consultant at the trust."""
    return _person(db_session, "colleague", "consultant", trust)


@pytest.fixture
def delegate(db_session: Session) -> User:
    """Holds only what a teaching admin may grant, and belongs nowhere."""
    return _person(db_session, "delegate", "teaching_delegate")


# --- adding a member --------------------------------------------------------


def test_adding_at_an_org_unit_outside_their_reach_is_not_found(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
    surgeon: User,
) -> None:
    for unit_id in (other_trust.id, NOWHERE):
        resp = authenticated_admin_client.post(
            _members(unit_id), json={"user_id": surgeon.id}
        )

        assert resp.status_code == 404
        assert resp.json() == {"detail": NOT_FOUND}

    assert _capacity(db_session, other_trust, surgeon) is None


def test_adding_to_a_room_names_the_type(
    authenticated_admin_client: TestClient,
    db_session: Session,
    room: OrgUnit,
    surgeon: User,
) -> None:
    resp = authenticated_admin_client.post(
        _members(room.id), json={"user_id": surgeon.id}
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": "Nobody belongs to a room."}
    assert _capacity(db_session, room, surgeon) is None


def test_adding_in_an_unknown_capacity_lists_the_capacities(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    surgeon: User,
) -> None:
    resp = authenticated_admin_client.post(
        _members(trust.id), json={"user_id": surgeon.id, "capacity": "visitor"}
    )

    assert resp.status_code == 422
    assert resp.json() == {
        "detail": (
            "Unknown capacity. Must be one of: staff, trainee, external, "
            "patient"
        )
    }
    assert _capacity(db_session, trust, surgeon) is None


def test_adding_an_id_nobody_has_is_not_found(
    authenticated_admin_client: TestClient, trust: OrgUnit
) -> None:
    resp = authenticated_admin_client.post(
        _members(trust.id), json={"user_id": NOBODY}
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": "User not found"}


def test_a_scoped_manager_changing_a_wider_accounts_capacity_is_refused(
    coordinator_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    colleague: User,
) -> None:
    resp = coordinator_client.post(
        _members(trust.id),
        json={"user_id": colleague.id, "capacity": "external"},
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": ACCOUNT_OUT_OF_SCOPE}
    # The capacity was written before the refusal, and went with it.
    assert _capacity(db_session, trust, colleague) == "staff"


def test_a_scoped_manager_giving_a_wider_account_a_profession_is_refused(
    coordinator_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    surgeon: User,
) -> None:
    resp = coordinator_client.post(
        _members(trust.id),
        json={"user_id": surgeon.id, "base_profession": "teaching_delegate"},
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": ACCOUNT_OUT_OF_SCOPE}
    # The membership was written before the refusal, and went with it.
    assert _capacity(db_session, trust, surgeon) is None
    db_session.refresh(surgeon)
    assert surgeon.base_profession == "consultant"


def test_a_scoped_manager_giving_a_profession_off_its_list_names_it(
    coordinator_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    delegate: User,
) -> None:
    resp = coordinator_client.post(
        _members(trust.id),
        json={"user_id": delegate.id, "base_profession": "consultant"},
    )

    assert resp.status_code == 403
    assert resp.json() == {
        "detail": "You may not give the profession consultant."
    }
    assert _capacity(db_session, trust, delegate) is None
    db_session.refresh(delegate)
    assert delegate.base_profession == "teaching_delegate"


def test_a_scoped_manager_granting_off_its_whitelist_names_the_competency(
    coordinator_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    delegate: User,
) -> None:
    resp = coordinator_client.post(
        _members(trust.id),
        json={"user_id": delegate.id, "additional_competencies": [CLINICAL]},
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": OFF_THE_WHITELIST}
    assert _capacity(db_session, trust, delegate) is None
    db_session.refresh(delegate)
    assert CLINICAL not in delegate.get_final_competencies()


# --- removing a member ------------------------------------------------------


def test_a_scoped_manager_removing_a_wider_account_is_refused(
    coordinator_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    colleague: User,
) -> None:
    resp = coordinator_client.delete(f"{_members(trust.id)}/{colleague.id}")

    assert resp.status_code == 403
    assert resp.json() == {"detail": ACCOUNT_OUT_OF_SCOPE}
    assert _capacity(db_session, trust, colleague) == "staff"


# --- naming the clinical lead -----------------------------------------------


def test_naming_a_lead_outside_their_reach_is_not_found(
    authenticated_admin_client: TestClient,
    trust: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    for unit_id in (other_trust.id, NOWHERE):
        resp = authenticated_admin_client.put(
            _lead(unit_id), json={"user_id": None}
        )

        assert resp.status_code == 404
        assert resp.json() == {"detail": NOT_FOUND}


def test_naming_the_lead_of_a_room_names_the_type(
    authenticated_admin_client: TestClient, room: OrgUnit
) -> None:
    resp = authenticated_admin_client.put(
        _lead(room.id), json={"user_id": None}
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": "Nobody is clinical lead of a room."}


def test_naming_an_id_nobody_has_as_lead_is_not_found(
    authenticated_admin_client: TestClient, trust: OrgUnit
) -> None:
    resp = authenticated_admin_client.put(
        _lead(trust.id), json={"user_id": NOBODY}
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": "User not found"}


def test_naming_somebody_who_is_not_a_member_is_refused(
    authenticated_admin_client: TestClient, trust: OrgUnit, surgeon: User
) -> None:
    resp = authenticated_admin_client.put(
        _lead(trust.id), json={"user_id": surgeon.id}
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": "That person is not at this place."}


def test_a_post_that_refuses_them_is_said_in_fixed_words(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    delegate: User,
) -> None:
    """The post asks for a competency they may not practise here."""
    add_org_unit_member(db_session, trust.id, delegate.id, "staff")
    db_session.add(
        Position(
            org_unit_id=trust.id,
            kind="clinical_lead",
            title="Clinical lead",
            max_holders=1,
            requires_competency="certify_death",
        )
    )
    db_session.commit()

    resp = authenticated_admin_client.put(
        _lead(trust.id), json={"user_id": delegate.id}
    )

    assert resp.status_code == 409
    assert resp.json() == {
        "detail": "That person cannot be made clinical lead here."
    }


# --- granting and authorising together --------------------------------------


def test_granting_with_manage_users_alone_is_not_allowed(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    colleague: User,
) -> None:
    """The route admits them, and the rule asks for both competencies."""
    clerk = _person(db_session, "clerk", "teaching_delegate", trust)
    hold(clerk, "manage_users")
    db_session.commit()
    administers(db_session, clerk.id, trust.id)

    resp = _sign_in(test_client, clerk).post(
        _grant(trust.id, colleague.id), json={"competency": TEACHING}
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": "Not allowed"}
    db_session.refresh(colleague)
    assert TEACHING not in colleague.get_final_competencies()


def test_granting_at_an_org_unit_outside_their_reach_is_not_found(
    authenticated_admin_client: TestClient,
    trust: OrgUnit,
    other_trust: OrgUnit,
    colleague: User,
) -> None:
    for unit_id in (other_trust.id, NOWHERE):
        resp = authenticated_admin_client.post(
            _grant(unit_id, colleague.id), json={"competency": TEACHING}
        )

        assert resp.status_code == 404
        assert resp.json() == {"detail": NOT_FOUND}


def test_granting_at_a_room_names_the_type(
    authenticated_admin_client: TestClient, room: OrgUnit, colleague: User
) -> None:
    resp = authenticated_admin_client.post(
        _grant(room.id, colleague.id), json={"competency": TEACHING}
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": "Nobody practises anything at a room."}


def test_granting_to_somebody_who_is_not_a_member_here_is_not_found(
    authenticated_admin_client: TestClient, trust: OrgUnit, surgeon: User
) -> None:
    for user_id in (surgeon.id, NOBODY):
        resp = authenticated_admin_client.post(
            _grant(trust.id, user_id), json={"competency": TEACHING}
        )

        assert resp.status_code == 404
        assert resp.json() == {"detail": "Member not found"}


def test_granting_to_a_member_of_an_org_unit_they_do_not_belong_to(
    authenticated_admin_client: TestClient,
    db_session: Session,
    test_admin: User,
    other_trust: OrgUnit,
) -> None:
    """Administering it opens its pages, and not its people's accounts."""
    administers(db_session, test_admin.id, other_trust.id)
    stranger = _person(db_session, "stranger", "consultant", other_trust)

    resp = authenticated_admin_client.post(
        _grant(other_trust.id, stranger.id), json={"competency": TEACHING}
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Member not found"}
    db_session.refresh(stranger)
    assert TEACHING not in stranger.get_final_competencies()


def test_granting_to_an_operator_is_refused(
    authenticated_admin_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    operator = _person(
        db_session,
        "operator",
        "superadmin_profession",
        trust,
        platform_role="superadmin",
    )

    resp = authenticated_admin_client.post(
        _grant(trust.id, operator.id), json={"competency": TEACHING}
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": "Cannot modify superadmin users"}


def test_granting_to_yourself_is_refused(
    authenticated_admin_client: TestClient,
    db_session: Session,
    test_admin: User,
    trust: OrgUnit,
) -> None:
    resp = authenticated_admin_client.post(
        _grant(trust.id, test_admin.id), json={"competency": TEACHING}
    )

    assert resp.status_code == 403
    assert resp.json() == {
        "detail": (
            "Competencies must be changed by another user who holds "
            "manage_users"
        )
    }
    db_session.refresh(test_admin)
    assert TEACHING not in test_admin.get_final_competencies()


def test_a_scoped_manager_granting_off_its_whitelist_is_refused(
    coordinator_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
) -> None:
    tutor = _person(db_session, "tutor", "teaching_admin", trust)

    resp = coordinator_client.post(
        _grant(trust.id, tutor.id), json={"competency": CLINICAL}
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": OFF_THE_WHITELIST}
    db_session.refresh(tutor)
    assert CLINICAL not in tutor.get_final_competencies()
    assert competencies_at(db_session, tutor, org_unit_id=trust.id) == set()
