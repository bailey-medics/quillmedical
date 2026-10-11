"""The deploy pipeline's sync, called directly.

The banks are a tree on the filesystem where the real validator and the
real sync can run over it. A bucket is faked by replacing the storage
functions this module calls, so nothing here reaches Google.
"""

import shutil
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching import ci_sync
from app.features.teaching import router as teaching_router_module
from app.features.teaching.ci_sync import (
    _bank_ids,
    _org_unit_to_sync_into,
    _sync_one_bank,
    sync_every_bank,
)
from app.features.teaching.models import (
    SYNC_ACTOR_DEPLOY_BOT,
    QuestionBankConfig,
    QuestionBankSync,
)
from app.features.teaching.schemas import (
    CiSyncBankResult,
    CiSyncErrorItem,
    CiTeachingSyncOut,
)
from app.features.teaching.tooling.validate import ValidationResult
from app.models import OrgUnit

_VALID_MODULE = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "teaching_tooling"
    / ".valid-module"
)
#: The fixture's declared moduleId, which its directory name must match.
_VALID_MODULE_ID = "valid-module"

_NOT_FOUND = "module directory not found - cannot validate module metadata"


#: A module that passes its own checks and whose assessment does not.
_BAD_ASSESSMENT_ID = "bad-assessment"

#: What the checks say of it, as the pipeline is told.
_BAD_ASSESSMENT_REASON = "uniform type requires 'options'"


def _base_with(
    tmp_path: Path,
    *,
    good: bool = False,
    bad: bool = False,
    bad_assessment: bool = False,
) -> str:
    """Build a modules-layout tree and return it as the base path."""
    modules = tmp_path / "repo" / "modules"
    modules.mkdir(parents=True)

    if good:
        shutil.copytree(_VALID_MODULE, modules / _VALID_MODULE_ID)

    if bad_assessment:
        module = modules / _BAD_ASSESSMENT_ID
        shutil.copytree(_VALID_MODULE, module)
        metadata = module / "module.yaml"
        metadata.write_text(
            metadata.read_text().replace(_VALID_MODULE_ID, _BAD_ASSESSMENT_ID)
        )
        # The module still passes. Only the assessment is at fault, so
        # the sync gets as far as recording that it failed.
        assessment = module / "assessment" / "assessment.yaml"
        assessment.write_text(
            "\n".join(
                line
                for line in assessment.read_text().splitlines()
                if not line.startswith(("options:", "- "))
            )
            + "\n"
        )

    if bad:
        broken = modules / "bad-bank"
        broken.mkdir()
        # Parses as YAML, but is not a module: validation rejects it.
        (broken / "module.yaml").write_text("moduleId: bad-bank\n")
        (broken / "assessment").mkdir()
        (broken / "assessment" / "config.yaml").write_text("{}\n")

    return str(tmp_path)


def _read_from(
    monkeypatch: pytest.MonkeyPatch,
    *,
    bucket: str | None = None,
    base_path: str | None = None,
) -> None:
    """Say where the deployment keeps its banks."""
    monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", bucket)
    monkeypatch.setattr(settings, "TEACHING_QUESTION_BANK_PATH", base_path)


