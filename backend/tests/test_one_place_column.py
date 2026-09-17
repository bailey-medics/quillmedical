"""Competencies and posts name one place, not one of two.

Organisations and the places inside them are one table now, so a row that
used to name an organisation names that organisation's own row in the
tree instead. The pair of columns, the check that policed it and the two
partial unique indexes it forced are all gone.

Covers:
- Both spellings of a place find the same row
- Nothing is inherited, in either direction
- The same authorisation twice is still refused
- A row with no place is still refused

``TestAnOrganisationOutsideTheTree`` used to sit here, checking that an
organisation whose ``org_unit_id`` was null authorised nobody. That
column is required now, so the state it guarded against cannot be
written — the test could only reach it by setting the column to null
itself, which is the database refusing rather than the code failing
closed.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.cbac.scoped import can_practise_at, competencies_at
from app.models import Organisation, OrgUnit, PractisingCompetency, User
from app.security import hash_password

COMPETENCY = "access_patient_records"


def _org(db: Session, name: str = "Trust") -> Organisation:
    org = Organisation(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ward(db: Session, org: Organisation, name: str = "Ward 1") -> OrgUnit:
    site = OrgUnit(name=name, type="ward", parent_id=org.org_unit_id)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


def _doctor(db: Session, username: str = "doc") -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _authorise(db: Session, user: User, site_id: int) -> None:
    db.add(
        PractisingCompetency(
            user_id=user.id, org_unit_id=site_id, competency=COMPETENCY
        )
    )
    db.commit()


class TestBothSpellingsFindTheSameRow:
    def test_naming_the_organisation_or_its_row_agree(self, db_session):
        org = _org(db_session)
        doctor = _doctor(db_session)
        _authorise(db_session, doctor, org.org_unit_id)

        assert can_practise_at(
            db_session, doctor, COMPETENCY, organisation_id=org.id
        )
        assert can_practise_at(
            db_session, doctor, COMPETENCY, site_id=org.org_unit_id
        )

    def test_the_row_is_stored_against_the_place(self, db_session):
        org = _org(db_session)
        doctor = _doctor(db_session)
        _authorise(db_session, doctor, org.org_unit_id)

        stored = db_session.scalar(
            select(PractisingCompetency.org_unit_id).where(
                PractisingCompetency.user_id == doctor.id
            )
        )
        assert stored == org.org_unit_id


class TestNothingIsInherited:
    def test_a_ward_does_not_take_its_organisations_authorisation(
        self, db_session
    ):
        """A ward manager's authority is theirs; a trust's is not theirs."""
        org = _org(db_session)
        ward = _ward(db_session, org)
        doctor = _doctor(db_session)
        _authorise(db_session, doctor, org.org_unit_id)

        assert not can_practise_at(
            db_session, doctor, COMPETENCY, site_id=ward.id
        )

    def test_an_organisation_does_not_take_a_wards(self, db_session):
        org = _org(db_session)
        ward = _ward(db_session, org)
        doctor = _doctor(db_session)
        _authorise(db_session, doctor, ward.id)

        assert not can_practise_at(
            db_session, doctor, COMPETENCY, organisation_id=org.id
        )
        assert (
            competencies_at(db_session, doctor, organisation_id=org.id)
            == set()
        )


class TestTheRulesThatSurvived:
    def test_the_same_authorisation_twice_is_refused(self, db_session):
        org = _org(db_session)
        doctor = _doctor(db_session)
        _authorise(db_session, doctor, org.org_unit_id)

        db_session.add(
            PractisingCompetency(
                user_id=doctor.id,
                org_unit_id=org.org_unit_id,
                competency=COMPETENCY,
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_the_same_person_at_two_places_is_fine(self, db_session):
        org = _org(db_session)
        ward = _ward(db_session, org)
        doctor = _doctor(db_session)

        _authorise(db_session, doctor, org.org_unit_id)
        _authorise(db_session, doctor, ward.id)

        assert can_practise_at(
            db_session, doctor, COMPETENCY, organisation_id=org.id
        )
        assert can_practise_at(db_session, doctor, COMPETENCY, site_id=ward.id)

    def test_a_row_with_no_place_is_refused(self, db_session):
        doctor = _doctor(db_session)

        db_session.add(
            PractisingCompetency(user_id=doctor.id, competency=COMPETENCY)
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()
