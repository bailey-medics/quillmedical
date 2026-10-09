"""Tests for resolving what a person may practise at one place.

The acceptance criteria in ``org_scoped_access_criteria_test.py`` say what the
model must express. These test the resolver itself: the intersection with a
person's ceiling, both query directions, the refusal to guess a place, and
the constraint that keeps a row pointing at exactly one thing, and the two
writers every route that sets practice goes through.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.cbac.practising import (
    authorise_practice,
    authorised_at,
    can_practise_at,
    competencies_at,
    who_can_practise_at,
    withdraw_not_held,
    withdraw_practice,
)
from app.models import OrgUnit, PractisingCompetency, User
from app.security import hash_password


def _user(db: Session, username: str, profession: str = "consultant") -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.commit()

    return user


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.commit()

    return org


def _site(db: Session, name: str) -> OrgUnit:
    site = OrgUnit(name=name, type="ward")
    db.add(site)
    db.commit()

    return site


def _authorise(
    db: Session,
    user: User,
    competency: str,
    *,
    org: OrgUnit | None = None,
    site: OrgUnit | None = None,
) -> PractisingCompetency:
    row = PractisingCompetency(
        user_id=user.id,
        org_unit_id=org.id if org else (site.id if site else None),
        competency=competency,
    )
    db.add(row)
    db.commit()

    return row


class TestTheCeilingNarrowsEveryPlace:
    """A row beyond what someone is qualified for does nothing."""

    def test_authorisation_outside_the_ceiling_is_ignored(self, db_session):
        org = _org(db_session, "Trust")
        receptionist = _user(
            db_session, "front_desk", profession="receptionist"
        )
        _authorise(db_session, receptionist, "access_patient_records", org=org)

        assert not can_practise_at(
            db_session,
            receptionist,
            "access_patient_records",
            org_unit_id=org.id,
        )
        assert (
            competencies_at(db_session, receptionist, org_unit_id=org.id)
            == set()
        )

    def test_the_ceiling_alone_authorises_nothing(self, db_session):
        """Being qualified is not being authorised. No row, no access."""
        org = _org(db_session, "Trust")
        doctor = _user(db_session, "doc")

        assert "access_patient_records" in doctor.get_final_competencies()
        assert not can_practise_at(
            db_session,
            doctor,
            "access_patient_records",
            org_unit_id=org.id,
        )


class TestNothingIsInherited:
    """A row at one place says nothing about any other."""

    def test_an_organisation_row_does_not_reach_its_sites(self, db_session):
        org = _org(db_session, "Trust")
        site = _site(db_session, "Ward 1")
        doctor = _user(db_session, "doc")
        _authorise(db_session, doctor, "access_patient_records", org=org)

        assert can_practise_at(
            db_session,
            doctor,
            "access_patient_records",
            org_unit_id=org.id,
        )
        assert not can_practise_at(
            db_session, doctor, "access_patient_records", org_unit_id=site.id
        )

    def test_a_site_row_does_not_reach_its_organisation(self, db_session):
        org = _org(db_session, "Trust")
        site = _site(db_session, "Ward 1")
        doctor = _user(db_session, "doc")
        _authorise(db_session, doctor, "access_patient_records", site=site)

        assert can_practise_at(
            db_session, doctor, "access_patient_records", org_unit_id=site.id
        )
        assert not can_practise_at(
            db_session,
            doctor,
            "access_patient_records",
            org_unit_id=org.id,
        )


class TestBothDirections:
    """The same rows answer 'what can they do' and 'who can do this'."""

    def test_competencies_at_lists_only_that_place(self, db_session):
        here = _org(db_session, "Here")
        there = _org(db_session, "There")
        doctor = _user(db_session, "doc")
        _authorise(db_session, doctor, "access_patient_records", org=here)
        _authorise(
            db_session, doctor, "prescribe_controlled_schedule_2", org=there
        )

        assert competencies_at(db_session, doctor, org_unit_id=here.id) == {
            "access_patient_records"
        }

    def test_who_can_practise_at_finds_everyone_authorised_here(
        self, db_session
    ):
        here = _org(db_session, "Here")
        there = _org(db_session, "There")
        anna = _user(db_session, "anna")
        ben = _user(db_session, "ben")
        cara = _user(db_session, "cara")
        _authorise(db_session, anna, "access_patient_records", org=here)
        _authorise(db_session, ben, "access_patient_records", org=here)
        _authorise(db_session, cara, "access_patient_records", org=there)

        found = who_can_practise_at(
            db_session, "access_patient_records", org_unit_id=here.id
        )
        assert sorted(found) == sorted([anna.id, ben.id])

    def test_who_can_practise_at_does_not_apply_ceilings(self, db_session):
        """Documented behaviour: it is a candidate list, not an answer.

        Filtering by every user's ceiling would mean loading every user, so
        callers check ``can_at`` before acting on a name.
        """
        here = _org(db_session, "Here")
        receptionist = _user(
            db_session, "front_desk", profession="receptionist"
        )
        _authorise(
            db_session, receptionist, "access_patient_records", org=here
        )

        assert who_can_practise_at(
            db_session, "access_patient_records", org_unit_id=here.id
        ) == [receptionist.id]
        assert not can_practise_at(
            db_session,
            receptionist,
            "access_patient_records",
            org_unit_id=here.id,
        )


class TestTheResolverAsksForOnePlace:
    """One place, named once.

    This used to take an organisation id or a site id and refuse both or
    neither, because an organisation was a row in another table. An
    organisation is a place now, so the pair collapsed into one required
    argument and Python does the refusing.
    """

    def test_naming_no_place_is_a_type_error(self, db_session):
        doctor = _user(db_session, "doc")

        with pytest.raises(TypeError):
            can_practise_at(db_session, doctor, "access_patient_records")

    def test_competencies_at_asks_the_same_way(self, db_session):
        doctor = _user(db_session, "doc")

        with pytest.raises(TypeError):
            competencies_at(db_session, doctor)

    def test_an_organisation_and_a_place_beneath_it_are_named_alike(
        self, db_session
    ):
        """Which is the point of the collapse: one argument, two kinds
        of place, no branch for the caller to get wrong."""
        org = _org(db_session, "Trust")
        site = _site(db_session, "Ward 1")
        doctor = _user(db_session, "doc")
        _authorise(db_session, doctor, "access_patient_records", org=org)
        _authorise(db_session, doctor, "access_patient_records", site=site)

        assert can_practise_at(
            db_session,
            doctor,
            "access_patient_records",
            org_unit_id=org.id,
        )
        assert can_practise_at(
            db_session, doctor, "access_patient_records", org_unit_id=site.id
        )


class TestTheDatabaseKeepsAGrantToOnePlace:
    """The constraint, not convention, is what holds this."""

    def test_there_is_only_one_place_column(self, db_session):
        """Two columns became one when the two tables of places merged.

        Naming an organisation now means naming its own row in the tree,
        so a row cannot be at two places by writing to two columns.
        """
        org = _org(db_session, "Trust")
        doctor = _user(db_session, "doc")

        with pytest.raises(TypeError):
            PractisingCompetency(
                user_id=doctor.id,
                organisation_id=org.id,
                competency="access_patient_records",
            )

    def test_a_row_naming_no_place_is_rejected(self, db_session):
        doctor = _user(db_session, "doc")

        db_session.add(
            PractisingCompetency(
                user_id=doctor.id,
                competency="access_patient_records",
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_the_same_authorisation_twice_is_rejected(self, db_session):
        org = _org(db_session, "Trust")
        doctor = _user(db_session, "doc")
        _authorise(db_session, doctor, "access_patient_records", org=org)

        db_session.add(
            PractisingCompetency(
                user_id=doctor.id,
                org_unit_id=org.id,
                competency="access_patient_records",
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()


def _rows(
    db: Session, user: User, unit: OrgUnit
) -> list[PractisingCompetency]:
    return list(
        db.scalars(
            select(PractisingCompetency).where(
                PractisingCompetency.user_id == user.id,
                PractisingCompetency.org_unit_id == unit.id,
            )
        ).all()
    )


class TestWritingAPracticeRow:
    """The one pair of writers the org_unit and user routes share."""

    def test_authorising_writes_the_row_and_names_who_decided(
        self, db_session
    ):
        org = _org(db_session, "Trust")
        doctor = _user(db_session, "doc")
        admin = _user(db_session, "admin")

        written = authorise_practice(
            db_session,
            user_id=doctor.id,
            org_unit_id=org.id,
            competency="access_patient_records",
            authorised_by=admin.id,
        )

        assert written is True
        (row,) = _rows(db_session, doctor, org)
        assert row.competency == "access_patient_records"
        assert row.authorised_by == admin.id
        assert can_practise_at(
            db_session, doctor, "access_patient_records", org_unit_id=org.id
        )

    def test_authorising_twice_writes_nothing_and_keeps_the_author(
        self, db_session
    ):
        org = _org(db_session, "Trust")
        doctor = _user(db_session, "doc")
        first = _user(db_session, "first")
        second = _user(db_session, "second")
        authorise_practice(
            db_session,
            user_id=doctor.id,
            org_unit_id=org.id,
            competency="access_patient_records",
            authorised_by=first.id,
        )

        written = authorise_practice(
            db_session,
            user_id=doctor.id,
            org_unit_id=org.id,
            competency="access_patient_records",
            authorised_by=second.id,
        )

        assert written is False
        (row,) = _rows(db_session, doctor, org)
        assert row.authorised_by == first.id

    def test_authorising_what_they_do_not_hold_is_refused(self, db_session):
        """The competency comes first, then where it may be practised."""
        org = _org(db_session, "Trust")
        patient = _user(db_session, "pat", profession="patient")
        admin = _user(db_session, "admin")

        with pytest.raises(ValueError, match="does not hold"):
            authorise_practice(
                db_session,
                user_id=patient.id,
                org_unit_id=org.id,
                competency="certify_death",
                authorised_by=admin.id,
            )

        assert db_session.scalars(select(PractisingCompetency)).all() == []

    def test_losing_a_competency_removes_it_everywhere(self, db_session):
        """Rows for what somebody no longer holds are deleted."""
        org = _org(db_session, "Trust")
        elsewhere = _org(db_session, "Other Trust")
        doctor = _user(db_session, "doc")
        _authorise(db_session, doctor, "certify_death", org=org)
        _authorise(db_session, doctor, "certify_death", org=elsewhere)
        _authorise(db_session, doctor, "access_patient_records", org=org)

        for row in doctor.competency_grants:
            if row.competency_id == "certify_death":
                db_session.delete(row)

        db_session.commit()
        db_session.refresh(doctor)

        removed = withdraw_not_held(db_session, doctor)
        db_session.commit()

        assert removed == 2
        assert competencies_at(db_session, doctor, org_unit_id=org.id) == {
            "access_patient_records"
        }
        assert (
            authorised_at(db_session, doctor.id, org_unit_id=elsewhere.id)
            == set()
        )

    def test_withdrawing_removes_only_that_row(self, db_session):
        org = _org(db_session, "Trust")
        elsewhere = _org(db_session, "Other Trust")
        doctor = _user(db_session, "doc")
        _authorise(db_session, doctor, "access_patient_records", org=org)
        _authorise(db_session, doctor, "certify_death", org=org)
        _authorise(db_session, doctor, "access_patient_records", org=elsewhere)

        withdraw_practice(
            db_session,
            user_id=doctor.id,
            org_unit_id=org.id,
            competency="access_patient_records",
        )

        assert [r.competency for r in _rows(db_session, doctor, org)] == [
            "certify_death"
        ]
        assert len(_rows(db_session, doctor, elsewhere)) == 1

    def test_withdrawing_what_was_never_authorised_is_not_an_error(
        self, db_session
    ):
        org = _org(db_session, "Trust")
        doctor = _user(db_session, "doc")

        withdraw_practice(
            db_session,
            user_id=doctor.id,
            org_unit_id=org.id,
            competency="access_patient_records",
        )

        assert _rows(db_session, doctor, org) == []
