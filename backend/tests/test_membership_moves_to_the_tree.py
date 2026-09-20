"""Membership of an organisation is membership of its place.

There is one membership table now, keyed on a place in the tree. An
organisation's place is its own row, so "who is at this trust" and "who
is at this ward" are the same question asked of two rows.

Both spellings are checked throughout — the query that answers by
organisation, and the row itself — because they have to agree: they are
the same row read two ways.

Covers:
- Recording membership writes one row against the organisation's place
- A repeat changes the capacity rather than failing
- Removing a membership removes the row
- An edit to somebody's organisations leaves their ward memberships alone
- Membership written straight to a place is read as organisation membership
- A ward membership can be written through the same function
- The capacity defaults to the narrower value
"""

from __future__ import annotations

import pytest
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import (
    OrgUnit,
    User,
    org_unit_member,
)
from app.organisations import (
    add_org_unit_member,
    get_member_org_unit_ids,
    get_org_unit_member_ids,
    organisation_org_unit_member,
    remove_org_unit_member,
    remove_org_unit_memberships,
)
from app.security import hash_password


def _org(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ward(db: Session, org: OrgUnit, name: str) -> OrgUnit:
    site = OrgUnit(name=name, type="ward", parent_id=org.id)
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


def _by_organisation(db: Session, org: OrgUnit, user: User) -> str | None:
    """Read the membership the way a route asking about an organisation does."""
    return db.scalar(
        select(organisation_org_unit_member.c.capacity).where(
            organisation_org_unit_member.c.org_unit_id == org.id,
            organisation_org_unit_member.c.user_id == user.id,
        )
    )


def _by_place(db: Session, org: OrgUnit, user: User) -> str | None:
    """Read the same row directly, as a row against the organisation's place."""
    return db.scalar(
        select(org_unit_member.c.capacity).where(
            org_unit_member.c.org_unit_id == org.id,
            org_unit_member.c.user_id == user.id,
        )
    )


class TestRecordingMembership:
    def test_one_row_answers_both_questions(self, db_session):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        add_org_unit_member(db_session, org.id, person.id, "staff")
        db_session.commit()

        assert _by_organisation(db_session, org, person) == "staff"
        assert _by_place(db_session, org, person) == "staff"

    def test_recording_it_twice_changes_the_capacity(self, db_session):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        add_org_unit_member(db_session, org.id, person.id, "trainee")
        add_org_unit_member(db_session, org.id, person.id, "staff")
        db_session.commit()

        assert _by_organisation(db_session, org, person) == "staff"
        assert _by_place(db_session, org, person) == "staff"

    def test_an_unknown_capacity_is_refused(self, db_session):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        with pytest.raises(ValueError):
            add_org_unit_member(db_session, org.id, person.id, "chief_wizard")


class TestAWardIsAPlaceToo:
    """The writer takes a place, and a ward is one.

    It used to take an organisation id and translate to the root, so a
    ward id found no organisation and the call silently did nothing —
    or, where the two id sequences overlap, found a different
    organisation and wrote the membership there.
    """

    def test_a_ward_membership_is_written(self, db_session):
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward 1")
        person = _person(db_session, "alice")

        add_org_unit_member(db_session, ward.id, person.id, "trainee")
        db_session.commit()

        assert (
            db_session.scalar(
                select(org_unit_member.c.capacity).where(
                    org_unit_member.c.org_unit_id == ward.id,
                    org_unit_member.c.user_id == person.id,
                )
            )
            == "trainee"
        )

    def test_it_is_not_a_membership_of_the_trust(self, db_session):
        """Reach flows downward; a ward membership does not reach up."""
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward 1")
        person = _person(db_session, "alice")

        add_org_unit_member(db_session, ward.id, person.id, "trainee")
        db_session.commit()

        assert _by_organisation(db_session, org, person) is None


class TestRemovingMembership:
    def test_the_row_goes(self, db_session):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")
        add_org_unit_member(db_session, org.id, person.id, "staff")
        db_session.commit()

        remove_org_unit_member(db_session, org.id, person.id)
        db_session.commit()

        assert _by_organisation(db_session, org, person) is None
        assert _by_place(db_session, org, person) is None

    def test_clearing_everything_clears_them_all(self, db_session):
        a = _org(db_session, "A")
        b = _org(db_session, "B")
        person = _person(db_session, "alice")
        add_org_unit_member(db_session, a.id, person.id, "staff")
        add_org_unit_member(db_session, b.id, person.id, "staff")
        db_session.commit()

        remove_org_unit_memberships(db_session, person.id)
        db_session.commit()

        for org in (a, b):
            assert _by_organisation(db_session, org, person) is None
            assert _by_place(db_session, org, person) is None

    def test_clearing_some_leaves_the_others(self, db_session):
        mine = _org(db_session, "Mine")
        theirs = _org(db_session, "Theirs")
        person = _person(db_session, "alice")
        add_org_unit_member(db_session, mine.id, person.id, "staff")
        add_org_unit_member(db_session, theirs.id, person.id, "staff")
        db_session.commit()

        remove_org_unit_memberships(db_session, person.id, [mine.id])
        db_session.commit()

        assert _by_place(db_session, mine, person) is None
        assert _by_place(db_session, theirs, person) == "staff"

    def test_a_ward_membership_is_left_alone(self, db_session):
        """An edit to which trusts somebody belongs to is not an edit to
        which wards they are on."""
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward 1")
        person = _person(db_session, "alice")
        add_org_unit_member(db_session, org.id, person.id, "staff")
        db_session.execute(
            insert(org_unit_member).values(
                org_unit_id=ward.id,
                user_id=person.id,
                capacity="trainee",
            )
        )
        db_session.commit()

        remove_org_unit_memberships(db_session, person.id)
        db_session.commit()

        still_on_ward = db_session.scalar(
            select(org_unit_member.c.capacity).where(
                org_unit_member.c.org_unit_id == ward.id,
                org_unit_member.c.user_id == person.id,
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
            insert(org_unit_member).values(
                org_unit_id=ward.id, user_id=person.id
            )
        )
        db_session.commit()

        assert (
            db_session.scalar(
                select(org_unit_member.c.capacity).where(
                    org_unit_member.c.org_unit_id == ward.id,
                    org_unit_member.c.user_id == person.id,
                )
            )
            == "trainee"
        )


class TestThroughTheRoutes:
    def test_adding_staff_records_it(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        resp = authenticated_superadmin_client.post(
            f"/api/org-units/{org.id}/members",
            json={"user_id": person.id, "capacity": "staff"},
        )

        assert resp.status_code == 200
        assert _by_place(db_session, org, person) == "staff"

    def test_removing_staff_clears_it(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")
        authenticated_superadmin_client.post(
            f"/api/org-units/{org.id}/members",
            json={"user_id": person.id, "capacity": "staff"},
        )

        resp = authenticated_superadmin_client.delete(
            f"/api/org-units/{org.id}/members/{person.id}"
        )

        assert resp.status_code == 200
        assert _by_organisation(db_session, org, person) is None
        assert _by_place(db_session, org, person) is None

    def test_editing_where_a_person_belongs_records_it(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        resp = authenticated_superadmin_client.patch(
            f"/api/users/{person.id}",
            json={"org_unit_ids": [org.id]},
        )

        assert resp.status_code == 200
        assert _by_place(db_session, org, person) == "staff"

    def test_the_organisation_and_the_ward_are_one_list(
        self, authenticated_superadmin_client, db_session
    ):
        """They were two fields counted against two tables.

        Sending the ward alone used to leave the organisation membership
        standing, because a separate field settled it. One list settles
        both, so naming the ward and not the trust means exactly that.
        """
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward 1")
        person = _person(db_session, "alice")
        authenticated_superadmin_client.patch(
            f"/api/users/{person.id}",
            json={"org_unit_ids": [org.id, ward.id]},
        )

        resp = authenticated_superadmin_client.patch(
            f"/api/users/{person.id}", json={"org_unit_ids": [ward.id]}
        )

        assert resp.status_code == 200
        assert _by_place(db_session, org, person) is None


class TestMembershipWrittenStraightToAPlace:
    def test_a_row_against_the_root_is_organisation_membership(
        self, db_session
    ):
        """One table, so there is no second place to forget to write."""
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")

        db_session.execute(
            insert(org_unit_member).values(
                org_unit_id=org.id,
                user_id=person.id,
                capacity="staff",
            )
        )
        db_session.commit()

        assert get_member_org_unit_ids(db_session, person.id) == [org.id]
        assert get_org_unit_member_ids(db_session, [org.id]) == {person.id}

    def test_a_row_against_a_ward_is_not(self, db_session):
        """Membership does not climb: being on a ward is not being at the
        trust."""
        org = _org(db_session, "Trust")
        ward = _ward(db_session, org, "Ward 1")
        person = _person(db_session, "alice")

        db_session.execute(
            insert(org_unit_member).values(
                org_unit_id=ward.id,
                user_id=person.id,
                capacity="trainee",
            )
        )
        db_session.commit()

        assert get_member_org_unit_ids(db_session, person.id) == []
        assert get_org_unit_member_ids(db_session, [org.id]) == set()

    def test_the_capacity_filter_still_bites(self, db_session):
        org = _org(db_session, "Trust")
        person = _person(db_session, "alice")
        add_org_unit_member(db_session, org.id, person.id, "trainee")
        db_session.commit()

        assert (
            get_member_org_unit_ids(db_session, person.id, capacity="staff")
            == []
        )
        assert get_member_org_unit_ids(
            db_session, person.id, capacity="trainee"
        ) == [org.id]
