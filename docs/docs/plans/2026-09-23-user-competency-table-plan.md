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

- [x] **Remove the JSON writes from every writer Phase 2 listed**, one
      deploy after Phase 4, leaving the rows as the only thing written.
      `grant_staff_competencies` stops merging into JSON and returns the
      list it settled, which `add_org_unit_member` hands to the Phase 2
      helper. The two columns keep their model definitions and their empty
      default, so a new user still gets `[]` until Phase 7 drops them.

- [x] **Delete `grant_entitlement_at_onboarding`
      (`backend/app/features/passport/entitlements.py:55`).** Granting a
      competency and granting its term are now one row. This also closes the
      gap the plan was written after: the admin user editor could grant
      `passport_write` and could not grant an entitlement, so an admin could
      put somebody in a state no interface could get them out of.

      `sync_competency_rows` now opens `passport_write` itself, dated a year
      ahead from `PASSPORT_ENTITLEMENT_DAYS`, where until now it refused to
      open it at all. `TERMS` in `backend/app/cbac/grants.py` maps each
      termed competency to how long a fresh grant lasts. The rule that made
      onboarding idempotent carries over unchanged, because only a current
      row suppresses a new one: saving again does not extend a running
      term, and a term that has ended is granted afresh.

      A termed row's `source` is `organisation` whoever grants it, not the
      caller's `admin` or `operator`. For a term the value records who
      pays, as it did on `passport_write_entitlement`, and every route that
      grants one acts for an organisation. `passport_write_entitlement` is
      now neither written nor read.

## Phase 6: Look at the other two JSON columns worth moving

Eleven JSON columns exist across the models. Most are genuine documents and
should stay: `config_yaml` is a synced config file read back whole, `errors`
and `warnings` are a report from one sync run, `score_breakdown` is a snapshot
of one attempt whose shape depends on the exam that produced it. Two are not,
and each gets its own plan rather than being bundled here, because each has
its own readers and its own migration.

- [x] **Look into `users.professional_registrations`, then write
      [Professional registrations](2026-09-23-professional-registrations-plan.md).**
      It holds a GMC or NMC number as `{"GMC": "1234567"}`. A registration
      is not a number: it has an issuing body, an expiry and a date somebody
      verified it, and none of those has anywhere to go. The passport reads
      the blob at three places in `backend/app/features/passport/router.py`
      and writes it at a fourth, when an assessor accepts an invite. It
      comments that the blob is "free-form JSON, so anything", a warning
      rather than a design.

      The question to settle first was whether
      `AssessorRegistrationVerification` should hold the registration
      itself. It should not. A verification is one organisation's check of
      a registration, per `org_unit`, and a registration is the person's
      declaration. They are two facts, and the new plan keeps two tables. It
      stops the verification copying the authority and number, and gives it
      a foreign key to a registration row that is closed rather than edited.
      The investigation also found the verification route writes rows that
      nothing displays, and an invite form posting to a route that no longer
      exists. The new plan lists both.

- [x] **Look into `assessment_answers.resolved_tags`, then write
      [Resolved tags](2026-09-23-resolved-tags-plan.md).** The first draft
      of this step described the column as "which topics a question turned
      out to cover", and asked whether the tags belong to the answer or to
      the question item. Neither premise held. Tags live only on answer
      options, and `resolved_tags` copies the tags of the option the
      candidate chose, such as `high_confidence` or `adenoma`, not topics
      of the item.

      The copy is deliberate: sync updates items and options in place
      within a bank version, so a join would re-score finished assessments
      against today's options. The new plan keeps the snapshot and moves it
      into an `assessment_answer_tag` table, so it can be queried across
      attempts.

- [x] **Leave `images`, `options` and `metadata_json` on question items
      alone, and record why here if that changes.** `options` looks
      relational — each option has an id, and `correct_option_id` points at
      one — but question items are a cache of the synced git question bank,
      which is the source of truth. Normalising a cache buys constraints on
      data this system does not own. `metadata_json` is the one to watch: if
      specific keys start being read by name, those keys want columns.
      Nothing changed during this plan. The resolved tags investigation
      confirmed that option tags are read only at answer time, and copied
      from there.

## Phase 7: Drop the columns

