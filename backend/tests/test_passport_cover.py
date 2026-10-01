"""An org_unit paying for its members' passport writing.

``passport_write`` is sold. Cover is the switch that makes it free for
the members of one org_unit: Cheltenham oncology, a site under
Gloucestershire Hospitals. Each test pins one rule from Phase 5 of
``docs/docs/plans/2026-09-30-passport-professions-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport import cover
from app.models import OrgUnit, OrgUnitFeature, User, UserCompetency
from app.organisations import add_org_unit_member
from app.security import hash_password

PASSWORD = "PassportCover123!"


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Gloucestershire Hospitals", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def oncology(db_session: Session, trust: OrgUnit) -> OrgUnit:
    site = OrgUnit(name="Cheltenham oncology", type="site", parent_id=trust.id)
    db_session.add(site)
    db_session.add(OrgUnitFeature(org_unit=site, feature_key="passport"))
    db_session.commit()
    db_session.refresh(site)
    return site


def _person(
    db: Session,
    username: str,
    unit: OrgUnit | None = None,
    capacity: str = "staff",
    profession: str = "consultant",
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
    if unit is not None:
        add_org_unit_member(db, unit.id, user.id, capacity)
    db.commit()
    db.refresh(user)
    return user


def _can_write(db: Session, user: User) -> bool:
    db.expire_all()
    fresh = db.get(User, user.id)
    assert fresh is not None
    return "passport_write" in fresh.get_final_competencies()


def _cover_rows(db: Session, user: User) -> list[UserCompetency]:
    db.expire_all()
    return list(
        db.scalars(
            select(UserCompetency).where(
                UserCompetency.user_id == user.id,
                UserCompetency.competency_id == "passport_write",
                UserCompetency.source == "organisation",
            )
        ).all()
    )


def _switch(client: TestClient, unit: OrgUnit, key: str, on: bool) -> int:
    return client.put(
        f"/api/org-units/{unit.id}/features/{key}", json={"enabled": on}
    ).status_code


class TestSwitchingOn:
    def test_staff_and_trainees_are_granted(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        consultant = _person(db_session, "consultant", oncology, "staff")
        registrar = _person(db_session, "registrar", oncology, "trainee")

        status = _switch(
            authenticated_superadmin_client, oncology, "passport_write", True
        )

        assert status == 200
        assert _can_write(db_session, consultant)
        assert _can_write(db_session, registrar)
        row = _cover_rows(db_session, consultant)[0]
        assert row.org_unit_id == oncology.id
        assert row.ends_on is None
        assert row.granted_by is not None

    def test_an_external_member_is_not(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        visitor = _person(db_session, "visitor", oncology, "external")

        _switch(
            authenticated_superadmin_client, oncology, "passport_write", True
        )

        assert not _can_write(db_session, visitor)

    def test_another_sites_members_are_not(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
        oncology: OrgUnit,
    ) -> None:
        cardiology = OrgUnit(
            name="Gloucester cardiology", type="site", parent_id=trust.id
        )
        db_session.add(cardiology)
        db_session.commit()
        cardiologist = _person(db_session, "cardiologist", cardiology)

        _switch(
            authenticated_superadmin_client, oncology, "passport_write", True
        )

        assert not _can_write(db_session, cardiologist)

    def test_off_and_on_again_duplicates_nothing(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        consultant = _person(db_session, "consultant", oncology)
        client = authenticated_superadmin_client

        _switch(client, oncology, "passport_write", True)
        _switch(client, oncology, "passport_write", False)
        _switch(client, oncology, "passport_write", True)

        now = datetime.now(UTC)
        current = [
            row
            for row in _cover_rows(db_session, consultant)
            if row.is_current(now)
        ]
        assert len(current) == 1

    def test_it_needs_the_passport_on_first(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        trust: OrgUnit,
    ) -> None:
        status = _switch(
            authenticated_superadmin_client, trust, "passport_write", True
        )
        assert status == 422

    def test_a_ward_refuses_it(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        ward = OrgUnit(name="Ward 1", type="ward", parent_id=oncology.id)
        db_session.add(ward)
        db_session.commit()

        status = _switch(
            authenticated_superadmin_client, ward, "passport_write", True
        )
        assert status == 422


class TestWhoMaySwitchIt:
    @pytest.mark.parametrize("on", [True, False])
    def test_a_user_manager_who_is_not_an_operator_is_refused(
        self,
        authenticated_admin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
        on: bool,
    ) -> None:
        """Cover gives away the paid half, so only an operator sets it."""
        status = _switch(
            authenticated_admin_client, oncology, "passport_write", on
        )
        assert status in (403, 404)
        assert not cover.is_covered(db_session, oncology.id)


class TestJoiningAndLeaving:
    @pytest.fixture
    def covered(
        self,
        authenticated_superadmin_client: TestClient,
        oncology: OrgUnit,
    ) -> TestClient:
        _switch(
            authenticated_superadmin_client, oncology, "passport_write", True
        )
        return authenticated_superadmin_client

    def test_a_member_of_staff_added_afterwards_is_granted(
        self, covered: TestClient, db_session: Session, oncology: OrgUnit
    ) -> None:
        starter = _person(db_session, "starter")

        resp = covered.post(
            f"/api/org-units/{oncology.id}/members",
            json={"user_id": starter.id, "capacity": "staff"},
        )

        assert resp.status_code == 200, resp.text
        assert _can_write(db_session, starter)

    def test_an_external_member_added_afterwards_is_not(
        self, covered: TestClient, db_session: Session, oncology: OrgUnit
    ) -> None:
        visitor = _person(db_session, "visitor")

        covered.post(
            f"/api/org-units/{oncology.id}/members",
            json={"user_id": visitor.id, "capacity": "external"},
        )

        assert not _can_write(db_session, visitor)

    def test_an_external_member_made_staff_is_granted(
        self, covered: TestClient, db_session: Session, oncology: OrgUnit
    ) -> None:
        visitor = _person(db_session, "visitor", oncology, "external")

        covered.post(
            f"/api/org-units/{oncology.id}/members",
            json={"user_id": visitor.id, "capacity": "staff"},
        )

        assert _can_write(db_session, visitor)

    def test_removing_a_member_of_staff_does_not_close_their_row(
        self, covered: TestClient, db_session: Session, oncology: OrgUnit
    ) -> None:
        leaver = _person(db_session, "leaver")
        covered.post(
            f"/api/org-units/{oncology.id}/members",
            json={"user_id": leaver.id, "capacity": "staff"},
        )

        resp = covered.delete(
            f"/api/org-units/{oncology.id}/members/{leaver.id}"
        )

        assert resp.status_code == 200, resp.text
        assert _can_write(db_session, leaver)

    def test_a_trainee_removed_loses_writing(
        self, covered: TestClient, db_session: Session, oncology: OrgUnit
    ) -> None:
        registrar = _person(db_session, "registrar")
        covered.post(
            f"/api/org-units/{oncology.id}/members",
            json={"user_id": registrar.id, "capacity": "trainee"},
        )
        assert _can_write(db_session, registrar)

        covered.delete(f"/api/org-units/{oncology.id}/members/{registrar.id}")

        assert not _can_write(db_session, registrar)

    def test_a_trainee_moved_to_external_loses_writing(
        self, covered: TestClient, db_session: Session, oncology: OrgUnit
    ) -> None:
        registrar = _person(db_session, "registrar")
        covered.post(
            f"/api/org-units/{oncology.id}/members",
            json={"user_id": registrar.id, "capacity": "trainee"},
        )

        covered.post(
            f"/api/org-units/{oncology.id}/members",
            json={"user_id": registrar.id, "capacity": "external"},
        )

        assert not _can_write(db_session, registrar)

    def test_a_new_account_created_at_the_site_is_granted(
        self, covered: TestClient, db_session: Session, oncology: OrgUnit
    ) -> None:
        resp = covered.post(
            "/api/users",
            json={
                "name": "New Starter",
                "username": "new_starter",
                "email": "new_starter@example.test",
                "password": "NewStarter123!",
                "base_profession": "consultant",
                "org_unit_ids": [oncology.id],
            },
        )

        assert resp.status_code == 200, resp.text
        created = db_session.get(User, resp.json()["id"])
        assert created is not None
        assert _can_write(db_session, created)


class TestSwitchingOff:
    def test_it_closes_this_org_units_rows_and_no_others(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        client = authenticated_superadmin_client
        covered_only = _person(db_session, "covered_only", oncology)
        subscriber = _person(db_session, "subscriber", oncology)
        _switch(client, oncology, "passport_write", True)
        # A subscription of their own, as Phase 6 will write it.
        db_session.add(
            UserCompetency(
                user_id=subscriber.id,
                competency_id="passport_write",
                starts_on=datetime.now(UTC),
                ends_on=None,
                source="individual",
            )
        )
        db_session.commit()

        status = _switch(client, oncology, "passport_write", False)

        assert status == 200
        assert not _can_write(db_session, covered_only)
        assert _can_write(db_session, subscriber)

    def test_turning_the_passport_off_ends_the_cover(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        client = authenticated_superadmin_client
        consultant = _person(db_session, "consultant", oncology)
        _switch(client, oncology, "passport_write", True)

        _switch(client, oncology, "passport", False)

        assert not cover.is_covered(db_session, oncology.id)
        assert not _can_write(db_session, consultant)

    def test_the_count_is_what_switching_off_would_take(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        client = authenticated_superadmin_client
        _person(db_session, "one", oncology)
        _person(db_session, "two", oncology, "trainee")
        _person(db_session, "visitor", oncology, "external")
        _switch(client, oncology, "passport_write", True)

        body = client.get(
            f"/api/org-units/{oncology.id}/passport-cover"
        ).json()

        assert body == {"enabled": True, "covered_count": 2}


class TestSavingTheUserEditor:
    """The story in the plan: correcting an email must not end cover."""

    def test_saving_a_covered_members_page_keeps_their_writing(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        client = authenticated_superadmin_client
        smith = _person(db_session, "dr_smith", oncology)
        _switch(client, oncology, "passport_write", True)
        assert _can_write(db_session, smith)

        resp = client.patch(
            f"/api/users/{smith.id}",
            json={
                "email": "dr.smith@example.test",
                "additional_competencies": [],
                "removed_competencies": [],
            },
        )

        assert resp.status_code == 200, resp.text
        assert _can_write(db_session, smith)

    def test_saving_keeps_a_site_members_capacity(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        oncology: OrgUnit,
    ) -> None:
        """A member of staff at a site stays staff when their page is saved.

        The editor used to write the default capacity back, which made
        them a trainee, and cover treats a trainee who leaves differently.
        """
        client = authenticated_superadmin_client
        smith = _person(db_session, "dr_smith", oncology, "staff")

        resp = client.patch(
            f"/api/users/{smith.id}",
            json={"org_unit_ids": [oncology.id]},
        )

        assert resp.status_code == 200, resp.text
        assert cover.capacities_of(db_session, smith.id) == {
            oncology.id: "staff"
        }
