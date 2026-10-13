"""Deciding about records past their period, from the admin job."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import retention_command
from app.features.teaching.models import Assessment, ModuleEnrolment
from app.models import OrgUnit, RetentionReview, User
from app.retention import apply_retention
from scripts.admin_cli import ACTIONS

BANK = "colonoscopy-optical-diagnosis"
LONG_AGO = timedelta(days=2000)
VARIABLES = (
    "RETENTION_REVIEW_ID",
    "RETENTION_DECISION",
    "RETENTION_NOTE",
    "RETENTION_ASK_AGAIN_ON",
    "RETENTION_DECIDED_BY",
    "CONFIRM",
)


def _count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


@pytest.fixture
def run(db_session: Session, monkeypatch: pytest.MonkeyPatch):
    """Hand the command the test session, and a clean environment."""
    import app.db.core_db as core_db

    monkeypatch.setattr(core_db, "CoreSessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)

    for name in VARIABLES:
        monkeypatch.delenv(name, raising=False)

    return monkeypatch


@pytest.fixture
def operator(db_session: Session) -> User:
    user = User(
        username="mark",
        email="mark@example.nhs.uk",
        password_hash="x",
        full_name="Mark Operator",
        platform_role="superadmin",
    )
    db_session.add(user)
    db_session.commit()

    return user


@pytest.fixture
def records(db_session: Session) -> RetentionReview:
    """One person's records at one organisation, listed for a decision."""
    org = OrgUnit(
        name="Example Academy",
        type="hospital_team",
        records_kept_months_after_closure=1,
    )
    user = User(
        username="ada",
        email="ada@example.nhs.uk",
        password_hash="x",
        full_name="Ada Example",
    )
    db_session.add_all([org, user])
    db_session.flush()
    user.is_active = False
    user.deactivated_at = datetime.now(UTC) - LONG_AGO
    db_session.add_all(
        [
            Assessment(
                user_id=user.id,
                org_unit_id=org.id,
                question_bank_id=BANK,
                bank_version=1,
                completed_at=datetime.now(UTC) - LONG_AGO,
                time_limit_minutes=60,
                total_items=1,
                is_passed=True,
            ),
            ModuleEnrolment(
                user_id=user.id,
                org_unit_id=org.id,
                question_bank_id=BANK,
                starts_on=datetime.now(UTC) - LONG_AGO,
                source="admin",
            ),
        ]
    )
    db_session.flush()
    apply_retention(db_session, datetime.now(UTC), apply=True)
    db_session.commit()

    return db_session.scalars(select(RetentionReview)).one()


def test_it_is_an_admin_action() -> None:
    assert "decide-retention" in ACTIONS


