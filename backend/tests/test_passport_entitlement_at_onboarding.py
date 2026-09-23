"""Onboarding grants the term as well as the competency.

``passport_write`` says somebody may hold a passport, and the row granting
it says until when. Granting one without the other produced a new starter
who could open their passport and not write to it, which reads as a
broken page rather than as an arrangement nobody set up — so the grant is
written dated, as one row.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import OrgUnit, User, UserCompetency
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold
from tests.places import administers


def _user(db: Session, username: str, *, competencies: list[str]) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="patient",
        platform_role="standard",
    )
    hold(user, *competencies)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _csrf(client: TestClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return client


def _entitlements(db: Session, user: User) -> list[UserCompetency]:
    """Every ``passport_write`` grant, each carrying its term."""
    return (
        db.query(UserCompetency)
        .filter(
            UserCompetency.user_id == user.id,
            UserCompetency.competency_id == "passport_write",
            UserCompetency.granted.is_(True),
        )
        .all()
    )


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    organisation = OrgUnit(name="Trust", type="organisation")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


@pytest.fixture
def ward(db_session: Session, org: OrgUnit) -> OrgUnit:
    ward = OrgUnit(name="Ward 9", type="ward")
    db_session.add(ward)
    db_session.commit()
    db_session.refresh(ward)
    db_session.execute(
        update(OrgUnit).where(OrgUnit.id == ward.id).values(parent_id=org.id)
    )
    db_session.commit()
    return ward


@pytest.fixture
def admin(db_session: Session, org: OrgUnit) -> User:
    user = _user(
        db_session,
        "membership_admin",
        competencies=["manage_staff_membership"],
    )
    add_org_unit_member(db_session, org.id, user.id, "staff")
    # Two facts, not one: membership says they are here, and a
    # practising row says they may administer it. Visibility on the
    # admin routes comes from the row, never from the membership.
    administers(db_session, user.id, org.id)
    db_session.commit()
    return user


@pytest.fixture
def starter(db_session: Session) -> User:
    return _user(db_session, "new_starter", competencies=[])


class TestOnboardingGrantsTheTerm:
    def test_granting_the_competency_grants_a_term_with_it(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
        starter: User,
    ) -> None:
        """One request, both halves.

        The competency alone would leave somebody able to reach their
        passport and refused at every write.
        """
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

        rows = _entitlements(db_session, starter)
        assert len(rows) == 1
        assert rows[0].org_unit_id == org.id
        # Given through the organisation, so it does not lapse.
        assert rows[0].ends_on is None

    def test_an_ordinary_onboarding_grants_no_term(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
        starter: User,
    ) -> None:
        """Most people are not being sold a passport.

        An entitlement written for somebody who was never granted
        ``passport_write`` would be an arrangement nobody agreed to.
        """
        client = _login(test_client, "membership_admin")

        response = client.post(
            f"/api/org-units/{org.id}/members",
            json={
                "user_id": starter.id,
                "capacity": "staff",
                "additional_competencies": ["access_own_patient_records"],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        assert _entitlements(db_session, starter) == []

    def test_a_second_onboarding_writes_no_second_grant(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        ward: OrgUnit,
        admin: User,
        starter: User,
    ) -> None:
        """A grant is a fact about an arrangement, not about form saves.

        Somebody added to a ward as well as its trust, or whose capacity
        is corrected, gets no second grant each time.
        """
        # Nothing is inherited, so administering the trust says nothing
        # about the ward inside it.
        administers(db_session, admin.id, ward.id)
        db_session.commit()

        client = _login(test_client, "membership_admin")
        body = {
            "user_id": starter.id,
            "capacity": "staff",
            "additional_competencies": ["passport_write"],
        }

        first = client.post(
            f"/api/org-units/{org.id}/members",
            json=body,
            headers=_csrf(client),
        )
        assert first.status_code == 200, first.text
        original_end = _entitlements(db_session, starter)[0].ends_on

        second = client.post(
            f"/api/org-units/{ward.id}/members",
            json=body,
            headers=_csrf(client),
        )
        assert second.status_code == 200, second.text

        rows = _entitlements(db_session, starter)
        assert len(rows) == 1
        assert rows[0].ends_on == original_end is None

    def test_a_term_that_has_ended_is_granted_afresh(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
        starter: User,
    ) -> None:
        """Somebody rejoining starts a new arrangement.

        Only a *current* term suppresses a new one, so a lapsed row does
        not leave a returner permanently read-only.
        """
        starter.competency_grants.append(
            UserCompetency(
                competency_id="passport_write",
                granted=True,
                source="organisation",
                org_unit_id=org.id,
                starts_on=datetime.now(UTC) - timedelta(days=400),
                ends_on=datetime.now(UTC) - timedelta(days=1),
            )
        )
        db_session.commit()

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

        rows = _entitlements(db_session, starter)
        assert len(rows) == 2
        # The returner's new grant, through the organisation, has no end.
        assert any(row.ends_on is None for row in rows)
