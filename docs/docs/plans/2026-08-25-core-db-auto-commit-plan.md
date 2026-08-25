# Core DB auto-commit plan

`get_core_db()` (`backend/app/db/core_db.py`) never commits — every route
must remember to call `db.commit()` itself, or the write silently
vanishes when the session closes at the end of the request. For a
clinical app this is a real safety risk: a doctor could see a
successful response for a prescription that was never actually saved.
Make commit automatic on success and rollback automatic on failure, so
persistence and a successful response become the same event. While
doing this, also audit and clean up the 57 existing explicit
`db.commit()` call sites across the codebase — most become redundant
once the dependency auto-commits, and this is the one point of human
review this change will realistically get, so the cleanup is folded in
now rather than deferred to a "later" pass that won't happen.

## Phase 1: Update `get_core_db()`

- [x] Change `backend/app/db/core_db.py`'s `get_core_db()` to commit
      after a successful `yield` and roll back on any exception, before
      the existing `finally: db.close()`:

  ```python
  def get_core_db() -> Generator[Session]:
      db = CoreSessionLocal()
      try:
          yield db
          db.commit()
      except Exception:
          db.rollback()
          raise
      finally:
          db.close()
  ```

- [x] Update the function's docstring to describe the new auto-commit /
      auto-rollback behaviour (replacing the current "caller is
      responsible for committing" caveat), and keep the `select()` /
      `db.add()` + `db.commit()` examples — the explicit commit in the
      `POST` example stays valid and harmless (a no-op second commit)
- [x] Update Claude's rules md file with this updated practice.

## Phase 2: Reduce redundant `db.commit()` call sites

An agent audited all 57 existing explicit `db.commit()` call sites and
classified each into one of three buckets, based on what the enclosing
function does immediately before/after the commit:

- **Bucket 1 — redundant, delete.** Nothing after the commit depends on
  durability or a fresh DB read; the response is built from Python
  objects already in memory. The new auto-commit-on-success handles
  these.
- **Bucket 2 — needed mid-function, replace with `db.flush()`.** The
  commit exists only so a later line in the same function can read a
  server-generated value (e.g. a new row's `id`, an `onupdate`
  timestamp) — usually paired with `db.refresh(obj)`. `db.flush()` gives
  the same visibility without ending the transaction, so the row stays
  rollback-able if something later in the request fails.
- **Bucket 3 — deliberate partial-durability checkpoint, keep as-is.**
  The commit is intentional: it locks in a write before a later risky
  step (an external HTTP call, an email/push send, or a per-item loop
  where one failure shouldn't undo earlier iterations) so that step's
  failure doesn't roll back the write. Must not be touched — flagged for
  awareness, not action.

### Bucket 1 — delete the `db.commit()` line (34 sites)

- [x] `backend/app/main.py`: 1104 (verify-email), 1231 (reset-password),
      1419 (create_user_with_cbac), 1630 (update_user), 1697
      (deactivate user), 1753 (reactivate user), 1871 (totp/setup), 1949
      (totp/verify), 1987 (totp/disable), 2196 (update profile), 3163
      (deactivate_patient), 3230 (activate_patient), 3816
      (delete_organisation), 3902 (add_staff_to_organisation), 3986
      (add_patient_to_organisation), 4042
      (remove_staff_from_organisation), 4094
      (remove_patient_from_organisation), 4185/4191
      (toggle_org_feature), 4481 (delete_site), 4522
      (link_site_to_org), 4550 (unlink_site_from_org), 4629/4637
      (add_site_staff), 4665 (remove_site_staff), 4720
      (link_patient_to_user), 4831/4834/4865 (accept_invite), 4909
      (revoke_external_access). Manually re-verified each site's
      post-commit code for a fresh query dependent on the pending write
      before deleting (see reclassification note below) — all confirmed
      to only return values already held in memory.
- [x] `backend/app/push_send.py:80` (send_test)
- [x] `backend/app/messaging.py:512` (mark_conversation_read)
- [x] `backend/app/features/teaching/router.py:926` (submit_answer),
      `:1007` (update_answer)

**Reclassified during implementation** — `backend/app/push.py:96`
(subscribe) was originally Bucket 1, but on inspection the `else`
branch does `db.add()` for a new subscription, then the very next line
runs `count = db.scalar(select(func.count(...)))` to return the total.
This session has `autoflush=False` (`core_db.py`), so without a flush
that count would silently undercount by one on first-subscribe. Moved
to Bucket 2 — see below.

### Bucket 2 — replace `db.commit()` with `db.flush()` (16 sites)

- [x] `backend/app/main.py`: 3389 (update_my_competencies), 3698
      (update_organisation), 3760 (create_organisation), 4292
      (create_site), 4417 (update_site), 4451 (toggle_site_active), 5157
      (update_conversation_status_endpoint)
- [x] `backend/app/messaging.py`: 253 (create_conversation), 367
      (get_conversation_detail), 456 (send_message), 492
      (add_participant), 634 (join_conversation)
- [x] `backend/app/features/teaching/router.py`: 635 (start_assessment),
      2130 (update_settings), 2361 (update_bank_org_settings)
- [x] `backend/app/push.py:96` (subscribe) — reclassified from Bucket 1
      during implementation, see note above. Already done.

Each of these keeps its existing `db.refresh(obj)` call immediately
after — only the `db.commit()` → `db.flush()` swap changes.

### Bucket 3 — leave unchanged, do not touch (7 sites)

- [x] Confirm these are left exactly as-is during the Bucket 1/2 sweep
      (no code change — this is a checklist item to actively verify,
      not skip):
  - `backend/app/main.py:1050` (register — commits the new
    user/org/site before the verification email send)
  - `backend/app/main.py:2034` (change-password — commits the new
    password hash/token version before cookie reissue)
  - `backend/app/features/teaching/sync.py:259,284,413`
    (sync_question_bank — per-bank commits inside `sync_all_banks`'s
    loop, so one bank's failure doesn't undo another's)
  - `backend/app/features/teaching/router.py:1284` (complete_assessment
    — commits completion before certificate PDF/email generation)
  - `backend/app/features/teaching/router.py:1416`
    (download_certificate — commits a backfilled `exam_ref` before GCS
    image download/PDF generation)

**Important discovery during implementation** — deleting Bucket 1's
`db.commit()` calls broke `test_totp_verify_success` (and would have
broken more tests touching other Bucket 1 routes). Root cause:
`backend/tests/conftest.py`'s `override_get_core_db` (used by the
`test_client` fixture) never committed at all — it only worked before
because every route committed for itself. In production this is fine
(the real `get_core_db()` auto-commits after Phase 1), but the test
double didn't mirror that, so Bucket 1 routes' writes silently stopped
reaching the test database even though production behaviour was
correct. Fixed by updating `override_get_core_db` to mirror the real
dependency's commit-on-success / rollback-on-exception behaviour
(minus `db.close()`, which `db_session`'s own fixture still owns).
Full `just ub` suite passes after this fix.

## Phase 3: Regression tests

- [x] Add to `backend/tests/test_db.py`'s `TestCoreDB` class — both
      driving `get_core_db()` directly as a generator (the `test_client`
      fixture's `override_get_core_db` in `conftest.py` bypasses the
      real function entirely, so it won't exercise this change):
  - `test_get_core_db_commits_on_success` — monkeypatch
    `app.db.core_db.CoreSessionLocal` to an in-memory SQLite-backed
    sessionmaker with one scratch table, write a row via the yielded
    session, drive the generator to completion, then open a fresh
    session on the same engine and assert the row exists
  - `test_get_core_db_rolls_back_on_exception` — same setup, but use
    `gen.throw(RuntimeError)` to simulate an exception inside the route,
    assert it propagates, then assert the row does **not** exist

## Phase 4: Verification

- [x] `just ub -k test_get_core_db` — targeted run of the new/updated tests
- [x] `just ub` — full backend unit suite, covering the Bucket 1/2
      call-site changes across `main.py`, `messaging.py`,
      `teaching/router.py`, `push.py`, `push_send.py`
- [ ] Confirm mypy/ruff/black pass via the existing pre-commit hooks

## Decisions

| Decision                                                       | Rationale                                                                                                                                                                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-commit on success, auto-rollback on exception             | Closes the "forgot to commit" bug class structurally instead of relying on every route author remembering — the clinical-safety motivation for this change                                            |
| Audit and clean up existing `db.commit()` calls now, not later | This is the only real human-review window this change gets; a deferred "cleanup later" pass was judged unlikely to actually happen, so it's folded into this plan instead                             |
| Classify before removing, rather than blanket-deleting         | Some commits are load-bearing (need a generated ID/timestamp mid-function) or deliberate partial-durability checkpoints (survive a later risky step's failure) — blind removal would change behaviour |
| Bucket 2 uses `db.flush()`, not deletion                       | Preserves mid-function access to server-generated values (IDs, `onupdate` timestamps) while keeping the row rollback-able until the request actually succeeds                                         |
| Bucket 3 sites are left untouched                              | These intentionally decouple an early write's durability from a later risky step's outcome; auto-commit-on-success doesn't change this since the commit already happened earlier in the function      |
| Rely on existing middleware ordering                           | App registers middleware (`backend/app/main.py`), so dependency teardown runs before the response is sent — a rare commit-time failure still surfaces as an error rather than a false "success"       |
| Drive `get_core_db()` directly in tests, not via `test_client` | `conftest.py`'s `override_get_core_db` fixture replaces the function entirely for API-route tests, so it can't exercise the real commit/rollback logic                                                |
