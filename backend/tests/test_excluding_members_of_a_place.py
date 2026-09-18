"""The users list excludes members of a place, named by its place id.

"Add a staff member" lists everybody who is not already here, and the
screen asking has a place id: its route is keyed by one and the
membership it creates names one. The parameter it sent that id to read
it as an organisation id.

The two id sequences agree on a small installation — an organisation and
its own row in the tree are created together, so they come out with the
same number — and diverge the moment a ward is created between two
organisations. From then on the filter excluded the members of a
different organisation, or of none, and the screen offered somebody who
was already here.

There was no test of the parameter at all, which is how that survived.
These are that test, on both spellings: the older one still counts in
organisation ids for anything still sending them, and the new one counts
in places.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Organisation, OrgUnit, User
from app.organisations import add_place_member
from app.security import hash_password


@pytest.fixture
def org(db_session: Session, test_superadmin: User) -> Organisation:
    """An organisation whose id and place id differ.

    The ward in between is what pushes the two sequences apart, which is
    the whole point: with the same number either parameter would pass.
    """
    db_session.add(OrgUnit(name="A ward in between", type="ward"))
    db_session.commit()

    organisation = Organisation(name="Trust", type="hospital")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    assert organisation.id != organisation.org_unit_id
    return organisation


def _member(db: Session, org: Organisation, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.flush()
    add_place_member(db, org.org_unit_id, user.id, "staff")
    db.commit()
    db.refresh(user)
    return user


def _usernames(client: TestClient, query: str) -> set[str]:
    resp = client.get(f"/api/users?{query}")
    assert resp.status_code == 200, resp.text
    return {user["username"] for user in resp.json()["users"]}


class TestExcludingByPlace:
    def test_a_member_of_the_place_is_left_out(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        here = _member(db_session, org, "already_here")

        names = _usernames(
            authenticated_superadmin_client,
            f"exclude_place={org.org_unit_id}",
        )

        assert here.username not in names

    def test_somebody_elsewhere_is_still_offered(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        other = Organisation(name="Another trust", type="hospital")
        db_session.add(other)
        db_session.commit()
        elsewhere = _member(db_session, other, "somewhere_else")

        names = _usernames(
            authenticated_superadmin_client,
            f"exclude_place={org.org_unit_id}",
        )

        assert elsewhere.username in names

    def test_the_organisations_id_excludes_nobody_here(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        """The number the screen used to send, read as a place id.

        It names some other place, or none, so nobody at this
        organisation is filtered out. This is the failure, written down:
        the screen offered a person who was already a member.
        """
        here = _member(db_session, org, "already_here")

        names = _usernames(
            authenticated_superadmin_client, f"exclude_place={org.id}"
        )

        assert here.username in names


class TestExcludingByOrganisation:
    """The older spelling, kept until nothing sends it."""

    def test_it_still_counts_in_organisation_ids(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        here = _member(db_session, org, "already_here")

        names = _usernames(
            authenticated_superadmin_client, f"exclude_org={org.id}"
        )

        assert here.username not in names

    def test_the_place_id_excludes_nobody(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        """What the screen was doing, stated the other way round."""
        here = _member(db_session, org, "already_here")

        names = _usernames(
            authenticated_superadmin_client,
            f"exclude_org={org.org_unit_id}",
        )

        assert here.username in names


class TestNeitherIsGiven:
    def test_everybody_the_caller_may_see_is_listed(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        here = _member(db_session, org, "already_here")

        names = _usernames(authenticated_superadmin_client, "")

        assert here.username in names
