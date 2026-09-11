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

This is the expand half. The column is written and validated; nothing
reads it for authorisation yet, and `system_permissions` is untouched.
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
