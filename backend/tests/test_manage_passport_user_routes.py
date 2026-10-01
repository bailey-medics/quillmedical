"""A passport admin manages passport accounts through ``/api/users``.

``manage_passport`` is the second scoped manager, after
``manage_teaching``. It opens the user routes alongside ``manage_users``
and limits them to its whitelist: ``assess_clinician_passport``, itself,
and the four passport professions. ``passport_write`` is sold, so it is
never in reach. See
``docs/docs/plans/2026-09-30-passport-professions-plan.md``.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member, get_member_org_unit_ids
from app.security import hash_password

PASSWORD = "PassportAdmin123!"


def _user(db: Session, username: str, profession: str, org: OrgUnit) -> User:
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
    add_org_unit_member(db, org.id, user.id, "staff")
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Passport Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def admin(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "passport_admin", "passport_admin", trust)


@pytest.fixture
def delegate(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "delegate", "passport_delegate", trust)


@pytest.fixture
def consultant(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "consultant", "consultant", trust)


@pytest.fixture
def teaching_delegate(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "learner", "teaching_delegate", trust)


@pytest.fixture
def client(test_client: TestClient, admin: User) -> TestClient:
    response = test_client.post(
        "/api/auth/login",
        json={"username": admin.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")
    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf
    return test_client


def _new_user(org: OrgUnit, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "New Delegate",
        "username": "new_delegate",
        "email": "new_delegate@example.test",
        "password": "NewDelegate123!",
        "base_profession": "passport_delegate",
        "org_unit_ids": [org.id],
    }
    body.update(overrides)
    return body


class TestWhatAPassportAdminMayDo:
    def test_create_a_delegate_at_their_trust(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        resp = client.post("/api/users", json=_new_user(trust))

        assert resp.status_code == 200, resp.text
        created = db_session.get(User, resp.json()["id"])
        assert created is not None
        assert created.base_profession == "passport_delegate"
        assert "assess_clinician_passport" in (
            created.get_final_competencies()
        )
        assert get_member_org_unit_ids(db_session, created.id) == [trust.id]

    @pytest.mark.parametrize(
        "profession",
        [
            "passport_clinical_lead",
            "passport_admin",
            "passport_external_assessor",
        ],
    )
    def test_create_each_passport_profession(
        self, client: TestClient, trust: OrgUnit, profession: str
    ) -> None:
        resp = client.post(
            "/api/users",
            json=_new_user(trust, base_profession=profession),
        )
        assert resp.status_code == 200, resp.text

    def test_give_a_clinician_the_passport_sign_off(
        self, client: TestClient, consultant: User, db_session: Session
    ) -> None:
        """Granting within the whitelist works on any account.

        The consultant already holds it through their profession, so the
        save is a no-op change to the competency and must still pass.
        """
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"additional_competencies": ["assess_clinician_passport"]},
        )
        assert resp.status_code == 200, resp.text

    def test_move_a_delegate_to_clinical_lead(
        self, client: TestClient, delegate: User, db_session: Session
    ) -> None:
        resp = client.patch(
            f"/api/users/{delegate.id}",
            json={"base_profession": "passport_clinical_lead"},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(delegate)
        assert delegate.base_profession == "passport_clinical_lead"

    def test_deactivate_a_delegate(
        self, client: TestClient, delegate: User
    ) -> None:
        resp = client.post(f"/api/users/{delegate.id}/deactivate")
        assert resp.status_code == 200, resp.text


class TestWhatAPassportAdminMayNotDo:
    def test_give_away_passport_write(
        self, client: TestClient, delegate: User
    ) -> None:
        """Writing is sold, so no admin may grant it."""
        resp = client.patch(
            f"/api/users/{delegate.id}",
            json={"additional_competencies": ["passport_write"]},
        )
        assert resp.status_code == 403
        assert "passport_write" in resp.json()["detail"]

    def test_create_a_delegate_who_can_write(
        self, client: TestClient, trust: OrgUnit
    ) -> None:
        resp = client.post(
            "/api/users",
            json=_new_user(trust, additional_competencies=["passport_write"]),
        )
        assert resp.status_code == 403

    @pytest.mark.parametrize(
        "competency",
        ["manage_users", "prescribe_non_controlled", "view_teaching_cases"],
    )
    def test_grant_outside_the_passport(
        self, client: TestClient, delegate: User, competency: str
    ) -> None:
        resp = client.patch(
            f"/api/users/{delegate.id}",
            json={"additional_competencies": [competency]},
        )
        assert resp.status_code == 403

    @pytest.mark.parametrize("profession", ["consultant", "teaching_admin"])
    def test_create_outside_the_passport(
        self, client: TestClient, trust: OrgUnit, profession: str
    ) -> None:
        resp = client.post(
            "/api/users",
            json=_new_user(trust, base_profession=profession),
        )
        assert resp.status_code == 403

    def test_change_a_clinicians_profession(
        self, client: TestClient, consultant: User
    ) -> None:
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"base_profession": "passport_delegate"},
        )
        assert resp.status_code == 403

    def test_change_a_teaching_delegates_profession(
        self, client: TestClient, teaching_delegate: User
    ) -> None:
        """Teaching accounts belong to ``manage_teaching``, not to here."""
        resp = client.patch(
            f"/api/users/{teaching_delegate.id}",
            json={"base_profession": "passport_delegate"},
        )
        assert resp.status_code == 403

    @pytest.mark.parametrize("action", ["deactivate", "send-invite"])
    def test_act_on_a_clinicians_account(
        self, client: TestClient, consultant: User, action: str
    ) -> None:
        resp = client.post(f"/api/users/{consultant.id}/{action}")
        assert resp.status_code == 403
