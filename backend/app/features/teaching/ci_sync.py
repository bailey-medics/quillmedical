"""The sync the deploy pipeline asks for: every bank, with no user.

A content deploy uploads the modules and then asks for them to be
synced. Nobody is signed in, so each sync is recorded as the deploy
pipeline's own. This module finds the banks, chooses where they are
held, and syncs them one at a time.

Nothing here refuses. A bank that cannot be synced is not a reason to
stop: it is listed with the reason and the next bank is tried, so one
answer says which banks went in and which did not. The route decides
what status that answer is sent with.

A bank counts as synced only where its sync was recorded as a success.
One whose assessment failed its checks has a record too, but nothing of
it was loaded, so it is listed as failed with what the checks said.

Each bank is its own checkpoint. ``sync_question_bank`` commits as it
finishes a bank, so a bank that fails later does not take back one
already recorded. Nothing is committed here.

Checking the pipeline's token is not here either. That is a question
about the request, and the route answers it before calling this.

**What became of one bank is decided here, for an administrator's own
sync as well.** ``sync_one_bank`` checks a bank's module and syncs its
assessment, and ``what_became_of`` reads what the sync handed back.
``app.features.teaching.manual_sync`` calls both, so the two syncs
cannot come to count a bank differently. Each says for itself who is
syncing and into which organisation, how a bank's assessment is found,
which logger a failure is written to, and what its own answer looks
like.
"""

import logging
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankSync,
)
from app.features.teaching.schemas import (
    CiSyncBankResult,
    CiSyncErrorItem,
    CiTeachingSyncOut,
)
from app.features.teaching.storage import (
    discover_local_banks,
    download_module_from_gcs,
    get_module_status_from_gcs,
    list_banks_in_gcs,
    resolve_module_dir,
)
from app.features.teaching.sync import sync_question_bank
from app.features.teaching.tooling.validate import (
    ValidationResult,
    validate_module_metadata,
)
from app.models import OrgUnit
from app.org_units import ROOT_TYPE_IDS

logger = logging.getLogger(__name__)

#: The one status of a sync record that says the bank was loaded. Any
#: other is read as a failure, so a status added later is not taken for
#: a success by default.
_SYNC_SUCCEEDED = "success"

#: How many of a bank's faults are given. The rest are in its record.
_FAULTS_GIVEN = 5

_NO_REASON_RECORDED = "the sync did not succeed and recorded no reason"

_MODULE_NOT_FOUND = (
    "module directory not found - cannot validate module metadata"
)

#: What a bank's images are checked against: item folder to file names.
#: None where the bank was read from disk, and its images are there.
ImageInventory = dict[str, set[str]] | None

#: Finds one bank's assessment. Gives its directory, and whether that
#: directory was downloaded and is the caller's to remove.
FindBank = Callable[[str], tuple[Path, bool]]

#: Lists one bank's images, given whether the bank was downloaded.
ListImages = Callable[[str, bool], ImageInventory]


@dataclass(frozen=True)
class BankLoaded:
    """One bank whose sync succeeded, and the record of it."""

    record: QuestionBankSync


@dataclass(frozen=True)
class BankNotLoaded:
    """One bank that could not be synced, and why."""

    bank_id: str
    reason: str


def sync_every_bank(db: Session) -> CiTeachingSyncOut:
    """Sync every bank found in the bucket, or else on the filesystem.

    Where the banks are read from is the deployment's own setting, as
    it is for the rest of teaching storage: the bucket where one is
    set, and otherwise the local path.

    Args:
        db: Core database session.

    Returns:
        The banks synced and the banks that could not be, each with its
        reason. ``message`` is set, and both lists are empty, where
        there was nothing to sync or nowhere to sync it into.
    """
    bucket = settings.TEACHING_GCS_BUCKET
    base_path = settings.TEACHING_QUESTION_BANK_PATH
    bank_ids = _bank_ids(bucket, base_path)

    if not bank_ids:
        return CiTeachingSyncOut(
            synced=[], errors=[], message="No banks found"
        )

    org_unit_id = _org_unit_to_sync_into(db)

    if org_unit_id is None:
        return CiTeachingSyncOut(
            synced=[],
            errors=[],
            message="No organisation to sync into",
        )

    synced: list[CiSyncBankResult] = []
    errors: list[CiSyncErrorItem] = []

    for bank_id in bank_ids:
        outcome = _sync_one_bank(db, bank_id, org_unit_id, bucket, base_path)
        if isinstance(outcome, CiSyncBankResult):
            synced.append(outcome)
        elif isinstance(outcome, CiSyncErrorItem):
            errors.append(outcome)

    return CiTeachingSyncOut(synced=synced, errors=errors)


