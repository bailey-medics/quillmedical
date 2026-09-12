"""What a person is to Quill itself, as opposed to at a place.

`system_permissions` ranked four values — single-user, staff, admin,
superadmin — and three of them were about a place. `admin` and `staff`
describe someone at an organisation or site, which is membership plus the
competencies they hold there. `single-user` gated nothing anywhere.
`superadmin` alone stands on its own: it says the person operates Quill,
which is true everywhere or nowhere.

`platform_role` keeps only that question. Two values, and deliberately
not a ladder — a ranking is what invited the reading that `superadmin`
subsumes clinical access, which it does not.

The expand half wrote and validated the column. The routes now *read* it:
every caller-side superadmin check in `main.py` asks `platform_role`, so
the tests at the foot of this file pin a user whose two columns disagree.
`system_permissions` is still written and still holds the other three
levels, which move with the `admin` work.
"""

from __future__ import annotations

import pytest
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import (
    PLATFORM_ROLES,
    Organisation,
    User,
    organisation_member,
    validate_platform_role,
)
from app.security import hash_password


def _user(db: Session, username: str, **kwargs: object) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        **kwargs,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


class TestTheVocabulary:
    """Two values, and no order between them."""

    def test_the_known_roles(self):
        assert PLATFORM_ROLES == ("member", "superadmin")

    def test_a_known_role_passes(self):
        assert validate_platform_role("superadmin") == "superadmin"

    def test_an_unknown_role_is_refused(self):
        with pytest.raises(ValueError, match="Unknown platform role"):
            validate_platform_role("admin")

    def test_the_error_names_the_known_ones(self):
        with pytest.raises(ValueError, match="member, superadmin"):
            validate_platform_role("staff")

    def test_the_old_levels_are_not_platform_roles(self):
        """`admin`, `staff` and `single-user` were about a place.

        Each names a relationship to an organisation or site, which
        membership and competencies now express. Accepting them here
        would carry the conflation forward under a new name.
        """
        for old in ("admin", "staff", "single-user"):
            with pytest.raises(ValueError):
                validate_platform_role(old)


class TestTheColumnDefaults:
    """Operating Quill is not the default state of being a user."""

    def test_a_new_user_is_a_member(self, db_session):
        person = _user(db_session, "someone")

        assert person.platform_role == "member"

    def test_it_is_independent_of_system_permissions(self, db_session):
        """Nothing reads it for authorisation yet.

        The expand step writes the column and leaves every caller on the
        old one, so the two can disagree until the callers move. This
        pins that the new column is not silently derived at read time.
        """
        person = _user(db_session, "testadmin", system_permissions="admin")

        assert person.platform_role == "member"
        assert person.system_permissions == "admin"

    def test_a_superadmin_can_be_recorded(self, db_session):
        person = _user(
            db_session,
            "operator",
            platform_role="superadmin",
            system_permissions="superadmin",
        )

        assert person.platform_role == "superadmin"


class TestTheRoutesReadTheNewColumn:
    """The superadmin checks ask `platform_role`, not the old column.

    Both columns agree for every real user, so a swap like this passes
    trivially unless something makes them disagree. These tests do: each
    user below says one thing in `system_permissions` and another in
    `platform_role`, so they fail the moment a check reads the old one.

    `POST /api/organisations` is the subject because it is the plainest
    superadmin gate in `main.py` — no place check beside it, no
    competency, just the platform question.
    """

    def _login(self, client, username: str) -> None:
        resp = client.post(
            "/api/auth/login",
            json={"username": username, "password": "Password123!"},
        )
        assert resp.status_code == 200
        # Mutating routes need the CSRF header, as the authenticated
        # fixtures in conftest do after their own login.
        csrf = client.cookies.get("XSRF-TOKEN")
        if csrf:
            client.headers["X-CSRF-Token"] = csrf

    def test_a_stale_superadmin_is_refused(self, test_client, db_session):
        """Says superadmin in the old column, `member` in the new one."""
        _user(
            db_session,
            "stale",
            system_permissions="superadmin",
            platform_role="member",
            base_profession="superadmin_profession",
        )
        self._login(test_client, "stale")

        resp = test_client.post(
            "/api/organisations",
            json={"name": "Nowhere Trust", "type": "hospital_team"},
        )

        assert resp.status_code == 403

    def test_a_true_operator_is_allowed(self, test_client, db_session):
        """Says `single-user` in the old column, superadmin in the new one.

        The mirror of the test above, so neither passes by accident: one
        proves the old column no longer grants, this proves the new one
        does.
        """
        _user(
            db_session,
            "operator2",
            system_permissions="single-user",
            platform_role="superadmin",
            base_profession="superadmin_profession",
        )
        self._login(test_client, "operator2")

        resp = test_client.post(
            "/api/organisations",
            json={"name": "Somewhere Trust", "type": "hospital_team"},
        )

        assert resp.status_code == 200