class TestListing:
    def test_it_lists_what_is_awaiting_and_names_nobody(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        assert retention_command.main() == 0

        out = capsys.readouterr().out
        assert "1 awaiting a decision" in out
        assert f"review {records.id}:" in out
        assert "1 attempts and 1 enrolments" in out
        assert "ada" not in out.lower()
        assert "Example Academy" not in out

    def test_it_says_so_when_nothing_is_waiting(
        self, run: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        assert retention_command.main() == 0

        assert "0 awaiting a decision" in capsys.readouterr().out

    def test_listing_changes_nothing(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        db_session: Session,
    ) -> None:
        retention_command.main()

        db_session.expire_all()
        assert records.decision == "undecided"
        assert _count(db_session, Assessment) == 1


class TestADryRun:
    def test_it_prints_the_code_and_changes_nothing(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        db_session: Session,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        run.setenv("RETENTION_REVIEW_ID", str(records.id))
        run.setenv("RETENTION_DECISION", "delete")

        assert retention_command.main() == 0

        out = capsys.readouterr().out
        assert "Would delete. Nothing was changed." in out
        assert f"CONFIRM={records.id}:delete:1:1" in out
        db_session.expire_all()
        assert records.decision == "undecided"
        assert _count(db_session, Assessment) == 1

    def test_a_decision_that_is_neither_is_refused(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        run.setenv("RETENTION_REVIEW_ID", str(records.id))
        run.setenv("RETENTION_DECISION", "shred")

        assert retention_command.main() == 1

        assert "delete or keep" in capsys.readouterr().err

    def test_a_row_that_does_not_exist_is_refused(
        self, run: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        run.setenv("RETENTION_REVIEW_ID", "99999")
        run.setenv("RETENTION_DECISION", "delete")

        assert retention_command.main() == 1

        assert "no review 99999" in capsys.readouterr().err

    def test_an_id_that_is_not_a_number_is_refused(
        self, run: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
    ) -> None:
        run.setenv("RETENTION_REVIEW_ID", "ada")

        assert retention_command.main() == 1

        assert "RETENTION_REVIEW_ID" in capsys.readouterr().err


class TestCarryingItOut:
    def _confirm(
        self, run: pytest.MonkeyPatch, records: RetentionReview, decision: str
    ) -> None:
        run.setenv("RETENTION_REVIEW_ID", str(records.id))
        run.setenv("RETENTION_DECISION", decision)
        run.setenv("RETENTION_DECIDED_BY", "mark")
        run.setenv("CONFIRM", f"{records.id}:{decision}:1:1")

    def test_delete_removes_the_records_and_records_who_decided(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        operator: User,
        db_session: Session,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        self._confirm(run, records, "delete")

        assert retention_command.main() == 0

        assert "Deleted the records" in capsys.readouterr().out
        db_session.expire_all()
        assert records.decision == "deleted"
        assert records.decided_by == operator.id
        assert _count(db_session, Assessment) == 0
        assert _count(db_session, ModuleEnrolment) == 0

    def test_keep_takes_the_note_and_the_date(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        operator: User,
        db_session: Session,
    ) -> None:
        self._confirm(run, records, "keep")
        run.setenv("RETENTION_NOTE", "A dispute")
        run.setenv("RETENTION_ASK_AGAIN_ON", "2099-03-01")

        assert retention_command.main() == 0

        db_session.expire_all()
        assert records.decision == "kept"
        assert records.note == "A dispute"
        assert records.ask_again_on is not None
        assert records.ask_again_on.date().isoformat() == "2099-03-01"
        assert _count(db_session, Assessment) == 1

    def test_keep_with_no_date_is_refused_as_on_the_screen(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        operator: User,
        db_session: Session,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        self._confirm(run, records, "keep")
        run.setenv("RETENTION_NOTE", "A dispute")

        assert retention_command.main() == 1

        assert "date to ask again" in capsys.readouterr().err
        db_session.expire_all()
        assert records.decision == "undecided"

    def test_a_date_that_is_not_one_is_refused(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        operator: User,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        self._confirm(run, records, "keep")
        run.setenv("RETENTION_ASK_AGAIN_ON", "next spring")

        assert retention_command.main() == 1

        assert "YYYY-MM-DD" in capsys.readouterr().err

    def test_the_wrong_code_changes_nothing(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        operator: User,
        db_session: Session,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        self._confirm(run, records, "delete")
        run.setenv("CONFIRM", f"{records.id}:delete:9:9")

        assert retention_command.main() == 1

        assert "does not match" in capsys.readouterr().err
        db_session.expire_all()
        assert records.decision == "undecided"
        assert _count(db_session, Assessment) == 1

    def test_a_code_read_for_keep_does_not_delete(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        operator: User,
        db_session: Session,
    ) -> None:
        self._confirm(run, records, "delete")
        run.setenv("CONFIRM", f"{records.id}:keep:1:1")

        assert retention_command.main() == 1

        assert _count(db_session, Assessment) == 1

    @pytest.mark.parametrize("who", ["", "nobody", "ada"])
    def test_only_a_superadmin_may_be_named_as_deciding(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        operator: User,
        db_session: Session,
        capsys: pytest.CaptureFixture[str],
        who: str,
    ) -> None:
        self._confirm(run, records, "delete")
        run.setenv("RETENTION_DECIDED_BY", who)

        assert retention_command.main() == 1

        assert "superadmin" in capsys.readouterr().err
        db_session.expire_all()
        assert records.decision == "undecided"
        assert _count(db_session, Assessment) == 1

    def test_what_is_already_decided_is_refused(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        operator: User,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        self._confirm(run, records, "delete")
        retention_command.main()
        capsys.readouterr()

        assert retention_command.main() == 1

        assert "already been decided" in capsys.readouterr().err

    def test_nothing_printed_names_anybody(
        self,
        run: pytest.MonkeyPatch,
        records: RetentionReview,
        operator: User,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        self._confirm(run, records, "delete")

        retention_command.main()

        captured = capsys.readouterr()
        said = (captured.out + captured.err).lower()
        assert "ada" not in said
        assert "example academy" not in said
        assert "operator" not in said
