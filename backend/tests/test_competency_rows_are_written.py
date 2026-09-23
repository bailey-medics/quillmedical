"""Every competency write lands in ``user_competency``.

What these pin is that every writer keeps the rows in line: after any
save, a person's current rows match the lists that save settled on.

See ``docs/docs/plans/2026-09-23-user-competency-table-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.grants import sync_competency_rows
from app.models import OrgUnit, User, UserCompetency
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold, withhold
from tests.places import administers


def _user(
    db: Session,
    username: str,
    *,
    profession: str = "patient",
    additional: list[str] | None = None,
    removed: list[str] | None = None,
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    hold(user, *(additional or []))
    withhold(user, *(removed or []))
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


def _rows(db: Session, user_id: int) -> list[UserCompetency]:
    db.expire_all()
    return list(
        db.scalars(
            select(UserCompetency)
            .where(UserCompetency.user_id == user_id)
            .order_by(UserCompetency.id)
        )
    )


def _current(db: Session, user_id: int, *, granted: bool) -> set[str]:
    now = datetime.now(UTC)
    return {
        row.competency_id
        for row in _rows(db, user_id)
        if row.granted == granted and row.is_current(now)
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
    """Holds ``manage_users`` and administers the organisation."""
    user = _user(db_session, "the_admin", profession="system_administrator")
    add_org_unit_member(db_session, org.id, user.id, "staff")
    administers(db_session, user.id, org.id)
    db_session.commit()
    return user


@pytest.fixture
def target(db_session: Session, org: OrgUnit) -> User:
    user = _user(db_session, "the_target", profession="patient")
    add_org_unit_member(db_session, org.id, user.id, "staff")
    db_session.commit()
    return user


class TestTheHelper:
    """``sync_competency_rows`` on its own, without a route around it."""

    def test_a_first_save_writes_a_row_for_every_id(
        self, db_session: Session
    ) -> None:
        """Nobody saved since the table arrived has any rows yet.

        Their first save has to write the whole of both lists, or the
        rows would hold only what changed and miss everything that did
        not.
        """
        user = _user(db_session, "first_save")

        sync_competency_rows(
            user,
            additional=["prescribe_non_controlled", "certify_death"],
            removed=["access_own_patient_records"],
            source="admin",
        )
        db_session.commit()

        assert _current(db_session, user.id, granted=True) == {
            "prescribe_non_controlled",
            "certify_death",
        }
        assert _current(db_session, user.id, granted=False) == {
            "access_own_patient_records"
        }

    def test_a_later_save_adds_and_closes_only_what_changed(
        self, db_session: Session
    ) -> None:
        user = _user(db_session, "later_save")
        sync_competency_rows(
            user,
            additional=["prescribe_non_controlled", "certify_death"],
            removed=[],
            source="admin",
        )
        db_session.commit()
        kept_id = next(
            row.id
            for row in _rows(db_session, user.id)
            if row.competency_id == "prescribe_non_controlled"
        )

        sync_competency_rows(
            user,
            additional=["prescribe_non_controlled", "certify_cremation"],
            removed=[],
            source="admin",
        )
        db_session.commit()

        assert _current(db_session, user.id, granted=True) == {
            "prescribe_non_controlled",
            "certify_cremation",
        }
        # The unchanged grant is the same row, not a fresh copy of it.
        kept = [
            row
            for row in _rows(db_session, user.id)
            if row.competency_id == "prescribe_non_controlled"
        ]
        assert [row.id for row in kept] == [kept_id]

    def test_taking_one_away_closes_its_row_and_keeps_it(
        self, db_session: Session
    ) -> None:
        """Rows are closed, never deleted.

        What somebody could do last year has to stay answerable, so the
        row survives with an end date on it.
        """
        user = _user(db_session, "taken_away")
        sync_competency_rows(
            user, additional=["certify_death"], removed=[], source="admin"
        )
        db_session.commit()

        sync_competency_rows(user, additional=[], removed=[], source="admin")
        db_session.commit()

        rows = _rows(db_session, user.id)
        assert [row.competency_id for row in rows] == ["certify_death"]
        assert rows[0].ends_on is not None
        assert _current(db_session, user.id, granted=True) == set()

    def test_saving_the_same_lists_twice_writes_nothing_new(
        self, db_session: Session
    ) -> None:
        user = _user(db_session, "same_twice")
        for _ in range(2):
            sync_competency_rows(
                user,
                additional=["certify_death"],
                removed=["access_own_patient_records"],
                source="admin",
            )
            db_session.commit()

        assert len(_rows(db_session, user.id)) == 2

    def test_passport_write_is_opened_with_its_term(
        self, db_session: Session
    ) -> None:
        """Granting the competency and granting its term are one row.

        An undated ``passport_write`` row would never lapse, so the row
        carries a year's end date, and a source saying who pays for it.
        The rest of the list is written as normal.
        """
        user = _user(db_session, "with_term")
        before = datetime.now(UTC)

        sync_competency_rows(
            user,
            additional=["passport_write", "certify_death"],
            removed=[],
            source="admin",
        )
        db_session.commit()

        assert _current(db_session, user.id, granted=True) == {
            "passport_write",
            "certify_death",
        }
        (termed,) = [
            row
            for row in _rows(db_session, user.id)
            if row.competency_id == "passport_write"
        ]
        assert termed.source == "organisation"
        assert termed.ends_on is not None
        ends_on = termed.ends_on.replace(tzinfo=UTC)
        assert before + timedelta(
            days=364
        ) < ends_on and ends_on < before + timedelta(days=366)

    def test_saving_again_does_not_extend_a_running_term(
        self, db_session: Session
    ) -> None:
        """A term is a fact about an agreement, not about form saves."""
        user = _user(db_session, "same_term")
        for _ in range(2):
            sync_competency_rows(
                user, additional=["passport_write"], removed=[], source="admin"
            )
            db_session.commit()

        assert len(_rows(db_session, user.id)) == 1

    def test_passport_write_is_still_closed_when_taken_off_the_list(
        self, db_session: Session
    ) -> None:
        """Taking it off the list is how an administrator takes it away.

        The dated row is closed like any other, before its term is up.
        """
        user = _user(db_session, "term_closed")
        user.competency_grants.append(
            UserCompetency(
                competency_id="passport_write",
                granted=True,
                starts_on=datetime.now(UTC),
                ends_on=datetime.now(UTC) + timedelta(days=365),
                source="organisation",
            )
        )
        db_session.commit()

        sync_competency_rows(user, additional=[], removed=[], source="admin")
        db_session.commit()

        assert _current(db_session, user.id, granted=True) == set()

    def test_a_removal_of_passport_write_is_written(
        self, db_session: Session
    ) -> None:
        """A removal has no term to lose, so nothing holds it back."""
        user = _user(db_session, "removal_written")

        sync_competency_rows(
            user, additional=[], removed=["passport_write"], source="admin"
        )
        db_session.commit()

        assert _current(db_session, user.id, granted=False) == {
            "passport_write"
        }

    def test_an_unknown_source_is_refused(self, db_session: Session) -> None:
        user = _user(db_session, "bad_source")

        with pytest.raises(ValueError, match="Unknown competency grant"):
            sync_competency_rows(
                user,
                additional=["certify_death"],
                removed=[],
                source="made_up",
            )


class TestIsCurrent:
    def test_no_end_is_current(self) -> None:
        row = UserCompetency(
            competency_id="certify_death", granted=True, source="admin"
        )
        assert row.is_current(datetime.now(UTC))

    def test_a_naive_end_is_read_as_utc(self) -> None:
        """SQLite hands back naive datetimes; comparing must not raise."""
        now = datetime.now(UTC)
        future = UserCompetency(
            competency_id="certify_death",
            granted=True,
            source="admin",
            ends_on=(now + timedelta(hours=1)).replace(tzinfo=None),
        )
        past = UserCompetency(
            competency_id="certify_death",
            granted=True,
            source="admin",
            ends_on=(now - timedelta(hours=1)).replace(tzinfo=None),
        )
        assert future.is_current(now)
        assert not past.is_current(now)


class TestEveryWriterWritesRows:
    """Each route that changes competencies writes rows."""

    def test_editing_a_user_writes_rows_naming_the_admin(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        target: User,
    ) -> None:
        client = _login(test_client, "the_admin")

        response = client.patch(
            f"/api/users/{target.id}",
            json={
                "additional_competencies": ["certify_death"],
                "removed_competencies": ["access_own_patient_records"],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        rows = _rows(db_session, target.id)
        assert {(r.competency_id, r.granted) for r in rows} == {
            ("certify_death", True),
            ("access_own_patient_records", False),
        }
        assert {r.source for r in rows} == {"admin"}
        assert {r.granted_by for r in rows} == {admin.id}

    def test_a_profession_change_writes_what_was_carried_over(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        target: User,
    ) -> None:
        """The rows follow the lists as finally settled, not the payload.

        Changing profession carries the old profession's competencies
        over as grants. Rows written from the payload alone would miss
        them.
        """
        client = _login(test_client, "the_admin")

        response = client.patch(
            f"/api/users/{target.id}",
            json={"base_profession": "teaching_delegate"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        # A patient holds this by profession, a teaching delegate does
        # not, so it is carried over as a grant.
        assert "access_own_patient_records" in _current(
            db_session, target.id, granted=True
        )

    def test_taking_a_competency_away_closes_its_row(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        target: User,
    ) -> None:
        client = _login(test_client, "the_admin")
        for listed in (["certify_death"], []):
            response = client.patch(
                f"/api/users/{target.id}",
                json={"additional_competencies": listed},
                headers=_csrf(client),
            )
            assert response.status_code == 200, response.text

        rows = _rows(db_session, target.id)
        assert len(rows) == 1
        assert rows[0].ends_on is not None

    def test_creating_a_user_writes_rows(
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
                "name": "New Starter",
                "username": "new_starter",
                "email": "new_starter@example.test",
                "password": "Password123!",
                "additional_competencies": ["certify_death"],
                "removed_competencies": ["access_own_patient_records"],
                "org_unit_ids": [org.id],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        new_id = response.json()["id"]
        assert _current(db_session, new_id, granted=True) == {"certify_death"}
        assert _current(db_session, new_id, granted=False) == {
            "access_own_patient_records"
        }
        assert {r.granted_by for r in _rows(db_session, new_id)} == {admin.id}

    def test_an_operator_editing_themselves_writes_operator_rows(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        operator = _user(
            db_session,
            "the_operator",
            profession="superadmin_profession",
            platform_role="superadmin",
        )
        client = _login(test_client, "the_operator")

        response = client.patch(
            "/api/cbac/my-competencies",
            json={"additional_competencies": ["view_teaching_cases"]},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        rows = _rows(db_session, operator.id)
        assert [(r.competency_id, r.source, r.granted_by) for r in rows] == [
            ("view_teaching_cases", "operator", operator.id)
        ]

    def test_onboarding_writes_rows_through_the_org_unit(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
    ) -> None:
        membership_admin = _user(
            db_session,
            "membership_admin",
            additional=["manage_staff_membership"],
        )
        add_org_unit_member(db_session, org.id, membership_admin.id, "staff")
        administers(db_session, membership_admin.id, org.id)
        starter = _user(db_session, "new_starter")
        client = _login(test_client, "membership_admin")

        response = client.post(
            f"/api/org-units/{org.id}/members",
            json={
                "user_id": starter.id,
                "capacity": "staff",
                "additional_competencies": ["certify_death"],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        rows = _rows(db_session, starter.id)
        assert [(r.competency_id, r.org_unit_id) for r in rows] == [
            ("certify_death", org.id)
        ]
        assert rows[0].granted_by == membership_admin.id

    def test_onboarding_with_passport_write_writes_one_dated_row(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
    ) -> None:
        """The term is on the grant, with nothing written anywhere else."""
        membership_admin = _user(
            db_session,
            "membership_admin",
            additional=["manage_staff_membership"],
        )
        add_org_unit_member(db_session, org.id, membership_admin.id, "staff")
        administers(db_session, membership_admin.id, org.id)
        starter = _user(db_session, "new_starter")
        client = _login(test_client, "membership_admin")

        response = client.post(
            f"/api/org-units/{org.id}/members",
            json={
                "user_id": starter.id,
                "capacity": "staff",
                "additional_competencies": ["passport_write"],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        rows = _rows(db_session, starter.id)
        assert len(rows) == 1
        row = rows[0]
        assert row.competency_id == "passport_write"
        assert row.ends_on is not None
        assert row.source == "organisation"
        assert row.org_unit_id == org.id
        assert row.granted_by == membership_admin.id

    def test_the_admin_editor_grants_passport_write_with_a_term(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        target: User,
    ) -> None:
        """The gap this plan was written after.

        The user editor could grant ``passport_write`` and not its term,
        leaving somebody holding a competency no interface could make
        usable. Now the one save writes both.
        """
        client = _login(test_client, "the_admin")

        response = client.patch(
            f"/api/users/{target.id}",
            json={"additional_competencies": ["passport_write"]},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        (row,) = _rows(db_session, target.id)
        assert row.competency_id == "passport_write"
        assert row.ends_on is not None
