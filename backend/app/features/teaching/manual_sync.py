"""Syncing banks by hand: what an administrator asks for from their page.

Three things. A dry run of one bank, which checks it and loads nothing.
A sync of one bank. And a sync of every bank found, into the
administrator's own organisation and recorded as theirs.

**The sync of every bank is not the deploy pipeline's.** That one is
``sync_every_bank`` in ``app.features.teaching.ci_sync``. The two walk
the same banks in the same steps and then part: the pipeline's counts a
bank as synced only where its sync was recorded as a success, and this
one counts any record at all. So a bank whose assessment failed its
checks, of which nothing was loaded, is listed here under ``synced``.
That is a known fault, written into
``docs/docs/plans/2026-10-11-thin-routes-and-steady-frontend-tests-plan.md``
for a decision, and it is kept here exactly as the route had it.
Nothing is shared between the two modules, so neither can change what
the other answers.

Finding a bank's assessment, and listing its images, are still done by
two helpers in the teaching router that other routes there use. This
module does not import them. The routes call them and hand in what they
gave, and the sync of every bank, which needs them once for each bank,
is handed the two functions themselves.

Each bank is its own checkpoint. ``sync_question_bank`` commits as it
finishes a bank, so a bank that fails later does not take back one
already recorded. Nothing is committed here.

The content store is reached through the ``storage``, ``sync`` and
``tooling.validate`` modules by name, never by importing a function out
of them, so a test that replaces one of their functions replaces it
here.
"""

from __future__ import annotations

import logging
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching import storage
from app.features.teaching import sync as bank_sync
from app.features.teaching.errors import BankIdRequired, SyncRecordedNothing
from app.features.teaching.models import QuestionBankSync
from app.features.teaching.schemas import (
    ValidationMessageOut,
    ValidationResultOut,
)
from app.features.teaching.tooling import validate as module_checks

logger = logging.getLogger(__name__)

#: What a bank's images are checked against: item folder to file names.
#: None where the bank was read from disk, and its images are there.
ImageInventory = dict[str, set[str]] | None

#: Finds one bank's assessment. Gives its directory, and whether that
#: directory was downloaded and is the caller's to remove.
FindBank = Callable[[str], tuple[Path, bool]]

#: Lists one bank's images, given whether the bank was downloaded.
ListImages = Callable[[str, bool], ImageInventory]

#: How many of a module's faults are given.
_FAULTS_GIVEN = 5

_MODULE_NOT_FOUND = (
    "module directory not found - cannot validate module metadata"
)


def bank_named_in(body: dict[str, str]) -> str:
    """Return the bank a sync or a dry run was asked for.

    Args:
        body: The request body, as sent.

    Returns:
        The ``bank_id`` it names. Nothing is asked of it here: whether
        it can be an id, and whether there is such a bank, are asked by
        whatever looks for it.

    Raises:
        BankIdRequired: The body names no bank, or an empty one.
    """
    bank_id = body.get("bank_id", "")

    if not bank_id:
        raise BankIdRequired()

    return bank_id


def check_bank(
    db: Session,
    bank_path: Path,
    *,
    org_unit_id: int,
    user_id: int,
    image_inventory: ImageInventory,
) -> ValidationResultOut:
    """Check one bank's assessment and load nothing of it.

    Args:
        db: Core database session.
        bank_path: The directory holding the bank's assessment.
        org_unit_id: The organisation the caller administers.
        user_id: The caller.
        image_inventory: The bank's images where it was read from the
            bucket, or None.

    Returns:
        What the checks found, valid or not. Nobody is refused: a bank
        that fails its checks is an answer, not an error.
    """
    result, _ = bank_sync.sync_question_bank(
        bank_path,
        org_unit_id,
        user_id,
        db,
        validate_only=True,
        image_inventory=image_inventory,
    )

    return ValidationResultOut(
        bank_id=result.bank_id,
        version=result.version,
        is_valid=result.is_valid,
        errors=[
            ValidationMessageOut(path=e.path, message=e.message)
            for e in result.errors
        ],
        warnings=[
            ValidationMessageOut(path=w.path, message=w.message)
            for w in result.warnings
        ],
        item_count=result.item_count,
        summary=result.summary(),
    )


def sync_bank(
    db: Session,
    bank_path: Path,
    *,
    bank_id: str,
    downloaded: bool,
    org_unit_id: int,
    user_id: int,
    image_inventory: ImageInventory,
) -> QuestionBankSync:
    """Sync one bank into the caller's organisation, as the caller.

    A bank whose assessment fails its checks is not refused. Its sync
    is recorded as failed, with what the checks found, and that record
    is the answer.

    Args:
        db: Core database session.
        bank_path: The directory holding the bank's assessment.
        bank_id: The question bank.
        downloaded: Whether *bank_path* was downloaded from the bucket.
            Where it was, the module's status is asked of the bucket
            too. Otherwise the sync reads it from disk.
        org_unit_id: The organisation the caller administers.
        user_id: The caller, recorded as who synced it.
        image_inventory: The bank's images where it was read from the
            bucket, or None.

    Returns:
        The record of the sync, a success or a failure. It is already
        committed.

    Raises:
        SyncRecordedNothing: The sync made no record. That is a draft
            turned away for its version, and it is also a live bank
            whose version has not moved on, which is no failure.
    """
    # Resolve module status for version guard
    status: str | None = None

    if downloaded:
        bucket = settings.TEACHING_GCS_BUCKET
        if bucket:
            status = storage.get_module_status_from_gcs(bucket, bank_id)

    _validation, sync_record = bank_sync.sync_question_bank(
        bank_path,
        org_unit_id,
        user_id,
        db,
        image_inventory=image_inventory,
        module_status=status,
    )

    if sync_record is None:
        raise SyncRecordedNothing()

    return sync_record


