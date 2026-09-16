"""Membership of an organisation is also membership of its place.

The two membership tables are merging into one, keyed on a place in the
tree. Until the old one goes, every write lands in both, because the
readers still ask the old one and a row in only one of them would be a
membership that exists or does not depending on who asks.

Covers:
- Both tables are written by every route that records membership
- The capacity is the same in both, and a repeat changes it rather than
  failing
- Removing a membership removes it from both
- An edit to somebody's organisations leaves their ward memberships alone
- ``site_member.capacity`` defaults to the narrower value
"""

from __future__ import annotations

import pytest
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    Site,
    User,
    organisation_member,
    site_member,
)
from app.organisations import (
    add_organisation_member,
    remove_organisation_member,
    remove_organisation_memberships,
)
from app.security import hash_password


def _org(db: Session, name: str) -> Organisation:
    org = Organisation(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ward(db: Session, org: Organisation, name: str) -> Site:
    site = Site(name=name, type="ward", parent_id=org.org_unit_id)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


def _person(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash=hash_password("Sup3rSecret!pass"),
        is_active=True,
        email_verified=True,
        base_profession="patient",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _old_capacity(db: Session, org: Organisation, user: User) -> str | None:
    return db.scalar(
        select(organisation_member.c.capacity).where(
            organisation_member.c.organisation_id == org.id,
            organisation_member.c.user_id == user.id,
        )
    )


def _tree_capacity(db: Session, org: Organisation, user: User) -> str | None:
    return db.scalar(
        select(site_member.c.capacity).where(
            site_member.c.site_id == org.org_unit_id,
            site_member.c.user_id == user.id,
        )
    )


class TestRecordingMembership:
    def test_both_tables_are_written(self, db_session):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        add_organisation_member(db_session, org.id, person.id, "staff")
        db_session.commit()

        assert _old_capacity(db_session, org, person) == "staff"
        assert _tree_capacity(db_session, org, person) == "staff"

    def test_recording_it_twice_changes_the_capacity(self, db_session):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        add_organisation_member(db_session, org.id, person.id, "trainee")
        add_organisation_member(db_session, org.id, person.id, "staff")
        db_session.commit()

        assert _old_capacity(db_session, org, person) == "staff"
        assert _tree_capacity(db_session, org, person) == "staff"

    def test_an_unknown_capacity_is_refused(self, db_session):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        with pytest.raises(ValueError):
            add_organisation_member(
                db_session, org.id, person.id, "chief_wizard"
            )


class TestRemovingMembership:
    def test_both_tables_are_cleared(self, db_session):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")
        add_organisation_member(db_session, org.id, person.id, "staff")
        db_session.commit()

        remove_organisation_member(db_session, org.id, person.id)
        db_session.commit()

        assert _old_capacity(db_session, org, person) is None
        assert _tree_capacity(db_session, org, person) is None

    def test_clearing_everything_clears_both(self, db_session):
        a = _org(db_session, "A")
        b = _org(db_session, "B")
        person = _person(db_session, "alice")
        add_organisation_member(db_session, a.id, person.id, "staff")
        add_organisation_member(db_session, b.id, person.id, "staff")
        db_session.commit()

        remove_organisation_memberships(db_session, person.id)
        db_session.commit()

        for org in (a, b):
            assert _old_capacity(db_session, org, person) is None
            assert _tree_capacity(db_session, org, person) is None

    def test_clearing_some_leaves_the_others(self, db_session):
        mine = _org(db_session, "Mine")
        theirs = _org(db_session, "Theirs")
        person = _person(db_session, "alice")
        add_organisation_member(db_session, mine.id, person.id, "staff")
        add_organisation_member(db_session, theirs.id, person.id, "staff")
        db_session.commit()

        remove_organisation_memberships(db_session, person.id, [mine.id])
        db_session.commit()

        assert _tree_capacity(db_session, mine, person) is None
        assert _tree_capacity(db_session, theirs, person) == "staff"

    def test_a_ward_membership_is_left_alone(self, db_session):
        """An edit to which trusts somebody belongs to is not an edit to
        which wards they are on."""
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward 1")
        person = _person(db_session, "alice")
        add_organisation_member(db_session, org.id, person.id, "staff")
        db_session.execute(
            insert(site_member).values(
                site_id=ward.id, user_id=person.id, capacity="trainee"
            )
        )
        db_session.commit()

        remove_organisation_memberships(db_session, person.id)
        db_session.commit()

        still_on_ward = db_session.scalar(
            select(site_member.c.capacity).where(
                site_member.c.site_id == ward.id,
                site_member.c.user_id == person.id,
            )
        )
        assert still_on_ward == "trainee"


class TestTheNarrowerDefault:
    def test_a_membership_that_does_not_say_is_a_trainee(self, db_session):
        """Carried across from the table being merged in.

        A row wrongly marked trainee loses access and somebody complains;
        one wrongly marked staff keeps access nobody notices.
        """
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward 1")
        person = _person(db_session, "alice")

        db_session.execute(
            insert(site_member).values(site_id=ward.id, user_id=person.id)
        )
        db_session.commit()

        assert (
            db_session.scalar(
                select(site_member.c.capacity).where(
                    site_member.c.site_id == ward.id,
                    site_member.c.user_id == person.id,
                )
            )
            == "trainee"
        )


class TestThroughTheRoutes:
    def test_adding_staff_writes_both(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        resp = authenticated_superadmin_client.post(
            f"/api/organisations/{org.id}/staff", json={"user_id": person.id}
        )

        assert resp.status_code == 200
        assert _tree_capacity(db_session, org, person) == "staff"

    def test_removing_staff_clears_both(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")
        authenticated_superadmin_client.post(
            f"/api/organisations/{org.id}/staff", json={"user_id": person.id}
        )

        resp = authenticated_superadmin_client.delete(
            f"/api/organisations/{org.id}/staff/{person.id}"
        )

        assert resp.status_code == 200
        assert _old_capacity(db_session, org, person) is None
        assert _tree_capacity(db_session, org, person) is None

    def test_editing_a_persons_organisations_writes_both(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        resp = authenticated_superadmin_client.patch(
            f"/api/users/{person.id}",
            json={"organisation_ids": [org.id]},
        )

        assert resp.status_code == 200
        assert _tree_capacity(db_session, org, person) == "staff"

    def test_editing_a_persons_wards_leaves_their_organisations(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward 1")
        person = _person(db_session, "alice")
        authenticated_superadmin_client.patch(
            f"/api/users/{person.id}",
            json={"organisation_ids": [org.id]},
        )

        resp = authenticated_superadmin_client.patch(
            f"/api/users/{person.id}", json={"site_ids": [ward.id]}
        )

        assert resp.status_code == 200
        assert _tree_capacity(db_session, org, person) == "staff"