def _bank_ids(bucket: str | None, base_path: str | None) -> list[str]:
    """Find the banks there are to sync.

    A bucket that cannot be listed is logged and read as holding no
    banks, so the answer is "No banks found" and not a failure.
    """
    if bucket:
        try:
            return list_banks_in_gcs(bucket)
        except Exception:
            logger.exception("CI sync: failed to list GCS banks")
            return []

    if base_path:
        return discover_local_banks(base_path)

    return []


def _org_unit_to_sync_into(db: Session) -> int | None:
    """Choose the org unit the banks are held by.

    Returns:
        The org unit an existing bank is already held by, or else the
        first organisation in the system. None where there is neither.
    """
    # It used to fall back to the literal 1, which was a guess that
    # happened to be right while organisations were numbered from one
    # and nothing else shared their numbering. Teaching answers in
    # org_unit ids now, where 1 may well be a ward.
    existing_config = db.execute(
        select(QuestionBankConfig).limit(1)
    ).scalar_one_or_none()

    if existing_config:
        return existing_config.org_unit_id

    return db.scalar(
        select(OrgUnit.id)
        .where(OrgUnit.type.in_(ROOT_TYPE_IDS))
        .order_by(OrgUnit.id)
        .limit(1)
    )


def _sync_one_bank(
    db: Session,
    bank_id: str,
    org_unit_id: int,
    bucket: str | None,
    base_path: str | None,
) -> CiSyncBankResult | CiSyncErrorItem | None:
    """Sync one bank as the deploy pipeline, and say what became of it.

    The work and the decision are ``sync_one_bank``. This says who is
    syncing and puts the outcome into the pipeline's own answer.

    Returns:
        The bank and its version where its sync succeeded, the bank and
        the reason where it could not be synced, and None where there
        was nothing to load and nothing wrong: a live bank whose
        version has not moved on.
    """
    # The two helpers still live in the teaching router, which is where
    # its own sync routes use them. Imported here, not at the top, so
    # this module does not load the router merely by being imported.
    from app.features.teaching.router import (
        _build_image_inventory,
        _resolve_bank_path_or_gcs,
    )

    outcome = sync_one_bank(
        db,
        bank_id,
        org_unit_id=org_unit_id,
        # No user: the deploy pipeline did this. Recorded as
        # synced_by_actor="deploy_bot" rather than a fabricated id -
        # 0 was passed here and violated the users foreign key, so
        # every CI sync failed while the endpoint still returned 200.
        user_id=None,
        bucket=bucket,
        base_path=base_path,
        find_bank=_resolve_bank_path_or_gcs,
        list_images=_build_image_inventory,
        log=logger,
        logged_as="CI sync: failed to sync bank '%s'",
    )

    if isinstance(outcome, BankLoaded):
        return CiSyncBankResult(
            bank_id=bank_id, version=str(outcome.record.version)
        )

    if isinstance(outcome, BankNotLoaded):
        return CiSyncErrorItem(bank_id=outcome.bank_id, error=outcome.reason)

    return None


