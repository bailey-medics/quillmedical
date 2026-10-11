"""An administrator's own syncs, called directly.

The banks are a tree on the filesystem where the real validator and the
real sync can run over it. A bucket is faked by replacing the storage
functions this module reaches, so nothing here goes to Google. The two
router helpers the sync of every bank is handed are stood in for by
plain functions.
"""

import shutil
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching import manual_sync, storage
from app.features.teaching import sync as bank_sync
from app.features.teaching.errors import BankIdRequired, SyncRecordedNothing
from app.features.teaching.manual_sync import (
    BanksSyncedByHand,
    ImageInventory,
    _bank_ids,
    _NotSynced,
    _sync_one_bank,
    bank_named_in,
    check_bank,
    discard_download,
    sync_bank,
    sync_banks_by_hand,
)
from app.features.teaching.models import (
    SYNC_ACTOR_DEPLOY_BOT,
    QuestionBankConfig,
    QuestionBankSync,
)
from app.features.teaching.tooling import validate as module_checks
from app.features.teaching.tooling.validate import ValidationResult
from app.models import OrgUnit, User

_VALID_MODULE = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "teaching_tooling"
    / ".valid-module"
)
#: The fixture's declared moduleId, which its directory name must match.
GOOD = "valid-module"

#: A module that passes its own checks and whose assessment does not.
BAD_ASSESSMENT = "bad-assessment"

#: What the checks say of it.
BAD_ASSESSMENT_FAULT = "uniform type requires 'options'"

#: A directory that is not a module at all.
BAD_MODULE = "bad-bank"

_NOT_FOUND = "module directory not found - cannot validate module metadata"

IMAGES = {"question_001": {"image.png"}}


def _base_with(
    tmp_path: Path,
    *,
    good: bool = False,
    bad_assessment: bool = False,
    bad_module: bool = False,
) -> str:
    """Build a modules-layout tree and return it as the base path."""
    modules = tmp_path / "repo" / "modules"
    modules.mkdir(parents=True)

    if good:
        shutil.copytree(_VALID_MODULE, modules / GOOD)

    if bad_assessment:
        module = modules / BAD_ASSESSMENT
        shutil.copytree(_VALID_MODULE, module)
        metadata = module / "module.yaml"
        metadata.write_text(metadata.read_text().replace(GOOD, BAD_ASSESSMENT))
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

    if bad_module:
        broken = modules / BAD_MODULE
        broken.mkdir()
        # Parses as YAML, but is not a module: validation rejects it.
        (broken / "module.yaml").write_text(f"moduleId: {BAD_MODULE}\n")
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


def _assessment_of(base: str, bank_id: str) -> Path:
    """Where a bank's assessment is, in the tree ``_base_with`` built."""
    found = storage.resolve_local_bank(base, bank_id)
    assert found is not None

    return found


def _find_on_disk(base: str) -> manual_sync.FindBank:
    """Stand in for the router's helper, reading the tree on disk."""

    def find(bank_id: str) -> tuple[Path, bool]:
        return _assessment_of(base, bank_id), False

    return find


def _no_images(bank_id: str, downloaded: bool) -> ImageInventory:
    return None


