"""An admin may act on a user only where they share an organisation.

Six routes took a user id, checked that the caller was an admin, and acted.
Being an admin is global in the column and scoped in practice, so that pair
of facts let an admin at one trust act on a user at another by naming their
id. `update_user` was the worst of them: it writes username, email,
**password** and competencies, so the hole was a password reset across
organisations.

Each test here fails without `_require_shared_org_with_user`. That is the
point of them — a place check that is never exercised is indistinguishable
from one that is wrong.

**404, not 403.** Matching `_require_own_org` and
`_require_site_in_own_org`, so a response does not confirm that a user
exists to an admin who may not see them.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import Organisation, User, organisation_member
from app.security import hash_password


@pytest.fixture
def other_org(db_session: Session) -> Organisation:
    """An organisation the admin has nothing to do with."""
    org = Organisation(name="Other Trust", type="hospital")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def admin_org(db_session: Session, test_admin: User) -> Organisation:
    """The admin's own organisation."""
    org = Organisation(name="Own Trust", type="hospital")
    db_session.add(org)
    db_session.commit()
    db_session.execute(
        insert(organisation_member).values(
            organisation_id=org.id,
            user_id=test_admin.id,
            capacity="staff",
        )
    )
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def outsider(db_session: Session, other_org: Organisation) -> User:
    """A user at an organisation the admin does not belong to."""
    user = User(
        username="outsider",
        email="outsider@example.test",
        password_hash=hash_password("OutsiderPass123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
        system_permissions="staff",
    )
    db_session.add(user)
    db_session.flush()
    db_session.execute(
        insert(organisation_member).values(
            organisation_id=other_org.id,
            user_id=user.id,
            capacity="staff",
        )
    )
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def insider(db_session: Session, admin_org: Organisation) -> User:
    """A user at the admin's own organisation."""
    user = User(
        username="insider",
        email="insider@example.test",
        password_hash=hash_password("InsiderPass123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
        system_permissions="staff",
    )
    db_session.add(user)
    db_session.flush()
    db_session.execute(
        insert(organisation_member).values(
            organisation_id=admin_org.id,
            user_id=user.id,
            capacity="staff",
        )
    )
    db_session.commit()
    db_session.refresh(user)
    return user


def _csrf(client: TestClient) -> str:
    return client.cookies.get("XSRF-TOKEN", "")


class TestAnAdminCannotReachAnotherOrganisationsUser:
    """The hole, one test per route. Each fails without the place check."""

    def test_cannot_read_them(
        self, authenticated_admin_client: TestClient, outsider: User
    ):
        resp = authenticated_admin_client.get(f"/api/users/{outsider.id}")
        assert resp.status_code == 404

    def test_cannot_edit_them(
        self, authenticated_admin_client: TestClient, outsider: User
    ):
        """The worst of the six: this route writes a password."""
        resp = authenticated_admin_client.patch(
            f"/api/users/{outsider.id}",
            json={"password": "AttackerChosen123!"},
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 404

    def test_cannot_deactivate_them(
        self, authenticated_admin_client: TestClient, outsider: User
    ):
        resp = authenticated_admin_client.post(
            f"/api/users/{outsider.id}/deactivate",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 404

    def test_cannot_reactivate_them(
        self,
        authenticated_admin_client: TestClient,
        outsider: User,
        db_session: Session,
    ):
        outsider.is_active = False
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/users/{outsider.id}/reactivate",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 404

    def test_cannot_send_them_an_invite(
        self, authenticated_admin_client: TestClient, outsider: User
    ):
        """A password-reset token to an address outside the admin's reach."""
        resp = authenticated_admin_client.post(
            f"/api/users/{outsider.id}/send-invite",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 404

    def test_cannot_link_them_to_a_patient(
        self, authenticated_admin_client: TestClient, outsider: User
    ):
        resp = authenticated_admin_client.patch(
            f"/api/users/{outsider.id}/link-patient",
            json={"fhir_patient_id": "fhir-scoping-test"},
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 404


class TestTheCheckDoesNotBreakLegitimateAdministration:
    """A place check that refuses everything would pass the tests above."""

    def test_can_read_a_user_at_their_own_organisation(
        self, authenticated_admin_client: TestClient, insider: User
    ):
        resp = authenticated_admin_client.get(f"/api/users/{insider.id}")
        assert resp.status_code == 200
        assert resp.json()["username"] == "insider"

    def test_can_deactivate_a_user_at_their_own_organisation(
        self, authenticated_admin_client: TestClient, insider: User
    ):
        resp = authenticated_admin_client.post(
            f"/api/users/{insider.id}/deactivate",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 200

    def test_an_admin_can_still_read_themselves(
        self, authenticated_admin_client: TestClient, test_admin: User
    ):
        """Self is allowed explicitly, not by accident of membership.

        An admin who belongs to no organisation would otherwise be unable
        to read their own record.
        """
        resp = authenticated_admin_client.get(f"/api/users/{test_admin.id}")
        assert resp.status_code == 200


class TestTheGateIsACompetencyNotARank:
    """`manage_users`, not `system_permissions in ("admin", ...)`."""

    def test_the_rank_alone_is_not_enough(
        self,
        authenticated_client: TestClient,
        test_user: User,
        admin_org: Organisation,
        insider: User,
        db_session: Session,
    ):
        """Promoted by rank, sharing the organisation, no competency.

        Under the old string comparison this succeeded. `consultant`
        grants clinical competencies and not `manage_users`, which is the
        distinction the swap exists to make.
        """
        test_user.system_permissions = "admin"
        test_user.base_profession = "consultant"
        db_session.execute(
            insert(organisation_member).values(
                organisation_id=admin_org.id,
                user_id=test_user.id,
                capacity="staff",
            )
        )
        db_session.commit()

        resp = authenticated_client.get(f"/api/users/{insider.id}")

        assert resp.status_code == 403


class TestSuperadminsAreGlobal:
    """The one rank that genuinely is everywhere, and stays that way.

    Reach comes from the rank, not from where they are. A superadmin may
    belong to organisations and sites like anyone else, and is equally
    free to act at places they do not belong to.
    """

    def test_a_superadmin_reaches_any_organisation(
        self, authenticated_superadmin_client: TestClient, outsider: User
    ):
        resp = authenticated_superadmin_client.get(f"/api/users/{outsider.id}")
        assert resp.status_code == 200

    def test_belonging_to_one_organisation_does_not_confine_them(
        self,
        authenticated_superadmin_client: TestClient,
        test_superadmin: User,
        admin_org: Organisation,
        outsider: User,
        db_session: Session,
    ):
        """Membership must not be read as a boundary for a superadmin.

        A check that returned early only when a superadmin happened to be
        in no organisation would pass the test above and fail here, since
        this one puts them in an organisation the target is not in.
        """
        db_session.execute(
            insert(organisation_member).values(
                organisation_id=admin_org.id,
                user_id=test_superadmin.id,
                capacity="staff",
            )
        )
        db_session.commit()

        resp = authenticated_superadmin_client.get(f"/api/users/{outsider.id}")
        assert resp.status_code == 200


class TestAUserInNoOrganisationFailsClosed:
    """A record outside the membership tables is refused, not shared."""

    def test_an_orphan_user_is_not_visible_to_an_admin(
        self,
        authenticated_admin_client: TestClient,
        admin_org: Organisation,
        db_session: Session,
    ):
        orphan = User(
            username="orphan",
            email="orphan@example.test",
            password_hash=hash_password("OrphanPass123!"),
            is_active=True,
            email_verified=True,
            base_profession="consultant",
            system_permissions="staff",
        )
        db_session.add(orphan)
        db_session.commit()

        resp = authenticated_admin_client.get(f"/api/users/{orphan.id}")
        assert resp.status_code == 404