def sync_one_bank(
    db: Session,
    bank_id: str,
    *,
    org_unit_id: int,
    user_id: int | None,
    bucket: str | None,
    base_path: str | None,
    find_bank: FindBank,
    list_images: ListImages,
    log: logging.Logger,
    logged_as: str,
) -> BankLoaded | BankNotLoaded | None:
    """Check one bank's module, sync its assessment, say what became of it.

    The one place a bank is synced as part of a sync of every bank,
    whoever asked for it: the deploy pipeline or an administrator.

    Anything that goes wrong is caught, logged and handed back as the
    reason, in the exception's own words, so the banks after this one
    are still tried. Whatever was downloaded to check or to sync is
    removed again either way.

    Args:
        db: Core database session.
        bank_id: The question bank.
        org_unit_id: The organisation the bank is synced into.
        user_id: Who is syncing, or None for the deploy pipeline.
        bucket: The bucket the banks are read from, where one is set.
        base_path: The local path they are read from otherwise.
        find_bank: Finds the bank's assessment.
        list_images: Lists the bank's images.
        log: The caller's own logger, which a failure is written to.
        logged_as: The words it is logged under, with one ``%s`` for
            the bank.

    Returns:
        The record where the sync succeeded, the bank and the reason
        where it could not be synced, and None where there was nothing
        to load and nothing wrong.
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
            tooling_module_dir = resolve_module_dir(base_path, bank_id)
        elif bucket:
            tooling_module_dir = download_module_from_gcs(bucket, bank_id)
            tooling_is_temp = tooling_module_dir is not None

        if not tooling_module_dir:
            # No module directory found - block sync for safety
            return BankNotLoaded(bank_id=bank_id, reason=_MODULE_NOT_FOUND)

        metadata = validate_module_metadata(tooling_module_dir)

        if not metadata.is_valid:
            return BankNotLoaded(
                bank_id=bank_id,
                reason=_first_few([e.message for e in metadata.errors]),
            )

        bank_path, is_temp = find_bank(bank_id)
        inventory = list_images(bank_id, is_temp)

        # Resolve module status for version guard
        status: str | None = None
        if is_temp and bucket:
            status = get_module_status_from_gcs(bucket, bank_id)

        validation, sync_record = sync_question_bank(
            bank_path,
            org_unit_id,
            user_id,
            db,
            image_inventory=inventory,
            module_status=status,
        )

        return what_became_of(bank_id, validation, sync_record)
    except Exception as exc:
        log.exception(logged_as, bank_id)

        return BankNotLoaded(bank_id=bank_id, reason=str(exc))
    finally:
        if is_temp and bank_path:
            shutil.rmtree(bank_path.parent, ignore_errors=True)
        if tooling_is_temp and tooling_module_dir:
            shutil.rmtree(tooling_module_dir.parent, ignore_errors=True)


def what_became_of(
    bank_id: str,
    validation: ValidationResult,
    sync_record: QuestionBankSync | None,
) -> BankLoaded | BankNotLoaded | None:
    """Read what the sync of one bank handed back.

    The rule for what counts as synced, and it is written once. A bank
    is loaded only where its record says so.

    Args:
        bank_id: The question bank.
        validation: What the checks found.
        sync_record: The record the sync made, if it made one.

    Returns:
        The record where the sync succeeded, the bank and the reason
        where it was turned away or failed, and None where there was
        nothing to load and nothing wrong: a live bank whose version
        has not moved on.
    """
    if not sync_record:
        # No record is right for a live bank whose version has not
        # moved on: there is nothing new to load. It is wrong where
        # the checks found fault, as they do with a draft whose
        # version is not 1. That is turned away, not skipped, and
        # whoever asked has to hear of it.
        if not validation.is_valid:
            return BankNotLoaded(
                bank_id=bank_id,
                reason=_first_few(
                    [fault.message for fault in validation.errors]
                ),
            )

        return None

    # Only a success loaded anything. A record is also kept of a
    # sync whose assessment failed its checks, and it was once
    # taken for a sync, so the pipeline went green on content that
    # never went in.
    if sync_record.status != _SYNC_SUCCEEDED:
        return BankNotLoaded(
            bank_id=bank_id,
            reason=_first_few(_faults_recorded(sync_record))
            or _NO_REASON_RECORDED,
        )

    return BankLoaded(record=sync_record)


def _first_few(faults: list[str]) -> str:
    """Join the first few faults into one reason."""
    return "; ".join(faults[:_FAULTS_GIVEN])


def _faults_recorded(sync_record: QuestionBankSync) -> list[str]:
    """What a failed sync's record says was wrong, a line for each fault.

    These are the checks' own findings about the content, written for
    whoever wrote it. The path beside each is left out, as it is for a
    module that fails its checks: for a bank read from the bucket it
    begins with the folder the server downloaded it into.
    """
    return [str(fault.get("message", "")) for fault in sync_record.errors]