def discard_download(bank_path: Path, downloaded: bool) -> None:
    """Remove a bank that was downloaded to be checked or synced.

    A bank read from the content path on disk is left where it is. A
    download sits in a temporary directory of its own, and it is that
    directory which goes. Failing to remove it is not reported.
    """
    if downloaded:
        shutil.rmtree(bank_path.parent, ignore_errors=True)


@dataclass(frozen=True)
class BanksSyncedByHand:
    """What the sync of every bank answers."""

    #: The record of each bank whose sync made one, a failed one
    #: included.
    synced: list[QuestionBankSync]
    #: Each bank that could not be synced: its ``bank_id`` and the
    #: ``error``.
    errors: list[dict[str, str]]


@dataclass(frozen=True)
class _NotSynced:
    """One bank that could not be synced, and why."""

    bank_id: str
    error: str


def sync_banks_by_hand(
    db: Session,
    *,
    org_unit_id: int,
    user_id: int,
    find_bank: FindBank,
    list_images: ListImages,
) -> BanksSyncedByHand:
    """Sync every bank found in the bucket, or else on the filesystem.

    Where the banks are read from is the deployment's own setting: the
    bucket where one is set, and otherwise the local path. A bucket
    that cannot be listed is logged and read as holding no banks. With
    no banks, both lists are empty.

    Nothing here refuses. A bank that cannot be synced is listed with
    the reason and the next bank is tried.

    **A bank whose sync made a record is listed as synced, whatever the
    record says.** One whose assessment failed its checks is among
    them, with nothing of it loaded: the known fault this module's
    docstring describes. A bank whose sync made no record is on neither
    list, a draft turned away for its version included.

    Args:
        db: Core database session.
        org_unit_id: The organisation the caller administers. Every
            bank found is synced into it, whichever organisation the
            bank was written for.
        user_id: The caller, recorded as who synced each bank.
        find_bank: Finds one bank's assessment.
        list_images: Lists one bank's images.

    Returns:
        The records made and the banks that could not be synced.
    """
    bucket = settings.TEACHING_GCS_BUCKET
    base_path = settings.TEACHING_QUESTION_BANK_PATH
    synced: list[QuestionBankSync] = []
    errors: list[dict[str, str]] = []

    for bank_id in _bank_ids(bucket, base_path):
        outcome = _sync_one_bank(
            db,
            bank_id,
            org_unit_id=org_unit_id,
            user_id=user_id,
            bucket=bucket,
            base_path=base_path,
            find_bank=find_bank,
            list_images=list_images,
        )
        if isinstance(outcome, _NotSynced):
            errors.append({"bank_id": outcome.bank_id, "error": outcome.error})
        elif outcome:
            synced.append(outcome)

    return BanksSyncedByHand(synced=synced, errors=errors)


def _bank_ids(bucket: str | None, base_path: str | None) -> list[str]:
    """Find the banks there are to sync.

    The bucket where one is set, and the local path is not tried in its
    place when the bucket cannot be listed.
    """
    if bucket:
        try:
            return storage.list_banks_in_gcs(bucket)
        except Exception:
            logger.exception("Failed to list GCS banks")
            return []

    if base_path:
        return storage.discover_local_banks(base_path)

    return []


def _sync_one_bank(
    db: Session,
    bank_id: str,
    *,
    org_unit_id: int,
    user_id: int,
    bucket: str | None,
    base_path: str | None,
    find_bank: FindBank,
    list_images: ListImages,
) -> QuestionBankSync | _NotSynced | None:
    """Check one bank's module and sync its assessment.

    Anything that goes wrong is caught, logged and handed back as the
    reason, in the exception's own words, so the banks after this one
    are still tried. Whatever was downloaded to check or to sync is
    removed again either way.

    Returns:
        The record where the sync made one, whatever its status. The
        bank and the reason where it could not be synced. None where
        the sync made no record.
    """
    bank_path: Path | None = None
    is_temp = False
    tooling_module_dir: Path | None = None
    tooling_is_temp = False

    try:
        # Module metadata and learning content. The assessment is
        # validated inside sync_question_bank against the GCS
        # inventory, which a module directory cannot supply - together
        # the two cover everything exactly once.
        if base_path and not bucket:
            tooling_module_dir = storage.resolve_module_dir(base_path, bank_id)
        elif bucket:
            tooling_module_dir = storage.download_module_from_gcs(
                bucket, bank_id
            )
            tooling_is_temp = tooling_module_dir is not None

        if not tooling_module_dir:
            # No module directory found - block sync for safety
            return _NotSynced(bank_id=bank_id, error=_MODULE_NOT_FOUND)

        metadata = module_checks.validate_module_metadata(tooling_module_dir)

        if not metadata.is_valid:
            msg = "; ".join(e.message for e in metadata.errors[:_FAULTS_GIVEN])

            return _NotSynced(bank_id=bank_id, error=msg)

        bank_path, is_temp = find_bank(bank_id)
        inventory = list_images(bank_id, is_temp)

        # Resolve module status for version guard
        status: str | None = None
        if is_temp and bucket:
            status = storage.get_module_status_from_gcs(bucket, bank_id)

        _validation, sync_record = bank_sync.sync_question_bank(
            bank_path,
            org_unit_id,
            user_id,
            db,
            image_inventory=inventory,
            module_status=status,
        )

        return sync_record
    except Exception as exc:
        logger.exception("Failed to sync bank '%s'", bank_id)

        return _NotSynced(bank_id=bank_id, error=str(exc))
    finally:
        if is_temp and bank_path:
            shutil.rmtree(bank_path.parent, ignore_errors=True)
        if tooling_is_temp and tooling_module_dir:
            shutil.rmtree(tooling_module_dir.parent, ignore_errors=True)
