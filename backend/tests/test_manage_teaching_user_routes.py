"""A teaching admin manages teaching accounts through ``/api/users``, and no more.

``manage_teaching`` opens the user routes alongside ``manage_users``, then
limits them to its whitelist: the teaching competencies, the teaching
professions, and whole-account acts only on somebody whose profession is a
teaching one. Each test in the second class pins one way the limit could
leak. See ``docs/docs/plans/2026-09-30-manage-teaching-competency-plan.md``.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member, get_member_org_unit_ids
from app.security import hash_password

PASSWORD = "Coordinator123!"


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
    org = OrgUnit(name="Teaching Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def coordinator(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "coordinator", "teaching_admin", trust)


@pytest.fixture
def delegate(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "delegate", "teaching_delegate", trust)


@pytest.fixture
def consultant(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "consultant", "consultant", trust)


@pytest.fixture
def client(test_client: TestClient, coordinator: User) -> TestClient:
    response = test_client.post(
        "/api/auth/login",
        json={"username": coordinator.username, "password": PASSWORD},
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
        "base_profession": "teaching_delegate",
        "org_unit_ids": [org.id],
    }
    body.update(overrides)
    return body


class TestWhatATeachingAdminMayDo:
    def test_create_a_delegate_at_their_trust(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        resp = client.post("/api/users", json=_new_user(trust))

        assert resp.status_code == 200, resp.text
        created = db_session.get(User, resp.json()["id"])
        assert created is not None
        assert created.base_profession == "teaching_delegate"
        assert get_member_org_unit_ids(db_session, created.id) == [trust.id]

    def test_give_a_clinician_a_teaching_competency(
        self, client: TestClient, consultant: User, db_session: Session
    ) -> None:
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"additional_competencies": ["view_teaching_analytics"]},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(consultant)
        held = consultant.get_final_competencies()
        assert "view_teaching_analytics" in held
        assert "prescribe_non_controlled" in held

    def test_edit_a_delegates_account(
        self, client: TestClient, delegate: User
    ) -> None:
        resp = client.patch(
            f"/api/users/{delegate.id}", json={"name": "Renamed Delegate"}
        )
        assert resp.status_code == 200, resp.text

    def test_deactivate_a_delegate(
        self, client: TestClient, delegate: User
    ) -> None:
        resp = client.post(f"/api/users/{delegate.id}/deactivate")
        assert resp.status_code == 200, resp.text

    def test_read_and_list_people_at_their_trust(
        self, client: TestClient, consultant: User
    ) -> None:
        assert client.get(f"/api/users/{consultant.id}").status_code == 200
        listed = {
            u["username"] for u in client.get("/api/users").json()["users"]
        }
        assert "consultant" in listed


class TestWhatATeachingAdminMayNotDo:
    def test_create_a_clinician(
        self, client: TestClient, trust: OrgUnit
    ) -> None:
        resp = client.post(
            "/api/users", json=_new_user(trust, base_profession="consultant")
        )
        assert resp.status_code == 403

    def test_create_a_delegate_holding_a_clinical_competency(
        self, client: TestClient, trust: OrgUnit
    ) -> None:
        resp = client.post(
            "/api/users",
            json=_new_user(
                trust, additional_competencies=["prescribe_non_controlled"]
            ),
        )
        assert resp.status_code == 403
        assert "prescribe_non_controlled" in resp.json()["detail"]

    def test_create_an_account_in_no_org_unit(
        self, client: TestClient, trust: OrgUnit
    ) -> None:
        resp = client.post(
            "/api/users", json=_new_user(trust, org_unit_ids=[])
        )
        assert resp.status_code == 400

    def test_create_an_operator(
        self, client: TestClient, trust: OrgUnit
    ) -> None:
        resp = client.post(
            "/api/users", json=_new_user(trust, platform_role="superadmin")
        )
        assert resp.status_code == 403

    def test_grant_manage_users(
        self, client: TestClient, delegate: User
    ) -> None:
        resp = client.patch(
            f"/api/users/{delegate.id}",
            json={"additional_competencies": ["manage_users"]},
        )
        assert resp.status_code == 403

    def test_remove_a_clinicians_clinical_competency(
        self, client: TestClient, consultant: User
    ) -> None:
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"removed_competencies": ["prescribe_non_controlled"]},
        )
        assert resp.status_code == 403

    def test_change_a_clinicians_profession(
        self, client: TestClient, consultant: User
    ) -> None:
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"base_profession": "teaching_delegate"},
        )
        assert resp.status_code == 403

    def test_reset_a_clinicians_password(
        self, client: TestClient, consultant: User
    ) -> None:
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"password": "Takeover123!"},
        )
        assert resp.status_code == 403

    @pytest.mark.parametrize("action", ["deactivate", "send-invite"])
    def test_act_on_a_clinicians_account(
        self, client: TestClient, consultant: User, action: str
    ) -> None:
        resp = client.post(f"/api/users/{consultant.id}/{action}")
        assert resp.status_code == 403

    def test_reactivate_a_clinician(
        self, client: TestClient, consultant: User, db_session: Session
    ) -> None:
        consultant.is_active = False
        db_session.commit()

        resp = client.post(f"/api/users/{consultant.id}/reactivate")
        assert resp.status_code == 403

    def test_use_the_patient_participant_picker(
        self, client: TestClient
    ) -> None:
        resp = client.get("/api/users", params={"patient_id": "anything"})
        assert resp.status_code == 403


def test_a_user_manager_still_reaches_clinicians(
    authenticated_admin_client: TestClient,
    test_admin: User,
    db_session: Session,
    trust: OrgUnit,
    consultant: User,
) -> None:
    """``manage_users`` has no limit, so the checks pass for it."""
    add_org_unit_member(db_session, trust.id, test_admin.id, "staff")
    db_session.commit()

    resp = authenticated_admin_client.patch(
        f"/api/users/{consultant.id}",
        json={"removed_competencies": ["prescribe_non_controlled"]},
    )
    assert resp.status_code == 200, resp.text
