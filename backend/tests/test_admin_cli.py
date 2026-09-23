"""Tests for the admin CLI script (Cloud Run Job)."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

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
    """Patch CoreSessionLocal to use the test database session.

    Prevents the admin_cli functions from closing the shared test session
    so assertions can still query the database afterwards.
    """
    original_close = db_session.close
    db_session.close = lambda: None  # type: ignore[assignment]
    with patch("app.db.core_db.CoreSessionLocal", return_value=db_session):
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
        assert user.email_verified is True
        assert user.platform_role == "superadmin"
        # Not "consultant", which this used to set: `/admin` asks for the
        # `manage_users` competency, and a consultant holds a pile of
        # clinical ones instead of that single operator one.
        assert user.base_profession == "superadmin_profession"
        assert "manage_users" in user.get_final_competencies()
        assert verify_password("SecurePass123!", user.password_hash)
        assert any(r.name == "System Administrator" for r in user.roles)

    @pytest.mark.usefixtures("_patch_session")
    def test_a_new_superadmin_holds_no_clinical_access(
        self, db_session: Session, sysadmin_role: Role
    ) -> None:
        """Operating Quill is not a clinical role.

        The old `consultant` default handed every new operator account
        the competencies of a senior doctor, which is the half of this
        bug that grants too much rather than too little.
        """
        env = {
            "ADMIN_ACTION": "create-superadmin",
            "ADMIN_USERNAME": "operator",
            "ADMIN_EMAIL": "operator@example.com",
            "ADMIN_PASSWORD": "SecurePass123!",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import create_superadmin

            create_superadmin()

        user = (
            db_session.query(User).filter(User.username == "operator").first()
        )
        assert user is not None
        assert "access_patient_records" not in user.get_final_competencies()

    @pytest.mark.usefixtures("_patch_session")
    def test_promoting_an_existing_user_keeps_their_profession(
        self, db_session: Session, sysadmin_role: Role
    ) -> None:
        """A clinician who also operates Quill keeps practising.

        Overwriting the profession here would strip every clinical
        competency it grants, so the operator ones are added alongside
        instead.
        """
        db_session.add(
            User(
                username="drsmith",
                email="drsmith@example.com",
                password_hash=hash_password("OldPass123!"),
                base_profession="consultant",
            )
        )
        db_session.commit()

        env = {
            "ADMIN_ACTION": "create-superadmin",
            "ADMIN_USERNAME": "drsmith",
            "ADMIN_EMAIL": "drsmith@example.com",
            "ADMIN_PASSWORD": "NewPass123!",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import create_superadmin

            assert create_superadmin() == 0

        user = (
            db_session.query(User).filter(User.username == "drsmith").first()
        )
        assert user is not None
        assert user.base_profession == "consultant"
        assert "manage_users" in user.get_final_competencies()

    @pytest.mark.usefixtures("_patch_session")
    def test_updates_existing_user_to_superadmin(
        self, db_session: Session, sysadmin_role: Role
    ) -> None:
        existing = User(
            username="existing",
            email="old@example.com",
            password_hash=hash_password("OldPassword"),
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
        assert existing.email_verified is True
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


class TestRunMigrations:
    """Tests for the run-migrations action."""

    def test_runs_upgrade_head(self) -> None:
        env = {"ADMIN_ACTION": "run-migrations"}
        with (
            patch.dict(os.environ, env, clear=False),
            patch("alembic.command.upgrade") as mock_upgrade,
        ):
            from scripts.admin_cli import run_migrations

            result = run_migrations()

        assert result == 0
        mock_upgrade.assert_called_once()
        # Second positional arg is the target revision.
        assert mock_upgrade.call_args[0][1] == "head"

    def test_upgrade_failure_returns_error(self) -> None:
        env = {"ADMIN_ACTION": "run-migrations"}
        with (
            patch.dict(os.environ, env, clear=False),
            patch(
                "alembic.command.upgrade",
                side_effect=RuntimeError("lock timeout"),
            ),
        ):
            from scripts.admin_cli import run_migrations

            result = run_migrations()

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


class TestVerifyEmail:
    """Tests for the verify-email action."""

    @pytest.mark.usefixtures("_patch_session")
    def test_marks_user_email_verified(self, db_session: Session) -> None:
        user = User(
            username="email-pending",
            email="pending@example.com",
            password_hash=hash_password("Pass123!"),
            email_verified=False,
        )
        db_session.add(user)
        db_session.commit()

        env = {
            "ADMIN_ACTION": "verify-email",
            "ADMIN_USERNAME": "email-pending",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import verify_email

            result = verify_email()

        assert result == 0
        db_session.refresh(user)
        assert user.email_verified is True

    @pytest.mark.usefixtures("_patch_session")
    def test_verify_email_idempotent(self, db_session: Session) -> None:
        user = User(
            username="already-verified",
            email="already@example.com",
            password_hash=hash_password("Pass123!"),
            email_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        env = {
            "ADMIN_ACTION": "verify-email",
            "ADMIN_USERNAME": "already-verified",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import verify_email

            result = verify_email()

        assert result == 0

    @pytest.mark.usefixtures("_patch_session")
    def test_verify_email_user_not_found(self, db_session: Session) -> None:
        env = {
            "ADMIN_ACTION": "verify-email",
            "ADMIN_USERNAME": "ghost",
        }
        with patch.dict(os.environ, env, clear=False):
            from scripts.admin_cli import verify_email

            result = verify_email()

        assert result == 1


class TestSmokeTest:
    """The smoke-test action, which runs the deploy's health check.

    It exists so the check can come from inside the VPC: a Cloud Run
    service set to INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER accepts
    same-project VPC traffic but refuses a request from a GitHub runner.
    """

    def test_passes_when_the_url_returns_200(self) -> None:
        from scripts.admin_cli import smoke_test

        response = MagicMock()
        response.status = 200
        response.__enter__ = lambda self: self
        response.__exit__ = lambda *args: False

        with patch.dict(os.environ, {"SMOKE_URL": "http://example.test/h"}):
            with patch("urllib.request.urlopen", return_value=response):
                assert smoke_test() == 0

    def test_retries_then_passes_once_healthy(self) -> None:
        """A revision just created may not be serving on the first ask."""
        from scripts.admin_cli import smoke_test

        def response_with(status: int) -> MagicMock:
            r = MagicMock()
            r.status = status
            r.__enter__ = lambda self: self
            r.__exit__ = lambda *args: False
            return r

        attempts = [response_with(503), response_with(503), response_with(200)]

        env = {
            "SMOKE_URL": "http://example.test/h",
            "SMOKE_RETRIES": "5",
            "SMOKE_INTERVAL": "0",
        }
        with patch.dict(os.environ, env):
            with patch("urllib.request.urlopen", side_effect=attempts):
                assert smoke_test() == 0

    def test_fails_once_every_attempt_is_exhausted(self) -> None:
        from scripts.admin_cli import smoke_test

        response = MagicMock()
        response.status = 500
        response.__enter__ = lambda self: self
        response.__exit__ = lambda *args: False

        env = {
            "SMOKE_URL": "http://example.test/h",
            "SMOKE_RETRIES": "2",
            "SMOKE_INTERVAL": "0",
        }
        with patch.dict(os.environ, env):
            with patch("urllib.request.urlopen", return_value=response):
                assert smoke_test() == 1

    def test_a_connection_failure_is_retried_not_fatal(self) -> None:
        """DNS or a refused connection is the shape of "not ready yet"."""
        from scripts.admin_cli import smoke_test

        ok = MagicMock()
        ok.status = 200
        ok.__enter__ = lambda self: self
        ok.__exit__ = lambda *args: False

        env = {
            "SMOKE_URL": "http://example.test/h",
            "SMOKE_RETRIES": "3",
            "SMOKE_INTERVAL": "0",
        }
        with patch.dict(os.environ, env):
            with patch(
                "urllib.request.urlopen",
                side_effect=[OSError("connection refused"), ok],
            ):
                assert smoke_test() == 0

    def test_requires_a_url(self) -> None:
        from scripts.admin_cli import smoke_test

        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(SystemExit):
                smoke_test()


class TestCheckCompetencySeeding:
    """The check to run before only competency rows count."""

    @pytest.mark.usefixtures("_patch_session")
    def test_passes_when_every_profession_competency_is_a_row(
        self, db_session: Session
    ) -> None:
        from app.cbac.grants import sync_competency_rows
        from scripts.admin_cli import check_competency_seeding

        user = User(
            username="seeded",
            email="seeded@example.com",
            password_hash=hash_password("SecurePass123!"),
            base_profession="patient",
        )
        db_session.add(user)
        db_session.commit()
        sync_competency_rows(user, additional=[], removed=[], source="admin")
        db_session.commit()

        assert check_competency_seeding() == 0

    @pytest.mark.usefixtures("_patch_session")
    def test_fails_naming_anybody_who_would_lose_one(
        self, db_session: Session, capsys: pytest.CaptureFixture[str]
    ) -> None:
        from scripts.admin_cli import check_competency_seeding

        user = User(
            username="unseeded",
            email="unseeded@example.com",
            password_hash=hash_password("SecurePass123!"),
            base_profession="patient",
        )
        # Somebody created before seeding existed: no rows at all.
        user.competency_grants = []
        db_session.add(user)
        db_session.commit()

        assert check_competency_seeding() == 1
        err = capsys.readouterr().err
        assert f"user {user.id}: access_own_patient_records" in err
        assert "unseeded" not in err
