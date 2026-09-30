# Manage teaching competency plan

Whoever runs teaching at an organisation or site needs to curate the question
banks and also sign up the delegates who sit them. Today that means one of
two professions: `teaching_admin`, which can manage content but add nobody,
or `teaching_manager`, which adds `manage_users`. `manage_users` is the root
competency. Its holder can grant anything in the catalogue, including
`manage_users` itself. It also gates site CRUD, organisation editing, feature
toggles and account deletion for everyone. A teaching coordinator ends up
able to hand out clinical competencies and delete a consultant's account.

The outcome is one competency, `manage_teaching`, that covers both halves of
the job and nothing beyond them. Its holder manages teaching content, and
grants and removes only the teaching competencies and teaching professions,
which are named in a whitelist in the YAML. They only do this for people at
the `org_unit`s they belong to. `teaching_admin` becomes the single teaching
profession that carries it. `teaching_manager` goes, and `manage_users` stays
as the rarely granted root.

## Phase 1: The competency and its grant scope

- [x] **Add `manage_teaching` to `shared/competency-definitions/teaching.yaml`**,
      with two new fields listing what its holder may hand out:
      `may_grant: [view_teaching_cases, manage_teaching, view_teaching_analytics]`
      and
      `may_assign_professions: [teaching_delegate, teaching_clinical_lead, teaching_admin]`.
      `manage_teaching` is on its own list so that one coordinator can
      appoint another without needing `manage_users`.
- [x] **Extend `CompetencyEntry` in `backend/app/cbac/competencies.py`** with
      `may_grant: list[str] | None` and `may_assign_professions: list[str] | None`,
      both defaulting to None. Validate at load time that every id they
      list exists and is not retired, and that no list contains
      `manage_users`. A typo here would otherwise fail silently, because an
      unknown id grants nothing. The profession ids are checked in
      `grant_scope.py` instead, because the two catalogues load separately
      and neither loader should import the other.
- [x] **Add `backend/app/cbac/grant_scope.py`** as the one place that answers
      "may this caller hand this out?". Holding `manage_users` means no
      limit. Otherwise the scope is the union of `may_grant` and
      `may_assign_professions` across the competencies the caller holds.
      It exposes `may_grant(user, competency)`,
      `may_assign_profession(user, profession)` and
      `may_manage_account(user, target)`. The last is true only when the
      target's current profession is assignable by the caller. That stops a
      teaching admin changing a clinician's profession or deactivating their
      account, even when the clinician also sits teaching assessments.
- [x] **Add the two fields to the competency type** in
      `frontend/src/types/cbac.ts`. The generated JSON passes every YAML
      field through, so `yarn generate:types` needs no change.
- [x] **Unit tests** for `grant_scope.py`: `manage_users` is unlimited; a
      `manage_teaching` holder may grant only the three teaching
      competencies and assign only the three teaching professions; a
      holder may not manage the account of anyone whose profession is
      outside the list; a YAML entry naming an unknown or retired id fails
      to load.

## Phase 2: Switch teaching to `manage_teaching`

This phase and the teaching content routes land as one unit. Moving the
rows to `manage_teaching` while `_DEP_MANAGE` still asks for
`manage_teaching_content` would lock every teaching admin out of the
question banks for as long as the two sat on `main` apart, and merging a
unit deploys it. Found while building Phase 1, which is also why retiring
`manage_teaching_content` moved here from there: a retired id cannot sit in
a profession's `base_competencies`, and `teaching_admin` lists it until this
phase.

- [x] **Retire `manage_teaching_content`** by setting `retired_on` on its
      entry, not by deleting it. `CompetencyEntry` retires entries rather
      than deleting them, so that old rows and old audit entries still name
      something the catalogue knows.
- [x] **Change `teaching_admin` in `shared/base-professions.yaml`** so its
      `base_competencies` are `view_teaching_cases`, `manage_teaching` and
      `view_teaching_analytics`. Rewrite the comment above it: it no longer
      "curates content rather than accounts", it does both within the
      teaching whitelist.
- [x] **Data migration**, `16834fc0663d`, written by hand. `just migrate`
      finds no model change and deletes an empty revision, so it cannot
      start one:
      - move every user whose `base_profession` is `teaching_manager` to
        `teaching_admin`
      - for every open `user_competency` row for `manage_teaching_content`,
        close it (`ends_on` now) and insert a `manage_teaching` row with the
        same `source` and `granted_by`. Rows are closed, never deleted, so
        the history still shows who held the old competency.
      - point `practising_competency` rows at `manage_teaching` in place,
        keeping `authorised_by`. A practising row has no dates, since its
        existence is the authorisation, so there is no history to close
      - close any `manage_users`, `manage_staff_membership` and
        `manage_practising_competencies` rows whose `source` is
        `profession` on the users just moved from `teaching_manager`,
        because the new profession does not grant them. Rows granted by
        hand stay open.
      - `downgrade()` reverses the row moves. It cannot tell a former
        `teaching_manager` from a `teaching_admin`, so it leaves
        professions as they are and says so in its docstring.
