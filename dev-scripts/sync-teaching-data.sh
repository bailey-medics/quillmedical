#!/usr/bin/env bash
# Sync all local question banks into the DB and auto-publish items.
# Called by: just sync-teaching
set -euo pipefail

docker exec quill_backend python -c "
import os, sys
sys.path.insert(0, '/app')
os.environ.setdefault('BACKEND_ENV', 'development')
from pathlib import Path
from app.config import settings
from app.db import SessionLocal
from app.features.teaching.sync import sync_question_bank
from app.features.teaching.models import QuestionBankItem
from app.models import OrganisationFeature, User
from sqlalchemy import select

base = settings.TEACHING_QUESTION_BANK_PATH
if not base or not Path(base).is_dir():
    print('No question banks found (TEACHING_QUESTION_BANK_PATH not set or missing)')
    sys.exit(1)

db = SessionLocal()
try:
    # Find a teaching-enabled org
    feat = db.execute(
        select(OrganisationFeature).where(
            OrganisationFeature.feature_key == 'teaching'
        )
    ).scalars().first()
    if not feat:
        print('No organisation has teaching enabled. Run: just seed-teaching')
        sys.exit(1)
    org_id = feat.organisation_id

    # Find any admin/superadmin user for audit
    user = db.execute(
        select(User).where(
            User.system_permissions.in_(['admin', 'superadmin'])
        )
    ).scalars().first()
    if not user:
        print('No admin user found')
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
        db.commit()
        print(f'  Synced and published {len(items)} items')
        synced += 1
    print(f'Done: {synced} bank(s) synced')
finally:
    db.close()
"
