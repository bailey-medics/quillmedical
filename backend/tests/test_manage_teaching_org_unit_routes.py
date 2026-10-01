"""A teaching admin manages teaching people at their own org_unit, and no more.

``manage_teaching`` opens the membership and practice routes under
``/api/org-units`` alongside the competencies they have always needed. A
caller reaching them through ``manage_teaching`` alone acts where they are
a member, only on somebody whose profession is a teaching one when the act
is on the person, and only on the teaching competencies when it is on a
competency. See
``docs/docs/plans/2026-09-30-manage-teaching-competency-plan.md``.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import (
    OrgUnit,
    OrgUnitFeature,
    PractisingCompetency,
    User,
    org_unit_patient_member,
)
from app.organisations import add_org_unit_member, get_member_org_unit_ids
from app.security import hash_password

PASSWORD = "Coordinator123!"


def _user(
    db: Session, username: str, profession: str, org: OrgUnit | None
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
    if org is not None:
        add_org_unit_member(db, org.id, user.id, "staff")
    db.commit()
    db.refresh(user)
    return user


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _org(db_session, "Teaching Trust")


@pytest.fixture
def elsewhere(db_session: Session) -> OrgUnit:
    return _org(db_session, "Another Trust")


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


def _practising(db: Session, user: User, org: OrgUnit) -> set[str]:
    return set(
        db.scalars(
            select(PractisingCompetency.competency).where(
                PractisingCompetency.user_id == user.id,
                PractisingCompetency.org_unit_id == org.id,
            )
        ).all()
    )


class TestAtTheirOwnOrgUnit:
    def test_lists_only_the_org_units_they_belong_to(
        self, client: TestClient, trust: OrgUnit, elsewhere: OrgUnit
    ) -> None:
        names = {
            u["name"] for u in client.get("/api/org-units").json()["org_units"]
        }
        assert names == {"Teaching Trust"}

    def test_lists_members(self, client: TestClient, trust: OrgUnit) -> None:
        resp = client.get(f"/api/org-units/{trust.id}/members")
        assert resp.status_code == 200, resp.text

    def test_adds_a_delegate_and_gives_them_a_teaching_competency(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        newcomer = _user(db_session, "newcomer", "teaching_delegate", None)

        resp = client.post(
            f"/api/org-units/{trust.id}/members",
            json={
                "user_id": newcomer.id,
                "capacity": "trainee",
                "additional_competencies": ["view_teaching_analytics"],
            },
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(newcomer)
        assert trust.id in get_member_org_unit_ids(db_session, newcomer.id)
        assert "view_teaching_analytics" in newcomer.get_final_competencies()

    def test_removes_a_delegate(
        self, client: TestClient, trust: OrgUnit, delegate: User
    ) -> None:
        resp = client.delete(
            f"/api/org-units/{trust.id}/members/{delegate.id}"
        )
        assert resp.status_code == 200, resp.text

    def test_authorises_and_withdraws_a_teaching_competency(
        self,
        client: TestClient,
        trust: OrgUnit,
        consultant: User,
        db_session: Session,
    ) -> None:
        resp = client.post(
            f"/api/org-units/{trust.id}/practising-competencies",
            json={
                "user_id": consultant.id,
                "competency": "view_teaching_cases",
            },
        )
        assert resp.status_code == 200, resp.text
        assert "view_teaching_cases" in _practising(
            db_session, consultant, trust
        )

        resp = client.delete(
            f"/api/org-units/{trust.id}/practising-competencies/"
            f"{consultant.id}/view_teaching_cases"
        )
        assert resp.status_code == 200, resp.text
        assert _practising(db_session, consultant, trust) == set()

    def test_member_practice_names_what_they_may_change(
        self, client: TestClient, trust: OrgUnit, consultant: User
    ) -> None:
        resp = client.get(
            f"/api/org-units/{trust.id}/members/{consultant.id}/practice"
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["may_grant"] is True
        assert body["may_change"] == sorted(
            [
                "view_teaching_cases",
                "manage_teaching",
                "view_teaching_analytics",
            ]
        )
        # Everything they hold is still shown.
        assert "prescribe_non_controlled" in body["qualified"]

    def test_grants_and_authorises_a_teaching_competency(
        self,
        client: TestClient,
        trust: OrgUnit,
        consultant: User,
        db_session: Session,
    ) -> None:
        resp = client.post(
            f"/api/org-units/{trust.id}/members/{consultant.id}"
            "/grant-and-authorise",
            json={"competency": "view_teaching_analytics"},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(consultant)
        assert "view_teaching_analytics" in consultant.get_final_competencies()
        assert "view_teaching_analytics" in _practising(
            db_session, consultant, trust
        )


class TestTheOrgUnitPage:
    """The detail leaves out what the caller's competencies do not cover.

    Left out by the backend rather than hidden by the page, so a section
    added to the page later cannot show patients by forgetting to hide
    itself.
    """

    @pytest.fixture
    def trust_with_patients(
        self, db_session: Session, trust: OrgUnit
    ) -> OrgUnit:
        db_session.add(
            OrgUnitFeature(org_unit_id=trust.id, feature_key="teaching")
        )
        db_session.execute(
            insert(org_unit_patient_member).values(
                org_unit_id=trust.id, patient_id="patient-1"
            )
        )
        db_session.commit()
        return trust

    def test_a_teaching_admin_sees_staff_and_no_patients_or_features(
        self,
        client: TestClient,
        trust_with_patients: OrgUnit,
        consultant: User,
    ) -> None:
        resp = client.get(f"/api/org-units/{trust_with_patients.id}")

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "consultant" in {m["username"] for m in body["members"]}
        assert body["patient_ids"] == []
        assert body["features"] == []

    def test_a_user_manager_still_sees_everything(
        self,
        authenticated_admin_client: TestClient,
        test_admin: User,
        trust_with_patients: OrgUnit,
        db_session: Session,
    ) -> None:
        add_org_unit_member(
            db_session, trust_with_patients.id, test_admin.id, "staff"
        )
        db_session.add(
            PractisingCompetency(
                user_id=test_admin.id,
                org_unit_id=trust_with_patients.id,
                competency="manage_users",
            )
        )
        db_session.commit()

        body = authenticated_admin_client.get(
            f"/api/org-units/{trust_with_patients.id}"
        ).json()
        assert body["patient_ids"] == ["patient-1"]
        assert body["features"] == ["teaching"]

    def test_cannot_open_another_org_unit(
        self, client: TestClient, elsewhere: OrgUnit
    ) -> None:
        resp = client.get(f"/api/org-units/{elsewhere.id}")
        assert resp.status_code == 404


def _ward(db: Session, name: str, parent: OrgUnit) -> OrgUnit:
    ward = OrgUnit(name=name, type="ward", parent_id=parent.id)
    db.add(ward)
    db.commit()
    db.refresh(ward)
    return ward


class TestBeneathTheirOrgUnit:
    """Authority flows down the tree, and never up or across."""

    def test_opens_a_ward_of_their_trust_without_belonging_to_it(
        self, client: TestClient, db_session: Session, trust: OrgUnit
    ) -> None:
        ward = _ward(db_session, "Ward 1", trust)
        resp = client.get(f"/api/org-units/{ward.id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Ward 1"

    def test_lists_the_members_of_a_ward_of_their_trust(
        self, client: TestClient, db_session: Session, trust: OrgUnit
    ) -> None:
        ward = _ward(db_session, "Ward 1", trust)
        resp = client.get(f"/api/org-units/{ward.id}/members")
        assert resp.status_code == 200

    def test_lists_the_wards_of_their_trust(
        self, client: TestClient, db_session: Session, trust: OrgUnit
    ) -> None:
        ward = _ward(db_session, "Ward 1", trust)
        resp = client.get(f"/api/org-units?parent_id={trust.id}")
        assert resp.status_code == 200
        assert [u["id"] for u in resp.json()["org_units"]] == [ward.id]

    def test_cannot_open_a_ward_of_another_trust(
        self, client: TestClient, db_session: Session, elsewhere: OrgUnit
    ) -> None:
        ward = _ward(db_session, "Ward 9", elsewhere)
        resp = client.get(f"/api/org-units/{ward.id}")
        assert resp.status_code == 404


class TestBeyondTheirWhitelist:
    def test_cannot_reach_another_org_unit(
        self, client: TestClient, elsewhere: OrgUnit
    ) -> None:
        resp = client.get(f"/api/org-units/{elsewhere.id}/members")
        assert resp.status_code == 404

    def test_cannot_add_a_clinician(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        nurse = _user(db_session, "nurse", "registered_nurse", None)

        resp = client.post(
            f"/api/org-units/{trust.id}/members",
            json={"user_id": nurse.id, "capacity": "staff"},
        )
        assert resp.status_code == 403

    def test_cannot_give_a_clinical_competency_on_adding(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        newcomer = _user(db_session, "newcomer", "teaching_delegate", None)

        resp = client.post(
            f"/api/org-units/{trust.id}/members",
            json={
                "user_id": newcomer.id,
                "capacity": "trainee",
                "additional_competencies": ["prescribe_non_controlled"],
            },
        )
        assert resp.status_code == 403
        db_session.refresh(newcomer)
        assert (
            "prescribe_non_controlled" not in newcomer.get_final_competencies()
        )

    def test_cannot_remove_a_clinician(
        self, client: TestClient, trust: OrgUnit, consultant: User
    ) -> None:
        resp = client.delete(
            f"/api/org-units/{trust.id}/members/{consultant.id}"
        )
        assert resp.status_code == 403

    def test_cannot_authorise_a_clinical_competency(
        self, client: TestClient, trust: OrgUnit, consultant: User
    ) -> None:
        resp = client.post(
            f"/api/org-units/{trust.id}/practising-competencies",
            json={
                "user_id": consultant.id,
                "competency": "prescribe_non_controlled",
            },
        )
        assert resp.status_code == 403

    def test_cannot_withdraw_a_clinical_competency(
        self,
        client: TestClient,
        trust: OrgUnit,
        consultant: User,
        db_session: Session,
    ) -> None:
        db_session.add(
            PractisingCompetency(
                user_id=consultant.id,
                org_unit_id=trust.id,
                competency="prescribe_non_controlled",
            )
        )
        db_session.commit()

        resp = client.delete(
            f"/api/org-units/{trust.id}/practising-competencies/"
            f"{consultant.id}/prescribe_non_controlled"
        )
        assert resp.status_code == 403
        assert "prescribe_non_controlled" in _practising(
            db_session, consultant, trust
        )

    def test_cannot_grant_a_clinical_competency(
        self, client: TestClient, trust: OrgUnit, delegate: User
    ) -> None:
        resp = client.post(
            f"/api/org-units/{trust.id}/members/{delegate.id}"
            "/grant-and-authorise",
            json={"competency": "prescribe_non_controlled"},
        )
        assert resp.status_code == 403

    def test_sees_only_teaching_practice_rows(
        self,
        client: TestClient,
        trust: OrgUnit,
        consultant: User,
        db_session: Session,
    ) -> None:
        for competency in ("prescribe_non_controlled", "view_teaching_cases"):
            db_session.add(
                PractisingCompetency(
                    user_id=consultant.id,
                    org_unit_id=trust.id,
                    competency=competency,
                )
            )
        db_session.commit()

        rows = client.get(
            f"/api/org-units/{trust.id}/practising-competencies"
        ).json()["practising_competencies"]
        assert {r["competency"] for r in rows} == {"view_teaching_cases"}
