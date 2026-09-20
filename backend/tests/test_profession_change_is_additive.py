"""Changing a base profession keeps the competencies someone already holds.

``PATCH /users/{id}`` used to assign the field and nothing else::

    user.base_profession = payload.base_profession

Every competency from the old profession then vanished unless separately
listed in ``additional_competencies``, silently, with nothing recording
why. A profession is a template rather than state — ``base-professions``
says so itself, since ``additional``/``removed`` exist precisely so
reality can diverge from it — so changing one should add what the new
profession grants, not replace what the person has become.

**The case that shows it.** A patient holds
``access_own_patient_records`` for their own record. Move them to a
profession that does not grant it — ``teaching_delegate``, say — and a
bare assignment loses it: they stop being able to see their own record
by becoming a teaching delegate, which nobody asked for.

The merge mirrors the superadmin promotion a few lines below in
``update_user``, which has always added the operator competencies
alongside whatever profession someone already practised under, for the
same reason: overwriting would strip a consultant of their clinical
competencies the moment someone made them an operator.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_place_member
from app.security import hash_password


def _user(
    db: Session,
    username: str,
    *,
    profession: str,
    additional: list[str] | None = None,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        additional_competencies=additional or [],
        platform_role="standard",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    organisation = OrgUnit(name="Trust", type="organisation")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


def _place(db: Session, org: OrgUnit, user: User) -> None:
    add_place_member(db, org.id, user.id, "staff")
    db.commit()


@pytest.fixture
def admin(db_session: Session, org: OrgUnit) -> User:
    """Holds ``manage_users`` and shares the organisation with targets."""
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


class TestTheOldCompetenciesSurvive:
    """The patient-to-staff progression, which is the point of this."""

    def test_a_patient_becoming_a_delegate_keeps_their_own_records(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
    ) -> None:
        """Fails on a bare assignment.

        ``teaching_delegate`` grants ``view_teaching_cases`` and nothing
        else, so a replacement would leave this person unable to see
        their own record — by being given teaching access.
        """
        target = _user(db_session, "new_delegate", profession="patient")
        _place(db_session, org, target)
        assert "access_own_patient_records" in target.get_final_competencies()

        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{target.id}",
            json={"base_profession": "teaching_delegate"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(target)
        final = target.get_final_competencies()
        assert "access_own_patient_records" in final
        assert "view_teaching_cases" in final

    def test_the_new_profession_is_granted_too(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
    ) -> None:
        """Additive means both, not merely the old set kept."""
        target = _user(db_session, "becomes_hca", profession="patient")
        _place(db_session, org, target)

        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{target.id}",
            json={"base_profession": "healthcare_assistant"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(target)
        final = target.get_final_competencies()
        # The HCA profession grants the clinical id; the patient's own
        # survives alongside it, which is the whole point.
        assert "access_own_patient_records" in final
        assert "access_patient_records" in final
        assert "perform_venepuncture" in final

    def test_competencies_granted_by_hand_survive_as_well(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
    ) -> None:
        """``additional_competencies`` is not disturbed by the merge."""
        target = _user(
            db_session,
            "has_extras",
            profession="patient",
            additional=["view_teaching_cases"],
        )
        _place(db_session, org, target)

        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{target.id}",
            json={"base_profession": "receptionist"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(target)
        final = target.get_final_competencies()
        assert "view_teaching_cases" in final
        assert "access_clinic_admin" in final
        assert "access_own_patient_records" in final


class TestWhatTheMergeDoesNotDo:
    """Additive is not the same as ungovernable."""

    def test_an_explicit_removal_still_wins(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
    ) -> None:
        """``removed_competencies`` is applied after the merge.

        Otherwise a profession change would quietly undo a deliberate
        removal, which is the same silent surprise in the other
        direction.
        """
        target = _user(db_session, "had_one_removed", profession="patient")
        _place(db_session, org, target)

        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{target.id}",
            json={
                "base_profession": "healthcare_assistant",
                "removed_competencies": ["perform_venepuncture"],
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(target)
        final = target.get_final_competencies()
        assert "perform_venepuncture" not in final
        assert "access_own_patient_records" in final

    def test_setting_the_same_profession_changes_nothing(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
    ) -> None:
        """Idempotent, so a no-op edit does not accumulate entries."""
        target = _user(db_session, "unchanged", profession="receptionist")
        _place(db_session, org, target)
        before = sorted(target.get_final_competencies())

        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{target.id}",
            json={"base_profession": "receptionist"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(target)
        assert sorted(target.get_final_competencies()) == before
