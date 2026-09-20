"""The admin user list names the organisations somebody actually belongs to.

``GET /users`` carries each person's organisations by name, for the admin
table. The names come from a join between the membership rows and the
places they name.

That join compared an *organisation* id against a *place* id for a
release. The two sequences agree on a small installation — an
organisation and its own row in the tree are created together — so it
matched, and stopped matching the moment a ward was created between two
organisations. From then on an admin saw a user with no organisations at
all, or with somebody else's.

Nothing tested the names, which is how it got through. These do.
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

    The ward in between pushes the two sequences apart. With the same
    number either join would pass, which is exactly how the wrong one
    survived.
    """
    db_session.add(OrgUnit(name="A ward in between", type="ward"))
    db_session.commit()

    organisation = Organisation(name="Great Eastern Hospital", type="hospital")
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


def _row(client: TestClient, username: str) -> dict:
    resp = client.get("/api/users")
    assert resp.status_code == 200, resp.text
    rows = [u for u in resp.json()["users"] if u["username"] == username]
    assert len(rows) == 1, f"{username} not listed once"
    return rows[0]


class TestTheOrganisationNames:
    def test_a_members_organisation_is_named(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        _member(db_session, org, "a_consultant")

        row = _row(authenticated_superadmin_client, "a_consultant")

        assert row["organisations"] == ["Great Eastern Hospital"]

    def test_somebody_in_no_organisation_is_named_none(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        """The other half: an empty list has to mean empty.

        Without it, the broken join would have passed this file — it
        returned nothing for everybody.
        """
        loner = User(
            username="a_loner",
            email="loner@example.test",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            base_profession="consultant",
        )
        db_session.add(loner)
        db_session.commit()

        row = _row(authenticated_superadmin_client, "a_loner")

        assert row["organisations"] == []

    def test_a_ward_membership_is_not_an_organisation(
        self,
        authenticated_superadmin_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        """It is listed as a site, which is the column beside it.

        Membership does not climb: being on a ward is not being at the
        trust, and the table says so in two separate columns.
        """
        ward = OrgUnit(name="Ward 9", type="ward", parent_id=org.org_unit_id)
        db_session.add(ward)
        db_session.commit()

        trainee = User(
            username="a_trainee",
            email="trainee@example.test",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            base_profession="consultant",
        )
        db_session.add(trainee)
        db_session.flush()
        add_place_member(db_session, ward.id, trainee.id, "trainee")
        db_session.commit()

        row = _row(authenticated_superadmin_client, "a_trainee")

        assert row["organisations"] == []
        assert row["sites"] == ["Ward 9"]
