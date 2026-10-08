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

- [x] **Three gates**, in `backend/app/org_units/router.py`, each admitting
      the competency the route always needed or `manage_teaching`. A
      holder of the original competency sees no change. `_through_teaching`
      says when a caller reached the route through `manage_teaching` alone;
      only then does the route narrow what they may see to the `org_unit`s
      they belong to, and what they may change to the whitelist.
- [x] **Reads.** `GET /api/org-units` and `GET /{unit_id}/members` are open to
      a teaching admin, for the `org_unit`s they belong to. `GET /{unit_id}`
      is not: its detail carries features and the patient list, which are
      not teaching's business. Found while building; Phase 4 needs a way to
      show a teaching admin their `org_unit` that does not go through it.
- [x] **Staff membership**, `POST` and `DELETE` on
      `/api/org-units/{unit_id}/members`: a `manage_teaching` holder may add
      or remove a person whose profession is in their scope, give only a
      teaching profession, and grant only teaching competencies on adding
      them. The clinical lead route, `PUT /{unit_id}/clinical-lead`, stays on
      `manage_staff_membership` alone, because a clinical lead is not a
      teaching appointment.
- [x] **Practice**, the three `/practising-competencies` routes, `GET
      /members/{user_id}/practice` and `POST
      /members/{user_id}/grant-and-authorise`: a `manage_teaching` holder may
      authorise, withdraw and grant only competencies in scope, for members
      of their `org_unit`. The list of practising rows shows them only the
      teaching ones. The member practice response gains `may_change`, the
      competencies the caller may change there, or null for no limit, so
      the page can show everything the person holds and offer to change
      only some of it. An optional response field, so additive.
- [x] **Everything else `manage_users` gates stays on `manage_users` alone**:
      org unit create, read, edit, activate and delete, features, passport
      specialties, links, and the patient routes.
- [x] **Tests** in `test_manage_teaching_org_unit_routes.py`: at their own
      `org_unit` a teaching admin lists, adds and removes delegates,
      authorises, withdraws, and grants teaching competencies, and sees
      `may_change`. Beyond the whitelist they cannot reach another
      `org_unit`, open the `org_unit` itself, add or remove a clinician,
      give a clinical competency on adding someone, authorise, withdraw or
      grant a clinical competency, or see clinical practice rows.

## Phase 4: One org unit page, sections by competency

An `org_unit` may one day run both teaching and clinical services, so a
teaching admin uses the same organisation and site pages as everybody else
rather than a separate teaching page listing the same staff twice. Each
section of the page appears only for the competency it needs. The backend
leaves out what a caller may not see, rather than the page hiding it, so a
section added later cannot leak patient data by forgetting to hide itself:
the data never reaches the browser.

This phase replaces a first draft that opened `/admin` to teaching admins
and put a `RequireCompetency` on each page they should not reach. Found
while building Phase 3: the organisation page fetches
`GET /api/org-units/{unit_id}`, whose detail carries features and the
patient list, so that route could not be opened as it was.

- [x] **`GET /api/org-units/{unit_id}` opens to `manage_teaching`**, for the
      `org_unit`s the caller belongs to, through
      `DEP_REQUIRE_MANAGE_USERS_OR_TEACHING` and `_require_visible` with
      `"manage_users"`, as the member list already does. The response
      leaves out what the caller's competencies do not cover:
      - the patient list only for `manage_patient_membership` or
        `manage_users`
      - features, links and passport specialties only for `manage_users`

      Left out means empty, not a different shape, so the response model
      does not change and `oasdiff` has nothing to flag. Tests pin that a
      teaching admin gets the `org_unit` and its staff with no patients and
      no features, and that a `manage_users` holder still gets everything.
      Links and passport specialties turned out not to be in the detail at
      all: they have routes of their own, which stay `manage_users`-only.
      The detail's `children` (the sites inside an organisation, with
      their clinical lead's name) still come back to a teaching admin,
      since the page draws them and they carry no patient data.
- [x] **Expose the caller's grant scope** on the auth `me` response as
      `may_grant` and `may_assign_professions`, both lists, or null for no
      limit. Pickers read these rather than working the whitelist out again
      in the browser. Optional fields, so additive. Empty lists for
      somebody who may grant nothing, which the tests in
      `test_grant_scope.py` pin beside the teaching and unlimited cases.
