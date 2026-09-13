"""Competencies are granted by somebody else, not by the holder.

``manage_users`` opens the routes that write competencies, and both of
them could be pointed at the caller's own account. So a holder could
award themselves anything in the catalogue — including more
``manage_users`` — and the competency became the key to its own lock.

**The rule: nobody edits their own competencies or platform role.** Ask
another holder of ``manage_users`` instead, so the person granting and
the person gaining are never the same. That is separation of duties, and
it is what the NHS Registration Authority model relies on: an
administrator records access that somebody else verified.

**An operator is exempt**, because they already reach everything and
somebody has to be able to bootstrap a deployment.

Two routes needed it. Guarding only the self-route would have been
decorative, since an admin could pass their own id to
``PATCH /users/{id}`` and achieve the same thing.

Name, email and password are deliberately still editable on oneself:
ordinary self-service, available on the profile routes anyway.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import Organisation, User, organisation_member
from app.security import hash_password


def _user(
    db: Session,
    username: str,
    *,
    profession: str,
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
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


def _place(db: Session, org: Organisation, user: User) -> None:
    db.execute(
        insert(organisation_member).values(
            organisation_id=org.id, user_id=user.id, capacity="staff"
        )
    )
    db.commit()


@pytest.fixture
def admin(db_session: Session, org: Organisation) -> User:
    """Holds ``manage_users`` and is not an operator."""
    user = _user(db_session, "the_admin", profession="system_administrator")
    _place(db_session, org, user)
    return user


@pytest.fixture
def operator(db_session: Session, org: Organisation) -> User:
    user = _user(
        db_session,
        "the_operator",
        profession="superadmin_profession",
        platform_role="superadmin",
    )
    _place(db_session, org, user)
    return user


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return client


def _csrf(client: TestClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


class TestTheAdminRouteRefusesSelf:
    """``PATCH /users/{id}`` pointed at the caller's own account."""

    @pytest.mark.parametrize(
        "field,value",
        [
            ("additional_competencies", ["prescribe_non_controlled"]),
            ("removed_competencies", ["manage_users"]),
            ("base_profession", "consultant"),
            ("platform_role", "standard"),
        ],
    )
    def test_an_admin_cannot_change_their_own(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        field: str,
        value: object,
    ) -> None:
        """Each field the guard covers, refused on oneself."""
        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{admin.id}",
            json={field: value},
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text

    def test_the_escalation_this_closes(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
    ) -> None:
        """Granting oneself a clinical competency, refused and unwritten.

        The competency is checked afterwards rather than only the status
        code, so a guard that returned 403 having already written would
        still fail.
        """
        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{admin.id}",
            json={
                "additional_competencies": ["prescribe_controlled_schedule_2"]
            },
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text
        db_session.refresh(admin)
        held = admin.get_final_competencies()
        assert "prescribe_controlled_schedule_2" not in held

    def test_an_operator_may_change_their_own(
        self,
        test_client: TestClient,
        db_session: Session,
        operator: User,
    ) -> None:
        """The exemption: somebody has to be able to bootstrap."""
        client = _login(test_client, "the_operator")
        response = client.patch(
            f"/api/users/{operator.id}",
            json={"additional_competencies": ["view_teaching_cases"]},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(operator)
        assert "view_teaching_cases" in operator.get_final_competencies()


class TestSomebodyElseStillCan:
    """The rule is about self-granting, not about granting."""

    def test_an_admin_grants_another_user(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        admin: User,
    ) -> None:
        """The ordinary case, and the one the rule directs people to."""
        colleague = _user(db_session, "a_colleague", profession="receptionist")
        _place(db_session, org, colleague)

        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{colleague.id}",
            json={"additional_competencies": ["view_teaching_cases"]},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(colleague)
        assert "view_teaching_cases" in colleague.get_final_competencies()

    def test_an_admin_may_still_edit_their_own_email(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
    ) -> None:
        """Ordinary self-service is untouched by the guard."""
        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{admin.id}",
            json={"email": "moved@example.test"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(admin)
        assert admin.email == "moved@example.test"


class TestTheSelfRouteRefusesEveryoneButOperators:
    """``PATCH /api/cbac/my-competencies`` is self-granting by design."""

    def test_an_admin_is_refused(
        self, test_client: TestClient, db_session: Session, admin: User
    ) -> None:
        """Previously allowed, on the rank column being retired."""
        client = _login(test_client, "the_admin")
        response = client.patch(
            "/api/cbac/my-competencies",
            json={"additional_competencies": ["prescribe_non_controlled"]},
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text
        db_session.refresh(admin)
        assert "prescribe_non_controlled" not in admin.get_final_competencies()

    def test_an_operator_is_allowed(
        self, test_client: TestClient, db_session: Session, operator: User
    ) -> None:
        client = _login(test_client, "the_operator")
        response = client.patch(
            "/api/cbac/my-competencies",
            json={"additional_competencies": ["view_teaching_cases"]},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(operator)
        assert "view_teaching_cases" in operator.get_final_competencies()

    def test_a_user_without_manage_users_is_refused(
        self, test_client: TestClient, db_session: Session, org: Organisation
    ) -> None:
        """Unchanged: they could never use this route."""
        receptionist = _user(
            db_session, "front_desk", profession="receptionist"
        )
        _place(db_session, org, receptionist)

        client = _login(test_client, "front_desk")
        response = client.patch(
            "/api/cbac/my-competencies",
            json={"additional_competencies": ["view_teaching_cases"]},
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text
