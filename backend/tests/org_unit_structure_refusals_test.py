"""What making and changing an org unit answer when it is not allowed.

The rules are in ``app.org_units.structure`` and are tested there. This
drives the routes that ask them, to pin what a caller is sent: the
status and the ``detail`` each gave when the rule was written inside
``app.org_units.router``.

Covers:
- POST /api/org-units
- PUT  /api/org-units/{unit_id}
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password
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


UNKNOWN_TYPE = (
    "Unknown kind of place. Must be one of: organisation, hospital_team, "
    "gp_practice, private_clinic, teaching_establishment, site, hospital, "
    "building, ward, clinic, department, virtual, room"
)
SITE_IN_A_SITE = (
    "A site sits directly inside an organisation, not inside another site."
)
TOP_OF_A_TREE = (
    "A organisation is the top of a tree and does not sit inside anything."
)


def _names(db: Session) -> set[str]:
    db.expire_all()

    return set(db.scalars(select(OrgUnit.name)).all())


# --- making one -------------------------------------------------------------


def test_making_one_of_an_unknown_type_lists_the_types(
    authenticated_admin_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    resp = authenticated_admin_client.post(
        "/api/org-units",
        json={"name": "Folly", "type": "palace", "parent_id": trust.id},
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": UNKNOWN_TYPE}
    assert "Folly" not in _names(db_session)


def test_making_a_site_with_no_parent_names_the_type(
    authenticated_admin_client: TestClient, db_session: Session
) -> None:
    resp = authenticated_admin_client.post(
        "/api/org-units", json={"name": "Loose ward", "type": "site"}
    )

    assert resp.status_code == 422
    assert resp.json() == {
        "detail": "A site sits inside something. Name the place it belongs to."
    }
    assert "Loose ward" not in _names(db_session)


def test_an_administrator_starting_a_tree_is_told_it_takes_an_operator(
    authenticated_admin_client: TestClient, db_session: Session
) -> None:
    resp = authenticated_admin_client.post(
        "/api/org-units", json={"name": "Avon Trust", "type": "organisation"}
    )

    assert resp.status_code == 403
    assert resp.json() == {"detail": "Requires superadmin permissions"}
    assert "Avon Trust" not in _names(db_session)


def test_making_an_organisation_inside_another_names_the_type(
    authenticated_admin_client: TestClient, trust: OrgUnit
) -> None:
    resp = authenticated_admin_client.post(
        "/api/org-units",
        json={
            "name": "Avon Trust",
            "type": "organisation",
            "parent_id": trust.id,
        },
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": TOP_OF_A_TREE}


def test_making_one_inside_a_parent_outside_their_reach_is_not_found(
    authenticated_admin_client: TestClient,
    trust: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    for parent_id in (other_trust.id, NOWHERE):
        resp = authenticated_admin_client.post(
            "/api/org-units",
            json={"name": "Ward 9", "type": "site", "parent_id": parent_id},
        )

        assert resp.status_code == 404
        assert resp.json() == {"detail": NOT_FOUND}


def test_making_a_site_inside_a_site_is_refused(
    authenticated_admin_client: TestClient, db_session: Session, site: OrgUnit
) -> None:
    resp = authenticated_admin_client.post(
        "/api/org-units",
        json={"name": "Bay 1", "type": "site", "parent_id": site.id},
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": SITE_IN_A_SITE}
    assert "Bay 1" not in _names(db_session)


def test_a_site_made_inside_their_organisation_comes_back_trimmed(
    authenticated_admin_client: TestClient, trust: OrgUnit
) -> None:
    resp = authenticated_admin_client.post(
        "/api/org-units",
        json={
            "name": "  Ward 9 ",
            "type": "site",
            "parent_id": trust.id,
            "location": " Level 2 ",
        },
    )

    assert resp.status_code == 200
    assert resp.json()["name"] == "Ward 9"
    assert resp.json()["location"] == "Level 2"
    assert resp.json()["parent_id"] == trust.id
    assert resp.json()["is_root"] is False


# --- changing one -----------------------------------------------------------


def test_changing_one_outside_their_reach_is_not_found(
    authenticated_admin_client: TestClient,
    trust: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    for unit_id in (other_trust.id, NOWHERE):
        resp = authenticated_admin_client.put(
            f"/api/org-units/{unit_id}", json={"name": "Theirs"}
        )

        assert resp.status_code == 404
        assert resp.json() == {"detail": NOT_FOUND}


def test_a_scoped_manager_changing_an_organisation_is_told_what_it_takes(
    coordinator_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    resp = coordinator_client.put(
        f"/api/org-units/{trust.id}", json={"name": "Mine now"}
    )

    assert resp.status_code == 403
    assert resp.json() == {
        "detail": "Editing an organisation requires manage_users."
    }
    assert "Mine now" not in _names(db_session)


def test_a_scoped_manager_putting_an_organisation_out_of_use_is_told_the_same(
    coordinator_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The check is shared with ``PATCH /api/org-units/{unit_id}/active``."""
    resp = coordinator_client.patch(
        f"/api/org-units/{trust.id}/active", json={"is_active": False}
    )

    assert resp.status_code == 403
    assert resp.json() == {
        "detail": "Editing an organisation requires manage_users."
    }
    db_session.refresh(trust)
    assert trust.is_active is True


