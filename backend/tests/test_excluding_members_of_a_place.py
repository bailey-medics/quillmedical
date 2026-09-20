"""The users list excludes members of a place, named by its place id.

"Add a staff member" lists everybody who is not already here, and the
screen asking has a place id: its route is keyed by one and the
membership it creates names one. The parameter it sent that id to read
it as an organisation id.

The two id sequences agreed on a small installation — an organisation
and its own row in the tree were created together, so they came out with
the same number — and diverged the moment a ward was created between two
organisations. From then on the filter excluded the members of a
different organisation, or of none, and the screen offered somebody who
was already here.

There was no test of the parameter at all, which is how that survived.
These are that test.

``TestExcludingByOrganisation`` used to sit beside them, pinning that
the older spelling still counted in organisation ids. That parameter
went with the organisations table, since it counted in ids that no
longer exist; a caller still sending it now excludes nobody rather than
being quietly misread.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password


@pytest.fixture
def org(db_session: Session, test_superadmin: User) -> OrgUnit:
    """An organisation, which is a place at the top of a tree."""
    organisation = OrgUnit(name="Trust", type="organisation")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


def _member(db: Session, org: OrgUnit, username: str) -> User:
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
    add_org_unit_member(db, org.id, user.id, "staff")
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
        org: OrgUnit,
    ) -> None:
        here = _member(db_session, org, "already_here")

        names = _usernames(
            authenticated_superadmin_client,
            f"exclude_place={org.id}",
        )

        assert here.username not in names

    def test_somebody_elsewhere_is_still_offered(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: OrgUnit,
    ) -> None:
        other = OrgUnit(name="Another trust", type="organisation")
        db_session.add(other)
        db_session.commit()
        elsewhere = _member(db_session, other, "somewhere_else")

        names = _usernames(
            authenticated_superadmin_client,
            f"exclude_place={org.id}",
        )

        assert elsewhere.username in names


class TestNothingIsGiven:
    def test_everybody_the_caller_may_see_is_listed(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: OrgUnit,
    ) -> None:
        here = _member(db_session, org, "already_here")

        names = _usernames(authenticated_superadmin_client, "")

        assert here.username in names
