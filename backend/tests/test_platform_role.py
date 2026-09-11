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
from sqlalchemy.orm import Session

from app.models import (
    PLATFORM_ROLES,
    User,
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
            json={"name": "Nowhere Trust", "type": "hospital"},
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
            json={"name": "Somewhere Trust", "type": "hospital"},
        )

        assert resp.status_code == 200