- [x] **Open `/admin` and the organisation and site pages to either
      competency** in `frontend/src/main.tsx`, with
      `useHasAnyCompetency(["manage_users", "manage_teaching"])` or an
      equivalent guard. The same change goes in `featureNavItems.ts` and the
      `LoginPage.tsx` redirect. The pages that stay `manage_users`-only
      (creating, editing and deleting an organisation or site, features,
      links, patients) get their own `RequireCompetency`, so a teaching
      admin reaches a 404 there rather than a page that fails to load.
      `RequireCompetency` now takes a list, any one of which opens the
      route. The member practice routes take `manage_practising_competencies`
      or `manage_teaching`. The site pages stay operator-only, as they
      were. Found while building: `/admin/teaching` and
      `/admin/teaching/all-delegates` sat behind `manage_users` too, so a
      teaching admin without it could not reach teaching's own admin
      dashboard; opening `/admin` fixes that as a side effect. The Admin
      landing page and the side navigation leave out the patient count and
      the Patients entry for anybody without `manage_users`.
- [x] **Show each section of the organisation and site pages by
      competency.** Staff and member practice for `manage_users` or
      `manage_teaching`. Patients for `manage_patient_membership` or
      `manage_users`. Features, links, edit and delete for `manage_users`.
      A section with no data from the backend is not drawn at all, rather
      than drawn empty. Done on `OrganisationAdminPage` only: the site
      pages are operator-only, so nobody else reaches them. Removing a
      site from the organisation stays `manage_users`, as does the add
      patient button; the patient list itself shows for
      `manage_patient_membership` too, matching the backend.
- [x] **Filter the pickers** on the add and edit user pages, the add staff
      page and `GrantCompetencyModal` to the caller's `may_grant` and
      `may_assign_professions`. Read through `useGrantScope` in
      `frontend/src/lib/cbac/hooks.ts`. The user form still lists the
      person's current profession and competencies when they fall outside
      the scope, so an edit shows what they hold. Found while building:
      the user form sends every field on every save, and `update_user`
      treated any field sent as a change to the account, so a teaching
      admin could not save even a delegate. It now counts a field only
      when its value differs, with tests for a whole-form save that
      changes only a teaching competency and one that renames a
      clinician.
- [x] **Disable, rather than hide, the practice switches** in
      `MemberPracticePanel` for any competency not in `may_change`, so a
      teaching admin still sees a clinician's clinical competencies but
      cannot change them.
- [x] **Stories and tests** for each changed component, with a story showing
      a teaching admin's view of the organisation page, the member practice
      panel and the grant modal. Pages carry no stories here, so the
      organisation page's teaching view is pinned in its tests; the
      `Admin` landing and `MemberPracticePanel` gained a teaching admin
      story each, the panel's covering the grant modal it opens.

## Phase 5: Documentation and accessibility

- [x] **Reword the `manage_users` note in `shared/competency-definitions/admin.yaml`.**
      It says capping a holder was considered and rejected. That rejected
      capping by what the holder themselves holds, which is a seniority
      model. `manage_teaching` caps by a declared domain instead, so the note
      should say the two are different and point here.
- [x] **Update `.github/copilot-instructions.md`** under CBAC to describe
      `may_grant` and `may_assign_professions`, then run `/sync-copilot-config`.
      The paragraph is added to the source. The sync ran as a dry run only:
      ten sources have drifted since its last run on 2026-09-26, nine of
      them unrelated to this plan, so applying it belongs in its own piece
      of work rather than folded in here. Until then CLAUDE.md lacks the
      paragraph.
- [x] **Accessibility journeys**: this changes who sees the Admin entry in
      the navigation. Name the journeys in
      `docs/docs/frontend/accessibility/journeys.md` that pass through the
      admin navigation, and add them to "Not yet run" in `testing-log.md`.
      No journey covers the admin pages themselves. Journeys 1 and 3 pass
      through the changed parts (the sign-in redirect and the teaching
      sidebar), so "Journeys 1 and 3 as a teaching admin" is added.

