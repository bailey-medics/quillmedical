"""Tests for what kind of member someone is at an organisation.

`organisation_staff_member` had two columns, so a teaching delegate and a
consultant were the same row. That is why the organisation admin page listed
students among the staff, and why the messaging self-join check had to fall
back on asking what platform level someone held: the membership check below
it could not tell them apart.

`organisation_member` carries a capacity, so it can.
"""

from __future__ import annotations

import pytest
from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    MEMBER_CAPACITIES,
    Organisation,
    User,
    organisation_member,
    validate_member_capacity,
)
from app.security import hash_password


def _user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
        system_permissions="staff",
    )
    db.add(user)
    db.commit()
    return user


def _org(db: Session, name: str = "Trust") -> Organisation:
    org = Organisation(name=name, type="hospital")
    db.add(org)
    db.commit()
    return org


def _capacity_of(db: Session, org: Organisation, user: User) -> str | None:
    row = db.execute(
        select(organisation_member.c.capacity).where(
            organisation_member.c.organisation_id == org.id,
            organisation_member.c.user_id == user.id,
        )
    ).first()
    return row[0] if row else None


class TestTheCapacityDistinguishesMembers:
    """The whole point: staff and trainee are no longer the same row."""

    def test_a_staff_member_and_a_trainee_are_told_apart(self, db_session):
        org = _org(db_session)
        consultant = _user(db_session, "consultant")
        delegate = _user(db_session, "delegate")

        db_session.execute(
            insert(organisation_member).values(
                organisation_id=org.id,
                user_id=consultant.id,
                capacity="staff",
            )
        )
        db_session.execute(
            insert(organisation_member).values(
                organisation_id=org.id,
                user_id=delegate.id,
                capacity="trainee",
            )
        )
        db_session.commit()

        assert _capacity_of(db_session, org, consultant) == "staff"
        assert _capacity_of(db_session, org, delegate) == "trainee"

    def test_capacity_defaults_to_the_narrower_one(self, db_session):
        """Least privilege: forgetting to say gets you the lesser access.

        A row wrongly marked trainee loses access and someone complains. A
        row wrongly marked staff keeps access nobody notices, which is the
        failure that does not announce itself.
        """
        org = _org(db_session)
        person = _user(db_session, "someone")
        db_session.execute(
            insert(organisation_member).values(
                organisation_id=org.id, user_id=person.id
            )
        )
        db_session.commit()

        assert _capacity_of(db_session, org, person) == "trainee"


class TestOnePlaceVocabulary:
    """An organisation and a site use the same words for the same thing."""

    def test_the_known_capacities(self):
        assert MEMBER_CAPACITIES == ("staff", "trainee")

    def test_a_known_capacity_passes(self):
        assert validate_member_capacity("trainee") == "trainee"

    def test_an_unknown_capacity_is_refused(self):
        with pytest.raises(ValueError, match="Unknown member capacity"):
            validate_member_capacity("chief_wizard")

    def test_the_error_names_the_known_ones(self):
        with pytest.raises(ValueError, match="staff, trainee"):
            validate_member_capacity("visitor")

    def test_sites_and_organisations_share_the_list(self):
        """Two lists would be two meanings of one word waiting to drift."""
        from app.models import SITE_CAPACITIES

        assert SITE_CAPACITIES is MEMBER_CAPACITIES


class TestOneRowPerPersonPerOrganisation:
    """The primary key still holds after the rename."""

    def test_the_same_person_twice_is_refused(self, db_session):
        org = _org(db_session)
        person = _user(db_session, "someone")
        db_session.execute(
            insert(organisation_member).values(
                organisation_id=org.id,
                user_id=person.id,
                capacity="staff",
            )
        )
        db_session.commit()

        # The constraint fires on execute, not on commit.
        with pytest.raises(IntegrityError):
            db_session.execute(
                insert(organisation_member).values(
                    organisation_id=org.id,
                    user_id=person.id,
                    capacity="trainee",
                )
            )
        db_session.rollback()
