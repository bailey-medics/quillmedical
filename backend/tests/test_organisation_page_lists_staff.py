"""The organisation admin page lists staff, not everyone.

``organisation_staff_member`` had two columns — organisation and user —
so a teaching delegate and a consultant were the same row. The page's
heading says "Organisation staff members" and the query behind it
selected every member, because nothing in the table could tell the two
apart.

``organisation_member`` carries a capacity, so now it can. This pins the
route rather than the column: the capacity has been tested since it was
added, and the page kept listing students anyway, because no caller had
been changed to ask.

**Trainees are not hidden from administration by this.** They are listed
where they belong — the delegates pages read the same table asking for
their capacity. What changes is only that a page promising staff keeps
that promise.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Organisation, User
from app.organisations import add_organisation_member
from app.security import hash_password


def _user(db: Session, username: str, *, profession: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role="standard",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def org(db_session: Session) -> Organisation:
    organisation = Organisation(name="Trust", type="hospital")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


def _place(
    db: Session, org: Organisation, user: User, *, capacity: str
) -> None:
    add_organisation_member(db, org.id, user.id, capacity)
    db.commit()


@pytest.fixture
def admin(db_session: Session, org: Organisation) -> User:
    """Holds ``manage_users``, which is what opens this route."""
    user = _user(db_session, "the_admin", profession="system_administrator")
    _place(db_session, org, user, capacity="staff")
    return user


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return client


class TestWhoAppearsAsStaff:
    """One member of each capacity, and only one should be listed."""

    def test_a_trainee_is_not_listed_among_the_staff(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        """The bug this step exists to fix."""
        delegate = _user(db_session, "a_delegate", profession="patient")
        _place(db_session, org, delegate, capacity="trainee")

        client = _login(test_client, "the_admin")
        response = client.get(f"/api/organisations/{org.id}")

        assert response.status_code == 200, response.text
        usernames = [s["username"] for s in response.json()["staff_members"]]
        assert "a_delegate" not in usernames

    def test_a_staff_member_is_still_listed(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        """The filter must not empty the page it was meant to correct."""
        nurse = _user(db_session, "a_nurse", profession="registered_nurse")
        _place(db_session, org, nurse, capacity="staff")

        client = _login(test_client, "the_admin")
        response = client.get(f"/api/organisations/{org.id}")

        assert response.status_code == 200, response.text
        usernames = [s["username"] for s in response.json()["staff_members"]]
        assert "a_nurse" in usernames
        assert "the_admin" in usernames

    def test_the_count_agrees_with_the_list(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        """``staff_count`` is derived from the same rows, and must stay so.

        A count taken from a second, unfiltered query would read one
        higher than the list beside it — the kind of disagreement nobody
        reports as a bug, they just stop trusting the number.
        """
        nurse = _user(
            db_session, "counted_nurse", profession="registered_nurse"
        )
        _place(db_session, org, nurse, capacity="staff")
        delegate = _user(db_session, "uncounted", profession="patient")
        _place(db_session, org, delegate, capacity="trainee")

        client = _login(test_client, "the_admin")
        response = client.get(f"/api/organisations/{org.id}")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["staff_count"] == len(body["staff_members"])
        assert body["staff_count"] == 2  # the admin and the nurse
