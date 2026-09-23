# User competency table plan

A user's competencies are stored as two JSON arrays of strings on the `users`
row, `additional_competencies` and `removed_competencies`. Nothing in the
database knows those strings name anything, so a misspelled id is accepted and
silently grants nothing, "who holds this competency?" means reading every user
and parsing JSON in Python, and a grant has nowhere to record when it started,
when it ends or who made it. `update_user` replaces the whole array on every
save, so two admins editing one user means last-write-wins across every
competency rather than the one that changed.

The forcing case is expiry. `passport_write` ends because it is sold, and it
needed a date the JSON could not hold, so it got a table of its own,
`passport_write_entitlement`. It will not be the last: resuscitation
certification, safeguarding training and appraisal all expire and are ordinary
clinical competencies. This plan replaces both JSON columns with
`user_competency`, one row per grant, and folds the entitlement table into it
so that granting a competency and granting its term become one act.

## Phase 1: Add the table

- [ ] **Add a `UserCompetency` model to `backend/app/models.py`** with
      `user_id` (FK `users.id`, `ON DELETE CASCADE`, indexed), `competency_id`
      (`varchar(100)`, indexed), `granted` (boolean), `starts_on` and `ends_on`
      (`timestamptz`, both nullable), `source` (`varchar(20)`), `org_unit_id`
      (FK `org_unit.id`, `ON DELETE SET NULL`, nullable), `granted_by` (FK
      `users.id`, `ON DELETE SET NULL`, nullable) and `created_at`.

      `competency_id` carries **no foreign key**, and that is deliberate rather
      than an oversight. The catalogue lives in
      `shared/competency-definitions/` as YAML, not in a table, and a retired
      competency has to stay readable on the records that reference it.
      `PassportSignOffRequest.competency_id` already takes this position for
      the same reason. Validation stays where it is today, at the write
      boundary.

      **No unique constraint on `(user_id, competency_id)`.** Somebody may hold
      `passport_write` from their trust and from a personal subscription at
      once, with different end dates, and losing one must not end the other.
      The same is true of a qualification renewed before the old one lapsed.
      The resolver asks whether *any* row is current rather than reading one.

- [ ] **Use `granted: false` where `removed_competencies` holds an id.** A row
      saying this person does not hold something their base profession would
      give them keeps the subtraction `resolve_user_competencies` already
      performs, and unlike a string in a list it can say who removed it and
      when.

- [ ] **Create the table with `just migrate "add user_competency table"`.**
      Additive and empty; nothing reads it yet. Read the generated
      `upgrade()` and `downgrade()` before committing, per
      `.claude/rules/backend.md`.

## Phase 2: Backfill

- [ ] **Run `python -m app.cbac.audit` first and record the count of unknown
      ids.** The JSON columns may name competencies the catalogue no longer
      has. The backfill carries them across rather than dropping them: losing
      a grant silently during a storage change is worse than carrying a stale
      one, and the audit report is what tells you how many there are before
      and after.

- [ ] **Write one migration that reads every user's two lists and writes a
      row per entry** — `granted` true for `additional_competencies`, false
      for `removed_competencies`, a `source` of `migrated`, null dates. In the
      same migration, turn every `passport_write_entitlement` row into a
      `passport_write` row carrying its `ends_on`, `source` and `org_unit_id`.

- [ ] **Make it idempotent and give it a real `downgrade()`.** Re-running must
      add nothing, so the insert checks for an existing row rather than
      assuming an empty table. The downgrade deletes the rows it created,
      which is safe because nothing writes to the table until Phase 3.

- [ ] **Verify the row count against the JSON before moving on.** For every
      user, the number of `granted: true` rows equals the length of
      `additional_competencies`, and `granted: false` equals
      `removed_competencies`. A mismatch means the backfill dropped something.

## Phase 3: Dual-write

- [ ] **Write rows alongside JSON in `update_user`**
      (`backend/app/main.py:1793`), which sets both
      `additional_competencies` and `removed_competencies` wholesale.

- [ ] **Write rows alongside JSON in `add_org_unit_member`**
      (`backend/app/org_units/router.py:683`), which calls
      `grant_staff_competencies` and then
      `grant_entitlement_at_onboarding`. Both still run; the second is
      removed in Phase 5.

- [ ] **Leave every reader on JSON.** Readers do not move until Phase 4, so
      a rollback to the previous revision loses nothing: the JSON columns
      remain the source of truth throughout this phase.

## Phase 4: Switch reads

- [ ] **Rebuild `resolve_user_competencies`
      (`backend/app/cbac/base_professions.py:119`) from rows.** It keeps its
      `(base | additional) - removed` shape and its signature; the additions
      become the current rows with `granted` true, the removals the current
      rows with `granted` false, and "current" means `ends_on` is null or in
      the future.

- [ ] **Turn `backend/app/cbac/audit.py` into a query.** It currently scans
      every user's JSON to find ids the catalogue does not have. Against rows
      that is a `SELECT DISTINCT competency_id`, which is the point of the
      change.