- [x] **Remove `teaching_manager`** from `shared/base-professions.yaml`, in
      the same change as the migration. An unknown profession resolves to
      no competencies at all, so it must not outlive the users on it.
- [x] **Update `backend/scripts/seed_ci.py`**: the `usermanager` user moves to
      `teaching_admin`, and is given `manage_users`, `manage_staff_membership`
      and `manage_practising_competencies` explicitly, which is what
      `teaching_manager` gave it. `member-practice.spec.ts` signs in as it to
      grant competencies and switch practice, which needs the unscoped
      `manage_users` until Phase 3 opens those routes to `manage_teaching`,
      and arguably after, since the journey is not about teaching.
- [x] **Update `dev-scripts/seed-teaching-data.sh`**. It still passes
      `system_permissions: "admin"`, which the platform role work removed, so
      drop it while here.
- [x] **Tests**: `test_base_professions.py` pins the new `teaching_admin` set
      and that `teaching_manager` is gone. `test_manage_teaching_migration.py`
      runs the migration against Postgres, in the style of
      `test_profession_seed_backfill.py`: a manager's seeded root rows close
      and hand-granted ones stay, other professions keep `manage_users`,
      practising rows move, and the downgrade moves the competency back.

- [x] **Switch `_DEP_MANAGE` in `backend/app/features/teaching/router.py`**
      from `manage_teaching_content` to `manage_teaching`. It gates 22
      routes, so the change is one line and the membership scoping beside
      each route stays as it is.
- [x] **Switch the frontend checks** in `SideNavContent.tsx`,
      `AllResults.tsx` and `AdminTeachingDashboard.tsx`, plus their tests and
      `frontend/src/lib/cbac/hooks.test.tsx`.
- [x] **Update the backend tests** that name `manage_teaching_content`:
      `test_teaching_router.py`, `test_teaching_admin_needs_membership.py`,
      `test_teaching_authority_needs_membership.py`,
      `test_list_delegates_site_and_lead.py`, `test_auth.py` and
      `test_competencies.py`.

## Phase 3: Scoped people routes

Each route below today needs `manage_users`, `manage_staff_membership` or
`manage_practising_competencies`. Each one now also accepts `manage_teaching`,
through a dependency that passes when the caller holds either the existing
competency or `manage_teaching`. The route body then checks `grant_scope.py`.
Where the caller holds the existing competency, nothing changes for them.

This lands as two units: the `/api/users` routes, then the org unit routes.
Together they were more than one pull request could carry readably.

### The `/api/users` routes

- [x] **One gate, `DEP_REQUIRE_MANAGE_PEOPLE`**, in `backend/app/main.py`,
      admitting `manage_users` or `manage_teaching`, on the seven routes
      below. Three helpers beside it do the refusing, each a 403 naming
      what was refused: `_require_changes_in_scope`,
      `_require_profession_in_scope` and `_require_account_in_scope`.
- [x] **Where a teaching admin places people.** Found while building: the
      plan said membership decides _where_, but `/api/users` asks two
      different things. Acting on one person by id asks
      `_require_shared_org_with_user`, which is membership, and that stays.
      Choosing which `org_unit`s a new or edited person belongs to asks
      `org_units_administered_by`, which reads `practising_competency`
      rows carrying `manage_users`, and a teaching admin has none. So
      `_org_units_the_caller_places_people_in` adds, for a holder of
      `manage_teaching`, the `org_unit`s they belong to. That matches
      teaching's own admin routes, which already scope a teaching admin by
      membership (`test_teaching_admin_needs_membership.py`).
- [x] **`POST /api/users`** (`create_user_with_cbac`): with a limited scope,
      the profession must be one the caller may give, the competencies the
      new account would hold must all be in scope, the platform role must
      be `standard`, and at least one `org_unit` must be named. The last is
      because a limited scope reaches an account only through a shared
      `org_unit`, so an account created in none would be out of reach the
      moment it existed.
- [x] **`PATCH /api/users/{user_id}`** (`update_user`): compares what the
      person holds now with what they would hold after the request, so
      hand-edited lists, profession carry-over and a new profession's
      template are all checked the same way, and removal counts as much as
      granting. Anything else on the account (username, name, email,
      password, profession, platform role, `org_unit_ids`) needs
      `may_manage_account`. So a teaching admin can give a consultant a
      teaching competency, and cannot reset their password.
- [x] **Deactivate, reactivate and send-invite** under `/api/users/{user_id}`:
      need `may_manage_account` on the target.
- [x] **`GET /api/users` and `GET /api/users/{user_id}`**: open to a teaching
      admin with the existing membership scoping, so they see everyone at
      their `org_unit`s, clinicians included, because they may give a
      clinician a teaching competency. The `patient_id` mode of
      `GET /api/users`, the message participant picker, stays
      `manage_users`-only: it is about a patient, not teaching.
