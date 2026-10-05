"""Letting people into teaching at an org_unit, and out again.

Teaching has three layers: a competency, a place and an enrolment.
``admit`` gives all three in one request, and one route says which
layer is missing. See
``docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    MODULES_COMPETENCY,
    RESULTS_COMPETENCY,
    may_enter_module,
    places_for_modules,
)
from app.features.teaching.door import door_router
from app.features.teaching.enrolment import is_enrolled
from app.features.teaching.models import ModuleEnrolment
from app.models import OrgUnit, PractisingCompetency, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.test_teaching_router import (
    _login,
    _make_educator,
    _make_learner,
    _make_teaching_org,
    _seed_bank,
)

BANK = "test-bank"


def _consultant(
    db: Session, org_unit: OrgUnit, name: str = "newcomer"
) -> User:
    """A member with nothing from teaching: no competency, no place."""
    user = User(
        username=name,
        email=f"{name}@test.local",
        password_hash=hash_password("Consultant123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, org_unit.id, user.id, "staff")
    db.flush()
    return user


def _ward_of(db: Session, org: OrgUnit, name: str) -> OrgUnit:
    ward = OrgUnit(name=name, type="ward")
    db.add(ward)
    db.flush()
    db.execute(
        update(OrgUnit).where(OrgUnit.id == ward.id).values(parent_id=org.id)
    )
    return ward


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    """A teaching organisation serving one module, with an admin in it."""
    org = _make_teaching_org(db_session)
    educator = _make_educator(db_session, org)
    _seed_bank(db_session, org.id, educator.id)
    return org


def _admit(
    client: TestClient,
    headers: dict[str, str],
    unit: OrgUnit,
    person: User,
    **body: object,
) -> object:
    return client.post(
        f"/api/teaching/admin/org-units/{unit.id}/members/{person.id}/admit",
        json={"module_ids": [BANK], **body},
        headers=headers,
    )


class TestAdmitting:
    def test_it_gives_all_three_layers_at_once(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
    ) -> None:
        person = _consultant(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")

        resp = _admit(test_client, headers, org, person)

        assert resp.status_code == 200, resp.text  # type: ignore[attr-defined]
        assert resp.json() == {  # type: ignore[attr-defined]
            "competencies": [RESULTS_COMPETENCY, MODULES_COMPETENCY],
            "place": True,
            "enrolled": [BANK],
        }
        db_session.refresh(person)
        assert {RESULTS_COMPETENCY, MODULES_COMPETENCY} <= set(
            person.get_final_competencies()
        )
        assert may_enter_module(
            db_session, person, org_unit_id=org.id, question_bank_id=BANK
        )

    def test_admitting_twice_writes_nothing_new(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        person = _consultant(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")
        _admit(test_client, headers, org, person)

        again = _admit(test_client, headers, org, person)

        assert again.json() == {  # type: ignore[attr-defined]
            "competencies": [],
            "place": False,
            "enrolled": [],
        }
        rows = db_session.scalars(
            select(ModuleEnrolment).where(ModuleEnrolment.user_id == person.id)
        ).all()
        assert len(rows) == 1

    def test_at_a_ward_the_place_is_the_ward_and_the_module_the_trusts(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        ward = _ward_of(db_session, org, "Ward 4")
        person = _consultant(db_session, ward)
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")

        resp = _admit(test_client, headers, ward, person)

        assert resp.status_code == 200, resp.text  # type: ignore[attr-defined]
        db_session.refresh(person)
        assert places_for_modules(db_session, person) == [ward.id]
        assert is_enrolled(
            db_session, person.id, org_unit_id=org.id, question_bank_id=BANK
        )

    def test_an_end_date_is_written_on_the_enrolment(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        person = _consultant(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")
        ends = datetime.now(UTC) + timedelta(days=90)

        resp = _admit(
            test_client, headers, org, person, ends_on=ends.isoformat()
        )

        assert resp.status_code == 200, resp.text  # type: ignore[attr-defined]
        row = db_session.scalars(
            select(ModuleEnrolment).where(ModuleEnrolment.user_id == person.id)
        ).one()
        assert row.ends_on is not None

    def test_an_end_date_in_the_past_is_refused(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        person = _consultant(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")
        ended = datetime.now(UTC) - timedelta(days=1)

        resp = _admit(
            test_client, headers, org, person, ends_on=ended.isoformat()
        )

        assert resp.status_code == 422  # type: ignore[attr-defined]

    def test_a_module_not_served_is_refused_and_nothing_is_written(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        person = _consultant(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")

        resp = test_client.post(
            f"/api/teaching/admin/org-units/{org.id}/members/{person.id}/admit",
            json={"module_ids": [BANK, "no-such-module"]},
            headers=headers,
        )

        assert resp.status_code == 422
        db_session.refresh(person)
        assert MODULES_COMPETENCY not in person.get_final_competencies()
        assert places_for_modules(db_session, person) == []
        assert not is_enrolled(
            db_session, person.id, org_unit_id=org.id, question_bank_id=BANK
        )

    def test_somebody_who_is_not_a_member_is_not_found(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        elsewhere = OrgUnit(name="Elsewhere", type="organisation")
        db_session.add(elsewhere)
        db_session.flush()
        stranger = _consultant(db_session, elsewhere, "stranger")
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")

        resp = _admit(test_client, headers, org, stranger)

        assert resp.status_code == 404  # type: ignore[attr-defined]

    def test_an_org_unit_outside_their_reach_is_not_found(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        elsewhere = OrgUnit(name="Elsewhere", type="organisation")
        db_session.add(elsewhere)
        db_session.flush()
        stranger = _consultant(db_session, elsewhere, "stranger")
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")

        resp = _admit(test_client, headers, elsewhere, stranger)

        assert resp.status_code == 404  # type: ignore[attr-defined]

    def test_nobody_admits_themselves(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")
        educator = db_session.scalars(
            select(User).where(User.username == "testeducator")
        ).first()
        assert educator is not None

        resp = _admit(test_client, headers, org, educator)

        assert resp.status_code == 403  # type: ignore[attr-defined]

    def test_a_learner_may_not_admit_anybody(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        _make_learner(db_session, org)
        person = _consultant(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testlearner", "Learner123!")

        resp = _admit(test_client, headers, org, person)

        assert resp.status_code == 403  # type: ignore[attr-defined]


def _lose_place(db: Session, person: User, org_unit: OrgUnit) -> None:
    """Remove somebody's place, as nothing in the application now does.

    No route takes a place away. A place still goes missing: somebody
    leaves a centre and comes back, or was set up before places existed.
    """
    db.execute(
        delete(PractisingCompetency).where(
            PractisingCompetency.user_id == person.id,
            PractisingCompetency.org_unit_id == org_unit.id,
        )
    )
    db.commit()


class TestGivingAPlaceBack:
    def test_admitting_again_restores_what_they_had(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        """The enrolment outlives the place, so nothing is re-entered."""
        person = _consultant(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")
        _admit(test_client, headers, org, person)
        _lose_place(db_session, person, org)

        back = test_client.post(
            f"/api/teaching/admin/org-units/{org.id}/members/{person.id}/admit",
            json={"module_ids": []},
            headers=headers,
        )

        assert back.json() == {
            "competencies": [],
            "place": True,
            "enrolled": [],
        }
        db_session.refresh(person)
        assert may_enter_module(
            db_session, person, org_unit_id=org.id, question_bank_id=BANK
        )


class TestSayingWhatIsMissing:
    def _access(
        self, client: TestClient, unit: OrgUnit, person: User
    ) -> list[dict[str, object]]:
        resp = client.get(
            f"/api/teaching/admin/org-units/{unit.id}/members/{person.id}"
            "/access"
        )
        assert resp.status_code == 200, resp.text
        modules: list[dict[str, object]] = resp.json()["modules"]
        return modules

    def test_somebody_with_nothing_is_missing_all_three(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        person = _consultant(db_session, org)
        db_session.commit()
        _login(test_client, "testeducator", "Educator123!")

        modules = self._access(test_client, org, person)

        assert len(modules) == 1
        assert modules[0]["question_bank_id"] == BANK
        assert modules[0]["title"] == "Test Bank"
        assert modules[0]["may_enter"] is False
        assert modules[0]["missing"] == ["competency", "place", "enrolment"]

    def test_somebody_admitted_is_missing_nothing(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        person = _consultant(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")
        _admit(test_client, headers, org, person)

        modules = self._access(test_client, org, person)

        assert modules[0]["may_enter"] is True
        assert modules[0]["missing"] == []

    def test_without_a_place_only_the_place_is_missing(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        person = _consultant(db_session, org)
        db_session.commit()
        headers = _login(test_client, "testeducator", "Educator123!")
        _admit(test_client, headers, org, person)
        _lose_place(db_session, person, org)

        modules = self._access(test_client, org, person)

        assert modules[0]["missing"] == ["place"]

    def test_it_is_not_given_for_somebody_who_is_not_a_member(
        self, test_client: TestClient, db_session: Session, org: OrgUnit
    ) -> None:
        elsewhere = OrgUnit(name="Elsewhere", type="organisation")
        db_session.add(elsewhere)
        db_session.flush()
        stranger = _consultant(db_session, elsewhere, "stranger")
        db_session.commit()
        _login(test_client, "testeducator", "Educator123!")

        resp = test_client.get(
            f"/api/teaching/admin/org-units/{org.id}/members/{stranger.id}"
            "/access"
        )

        assert resp.status_code == 404


def test_every_door_route_asks_for_manage_teaching() -> None:
    """The router's own dependency, so a route cannot be added without it."""
    asked: set[str] = set()
    for dependency in door_router.dependencies:
        call = dependency.dependency
        for cell in getattr(call, "__closure__", None) or ():
            if isinstance(cell.cell_contents, str):
                asked.add(cell.cell_contents)
    assert "manage_teaching" in asked
    assert all(isinstance(route, APIRoute) for route in door_router.routes)