def test_changing_to_an_unknown_type_lists_the_types(
    authenticated_admin_client: TestClient, site: OrgUnit
) -> None:
    resp = authenticated_admin_client.put(
        f"/api/org-units/{site.id}", json={"type": "palace"}
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": UNKNOWN_TYPE}


def test_a_type_that_would_change_whether_it_has_a_parent_is_refused(
    authenticated_admin_client: TestClient, db_session: Session, site: OrgUnit
) -> None:
    resp = authenticated_admin_client.put(
        f"/api/org-units/{site.id}", json={"type": "organisation"}
    )

    assert resp.status_code == 422
    assert resp.json() == {
        "detail": (
            "That type would change whether this place sits inside "
            "another. Move it first, or create a new one."
        )
    }
    db_session.refresh(site)
    assert site.type == "site"


def test_moving_an_organisation_inside_another_names_the_type(
    authenticated_admin_client: TestClient,
    db_session: Session,
    test_admin: User,
    trust: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    administers(db_session, test_admin.id, other_trust.id)

    resp = authenticated_admin_client.put(
        f"/api/org-units/{trust.id}", json={"parent_id": other_trust.id}
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": TOP_OF_A_TREE}


def test_moving_one_inside_itself_is_refused(
    authenticated_admin_client: TestClient, site: OrgUnit
) -> None:
    resp = authenticated_admin_client.put(
        f"/api/org-units/{site.id}", json={"parent_id": site.id}
    )

    assert resp.status_code == 400
    assert resp.json() == {"detail": "A place cannot sit inside itself"}


def test_moving_one_to_a_parent_outside_their_reach_is_not_found(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    site: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    resp = authenticated_admin_client.put(
        f"/api/org-units/{site.id}",
        json={"name": "Moved", "parent_id": other_trust.id},
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": NOT_FOUND}
    # The name was set before the parent was refused, and went with it.
    db_session.refresh(site)
    assert site.name == "Ward 4"
    assert site.parent_id == trust.id


def test_moving_a_site_inside_a_site_is_refused(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    site: OrgUnit,
) -> None:
    second = _org_unit(db_session, "Ward 6", "site", trust)

    resp = authenticated_admin_client.put(
        f"/api/org-units/{second.id}", json={"parent_id": site.id}
    )

    assert resp.status_code == 422
    assert resp.json() == {"detail": SITE_IN_A_SITE}
    db_session.refresh(second)
    assert second.parent_id == trust.id