## Phase 6: A site opens from its organisation

Found in use: a teaching admin could open their organisation's page, but
the sites listed on it were not links. Every route under `/admin/sites`
had been made operator-only, where the intent was narrower: only the Sites
entry in the side navigation and the list of every site behind it.

- [x] **Only `/admin/sites` and `/admin/sites/new` stay operator-only** in
      `frontend/src/main.tsx`. `/admin/sites/:id`, its add staff page and
      its member practice page open to whoever may open `/admin`. Editing a
      site, and adding one to an organisation, take `manage_users`, as
      editing an organisation does.
- [x] **The sites on `OrganisationAdminPage` are links again** for
      everybody, and Add site shows for `manage_users`.
- [x] **`SiteAdminPage` shows each action by competency**, as the
      organisation page does: Edit site and the enabled features card for
      `manage_users` (as is `/admin/sites/:id/features`), Add staff and
      Remove from site for `manage_staff_membership` or `manage_teaching`,
      and a member's row opens their practice page for
      `manage_practising_competencies` or `manage_teaching`.
- [x] **A teaching admin reaches the `org_unit`s beneath their
      organisations**, through `_scoped_manager_ids` in
      `backend/app/org_units/router.py`. Before, `_require_visible` and
      `GET /api/org-units` gave them only the organisations they belong
      to, so a site returned a 404 even to one of its own members.
      Authority flows down the tree and never up or across. This is for a
      caller who reaches a route through `manage_teaching` alone; a
      `manage_users` holder is still scoped by `practising_competency`
      rows, where nothing is inherited.
- [x] **Tests**: `test_manage_teaching_org_unit_routes.py` pins that a
      teaching admin opens and lists a ward of their trust without
      belonging to it, and gets a 404 for a ward of another trust. The
      page tests pin the links and which actions each competency sees.

## Phase 7: Administering reaches downward for `manage_users` too

Phase 6 left the two kinds of administrator disagreeing: a teaching admin
reached everything beneath their organisations, while a `manage_users`
holder reached only the `org_unit`s carrying a `practising_competency` row
of their own, so a site added to a trust later was out of their reach
until a row was written there.

- [x] **`org_units_administered_by` in `backend/app/organisations.py`
      returns each `org_unit` with a `manage_users` row and everything
      beneath it**, through `descendant_ids`. It still never reaches
      upward or sideways, so a ward manager administers their ward and
      not the trust. Both `/api/org-units` and `/api/users` ask this one
      function, so they change together. What somebody may practise at an
      `org_unit`, in `backend/app/cbac/scoped.py`, is untouched: still
      one row per `org_unit`.
- [x] **Tests** in `test_administered_places_come_from_rows.py`: a row at
      a trust reaches its wards, including one added later, and not
      another trust; a row at a ward reaches neither its trust nor the
      ward next door; and the same through `GET /api/org-units/{unit_id}`.
- [x] **`.github/copilot-instructions.md` and `CLAUDE.md`** say that
      administering is the one exception to "nothing is inherited".
- [x] **Accessibility**: Phase 6 makes the site rows on an organisation's
      admin page links for everybody, which changes how people move around
      the admin area. No journey in
      `docs/docs/frontend/accessibility/journeys.md` covers the admin
      pages, so "The site page as a teaching admin" is added to "Not yet
      run" in `testing-log.md` as a named page.

## Phase 8: A scoped manager adds a site

Phase 3 left every org unit write on `manage_users`. Adding a site turned
out to be part of the job: a teaching body signs up member hospitals as it
signs up their delegates, and its coordinator had to ask an operator each
time. Creating a site, and only that, now opens to a scoped manager.

- [x] `POST /api/org-units` admits `manage_users` or any scoped manager.
      A scoped manager names a parent among the `org_unit`s they act at,
      the same set `_scoped_manager_ids` gives the read routes. Naming no
      parent, which creates an organisation, stays with an operator.
- [x] `PUT /api/org-units/{id}` and `PATCH /api/org-units/{id}/active`
      admit a scoped manager too, for a site they act at: its name, kind,
      address, and whether it is in use. An organisation is refused them,
      and so is moving a site into an `org_unit` they do not act at.
