"""What the register route answers when a registration is refused.

The rules are in ``app.users.register`` and are tested there. This
drives the route, to pin what a caller is sent: the status and the
``detail`` the route gave when the rules were written inside it. No
test pinned these words before the rules moved.

Four refusals are not here because no request can reach them today:
the two that ask for an organisation, a site beneath another
organisation, and a module the organisation has not opened. The
organisation and the site both come from the clinical lead's address,
which rules each of them out. They are tested where the rules are.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.positions import set_clinical_lead
from app.config import settings
from app.features.teaching.models import QuestionBankOrgStatus
from app.models import OrgUnit, User, org_unit_member
from app.security import hash_password

MODULE = "first-module"
LEAD_EMAIL = "lead@example.com"


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


def _open(db: Session, org: OrgUnit) -> None:
    """Have *org* open the module to registration."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=MODULE,
            is_live=True,
            site_registration=True,
        )
    )
    db.commit()


def _leads(db: Session, lead: User, site: OrgUnit) -> None:
    """Make *lead* a member of *site* and its clinical lead."""
    db.execute(
        org_unit_member.insert().values(
            org_unit_id=site.id, user_id=lead.id, capacity="staff"
        )
    )
    set_clinical_lead(db, site, lead)
    db.commit()


def _registration(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "username": "delegate",
        "email": "delegate@example.com",
        "password": "Delegate123!",
    }
    body.update(overrides)

    return body


def _through_the_link(**overrides: Any) -> dict[str, Any]:
    return _registration(
        **{
            "teaching_module_id": MODULE,
            "clinical_lead_email": LEAD_EMAIL,
            **overrides,
        }
    )


