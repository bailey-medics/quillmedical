"""Every member of the caller's organisations is listed as a delegate.

``list_delegates`` used to filter its result set with::

    User.system_permissions.notin_(["admin", "superadmin"])

which read as a check and was not one. The route already carries
``_DEP_MANAGE`` at the decorator and already scopes to
``get_member_org_ids``, so by the time this query runs both the *what*
and the *where* are settled. What the line actually expressed was a
display preference — do not offer staff-admin accounts as teaching
delegates — and it did so by reading the column being retired.

Dropping it is a visible behaviour change, which is why it is pinned
here: an administrator who is also a trainee is an ordinary case, and
hiding them meant their assessment results were unreachable to the very
person meant to review them.

The organisation scoping is asserted alongside, so this file fails if
dropping the filter were ever mistaken for dropping the place check.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    OrganisationFeature,
    User,
    organisation_member,
)
from app.security import hash_password


def _user(
    db: Session,
    username: str,
    *,
    profession: str = "teaching_delegate",
    system_permissions: str = "staff",
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        system_permissions=system_permissions,
        platform_role=platform_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def org(db_session: Session) -> Organisation:
    """An organisation with teaching enabled."""
    organisation = Organisation(name="Teaching Trust", type="hospital")
    db_session.add(organisation)
    db_session.flush()
    db_session.add(
        OrganisationFeature(
            organisation_id=organisation.id,
            feature_key="teaching",
            enabled_by=1,
        )
    )
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


def _place(db: Session, org: Organisation, user: User) -> None:
    db.execute(
        insert(organisation_member).values(
            organisation_id=org.id, user_id=user.id, capacity="staff"
        )
    )
    db.commit()


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return client


class TestAdminsAreListed:
    """The filter is gone, and these are the rows it used to hide."""

    def test_an_admin_member_is_listed(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        """Fails while the ``notin_`` filter stands."""
        caller = _user(db_session, "coordinator", profession="teaching_admin")
        _place(db_session, org, caller)
        admin = _user(
            db_session,
            "orgadmin",
            profession="system_administrator",
            system_permissions="admin",
        )
        _place(db_session, org, admin)

        client = _login(test_client, "coordinator")
        response = client.get("/api/teaching/admin/delegates")

        assert response.status_code == 200, response.text
        names = {d["name"] for d in response.json()}
        assert "orgadmin" in names

    def test_an_operator_member_is_listed(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        """A superadmin who is genuinely a member is a member.

        Their reach comes from the platform role; it does not follow that
        they should be hidden from a list of the people at their own
        organisation.
        """
        caller = _user(db_session, "coordinator", profession="teaching_admin")
        _place(db_session, org, caller)
        operator = _user(
            db_session,
            "operator_user",
            profession="superadmin_profession",
            system_permissions="superadmin",
            platform_role="superadmin",
        )
        _place(db_session, org, operator)

        client = _login(test_client, "coordinator")
        response = client.get("/api/teaching/admin/delegates")

        assert response.status_code == 200, response.text
        names = {d["name"] for d in response.json()}
        assert "operator_user" in names


class TestTheScopingIsUntouched:
    """Dropping a display filter is not dropping the place check."""

    def test_a_member_of_another_organisation_is_not_listed(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        """The check that actually matters, asserted beside the change."""
        caller = _user(db_session, "coordinator", profession="teaching_admin")
        _place(db_session, org, caller)

        other = Organisation(name="Other Trust", type="hospital")
        db_session.add(other)
        db_session.commit()
        stranger = _user(db_session, "stranger")
        _place(db_session, other, stranger)

        client = _login(test_client, "coordinator")
        response = client.get("/api/teaching/admin/delegates")

        assert response.status_code == 200, response.text
        names = {d["name"] for d in response.json()}
        assert "stranger" not in names

    def test_the_caller_is_not_listed(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
    ) -> None:
        """Unchanged, and worth keeping covered while the query moves."""
        caller = _user(db_session, "coordinator", profession="teaching_admin")
        _place(db_session, org, caller)

        client = _login(test_client, "coordinator")
        response = client.get("/api/teaching/admin/delegates")

        assert response.status_code == 200, response.text
        names = {d["name"] for d in response.json()}
        assert "coordinator" not in names
