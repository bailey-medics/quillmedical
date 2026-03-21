"""Tests for the admin CLI script (Cloud Run Job)."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from app.models import Role, User
from app.security import hash_password, verify_password


@pytest.fixture
def sysadmin_role(db_session: Session) -> Role:
    """Create a System Administrator role."""
    role = Role(name="System Administrator")
    db_session.add(role)
    db_session.commit()
    db_session.refresh(role)
    return role


@pytest.fixture
def _patch_session(db_session: Session):
    """Patch AuthSessionLocal to use the test database session.

    Prevents the admin_cli functions from closing the shared test session
    so assertions can still query the database afterwards.
    """
    original_close = db_session.close
    db_session.close = lambda: None  # type: ignore[assignment]
    with patch("app.db.auth_db.AuthSessionLocal", return_value=db_session):
        yield
    db_session.close = original_close  # type: ignore[assignment]


class TestCreateSuperadmin:
    """Tests for the create-superadmin action."""

    @pytest.mark.usefixtures("_patch_session")
    def test_creates_new_superadmin(
        self, db_session: Session, sysadmin_role: Role
    ) -> None:
        env = {
            "ADMIN_ACTION": "create-superadmin",
            "ADMIN_USERNAME": "mark",
            "ADMIN_EMAIL": "mark@example.com",
            "ADMIN_PASSWORD": "SecurePass123!",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import create_superadmin

            result = create_superadmin()

        assert result == 0
        user = db_session.query(User).filter(User.username == "mark").first()
        assert user is not None
        assert user.email == "mark@example.com"
        assert user.system_permissions == "superadmin"
        assert user.base_profession == "consultant"
        assert verify_password("SecurePass123!", user.password_hash)
        assert any(r.name == "System Administrator" for r in user.roles)

    @pytest.mark.usefixtures("_patch_session")
    def test_updates_existing_user_to_superadmin(
        self, db_session: Session, sysadmin_role: Role
    ) -> None:
        existing = User(
            username="existing",
            email="old@example.com",
            password_hash=hash_password("OldPassword"),
            system_permissions="patient",
        )
        db_session.add(existing)
        db_session.commit()

        env = {
            "ADMIN_ACTION": "create-superadmin",
            "ADMIN_USERNAME": "existing",
            "ADMIN_EMAIL": "new@example.com",
            "ADMIN_PASSWORD": "NewPass123!",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import create_superadmin

            result = create_superadmin()

        assert result == 0
        db_session.refresh(existing)
        assert existing.email == "new@example.com"
        assert existing.system_permissions == "superadmin"
        assert verify_password("NewPass123!", existing.password_hash)

    @pytest.mark.usefixtures("_patch_session")
    def test_warns_when_role_not_found(self, db_session: Session) -> None:
        """Should succeed even without the role, just with a warning."""
        env = {
            "ADMIN_ACTION": "create-superadmin",
            "ADMIN_USERNAME": "norole",
            "ADMIN_EMAIL": "norole@example.com",
            "ADMIN_PASSWORD": "Pass123!",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import create_superadmin

            result = create_superadmin()

        assert result == 0
        user = db_session.query(User).filter(User.username == "norole").first()
        assert user is not None
        assert user.system_permissions == "superadmin"
        assert len(user.roles) == 0

    def test_missing_env_vars_exits(self) -> None:
        env = {"ADMIN_ACTION": "create-superadmin", "ADMIN_USERNAME": "mark"}
        with patch.dict(os.environ, env, clear=False):
            # Remove keys that might be set from other tests
            os.environ.pop("ADMIN_EMAIL", None)
            os.environ.pop("ADMIN_PASSWORD", None)
            from scripts.admin_cli import create_superadmin

            with pytest.raises(SystemExit) as exc_info:
                create_superadmin()
            assert exc_info.value.code == 1


class TestUpdatePermissions:
    """Tests for the update-permissions action."""

    @pytest.mark.usefixtures("_patch_session")
    def test_updates_permissions(self, db_session: Session) -> None:
        user = User(
            username="staffuser",
            email="staff@example.com",
            password_hash=hash_password("Pass123!"),
            system_permissions="patient",
        )
        db_session.add(user)
        db_session.commit()

        env = {
            "ADMIN_ACTION": "update-permissions",
            "ADMIN_USERNAME": "staffuser",
            "ADMIN_PERMISSION": "admin",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import update_permissions

            result = update_permissions()

        assert result == 0
        db_session.refresh(user)
        assert user.system_permissions == "admin"

    @pytest.mark.usefixtures("_patch_session")
    def test_invalid_permission_level(self) -> None:
        env = {
            "ADMIN_ACTION": "update-permissions",
            "ADMIN_USERNAME": "anyone",
            "ADMIN_PERMISSION": "godmode",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import update_permissions

            result = update_permissions()

        assert result == 1

    @pytest.mark.usefixtures("_patch_session")
    def test_user_not_found(self, db_session: Session) -> None:
        env = {
            "ADMIN_ACTION": "update-permissions",
            "ADMIN_USERNAME": "nonexistent",
            "ADMIN_PERMISSION": "admin",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import update_permissions

            result = update_permissions()

        assert result == 1


class TestAddRole:
    """Tests for the add-role action."""

    @pytest.mark.usefixtures("_patch_session")
    def test_adds_role(self, db_session: Session, sysadmin_role: Role) -> None:
        user = User(
            username="roleuser",
            email="roleuser@example.com",
            password_hash=hash_password("Pass123!"),
        )
        db_session.add(user)
        db_session.commit()

        env = {
            "ADMIN_ACTION": "add-role",
            "ADMIN_USERNAME": "roleuser",
            "ADMIN_ROLE": "System Administrator",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import add_role

            result = add_role()

        assert result == 0
        db_session.refresh(user)
        assert any(r.name == "System Administrator" for r in user.roles)

    @pytest.mark.usefixtures("_patch_session")
    def test_user_already_has_role(
        self, db_session: Session, sysadmin_role: Role
    ) -> None:
        user = User(
            username="hasrole",
            email="hasrole@example.com",
            password_hash=hash_password("Pass123!"),
        )
        user.roles.append(sysadmin_role)
        db_session.add(user)
        db_session.commit()

        env = {
            "ADMIN_ACTION": "add-role",
            "ADMIN_USERNAME": "hasrole",
            "ADMIN_ROLE": "System Administrator",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import add_role

            result = add_role()

        assert result == 0  # Idempotent, not an error

    @pytest.mark.usefixtures("_patch_session")
    def test_role_not_found(self, db_session: Session) -> None:
        user = User(
            username="noroleuser",
            email="noroleuser@example.com",
            password_hash=hash_password("Pass123!"),
        )
        db_session.add(user)
        db_session.commit()

        env = {
            "ADMIN_ACTION": "add-role",
            "ADMIN_USERNAME": "noroleuser",
            "ADMIN_ROLE": "Nonexistent Role",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import add_role

            result = add_role()

        assert result == 1

    @pytest.mark.usefixtures("_patch_session")
    def test_user_not_found(self, db_session: Session) -> None:
        env = {
            "ADMIN_ACTION": "add-role",
            "ADMIN_USERNAME": "ghost",
            "ADMIN_ROLE": "System Administrator",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import add_role

            result = add_role()

        assert result == 1


class TestMain:
    """Tests for the main dispatcher."""

    def test_missing_action_exits(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ADMIN_ACTION", None)
            from scripts.admin_cli import main

            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1

    def test_unknown_action_exits(self) -> None:
        with patch.dict(os.environ, {"ADMIN_ACTION": "nuke-everything"}):
            from scripts.admin_cli import main

            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1
