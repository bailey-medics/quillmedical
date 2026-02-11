# Hazard

**Hazard id:** Hazard-0047

**Hazard name:** Database migrations run without backup validation

**Description:** Alembic migrations run automatically on `alembic upgrade head` without prompting for database backup verification, risking data loss if migration fails mid-operation.

**Causes:**

- No pre-migration hook to check for recent database backup
- No warning displayed to operator before destructive migrations
- Migration rollback (downgrade) functions rarely tested and may fail

**Effect:**
Migration fails mid-operation leaving database in inconsistent state, or downgrade fails preventing rollback.

**Hazard:**
Clinical system unusable until database restored from backup. If backup is stale or missing, recent patient data may be lost permanently.

**Hazard controls:**

### Design controls (manufacturer)

- Add pre-migration backup check to Justfile migrate command: before running alembic upgrade, execute script that verifies database backup exists and is recent (<24 hours old). Script queries backup system API or checks backup file timestamps. If no recent backup found, display error: "No recent backup found. Create backup before running migration: just backup-db" and exit. Require operator to create backup manually before migration.
- Implement automatic backup before migration: update just migrate command to automatically run just backup-db first. Backup command uses pg_dump to create timestamped backup file: backup_YYYY-MM-DD_HH-MM-SS.sql. Store backup in /backups volume or S3 bucket. Migration only proceeds after backup succeeds.
- Add migration safety classification: annotate each migration with # SAFETY: NON_DESTRUCTIVE or # SAFETY: DESTRUCTIVE comment. Destructive migrations (DROP TABLE, DELETE WHERE, etc.) require operator confirmation: "This migration is DESTRUCTIVE. Type 'CONFIRM' to proceed:". Non-destructive migrations (ADD COLUMN, CREATE INDEX) proceed without confirmation.
- Implement migration transaction wrapping: ensure all migrations wrapped in database transaction (BEGIN; ... COMMIT;). If migration fails, transaction automatically rolled back (database returns to pre-migration state). Add to alembic env.py: with context.begin_transaction() ensures transaction wrapping.
- Test downgrade functions in CI: add CI test that runs each migration (upgrade), then immediately downgrades (downgrade). Verifies rollback works. CI fails if any downgrade function raises error or leaves database in inconsistent state.

### Testing controls (manufacturer)

- Backup verification test: Run just migrate without recent backup. Assert command exits with error "No recent backup found." Create backup (just backup-db). Run just migrate. Assert migration proceeds.
- Destructive migration test: Create migration with DROP TABLE statement, annotate with # SAFETY: DESTRUCTIVE. Run migration. Assert operator prompted for confirmation. Provide incorrect input (not 'CONFIRM'). Assert migration aborted. Provide 'CONFIRM'. Assert migration proceeds.
- Transaction rollback test: Create migration that deliberately fails mid-operation (e.g., add column, then raise exception). Run migration. Assert migration fails. Query database. Assert database unchanged (transaction rolled back). Verify no partially-applied migration state.
- Downgrade test (CI): For each migration, CI runs: alembic upgrade +1, check database state matches expected, alembic downgrade -1, check database reverted to previous state. Assert all downgrades succeed without errors.
- Backup restoration test: Create database backup. Run destructive migration. Simulate migration failure (database corrupted). Restore from backup (just restore-db). Verify database restored to pre-migration state with all data intact.

### Training controls (deployment)

- Train operations team on migration safety: always create backup before migration, understand destructive vs non-destructive migrations, test migrations in staging before production, keep backup for 7 days after migration.
- Document migration rollback procedure: if migration fails, restore from backup: just restore-db <backup_file>. If backup unavailable, attempt downgrade: alembic downgrade -1. If downgrade fails, contact database administrator for manual recovery.

### Business process controls (deployment)

- Migration approval policy: All production migrations require approval from two reviewers: database administrator + senior developer. Reviewers check: downgrade function implemented, migration safety classification correct, destructive operations justified, rollback procedure documented.
- Backup retention: Database backups retained for 30 days minimum. After migration, keep pre-migration backup for 7 days (allows rollback if migration issues discovered later). Automate backup cleanup after retention period.
- Staging testing: All migrations tested in staging environment first. Staging database is copy of production data (anonymized). Run migration in staging, verify success, test application functionality, then run in production. Never run untested migration in production.
- Migration monitoring: Monitor migration duration. Migrations taking >5 minutes trigger alert (long-running migrations increase risk of failure). Investigate slow migrations, optimize if possible (e.g., add indexes before data migration). Cancel migration if exceeds 30-minute timeout.
- Incident response: If migration fails in production, immediately restore from backup. Estimated restoration time: 15 minutes. Notify clinicians of system downtime. Investigate migration failure cause. Fix migration code. Re-test in staging. Attempt production migration again with improved code.

**Hazard types:**

- DataLoss
- SystemUnavailable

**Harm:**
Recent patient data lost including clinical notes, medication changes, lab results. Patient receives incorrect treatment due to missing clinical information. Potential for serious harm if critical information (new allergies, medication contraindications) documented in lost data.

**Code associated with hazard:**

- `backend/alembic/env.py`
- `backend/alembic/versions/*.py`
- `Justfile`
