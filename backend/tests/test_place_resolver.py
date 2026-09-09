"""Tests for the one resolver answering where a person can reach.

There were two, and they disagreed. `organisations.get_user_org_ids` read
the organisation table alone; teaching's `_get_user_org_ids` also walked
site membership *upward* into organisation membership, because teaching
needed site people to reach organisation content and rolling them up was
the available fudge.

So the same question had two answers depending on which function you
called. These tests pin the single answer, and the distinction it rests
on: reach is not membership. A site trainee reaches the trust's teaching
content without becoming staff of the trust.
"""

from __future__ import annotations

import pytest
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    Site,
    User,
    organisation_member,
    organisation_site,
    site_member,
)
from app.organisations import (
    get_member_org_ids,
    get_org_member_ids,
    get_org_staff_ids,
    get_reachable_org_ids,
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


def _org(db: Session, name: str) -> Organisation:
    org = Organisation(name=name, type="hospital")
    db.add(org)
    db.commit()
    return org


def _site(db: Session, name: str, org: Organisation | None = None) -> Site:
    site = Site(name=name, type="ward")
    db.add(site)
    db.commit()
    if org is not None:
        db.execute(
            insert(organisation_site).values(
                organisation_id=org.id, site_id=site.id
            )
        )
        db.commit()
    return site


def _join_org(
    db: Session, org: Organisation, user: User, capacity: str
) -> None:
    db.execute(
        insert(organisation_member).values(
            organisation_id=org.id, user_id=user.id, capacity=capacity
        )
    )
    db.commit()


def _join_site(db: Session, site: Site, user: User, capacity: str) -> None:
    db.execute(
        insert(site_member).values(
            site_id=site.id, user_id=user.id, capacity=capacity
        )
    )
    db.commit()


class TestReachFlowsDownwardOnly:
    """Organisation membership reaches its sites. Sites do not reach up."""

    def test_a_site_member_reaches_the_linked_organisation(self, db_session):
        """This is why teaching's roll-up existed, now expressed once.

        A trainee at a ward receives what the trust made available there,
        so the trust is reachable. That is delivery flowing downward, not
        the trainee climbing up.
        """
        org = _org(db_session, "Trust")
        site = _site(db_session, "Ward", org)
        trainee = _user(db_session, "trainee")
        _join_site(db_session, site, trainee, "trainee")

        assert get_reachable_org_ids(db_session, trainee.id) == [org.id]

    def test_a_site_member_is_not_a_member_of_the_organisation(
        self, db_session
    ):
        """Reaching a trust does not make you staff of it.

        The distinction the two functions exist to keep. Collapsing them
        is what let the organisation admin page list students as staff.
        """
        org = _org(db_session, "Trust")
        site = _site(db_session, "Ward", org)
        trainee = _user(db_session, "trainee")
        _join_site(db_session, site, trainee, "trainee")

        assert get_member_org_ids(db_session, trainee.id) == []

    def test_an_unlinked_site_reaches_nothing(self, db_session):
        org = _org(db_session, "Trust")
        site = _site(db_session, "Standalone")
        person = _user(db_session, "person")
        _join_site(db_session, site, person, "staff")

        assert get_reachable_org_ids(db_session, person.id) == []
        assert org.id is not None

    def test_direct_membership_reaches_the_organisation(self, db_session):
        org = _org(db_session, "Trust")
        consultant = _user(db_session, "consultant")
        _join_org(db_session, org, consultant, "staff")

        assert get_reachable_org_ids(db_session, consultant.id) == [org.id]

    def test_both_routes_are_merged_without_duplicates(self, db_session):
        """Reachable by two paths is still one organisation."""
        org = _org(db_session, "Trust")
        site = _site(db_session, "Ward", org)
        person = _user(db_session, "person")
        _join_org(db_session, org, person, "staff")
        _join_site(db_session, site, person, "staff")

        assert get_reachable_org_ids(db_session, person.id) == [org.id]

    def test_someone_at_nowhere_reaches_nothing(self, db_session):
        stranger = _user(db_session, "stranger")

        assert get_reachable_org_ids(db_session, stranger.id) == []
        assert get_member_org_ids(db_session, stranger.id) == []


class TestCapacityNarrowsTheAnswer:
    """The column exists so a check can ask *what kind* of member."""

    def test_membership_can_be_narrowed_to_staff(self, db_session):
        """The question the messaging self-join check is really asking.

        Without this it must fall back on the platform level, which is
        the coupling `2026-09-09-platform-role-plan.md` exists to remove.
        """
        org = _org(db_session, "Trust")
        consultant = _user(db_session, "consultant")
        delegate = _user(db_session, "delegate")
        _join_org(db_session, org, consultant, "staff")
        _join_org(db_session, org, delegate, "trainee")

        assert get_member_org_ids(
            db_session, consultant.id, capacity="staff"
        ) == [org.id]
        assert (
            get_member_org_ids(db_session, delegate.id, capacity="staff") == []
        )

    def test_membership_without_a_capacity_counts_everyone(self, db_session):
        org = _org(db_session, "Trust")
        delegate = _user(db_session, "delegate")
        _join_org(db_session, org, delegate, "trainee")

        assert get_member_org_ids(db_session, delegate.id) == [org.id]

    def test_reach_can_be_narrowed_at_the_site_too(self, db_session):
        org = _org(db_session, "Trust")
        site = _site(db_session, "Ward", org)
        trainee = _user(db_session, "trainee")
        _join_site(db_session, site, trainee, "trainee")

        assert get_reachable_org_ids(db_session, trainee.id) == [org.id]
        assert (
            get_reachable_org_ids(db_session, trainee.id, capacity="staff")
            == []
        )

    def test_an_unknown_capacity_is_refused(self, db_session):
        """Validated against the shared list rather than passed to SQL."""
        person = _user(db_session, "person")

        with pytest.raises(ValueError, match="Unknown member capacity"):
            get_member_org_ids(db_session, person.id, capacity="chief_wizard")


class TestListingMembersOfAnOrganisation:
    """Who is at these organisations, and how a caller asks for staff."""

    def test_the_staff_helper_still_returns_everyone(self, db_session):
        """`get_org_staff_ids` says staff and returns every member.

        Left that way on purpose. Narrowing it would change what every
        existing caller means in a single edit, and the admin user
        listing genuinely wants everybody at the organisation — a
        trainee an admin cannot see is a trainee they cannot administer.
        The name is wrong; the fix is callers moving to the explicit
        function below, not a silent change under them.
        """
        org = _org(db_session, "Trust")
        consultant = _user(db_session, "consultant")
        delegate = _user(db_session, "delegate")
        _join_org(db_session, org, consultant, "staff")
        _join_org(db_session, org, delegate, "trainee")

        assert get_org_staff_ids(db_session, [org.id]) == {
            consultant.id,
            delegate.id,
        }

    def test_asking_for_staff_excludes_the_trainee(self, db_session):
        """What a caller that really means staff should say instead."""
        org = _org(db_session, "Trust")
        consultant = _user(db_session, "consultant")
        delegate = _user(db_session, "delegate")
        _join_org(db_session, org, consultant, "staff")
        _join_org(db_session, org, delegate, "trainee")

        assert get_org_member_ids(db_session, [org.id], capacity="staff") == {
            consultant.id
        }

    def test_no_organisations_returns_nobody(self, db_session):
        """Not everybody. A caller who resolved to nothing sees nothing."""
        org = _org(db_session, "Trust")
        consultant = _user(db_session, "consultant")
        _join_org(db_session, org, consultant, "staff")

        assert get_org_member_ids(db_session, []) == set()
        assert get_org_staff_ids(db_session, []) == set()
