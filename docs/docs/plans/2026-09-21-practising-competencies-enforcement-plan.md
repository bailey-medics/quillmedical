# Practising competencies enforcement plan

`practising_competency` was designed, built, migrated and tested, and then
nothing was wired to it. The table records that a person may practise one
competency at one place, which is the half of the model that answers _where_.
Today `backend/app/cbac/scoped.py` reads it for exactly one caller,
`positions.appoint`; no endpoint writes a row, no endpoint consults one before
allowing an action, and the frontend contains no reference to it at all. Every
live authorisation decision therefore rests on the ceiling
(`User.get_final_competencies`) plus membership of a place, which is precisely
the "a competency granted anywhere is a competency everywhere" problem
`2026-09-06-org-scoped-access-findings.md` set out to solve.

Two cases make the gap concrete. Someone who holds `manage_users` and is a
member of two sites can administer both, because `has_competency` checks only
the ceiling and `places_administered_by` then scopes on membership and its
descendants; there is no way to say "manage users at site A, not at site B". A
surgeon suspended by one hospital pending an investigation cannot be stopped in
Quill at that hospital while remaining free to operate at another, because no
endpoint asks a clinical competency question anywhere yet. This plan closes the
first case, which is live today, and gives the second case the machinery it will
need when surgical workflows arrive. It is written in the order the work should
be done, and each step carries its own reasoning rather than pointing at a
separate discussion section.

## How this relates to the clinician passport

`2026-09-08-clinician-passport-plan.md` and this plan work on opposite halves
of the same model and do not overlap. The passport is how a competency gets
**into** somebody's ceiling: a trainee does the work, an assessor signs it off,
and the evidence justifies the competency being held at all. This plan takes
the ceiling as given and asks **where** it may be exercised. That split is the
one `2026-09-06-org-scoped-access-findings.md` made when it handed ceiling
expiry to the passport plan, on the grounds that expiry is a property of how a
competency was obtained and nothing in the place model records that.

So the passport's competencies — `assess_clinician_passport` and
`passport_write` — are ordinary catalogue entries, and can be scoped to a place
once Phase 1 lands, which would let an organisation authorise assessing at one
site and not another. That is an enhancement available to the passport later,
not a dependency either way. None of the passport's routes need to change for
this plan, and nothing here waits on the passport.

### Withdrawing a row is not retiring a competency

The two look similar, mean unrelated things, and the passport work has just
made the second one live, so the vocabulary has to stay separate here or they
will be conflated in conversation and then in code.

**Withdrawing a row** removes one person's authorisation at one place. The
competency stays in the catalogue, stays on their ceiling, and stays authorised
at every other place they hold a row for. This is the suspended surgeon.

**Retiring a competency** takes an id out of use everywhere at once, by setting
`retired_on` in `shared/competency-definitions/`. It stays in `COMPETENCY_IDS`
and leaves `ACTIVE_COMPETENCY_IDS`, so existing rows keep resolving and nothing
already stored is orphaned, while `validate_competency_ids` refuses it at every
write boundary.

`PractisingCompetency._competency_exists` already calls that validator, so a
retired id cannot be granted as a new row today. The grant endpoint in Phase 2
inherits that for free and needs no check of its own, which is why the only
task this produces is the test named there: it is the kind of behaviour a later
refactor removes without noticing.

## Phase 1: Read the place before trusting the competency

- [x] **Add `has_competency_at(competency, place_param)` to `backend/app/deps.py`,
      beside the existing `has_competency`.** The existing dependency closes over a
      competency id and compares it against `user.get_final_competencies()`, with no
      access to the request beyond the `Request` object it already takes. The new one
      resolves a place id from the path parameter it is told to read, then calls
      `can_practise_at(db, user, competency, org_unit_id=...)` from
      `app/cbac/scoped.py`, which already applies both halves: the row must exist
      _and_ the competency must be within the user's ceiling.

  It needs a database session, which `has_competency` does not take, so the
  inner function gains `db: Session = DEP_GET_SESSION`. Refusal is **404, not
  403**, matching `_require_visible` in `app/org_units/router.py` and the two
  frontend guards: a refusal must not confirm to somebody that a place exists.

- [x] **Decide and document what an operator gets.** `places_administered_by`
      returns `None` for `platform_role == "superadmin"`, meaning "all of them", and
      every caller branches on that. The new dependency must make the same choice
      explicitly rather than inheriting it by accident. Operators bypass the row
      check, because an operator with no rows anywhere would otherwise be locked out
      of the estate they are there to run. Write that in the docstring as a decision,
      not a convenience.

