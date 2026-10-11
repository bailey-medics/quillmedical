"""The sync the deploy pipeline asks for: every bank, with no user.

A content deploy uploads the modules and then asks for them to be
synced. Nobody is signed in, so each sync is recorded as the deploy
pipeline's own. This module finds the banks, chooses where they are
held, and syncs them one at a time.

Nothing here refuses. A bank that cannot be synced is not a reason to
stop: it is listed with the reason and the next bank is tried, so one
answer says which banks went in and which did not. The route decides
what status that answer is sent with.

Each bank is its own checkpoint. ``sync_question_bank`` commits as it
finishes a bank, so a bank that fails later does not take back one
already recorded. Nothing is committed here.

Checking the pipeline's token is not here either. That is a question
about the request, and the route answers it before calling this.
"""

import logging
import shutil
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching.models import QuestionBankConfig
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
from app.features.teaching.tooling.validate import validate_module_metadata
from app.models import OrgUnit
from app.org_units import ROOT_TYPE_IDS

logger = logging.getLogger(__name__)


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
    """Check one bank's module and sync its assessment.

    Anything that goes wrong is caught, logged and handed back as the
    reason, so the banks after this one are still tried. Whatever was
    downloaded to check or to sync is removed again either way.

    Returns:
        The bank and its version where a sync was recorded, the bank
        and the reason where it could not be synced, and None where the
        sync recorded nothing: a live bank whose version has not moved
        on, for one.
    """
    # The two helpers still live in the teaching router, which is where
    # its own sync routes use them. Imported here, not at the top, so
    # this module does not load the router merely by being imported.
    from app.features.teaching.router import (
        _build_image_inventory,
        _resolve_bank_path_or_gcs,
    )

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
            return CiSyncErrorItem(
                bank_id=bank_id,
                error=(
                    "module directory not found - "
                    "cannot validate module metadata"
                ),
            )

        metadata = validate_module_metadata(tooling_module_dir)

        if not metadata.is_valid:
            msg = "; ".join(e.message for e in metadata.errors[:5])
            return CiSyncErrorItem(bank_id=bank_id, error=msg)

        bank_path, is_temp = _resolve_bank_path_or_gcs(bank_id)
        inventory = _build_image_inventory(bank_id, is_temp)

        # Resolve module status for version guard
        status: str | None = None
        if is_temp and bucket:
            status = get_module_status_from_gcs(bucket, bank_id)

        _validation, sync_record = sync_question_bank(
            bank_path,
            org_unit_id,
            # No user: the deploy pipeline did this. Recorded as
            # synced_by_actor="deploy_bot" rather than a fabricated id -
            # 0 was passed here and violated the users foreign key, so
            # every CI sync failed while the endpoint still returned 200.
            None,
            db,
            image_inventory=inventory,
            module_status=status,
        )

        if not sync_record:
            return None

        return CiSyncBankResult(
            bank_id=bank_id, version=str(sync_record.version)
        )
    except Exception as exc:
        logger.exception("CI sync: failed to sync bank '%s'", bank_id)

        return CiSyncErrorItem(bank_id=bank_id, error=str(exc))
    finally:
        if is_temp and bank_path:
            shutil.rmtree(bank_path.parent, ignore_errors=True)
        if tooling_is_temp and tooling_module_dir:
            shutil.rmtree(tooling_module_dir.parent, ignore_errors=True)