@pytest.fixture()
def organisation(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Teaching Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture()
def administrator(db_session: Session) -> User:
    user = User(
        username="coordinator",
        email="coordinator@example.com",
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession="teaching_admin",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    return user


class _Calls:
    """What the faked storage and sync were asked for."""

    def __init__(self) -> None:
        self.sync_args: tuple[Any, ...] = ()
        self.sync_kwargs: dict[str, Any] = {}
        self.status_asked_for: list[str] = []
        self.found: list[str] = []
        self.images_listed: list[tuple[str, bool]] = []


def _fake_the_sync(
    monkeypatch: pytest.MonkeyPatch,
    *,
    returns: Any = "a record",
    found: ValidationResult | None = None,
    raises: Exception | None = None,
) -> _Calls:
    """Replace the sync itself, and what the bucket says of a module."""
    calls = _Calls()

    def fake_sync(*args: Any, **kwargs: Any) -> tuple[ValidationResult, Any]:
        calls.sync_args = args
        calls.sync_kwargs = kwargs

        if raises is not None:
            raise raises

        record = (
            SimpleNamespace(version=3, status="success")
            if returns == "a record"
            else returns
        )

        return found or ValidationResult(), record

    def fake_status(bucket: str, bank_id: str) -> str:
        calls.status_asked_for.append(bank_id)

        return "live"

    monkeypatch.setattr(bank_sync, "sync_question_bank", fake_sync)
    monkeypatch.setattr(storage, "get_module_status_from_gcs", fake_status)

    return calls


class _Bucket:
    """A faked bucket holding one module, and what was asked of it."""

    def __init__(self, calls: _Calls, module_dir: Path, bank_dir: Path):
        self.calls = calls
        self.module_dir = module_dir
        self.bank_dir = bank_dir

    def find_bank(self, bank_id: str) -> tuple[Path, bool]:
        self.calls.found.append(bank_id)

        return self.bank_dir, True

    def list_images(self, bank_id: str, downloaded: bool) -> ImageInventory:
        self.calls.images_listed.append((bank_id, downloaded))

        return IMAGES


def _fake_the_bucket(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    *,
    module_found: bool = True,
    metadata: ValidationResult | None = None,
    sync_returns: Any = "a record",
    sync_found: ValidationResult | None = None,
    sync_raises: Exception | None = None,
) -> _Bucket:
    """Stand in for a bucket holding one module.

    Gives the two directories a real download would have made: the
    module's, for checking, and the assessment's, for syncing. Each sits
    in a temporary directory of its own, as a real download does.
    """
    calls = _fake_the_sync(
        monkeypatch,
        returns=sync_returns,
        found=sync_found,
        raises=sync_raises,
    )
    module_dir = tmp_path / "module-download" / "a-bank"
    module_dir.mkdir(parents=True)
    bank_dir = tmp_path / "bank-download" / "a-bank"
    bank_dir.mkdir(parents=True)

    monkeypatch.setattr(
        storage,
        "download_module_from_gcs",
        lambda bucket, bank_id: module_dir if module_found else None,
    )
    monkeypatch.setattr(
        module_checks,
        "validate_module_metadata",
        lambda module_dir: metadata or ValidationResult(),
    )

    return _Bucket(calls, module_dir, bank_dir)


def _one_from_the_bucket(
    db: Session, bucket: _Bucket, *, base_path: str | None = None
) -> Any:
    return _sync_one_bank(
        db,
        "a-bank",
        org_unit_id=7,
        user_id=4,
        bucket="a-bucket",
        base_path=base_path,
        find_bank=bucket.find_bank,
        list_images=bucket.list_images,
    )


def _one_from_disk(
    db: Session,
    bank_id: str,
    base: str | None,
    *,
    org_unit_id: int = 1,
    user_id: int = 1,
    find_bank: manual_sync.FindBank | None = None,
) -> Any:
    return _sync_one_bank(
        db,
        bank_id,
        org_unit_id=org_unit_id,
        user_id=user_id,
        bucket=None,
        base_path=base,
        find_bank=find_bank or _find_on_disk(base or ""),
        list_images=_no_images,
    )


# --- bank_named_in ----------------------------------------------------------


def test_the_bank_a_body_names_is_given() -> None:
    assert bank_named_in({"bank_id": "polyps"}) == "polyps"


def test_a_bank_id_is_not_checked_when_it_is_read() -> None:
    """Whether it can be an id is asked by whatever looks for the bank."""
    assert bank_named_in({"bank_id": "../elsewhere"}) == "../elsewhere"


@pytest.mark.parametrize("body", [{}, {"bank_id": ""}, {"other": "polyps"}])
def test_a_body_that_names_no_bank_is_refused(body: dict[str, str]) -> None:
    with pytest.raises(BankIdRequired) as refused:
        bank_named_in(body)

    assert refused.value.status_code == 400
    assert refused.value.message == "bank_id is required"


# --- check_bank -------------------------------------------------------------


def test_checking_a_good_bank_says_it_is_valid_and_loads_nothing(
    db_session: Session,
    tmp_path: Path,
    organisation: OrgUnit,
    administrator: User,
) -> None:
    base = _base_with(tmp_path, good=True)

    result = check_bank(
        db_session,
        _assessment_of(base, GOOD),
        org_unit_id=organisation.id,
        user_id=administrator.id,
        image_inventory=None,
    )

    assert result.is_valid is True
    assert result.errors == []
    assert result.version == 1
    assert result.item_count == 1
    assert result.summary
    assert db_session.scalar(select(QuestionBankSync)) is None
    assert db_session.scalar(select(QuestionBankConfig)) is None


def test_checking_a_bank_at_fault_says_what_is_wrong_and_refuses_nobody(
    db_session: Session,
    tmp_path: Path,
    organisation: OrgUnit,
    administrator: User,
) -> None:
    base = _base_with(tmp_path, bad_assessment=True)

    result = check_bank(
        db_session,
        _assessment_of(base, BAD_ASSESSMENT),
        org_unit_id=organisation.id,
        user_id=administrator.id,
        image_inventory=None,
    )

    assert result.is_valid is False
    assert [fault.message for fault in result.errors] == [BAD_ASSESSMENT_FAULT]
    assert db_session.scalar(select(QuestionBankSync)) is None


def test_a_check_gives_the_warnings_and_the_paths_the_checks_gave(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    found = ValidationResult(bank_id="a-bank", version=4, item_count=2)
    found.add_error("question_001/question.yaml", "no text")
    found.add_warning("assessment.yaml", "no description")
    _fake_the_sync(monkeypatch, returns=None, found=found)

    result = check_bank(
        db_session,
        tmp_path,
        org_unit_id=7,
        user_id=4,
        image_inventory=None,
    )

    assert result.bank_id == "a-bank"
    assert result.version == 4
    assert result.item_count == 2
    assert [(e.path, e.message) for e in result.errors] == [
        ("question_001/question.yaml", "no text")
    ]
    assert [(w.path, w.message) for w in result.warnings] == [
        ("assessment.yaml", "no description")
    ]
    assert result.summary == found.summary()


def test_a_check_asks_the_sync_to_validate_only(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls = _fake_the_sync(monkeypatch, returns=None)

    check_bank(
        db_session,
        tmp_path,
        org_unit_id=7,
        user_id=4,
        image_inventory=IMAGES,
    )

    assert calls.sync_args == (tmp_path, 7, 4, db_session)
    assert calls.sync_kwargs == {
        "validate_only": True,
        "image_inventory": IMAGES,
    }
    assert calls.status_asked_for == []


# --- sync_bank --------------------------------------------------------------


def test_a_good_bank_is_synced_as_the_caller_and_its_record_given(
    db_session: Session,
    tmp_path: Path,
    organisation: OrgUnit,
    administrator: User,
) -> None:
    base = _base_with(tmp_path, good=True)

    record = sync_bank(
        db_session,
        _assessment_of(base, GOOD),
        bank_id=GOOD,
        downloaded=False,
        org_unit_id=organisation.id,
        user_id=administrator.id,
        image_inventory=None,
    )

    assert record.status == "success"
    assert record.question_bank_id == GOOD
    assert record.triggered_by == administrator.id

    config = db_session.execute(select(QuestionBankConfig)).scalar_one()

    assert config.org_unit_id == organisation.id
    assert config.synced_by == administrator.id
    assert config.synced_by_actor != SYNC_ACTOR_DEPLOY_BOT


def test_a_bank_whose_assessment_is_at_fault_gives_its_failed_record(
    db_session: Session,
    tmp_path: Path,
    organisation: OrgUnit,
    administrator: User,
) -> None:
    """Not refused: the record of the failure is the answer."""
    base = _base_with(tmp_path, bad_assessment=True)

    record = sync_bank(
        db_session,
        _assessment_of(base, BAD_ASSESSMENT),
        bank_id=BAD_ASSESSMENT,
        downloaded=False,
        org_unit_id=organisation.id,
        user_id=administrator.id,
        image_inventory=None,
    )

    assert record.status == "failed"
    assert [fault["message"] for fault in record.errors] == [
        BAD_ASSESSMENT_FAULT
    ]
    assert db_session.scalar(select(QuestionBankConfig)) is None


def test_a_downloaded_bank_has_its_status_asked_of_the_bucket(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _read_from(monkeypatch, bucket="a-bucket")
    calls = _fake_the_sync(monkeypatch)

    sync_bank(
        db_session,
        tmp_path,
        bank_id="a-bank",
        downloaded=True,
        org_unit_id=7,
        user_id=4,
        image_inventory=IMAGES,
    )

    assert calls.status_asked_for == ["a-bank"]
    assert calls.sync_args == (tmp_path, 7, 4, db_session)
    assert calls.sync_kwargs == {
        "image_inventory": IMAGES,
        "module_status": "live",
    }


def test_a_bank_read_from_disk_has_no_status_asked_of_the_bucket(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Even with a bucket set: the sync reads the status from disk."""
    _read_from(monkeypatch, bucket="a-bucket")
    calls = _fake_the_sync(monkeypatch)

    sync_bank(
        db_session,
        tmp_path,
        bank_id="a-bank",
        downloaded=False,
        org_unit_id=7,
        user_id=4,
        image_inventory=None,
    )

    assert calls.status_asked_for == []
    assert calls.sync_kwargs == {
        "image_inventory": None,
        "module_status": None,
    }


def test_with_no_bucket_set_no_status_is_asked_for(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _read_from(monkeypatch)
    calls = _fake_the_sync(monkeypatch)

    sync_bank(
        db_session,
        tmp_path,
        bank_id="a-bank",
        downloaded=True,
        org_unit_id=7,
        user_id=4,
        image_inventory=None,
    )

    assert calls.status_asked_for == []
    assert calls.sync_kwargs["module_status"] is None


def test_a_sync_that_made_no_record_is_refused(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _fake_the_sync(monkeypatch, returns=None)

    with pytest.raises(SyncRecordedNothing) as refused:
        sync_bank(
            db_session,
            tmp_path,
            bank_id="a-bank",
            downloaded=False,
            org_unit_id=7,
            user_id=4,
            image_inventory=None,
        )

    assert refused.value.status_code == 500
    assert refused.value.message == "Sync failed unexpectedly"


def test_a_live_bank_synced_again_unchanged_is_refused_as_a_failure(
    db_session: Session,
    tmp_path: Path,
    organisation: OrgUnit,
    administrator: User,
) -> None:
    """Pinned as it stands. There is nothing new to load, the sync makes
    no record, and no record is taken here for a failure.
    """
    base = _base_with(tmp_path, good=True)

    def sync_it() -> QuestionBankSync:
        return sync_bank(
            db_session,
            _assessment_of(base, GOOD),
            bank_id=GOOD,
            downloaded=False,
            org_unit_id=organisation.id,
            user_id=administrator.id,
            image_inventory=None,
        )

    assert sync_it().status == "success"

    with pytest.raises(SyncRecordedNothing):
        sync_it()


# --- discard_download -------------------------------------------------------


def test_a_downloaded_bank_is_removed_with_the_directory_it_came_in(
    tmp_path: Path,
) -> None:
    bank_dir = tmp_path / "download" / "a-bank"
    bank_dir.mkdir(parents=True)

    discard_download(bank_dir, True)

    assert not bank_dir.parent.exists()
    assert tmp_path.is_dir()


def test_a_bank_read_from_disk_is_left_where_it_is(tmp_path: Path) -> None:
    bank_dir = tmp_path / "repo" / "a-bank"
    bank_dir.mkdir(parents=True)

    discard_download(bank_dir, False)

    assert bank_dir.is_dir()


def test_a_download_already_gone_is_not_an_error(tmp_path: Path) -> None:
    discard_download(tmp_path / "gone" / "a-bank", True)


# --- sync_banks_by_hand -----------------------------------------------------


def _sync_all_from_disk(
    db: Session, base: str, organisation: OrgUnit, administrator: User
) -> BanksSyncedByHand:
    return sync_banks_by_hand(
        db,
        org_unit_id=organisation.id,
        user_id=administrator.id,
        find_bank=_find_on_disk(base),
        list_images=_no_images,
    )


class TestSyncBanksByHand:
    def test_with_nowhere_to_read_banks_from_both_lists_are_empty(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _read_from(monkeypatch)

        outcome = sync_banks_by_hand(
            db_session,
            org_unit_id=1,
            user_id=1,
            find_bank=_find_on_disk(""),
            list_images=_no_images,
        )

        assert outcome == BanksSyncedByHand(synced=[], errors=[])

    def test_a_good_bank_is_synced_into_the_organisation_as_the_caller(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
        administrator: User,
    ) -> None:
        base = _base_with(tmp_path, good=True)
        _read_from(monkeypatch, base_path=base)

        outcome = _sync_all_from_disk(
            db_session, base, organisation, administrator
        )

        assert outcome.errors == []
        assert [
            (record.question_bank_id, record.status)
            for record in outcome.synced
        ] == [(GOOD, "success")]

        config = db_session.execute(select(QuestionBankConfig)).scalar_one()

        assert config.org_unit_id == organisation.id
        assert config.synced_by == administrator.id

    def test_a_bank_that_did_not_load_is_listed_as_synced(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
        administrator: User,
    ) -> None:
        """A known fault, recorded in the plan for a decision, and
        pinned here as it stands.

        The assessment failed its checks and nothing of the bank was
        loaded. Its sync still made a record, and any record is listed
        under ``synced``, so the administrator's page shows the bank as
        imported. ``sync_every_bank``, the deploy pipeline's sync,
        lists the same bank as failed. See
        ``docs/docs/plans/2026-10-11-thin-routes-and-steady-frontend-tests-plan.md``.
        """
        base = _base_with(tmp_path, bad_assessment=True)
        _read_from(monkeypatch, base_path=base)

        outcome = _sync_all_from_disk(
            db_session, base, organisation, administrator
        )

        assert outcome.errors == []
        assert len(outcome.synced) == 1

        listed = outcome.synced[0]

        assert listed.question_bank_id == BAD_ASSESSMENT
        assert listed.status == "failed"
        assert [fault["message"] for fault in listed.errors] == [
            BAD_ASSESSMENT_FAULT
        ]
        assert db_session.scalar(select(QuestionBankConfig)) is None

    def test_a_record_of_any_status_is_listed_as_synced(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        """The same known fault, said of the rule: the status is not
        read. A record left in progress is listed as synced too.
        """
        unfinished = SimpleNamespace(version=3, status="in_progress")
        _read_from(monkeypatch, bucket="a-bucket")
        monkeypatch.setattr(
            storage, "list_banks_in_gcs", lambda bucket: ["a-bank"]
        )
        bucket = _fake_the_bucket(
            monkeypatch, tmp_path, sync_returns=unfinished
        )

        outcome = sync_banks_by_hand(
            db_session,
            org_unit_id=7,
            user_id=4,
            find_bank=bucket.find_bank,
            list_images=bucket.list_images,
        )

        assert outcome.synced == [unfinished]
        assert outcome.errors == []

    def test_a_bad_module_is_listed_and_the_good_one_still_synced(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
        organisation: OrgUnit,
        administrator: User,
    ) -> None:
        base = _base_with(tmp_path, good=True, bad_module=True)
        _read_from(monkeypatch, base_path=base)

        outcome = _sync_all_from_disk(
            db_session, base, organisation, administrator
        )

        assert [r.question_bank_id for r in outcome.synced] == [GOOD]
        assert [fault["bank_id"] for fault in outcome.errors] == [BAD_MODULE]
        assert set(outcome.errors[0]) == {"bank_id", "error"}
        assert outcome.errors[0]["error"]

    def test_a_bank_whose_sync_made_no_record_is_on_neither_list(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        _read_from(monkeypatch, bucket="a-bucket")
        monkeypatch.setattr(
            storage, "list_banks_in_gcs", lambda bucket: ["a-bank"]
        )
        bucket = _fake_the_bucket(monkeypatch, tmp_path, sync_returns=None)

        outcome = sync_banks_by_hand(
            db_session,
            org_unit_id=7,
            user_id=4,
            find_bank=bucket.find_bank,
            list_images=bucket.list_images,
        )

        assert outcome == BanksSyncedByHand(synced=[], errors=[])

    def test_a_draft_turned_away_for_its_version_is_on_neither_list(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        """Part of the same known fault, recorded in the plan, and
        pinned here as it stands. The checks say why the draft was
        turned away, and the administrator is told nothing of it.
        ``sync_every_bank`` lists it as failed.
        """
        turned_away = ValidationResult()
        turned_away.add_error(
            "/tmp/a-bank", "Draft module version must be 1, got 2"
        )
        _read_from(monkeypatch, bucket="a-bucket")
        monkeypatch.setattr(
            storage, "list_banks_in_gcs", lambda bucket: ["a-bank"]
        )
        bucket = _fake_the_bucket(
            monkeypatch, tmp_path, sync_returns=None, sync_found=turned_away
        )

        outcome = sync_banks_by_hand(
            db_session,
            org_unit_id=7,
            user_id=4,
            find_bank=bucket.find_bank,
            list_images=bucket.list_images,
        )

        assert outcome == BanksSyncedByHand(synced=[], errors=[])


# --- _bank_ids --------------------------------------------------------------


class TestBankIds:
    def test_the_bucket_is_listed_where_one_is_set(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        """Even with a local path set as well: the bucket comes first."""
        monkeypatch.setattr(
            storage, "list_banks_in_gcs", lambda bucket: [f"in-{bucket}"]
        )
        base = _base_with(tmp_path, good=True)

        assert _bank_ids("a-bucket", base) == ["in-a-bucket"]

    def test_a_bucket_that_cannot_be_listed_holds_no_banks(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        """And the local path is not tried in its place."""

        def refuse(bucket: str) -> list[str]:
            raise RuntimeError("no credentials")

        monkeypatch.setattr(storage, "list_banks_in_gcs", refuse)
        base = _base_with(tmp_path, good=True)

        assert _bank_ids("a-bucket", base) == []

    def test_the_local_path_is_read_where_there_is_no_bucket(
        self, tmp_path: Path
    ) -> None:
        base = _base_with(tmp_path, good=True)

        assert _bank_ids(None, base) == [GOOD]

    def test_neither_set_gives_no_banks(self) -> None:
        assert _bank_ids(None, None) == []


# --- _sync_one_bank ---------------------------------------------------------


class TestSyncOneBankFromTheFilesystem:
    def test_a_module_that_is_not_there_is_listed(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        base = _base_with(tmp_path)

        outcome = _one_from_disk(db_session, "missing-bank", base)

        assert outcome == _NotSynced(bank_id="missing-bank", error=_NOT_FOUND)

    def test_with_nowhere_to_read_from_the_module_is_not_found(
        self, db_session: Session
    ) -> None:
        outcome = _one_from_disk(db_session, "a-bank", None)

        assert outcome == _NotSynced(bank_id="a-bank", error=_NOT_FOUND)

    def test_a_module_that_fails_its_checks_is_listed_and_not_synced(
        self, db_session: Session, tmp_path: Path, organisation: OrgUnit
    ) -> None:
        base = _base_with(tmp_path, bad_module=True)

        outcome = _one_from_disk(
            db_session, BAD_MODULE, base, org_unit_id=organisation.id
        )

        assert isinstance(outcome, _NotSynced)
        assert outcome.bank_id == BAD_MODULE
        assert outcome.error
        assert db_session.scalar(select(QuestionBankSync)) is None

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
            module_checks,
            "validate_module_metadata",
            lambda module_dir: failed,
        )

        outcome = _one_from_disk(db_session, GOOD, base)

        assert outcome == _NotSynced(
            bank_id=GOOD,
            error="fault 1; fault 2; fault 3; fault 4; fault 5",
        )

    def test_a_good_module_is_synced_and_left_where_it_was(
        self,
        db_session: Session,
        tmp_path: Path,
        organisation: OrgUnit,
        administrator: User,
    ) -> None:
        base = _base_with(tmp_path, good=True)

        outcome = _one_from_disk(
            db_session,
            GOOD,
            base,
            org_unit_id=organisation.id,
            user_id=administrator.id,
        )

        assert isinstance(outcome, QuestionBankSync)
        assert outcome.status == "success"
        assert (tmp_path / "repo" / "modules" / GOOD).is_dir()

    def test_a_bank_read_from_disk_has_no_status_asked_of_the_bucket(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        base = _base_with(tmp_path, good=True)
        calls = _fake_the_sync(monkeypatch)

        _one_from_disk(db_session, GOOD, base, org_unit_id=7, user_id=4)

        assert calls.status_asked_for == []
        assert calls.sync_args == (
            _assessment_of(base, GOOD),
            7,
            4,
            db_session,
        )
        assert calls.sync_kwargs == {
            "image_inventory": None,
            "module_status": None,
        }

    def test_a_sync_that_raises_is_listed_with_what_it_said(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        base = _base_with(tmp_path, good=True)
        _fake_the_sync(monkeypatch, raises=RuntimeError("the sync fell over"))

        outcome = _one_from_disk(db_session, GOOD, base)

        assert outcome == _NotSynced(bank_id=GOOD, error="the sync fell over")

    def test_an_assessment_that_cannot_be_found_is_listed(
        self, db_session: Session, tmp_path: Path
    ) -> None:
        """The module is there and the helper that finds its assessment
        refuses. The router's helper refuses with an ``HTTPException``,
        whose own words begin with its status, and they are the reason.
        """
        base = _base_with(tmp_path, good=True)

        def refuse(bank_id: str) -> tuple[Path, bool]:
            raise HTTPException(400, "Nowhere to read from")

        outcome = _one_from_disk(db_session, GOOD, base, find_bank=refuse)

        assert outcome == _NotSynced(
            bank_id=GOOD, error="400: Nowhere to read from"
        )


class TestSyncOneBankFromTheBucket:
    def test_a_module_the_bucket_does_not_hold_is_listed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        bucket = _fake_the_bucket(monkeypatch, tmp_path, module_found=False)

        outcome = _one_from_the_bucket(db_session, bucket)

        assert outcome == _NotSynced(bank_id="a-bank", error=_NOT_FOUND)
        assert bucket.calls.found == []
        assert bucket.calls.sync_args == ()
        assert bucket.bank_dir.is_dir()

    def test_the_bucket_is_read_even_with_a_local_path_set(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        bucket = _fake_the_bucket(monkeypatch, tmp_path, module_found=False)
        base = _base_with(tmp_path, good=True)

        outcome = _one_from_the_bucket(db_session, bucket, base_path=base)

        assert outcome == _NotSynced(bank_id="a-bank", error=_NOT_FOUND)

    def test_the_record_the_sync_made_is_given(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        record = SimpleNamespace(version=3, status="success")
        bucket = _fake_the_bucket(monkeypatch, tmp_path, sync_returns=record)

        assert _one_from_the_bucket(db_session, bucket) is record

    def test_a_record_that_says_failed_is_given_like_any_other(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        """The known fault, at its source: the status is not read."""
        failed = SimpleNamespace(
            version=3,
            status="failed",
            errors=[{"path": "", "message": "no questions found"}],
        )
        bucket = _fake_the_bucket(monkeypatch, tmp_path, sync_returns=failed)

        assert _one_from_the_bucket(db_session, bucket) is failed

    def test_the_sync_is_given_the_caller_and_what_the_bucket_holds(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        bucket = _fake_the_bucket(monkeypatch, tmp_path)

        _one_from_the_bucket(db_session, bucket)

        assert bucket.calls.found == ["a-bank"]
        assert bucket.calls.images_listed == [("a-bank", True)]
        assert bucket.calls.sync_args == (bucket.bank_dir, 7, 4, db_session)
        assert bucket.calls.sync_kwargs == {
            "image_inventory": IMAGES,
            "module_status": "live",
        }
        assert bucket.calls.status_asked_for == ["a-bank"]

    def test_a_sync_that_made_no_record_gives_nothing(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        bucket = _fake_the_bucket(monkeypatch, tmp_path, sync_returns=None)

        assert _one_from_the_bucket(db_session, bucket) is None

    def test_what_was_downloaded_is_removed_after_a_sync(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        bucket = _fake_the_bucket(monkeypatch, tmp_path)

        _one_from_the_bucket(db_session, bucket)

        assert not bucket.module_dir.parent.exists()
        assert not bucket.bank_dir.parent.exists()

    def test_what_was_downloaded_is_removed_when_the_sync_raises(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        bucket = _fake_the_bucket(
            monkeypatch, tmp_path, sync_raises=RuntimeError("fell over")
        )

        outcome = _one_from_the_bucket(db_session, bucket)

        assert outcome == _NotSynced(bank_id="a-bank", error="fell over")
        assert not bucket.module_dir.parent.exists()
        assert not bucket.bank_dir.parent.exists()

    def test_the_module_is_removed_when_it_fails_its_checks(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        failed = ValidationResult()
        failed.add_error("module.yaml", "no title")
        bucket = _fake_the_bucket(monkeypatch, tmp_path, metadata=failed)

        outcome = _one_from_the_bucket(db_session, bucket)

        assert outcome == _NotSynced(bank_id="a-bank", error="no title")
        assert not bucket.module_dir.parent.exists()
        # Never downloaded, so never removed.
        assert bucket.calls.found == []
        assert bucket.bank_dir.is_dir()

    def test_a_download_that_raises_is_listed(
        self,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        tmp_path: Path,
    ) -> None:
        bucket = _fake_the_bucket(monkeypatch, tmp_path)

        def refuse(bucket_name: str, bank_id: str) -> Path:
            raise RuntimeError("bucket unreachable")

        monkeypatch.setattr(storage, "download_module_from_gcs", refuse)

        outcome = _one_from_the_bucket(db_session, bucket)

        assert outcome == _NotSynced(
            bank_id="a-bank", error="bucket unreachable"
        )
