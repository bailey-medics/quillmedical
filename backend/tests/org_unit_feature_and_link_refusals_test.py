"""What switching a feature and recording a link answer when refused.

The rules are in ``app.org_units.features`` and ``app.org_units.links``
and are tested there. This drives the routes that ask them, to pin what
a caller is sent: the status and the ``detail`` each gave when the rule
was written inside ``app.org_units.router``.

Covers:
- PUT  /api/org-units/{unit_id}/features/{feature_key}
- POST /api/org-units/{unit_id}/links
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, OrgUnitFeature, OrgUnitLink, User
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


COVER = "passport_write"
UNKNOWN_RELATION = (
    "Invalid relation. Must be one of: hosts, teaches_at, partners_with, "
    "shares_service"
)


def _features(db: Session, unit: OrgUnit) -> set[str]:
    db.expire_all()

    return set(
        db.scalars(
            select(OrgUnitFeature.feature_key).where(
                OrgUnitFeature.org_unit_id == unit.id
            )
        ).all()
    )


def _feature(unit_id: int, feature_key: str) -> str:
    return f"/api/org-units/{unit_id}/features/{feature_key}"


def _links(unit_id: int) -> str:
    return f"/api/org-units/{unit_id}/links"


# --- switching a feature ----------------------------------------------------


def test_switching_at_an_org_unit_outside_their_reach_is_not_found(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    for unit_id in (other_trust.id, NOWHERE):
        resp = authenticated_admin_client.put(
            _feature(unit_id, "messaging"), json={"enabled": True}
        )

        assert resp.status_code == 404
        assert resp.json() == {"detail": NOT_FOUND}

    assert _features(db_session, other_trust) == set()


@pytest.mark.parametrize("enabled", [True, False])
def test_an_administrator_switching_passport_cover_is_told_it_takes_an_operator(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    enabled: bool,
) -> None:
    """Refused in both directions."""
    db_session.add(
        OrgUnitFeature(org_unit_id=trust.id, feature_key="passport")
    )
    db_session.add(OrgUnitFeature(org_unit_id=trust.id, feature_key=COVER))
    db_session.commit()

    resp = authenticated_admin_client.put(
        _feature(trust.id, COVER), json={"enabled": enabled}
    )

    assert resp.status_code == 403
    assert resp.json() == {
        "detail": "Only an operator may switch passport cover."
    }
    assert _features(db_session, trust) == {"passport", COVER}


def test_switching_teaching_on_at_a_site_is_refused(
    authenticated_admin_client: TestClient, db_session: Session, site: OrgUnit
) -> None:
    resp = authenticated_admin_client.put(
        _feature(site.id, "teaching"), json={"enabled": True}
    )

    assert resp.status_code == 422
    assert resp.json() == {
        "detail": (
            "That feature is switched on for an organisation, and reaches "
            "its sites from there."
        )
    }
    assert _features(db_session, site) == set()


def test_an_operator_switching_cover_on_without_the_passport_is_refused(
    authenticated_superadmin_client: TestClient,
    db_session: Session,
    other_trust: OrgUnit,
) -> None:
    resp = authenticated_superadmin_client.put(
        _feature(other_trust.id, COVER), json={"enabled": True}
    )

    assert resp.status_code == 422
    assert resp.json() == {
        "detail": "Switch the passport on here before its cover."
    }
    assert _features(db_session, other_trust) == set()


def test_each_outcome_of_a_switch_has_its_own_word(
    authenticated_admin_client: TestClient, trust: OrgUnit
) -> None:
    url = _feature(trust.id, "messaging")

    said = [
        authenticated_admin_client.put(url, json={"enabled": enabled}).json()
        for enabled in (False, True, True, False)
    ]

    assert said == [
        {"status": "already_disabled"},
        {"status": "enabled"},
        {"status": "already_enabled"},
        {"status": "disabled"},
    ]


# --- recording a link -------------------------------------------------------


def test_a_link_from_an_org_unit_outside_their_reach_is_not_found(
    authenticated_admin_client: TestClient,
    trust: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    for unit_id in (other_trust.id, NOWHERE):
        resp = authenticated_admin_client.post(
            _links(unit_id),
            json={"target_id": trust.id, "relation": "teaches_at"},
        )

        assert resp.status_code == 404
        assert resp.json() == {"detail": NOT_FOUND}


def test_linking_an_org_unit_to_itself_is_refused(
    authenticated_admin_client: TestClient, trust: OrgUnit
) -> None:
    resp = authenticated_admin_client.post(
        _links(trust.id),
        json={"target_id": trust.id, "relation": "teaches_at"},
    )

    assert resp.status_code == 400
    assert resp.json() == {"detail": "A place cannot be linked to itself"}


def test_linking_to_an_id_no_org_unit_has_is_not_found(
    authenticated_admin_client: TestClient, trust: OrgUnit
) -> None:
    resp = authenticated_admin_client.post(
        _links(trust.id),
        json={"target_id": NOWHERE, "relation": "teaches_at"},
    )

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Target place not found"}


def test_an_unknown_relation_lists_the_relations(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    resp = authenticated_admin_client.post(
        _links(trust.id),
        json={"target_id": other_trust.id, "relation": "admires"},
    )

    assert resp.status_code == 400
    assert resp.json() == {"detail": UNKNOWN_RELATION}
    assert db_session.scalars(select(OrgUnitLink)).all() == []