- [x] Deleting an `org_unit`, and its features, stay on `manage_users`
      alone.
- [x] The site page offers "Edit site" to a scoped manager, and the
      `sites/:id/edit` route admits one.
- [x] The organisation page offers "Add site" to a scoped manager, and the
      `organisations/:id/add-site` route admits one.
- [x] The sites list, `/admin/sites`, offers "Add site" to whoever may
      create one, and `sites/new` admits `manage_users` or a scoped
      manager where it was operator-only. `CreateSitePage` asks for an
      "Organisation" and offers only the organisations the API lists for
      the caller, so a teaching admin picks among the ones they belong to.
      It offers a clinical lead as well, to whoever may appoint one.
- [x] **The tree is two levels for now**: an organisation, and the sites
      directly inside it. `POST /api/org-units` and a move through
      `PUT /api/org-units/{id}` refuse a parent that is not an
      organisation. The model and `descendant_ids` still describe any
      depth, and a row already deeper is left alone; the rule is one
      check, `_require_parent_is_an_organisation`, to take out when a
      third level is wanted.
- [x] `PUT /api/org-units/{id}/clinical-lead` admits
      `manage_staff_membership` or any scoped manager, at an `org_unit`
      they act at: whoever runs teaching somewhere names its lead,
      themselves included, at a site or at the organisation. The site's
      add-staff page already offered a teaching admin the "Clinical lead"
      role, and the route refused it after the person had been added.
- [x] `AddSiteToOrgPage` offers the clinical lead picker to the same
      people. Anybody else creates the site with the post vacant.
- [x] Tests: a teaching admin adds a site in their own trust and can open
      it, edits it and puts it out of use, and cannot add or edit one in
      another trust, create or edit an organisation, or delete a site.

## Decisions

- **One competency for content and people** - `manage_teaching` replaces
  `manage_teaching_content` rather than sitting beside it. A person who may
  only curate content and never add a delegate is not a role anybody has
  asked for, and two competencies would bring back the split this plan
  removes.

- **The whitelist lives on the granting competency, not as a tag on each
  granted one** - tagging each competency with a domain would make a new
  teaching competency open to granting the moment it is tagged, without anyone
  looking at who can hand it out. A list on `manage_teaching` is a
  whitelist: nothing can be granted until someone adds it there.

- **The scope limits removal as well as granting** - without that, a teaching
  admin could remove a consultant's clinical competencies, move a nurse to
  `teaching_delegate`, or deactivate a clinician. Account-level acts need
  the target's own profession to be in scope. So a clinician who also sits
  teaching assessments can be given or lose teaching competencies, and
  nothing else.

- **`manage_users` stays the root, unchanged** - capping it too would be a
  wider change touching every admin route. It stays for very few people,
  and the teaching role no longer needs it.

- **A caller holding both `manage_users` and `manage_teaching` has no
  limit anywhere** - the scope is worked out from what they hold, not from
  where they hold it. So somebody with `manage_users` at one trust and
  `manage_teaching` at another could give a clinical profession at the
  second. Scoping per place would need a scope for each `org_unit`, and
  `manage_users` is already the rarely granted root. Revisit if the two
  are ever routinely held together.

- **One org unit page for everybody, not a separate teaching page** - an
  `org_unit` may one day run both teaching and clinical services, and two
  pages would list the same staff twice. Each section shows for the
  competency it needs, and the backend leaves out what a caller may not
  see, so a new section cannot leak patient data by forgetting to hide
  itself.

- **Administering flows down the tree; practising does not** - a
  `manage_users` row, and a teaching admin's membership, reach every
  `org_unit` beneath them. This reverses part of the practising
  competencies enforcement plan, which gave a row its own `org_unit` only.
  That plan's aim, a ward manager without trust-wide authority, still
  holds, because nothing flows upward. Clinical practice stays one row per
  `org_unit`: being authorised to prescribe at a trust should not mean
  being authorised on every ward.

- **Keep the id `teaching_admin`, drop `teaching_manager`** - `teaching_admin`
  is the one used across the tests, the CI seed and the dev seed script.
  There are no real users yet, so moving any `teaching_manager` holders in
  a migration costs nothing.