- [x] **Take the two columns out of every statement first, in a deploy of
      their own.** Found while building this phase. Stopping the writes in
      Phase 5 was not enough to make the drop safe. The model still mapped
      both columns, so every `SELECT` of `users` named them, and so did
      every `INSERT`, through the Python default. Migrations run before the
      new revision takes traffic, so the revision still serving while the
      drop ran would fail on every query of `users` until it was replaced.
      `.claude/rules/backend.md` asks for an app that no longer uses a
      column to be live before the migration that drops it.

      So migration `26434c1eb0a4` gives both columns a server default of
      `'[]'`, which is additive. The model defers them, keeping them out of
      every `SELECT`, and drops their Python default, keeping them out of
      every `INSERT`. `User` also sets `eager_defaults` off. Without that,
      SQLAlchemy adds a `RETURNING` naming every column with a server
      default, and both retired columns would be back in the statement.
      `backend/tests/test_retired_competency_columns.py` records every
      statement a create and an update send, and fails if either name
      appears.

- [x] **Drop `additional_competencies`, `removed_competencies` and the
      `passport_write_entitlement` table** in their own migration, carrying
      `# migration-check: allow-destructive`. It goes through the
      `db-destructive-migration-review` environment, and it is not bundled
      with additive work. Approved on 23 September 2026.

      Last, and after the investigations in Phase 6, because it is the one
      step that cannot be undone and it needs a human's approval. Nothing
      else in this plan depends on it, so nothing waits behind it. The
      table is safe to drop in the same migration without a step like the
      one above: since Phase 5 no code queries it, and a mapped class that
      is never queried sends nothing.

      Migration `113dbf80612e`. Its `downgrade()` recreates both columns
      and the table empty, because everything they held is in
      `user_competency`. The `eager_defaults` setting the step above needed
      goes with the columns.

## Phase 8: Seed from the profession, then let it go

Everything above keeps the base profession as a live template: what
somebody holds is worked out on every request as
`(profession | granted) - removed`, with the profession's list read from
`shared/base-professions.yaml`. So editing that file grants or revokes a
competency for everyone with that profession at once, with no row and nobody
named as doing it. For a clinical competency that is the wrong way round.
Credentialing is per person: a trust decides this doctor may prescribe
controlled drugs, not every consultant because a file changed. This phase
makes the profession what it first appears to be, a starting point. A new
user's rows are seeded from it once, and after that only their rows count.