- [x] **Unit-test the dependency directly** in a new
      `backend/tests/test_has_competency_at.py`: ceiling but no row refuses, row but
      no ceiling refuses, both allows, operator allows with no row, and an unknown
      place is a 404 rather than a 500. `just ub -k "has_competency_at"`.

  Built with thirteen cases, mounting the dependency on a throwaway app
  because no route carries it yet. Two behaviours were settled while writing
  them and are worth naming. A place id that is not a number is a **404**,
  not a 422, so a stray path cannot be used to tell a real place from a
  malformed one. A route that does not carry the path parameter the
  dependency was told to read is a **500**, because that is a mis-wired route
  rather than a refusal, and answering 404 would leave it quietly refusing
  everybody until somebody looked.

## Phase 2: Grant and withdraw, before anything depends on rows existing

- [x] **Add a `manage_practising_competencies` competency to
      `shared/competency-definitions/admin.yaml`.** Authorising somebody to practise
      is not the same act as creating a user, and `manage_users` is already the root
      competency this repository warns about: because `update_user` writes
      `additional_competencies` wholesale, a `manage_users` holder can already mint
      any competency in the catalogue. Reusing it here would mean the person who can
      create an account can also privilege it anywhere, with nothing recording that
      those are two decisions. Run `yarn generate:types` in `frontend/` afterwards so
      the id reaches `src/generated/competencies.json`.

  Granted to the same four professions that already hold
  `manage_staff_membership`: `clinic_manager`, `system_administrator`,
  `superadmin_profession` and `teaching_manager`. That was the precedent when
  `manage_staff_membership` was split out of `manage_users`, and without it
  Phase 5's screen would be unreachable for every administrator who exists
  today. Authorising practice still has to be granted deliberately to anybody
  outside those four.

- [x] **Add three endpoints to `backend/app/org_units/router.py`**, following the
      shape of the membership endpoints already there
      (`/{unit_id}/members`): `GET /{unit_id}/practising-competencies` to list who
      may practise what at a place, `POST` to authorise, and
      `DELETE /{unit_id}/practising-competencies/{user_id}/{competency}` to withdraw.
      Each calls `_require_visible` first, so a caller cannot act on a place they
      cannot see, and each mutating route carries `DEP_REQUIRE_CSRF`.

  The `POST` sets `authorised_by` to the calling user and lets `authorised_at`
  default. The unique constraint `uq_practising_competency_org_unit` makes a
  repeated grant a no-op rather than a duplicate, so return a status the way
  `add_org_unit_member` does rather than failing. The `DELETE` deletes the row
  and records nothing.

  Built returning `authorised`, `unchanged` and `withdrawn`. Two behaviours
  were settled while writing them. Authorising a competency beyond somebody's
  ceiling is **allowed**, because the row does nothing until they are
  qualified and refusing it would stop a place recording a decision it has
  already made. Withdrawing something never authorised **succeeds**, because
  the caller asked for it to be unauthorised here and it is.

- [x] **Refuse a grant at a place whose type cannot hold competencies.**
      `shared/org-unit-types.yaml` carries `can_hold_competencies` per type and
      `type_can_hold_competencies` in `app/org_units/types.py` reads it. Nobody
      practises anything at a room, and the membership endpoint already sets this
      precedent by refusing with a 422 when `type_can_have_members` is false.

- [x] **Test the endpoints** in `backend/tests/test_practising_competency_api.py`:
      grant, list, withdraw, repeat grant is idempotent, a grant at a room is
      refused, a grant naming a retired competency id is refused, a grant at an
      invisible place is a 404, and withdrawing something not granted is not an
      error. `just ub -k "practising_competency_api"`.

## Phase 3: Backfill, so the switch locks nobody out