@pytest.fixture()
def organisation(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Teaching Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


def _config(db: Session, org_unit_id: int) -> QuestionBankConfig:
    """A bank already held by an org unit."""
    config = QuestionBankConfig(
        org_unit_id=org_unit_id,
        question_bank_id="held-bank",
        version=1,
        title="Held",
        description="",
        type="uniform",
        config_yaml={},
    )
    db.add(config)
    db.flush()

    return config


class _Calls:
    """What the faked storage and sync were asked for."""

    def __init__(self) -> None:
        self.sync_args: tuple[Any, ...] = ()
        self.sync_kwargs: dict[str, Any] = {}
        self.status_asked_for: list[str] = []


def _fake_the_bucket(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    *,
    module_found: bool = True,
    metadata: ValidationResult | None = None,
    sync_returns: Any = "a record",
    sync_found: ValidationResult | None = None,
    sync_raises: Exception | None = None,
) -> tuple[_Calls, Path, Path]:
    """Stand in for a bucket holding one module.

    Returns what was asked of the fakes, and the two directories a real
    download would have made: the module's, for checking, and the
    assessment's, for syncing. Each sits in a temporary directory of
    its own, as a real download does.
    """
    calls = _Calls()
    module_dir = tmp_path / "module-download" / "a-bank"
    module_dir.mkdir(parents=True)
    bank_dir = tmp_path / "bank-download" / "a-bank"
    bank_dir.mkdir(parents=True)

    def fake_sync(*args: Any, **kwargs: Any) -> tuple[ValidationResult, Any]:
        calls.sync_args = args
        calls.sync_kwargs = kwargs

        if sync_raises is not None:
            raise sync_raises

        record = (
            SimpleNamespace(version=3, status="success")
            if sync_returns == "a record"
            else sync_returns
        )

        return sync_found or ValidationResult(), record

    def fake_status(bucket: str, bank_id: str) -> str:
        calls.status_asked_for.append(bank_id)

        return "live"

    monkeypatch.setattr(
        ci_sync,
        "download_module_from_gcs",
        lambda bucket, bank_id: module_dir if module_found else None,
    )
    monkeypatch.setattr(
        ci_sync,
        "validate_module_metadata",
        lambda module_dir: metadata or ValidationResult(),
    )
    monkeypatch.setattr(
        teaching_router_module,
        "_resolve_bank_path_or_gcs",
        lambda bank_id: (bank_dir, True),
    )
    monkeypatch.setattr(
        teaching_router_module,
        "_build_image_inventory",
        lambda bank_id, is_gcs: {"question_001": {"image.png"}},
    )
    monkeypatch.setattr(ci_sync, "get_module_status_from_gcs", fake_status)
    monkeypatch.setattr(ci_sync, "sync_question_bank", fake_sync)

    return calls, module_dir, bank_dir


class TestSyncEveryBank:
    def test_nowhere_to_read_banks_from_finds_none(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _read_from(monkeypatch)

        assert sync_every_bank(db_session) == CiTeachingSyncOut(
            synced=[], errors=[], message="No banks found"
        )

    def test_banks_with_no_organisation_to_hold_them_are_not_synced(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        _read_from(monkeypatch, base_path=_base_with(tmp_path, good=True))

        assert sync_every_bank(db_session) == CiTeachingSyncOut(
            synced=[], errors=[], message="No organisation to sync into"
        )

    def test_no_banks_is_said_before_no_organisation(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Both are true here, and the banks are looked for first."""
        _read_from(monkeypatch)

        assert sync_every_bank(db_session).message == "No banks found"

    def test_a_good_bank_is_synced_as_the_deploy_pipeline(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
    ) -> None:
        _read_from(monkeypatch, base_path=_base_with(tmp_path, good=True))

        outcome = sync_every_bank(db_session)

        assert outcome.errors == []
        assert outcome.message is None
        assert [bank.bank_id for bank in outcome.synced] == [_VALID_MODULE_ID]

        config = db_session.execute(select(QuestionBankConfig)).scalar_one()

        assert config.org_unit_id == organisation.id
        assert outcome.synced[0].version == str(config.version)
        assert config.synced_by is None
        assert config.synced_by_actor == SYNC_ACTOR_DEPLOY_BOT

    def test_a_bad_bank_is_listed_and_the_good_one_still_synced(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
    ) -> None:
        _read_from(
            monkeypatch,
            base_path=_base_with(tmp_path, good=True, bad=True),
        )

        outcome = sync_every_bank(db_session)

        assert [bank.bank_id for bank in outcome.synced] == [_VALID_MODULE_ID]
        assert [bank.bank_id for bank in outcome.errors] == ["bad-bank"]
        assert outcome.errors[0].error

    def test_a_bank_whose_sync_recorded_nothing_is_on_neither_list(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
    ) -> None:
        _read_from(monkeypatch, bucket="a-bucket")
        monkeypatch.setattr(
            ci_sync, "list_banks_in_gcs", lambda bucket: ["a-bank"]
        )
        _fake_the_bucket(monkeypatch, tmp_path, sync_returns=None)

        assert sync_every_bank(db_session) == CiTeachingSyncOut(
            synced=[], errors=[]
        )

    def test_a_bank_whose_assessment_failed_is_listed_as_failed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
    ) -> None:
        """The sync keeps a record of it, but nothing of it was loaded."""
        _read_from(
            monkeypatch,
            base_path=_base_with(tmp_path, bad_assessment=True),
        )

        outcome = sync_every_bank(db_session)

        assert outcome == CiTeachingSyncOut(
            synced=[],
            errors=[
                CiSyncErrorItem(
                    bank_id=_BAD_ASSESSMENT_ID, error=_BAD_ASSESSMENT_REASON
                )
            ],
        )
        assert db_session.scalar(select(QuestionBankConfig)) is None

        record = db_session.execute(select(QuestionBankSync)).scalar_one()

        assert record.status == "failed"

    def test_a_failed_assessment_and_a_good_bank_are_each_listed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
    ) -> None:
        _read_from(
            monkeypatch,
            base_path=_base_with(tmp_path, good=True, bad_assessment=True),
        )

        outcome = sync_every_bank(db_session)

        assert [bank.bank_id for bank in outcome.synced] == [_VALID_MODULE_ID]
        assert outcome.errors == [
            CiSyncErrorItem(
                bank_id=_BAD_ASSESSMENT_ID, error=_BAD_ASSESSMENT_REASON
            )
        ]

    def test_a_bank_turned_away_with_no_record_is_listed_as_failed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
    ) -> None:
        turned_away = ValidationResult()
        turned_away.add_error(
            "/tmp/a-bank", "Draft module version must be 1, got 2"
        )
        _read_from(monkeypatch, bucket="a-bucket")
        monkeypatch.setattr(
            ci_sync, "list_banks_in_gcs", lambda bucket: ["a-bank"]
        )
        _fake_the_bucket(
            monkeypatch, tmp_path, sync_returns=None, sync_found=turned_away
        )

        assert sync_every_bank(db_session) == CiTeachingSyncOut(
            synced=[],
            errors=[
                CiSyncErrorItem(
                    bank_id="a-bank",
                    error="Draft module version must be 1, got 2",
                )
            ],
        )


class TestBankIds:
    def test_the_bucket_is_listed_where_one_is_set(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        """Even with a local path set as well: the bucket comes first."""
        monkeypatch.setattr(
            ci_sync, "list_banks_in_gcs", lambda bucket: [f"in-{bucket}"]
        )
        base = _base_with(tmp_path, good=True)

        assert _bank_ids("a-bucket", base) == ["in-a-bucket"]

    def test_a_bucket_that_cannot_be_listed_holds_no_banks(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        """And the local path is not tried in its place."""

        def refuse(bucket: str) -> list[str]:
            raise RuntimeError("no credentials")

        monkeypatch.setattr(ci_sync, "list_banks_in_gcs", refuse)
        base = _base_with(tmp_path, good=True)

        assert _bank_ids("a-bucket", base) == []

    def test_the_local_path_is_read_where_there_is_no_bucket(
        self, tmp_path: Path
    ) -> None:
        base = _base_with(tmp_path, good=True)

        assert _bank_ids(None, base) == [_VALID_MODULE_ID]

    def test_neither_set_gives_no_banks(self) -> None:
        assert _bank_ids(None, None) == []


class TestOrgUnitToSyncInto:
    def test_it_is_where_a_bank_is_already_held(
        self, db_session: Session
    ) -> None:
        """Not the first organisation, which here is another one."""
        first = OrgUnit(name="First Trust", type="hospital_team")
        holder = OrgUnit(name="Holding Trust", type="hospital_team")
        db_session.add_all([first, holder])
        db_session.flush()
        _config(db_session, holder.id)

        assert _org_unit_to_sync_into(db_session) == holder.id

    def test_with_no_bank_held_it_is_the_first_organisation(
        self, db_session: Session
    ) -> None:
        first = OrgUnit(name="First Trust", type="hospital_team")
        second = OrgUnit(name="Second Trust", type="hospital_team")
        db_session.add_all([first, second])
        db_session.flush()

        assert _org_unit_to_sync_into(db_session) == first.id

    def test_a_ward_is_not_an_organisation(self, db_session: Session) -> None:
        """A ward made before any organisation has the lower id."""
        ward = OrgUnit(name="Ward 4", type="ward")
        db_session.add(ward)
        db_session.flush()
        trust = OrgUnit(name="A Trust", type="hospital_team")
        db_session.add(trust)
        db_session.flush()

        assert _org_unit_to_sync_into(db_session) == trust.id

    def test_with_no_organisation_there_is_nowhere(
        self, db_session: Session
    ) -> None:
        assert _org_unit_to_sync_into(db_session) is None


class TestSyncOneBankFromTheFilesystem:
    def test_a_module_that_is_not_there_is_listed(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        base = _base_with(tmp_path)

        outcome = _sync_one_bank(db_session, "missing-bank", 1, None, base)

        assert outcome == CiSyncErrorItem(
            bank_id="missing-bank", error=_NOT_FOUND
        )

    def test_with_nowhere_to_read_from_the_module_is_not_found(
        self, db_session: Session
    ) -> None:
        outcome = _sync_one_bank(db_session, "a-bank", 1, None, None)

        assert outcome == CiSyncErrorItem(bank_id="a-bank", error=_NOT_FOUND)

    def test_a_module_that_fails_its_checks_is_listed_and_not_synced(
        self,
        db_session: Session,
        tmp_path: Path,
        organisation: OrgUnit,
    ) -> None:
        base = _base_with(tmp_path, bad=True)

        outcome = _sync_one_bank(
            db_session, "bad-bank", organisation.id, None, base
        )

        assert isinstance(outcome, CiSyncErrorItem)
        assert outcome.bank_id == "bad-bank"
        assert outcome.error
        assert db_session.scalar(select(QuestionBankConfig)) is None

    def test_only_the_first_five_failures_are_given(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        base = _base_with(tmp_path, good=True)
        failed = ValidationResult()

        for number in range(1, 8):
            failed.add_error("module.yaml", f"fault {number}")

        monkeypatch.setattr(
            ci_sync, "validate_module_metadata", lambda module_dir: failed
        )

        outcome = _sync_one_bank(db_session, _VALID_MODULE_ID, 1, None, base)

        assert outcome == CiSyncErrorItem(
            bank_id=_VALID_MODULE_ID,
            error="fault 1; fault 2; fault 3; fault 4; fault 5",
        )

    def test_a_good_module_is_synced_and_left_where_it_was(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
    ) -> None:
        base = _base_with(tmp_path, good=True)
        # The router's helper finds the assessment from the setting.
        _read_from(monkeypatch, base_path=base)

        outcome = _sync_one_bank(
            db_session, _VALID_MODULE_ID, organisation.id, None, base
        )

        assert isinstance(outcome, CiSyncBankResult)
        assert outcome.bank_id == _VALID_MODULE_ID
        assert (tmp_path / "repo" / "modules" / _VALID_MODULE_ID).is_dir()

    def test_a_sync_that_raises_is_listed_with_what_it_said(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        base = _base_with(tmp_path, good=True)
        _read_from(monkeypatch, base_path=base)

        def fail(*args: Any, **kwargs: Any) -> None:
            raise RuntimeError("the sync fell over")

        monkeypatch.setattr(ci_sync, "sync_question_bank", fail)

        outcome = _sync_one_bank(db_session, _VALID_MODULE_ID, 1, None, base)

        assert outcome == CiSyncErrorItem(
            bank_id=_VALID_MODULE_ID, error="the sync fell over"
        )

    def test_an_assessment_that_cannot_be_found_is_listed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        """The module is there, but the setting the router's helper reads
        names nowhere, so the helper refuses and its words are the reason.
        """
        base = _base_with(tmp_path, good=True)
        _read_from(monkeypatch)

        outcome = _sync_one_bank(db_session, _VALID_MODULE_ID, 1, None, base)

        assert outcome == CiSyncErrorItem(
            bank_id=_VALID_MODULE_ID,
            error=(
                "400: Neither TEACHING_QUESTION_BANK_PATH nor "
                "TEACHING_GCS_BUCKET is configured"
            ),
        )


class TestSyncOneBankFromTheBucket:
    def test_a_module_the_bucket_does_not_hold_is_listed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        calls, _module_dir, bank_dir = _fake_the_bucket(
            monkeypatch, tmp_path, module_found=False
        )

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome == CiSyncErrorItem(bank_id="a-bank", error=_NOT_FOUND)
        assert calls.sync_args == ()
        assert bank_dir.is_dir()

    def test_the_bucket_is_read_even_with_a_local_path_set(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        _fake_the_bucket(monkeypatch, tmp_path, module_found=False)
        base = _base_with(tmp_path, good=True)

        outcome = _sync_one_bank(
            db_session, _VALID_MODULE_ID, 1, "a-bucket", base
        )

        assert outcome == CiSyncErrorItem(
            bank_id=_VALID_MODULE_ID, error=_NOT_FOUND
        )

    def test_a_synced_bank_is_given_with_its_version_as_text(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        _fake_the_bucket(monkeypatch, tmp_path)

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome == CiSyncBankResult(bank_id="a-bank", version="3")

    def test_the_sync_is_given_no_user_and_what_the_bucket_holds(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        calls, _module_dir, bank_dir = _fake_the_bucket(monkeypatch, tmp_path)

        _sync_one_bank(db_session, "a-bank", 7, "a-bucket", None)

        assert calls.sync_args == (bank_dir, 7, None, db_session)
        assert calls.sync_kwargs == {
            "image_inventory": {"question_001": {"image.png"}},
            "module_status": "live",
        }
        assert calls.status_asked_for == ["a-bank"]

    def test_a_sync_that_recorded_nothing_gives_nothing(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        _fake_the_bucket(monkeypatch, tmp_path, sync_returns=None)

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome is None

    def test_a_sync_recorded_as_failed_is_listed_with_what_was_wrong(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        """In the checks' own words, without the path beside each."""
        failed = SimpleNamespace(
            version=3,
            status="failed",
            errors=[
                {
                    "path": "assessment/question_001/question.yaml",
                    "message": "missing required 'text' field",
                },
                {"path": "tmp/a-bank", "message": "no questions found"},
            ],
        )
        _fake_the_bucket(monkeypatch, tmp_path, sync_returns=failed)

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome == CiSyncErrorItem(
            bank_id="a-bank",
            error="missing required 'text' field; no questions found",
        )

    def test_only_the_first_five_recorded_faults_are_given(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        failed = SimpleNamespace(
            version=3,
            status="failed",
            errors=[
                {"path": "", "message": f"fault {number}"}
                for number in range(1, 8)
            ],
        )
        _fake_the_bucket(monkeypatch, tmp_path, sync_returns=failed)

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome == CiSyncErrorItem(
            bank_id="a-bank",
            error="fault 1; fault 2; fault 3; fault 4; fault 5",
        )

    def test_a_failed_sync_that_recorded_no_fault_is_still_listed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        failed = SimpleNamespace(version=3, status="failed", errors=[])
        _fake_the_bucket(monkeypatch, tmp_path, sync_returns=failed)

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome == CiSyncErrorItem(
            bank_id="a-bank",
            error="the sync did not succeed and recorded no reason",
        )

    def test_a_sync_left_in_progress_is_not_taken_for_a_success(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        """Only a success is a success, whatever else a record may say."""
        unfinished = SimpleNamespace(
            version=3, status="in_progress", errors=[]
        )
        _fake_the_bucket(monkeypatch, tmp_path, sync_returns=unfinished)

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert isinstance(outcome, CiSyncErrorItem)

    def test_a_draft_turned_away_for_its_version_is_listed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        """No record is made of it, and the checks say why. The folder
        the fault names is the server's own, and is not passed on.
        """
        turned_away = ValidationResult()
        turned_away.add_error(
            "/tmp/a-bank", "Draft module version must be 1, got 2"
        )
        _fake_the_bucket(
            monkeypatch, tmp_path, sync_returns=None, sync_found=turned_away
        )

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome == CiSyncErrorItem(
            bank_id="a-bank", error="Draft module version must be 1, got 2"
        )

    def test_what_was_downloaded_is_removed_after_a_sync(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        _calls, module_dir, bank_dir = _fake_the_bucket(monkeypatch, tmp_path)

        _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert not module_dir.parent.exists()
        assert not bank_dir.parent.exists()

    def test_what_was_downloaded_is_removed_when_the_sync_raises(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        _calls, module_dir, bank_dir = _fake_the_bucket(
            monkeypatch, tmp_path, sync_raises=RuntimeError("fell over")
        )

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome == CiSyncErrorItem(bank_id="a-bank", error="fell over")
        assert not module_dir.parent.exists()
        assert not bank_dir.parent.exists()

    def test_the_module_is_removed_when_it_fails_its_checks(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        failed = ValidationResult()
        failed.add_error("module.yaml", "no title")
        calls, module_dir, bank_dir = _fake_the_bucket(
            monkeypatch, tmp_path, metadata=failed
        )

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome == CiSyncErrorItem(bank_id="a-bank", error="no title")
        assert not module_dir.parent.exists()
        # Never downloaded, so never removed.
        assert calls.sync_args == ()
        assert bank_dir.is_dir()

    def test_a_download_that_raises_is_listed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        _fake_the_bucket(monkeypatch, tmp_path)

        def refuse(bucket: str, bank_id: str) -> Path:
            raise RuntimeError("bucket unreachable")

        monkeypatch.setattr(ci_sync, "download_module_from_gcs", refuse)

        outcome = _sync_one_bank(db_session, "a-bank", 1, "a-bucket", None)

        assert outcome == CiSyncErrorItem(
            bank_id="a-bank", error="bucket unreachable"
        )