def _registered(db: Session) -> User | None:
    return db.scalar(select(User).where(User.username == "delegate"))


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation that has opened the module to registration."""
    org = _org_unit(db_session, "Severn Trust", "organisation")
    _open(db_session, org)

    return org


@pytest.fixture
def hospital(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _org_unit(db_session, "Severn Hospital", "hospital", trust)


@pytest.fixture
def lead(db_session: Session, hospital: OrgUnit) -> User:
    """The clinical lead of the hospital."""
    user = _person(db_session, "lead", LEAD_EMAIL)
    _leads(db_session, user, hospital)

    return user


@pytest.fixture
def colleague(db_session: Session) -> User:
    """Somebody whose username and address are spoken for."""
    return _person(db_session, "colleague")


def test_registering_where_clinical_services_are_on_is_refused(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "CLINICAL_SERVICES_ENABLED", True)

    response = test_client.post("/api/auth/register", json=_registration())

    assert response.status_code == 403
    assert response.json() == {
        "detail": "Self-registration is not available in this environment"
    }


@pytest.mark.parametrize(
    ("sent", "detail"),
    [
        ({"username": "   "}, "Missing fields"),
        ({"password": ""}, "Missing fields"),
        ({"password": "short"}, "Password must be at least 8 characters"),
        ({"username": "colleague"}, "Username or email already in use"),
        (
            {"email": "Colleague@Example.Com"},
            "Username or email already in use",
        ),
    ],
    ids=[
        "a blank username",
        "no password",
        "a short password",
        "a taken username",
        "a taken address",
    ],
)
def test_what_was_sent_is_refused_in_these_words(
    test_client: TestClient,
    db_session: Session,
    colleague: User,
    sent: dict[str, Any],
    detail: str,
) -> None:
    response = test_client.post(
        "/api/auth/register", json=_registration(**sent)
    )

    assert response.status_code == 400
    assert response.json() == {"detail": detail}
    assert _registered(db_session) is None


def test_a_taken_address_and_a_taken_username_get_the_same_answer(
    test_client: TestClient, colleague: User
) -> None:
    """So the answer never says whether an address has an account."""
    for_username = test_client.post(
        "/api/auth/register", json=_registration(username="colleague")
    )
    for_email = test_client.post(
        "/api/auth/register",
        json=_registration(email="colleague@example.com"),
    )

    assert for_email.status_code == for_username.status_code == 400
    assert for_email.json() == for_username.json()


@pytest.mark.parametrize(
    "named",
    [
        {"org_unit_id": 1},
        {"site_id": 1},
        {"teaching_module_id": MODULE},
        {"org_unit_id": 1, "clinical_lead_email": LEAD_EMAIL},
    ],
    ids=[
        "an organisation alone",
        "a site alone",
        "a module alone",
        "an organisation and a lead but no module",
    ],
)
def test_joining_anywhere_needs_both_a_clinical_lead_and_a_module(
    test_client: TestClient, db_session: Session, named: dict[str, Any]
) -> None:
    response = test_client.post(
        "/api/auth/register", json=_registration(**named)
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "A clinical lead and a module are required to join a site"
    }
    assert _registered(db_session) is None


def test_an_address_that_is_no_clinical_leads_is_refused(
    test_client: TestClient, db_session: Session, lead: User
) -> None:
    response = test_client.post(
        "/api/auth/register",
        json=_through_the_link(clinical_lead_email="nobody@example.com"),
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Clinical lead not recognised"}
    assert _registered(db_session) is None


def test_a_lead_at_several_sites_needs_one_chosen(
    test_client: TestClient, db_session: Session, lead: User, trust: OrgUnit
) -> None:
    second = _org_unit(db_session, "Avon Hospital", "hospital", trust)
    _leads(db_session, lead, second)

    response = test_client.post("/api/auth/register", json=_through_the_link())

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Choose which of the clinical lead's sites to join"
    }
    assert _registered(db_session) is None


def test_a_site_the_lead_does_not_hold_is_refused(
    test_client: TestClient, db_session: Session, lead: User, trust: OrgUnit
) -> None:
    elsewhere = _org_unit(db_session, "Wye Hospital", "hospital", trust)

    response = test_client.post(
        "/api/auth/register", json=_through_the_link(site_id=elsewhere.id)
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Site does not match the clinical lead"
    }
    assert _registered(db_session) is None


def test_an_organisation_that_is_not_the_leads_is_refused_the_same_way(
    test_client: TestClient,
    db_session: Session,
    lead: User,
    hospital: OrgUnit,
) -> None:
    other = _org_unit(db_session, "Wye Trust", "organisation")

    response = test_client.post(
        "/api/auth/register",
        json=_through_the_link(org_unit_id=other.id, site_id=hospital.id),
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Site does not match the clinical lead"
    }
    assert _registered(db_session) is None


def test_a_tree_whose_top_is_no_organisation_leaves_nobody_behind(
    test_client: TestClient, db_session: Session
) -> None:
    """Refused after the account is written, so this is the rollback."""
    detached = _org_unit(db_session, "Adrift Hospital", "hospital")
    _open(db_session, detached)
    ward = _org_unit(db_session, "Ward 4", "ward", detached)
    _leads(db_session, _person(db_session, "lead", LEAD_EMAIL), ward)

    response = test_client.post("/api/auth/register", json=_through_the_link())

    assert response.status_code == 400
    assert response.json() == {"detail": "Organisation not found"}
    assert _registered(db_session) is None


def test_a_site_of_a_type_that_tops_a_tree_leaves_nobody_behind(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    team = _org_unit(db_session, "Renal Team", "hospital_team", trust)
    _leads(db_session, _person(db_session, "lead", LEAD_EMAIL), team)

    response = test_client.post("/api/auth/register", json=_through_the_link())

    assert response.status_code == 400
    assert response.json() == {"detail": "Site not found"}
    assert _registered(db_session) is None
    assert (
        db_session.scalars(
            select(org_unit_member.c.user_id).where(
                org_unit_member.c.org_unit_id == trust.id
            )
        ).all()
        == []
    )