- [x] **Tests** in `test_manage_teaching_user_routes.py`: what a teaching
      admin may do (create a delegate at their trust, give a clinician a
      teaching competency, edit and deactivate a delegate, read and list),
      one test per way the limit could leak (a clinical profession, a
      clinical competency on a new account, no `org_unit`, an operator,
      granting `manage_users`, removing a clinical competency, changing a
      clinician's profession, resetting their password, deactivating,
      reactivating or inviting them, the patient picker), and that a
      `manage_users` holder still reaches clinicians.

### The org unit routes

- [ ] **Staff membership**, `POST` and `DELETE` on
      `/api/org-units/{unit_id}/members`: a `manage_teaching` holder may add
      or remove a person whose profession is in their scope. The clinical
      lead route, `PUT /{unit_id}/clinical-lead`, stays on
      `manage_staff_membership` alone, because a clinical lead is not a
      teaching appointment.
- [ ] **Practice**, the three `/practising-competencies` routes, `GET
      /members/{user_id}/practice` and `POST
      /members/{user_id}/grant-and-authorise`: a `manage_teaching` holder may
      authorise, withdraw and grant only competencies in scope. The member
      practice page lists everything the person holds, so the response
      gains a per-competency `may_change` flag rather than hiding rows.
- [ ] **Everything else `manage_users` gates stays on `manage_users` alone**:
      org unit create, edit, activate and delete, features, passport
      specialties, links, and the patient routes.
- [ ] **Tests**, pinning both halves: a `manage_teaching` holder can do the
      teaching thing, and gets a 403 on the clinical one.

## Phase 4: Frontend

- [ ] **Expose the caller's grant scope** on the auth `me` response as
      `may_grant` and `may_assign_professions`, both lists, or
      null for no limit. Pickers read these rather than working the whitelist
      out again in the browser.
- [ ] **Open `/admin` to either competency** in `frontend/src/main.tsx`, using
      `useHasAnyCompetency(["manage_users", "manage_teaching"])` or an
      equivalent guard. The same change goes in `featureNavItems.ts` and the
      `LoginPage.tsx` redirect. Individual admin pages that stay
      `manage_users`-only (organisation editing, features, links) get their
      own `RequireCompetency` so a teaching admin reaches a 404, not a broken
      page.
- [ ] **Filter the pickers** on the add and edit user pages, and in
      `GrantCompetencyModal`, to the caller's scope.
- [ ] **Disable, rather than hide, the practice switches** in
      `MemberPracticePanel` when `may_change` is false, so a teaching admin
      can still see a clinician's clinical competencies but not change them.
- [ ] **Stories and tests** for each changed component, with a story showing
      a teaching admin's view.

## Phase 5: Documentation and accessibility

- [ ] **Reword the `manage_users` note in `shared/competency-definitions/admin.yaml`.**
      It says capping a holder was considered and rejected. That rejected
      capping by what the holder themselves holds, which is a seniority
      model. `manage_teaching` caps by a declared domain instead, so the note
      should say the two are different and point here.
- [ ] **Update `.github/copilot-instructions.md`** under CBAC to describe
      `may_grant` and `may_assign_professions`, then run `/sync-copilot-config`.
- [ ] **Accessibility journeys**: this changes who sees the Admin entry in
      the navigation. Name the journeys in
      `docs/docs/frontend/accessibility/journeys.md` that pass through the
      admin navigation, and add them to "Not yet run" in `testing-log.md`.

## Decisions

- **One competency for content and people** – `manage_teaching` replaces
  `manage_teaching_content` rather than sitting beside it. A person who may
  only curate content and never add a delegate is not a role anybody has
  asked for, and two competencies would bring back the split this plan
  removes.

- **The whitelist lives on the granting competency, not as a tag on each
  granted one** – tagging each competency with a domain would make a new
  teaching competency open to granting the moment it is tagged, without anyone
  looking at who can hand it out. A list on `manage_teaching` is a
  whitelist: nothing can be granted until someone adds it there.

- **The scope limits removal as well as granting** – without that, a teaching
  admin could remove a consultant's clinical competencies, move a nurse to
  `teaching_delegate`, or deactivate a clinician. Account-level acts need
  the target's own profession to be in scope. So a clinician who also sits
  teaching assessments can be given or lose teaching competencies, and
  nothing else.

- **`manage_users` stays the root, unchanged** – capping it too would be a
  wider change touching every admin route. It stays for very few people,
  and the teaching role no longer needs it.

- **A caller holding both `manage_users` and `manage_teaching` has no
  limit anywhere** – the scope is worked out from what they hold, not from
  where they hold it. So somebody with `manage_users` at one trust and
  `manage_teaching` at another could give a clinical profession at the
  second. Scoping per place would need a scope for each `org_unit`, and
  `manage_users` is already the rarely granted root. Revisit if the two
  are ever routinely held together.

- **Keep the id `teaching_admin`, drop `teaching_manager`** – `teaching_admin`
  is the one used across the tests, the CI seed and the dev seed script.
  There are no real users yet, so moving any `teaching_manager` holders in
  a migration costs nothing.