The argument was made before, in
[Platform role](2026-09-09-platform-role-plan.md) ("use a profession to
initialise, then let it go"), and not taken. The decision recorded there
answered changing a *person's* profession, which became additive. It did not
answer changing the *profession itself*, which is the case this phase exists
for. Its other reason, that the gap between template and person is worth
seeing, survives: `base_profession` stays as a label, and the gap is worked
out rather than stored.

- [x] **Add `profession` to `COMPETENCY_GRANT_SOURCES`**, for a row seeded
      from somebody's base profession. It is what lets the edit page, and
      anyone auditing, tell "came with their profession" from "granted by an
      administrator".

- [x] **Seed rows wherever a user gets a profession, before the backfill.**
      The first draft of this phase put the backfill first. That is the
      order Phase 2 corrected once already: each unit deploys when it
      merges, so anybody created between a backfill deploying and the
      writers deploying would have no profession rows, and the resolver
      switch would take their profession's competencies away.

      `sync_competency_rows` takes on the seeding, so every writer that
      already calls it seeds without a change of its own. It stops treating
      `additional` as the whole of somebody's grant rows. It works out the
      set they should hold, their profession's template plus `additional`
      minus `removed`, and opens and closes grant rows to match. A row it
      opens for a competency in the template, and not asked for in
      `additional`, is `source` `profession`. Changing somebody's profession
      then adds rows for the new one and closes nothing, which is the
      carry-over rule stated as rows. Removal rows are still written, because
      the resolver still adds the template until the switch below.

      Once profession rows exist, a person's grant rows are no longer "what
      they hold beyond their profession". So `User.additional_competency_ids`
      becomes their current grants minus the template, worked out rather
      than read. The pre-switch resolver, `(template | additional) - removed`,
      gives the same answer either way, which is what makes this safe to
      deploy alone.

      The two superadmin scripts gave a *new* operator their profession and
      wrote no rows, because they only called the helper for an existing
      user. Both now seed a new user as well. Tests in
      `backend/tests/test_competency_rows_are_written.py` that counted rows
      now count the rows a save's lists asked for, leaving out seeded
      ones, which `backend/tests/test_profession_seeds_rows.py` pins
      instead.

- [x] **Seed every existing user's profession competencies as rows**, in a
      hand-written migration. For each user, write a `profession` row for
      each competency their profession grants, unless they already have a
      current grant for it or a current removal of it. A removal means the
      competency is not held, so no row is seeded for it.

      A migration cannot read the YAML, because the file moves on and the
      migration has to keep meaning what it meant. So the profession to
      competency mapping is frozen into it as literals, as
      `b4c2e7a91f38` froze the professions that granted `manage_users`.
      Written as `56f3ad035100`. Its seeded rows have a null `starts_on`,
      because nothing recorded when somebody was given their profession,
      which also marks them for `downgrade()`: a row the application seeds
      carries the moment it was written. Tested against Postgres in
      `backend/tests/test_profession_seed_backfill.py`, added to the
      `alembic_drift_check` CI job.

- [x] **Give the check before the switch a function to call.**
      `unseeded_profession_competencies` in `backend/app/cbac/audit.py` lists,
      per user, every competency their profession grants that they hold
      only through the template: not removed, and with no current grant row.
      An empty result means the switch below changes nobody's
      competencies. It is run against teaching after the backfill deploys
      and before the switch merges, from the backend container:
      `python -c "from app.db import CoreSessionLocal; from app.cbac.audit
      import unseeded_profession_competencies as u;
      print(u(CoreSessionLocal()))"`. Or, against a deployed environment,
      `just check-competency-seeding teaching`, which runs it as the
      `check-competency-seeding` action of the admin Cloud Run job and
      fails if anybody is listed.

- [x] **Switch the resolver to the rows alone, and work out the two lists.**
      `get_final_competencies` becomes the competency ids of the user's
      current grant rows, and the YAML is consulted only when a profession
      is given to somebody. This is the step that changes behaviour. After
      it, an edit to `base-professions.yaml` affects only people given that
      profession afterwards.

      The API keeps `additional_competencies` and `removed_competencies`,
      and the edit page at `/admin/users/{id}/edit` keeps both pickers. They
      become a comparison against the profession's current YAML:

      - **Additional** — held, and not in the profession.
      - **Removed** — in the profession, and not held.

      Saving still works out the held set as `profession + additional -
      removed` and opens and closes grant rows to match. No `granted: false`
      row is written any more: taking something away closes its row, which
      is how everything else is already taken away. The same unit adds a
      pointer from the Platform role plan's decision, "`base_profession`
      stays stored against a person", to this phase.

      **Seeding moved into the `User` constructor.** Found while switching.
      Once the template stopped counting, every path that creates a user
      without calling `sync_competency_rows` created somebody who held
      nothing. That covers self-registration, an accepted assessor invite,
      `seed_ci.py` and the other scripts, and more than a hundred tests. So
      `User.__init__` writes the profession's rows itself, and every way a
      user comes to exist gets them. A route that removes some of them at
      creation closes those rows straight after, which records honestly
      that the profession gave them and an administrator took them away.

      `add_org_unit_member` now reads the person's removed list before
      `grant_staff_competencies` changes their profession. Read afterwards,
      the new profession's competencies would all count as "not held" and
      be kept from them. The `withhold` and `clear` test helpers now close
      grant rows. They no longer write removal rows, and `clear` leaves the
      seeded profession rows alone.

- [x] **Relabel the edit page to say what the lists now mean**, in
      `frontend/src/pages/UserInfoUpdatePage.tsx`. "Default competencies"
      becomes the profession's template, what a new person with it is
      given. "Removed competencies" becomes "In the profession, not held",
      because after a YAML change a competency can appear there for an
      existing person without anybody having removed it. Stories and tests
      for the step change with it.

      The two lists are now "Held beyond the profession" and "In the
      profession, not held", on the edit page, its review step and the user
      page at `/admin/users/{id}`, which showed the same two headings.
      The template's heading is "What it gives a new user". Neither page has
      stories of its own, as pages are not stories here, so only their
      tests changed.

- [x] **Close the removal rows**, in a data migration, once nothing reads or
      writes them. A current `granted: false` row now means only that no
      grant row exists, which the seeding already made true. Closing rather
      than deleting keeps the history of who removed what. Not destructive:
      rows are closed, and the column stays.

      Migration `2a2a7b1ea83a`. Every row it closes shares one `ends_on`,
      the start of its transaction, which is how its `downgrade()` finds
      them again. Tested against Postgres in
      `backend/tests/test_close_removal_rows.py`, added to the
      `alembic_drift_check` CI job.

- [ ] **Drop the `granted` column**, in its own migration with the
      `allow-destructive` marker, through the
      `db-destructive-migration-review` environment, like Phase 7. It needs
      a human's approval before it is built.

## Phase 9: Organisation passport grants do not lapse

Decided on 23 September 2026, after Phase 5 was built: somebody given the
passport through a site or organisation, such as oncology at
Gloucestershire, keeps it indefinitely. Only a subscription somebody buys
for themselves runs out, after a year. Phases 2, 3 and 5 gave every grant
a year, because `passport_write_entitlement` had, so this phase takes it
off the grants that should not carry it. It sits on top rather than
rewriting those phases: nothing it replaces lapses before it lands.

- [x] **Key `TERMS` by who pays, not by competency.** `TERMS` in
      `backend/app/cbac/grants.py` now maps a `source` to a term, and only
      `individual` has one. So `sync_competency_rows` writes a
      `passport_write` grant from an administrator, onboarding or an
      operator with no end, and with the caller's `source` rather than
      `organisation`. Nothing writes an `individual` grant yet; the term is
      ready for the first thing that does.

- [x] **Take the end date off existing organisation grants.** Migration
      `57deea9f9ea6` clears `ends_on` on every current `passport_write`
      grant whose `source` is `organisation`: the ones onboarding and the
      backfill wrote. `individual` grants keep theirs. Its `downgrade()`
      puts back `starts_on` plus a year, which is what each was written
      with. Tested against Postgres in
      `backend/tests/test_organisation_passport_grants_do_not_lapse.py`.

- [x] **Let the passport page accept a grant with no end.**
      `current_entitlement_end` answered "no current entitlement" for an
      undated grant, and the page would have shown the passport as
      read-only. It is now `passport_write_ends_on`: a current grant with
      no end means it never runs out, whatever else the person holds, so
      `EntitlementOut` carries no date, no countdown and `can_write` true.
      The frontend already said nothing for that case, and a test now pins
      it.

## Decisions

- **The API shape does not change** — `additional_competencies` and
  `removed_competencies` stay in request and response bodies throughout. They
  stop being columns and become a view over rows, which is invisible to a
  client and keeps this a storage change rather than an API one. Exposing
  expiry dates is a separate piece of work.

- **Only an individual passport subscription gets an end date** — the
  table can hold `ends_on` for anything, and nothing else sets it. A grant
  through a site or organisation has none (Phase 9). Which clinical competencies
  expire, how long they last and what lapsing does are per-competency
  questions, and `shared/competency-definitions/` would need to say which
  competencies expire at all before any of them could be answered.

- **Expired and revoked rows are kept** — what somebody was entitled to do,
  and until when, is what an audit trail needs to explain an action taken last
  year. Nothing deletes from this table in normal use.

## Open questions

- **Does `granted: false` need dates?** A removal that expires is a
  suspension. The columns allow it; no step uses it. Phase 8 retires removal
  rows altogether, so a suspension would become a grant row closed and
  reopened, or a status of its own.

- **How does a change to a profession reach the people who already hold
  it?** After Phase 8 it reaches nobody automatically, which is the point.
  When it should, for example a new mandatory competency for every nurse,
  it needs a deliberate rollout: an admin action or a migration that writes
  rows naming who approved it. Not built here.

- **Should the catalogue declare which competencies expire?** A flag in
  `shared/competency-definitions/` would let the system refuse an `ends_on` on
  a competency that does not expire, and prompt for one on a competency that
  does. Probably yes, before any clinical competency gets a date.

- **What does `source` hold once it is general?** Answered in Phase 2 for
  what exists today. A clinical competency granted on evidence is none of
  those values and will need its own.
