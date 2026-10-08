"""Teaching asks where somebody may take modules, not only whether.

``take_teaching_modules`` is the ceiling. A ``practising_competency``
row for it at an org unit the person belongs to is the place. Before
this, belonging anywhere under a teaching organisation opened its
modules, so a centre's people could not have their way in withdrawn
without the centre being removed or each of them being edited. See
``docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md``.

Results ask for no place, which is the other half of these tests.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    MODULES_COMPETENCY,
    organisations_open_for_modules,
    places_for_modules,
)
from app.features.teaching.models import Assessment
from app.models import OrgUnit, PractisingCompetency, User, org_unit_member
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import join_for_teaching
from tests.test_teaching_router import (
    _login,
    _make_educator,
    _make_learner,
    _make_teaching_org,
    _seed_bank,
)
from tests.test_validate_clinical_lead import _setup_org_with_site_and_lead


def _withdraw(db: Session, user: User, org_unit_id: int) -> None:
    """Remove the place row, as withdrawing somebody's access does."""
    db.execute(
        delete(PractisingCompetency).where(
            PractisingCompetency.user_id == user.id,
            PractisingCompetency.org_unit_id == org_unit_id,
            PractisingCompetency.competency == MODULES_COMPETENCY,
        )
    )


def _ward_of(db: Session, org: OrgUnit, name: str = "Ward 9") -> OrgUnit:
    ward = OrgUnit(name=name, type="ward")
    db.add(ward)
    db.flush()
    db.execute(
        update(OrgUnit).where(OrgUnit.id == ward.id).values(parent_id=org.id)
    )
    return ward


class TestWhereSomebodyMayTakeModules:
    def test_a_row_where_they_belong_is_a_place(
        self, db_session: Session
    ) -> None:
        org = _make_teaching_org(db_session)
        learner = _make_learner(db_session, org)

        assert places_for_modules(db_session, learner) == [org.id]

    def test_membership_alone_is_not_a_place(
        self, db_session: Session
    ) -> None:
        """The competency and the membership, and no row: nowhere."""
        org = _make_teaching_org(db_session)
        learner = _make_learner(db_session, org)
        _withdraw(db_session, learner, org.id)

        assert places_for_modules(db_session, learner) == []
        assert organisations_open_for_modules(db_session, learner) == []

    def test_a_row_outliving_the_membership_has_no_effect(
        self, db_session: Session
    ) -> None:
        """Leaving a centre closes it, with nobody removing the row."""
        org = _make_teaching_org(db_session)
        learner = _make_learner(db_session, org)
        db_session.execute(
            org_unit_member.delete().where(
                org_unit_member.c.user_id == learner.id,
                org_unit_member.c.org_unit_id == org.id,
            )
        )

        assert places_for_modules(db_session, learner) == []
        # The row is still there; it simply counts for nothing.
        assert (
            db_session.scalar(
                select(PractisingCompetency.id).where(
                    PractisingCompetency.user_id == learner.id
                )
            )
            is not None
        )

    def test_a_row_without_the_competency_has_no_effect(
        self, db_session: Session
    ) -> None:
        org = _make_teaching_org(db_session)
        consultant = User(
            username="place_consultant",
            email="place_consultant@test.local",
            password_hash=hash_password("Consultant123!"),
            is_active=True,
            email_verified=True,
            base_profession="consultant",
        )
        db_session.add(consultant)
        db_session.flush()
        join_for_teaching(db_session, org.id, consultant.id, "staff")

        assert places_for_modules(db_session, consultant) == []

    def test_a_row_at_a_ward_reaches_its_organisation(
        self, db_session: Session
    ) -> None:
        org = _make_teaching_org(db_session)
        learner = _make_learner(db_session, org)
        _withdraw(db_session, learner, org.id)
        ward = _ward_of(db_session, org)
        join_for_teaching(db_session, ward.id, learner.id, "trainee")

        assert organisations_open_for_modules(db_session, learner) == [org.id]

    def test_leaving_one_centre_leaves_the_other_open(
        self, db_session: Session
    ) -> None:
        """Access is withdrawn at one place, and holds at another."""
        org = _make_teaching_org(db_session)
        learner = _make_learner(db_session, org)
        _withdraw(db_session, learner, org.id)
        first = _ward_of(db_session, org, "Ward 1")
        second = _ward_of(db_session, org, "Ward 2")
        join_for_teaching(db_session, first.id, learner.id, "trainee")
        join_for_teaching(db_session, second.id, learner.id, "trainee")

        _withdraw(db_session, learner, first.id)

        assert places_for_modules(db_session, learner) == [second.id]
        assert organisations_open_for_modules(db_session, learner) == [org.id]


