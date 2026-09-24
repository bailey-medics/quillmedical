"""Giving somebody a profession writes its competencies as rows.

Every way somebody is given a profession writes a ``profession`` row for
each competency it grants, and from then on only their rows count: the
profession's template is not read again.

See Phase 8 of ``docs/docs/plans/2026-09-23-user-competency-table-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.audit import unseeded_profession_competencies
from app.cbac.base_professions import get_profession_base_competencies
from app.cbac.grants import sync_competency_rows
from app.models import OrgUnit, User, UserCompetency
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers


def _user(
    db: Session,
    username: str,
    *,
    profession: str = "patient",
    seeded: bool = True,
) -> User:
    """A user. ``seeded=False`` strips the rows the constructor writes,
    standing in for somebody created before seeding existed."""
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role="standard",
    )
    if not seeded:
        user.competency_grants = []
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return client


def _csrf(client: TestClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


def _current_grants(db: Session, user_id: int) -> dict[str, str]:
    """Competency id to source, for every current grant row."""
    db.expire_all()
    now = datetime.now(UTC)
    rows = db.scalars(
        select(UserCompetency).where(UserCompetency.user_id == user_id)
    )
    return {
        row.competency_id: row.source
        for row in rows
        if row.granted and row.is_current(now)
    }


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    organisation = OrgUnit(name="Trust", type="organisation")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


@pytest.fixture
def admin(db_session: Session, org: OrgUnit) -> User:
    user = _user(db_session, "the_admin", profession="system_administrator")
    add_org_unit_member(db_session, org.id, user.id, "staff")
    administers(db_session, user.id, org.id)
    db_session.commit()
    return user


class TestTheHelperSeeds:
    def test_a_first_save_writes_the_whole_template(
        self, db_session: Session
    ) -> None:
        user = _user(
            db_session,
            "fresh",
            profession="healthcare_assistant",
            seeded=False,
        )

        sync_competency_rows(
            user, additional=["certify_death"], removed=[], source="admin"
        )
        db_session.commit()

        grants = _current_grants(db_session, user.id)
        template = get_profession_base_competencies("healthcare_assistant")
        assert template
        assert {cid: grants[cid] for cid in template} == {
            cid: "profession" for cid in template
        }
        assert grants["certify_death"] == "admin"

    def test_a_removed_template_competency_is_not_seeded(
        self, db_session: Session
    ) -> None:
        """Removed means not held, so there is no grant row for it."""
        user = _user(db_session, "withheld")

        sync_competency_rows(
            user,
            additional=[],
            removed=["access_own_patient_records"],
            source="admin",
        )
        db_session.commit()

        assert "access_own_patient_records" not in _current_grants(
            db_session, user.id
        )
        assert user.removed_competency_ids == ["access_own_patient_records"]
        assert "access_own_patient_records" not in (
            user.get_final_competencies()
        )

    def test_asking_for_a_template_competency_marks_it_as_asked(
        self, db_session: Session
    ) -> None:
        """Named in ``additional``, it is the administrator's grant."""
        user = _user(db_session, "asked", seeded=False)

        sync_competency_rows(
            user,
            additional=["access_own_patient_records"],
            removed=[],
            source="admin",
        )
        db_session.commit()

        assert _current_grants(db_session, user.id) == {
            "access_own_patient_records": "admin"
        }

    def test_seeded_rows_are_not_reported_as_additional(
        self, db_session: Session
    ) -> None:
        """Additional means what they hold beyond the profession."""
        user = _user(db_session, "reported", profession="healthcare_assistant")

        sync_competency_rows(
            user, additional=["certify_death"], removed=[], source="admin"
        )
        db_session.commit()

        assert user.additional_competency_ids == ["certify_death"]

    def test_saving_empty_lists_keeps_the_profession(
        self, db_session: Session
    ) -> None:
        """Empty lists mean "just the profession", not "nothing"."""
        user = _user(
            db_session, "unchanged", profession="healthcare_assistant"
        )
        before = sorted(user.get_final_competencies())

        sync_competency_rows(user, additional=[], removed=[], source="admin")
        db_session.commit()

        assert sorted(user.get_final_competencies()) == before


class TestEveryUserIsSeeded:
    def test_constructing_a_user_seeds_their_profession(
        self, db_session: Session
    ) -> None:
        """Every way a user comes to exist, not only the admin routes."""
        user = _user(db_session, "constructed", profession="teaching_delegate")

        assert _current_grants(db_session, user.id) == {
            "view_teaching_cases": "profession"
        }

    def test_the_profession_is_not_read_afterwards(
        self, db_session: Session
    ) -> None:
        """Changing the label alone grants nothing.

        What somebody holds is their rows. A profession changed without
        going through a route that writes rows changes nothing they can do,
        which is what a later edit to the template does too.
        """
        user = _user(db_session, "relabelled")
        user.base_profession = "teaching_delegate"
        db_session.commit()

        assert user.get_final_competencies() == ["access_own_patient_records"]


class TestEveryRouteSeeds:
    def test_creating_a_user_seeds_their_profession(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        org: OrgUnit,
    ) -> None:
        client = _login(test_client, "the_admin")

        response = client.post(
            "/api/users",
            json={
                "name": "New Assistant",
                "username": "new_assistant",
                "email": "new_assistant@example.test",
                "password": "Password123!",
                "base_profession": "healthcare_assistant",
                "org_unit_ids": [org.id],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        grants = _current_grants(db_session, response.json()["id"])
        for competency_id in get_profession_base_competencies(
            "healthcare_assistant"
        ):
            assert grants[competency_id] == "profession"

    def test_a_profession_change_adds_and_closes_nothing(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        org: OrgUnit,
    ) -> None:
        """The carry-over rule, stated as rows."""
        target = _user(db_session, "promoted")
        add_org_unit_member(db_session, org.id, target.id, "staff")
        db_session.commit()
        client = _login(test_client, "the_admin")

        first = client.patch(
            f"/api/users/{target.id}",
            json={"base_profession": "healthcare_assistant"},
            headers=_csrf(client),
        )
        assert first.status_code == 200, first.text
        after_first = _current_grants(db_session, target.id)

        second = client.patch(
            f"/api/users/{target.id}",
            json={"base_profession": "teaching_delegate"},
            headers=_csrf(client),
        )
        assert second.status_code == 200, second.text
        after_second = _current_grants(db_session, target.id)

        assert set(after_first) <= set(after_second)
        assert after_second["view_teaching_cases"] == "profession"
        assert "access_own_patient_records" in after_second


class TestTheCheckBeforeTheSwitch:
    """``unseeded_profession_competencies`` names who the switch would change."""

    def test_somebody_with_no_rows_is_named(self, db_session: Session) -> None:
        user = _user(db_session, "unseeded", seeded=False)

        assert unseeded_profession_competencies(db_session) == {
            user.id: ["access_own_patient_records"]
        }

    def test_seeded_rows_satisfy_it(self, db_session: Session) -> None:
        user = _user(db_session, "seeded", seeded=False)
        sync_competency_rows(user, additional=[], removed=[], source="admin")
        db_session.commit()

        assert unseeded_profession_competencies(db_session) == {}

    def test_a_removal_row_satisfies_it(self, db_session: Session) -> None:
        """A removal row, as the lists wrote them before the switch.

        Removed means not held, so the switch changes nothing for them.
        """
        user = _user(db_session, "removed", seeded=False)
        user.competency_grants.append(
            UserCompetency(
                competency_id="access_own_patient_records",
                granted=False,
                source="admin",
            )
        )
        db_session.commit()

        assert unseeded_profession_competencies(db_session) == {}
