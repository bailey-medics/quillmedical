#!/usr/bin/env bash
# Sync all local question banks into the DB, auto-publish items and serve
# the newest synced version (local dev only; production promotes by hand).
# Called by: just sync-teaching
set -euo pipefail

docker exec quill_backend python -c "
import os, sys
sys.path.insert(0, '/app')
os.environ.setdefault('BACKEND_ENV', 'development')
from pathlib import Path
from app.config import settings
from app.db import CoreSessionLocal
from app.features.teaching.sync import sync_question_bank
from datetime import UTC, datetime
from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankOrgStatus,
)
from app.models import OrgUnitFeature, User
from sqlalchemy import func, select

base = settings.TEACHING_QUESTION_BANK_PATH
if not base or not Path(base).is_dir():
    print('No question banks found (TEACHING_QUESTION_BANK_PATH not set or missing)')
    sys.exit(1)

db = CoreSessionLocal()
try:
    # Find a teaching-enabled org
    feat = db.execute(
        select(OrgUnitFeature).where(
            OrgUnitFeature.feature_key == 'teaching'
        )
    ).scalars().first()
    if not feat:
        print('No organisation has teaching enabled. Run: just seed-teaching')
        sys.exit(1)
    org_id = feat.org_unit_id

    # Find a Quill operator to record as having run the sync
    user = db.execute(
        select(User).where(User.platform_role == 'superadmin')
    ).scalars().first()
    if not user:
        print('No superadmin user found')
        sys.exit(1)

    synced = 0
    from app.features.teaching.storage import discover_local_banks, resolve_local_bank
    bank_ids = discover_local_banks(base)
    for bank_id in bank_ids:
        bank_dir = resolve_local_bank(base, bank_id)
        if not bank_dir:
            continue
        print(f'Syncing {bank_id}...')
        result, sync_record = sync_question_bank(bank_dir, org_id, user.id, db)
        if not result.is_valid:
            for e in result.errors:
                print(f'  ERROR: {e.path}: {e.message}')
            continue
        # Auto-publish items
        items = db.execute(
            select(QuestionBankItem).where(
                QuestionBankItem.question_bank_id == bank_id,
                QuestionBankItem.status == 'draft',
            )
        ).scalars().all()
        for item in items:
            item.status = 'published'

        # Local dev only: serve the newest synced version at once, as the
        # items above are published at once, so an edit shows on the next
        # reload. In production advancing a version is a separate,
        # deliberate act. A bank not yet switched on for the organisation
        # has no status row, and is left that way.
        newest = db.execute(
            select(func.max(QuestionBankConfig.version)).where(
                QuestionBankConfig.org_unit_id == org_id,
                QuestionBankConfig.question_bank_id == bank_id,
            )
        ).scalar_one_or_none()
        status = db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.org_unit_id == org_id,
                QuestionBankOrgStatus.question_bank_id == bank_id,
            )
        ).scalars().first()
        if status and newest is not None and status.active_version != newest:
            print(f'  Now serving version {newest}, was {status.active_version}')
            status.active_version = newest
            status.active_version_set_by = user.id
            status.active_version_set_at = datetime.now(UTC)
        db.commit()
        print(f'  Synced and published {len(items)} items')
        synced += 1
    print(f'Done: {synced} bank(s) synced')
finally:
    db.close()
"
