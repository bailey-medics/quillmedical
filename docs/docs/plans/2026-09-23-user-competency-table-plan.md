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

- [x] **Add a `UserCompetency` model to `backend/app/models.py`** with
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

- [x] **Use `granted: false` where `removed_competencies` holds an id.** A row
      saying this person does not hold something their base profession would
      give them keeps the subtraction `resolve_user_competencies` already
      performs, and unlike a string in a list it can say who removed it and
      when.

- [x] **Give `User` a `competency_grants` relationship to the rows, loaded
      with `lazy="selectin"`.** `User.get_final_competencies()` takes no
      session and has 28 call sites across `backend/app`, so Phase 4 can only
      rebuild the resolver from rows without touching every one of them if
      the rows arrive with the user. `selectin` loads them for a whole list
      of users in one extra query rather than one per user. Declared now,
      beside the model, so nothing in Phase 4 changes the model's shape;
      nothing reads it until then.

- [x] **Create the table with `just migrate "add user_competency table"`.**
      Additive and empty; nothing reads it yet. Read the generated
      `upgrade()` and `downgrade()` before committing, per
      `.claude/rules/backend.md`.

## Phase 2: Dual-write

This phase comes before the backfill, not after it. The first draft had them
the other way round, and that order loses writes: each unit merges and deploys
on its own, so a backfill that lands before anything dual-writes copies the
JSON as it stands on that day, and every grant an administrator makes between
that deploy and the dual-write deploy exists in JSON and never in rows. Phase 4
would then take it away. `.claude/rules/backend.md` gives the same order for a
column rename, for the same reason: expand, dual-write, backfill, switch reads.

- [x] **Write one helper that brings a user's rows into line with a pair of
      lists, and call it from every writer.** A new
      `backend/app/cbac/grants.py` takes the user, the new
      `additional_competencies` and `removed_competencies`, a `source` and
      `granted_by`, and diffs them against the user's current rows. An id
      that has appeared gets a new row. An id that has gone has its current
      rows **closed by setting `ends_on` to now**, never deleted: rows are
      only ever inserted or closed, which is what keeps "what could they do
      last year?" answerable. Writing it once means the diff rule cannot
      drift between writers.

      A user nobody has saved since this deployed has no rows at all, so
      their first save writes a row for every id in both lists. That is
      correct rather than noisy: after any save a user's current rows match
      their JSON exactly, which is what lets the backfill in Phase 3 skip
      them safely.

      **`passport_write` is closed like anything else but never opened
      here.** An undated `passport_write` row would never lapse, so its rows
      come only from the entitlement step below, which carries the term.
      Taking it off the list still closes its rows, because that is what
      taking it out of `additional_competencies` does today: the competency
      goes, and `_require_writer` refuses.

- [x] **Give `source` a vocabulary checked in code, not a database enum.**
      The open question at the foot of this plan needed an answer before
      anything could write a row. The values, in `COMPETENCY_GRANT_SOURCES`
      beside the model and checked by a `@validates` hook the way
      `validate_org_unit_type` checks org unit types, so the list grows
      without a migration:

      - **`admin`** — granted or removed by a holder of `manage_users`
        through `POST /api/users`, `PATCH /api/users/{id}` or
        `POST /api/org-units/{id}/members`.
      - **`operator`** — an operator editing their own competencies through
        `PATCH /api/cbac/my-competencies`.
      - **`bootstrap`** — the command-line scripts that create the first
        superadmin, where nobody is signed in to be `granted_by`.
      - **`organisation`** and **`individual`** — a term of
        `passport_write`, the two values `passport_write_entitlement`
        already uses.
      - **`migrated`** — the Phase 3 backfill.

      A clinical competency granted on evidence will want its own value when
      that is built. Adding it is one line.

- [x] **Call it from `update_user`** (`backend/app/main.py:1793`), after
      the existing profession carry-over and superadmin promotion have
      settled the final lists. The route sets both `additional_competencies`
      and `removed_competencies` wholesale, so the diff is what turns a
      whole-list save into rows that change one at a time.

- [x] **Call it from the four writers the first draft of this plan missed.**
      `create_user_with_cbac` (`backend/app/main.py:1549`, `POST
      /api/users`) sets both lists on a new user. `update_my_competencies`
      (`backend/app/main.py:3640`, `PATCH /api/cbac/my-competencies`)
      sets both on the caller. `create_superadmin` in
      `backend/scripts/admin_cli.py` and `backend/scripts/create_superuser.py`
      both merge into `additional_competencies`. A writer left out here is a
      grant that exists in JSON and not in rows, and Phase 4 would silently
      take it away.