- [ ] **Collapse the two questions in `_require_writer`
      (`backend/app/features/passport/router.py:415`) into one.** It asks
      whether the caller holds `passport_write` and then whether
      `current_entitlement_end` is non-null. Against rows those are the same
      question, because a current row is both.

- [ ] **Move reads in one change, not file by file.** A test that sets JSON
      the new code no longer reads will still pass, so a partial switch hides
      its own failures. Nineteen backend test files read these columns
      directly and are rewritten as rows in this phase.

## Phase 5: Stop writing JSON

- [ ] **Remove the JSON writes from `update_user` and
      `add_org_unit_member`**, one deploy after Phase 4, leaving the rows as
      the only thing written.

- [ ] **Delete `grant_entitlement_at_onboarding`
      (`backend/app/features/passport/entitlements.py:55`).** Granting a
      competency and granting its term are now one row. This also closes the
      gap the plan was written after: the admin user editor could grant
      `passport_write` and could not grant an entitlement, so an admin could
      put somebody in a state no interface could get them out of.

## Phase 6: Drop the columns

- [ ] **Drop `additional_competencies`, `removed_competencies` and the
      `passport_write_entitlement` table** in their own migration, carrying
      `# migration-check: allow-destructive`. It goes through the
      `db-destructive-migration-review` environment, and it is not bundled
      with additive work.

## Phase 7: Look at the other two JSON columns worth moving

Eleven JSON columns exist across the models. Most are genuine documents and
should stay: `config_yaml` is a synced config file read back whole, `errors`
and `warnings` are a report from one sync run, `score_breakdown` is a snapshot
of one attempt whose shape depends on the exam that produced it. Two are not,
and each gets its own plan rather than being bundled here, because each has
its own readers and its own migration.

- [ ] **Look into `users.professional_registrations`, then write
      `docs/docs/plans/<date>-professional-registrations-plan.md`.** It holds
      a GMC or NMC number as `{"GMC": "1234567"}`. A registration is not a
      number: it has an issuing body, an expiry and a date somebody verified
      it, and none of those has anywhere to go. The passport already reads
      the blob at four places in
      `backend/app/features/passport/router.py` and comments at line 301 that
      it is "free-form JSON, so anything" — a warning rather than a design.
      Registrations expire, so the argument that drove this plan applies
      directly. What the investigation has to settle first is whether the
      verification an assessor's registration goes through
      (`AssessorRegistrationVerification`) should hold the registration
      itself, rather than a second table pointing at the same fact.

- [ ] **Look into `assessment_answers.resolved_tags`, then write
      `docs/docs/plans/<date>-resolved-tags-plan.md`.** It records which
      topics a question turned out to cover, per answer.
      `backend/app/features/teaching/scoring.py` loops over it in Python at
      lines 100 and 118, `if tag in a["resolved_tags"]`, because the column
      cannot be queried. That is the same smell as the competency columns,
      and it means a question like "how do trainees perform on cardiology
      across every attempt" cannot be asked of the database at all. What the
      investigation has to settle is whether the tags belong to the answer or
      to the question item: if a tag is a property of the item, the answer
      does not need its own copy, and the fix is a join rather than a new
      table.

- [ ] **Leave `images`, `options` and `metadata_json` on question items
      alone, and record why here if that changes.** `options` looks
      relational — each option has an id, and `correct_option_id` points at
      one — but question items are a cache of the synced git question bank,
      which is the source of truth. Normalising a cache buys constraints on
      data this system does not own. `metadata_json` is the one to watch: if
      specific keys start being read by name, those keys want columns.

## Decisions

- **The API shape does not change** — `additional_competencies` and
  `removed_competencies` stay in request and response bodies throughout. They
  stop being columns and become a view over rows, which is invisible to a
  client and keeps this a storage change rather than an API one. Exposing
  expiry dates is a separate piece of work.

- **Nothing but `passport_write` gets an end date here** — the table can hold
  `ends_on` for anything, and nothing sets it. Which clinical competencies
  expire, how long they last and what lapsing does are per-competency
  questions, and `shared/competency-definitions/` would need to say which
  competencies expire at all before any of them could be answered.

- **Expired and revoked rows are kept** — what somebody was entitled to do,
  and until when, is what an audit trail needs to explain an action taken last
  year. Nothing deletes from this table in normal use.

## Open questions

- **Does `granted: false` need dates?** A removal that expires is a
  suspension. The columns allow it; no step uses it.

- **Should the catalogue declare which competencies expire?** A flag in
  `shared/competency-definitions/` would let the system refuse an `ends_on` on
  a competency that does not expire, and prompt for one on a competency that
  does. Probably yes, before any clinical competency gets a date.

- **What does `source` hold once it is general?** Today's values come from the
  entitlement table, `organisation` and `individual`, plus `migrated` for the
  backfill. A clinical competency granted on evidence is none of those.
