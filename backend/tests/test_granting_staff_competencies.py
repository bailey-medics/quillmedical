"""Adding somebody as staff can grant what makes them staff.

Membership and competencies were two steps, and the half-done state was a
new starter who could reach nothing: the row said they were staff at the
trust, and they held whatever they had before, which for a patient is
their own record and nothing else.

The picker used to hide such people behind ``?permission_level=staff``.
That filter went with the column, and no filter could replace it — every
candidate hid the patient becoming a healthcare assistant, which is the
case the picker most needs to support. So the list shows everyone and the
judgement moved here: the interface asks what they should hold, and this
route grants it in the same act as the membership row.

**The grant is additive**, the same rule as a profession change on
``update_user``. Whatever the person already held survives, so somebody
moving from patient to healthcare assistant keeps
``access_own_patient_records`` for their own record.

Both fields are optional. Adding somebody who is already staff elsewhere
needs no grant, and omitting them writes only the membership row.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    OrgUnit,
    User,
)
from app.organisations import add_organisation_member, organisation_member
from app.security import hash_password


def _user(db: Session, username: str, *, profession: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role="standard",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def org(db_session: Session) -> Organisation:
    organisation = Organisation(name="Trust", type="hospital")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


def _place(db: Session, org: Organisation, user: User) -> None:
    add_organisation_member(db, org.id, user.id, "staff")
    db.commit()


@pytest.fixture
def admin(db_session: Session, org: Organisation) -> User:
    """Holds ``manage_users`` at the organisation."""
    user = _user(db_session, "the_admin", profession="system_administrator")
    _place(db_session, org, user)
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


class TestThePatientBecomingStaff:
    """The progression every replacement filter would have hidden."""

    def test_a_profession_is_granted_with_the_membership(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        starter = _user(db_session, "new_hca", profession="patient")

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={
                "user_id": starter.id,
                "base_profession": "healthcare_assistant",
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(starter)
        held = starter.get_final_competencies()
        assert "perform_venepuncture" in held
        assert starter.base_profession == "healthcare_assistant"

    def test_they_keep_their_own_records_competency(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        """Additive: the grant adds, it does not replace.

        ``healthcare_assistant`` does not grant
        ``access_own_patient_records``, so a replacing grant would take
        away this person's access to their own record on the day they
        started work.
        """
        starter = _user(db_session, "keeps_own", profession="patient")
        assert "access_own_patient_records" in (
            starter.get_final_competencies()
        )

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={
                "user_id": starter.id,
                "base_profession": "healthcare_assistant",
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(starter)
        held = starter.get_final_competencies()
        assert "access_own_patient_records" in held
        assert "perform_venepuncture" in held

    def test_individual_competencies_can_be_granted_too(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        """A real person diverges from the template."""
        starter = _user(db_session, "with_extras", profession="patient")

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={
                "user_id": starter.id,
                "base_profession": "healthcare_assistant",
                "additional_competencies": ["view_teaching_cases"],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(starter)
        held = starter.get_final_competencies()
        assert "view_teaching_cases" in held
        assert "perform_venepuncture" in held

    def test_competencies_alone_without_a_profession(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        """Either field may be sent on its own."""
        starter = _user(db_session, "just_competencies", profession="patient")

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={
                "user_id": starter.id,
                "additional_competencies": ["view_teaching_cases"],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(starter)
        assert "view_teaching_cases" in starter.get_final_competencies()
        assert starter.base_profession == "patient"


class TestTheGrantIsOptional:
    """Somebody already staff elsewhere needs nothing granted."""

    def test_membership_alone_still_works(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        nurse = _user(db_session, "a_nurse", profession="registered_nurse")
        before = sorted(nurse.get_final_competencies())

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={"user_id": nurse.id},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(nurse)
        assert sorted(nurse.get_final_competencies()) == before

        row = db_session.scalar(
            select(organisation_member).where(
                organisation_member.c.organisation_id == org.id,
                organisation_member.c.user_id == nurse.id,
            )
        )
        assert row is not None


class TestWhatIsRefused:
    """A typo must not write a profession nobody defined."""

    def test_an_unknown_profession_is_refused(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        starter = _user(db_session, "bad_profession", profession="patient")

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={
                "user_id": starter.id,
                "base_profession": "chief_wizard",
            },
            headers=_csrf(client),
        )

        assert response.status_code == 422, response.text

    def test_an_unknown_competency_is_refused(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        starter = _user(db_session, "bad_competency", profession="patient")

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={
                "user_id": starter.id,
                "additional_competencies": ["prescribe_moonbeams"],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 422, response.text


class TestTheSameAtASite:
    """A site is where somebody works, so it asks the same question.

    The two routes share ``grant_staff_competencies`` rather than each
    carrying a copy of the merge rule, which would drift. These tests
    are here so the site route is covered in its own right, not left
    resting on the organisation route's.
    """

    @pytest.fixture
    def site(self, db_session: Session, org: Organisation) -> OrgUnit:
        site = OrgUnit(name="Ward 9", type="ward")
        db_session.add(site)
        db_session.commit()
        db_session.refresh(site)
        db_session.execute(
            update(OrgUnit)
            .where(OrgUnit.id == site.id)
            .values(parent_id=org.org_unit_id)
        )
        db_session.commit()
        return site

    def test_a_profession_is_granted_with_the_membership(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        site: OrgUnit,
        admin: User,
    ) -> None:
        starter = _user(db_session, "site_starter", profession="patient")

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/sites/{site.id}/staff",
            json={
                "user_id": starter.id,
                "role": "staff",
                "base_profession": "healthcare_assistant",
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(starter)
        held = starter.get_final_competencies()
        assert "perform_venepuncture" in held
        # Additive here too: their own record survives.
        assert "access_own_patient_records" in held

    def test_the_grant_is_optional(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        site: OrgUnit,
        admin: User,
    ) -> None:
        nurse = _user(db_session, "site_nurse", profession="registered_nurse")
        before = sorted(nurse.get_final_competencies())

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": nurse.id, "role": "staff"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(nurse)
        assert sorted(nurse.get_final_competencies()) == before

    def test_it_reaches_a_role_change_too(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        site: OrgUnit,
        admin: User,
    ) -> None:
        """Appointing an existing member is when a gap gets noticed.

        The route returns early on an existing membership row, so a
        grant applied only on insert would silently do nothing here.
        """
        member = _user(db_session, "site_member", profession="patient")

        client = _login(test_client, "the_admin")
        first = client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": member.id, "role": "trainee"},
            headers=_csrf(client),
        )
        assert first.status_code == 200, first.text

        second = client.post(
            f"/api/sites/{site.id}/staff",
            json={
                "user_id": member.id,
                "role": "staff",
                "base_profession": "healthcare_assistant",
            },
            headers=_csrf(client),
        )

        assert second.status_code == 200, second.text
        assert second.json()["status"] == "updated"
        db_session.refresh(member)
        assert "perform_venepuncture" in member.get_final_competencies()

    def test_an_unknown_profession_is_refused(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        site: OrgUnit,
        admin: User,
    ) -> None:
        starter = _user(db_session, "site_bad", profession="patient")

        client = _login(test_client, "the_admin")
        response = client.post(
            f"/api/sites/{site.id}/staff",
            json={
                "user_id": starter.id,
                "role": "staff",
                "base_profession": "chief_wizard",
            },
            headers=_csrf(client),
        )

        assert response.status_code == 422, response.text


class TestThePickerCanSeeWhoNeedsIt:
    """``UserSummaryItem`` carries competencies for exactly this."""

    def test_the_listing_says_what_each_user_holds(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        """Without this the interface cannot know who to ask about."""
        patient = _user(db_session, "a_patient", profession="patient")
        _place(db_session, org, patient)

        client = _login(test_client, "the_admin")
        response = client.get("/api/users")

        assert response.status_code == 200, response.text
        rows = {u["username"]: u for u in response.json()["users"]}
        assert rows["a_patient"]["competencies"] == [
            "access_own_patient_records"
        ]
        assert "manage_users" in rows["the_admin"]["competencies"]
