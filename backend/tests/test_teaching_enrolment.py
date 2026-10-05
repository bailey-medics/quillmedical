"""Every teaching module needs an enrolment.

The third of teaching's layers. ``take_teaching_modules`` says somebody
may take modules, a ``practising_competency`` row says where, and a
``module_enrolment`` row says which module. There is no module open to
all comers. See
``docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    enrol_everyone_with_a_place,
    may_enter_module,
)
from app.features.teaching.enrolment import enrol, is_enrolled, withdraw
from app.features.teaching.models import (
    Assessment,
    ModuleEnrolment,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, User
from tests.test_teaching_router import (
    _login,
    _make_educator,
    _make_learner,
    _make_teaching_org,
    _seed_bank,
)
from tests.test_validate_clinical_lead import _setup_org_with_site_and_lead

BANK = "test-bank"


def _ready(db: Session) -> tuple[OrgUnit, User]:
    """A teaching organisation serving one module, and a learner on it."""
    org = _make_teaching_org(db)
    educator = _make_educator(db, org)
    learner = _make_learner(db, org)
    _seed_bank(db, org.id, educator.id)
    return org, learner


def _rows(db: Session, user: User) -> list[ModuleEnrolment]:
    return list(
        db.scalars(
            select(ModuleEnrolment).where(ModuleEnrolment.user_id == user.id)
        ).all()
    )


class TestEnrolling:
    def test_enrolling_twice_writes_one_row(self, db_session: Session) -> None:
        """The row already there keeps who enrolled them and when."""
        org, learner = _ready(db_session)
        assert len(_rows(db_session, learner)) == 1

        wrote = enrol(
            db_session,
            learner.id,
            org_unit_id=org.id,
            question_bank_id=BANK,
            source="admin",
        )

        assert wrote is False
        assert len(_rows(db_session, learner)) == 1

    def test_an_unknown_source_is_refused(self, db_session: Session) -> None:
        org, learner = _ready(db_session)

        with pytest.raises(ValueError, match="Unknown enrolment source"):
            enrol(
                db_session,
                learner.id,
                org_unit_id=org.id,
                question_bank_id="another-bank",
                source="because",
            )

    def test_withdrawing_ends_the_row_and_keeps_it(
        self, db_session: Session
    ) -> None:
        """Ended, never deleted: the table keeps who was enrolled."""
        org, learner = _ready(db_session)

        ended = withdraw(
            db_session, learner.id, org_unit_id=org.id, question_bank_id=BANK
        )

        assert ended == 1
        assert not is_enrolled(
            db_session, learner.id, org_unit_id=org.id, question_bank_id=BANK
        )
        assert len(_rows(db_session, learner)) == 1

    def test_an_enrolment_that_has_ended_does_not_count(
        self, db_session: Session
    ) -> None:
        org, learner = _ready(db_session)
        for row in _rows(db_session, learner):
            row.ends_on = datetime.now(UTC) - timedelta(days=1)
        db_session.flush()

        assert not may_enter_module(
            db_session, learner, org_unit_id=org.id, question_bank_id=BANK
        )

    def test_an_enrolment_not_yet_started_does_not_count(
        self, db_session: Session
    ) -> None:
        org, learner = _ready(db_session)
        for row in _rows(db_session, learner):
            row.starts_on = datetime.now(UTC) + timedelta(days=1)
        db_session.flush()

        assert not may_enter_module(
            db_session, learner, org_unit_id=org.id, question_bank_id=BANK
        )

    def test_an_enrolment_with_an_end_to_come_counts(
        self, db_session: Session
    ) -> None:
        org, learner = _ready(db_session)
        for row in _rows(db_session, learner):
            row.ends_on = datetime.now(UTC) + timedelta(days=30)
        db_session.flush()

        assert may_enter_module(
            db_session, learner, org_unit_id=org.id, question_bank_id=BANK
        )

    def test_an_enrolment_elsewhere_opens_nothing_here(
        self, db_session: Session
    ) -> None:
        org, learner = _ready(db_session)
        other = OrgUnit(name="Other Trust", type="organisation")
        db_session.add(other)
        db_session.flush()
        withdraw(
            db_session, learner.id, org_unit_id=org.id, question_bank_id=BANK
        )
        enrol(
            db_session,
            learner.id,
            org_unit_id=other.id,
            question_bank_id=BANK,
            source="admin",
        )

        assert not may_enter_module(
            db_session, learner, org_unit_id=org.id, question_bank_id=BANK
        )

    def test_an_enrolment_without_a_place_opens_nothing(
        self, db_session: Session
    ) -> None:
        """The enrolment outlives the place, and does nothing alone."""
        from sqlalchemy import delete

        from app.models import PractisingCompetency

        org, learner = _ready(db_session)
        db_session.execute(
            delete(PractisingCompetency).where(
                PractisingCompetency.user_id == learner.id
            )
        )

        assert is_enrolled(
            db_session, learner.id, org_unit_id=org.id, question_bank_id=BANK
        )
        assert not may_enter_module(
            db_session, learner, org_unit_id=org.id, question_bank_id=BANK
        )


class TestTheRoutesAskForAnEnrolment:
    def _end_enrolment(self, db: Session, org: OrgUnit, learner: User) -> None:
        withdraw(db, learner.id, org_unit_id=org.id, question_bank_id=BANK)
        db.commit()

    def test_enrolled_the_module_is_listed(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        _ready(db_session)
        db_session.commit()
        _login(test_client, "testlearner", "Learner123!")

        resp = test_client.get("/api/teaching/question-banks")

        assert [b["question_bank_id"] for b in resp.json()] == [BANK]

    def test_not_enrolled_the_module_is_not_listed(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """A place alone lists nothing: no module is open to all."""
        org, learner = _ready(db_session)
        self._end_enrolment(db_session, org, learner)
        _login(test_client, "testlearner", "Learner123!")

        resp = test_client.get("/api/teaching/question-banks")

        assert resp.status_code == 200
        assert resp.json() == []

    def test_not_enrolled_the_module_and_its_lesson_are_not_found(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org, learner = _ready(db_session)
        self._end_enrolment(db_session, org, learner)
        _login(test_client, "testlearner", "Learner123!")

        detail = test_client.get(f"/api/teaching/question-banks/{BANK}")
        lesson = test_client.get(f"/api/teaching/modules/{BANK}/learning")
        modules = test_client.get("/api/teaching/modules")

        assert detail.status_code == 404
        assert lesson.status_code == 404
        assert modules.json() == []

    def test_not_enrolled_an_assessment_cannot_be_started(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org, learner = _ready(db_session)
        self._end_enrolment(db_session, org, learner)
        headers = _login(test_client, "testlearner", "Learner123!")

        resp = test_client.post(
            "/api/teaching/assessments",
            json={"question_bank_id": BANK},
            headers=headers,
        )

        assert resp.status_code == 403

    def test_ending_the_enrolment_stops_an_attempt_under_way(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org, learner = _ready(db_session)
        db_session.commit()
        headers = _login(test_client, "testlearner", "Learner123!")
        started = test_client.post(
            "/api/teaching/assessments",
            json={"question_bank_id": BANK},
            headers=headers,
        )
        assert started.status_code == 200, started.text
        assessment_id = started.json()["assessment"]["id"]

        self._end_enrolment(db_session, org, learner)

        current = test_client.get(
            f"/api/teaching/assessments/{assessment_id}/current"
        )
        assert current.status_code == 404

    def test_a_result_outlives_the_enrolment(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org, learner = _ready(db_session)
        now = datetime.now(UTC)
        assessment = Assessment(
            user_id=learner.id,
            org_unit_id=org.id,
            question_bank_id=BANK,
            bank_version=1,
            started_at=now,
            completed_at=now,
            time_limit_minutes=30,
            total_items=3,
            is_passed=True,
            score_breakdown={"criteria": []},
        )
        db_session.add(assessment)
        self._end_enrolment(db_session, org, learner)
        _login(test_client, "testlearner", "Learner123!")

        resp = test_client.get(f"/api/teaching/assessments/{assessment.id}")

        assert resp.status_code == 200


class TestEnrollingEverybodyWithAPlace:
    def test_it_enrols_those_with_a_place_and_nobody_else(
        self, db_session: Session
    ) -> None:
        org, learner = _ready(db_session)
        db_session.add(
            QuestionBankOrgStatus(
                org_unit_id=org.id,
                question_bank_id="new-bank",
                is_live=True,
                active_version=1,
            )
        )
        db_session.flush()

        enrolled = enrol_everyone_with_a_place(
            db_session,
            org_unit_id=org.id,
            question_bank_id="new-bank",
            source="script",
        )

        usernames = {person.username for person in enrolled}
        assert "testlearner" in usernames
        assert is_enrolled(
            db_session,
            learner.id,
            org_unit_id=org.id,
            question_bank_id="new-bank",
        )

    def test_a_second_run_enrols_nobody(self, db_session: Session) -> None:
        org, _learner = _ready(db_session)

        again = enrol_everyone_with_a_place(
            db_session,
            org_unit_id=org.id,
            question_bank_id=BANK,
            source="script",
        )

        assert again == []

    def test_a_dry_run_writes_nothing(self, db_session: Session) -> None:
        org, learner = _ready(db_session)

        would = enrol_everyone_with_a_place(
            db_session,
            org_unit_id=org.id,
            question_bank_id="new-bank",
            source="script",
            dry_run=True,
        )

        assert learner.id in {person.id for person in would}
        assert not is_enrolled(
            db_session,
            learner.id,
            org_unit_id=org.id,
            question_bank_id="new-bank",
        )


class TestRegisteringThroughAModulesLink:
    def _open(self, db: Session, org: OrgUnit, bank_id: str, on: bool) -> None:
        db.add(
            QuestionBankOrgStatus(
                org_unit_id=org.id,
                question_bank_id=bank_id,
                is_live=True,
                active_version=1,
                site_registration=on,
            )
        )
        db.flush()

    def _register(
        self, client: TestClient, name: str, **extra: object
    ) -> object:
        return client.post(
            "/api/auth/register",
            json={
                "username": name,
                "email": f"{name}@example.com",
                "password": "Secure123!",
                **extra,
            },
        )

    def test_it_enrols_them_on_that_module_and_no_other(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        org, site, _lead = _setup_org_with_site_and_lead(db_session)
        self._open(db_session, org, "joined", True)
        self._open(db_session, org, "other", True)

        resp = self._register(
            test_client,
            "joiner",
            org_unit_id=org.id,
            site_id=site.id,
            teaching_module_id="joined",
        )

        assert resp.status_code == 200, resp.text  # type: ignore[attr-defined]
        user = (
            db_session.execute(select(User).where(User.username == "joiner"))
            .scalars()
            .first()
        )
        assert user is not None
        assert may_enter_module(
            db_session, user, org_unit_id=org.id, question_bank_id="joined"
        )
        assert not may_enter_module(
            db_session, user, org_unit_id=org.id, question_bank_id="other"
        )
        assert [row.source for row in _rows(db_session, user)] == [
            "registration"
        ]

    def test_a_module_not_open_to_registration_is_refused(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """A crafted request cannot enrol somebody on anything served."""
        org, site, _lead = _setup_org_with_site_and_lead(db_session)
        self._open(db_session, org, "closed", False)

        resp = self._register(
            test_client,
            "crafty",
            org_unit_id=org.id,
            site_id=site.id,
            teaching_module_id="closed",
        )

        assert resp.status_code == 400  # type: ignore[attr-defined]
        assert (
            db_session.scalar(select(User.id).where(User.username == "crafty"))
            is None
        )

    def test_a_module_with_no_organisation_is_refused(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        resp = self._register(
            test_client, "nowhere", teaching_module_id="joined"
        )

        assert resp.status_code == 400  # type: ignore[attr-defined]