class TestTheRoutesAskForAPlace:
    def test_without_a_place_the_module_list_is_empty(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        learner = _make_learner(db_session, org)
        _withdraw(db_session, learner, org.id)
        db_session.commit()
        _login(test_client, "testlearner", "Learner123!")

        resp = test_client.get("/api/teaching/question-banks")

        assert resp.status_code == 200
        assert resp.json() == []

    def test_without_a_place_a_lesson_is_not_found(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """404, as for any module that is not theirs."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        learner = _make_learner(db_session, org)
        _withdraw(db_session, learner, org.id)
        db_session.commit()
        _login(test_client, "testlearner", "Learner123!")

        resp = test_client.get("/api/teaching/modules/test-bank/learning")

        assert resp.status_code == 404

    def test_without_a_place_an_assessment_cannot_be_started(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        learner = _make_learner(db_session, org)
        _withdraw(db_session, learner, org.id)
        db_session.commit()
        headers = _login(test_client, "testlearner", "Learner123!")

        resp = test_client.post(
            "/api/teaching/assessments",
            json={"question_bank_id": "test-bank"},
            headers=headers,
        )

        assert resp.status_code in (403, 404)

    def test_withdrawing_the_place_stops_an_attempt_under_way(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        learner = _make_learner(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testlearner", "Learner123!")
        started = test_client.post(
            "/api/teaching/assessments",
            json={"question_bank_id": "test-bank"},
            headers=headers,
        )
        assert started.status_code == 200, started.text
        assessment_id = started.json()["assessment"]["id"]

        _withdraw(db_session, learner, org.id)
        db_session.commit()

        current = test_client.get(
            f"/api/teaching/assessments/{assessment_id}/current"
        )
        answer = test_client.post(
            f"/api/teaching/assessments/{assessment_id}/answer",
            json={"selected_option": "high_a"},
            headers=headers,
        )
        assert current.status_code == 404
        assert answer.status_code == 404

    def test_a_result_is_still_read_without_a_place(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """Results ask for no place, so they outlive the way in."""
        org = _make_teaching_org(db_session)
        educator = _make_educator(db_session, org)
        _seed_bank(db_session, org.id, educator.id)
        learner = _make_learner(db_session, org)
        now = datetime.now(UTC)
        assessment = Assessment(
            user_id=learner.id,
            org_unit_id=org.id,
            question_bank_id="test-bank",
            bank_version=1,
            started_at=now,
            completed_at=now,
            time_limit_minutes=30,
            total_items=3,
            is_passed=True,
            score_breakdown={"criteria": []},
        )
        db_session.add(assessment)
        _withdraw(db_session, learner, org.id)
        db_session.commit()
        _login(test_client, "testlearner", "Learner123!")

        detail = test_client.get(f"/api/teaching/assessments/{assessment.id}")
        history = test_client.get("/api/teaching/assessments/history")

        assert detail.status_code == 200
        assert detail.json()["bank_title"] == "Test Bank"
        assert [row["id"] for row in history.json()] == [assessment.id]


class TestRegisteringGivesAPlace:
    def _places(self, db: Session, username: str) -> set[int]:
        user_id = db.scalar(select(User.id).where(User.username == username))
        assert user_id is not None
        rows = db.execute(
            select(PractisingCompetency.org_unit_id).where(
                PractisingCompetency.user_id == user_id,
                PractisingCompetency.competency == MODULES_COMPETENCY,
            )
        ).scalars()
        return {int(row) for row in rows if row is not None}

    def test_registering_at_a_site_gives_the_place_there(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """At the site named, which is the centre they arrived through."""
        org, site, _lead = _setup_org_with_site_and_lead(db_session)

        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "place_trainee",
                "email": "place_trainee@example.com",
                "password": "Secure123!",
                "org_unit_id": org.id,
                "site_id": site.id,
                # A site is reached through its clinical lead and a
                # module they offer, which registration checks again.
                "teaching_module_id": "test-bank",
                "clinical_lead_email": "lead@test.local",
            },
        )

        assert resp.status_code == 200, resp.text
        assert self._places(db_session, "place_trainee") == {site.id}

    def test_registering_at_an_organisation_alone_is_refused(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """An organisation is joined through a clinical lead, like a site.

        Naming only the organisation used to join it as a trainee with
        nothing checked. No page sends that, but a crafted request could.
        """
        org, _site, _lead = _setup_org_with_site_and_lead(db_session)

        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "place_org",
                "email": "place_org@example.com",
                "password": "Secure123!",
                "org_unit_id": org.id,
            },
        )

        assert resp.status_code == 400, resp.text
        assert (
            db_session.scalar(select(User).where(User.username == "place_org"))
            is None
        )

    def test_a_registered_delegate_holds_both_competencies(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """They held neither: the account was built before it was named.

        Registration assigned the profession after constructing the
        user, and the constructor is what writes a profession's rows, so
        a self-registered delegate got a patient's competency and none
        from teaching.
        """
        org, site, _lead = _setup_org_with_site_and_lead(db_session)

        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "seeded",
                "email": "seeded@example.com",
                "password": "Secure123!",
                "org_unit_id": org.id,
                "site_id": site.id,
                # A site is reached through its clinical lead and a
                # module they offer, which registration checks again.
                "teaching_module_id": "test-bank",
                "clinical_lead_email": "lead@test.local",
            },
        )

        assert resp.status_code == 200, resp.text
        user = (
            db_session.execute(select(User).where(User.username == "seeded"))
            .scalars()
            .first()
        )
        assert user is not None
        assert user.base_profession == "teaching_delegate"
        assert set(user.get_final_competencies()) == {
            "view_teaching_results",
            "take_teaching_modules",
        }

    def test_registering_nowhere_gives_no_place(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "place_nowhere",
                "email": "place_nowhere@example.com",
                "password": "Secure123!",
            },
        )

        assert resp.status_code == 200, resp.text
        assert self._places(db_session, "place_nowhere") == set()


def test_add_org_unit_member_alone_gives_no_place(db_session: Session) -> None:
    """The membership function is not the door; the door calls it."""
    org = _make_teaching_org(db_session)
    learner = _make_learner(db_session, org)
    ward = _ward_of(db_session, org)

    add_org_unit_member(db_session, ward.id, learner.id, "trainee")

    assert places_for_modules(db_session, learner) == [org.id]