- [x] **Write a migration that creates a `practising_competency` row for every
      existing place-and-competency pair that membership currently implies.** This
      must land before Phase 4 and be deployed separately from it. Everybody who
      administers a place today does so through membership; the moment the
      dependency starts reading rows, a person with no rows loses access. That is
      the expand half of an expand-contract pair, and `.claude/rules/backend.md`
      requires it.

  The rows to write are, for each user holding `manage_users` in their ceiling,
  one row per place in `places_administered_by(db, user)` — the same set the
  endpoints scope on today, so the backfill reproduces current behaviour exactly
  rather than changing it. Generate it with `just migrate` giving it a
  message about backfilling practising competencies from membership, then
  read the generated `upgrade()` before committing, as the rule requires.

  Written by hand in the end. There is no model change here, so autogenerate
  produces an empty `upgrade()` and `just migrate` correctly refuses to keep
  it. The migration is `b4c2e7a91f38`.

  Two things were wrong on the first attempt and running it caught both. A
  bare `NULL` in a `SELECT` is typed as text, so Postgres refused the insert
  into an integer foreign key and it needs `CAST(NULL AS integer)`. More
  importantly, **only membership of an organisation confers administration**:
  `get_member_org_unit_ids` reads `organisation_org_unit_member`, which is
  `org_unit_member` narrowed to places whose _type_ can start a tree. A
  membership of a ward reaches nothing, not even the ward. The first version
  joined `org_unit_member` directly and would have written rows for people
  who administer nothing today, widening access rather than copying it
  faithfully.

  The type test matters rather than `parent_id IS NULL`: a detached ward has
  no parent either, and treating it as an organisation would give its members
  the run of somewhere nobody is accountable for.

- [x] **Make the backfill idempotent and give it a real `downgrade()`.** Every
      migration here must ship one. Deleting only the rows the backfill itself
      created is the honest reverse, which means the migration should be able to
      recognise its own rows: consider a distinct `authorised_by` of `NULL` plus a
      known `authorised_at`, or record the ids. Decide when writing it and note it in
      the migration's docstring.

  `authorised_by IS NULL` is the marker. Every row the API writes names the
  person who authorised it; these name nobody, because nobody did. A row whose
  authoriser was later deleted also has NULL and a downgrade would remove it,
  which is accepted: it is the same competency at a place that person
  administers anyway, and the alternative is a marker column carried forever
  for one migration's benefit.

  Idempotency comes from a `NOT EXISTS` clause rather than the unique
  constraint, so a second run adds nothing instead of failing. Verified by
  running `upgrade head`, `downgrade -1` and `upgrade head` again against a
  real Postgres from `compose.migrate.yml`.

- [ ] **Verify the backfill against a copy of production data before Phase 4 is
      deployed.** Left for a human with access to that data. What stands in
      for it here is `backend/tests/test_practising_competency_backfill.py`,
      which pins the set the SQL must reproduce against
      `org_units_administered_by`, and two guards that fail if
      `shared/base-professions.yaml` grows a profession granting `manage_users`,
      or `shared/org-unit-types.yaml` grows a root type, that the migration's
      frozen literals do not name.

      The original point stands: the count of rows created should equal the
      number of
      administrator-and-place pairs that exist today. A backfill that silently
      produces zero rows would make Phase 4 lock out every administrator at once.

## Phase 4: Switch `manage_users` onto the rows

- [x] **Change the `manage_users` endpoints in
      `backend/app/org_units/router.py` from `DEP_REQUIRE_MANAGE_USERS` to the new
      place-aware dependency**, one route at a time, starting with the read-only
      `GET` routes so a mistake is visible before it can deny a write. There are
      roughly a dozen, each already taking `unit_id` in its path, which is the
      parameter the dependency reads.

  `list_org_units` is the exception and stays as it is: it takes no `unit_id`,
  because it is the route that _discovers_ which places the caller may
  administer. It should scope on the caller's practising rows instead of
  `places_administered_by`, which is a change to `_visible_ids` rather than to
  the dependency.

  **Departed from the plan: no route changed its dependency.** All ten
  `unit_id` routes already call `_require_visible`, which calls
  `_visible_ids`, and `create_org_unit` calls it for the parent it is given.
  So repointing that one function switched every route at once, and swapping
  `DEP_REQUIRE_MANAGE_USERS` for `has_competency_at` on each would have been
  a second check of the same thing. `has_competency_at` from Phase 1 stays
  as the tool for routes whose place check is not already routed through
  `_require_visible`.