- [x] **Call it from `add_org_unit_member`**
      (`backend/app/org_units/router.py:683`) after
      `grant_staff_competencies` has merged the new grants into the JSON,
      with the org unit as the row's `org_unit_id`.
      `grant_entitlement_at_onboarding` still writes its
      `passport_write_entitlement` row, and now writes the matching
      `passport_write` row in `user_competency` beside it, with the same
      `starts_on`, `ends_on`, `source` and `org_unit_id`. That is the only
      place a `passport_write` row is created until Phase 5 removes the
      function.

- [x] **Leave every reader on JSON.** Readers do not move until Phase 4, so
      a rollback to the previous revision loses nothing: the JSON columns
      remain the source of truth throughout this phase.

## Phase 3: Backfill

- [ ] **Run the audit against teaching before this deploys and record the
      count of unknown ids.** `backend/app/cbac/audit.py` has no
      command-line entry point, so from the backend container:
      `python -c "from app.db import CoreSessionLocal; from app.cbac.audit
      import unknown_ids_on_users; print(unknown_ids_on_users(CoreSessionLocal()))"`. The JSON columns may name
      competencies the catalogue no longer has. The backfill carries them
      across rather than dropping them: losing a grant silently during a
      storage change is worse than carrying a stale one, and the audit
      report is what tells you how many there are before and after. This is
      an operational step for whoever merges, not something a branch can do,
      so it is left unticked.

- [x] **Write one migration that reads every user's two lists and writes a
      row per entry** — `granted` true for `additional_competencies`, false
      for `removed_competencies`, a `source` of `migrated`, null dates. In the
      same migration, turn every `passport_write_entitlement` row into a
      `passport_write` row carrying its `starts_on`, `ends_on`, `source` and
      `org_unit_id`. Plain SQL throughout, not the ORM models, since those
      models will change after this migration is frozen. Written by hand as
      `61e9c9b15ac6`, since there is no model change for `just migrate` to
      find.

      A list that is not a JSON array copies nothing rather than failing:
      `json_array_elements_text` raises on anything else, and one bad row
      would otherwise block the deploy for everybody.

- [x] **Skip `passport_write` when copying `additional_competencies`.** A
      holder has it in the JSON *and* in an entitlement row, so copying both
      writes one row with no end date beside one with a date. Phase 4 asks
      whether any row is current, and an undated row is current forever, so
      the entitlement would never lapse. The entitlement rows are the only
      thing that says `passport_write` is held, and the only thing copied for
      it. Anybody with `passport_write` in the JSON and no entitlement row
      ends up with no grant, which is what the entitlement gate in
      `_require_writer` already enforces for them today.
      `passport_write` in `removed_competencies` is still copied: a removal
      has no term to lose.

- [x] **Copy an entitlement closed when the lists do not grant
      `passport_write`.** Found while writing the migration. Somebody can
      hold an entitlement with `passport_write` no longer in their
      `additional_competencies`, because an administrator took it off them
      after onboarding. Today they cannot write, since the gate asks for the
      competency as well as the term. A copy left open would hand the
      competency back the moment Phase 4 reads rows; a copy left out would
      lose the record of the term when Phase 7 drops the entitlement table.
      So it is copied with `ends_on` brought forward to the moment the
      migration runs, which keeps both facts.

- [x] **Make it idempotent and give it a real `downgrade()`.** Re-running
      must add nothing, and Phase 2 means the table is not empty when this
      runs. So a JSON entry is copied only when the user has no current row
      for that competency with the same `granted`, which also skips every
      user the dual-write has already brought into line. An entitlement is
      copied only when no `passport_write` row carries the same `starts_on`
      and `source`, which skips the ones the dual-write mirrored. The start
      rather than the end, because a copy closed by the step above no longer
      carries the entitlement's end.

      The downgrade deletes rows whose `granted_by` is null and whose
      `source` is `migrated`, `organisation` or `individual`. That is
      exactly what this migration writes: a dual-written row either names
      the administrator who made it or carries `operator` or `bootstrap`.

- [x] **Test the migration against a real Postgres.** It is Postgres SQL
      and cannot run on the SQLite unit database.
      `backend/tests/test_user_competency_backfill.py` is marked
      `integration`, steps the database back to the revision before, seeds
      users and entitlements, steps forward and reads the rows. It runs in
      the `alembic_drift_check` CI job, which already has a migrated
      Postgres, and locally through `compose.migrate.yml`.

- [ ] **Verify the row count against the JSON before moving on.** For every
      user, the current `granted: true` rows other than `passport_write`
      match `additional_competencies` less any `passport_write`, and the
      current `granted: false` rows match `removed_competencies`. Every
      `passport_write_entitlement` row has a `passport_write` row with the
      same `starts_on`. A mismatch means the backfill dropped something. Like
      the audit, this is run against teaching after the deploy, and is left
      unticked for whoever merges.

