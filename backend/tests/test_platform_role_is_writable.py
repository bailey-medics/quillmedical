"""Creating and updating a user can set ``platform_role``.

Every reference to the column was a *read* until now: the expand step
added it and backfilled it, and the routes migrated to consult it, but
nothing ever wrote it. So an operator could only be made by editing the
database by hand, and the create form had no field the API would accept.

**Only an operator may make another.** ``manage_users`` opens these
routes and says what someone may administer; it does not say they may
promote someone to run the platform. The guard mirrors the one already
standing over ``system_permissions``, and is asserted here because a
competency that could mint operators would be the escalation this plan
exists to remove.

**A new operator gains the operator competencies.** ``has_competency``
has no rank bypass, so a superadmin holding none would be refused by
every gate. The promotion adds ``superadmin_profession``'s competencies
alongside whatever the person already practises under, rather than
replacing their profession.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers


def _user(
    db: Session,
    username: str,
    *,
    profession: str,
    platform_role: str,
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
def org(db_session: Session) -> OrgUnit:
    organisation = OrgUnit(name="Trust", type="organisation")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


def _place(db: Session, org: OrgUnit, user: User) -> None:
    """Put *user* at *org* and authorise them to administer it.

    Membership says they are here; a ``practising_competency`` row
    carrying ``manage_users`` says they may administer it.
    """
    add_org_unit_member(db, org.id, user.id, "staff")
    administers(db, user.id, org.id)
    db.commit()


@pytest.fixture
def admin(db_session: Session, org: OrgUnit) -> User:
    """Holds ``manage_users`` and is not an operator."""
    user = _user(
        db_session,
        "the_admin",
        profession="system_administrator",
        platform_role="standard",
    )
    _place(db_session, org, user)
    return user


@pytest.fixture
def operator(db_session: Session, org: OrgUnit) -> User:
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
    """The mutating routes here all require the CSRF header."""
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


def _new_user_payload(username: str, **extra: object) -> dict[str, object]:
    return {
        "name": username,
        "username": username,
        "email": f"{username}@example.test",
        "password": "Password123!",
        "base_profession": "receptionist",
        **extra,
    }


class TestCreate:
    """``POST /api/users`` accepts the field, and defaults it safely."""

    def test_it_defaults_to_standard(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
    ) -> None:
        """Omitting the field must never produce an operator."""
        client = _login(test_client, "the_admin")
        response = client.post(
            "/api/users",
            json=_new_user_payload("no_role_given", org_unit_ids=[org.id]),
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        created = db_session.scalar(
            select(User).where(User.username == "no_role_given")
        )
        assert created is not None
        assert created.platform_role == "standard"

    def test_an_operator_can_create_an_operator(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        operator: User,
    ) -> None:
        client = _login(test_client, "the_operator")
        response = client.post(
            "/api/users",
            json=_new_user_payload(
                "a_new_operator",
                platform_role="superadmin",
                org_unit_ids=[org.id],
            ),
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        created = db_session.scalar(
            select(User).where(User.username == "a_new_operator")
        )
        assert created is not None
        assert created.platform_role == "superadmin"

    def test_an_unknown_role_is_refused(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        operator: User,
    ) -> None:
        """Validated in code, as ``PLATFORM_ROLES`` is elsewhere."""
        client = _login(test_client, "the_operator")
        response = client.post(
            "/api/users",
            json=_new_user_payload(
                "bad_role", platform_role="admin", org_unit_ids=[org.id]
            ),
            headers=_csrf(client),
        )

        assert response.status_code == 422, response.text


class TestUpdate:
    """``PATCH /api/users/{id}`` writes it, and guards the promotion."""

    def test_an_operator_can_promote(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        operator: User,
    ) -> None:
        target = _user(
            db_session,
            "a_colleague",
            profession="receptionist",
            platform_role="standard",
        )
        _place(db_session, org, target)

        client = _login(test_client, "the_operator")
        response = client.patch(
            f"/api/users/{target.id}",
            json={"platform_role": "superadmin"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(target)
        assert target.platform_role == "superadmin"

    def test_a_promoted_user_gains_the_operator_competencies(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        operator: User,
    ) -> None:
        """Otherwise every competency gate would refuse the new operator."""
        target = _user(
            db_session,
            "gains_competencies",
            profession="receptionist",
            platform_role="standard",
        )
        _place(db_session, org, target)

        client = _login(test_client, "the_operator")
        response = client.patch(
            f"/api/users/{target.id}",
            json={"platform_role": "superadmin"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(target)
        assert "manage_users" in target.get_final_competencies()
        # The profession they practise under is not overwritten.
        assert target.base_profession == "receptionist"

    def test_an_admin_cannot_promote(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
    ) -> None:
        """``manage_users`` does not carry the power to make operators."""
        target = _user(
            db_session,
            "stays_standard",
            profession="receptionist",
            platform_role="standard",
        )
        _place(db_session, org, target)

        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{target.id}",
            json={"platform_role": "superadmin"},
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text
        db_session.refresh(target)
        assert target.platform_role == "standard"

    def test_an_admin_may_still_set_standard(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        admin: User,
    ) -> None:
        """The guard refuses promotion, not the field."""
        target = _user(
            db_session,
            "set_to_standard",
            profession="receptionist",
            platform_role="standard",
        )
        _place(db_session, org, target)

        client = _login(test_client, "the_admin")
        response = client.patch(
            f"/api/users/{target.id}",
            json={"platform_role": "standard"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(target)
        assert target.platform_role == "standard"
