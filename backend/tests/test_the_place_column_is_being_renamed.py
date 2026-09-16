"""Both names for the place column hold the same value.

``site_id`` is becoming ``org_unit_id``, because the table it points at is
becoming ``org_unit`` and a column named after a site would then name
nothing. A column rename here is a copy-and-retire across deploys: the old
revision and the new one run side by side against one schema, so for a
while both columns have to hold the same place.

These tests are what makes the middle of that safe. They go when the old
column does.

Covers:
- Writing either name fills in the other, on insert and on update
- Every route that records a place writes both
- Both unique rules are in force, so neither can be slipped past
"""

from __future__ import annotations

import pytest
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    Position,
    PractisingCompetency,
    Site,
    User,
    site_member,
)
from app.organisations import add_organisation_member
from app.security import hash_password

COMPETENCY = "access_patient_records"


def _org(db: Session, name: str = "Trust") -> Organisation:
    org = Organisation(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ward(db: Session, org: Organisation, name: str = "Ward 1") -> Site:
    site = Site(name=name, type="ward", parent_id=org.org_unit_id)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


def _person(db: Session, username: str = "alice") -> User:
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


class TestAuthorisations:
    def test_the_old_name_fills_in_the_new_one(self, db_session):
        org = _org(db_session)
        ward = _ward(db_session, org)
        person = _person(db_session)

        row = PractisingCompetency(
            user_id=person.id, site_id=ward.id, competency=COMPETENCY
        )
        db_session.add(row)
        db_session.commit()

        assert row.org_unit_id == ward.id

    def test_the_new_name_fills_in_the_old_one(self, db_session):
        org = _org(db_session)
        ward = _ward(db_session, org)
        person = _person(db_session)

        row = PractisingCompetency(
            user_id=person.id, org_unit_id=ward.id, competency=COMPETENCY
        )
        db_session.add(row)
        db_session.commit()

        assert row.site_id == ward.id

    def test_moving_it_moves_both(self, db_session):
        org = _org(db_session)
        first = _ward(db_session, org, "Ward 1")
        second = _ward(db_session, org, "Ward 2")
        person = _person(db_session)
        row = PractisingCompetency(
            user_id=person.id, site_id=first.id, competency=COMPETENCY
        )
        db_session.add(row)
        db_session.commit()

        row.org_unit_id = second.id
        row.site_id = None
        db_session.commit()

        assert row.site_id == second.id
        assert row.org_unit_id == second.id

    def test_the_new_rule_refuses_a_duplicate_too(self, db_session):
        """Both rules are in force, so neither can be slipped past."""
        from sqlalchemy.exc import IntegrityError

        org = _org(db_session)
        ward = _ward(db_session, org)
        person = _person(db_session)
        db_session.add(
            PractisingCompetency(
                user_id=person.id, site_id=ward.id, competency=COMPETENCY
            )
        )
        db_session.commit()

        db_session.add(
            PractisingCompetency(
                user_id=person.id, org_unit_id=ward.id, competency=COMPETENCY
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()


class TestPosts:
    def test_both_names_are_filled_in(self, db_session):
        org = _org(db_session)
        ward = _ward(db_session, org)

        post = Position(
            org_unit_id=ward.id, kind="clinical_lead", title="Clinical lead"
        )
        db_session.add(post)
        db_session.commit()

        assert post.site_id == ward.id
        assert post.org_unit_id == ward.id


class TestMembership:
    def test_joining_an_organisation_writes_both(self, db_session):
        org = _org(db_session)
        person = _person(db_session)

        add_organisation_member(db_session, org.id, person.id, "staff")
        db_session.commit()

        row = db_session.execute(
            select(site_member.c.site_id, site_member.c.org_unit_id).where(
                site_member.c.user_id == person.id
            )
        ).one()
        assert row.site_id == org.org_unit_id
        assert row.org_unit_id == org.org_unit_id

    def test_joining_a_ward_through_the_route_writes_both(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        ward = _ward(db_session, org)
        person = _person(db_session)

        resp = authenticated_superadmin_client.patch(
            f"/api/users/{person.id}", json={"site_ids": [ward.id]}
        )

        assert resp.status_code == 200
        row = db_session.execute(
            select(site_member.c.site_id, site_member.c.org_unit_id).where(
                site_member.c.user_id == person.id,
                site_member.c.site_id == ward.id,
            )
        ).one()
        assert row.org_unit_id == ward.id

    def test_registering_at_a_site_writes_both(self, db_session, test_client):
        org = _org(db_session)
        ward = _ward(db_session, org)

        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "delegate",
                "email": "delegate@example.com",
                "password": "DelegatePass123!",
                "full_name": "A Delegate",
                "organisation_id": org.id,
                "site_id": ward.id,
            },
        )

        assert resp.status_code in (200, 201)
        rows = db_session.execute(
            select(site_member.c.site_id, site_member.c.org_unit_id).where(
                site_member.c.site_id == ward.id
            )
        ).all()
        assert rows
        assert all(row.org_unit_id == row.site_id for row in rows)


class TestRowsWrittenStraightToTheTable:
    def test_a_row_with_only_the_old_name_is_still_readable(self, db_session):
        """What the database holds from before the new column existed."""
        org = _org(db_session)
        ward = _ward(db_session, org)
        person = _person(db_session)

        db_session.execute(
            insert(site_member).values(
                site_id=ward.id, user_id=person.id, capacity="trainee"
            )
        )
        db_session.commit()

        stored = db_session.execute(
            select(site_member.c.org_unit_id).where(
                site_member.c.user_id == person.id
            )
        ).scalar_one()
        assert stored is None
