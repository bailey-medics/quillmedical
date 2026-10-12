"""Syncing banks by hand: what an administrator asks for from their page.

Three things. A dry run of one bank, which checks it and loads nothing.
A sync of one bank. And a sync of every bank found, into the
administrator's own organisation and recorded as theirs.

**What became of a bank is decided by the deploy pipeline's code.**
That sync is ``sync_every_bank`` in ``app.features.teaching.ci_sync``.
The sync of every bank here hands each bank to that module's
``sync_one_bank``, and the sync of one bank reads what it was handed
back with that module's ``what_became_of``. So a bank counts as synced
here exactly where it does there: only where its sync was recorded as
a success. One whose assessment failed its checks, of which nothing
was loaded, is listed as failed with what the checks said. This module
once counted any record at all as a sync, and showed such a bank as
imported.

What stays this module's own: the banks go into the caller's
organisation and are recorded as the caller's, a failure is logged
under this module's logger, and the answer is this module's shape.

Finding a bank's assessment, and listing its images, are still done by
two helpers in the teaching router that other routes there use. This
module does not import them. The routes call them and hand in what they
gave, and the sync of every bank, which needs them once for each bank,
is handed the two functions themselves.

Each bank is its own checkpoint. ``sync_question_bank`` commits as it
finishes a bank, so a bank that fails later does not take back one
already recorded. Nothing is committed here.

The content store is reached through the ``storage`` and ``sync``
modules by name, never by importing a function out of them, so a test
that replaces one of their functions replaces it here. The sync of
every bank reaches it inside ``ci_sync``, through the names that module
imports, so a test of that loop replaces them there.
"""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching import ci_sync, storage
from app.features.teaching import sync as bank_sync
from app.features.teaching.ci_sync import FindBank as FindBank
from app.features.teaching.ci_sync import ImageInventory as ImageInventory
from app.features.teaching.ci_sync import ListImages as ListImages
from app.features.teaching.errors import (
    BankIdRequired,
    BankTurnedAway,
    SyncRecordedNothing,
)
from app.features.teaching.models import QuestionBankSync
from app.features.teaching.schemas import (
    ValidationMessageOut,
    ValidationResultOut,
)

logger = logging.getLogger(__name__)

#: The status of a sync record that says the bank was loaded.
_SYNC_SUCCEEDED = "success"


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


@dataclass(frozen=True)
class BankSyncedByHand:
    """What the sync of one bank answers."""

    #: The record of the sync. Where there was nothing to do, the
    #: record of the sync that loaded the version being served.
    record: QuestionBankSync
    #: Whether there was nothing to do: the bank is live and its
    #: version has not moved on, so nothing new was loaded.
    unchanged: bool


def sync_bank(
    db: Session,
    bank_path: Path,
    *,
    bank_id: str,
    downloaded: bool,
    org_unit_id: int,
    user_id: int,
    image_inventory: ImageInventory,
) -> BankSyncedByHand:
    """Sync one bank into the caller's organisation, as the caller.

    A bank whose assessment fails its checks is not refused. Its sync
    is recorded as failed, with what the checks found, and that record
    is the answer.

    A sync that made no record is one of two things, and
    ``what_became_of`` tells them apart as it does for the deploy
    pipeline. Where the checks found fault the bank was turned away,
    which is refused with what they said. Where they found none the
    bank is live and its version has not moved on: there was nothing
    to do, and the answer is the record of the sync that loaded what
    is being served, marked unchanged.

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
        The record of the sync, a success or a failure, already
        committed. Or, marked unchanged, the record of the earlier
        sync that loaded the version being served.

    Raises:
        BankTurnedAway: The sync made no record and the checks found
            fault, as with a draft whose version is not 1.
        SyncRecordedNothing: There was nothing to do, and no record
            either of the bank ever having been loaded here.
    """
    # Resolve module status for version guard
    status: str | None = None

    if downloaded:
        bucket = settings.TEACHING_GCS_BUCKET
        if bucket:
            status = storage.get_module_status_from_gcs(bucket, bank_id)

    validation, sync_record = bank_sync.sync_question_bank(
        bank_path,
        org_unit_id,
        user_id,
        db,
        image_inventory=image_inventory,
        module_status=status,
    )

    if sync_record is not None:
        return BankSyncedByHand(record=sync_record, unchanged=False)

    outcome = ci_sync.what_became_of(bank_id, validation, None)

    if isinstance(outcome, ci_sync.BankNotLoaded):
        raise BankTurnedAway(outcome.reason)

    serving = _sync_that_loaded(db, bank_id, org_unit_id)

    if serving is None:
        raise SyncRecordedNothing()

    return BankSyncedByHand(record=serving, unchanged=True)


def _sync_that_loaded(
    db: Session, bank_id: str, org_unit_id: int
) -> QuestionBankSync | None:
    """Find the newest sync that loaded a bank into an organisation."""
    return db.scalar(
        select(QuestionBankSync)
        .where(
            QuestionBankSync.org_unit_id == org_unit_id,
            QuestionBankSync.question_bank_id == bank_id,
            QuestionBankSync.status == _SYNC_SUCCEEDED,
        )
        .order_by(QuestionBankSync.id.desc())
        .limit(1)
    )


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

    #: The record of each bank whose sync succeeded, and of no other.
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

    **A bank is listed as synced only where its sync succeeded.** One
    whose assessment failed its checks, and a draft turned away for its
    version, are listed with what the checks said. A live bank whose
    version has not moved on is on neither list: there was nothing to
    load and nothing wrong. Which of these a bank is, is decided by
    ``sync_one_bank`` in ``ci_sync``, as it is for the deploy pipeline.

    Args:
        db: Core database session.
        org_unit_id: The organisation the caller administers. Every
            bank found is synced into it, whichever organisation the
            bank was written for.
        user_id: The caller, recorded as who synced each bank.
        find_bank: Finds one bank's assessment.
        list_images: Lists one bank's images.

    Returns:
        The records of the banks synced, and the banks that could not
        be synced.
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
    """Sync one bank as the caller, and say what became of it.

    The work and the decision are ``sync_one_bank`` in ``ci_sync``, the
    deploy pipeline's own. This says who is syncing and puts the
    outcome into this module's answer.

    Returns:
        The record where the sync succeeded. The bank and the reason
        where it could not be synced. None where there was nothing to
        load and nothing wrong.
    """
    outcome = ci_sync.sync_one_bank(
        db,
        bank_id,
        org_unit_id=org_unit_id,
        user_id=user_id,
        bucket=bucket,
        base_path=base_path,
        find_bank=find_bank,
        list_images=list_images,
        log=logger,
        logged_as="Failed to sync bank '%s'",
    )

    if isinstance(outcome, ci_sync.BankLoaded):
        return outcome.record

    if isinstance(outcome, ci_sync.BankNotLoaded):
        return _NotSynced(bank_id=outcome.bank_id, error=outcome.reason)

    return None
