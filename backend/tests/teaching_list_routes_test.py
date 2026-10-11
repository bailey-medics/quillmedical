"""The teaching lists through their routes: who is refused, and in what words.

``/admin/delegates``, ``/admin/delegates/modules`` and ``/modules`` refuse
nobody themselves. Each refusal here is made before the route's own code
runs, by sign-in, by the competency at the decorator or by the check on
``bank_id``, and somebody let through with nothing to see is answered
with an empty list. The rules are tested on their own in
``app/features/teaching/access_test.py`` and ``listing_test.py``; this
says what a caller is told.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    MODULES_COMPETENCY,
    RESULTS_COMPETENCY,
)
from app.features.teaching.enrolment import enrol
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold

DELEGATES = "/api/teaching/admin/delegates"
DELEGATE_MODULES = f"{DELEGATES}/modules"
MODULES = "/api/teaching/modules"

PASSWORD = "Password123!"
BANK = "polyps"


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation with teaching on, serving one module."""
    org = OrgUnit(name="List Test Trust", type="organisation")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db_session.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=BANK,
            is_live=True,
            active_version=1,
        )
    )
    db_session.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=BANK,
            version=1,
            title="Polyps",
            description="A question bank.",
            type="uniform",
            config_yaml={},
        )
    )
    db_session.flush()

    return org


def _member(
    db: Session, unit: OrgUnit, name: str, profession: str = "consultant"
) -> User:
    user = User(
        username=name,
        email=f"{name}@test.local",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, unit.id, user.id, "staff")
    db.commit()

    return user


def _signed_in(client: TestClient, name: str) -> TestClient:
    resp = client.post(
        "/api/auth/login", json={"username": name, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text

    return client


@pytest.mark.parametrize("path", [DELEGATES, DELEGATE_MODULES, MODULES])
def test_a_signed_out_caller_is_refused_every_list(
    test_client: TestClient, path: str
) -> None:
    resp = test_client.get(path)

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Not authenticated"}


@pytest.mark.parametrize("path", [DELEGATES, DELEGATE_MODULES])
def test_a_delegate_is_refused_the_delegate_lists_by_name_of_the_competency(
    test_client: TestClient, db_session: Session, trust: OrgUnit, path: str
) -> None:
    _member(db_session, trust, "delegate", "teaching_delegate")

    resp = _signed_in(test_client, "delegate").get(path)

    assert resp.status_code == 403
    assert resp.json() == {
        "detail": (
            "Forbidden: User lacks required competency 'manage_teaching'"
        )
    }


def test_somebody_who_only_views_results_is_refused_the_module_list(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    viewer = _member(db_session, trust, "viewer")
    hold(viewer, RESULTS_COMPETENCY)
    db_session.commit()

    resp = _signed_in(test_client, "viewer").get(MODULES)

    assert resp.status_code == 403
    assert resp.json() == {
        "detail": (
            "Forbidden: User lacks required competency "
            f"'{MODULES_COMPETENCY}'"
        )
    }


def test_a_module_id_longer_than_255_characters_is_refused(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _member(db_session, trust, "manager", "teaching_admin")

    resp = _signed_in(test_client, "manager").get(
        DELEGATES, params={"bank_id": "x" * 256}
    )

    assert resp.status_code == 422
    assert resp.json()["detail"][0]["loc"] == ["query", "bank_id"]
    assert resp.json()["detail"][0]["type"] == "string_too_long"


def test_a_module_id_of_255_characters_is_let_through_and_lists_nobody(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _member(db_session, trust, "manager", "teaching_admin")

    resp = _signed_in(test_client, "manager").get(
        DELEGATES, params={"bank_id": "x" * 255}
    )

    assert resp.status_code == 200
    assert resp.json() == []


def test_a_manager_alone_at_their_organisation_is_listed_nobody(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _member(db_session, trust, "manager", "teaching_admin")

    resp = _signed_in(test_client, "manager").get(DELEGATES)

    assert resp.status_code == 200
    assert resp.json() == []


def test_a_manager_is_listed_the_modules_their_organisation_serves(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _member(db_session, trust, "manager", "teaching_admin")

    resp = _signed_in(test_client, "manager").get(DELEGATE_MODULES)

    assert resp.status_code == 200
    assert resp.json() == [{"bank_id": BANK, "title": "Polyps"}]


def test_a_delegate_enrolled_with_no_place_is_listed_no_module(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """An empty list, not a refusal: nothing is open to them."""
    delegate = _member(db_session, trust, "delegate", "teaching_delegate")
    enrol(
        db_session,
        delegate.id,
        org_unit_id=trust.id,
        question_bank_id=BANK,
        source="admin",
    )
    db_session.commit()

    resp = _signed_in(test_client, "delegate").get(MODULES)

    assert resp.status_code == 200
    assert resp.json() == []