class TestTheListingsHideOperatorsByTheNewColumn:
    """An admin's listings hide operators, read from `platform_role`.

    Three queries filter the *listed* user rather than the caller —
    `GET /api/users`, and the staff lists on an organisation and a site.
    Same column as the checks above, opposite side of the comparison, so
    it is a separate change: miss it and an operator appears in an
    admin's list the moment the old column stops being written.

    The operator below says `single-user` in the old column, so the test
    fails if the filter still reads it.
    """

    def test_an_operator_is_hidden_from_the_user_listing(
        self,
        authenticated_admin_client,
        test_admin: User,
        db_session: Session,
    ):
        org = Organisation(name="Shared Trust", type="hospital")
        db_session.add(org)
        db_session.commit()
        db_session.refresh(org)

        operator = _user(
            db_session,
            "hidden_operator",
            system_permissions="single-user",
            platform_role="superadmin",
            base_profession="superadmin_profession",
        )
        for person in (test_admin, operator):
            db_session.execute(
                insert(organisation_member).values(
                    organisation_id=org.id,
                    user_id=person.id,
                    capacity="staff",
                )
            )
        db_session.commit()

        resp = authenticated_admin_client.get("/api/users")

        assert resp.status_code == 200
        listed = {u["username"] for u in resp.json()["users"]}
        assert "hidden_operator" not in listed

    def test_an_ordinary_colleague_is_still_listed(
        self,
        authenticated_admin_client,
        test_admin: User,
        db_session: Session,
    ):
        """The mirror, so the test above cannot pass by listing nobody."""
        org = Organisation(name="Shared Trust", type="hospital")
        db_session.add(org)
        db_session.commit()
        db_session.refresh(org)

        colleague = _user(
            db_session,
            "ordinary_colleague",
            system_permissions="staff",
            platform_role="member",
        )
        for person in (test_admin, colleague):
            db_session.execute(
                insert(organisation_member).values(
                    organisation_id=org.id,
                    user_id=person.id,
                    capacity="staff",
                )
            )
        db_session.commit()

        resp = authenticated_admin_client.get("/api/users")

        assert resp.status_code == 200
        listed = {u["username"] for u in resp.json()["users"]}
        assert "ordinary_colleague" in listed


