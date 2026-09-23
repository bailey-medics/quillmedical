"""What somebody holds is read from ``user_competency`` rows.

A current row grants, a closed row does not, and the places that report
somebody's competencies report the rows.

See ``docs/docs/plans/2026-09-23-user-competency-table-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.cbac.audit import retired_ids_on_users, unknown_ids_on_users
from app.models import OrgUnit, User, UserCompetency
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold, lapse, withhold
from tests.places import administers


def _user(
    db: Session,
    username: str,
    *,
    profession: str = "patient",
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


class TestWhatIsHeld:
    def test_a_current_grant_row_is_held(self, db_session: Session) -> None:
        user = _user(db_session, "row_held")
        hold(user, "certify_death")
        db_session.commit()

        assert "certify_death" in user.get_final_competencies()
        assert user.additional_competency_ids == ["certify_death"]

    def test_a_grant_that_has_ended_is_not_held(
        self, db_session: Session
    ) -> None:
        """This is how ``passport_write`` lapses, with no second table."""
        user = _user(db_session, "lapsed")
        hold(user, "passport_write")
        db_session.commit()
        assert "passport_write" in user.get_final_competencies()

        lapse(user, "passport_write")
        db_session.commit()

        assert "passport_write" not in user.get_final_competencies()

    def test_a_grant_ending_in_the_future_is_held(
        self, db_session: Session
    ) -> None:
        user = _user(db_session, "not_yet")
        user.competency_grants.append(
            UserCompetency(
                competency_id="certify_death",
                granted=True,
                source="admin",
                ends_on=datetime.now(UTC) + timedelta(days=1),
            )
        )
        db_session.commit()

        assert "certify_death" in user.get_final_competencies()

    def test_a_removal_row_takes_away_what_the_profession_gives(
        self, db_session: Session
    ) -> None:
        user = _user(db_session, "withheld")
        assert "access_own_patient_records" in user.get_final_competencies()

        withhold(user, "access_own_patient_records")
        db_session.commit()

        assert "access_own_patient_records" not in (
            user.get_final_competencies()
        )
        assert user.removed_competency_ids == ["access_own_patient_records"]

    def test_either_of_two_grants_is_enough(self, db_session: Session) -> None:
        """Losing one source must not end the other."""
        user = _user(db_session, "two_sources")
        hold(user, "passport_write")
        user.competency_grants.append(
            UserCompetency(
                competency_id="passport_write",
                granted=True,
                source="individual",
                starts_on=datetime.now(UTC),
                ends_on=datetime.now(UTC) + timedelta(days=30),
            )
        )
        db_session.commit()

        site_grant = next(
            row
            for row in user.competency_grants
            if row.competency_id == "passport_write" and row.source == "admin"
        )
        site_grant.starts_on = datetime.now(UTC) - timedelta(days=400)
        site_grant.ends_on = datetime.now(UTC) - timedelta(days=1)
        db_session.commit()

        assert "passport_write" in user.get_final_competencies()


class TestWhatIsReported:
    def test_a_user_record_reports_the_rows(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """``additional_competencies`` in a response is a view over rows."""
        org = OrgUnit(name="Trust", type="organisation")
        db_session.add(org)
        db_session.commit()
        admin = _user(
            db_session, "the_admin", profession="system_administrator"
        )
        add_org_unit_member(db_session, org.id, admin.id, "staff")
        administers(db_session, admin.id, org.id)
        target = _user(db_session, "the_target")
        add_org_unit_member(db_session, org.id, target.id, "staff")
        hold(target, "certify_death")
        withhold(target, "access_own_patient_records")
        db_session.commit()

        client = _login(test_client, "the_admin")
        response = client.get(f"/api/users/{target.id}")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["additional_competencies"] == ["certify_death"]
        assert body["removed_competencies"] == ["access_own_patient_records"]

    def test_the_audit_reads_current_rows(self, db_session: Session) -> None:
        """A closed row misleads nobody, so it is not reported."""
        current = _user(db_session, "current_stale")
        closed = _user(db_session, "closed_stale")
        hold(current, "a_made_up_competency")
        hold(closed, "another_made_up_competency")
        db_session.commit()
        for row in closed.competency_grants:
            if row.competency_id == "another_made_up_competency":
                row.ends_on = datetime.now(UTC)
        db_session.commit()

        assert unknown_ids_on_users(db_session) == {
            current.id: ["a_made_up_competency"]
        }

    def test_the_retirement_queue_reads_rows(
        self, db_session: Session
    ) -> None:
        """Nothing retired, nothing listed: the query itself runs on rows."""
        user = _user(db_session, "clean")
        hold(user, "certify_death")
        db_session.commit()

        assert retired_ids_on_users(db_session) == {}