## Phase 4: Switch reads

- [x] **Rebuild `resolve_user_competencies`
      (`backend/app/cbac/base_professions.py:119`) from rows.** It keeps its
      `(base | additional) - removed` shape and its signature; the additions
      become the current rows with `granted` true, the removals the current
      rows with `granted` false, and "current" means `ends_on` is null or in
      the future. `User.get_final_competencies()` passes it the rows from the
      `competency_grants` relationship added in Phase 1, so none of its 28
      callers changes. The two lists are `User.additional_competency_ids`
      and `User.removed_competency_ids`, properties over the current rows,
      and "current" is `UserCompetency.is_current`.

- [x] **Report the rows wherever a response carries the lists.**
      `GET /api/users/{id}`, `GET /api/cbac/my-competencies` and the
      response of `PATCH /api/cbac/my-competencies` all return
      `additional_competencies` and `removed_competencies`. They now build
      them from the two properties, so the fields keep their names and
      shape and become a view over rows, as the decision below requires.

- [x] **Move the writers' own reads across too.** Found while doing this
      phase. `update_user`, `update_my_competencies`,
      `grant_staff_competencies` and both superadmin scripts start from the
      person's current lists and merge into them: the profession carry-over,
      the superadmin promotion, onboarding's additive grant. They read the
      JSON to get that starting point. Left there, a person whose rows and
      JSON ever disagreed would have their rows brought into line with the
      JSON on the next save, which is the old store overwriting the new
      one. So every writer now starts from the rows, settles the lists, then
      writes both. `grant_staff_competencies` returns the list it settled,
      so `add_org_unit_member` brings the rows into line with that rather
      than with the column.

- [x] **Turn `backend/app/cbac/audit.py` into a query.** It currently scans
      every user's JSON to find ids the catalogue does not have. Against rows
      that is a `SELECT DISTINCT` over `user_competency`, which is the point
      of the change. Only current rows are reported: a closed row records
      what somebody could once do and misleads nobody about what they can
      do now.

      The module has no command-line entry point, so the
      `python -m app.cbac.audit` the Phase 3 steps once named does nothing.
      Those steps now give the call to make instead.

- [x] **Collapse the two questions in `_require_writer`
      (`backend/app/features/passport/router.py:415`) into one.** It asks
      whether the caller holds `passport_write` and then whether
      `current_entitlement_end` is non-null. Against rows those are the same
      question, because a current row is both. `current_entitlement_end`
      stays, for the end date the passport page shows, and reads the dated
      `passport_write` rows rather than `passport_write_entitlement`, which
      is still written and now read by nothing.

      One consequence reaches the navigation. A holder whose term has lapsed
      no longer holds `passport_write` at all, where before they held the
      competency and lacked the term. `featureNavItems.ts` sends somebody
      who can assess and cannot write to the sign-off queue rather than
      their own record, so a lapsed holder who is also an assessor now lands
      on the queue. Their record is one click away and still fully readable.

- [x] **Move reads in one change, not file by file.** A test that sets JSON
      the new code no longer reads will still pass, so a partial switch hides
      its own failures. Twenty backend test files read these columns
      directly and are rewritten as rows in this phase, through
      `backend/tests/competencies.py`: `hold`, `withhold`, `lapse` and
      `clear` write the rows a test used to express as JSON.

## Phase 5: Stop writing JSON

- [ ] **Remove the JSON writes from every writer Phase 2 listed**, one
      deploy after Phase 4, leaving the rows as the only thing written.
      `grant_staff_competencies` stops merging into JSON and calls the
      Phase 2 helper instead.

- [ ] **Delete `grant_entitlement_at_onboarding`
      (`backend/app/features/passport/entitlements.py:55`).** Granting a
      competency and granting its term are now one row. This also closes the
      gap the plan was written after: the admin user editor could grant
      `passport_write` and could not grant an entitlement, so an admin could
      put somebody in a state no interface could get them out of.

## Phase 6: Look at the other two JSON columns worth moving

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

## Phase 7: Drop the columns

- [ ] **Drop `additional_competencies`, `removed_competencies` and the
      `passport_write_entitlement` table** in their own migration, carrying
      `# migration-check: allow-destructive`. It goes through the
      `db-destructive-migration-review` environment, and it is not bundled
      with additive work.

      Last, and after the investigations in Phase 6, because it is the one
      step that cannot be undone and it needs a human's approval. Nothing
      else in this plan depends on it, so nothing waits behind it.

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

- **What does `source` hold once it is general?** Answered in Phase 2 for
  what exists today. A clinical competency granted on evidence is none of
  those values and will need its own.