class TestScopingAsksTheNewColumn:
    """Place scoping turns on `platform_role`, not the old rank.

    Sixteen branches read `== "admin"` and meant *confine this caller to
    their own organisations*. A superadmin skipped them because they are
    global — which is the platform question, not an admin one. They now
    read `platform_role != "superadmin"`.

    The swap widens each branch: `== "admin"` excluded `staff` and
    `single-user`, `!= "superadmin"` does not. That is safe only because
    `manage_users` gates the door, so the last test here pins it — a
    competency holder who is not an admin must be scoped, never handed
    the unscoped branch a superadmin gets.
    """

    def _org_with(self, db: Session, name: str, *members: User) -> int:
        org = Organisation(name=name, type="hospital")
        db.add(org)
        db.commit()
        db.refresh(org)
        for person in members:
            db.execute(
                insert(organisation_member).values(
                    organisation_id=org.id,
                    user_id=person.id,
                    capacity="staff",
                )
            )
        db.commit()
        return int(org.id)

    def test_an_operator_is_not_confined_to_their_organisations(
        self,
        test_client,
        db_session: Session,
    ):
        """`single-user` in the old column, operator in the new one.

        Fails if the branch still reads `system_permissions`: that user
        is not an `admin`, so the old condition would skip the scoping
        for the wrong reason and the assertion could pass by accident.
        Here the org they do not belong to must still be visible.
        """
        _user(
            db_session,
            "global_operator",
            system_permissions="single-user",
            platform_role="superadmin",
            base_profession="superadmin_profession",
        )
        other = self._org_with(db_session, "Somebody Else's Trust")

        resp = test_client.post(
            "/api/auth/login",
            json={"username": "global_operator", "password": "Password123!"},
        )
        assert resp.status_code == 200

        # `GET /organisations/{id}` carries one of the migrated branches:
        # a non-operator is refused an organisation they do not belong to.
        fetched = test_client.get(f"/api/organisations/{other}")
        assert fetched.status_code == 200

    def test_a_non_operator_is_confined_to_their_organisations(
        self,
        authenticated_admin_client,
        test_admin: User,
        db_session: Session,
    ):
        """The mirror: `member` in the new column stays scoped."""
        unrelated = self._org_with(db_session, "Unrelated Trust")
        own = self._org_with(db_session, "Admin's Own Trust", test_admin)

        mine = authenticated_admin_client.get(f"/api/organisations/{own}")
        assert mine.status_code == 200

        theirs = authenticated_admin_client.get(
            f"/api/organisations/{unrelated}"
        )
        assert theirs.status_code == 404

    def test_a_competency_holder_below_admin_is_still_scoped(
        self,
        test_client,
        db_session: Session,
    ):
        """The widening the swap introduces, pinned.

        `staff` never satisfied `== "admin"`, so this caller could not
        have reached the scoping branch before. It can now, and must be
        confined like any other non-operator rather than handed the
        unscoped path.
        """
        holder = _user(
            db_session,
            "scoped_holder",
            system_permissions="staff",
            platform_role="member",
            base_profession="system_administrator",
        )
        not_theirs = self._org_with(db_session, "Not Their Trust")
        theirs = self._org_with(db_session, "Their Own Trust", holder)

        resp = test_client.post(
            "/api/auth/login",
            json={"username": "scoped_holder", "password": "Password123!"},
        )
        assert resp.status_code == 200

        own = test_client.get(f"/api/organisations/{theirs}")
        assert own.status_code == 200

        other = test_client.get(f"/api/organisations/{not_theirs}")
        assert other.status_code == 404


