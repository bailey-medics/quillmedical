"""Tests for the admin CLI script (Cloud Run Job)."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
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


PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"


class TestDeletePassport:
    """Tests for the delete-passport action.

    Every refusal is its own test, because each is one of the guards that
    keep this away from a real clinician's record.
    """

    @pytest.fixture
    def roots(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> Iterator[tuple[Path, Path]]:
        """Local passport storage, and where its archive goes."""
        from app import passport_storage
        from app.config import settings

        root = tmp_path / "passports"
        archive_root = tmp_path / "archive"
        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", None)
        monkeypatch.setattr(settings, "PASSPORT_LOCAL_ROOT", str(root))
        passport_storage.reset_caches()
        yield root, archive_root
        passport_storage.reset_caches()

    @pytest.fixture
    def holder(self, db_session: Session, roots: tuple[Path, Path]) -> User:
        """A holder with a passport and one open sign-off request."""
        from app.features.passport import service
        from app.features.passport.commits import Actor
        from app.features.passport.models import (
            Passport,
            PassportSignOffRequest,
        )
        from app.features.passport.store import LocalPassportStore

        user = User(
            username="mark.bailey.test",
            email="test@example.com",
            password_hash=hash_password("Pass123!"),
        )
        db_session.add(user)
        db_session.flush()

        service.create_passport(
            LocalPassportStore(roots[0]),
            PASSPORT_ID,
            Actor(
                name="Dr Test",
                role="specialty_trainee_3_plus",
                email="test@example.com",
            ),
            user_id=str(user.id),
        )
        db_session.add(Passport(id=PASSPORT_ID, user_id=user.id))
        db_session.flush()
        db_session.add(
            PassportSignOffRequest(
                passport_id=PASSPORT_ID,
                signoff_id="20260314T143207.000Z-abc",
                competency_id="perform_cannulation",
                assessor_email="assessor@example.com",
            )
        )
        db_session.commit()
        return user

    def _run(self, env: dict[str, str], roots: tuple[Path, Path]) -> int:
        from scripts.admin_cli import delete_passport

        full = {
            "ADMIN_ACTION": "delete-passport",
            "PASSPORT_ARCHIVE_LOCAL_ROOT": str(roots[1]),
            **env,
        }
        cleared = {"CONFIRM": "", "PASSPORT_DELETABLE_USER_IDS": ""}
        with patch.dict(os.environ, {**cleared, **full}, clear=False):
            return delete_passport()

    def _exists(self, db_session: Session, roots: tuple[Path, Path]) -> bool:
        from app.features.passport.models import Passport
        from app.features.passport.store import LocalPassportStore

        db_session.expire_all()
        row = db_session.get(Passport, PASSPORT_ID)
        on_disk = LocalPassportStore(roots[0]).exists(PASSPORT_ID)
        assert (row is not None) == on_disk, "row and files disagree"
        return on_disk

    @pytest.mark.usefixtures("_patch_session")
    def test_a_dry_run_reports_and_changes_nothing(
        self,
        db_session: Session,
        holder: User,
        roots: tuple[Path, Path],
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        result = self._run(
            {
                "ADMIN_USERNAME": holder.username,
                "PASSPORT_DELETABLE_USER_IDS": str(holder.id),
            },
            roots,
        )

        assert result == 0
        output = capsys.readouterr().out
        assert PASSPORT_ID in output
        assert "open sign-off requests" in output
        assert f"CONFIRM={PASSPORT_ID}" in output
        assert self._exists(db_session, roots)

    @pytest.mark.usefixtures("_patch_session")
    def test_a_confirmed_run_archives_and_removes_the_passport(
        self, db_session: Session, holder: User, roots: tuple[Path, Path]
    ) -> None:
        from app.features.passport.models import PassportSignOffRequest

        result = self._run(
            {
                "ADMIN_USERNAME": holder.username,
                "PASSPORT_DELETABLE_USER_IDS": f"999, {holder.id}",
                "CONFIRM": PASSPORT_ID,
            },
            roots,
        )

        assert result == 0
        assert not self._exists(db_session, roots)
        assert db_session.query(PassportSignOffRequest).count() == 0
        archived = list((roots[1] / "deleted").glob(f"*/3f/2a/{PASSPORT_ID}"))
        assert len(archived) == 1

    @pytest.mark.usefixtures("_patch_session")
    def test_refuses_a_holder_not_on_the_list(
        self, db_session: Session, holder: User, roots: tuple[Path, Path]
    ) -> None:
        result = self._run(
            {
                "ADMIN_USERNAME": holder.username,
                "PASSPORT_DELETABLE_USER_IDS": "999",
                "CONFIRM": PASSPORT_ID,
            },
            roots,
        )

        assert result == 1
        assert self._exists(db_session, roots)

    @pytest.mark.usefixtures("_patch_session")
    def test_an_empty_list_deletes_nobody(
        self, db_session: Session, holder: User, roots: tuple[Path, Path]
    ) -> None:
        result = self._run(
            {"ADMIN_USERNAME": holder.username, "CONFIRM": PASSPORT_ID},
            roots,
        )

        assert result == 1
        assert self._exists(db_session, roots)

    @pytest.mark.usefixtures("_patch_session")
    def test_refuses_a_confirmation_that_does_not_match(
        self, db_session: Session, holder: User, roots: tuple[Path, Path]
    ) -> None:
        result = self._run(
            {
                "ADMIN_USERNAME": holder.username,
                "PASSPORT_DELETABLE_USER_IDS": str(holder.id),
                "CONFIRM": "a1b2c3d4e5f60718293a4b5c6d7e8f90",
            },
            roots,
        )

        assert result == 1
        assert self._exists(db_session, roots)

    @pytest.mark.usefixtures("_patch_session")
    def test_refuses_a_list_entry_that_is_not_an_id(
        self, db_session: Session, holder: User, roots: tuple[Path, Path]
    ) -> None:
        """A pattern such as mark.bailey.* is refused, never matched."""
        result = self._run(
            {
                "ADMIN_USERNAME": holder.username,
                "PASSPORT_DELETABLE_USER_IDS": "mark.bailey.*",
                "CONFIRM": PASSPORT_ID,
            },
            roots,
        )

        assert result == 1
        assert self._exists(db_session, roots)

    @pytest.mark.usefixtures("_patch_session")
    def test_a_failed_archive_keeps_the_row(
        self,
        db_session: Session,
        holder: User,
        roots: tuple[Path, Path],
    ) -> None:
        # An archive already holding this passport makes the copy refuse.
        from datetime import UTC, datetime

        day = datetime.now(UTC).date().isoformat()
        (roots[1] / "deleted" / day / "3f" / "2a" / PASSPORT_ID).mkdir(
            parents=True
        )

        result = self._run(
            {
                "ADMIN_USERNAME": holder.username,
                "PASSPORT_DELETABLE_USER_IDS": str(holder.id),
                "CONFIRM": PASSPORT_ID,
            },
            roots,
        )

        assert result == 1
        assert self._exists(db_session, roots)

    @pytest.mark.usefixtures("_patch_session")
    def test_a_user_without_a_passport_is_refused(
        self, db_session: Session, roots: tuple[Path, Path]
    ) -> None:
        user = User(
            username="no-passport",
            email="none@example.com",
            password_hash=hash_password("Pass123!"),
        )
        db_session.add(user)
        db_session.commit()

        result = self._run({"ADMIN_USERNAME": "no-passport"}, roots)

        assert result == 1
