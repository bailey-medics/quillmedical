"""Teaching enrolments saved with the rest of the user form.

``POST /api/users`` and ``PATCH /api/users/{id}`` carry
``teaching_enrolments``: for each organisation sent, the whole list of
modules somebody is to be enrolled on. Naming a module gives the two
learner competencies and a place if they are missing, so no account is
left with two layers of three. See
``docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    MODULES_COMPETENCY,
    RESULTS_COMPETENCY,
    may_enter_module,
    places_for_modules,
)
from app.features.teaching.enrolment import is_enrolled
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password

PASSWORD = "Coordinator123!"  # noqa: S105
FIRST = "first-module"
SECOND = "second-module"


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


def _serve(db: Session, org: OrgUnit, bank_id: str, synced_by: int) -> None:
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            version=1,
            title=bank_id.replace("-", " ").title(),
            description="A module.",
            type="uniform",
            config_yaml={},
            synced_by=synced_by,
        )
    )
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            is_live=True,
            active_version=1,
        )
    )
    db.commit()


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Teaching Trust", type="organisation")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def coordinator(db_session: Session, trust: OrgUnit) -> User:
    user = _user(db_session, "coordinator", "teaching_admin", trust)
    _serve(db_session, trust, FIRST, user.id)
    _serve(db_session, trust, SECOND, user.id)
    return user


@pytest.fixture
def consultant(db_session: Session, trust: OrgUnit) -> User:
    return _user(db_session, "consultant", "consultant", trust)


def _sign_in(test_client: TestClient, user: User) -> TestClient:
    response = test_client.post(
        "/api/auth/login",
        json={"username": user.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")
    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf
    return test_client


@pytest.fixture
def client(test_client: TestClient, coordinator: User) -> TestClient:
    return _sign_in(test_client, coordinator)


def _at(
    org: OrgUnit, *modules: str, ends_on: str | None = None
) -> dict[str, Any]:
    return {
        "org_unit_id": org.id,
        "modules": [{"module_id": m, "ends_on": ends_on} for m in modules],
    }


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


class TestCreatingSomebodyEnrolled:
    def test_one_save_creates_and_enrols(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        """They have no id until the save, so it is all in the one."""
        resp = client.post(
            "/api/users",
            json=_new_user(trust, teaching_enrolments=[_at(trust, FIRST)]),
        )

        assert resp.status_code == 200, resp.text
        created = db_session.get(User, resp.json()["id"])
        assert created is not None
        assert may_enter_module(
            db_session, created, org_unit_id=trust.id, question_bank_id=FIRST
        )
        assert not is_enrolled(
            db_session,
            created.id,
            org_unit_id=trust.id,
            question_bank_id=SECOND,
        )

    def test_a_module_not_served_saves_nobody(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        resp = client.post(
            "/api/users",
            json=_new_user(
                trust, teaching_enrolments=[_at(trust, "no-such-module")]
            ),
        )

        assert resp.status_code == 422
        db_session.rollback()
        assert (
            db_session.query(User).filter_by(username="new_delegate").first()
            is None
        )


class TestEnrollingSomebodyWhoExists:
    def test_naming_a_module_gives_the_other_two_layers(
        self, client: TestClient, trust: OrgUnit, consultant: User, db_session
    ) -> None:
        """A clinician with nothing from teaching, and one tick."""
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST)]},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(consultant)
        held = set(consultant.get_final_competencies())
        assert {RESULTS_COMPETENCY, MODULES_COMPETENCY} <= held
        # What they held already is untouched.
        assert "prescribe_non_controlled" in held
        assert places_for_modules(db_session, consultant) == [trust.id]
        assert may_enter_module(
            db_session,
            consultant,
            org_unit_id=trust.id,
            question_bank_id=FIRST,
        )

    def test_the_place_is_given_at_each_org_unit_they_belong_to(
        self, client: TestClient, trust: OrgUnit, consultant: User, db_session
    ) -> None:
        ward = OrgUnit(name="Ward 2", type="ward")
        db_session.add(ward)
        db_session.flush()
        db_session.execute(
            update(OrgUnit)
            .where(OrgUnit.id == ward.id)
            .values(parent_id=trust.id)
        )
        add_org_unit_member(db_session, ward.id, consultant.id, "staff")
        db_session.commit()

        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST)]},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(consultant)
        assert places_for_modules(db_session, consultant) == sorted(
            [trust.id, ward.id]
        )

    def test_the_list_is_the_whole_answer_for_that_organisation(
        self, client: TestClient, trust: OrgUnit, consultant: User, db_session
    ) -> None:
        """A module left out is ended; the place and competencies stay."""
        client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST, SECOND)]},
        )

        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, SECOND)]},
        )

        assert resp.status_code == 200, resp.text
        db_session.refresh(consultant)
        assert not is_enrolled(
            db_session,
            consultant.id,
            org_unit_id=trust.id,
            question_bank_id=FIRST,
        )
        assert is_enrolled(
            db_session,
            consultant.id,
            org_unit_id=trust.id,
            question_bank_id=SECOND,
        )
        assert places_for_modules(db_session, consultant) == [trust.id]
        assert MODULES_COMPETENCY in consultant.get_final_competencies()

    def test_an_empty_list_ends_every_enrolment_there(
        self, client: TestClient, trust: OrgUnit, consultant: User, db_session
    ) -> None:
        client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST)]},
        )

        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust)]},
        )

        assert resp.status_code == 200, resp.text
        assert not is_enrolled(
            db_session,
            consultant.id,
            org_unit_id=trust.id,
            question_bank_id=FIRST,
        )

    def test_leaving_the_field_out_touches_nothing(
        self, client: TestClient, trust: OrgUnit, consultant: User, db_session
    ) -> None:
        client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST)]},
        )

        # A change a teaching admin may make to a clinician's account,
        # with nothing said about enrolments.
        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"additional_competencies": ["view_teaching_analytics"]},
        )

        assert resp.status_code == 200, resp.text
        assert is_enrolled(
            db_session,
            consultant.id,
            org_unit_id=trust.id,
            question_bank_id=FIRST,
        )

    def test_an_end_date_is_kept_and_can_be_changed(
        self, client: TestClient, trust: OrgUnit, consultant: User
    ) -> None:
        soon = (datetime.now(UTC) + timedelta(days=30)).isoformat()
        later = (datetime.now(UTC) + timedelta(days=90)).isoformat()
        client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST, ends_on=soon)]},
        )

        client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST, ends_on=later)]},
        )

        shown = client.get(f"/api/users/{consultant.id}").json()
        (at_trust,) = shown["teaching_enrolments"]
        (module,) = at_trust["modules"]
        assert module["module_id"] == FIRST
        assert module["ends_on"][:10] == later[:10]

    def test_an_end_date_already_passed_is_refused(
        self, client: TestClient, trust: OrgUnit, consultant: User
    ) -> None:
        gone = (datetime.now(UTC) - timedelta(days=1)).isoformat()

        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST, ends_on=gone)]},
        )

        assert resp.status_code == 422

    def test_an_organisation_they_do_not_belong_to_is_refused(
        self, client: TestClient, consultant: User, db_session: Session
    ) -> None:
        elsewhere = OrgUnit(name="Elsewhere", type="organisation")
        db_session.add(elsewhere)
        db_session.commit()

        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(elsewhere, FIRST)]},
        )

        assert resp.status_code == 422


class TestWhoMaySendIt:
    def test_a_user_manager_without_manage_teaching_is_refused(
        self,
        test_client: TestClient,
        trust: OrgUnit,
        coordinator: User,
        consultant: User,
        db_session: Session,
    ) -> None:
        manager = _user(db_session, "manager", "consultant", trust)
        from tests.competencies import hold

        hold(manager, "manage_users")
        db_session.commit()
        client = _sign_in(test_client, manager)

        resp = client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST)]},
        )

        assert resp.status_code == 403
        assert not is_enrolled(
            db_session,
            consultant.id,
            org_unit_id=trust.id,
            question_bank_id=FIRST,
        )

    def test_the_user_shows_enrolments_only_to_somebody_who_runs_teaching(
        self,
        test_client: TestClient,
        trust: OrgUnit,
        coordinator: User,
        consultant: User,
        db_session: Session,
    ) -> None:
        client = _sign_in(test_client, coordinator)
        client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST)]},
        )

        shown = client.get(f"/api/users/{consultant.id}").json()

        assert shown["teaching_enrolments"] == [
            {
                "org_unit_id": trust.id,
                "modules": [{"module_id": FIRST, "ends_on": None}],
            }
        ]


class TestTheDoorRoutesTheFormAndTheMemberPageUse:
    def test_the_modules_an_organisation_serves_are_listed_for_a_site(
        self, client: TestClient, trust: OrgUnit, db_session: Session
    ) -> None:
        ward = OrgUnit(name="Ward 2", type="ward")
        db_session.add(ward)
        db_session.flush()
        db_session.execute(
            update(OrgUnit)
            .where(OrgUnit.id == ward.id)
            .values(parent_id=trust.id)
        )
        db_session.commit()

        resp = client.get(f"/api/teaching/admin/org-units/{ward.id}/modules")

        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "organisation_id": trust.id,
            "organisation_name": "Teaching Trust",
            "modules": [
                {"question_bank_id": FIRST, "title": "First Module"},
                {"question_bank_id": SECOND, "title": "Second Module"},
            ],
        }

    def test_unenrol_ends_one_enrolment_and_leaves_the_place(
        self, client: TestClient, trust: OrgUnit, consultant: User, db_session
    ) -> None:
        client.patch(
            f"/api/users/{consultant.id}",
            json={"teaching_enrolments": [_at(trust, FIRST, SECOND)]},
        )

        resp = client.post(
            f"/api/teaching/admin/org-units/{trust.id}/members/"
            f"{consultant.id}/unenrol",
            json={"module_id": FIRST},
        )

        assert resp.status_code == 200, resp.text
        assert resp.json() == {"withdrawn": 1}
        db_session.refresh(consultant)
        assert not is_enrolled(
            db_session,
            consultant.id,
            org_unit_id=trust.id,
            question_bank_id=FIRST,
        )
        assert is_enrolled(
            db_session,
            consultant.id,
            org_unit_id=trust.id,
            question_bank_id=SECOND,
        )
        assert places_for_modules(db_session, consultant) == [trust.id]

    def test_unenrol_from_a_module_they_are_not_on_changes_nothing(
        self, client: TestClient, trust: OrgUnit, consultant: User
    ) -> None:
        resp = client.post(
            f"/api/teaching/admin/org-units/{trust.id}/members/"
            f"{consultant.id}/unenrol",
            json={"module_id": FIRST},
        )

        assert resp.json() == {"withdrawn": 0}

    def test_an_operator_is_admitted_though_they_belong_nowhere(
        self,
        test_client: TestClient,
        trust: OrgUnit,
        coordinator: User,
        db_session: Session,
    ) -> None:
        """No organisation and no ``manage_teaching``: they run Quill."""
        operator = User(
            username="operator",
            email="operator@example.test",
            password_hash=hash_password(PASSWORD),
            is_active=True,
            email_verified=True,
            base_profession="superadmin_profession",
            platform_role="superadmin",
        )
        db_session.add(operator)
        db_session.commit()
        client = _sign_in(test_client, operator)

        resp = client.get(f"/api/teaching/admin/org-units/{trust.id}/modules")

        assert resp.status_code == 200, resp.text
        assert len(resp.json()["modules"]) == 2