- [x] **Point `_visible_ids` at practising rows.** It currently delegates
      straight to `places_administered_by`, which answers from membership plus every
      descendant. Reading rows instead is what makes "administer this ward but not
      the trust above it" expressible, and that non-inheritance is the property
      `models.py` calls out as the whole point of the table. Keep the operator branch
      returning `None`.

  Changed in `org_units_administered_by` itself rather than in
  `_visible_ids`, because `main.py` asks the same question in two places:
  `_require_org_units_the_caller_administers`, and the membership-clearing
  branch of the user update. Two surfaces disagreeing about who administers
  a place is worse than either answer, so both moved together.

  `descendant_ids` is no longer imported there, and the docstring on
  `get_reachable_org_unit_ids` that named `get_member_org_unit_ids` as the
  admin check now names this function.

- [x] **Leave `grant_staff_competencies` alone, and say why here.** It runs
      inside `add_org_unit_member` and writes to the _ceiling_ — base profession and
      additional competencies — not to practising rows. That is correct: adding
      somebody as staff should make them qualified, and authorising them to practise
      at that place is the separate decision Phase 2 gives a surface to. Changing it
      to write rows would collapse the two halves of the model back into one.

- [x] **Run the backend suite for the routes touched**, `just ub -k
"org_unit"`, plus the new tests from phases 1 and 2. This phase changes live
      authorisation, so it is the one place in this plan where a wider local run is
      justified under the test-tier rule in `CLAUDE.md`.

  Run, and it found 41 failures across 11 files, every one a fixture that
  granted membership and expected administration. That is the change
  working rather than a regression, so an `administers()` helper was added
  to `conftest.py` and the fixtures now say both facts. Worth naming:
  `test_manage_staff_membership.py` needed a `manage_users` row for an
  admin whose competency under test is `manage_staff_membership`, because
  seeing a place and acting at it are separate checks.

  `test_practising_competency_backfill.py` had to stop asking
  `org_units_administered_by` what membership implies, which became
  circular the moment this unit repointed it. It asks
  `get_member_org_unit_ids` and `descendant_ids` directly now.

  One unrelated flake: `test_security_pentest.py::test_wrong_password_rejected`
  failed once in a full run and passes on its own. Password hashing, nothing
  to do with this.

## Phase 5: Make it visible

- [ ] **Add a practising-competencies panel to the place admin screens under
      `frontend/src/pages/admin/`**, listing who may practise what here, with grant
      and withdraw actions gated on `manage_practising_competencies` via
      `useHasCompetency`. Until this exists the rows can only be written by hand,
      and an authorisation model nobody can see is one nobody will maintain.

- [ ] **Build it from existing components**, per the Storybook-first hierarchy in
      `CLAUDE.md`: `BaseCard`, the `Icon` wrapper, and `ButtonPair` for the
      confirm-and-cancel pair on withdrawal. Withdrawal needs a confirmation step,
      because it removes somebody's authorisation to work and there is no undo.

- [ ] **Ship `.stories.tsx` and `.test.tsx` beside every new component**, as all
      reusable UI here must. Cover the empty state, which is the common one: most
      places will have no rows at first.

## Phase 6: Close the loop on clinical competencies

- [ ] **Apply the dependency to the first clinical endpoint that needs it, when
      one exists.** No endpoint carries a clinical competency check today. The
      surgeon case is unenforceable not because the model is wrong but because Quill
      does not yet ask the question anywhere, and this phase exists so that gap is
      recorded rather than forgotten.

- [ ] **Write the suspended-surgeon case as a test when that endpoint lands**:
      ceiling keeps the competency, one place has a row and the other does not, and
      the same person is allowed at one and refused at the other. That is the case
      this whole model exists for, and it should be pinned by a test naming it.

## Decisions

- **A withdrawn row does not vacate a position won on it.** `positions.appoint`
  checks `can_practise_at` when somebody is appointed, and nothing re-checks
  afterwards, so a suspended surgeon who is clinical lead of a ward stays clinical
  lead. Deliberately deferred: withdrawing the authorisation is the urgent half,
  and whether a post should follow it is a governance question worth answering
  properly rather than guessing at now. Revisit when the position surfaces are
  built out.

- **Operators bypass the row check.** An operator with no rows would otherwise be
  locked out of the estate they exist to run. Recorded as a decision rather than
  left implicit, because it is the one route by which somebody reaches a place
  with no row authorising them.

- **`manage_practising_competencies` is separate from `manage_users`.**
  Authorising practice and creating accounts are different decisions and should
  be granted separately, even though a `manage_users` holder can already mint
  any competency in the catalogue. That existing weakness is a reason to keep new
  authority out of it, not a reason to add more.