class TestOperatorsAreProtectedByTheNewColumn:
    """Four routes refuse to act on an operator, and now ask the new column.

    `update_user`, `deactivate_user`, `reactivate_user` and `get_user`
    each refuse a non-operator acting on an operator. The caller half of
    that pair already asks `platform_role`; these are the target half,
    and were the last authorisation reads left on `system_permissions`.

    Both users below have divergent columns, so each test fails if the
    check reads the old one — the operator says `single-user` there, and
    would be treated as an ordinary user.
    """

    def _operator(self, db: Session) -> User:
        """An operator by the new column, and nothing by the old one."""
        return _user(
            db,
            "protected_operator",
            system_permissions="single-user",
            platform_role="superadmin",
            base_profession="superadmin_profession",
        )

    def test_an_operator_cannot_be_modified(
        self, authenticated_admin_client, db_session: Session
    ):
        operator = self._operator(db_session)

        resp = authenticated_admin_client.patch(
            f"/api/users/{operator.id}",
            json={"email": "taken.over@example.test"},
        )

        assert resp.status_code == 403
        assert "superadmin" in resp.json()["detail"].lower()

    def test_an_operator_cannot_be_deactivated(
        self, authenticated_admin_client, db_session: Session
    ):
        operator = self._operator(db_session)

        resp = authenticated_admin_client.post(
            f"/api/users/{operator.id}/deactivate"
        )

        assert resp.status_code == 403

    def test_an_operator_cannot_be_reactivated(
        self, authenticated_admin_client, db_session: Session
    ):
        operator = self._operator(db_session)
        operator.is_active = False
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/users/{operator.id}/reactivate"
        )

        assert resp.status_code == 403

    def test_an_operator_cannot_be_viewed(
        self, authenticated_admin_client, db_session: Session
    ):
        """404 here rather than 403, so the refusal does not confirm
        that the account exists to someone who may not see it."""
        operator = self._operator(db_session)

        resp = authenticated_admin_client.get(f"/api/users/{operator.id}")

        assert resp.status_code == 404

    def test_an_ordinary_user_is_not_protected(
        self,
        authenticated_admin_client,
        test_admin: User,
        db_session: Session,
    ):
        """The mirror, so the four above cannot pass by refusing everyone.

        Shares an organisation with the admin, since the place check runs
        immediately after the operator check.
        """
        org = Organisation(name="Shared Trust", type="hospital")
        db_session.add(org)
        db_session.commit()
        db_session.refresh(org)

        colleague = _user(
            db_session,
            "ordinary_target",
            system_permissions="staff",
            platform_role="member",
        )
        for person in (test_admin, colleague):
            db_session.execute(
                insert(organisation_member).values(
                    organisation_id=org.id,
                    user_id=person.id,
                    capacity="staff",
                )
            )
        db_session.commit()

        resp = authenticated_admin_client.get(f"/api/users/{colleague.id}")

        assert resp.status_code == 200


class TestPatientAccessAsksTheRightQuestion:
    """The composites split by what they are actually about.

    Three routes asked `system_permissions in ("admin", "superadmin")`,
    which conflated two different questions. Each now asks the one that
    fits:

    - Listing every patient in the deployment is reach unbounded by any
      place, so it asks `platform_role`.
    - A patient's external access grants are patient centric, so they ask
      `manage_patient_membership` — not `manage_users`, because a patient
      is not a user.

    `update_my_competencies` keeps the old rank deliberately: it is
    self-scoped, so a competency gate would make the escalation
    self-referential. See the batch 3 note in the plan.
    """

    def test_an_admin_cannot_list_a_patients_grants(
        self, authenticated_admin_client, db_session: Session
    ):
        """`manage_users` is not authority over patients.

        `test_admin` carries `system_administrator`, which grants
        `manage_users` and not `manage_patient_membership`. Before the
        split its rank alone would have allowed this.
        """
        resp = authenticated_admin_client.get(
            "/api/patients/some-fhir-id/external-access"
        )

        assert resp.status_code == 403

    def test_a_patient_manager_can_list_a_patients_grants(
        self, authenticated_patient_manager_client, db_session: Session
    ):
        """The mirror: holding the competency is what opens it."""
        resp = authenticated_patient_manager_client.get(
            "/api/patients/some-fhir-id/external-access"
        )

        assert resp.status_code == 200

    def test_the_patient_themselves_can_list_their_grants(
        self, test_client, db_session: Session
    ):
        """Self-access is unchanged, and holds no competency at all."""
        person = _user(
            db_session,
            "their_own_patient",
            system_permissions="single-user",
            platform_role="member",
        )
        person.fhir_patient_id = "some-fhir-id"
        db_session.commit()

        resp = test_client.post(
            "/api/auth/login",
            json={
                "username": "their_own_patient",
                "password": "Password123!",
            },
        )
        assert resp.status_code == 200

        listed = test_client.get("/api/patients/some-fhir-id/external-access")

        assert listed.status_code == 200
