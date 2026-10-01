# Passport professions plan

Teaching has its own set of professions: delegate, clinical lead and admin.
The passport has only `external_assessor`, which is given automatically to a
clinician from elsewhere when they accept an invitation to sign something off.
An organisation that takes up the passport without the rest of Quill has no
profession for the people who hold passports, for the named clinician who
leads the scheme at a place, or for whoever runs it. With clinical services
switched off, the new user form offers nothing suitable, because every
clinical profession needs clinical services.

The outcome is four passport professions, none of which needs clinical
services: `passport_delegate`, `passport_clinical_lead`, `passport_admin`
and `passport_external_assessor`, which is `external_assessor` renamed. The
admin gets a new `manage_passport` competency. It uses the grant scope from
the [manage teaching competency plan](2026-09-30-manage-teaching-competency-plan.md),
so a manager can take people on and give out passport roles without holding
`manage_users`.

## Phase 1: Rename the external assessor

- [x] **Rename the entry in `shared/base-professions.yaml`** to id
      `passport_external_assessor`, display name "Passport external
      assessor". Move it out of the "External, per-patient" section, where it
      ended up under the wrong heading (its "External assessors" comment block
      has no entry beneath it), into a new "Passport professions" section.
      Keep the comment explaining why the profession is the whole grant.
- [x] **Data migration** `4fd333faf33b`, handwritten because
      `just migrate` only autogenerates schema changes and refuses an empty
      revision. It updates `users.base_profession` from `external_assessor`
      to `passport_external_assessor`, and `downgrade()` reverses it.
      `base_profession` is the only column that stores a profession id.
      Nobody's access changes: `User.get_final_competencies` reads
      `user_competency` rows, which were copied from the profession when it
      was given. What the id still drives is a later change of profession,
      where `grant_staff_competencies` reads the old profession's template
      to decide what carries over, and an id missing from the YAML has an
      empty template. Covered against Postgres by
      `backend/tests/test_rename_external_assessor.py`, which the
      `alembic_drift_check` CI job runs with `-m migration`.
- [x] **Update the code that names it**: `base_profession=` in
      `accept_assessor_invite` in `backend/app/features/passport/router.py`,
      and the comments in `router.py` and `models.py` that name the
      profession.
- [x] **Leave the frozen text alone.** The alembic seed revision
      `56f3ad035100` and the migration tests that insert `external_assessor`
      (`test_drop_professional_registrations.py`,
      `test_professional_registration_backfill.py`) describe the data as it
      was before this migration, so they keep the old id.
- [x] **Update the tests** in `backend/tests/test_base_professions.py`,
      `backend/tests/test_passport_router.py` and
      `backend/tests/test_passport_registrations_from_rows.py` to use the
      new id, and run `yarn generate:types` in `frontend/`.

## Phase 2: Delegate and clinical lead

- [x] **Add `passport_delegate`** ("Passport delegate") to the new passport
      section, with `requires_clinical_services: false` and
      `base_competencies: [assess_clinician_passport]`. Today that one
      competency is how somebody gets into the passport at all: it lets a
      delegate read their own passport and sign off other people's. It
      does not let them write in it. `passport_write` is sold, either
      switched on for an organisation or paid for by an individual, and
      `test_no_profession_grants_the_right_to_write_a_passport` keeps it
      off every profession.
- [x] **Add `passport_clinical_lead`** ("Passport clinical lead") with the
      same competencies as the delegate. The role is a label: it names the
      clinician who leads the passport at their org unit, and gives them no
      extra powers. This is the same as `teaching_clinical_lead` compared
      with `teaching_delegate`.
- [x] **Follow the assessor access split if it lands first.** The
      [passport assessor access plan](2026-09-24-passport-assessor-access-plan.md)
      splits `assess_clinician_passport` into `review_clinician_passport`
      and `read_own_clinician_passport`. Whichever plan lands second gives
      both professions both competencies, and keeps
      `passport_external_assessor` on `review_clinician_passport` only.
      This plan got there first, so the step now sits in that plan's
      Phase 2, beside the `base-professions.yaml` change it belongs with.
- [x] **Tests**: add both professions to the holder set in
      `test_clinicians_hold_the_passport_and_others_do_not`, and update its
      docstring, which currently says the external assessor is the only
      exception. Add a test that neither profession needs clinical
      services, and one that the clinical lead holds exactly what the
      delegate holds, so it stays a label. Run `yarn generate:types`.

## Phase 3: Passport admin

This phase depends on the manage teaching competency plan, which added
`may_grant`, `may_assign_professions` and `backend/app/cbac/grant_scope.py`.
All of it had merged by 1 October 2026.

When that plan landed, the people routes asked `grant_scope` for _what_ a
caller may hand out, but still named `manage_teaching` to decide _who_ gets
through the door: seven places in the backend and about ten in the
frontend. A passport manager would have been refused at every one. So the
first two steps make "a competency with a whitelist" the test, and only
then is `manage_passport` added.

- [x] **Open the backend people routes to any scoped manager.**
      `SCOPED_MANAGER_IDS` in `backend/app/cbac/competencies.py` lists every
      current competency with a `may_grant` or `may_assign_professions`
      list. The gates in `backend/app/main.py` and
      `backend/app/org_units/router.py` that read
      `requires_any_competency(..., "manage_teaching")` now admit
      `*SCOPED_MANAGER_IDS`. `_through_teaching` became `_through_a_scope`,
      and the `_OR_TEACHING` gates became `_OR_SCOPED`. Today the list
      holds only `manage_teaching`, so nothing changes for anyone yet. The
      teaching content routes in `backend/app/features/teaching/router.py`
      keep `manage_teaching` by name, because they are about teaching,
      not about people. Tests in `backend/tests/test_grant_scope.py` pin
      the list to exactly the competencies that have a whitelist.
- [x] **Open the frontend admin area to any scoped manager.** The route
      guards in `frontend/src/main.tsx`, the Admin navigation item in
      `featureNavItems.ts`, the redirect after login in `LoginPage.tsx`
      and `OrganisationAdminPage` checked for `manage_teaching` by name.
      `SCOPED_MANAGER_IDS` in `frontend/src/types/cbac.ts` derives the same
      list as the backend from the generated catalogue, and each of them
      uses it. `SideNavContent` and `AdminTeachingDashboard` keep
      `manage_teaching`, because they show teaching content tools, not
      people. Tests in `frontend/src/types/cbac.test.ts` pin the list.

- [x] **Add `manage_passport` to `shared/competency-definitions/passport.yaml`**
      with `may_grant: [assess_clinician_passport, manage_passport]` and
      `may_assign_professions: [passport_delegate, passport_clinical_lead,
  passport_manager, passport_external_assessor]`. `manage_passport` is
      on its own list so that one manager can appoint another. The
      assessor access split had not landed by then, so the list names
      `assess_clinician_passport`; whichever change splits it updates this
      list too. Because it has a whitelist, it is a scoped manager from
      the moment it loads, and the two steps above let it through the
      people routes and the admin pages with no further change.
- [x] **Stop `passport_write` appearing on any `may_grant` list.**
      `SOLD_COMPETENCY` in `backend/app/cbac/competencies.py` is refused at
      load time, beside the check that keeps `manage_users` off. A manager
      who could grant it would be giving away the paid feature, and
      nothing would visibly go wrong.
- [x] **Add `passport_manager`** ("Passport manager") to
      `shared/base-professions.yaml` with `requires_clinical_services: false`
      and `base_competencies: [manage_passport]`. Leave out
      `assess_clinician_passport`: running the scheme is not the same as
      holding a passport, and a manager who is also a clinician can be
      given it.
- [x] **Tests**: `backend/tests/test_manage_passport_user_routes.py`
      covers what a passport manager may do through `/api/users`: create
      each passport profession at their own org unit, grant
      `assess_clinician_passport`, move a delegate to clinical lead,
      deactivate a delegate. It also covers what they may not do: grant
      `passport_write`, `manage_users`, a clinical or a teaching
      competency, give a clinical or teaching profession, or act on a
      clinician's or a teaching delegate's account. The load-time refusal
      of `passport_write` is in `backend/tests/test_grant_scope.py`.

- [x] **Rename `passport_manager` to `passport_admin`** ("Passport admin"),
      to mirror `teaching_admin`. The two are the same kind of role: each
      holds its scoped manager (`manage_teaching`, `manage_passport`) and
      not `manage_users`, and signs people up to its own professions at
      its own org units. "Passport manager" came from the original
      request; matching the teaching name was agreed on 1 October 2026.
      Change the id and display name in `shared/base-professions.yaml`,
      `may_assign_professions` on `manage_passport` in
      `shared/competency-definitions/passport.yaml`,
      `backend/tests/test_manage_passport_user_routes.py`,
      `backend/tests/test_grant_scope.py`, the passport professions section
      in `docs/docs/backend/passport/index.md`, and this plan. If PR #1302
      has not merged, fold the rename into it with `just stack-update`, so
      `passport_manager` never reaches `main` and no migration is needed.
      If it has merged, the rename needs a data migration for
      `users.base_profession`, as Phase 1 did for the external assessor.
      Done on 1 October 2026 while #1302 was still open: the rename was
      folded into it, and into #1303 for the passport docs, so no
      migration was needed. The branch keeps its name,
      `feature/passport-manager`.

- [x] **Let a Passport admin grant and remove `passport_write`.** There
      are three ways to get writing, each a `user_competency` row with its
      own `source`: paying as an individual (`individual`, Phase 6),
      joining an org unit whose cover is on (`organisation`, Phase 5), and
      being given it by a Passport admin or anyone above them (`admin`).
      This step is the third. Add `passport_write` to `manage_passport`'s
      `may_grant` list in `shared/competency-definitions/passport.yaml`.
      `SOLD_COMPETENCY` in `backend/app/cbac/competencies.py` currently
      refuses `passport_write` on every list; narrow it so that only
      `manage_passport` may name it, so `manage_teaching` or any later
      scoped manager still cannot give writing away. As with every other
      Passport admin power, it reaches only members of their own org units.
      Agreed on 1 October 2026.

      Removal closes only a row with `source` `admin`. A Passport admin
      cannot end a member's `organisation` or `individual` row from the
      user editor, because Phase 5 makes `sync_competency_rows` leave
      those alone, and that is intended: cover ends with its switch, and a
      subscription ends with its term.

      Passport admins may appoint other Passport admins: `manage_passport`
      stays on its own `may_grant` list, as `manage_teaching` does. So
      every Passport admin can create another who can also give writing
      away. That was weighed and accepted on 1 October 2026, to mirror
      teaching.

      Tests in `backend/tests/test_manage_passport_user_routes.py` change
      deliberately: `test_give_away_passport_write` and
      `test_create_a_delegate_who_can_write` become the cases that pass,
      for a member of their own unit, and new cases check that a member of
      another unit is refused and that `manage_teaching` still cannot name
      `passport_write`. `test_no_profession_grants_the_right_to_write_a_passport`
      is unchanged: no base profession grants it.

## Phase 4: Documentation

- [x] **Update the passport docs.** No page outside the plans named the
      `external_assessor` id; prose about "an external assessor" is still
      right. `docs/docs/backend/passport/index.md` gains a "Passport
      professions" section under Authorisation describing the four
      professions and `manage_passport`.
- [x] **Add `manage_passport` to the authorisation notes** in
      `.github/copilot-instructions.md`: the paragraph on grant whitelists
      now names scoped managers, both of them, `SCOPED_MANAGER_IDS` on each
      side, the rule never to name one scoped manager in a people route,
      and that `passport_write` can be on no whitelist.
- [ ] **Run `/sync-copilot-config apply`** to carry that into `CLAUDE.md`.
      Left for a person: a dry run on 1 October 2026 found eleven synced
      files changed on both sides since the last run on 26 September,
      including the grant whitelist paragraph from the manage teaching
      plan, which never reached `CLAUDE.md`. Reconciling all of that is a
      sync of its own, not a step of this plan.

## Phase 5: An org unit pays for its members' writing

The passport is free for the Cheltenham oncology team and is likely to be
paid for everywhere else. Today the only way to give somebody
`passport_write` is for a `manage_users` holder to add it to them by hand,
which misses every new starter. This phase adds a second switch beneath
the passport feature, so that an org unit can cover its members' writing.
`organisation`, the `user_competency` source this needs, has been in
`COMPETENCY_GRANT_SOURCES` since the user competency table plan, but
nothing writes it yet.

- [x] **Let a site hold features, with its own features card and page.**
      The Cheltenham tree is Gloucestershire Hospitals as the
      `organisation` and Cheltenham oncology as a `site` under it. The
      passport must be on for oncology and not for the whole trust, but
      today `site` has `can_hold_features: false` in
      `shared/org-unit-types.yaml`, so a feature can only go on the trust.
      Set it to true for `site`. Then `requires_feature` in
      `backend/app/features/gating.py`, which today checks only the
      organisation above each of a person's memberships, must also check
      the units they are a member of directly. A feature on at the trust
      still reaches all of its sites, as before. A feature on at a site
      reaches that site's members and nobody else, because nothing passes
      sideways or down from a site. The feature list in `/api/auth/me` must
      give the same answer as the gate. On the frontend, the site admin
      page gets the features card the organisation page has, opening the
      same features page, which is generalised from `OrgFeaturesPage` to
      take any org unit. Agreed on 1 October 2026.

      Built as `feature_holder_ids_of` in `backend/app/organisations.py`,
      the one answer to "which org units' features reach this person",
      used by `requires_feature`, `/api/auth/me` and the passport's own
      check for a holder's usable org unit. The card is a new
      `EnabledFeaturesCard` component, now used by both admin pages.
      `OrgFeaturesPage` takes `parentPath="sites"` for the way back, and
      its wording no longer says "organisation-wide". The site pages are
      still operator-only, so only a superadmin can switch a site's
      features for now.
- [ ] **Add a `passport_write` feature key**, stored as an
      `OrgUnitFeature` row like every other feature, so no migration is
      needed. `set_org_unit_feature` in `backend/app/org_units/router.py`
      refuses to switch it on unless `passport` is already on at the same
      org unit, and turning `passport` off turns `passport_write` off with
      it. **Only a superadmin may switch `passport_write` on or off**,
      unlike the other features, which any `manage_users` holder at that
      org unit may switch. It gives away the paid half, so whoever controls
      it controls the price: a trust admin must not be able to make
      writing free across their trust. On the features page, the switch
      is shown only to a superadmin. The switch goes on the unit that
      pays, which is the Cheltenham oncology site today. Agreed on
      1 October 2026.
- [ ] **Switching it on writes a grant for every staff member and trainee.**
      One `passport_write` row per current member of that org unit in the
      `staff` or `trainee` capacity, with `source` `organisation`,
      `org_unit_id` the unit, `granted_by` whoever switched it on, and no
      `ends_on`. Never `external` or `patient`: somebody brought in from
      outside does not get free writing just by being added. Somebody who
      already has a current `organisation` row from this unit is skipped,
      so switching it off and on again does not duplicate anything. Put the
      logic in a new `backend/app/features/passport/cover.py`, so the
      feature route and the membership routes call one function.
- [ ] **Joining as staff or a trainee writes the grant too.** Every route
      that adds a member to an org unit calls `cover.py` once the
      membership row exists: `add_org_unit_member` in
      `backend/app/organisations.py`, and any route in
      `backend/app/org_units/router.py` that writes `OrgUnitMember`
      directly. Moving those onto `add_org_unit_member` is better than
      calling `cover.py` from two places. Joining as `external` grants
      nothing; changing an `external` member to `staff` or `trainee` does.
      Agreed on 1 October 2026: otherwise anybody who may add members to
      the site could add a friend from another trust and give them free
      writing.
- [ ] **A member of staff who leaves keeps writing.** A doctor who moves to
      another trust keeps reading and writing their passport. They go on
      using it as their own record wherever they work, and they can show
      other trusts what it does. Their membership of the Cheltenham
      oncology site is not changed: they stay on its books as `staff`.
      That membership is what gets them past the passport's
      `requires_feature("passport")` gate, which checks that somebody
      belongs to an org unit where the passport is switched on. So nothing
      happens when they leave, and no code is needed for it. Agreed on
      1 October 2026. If somebody is removed from the site after all,
      their `organisation` row is not closed either. They can still read
      and export their own passport (next step), but they cannot write,
      because writing still needs the passport switched on somewhere they
      belong.
- [ ] **An owner can always read and export their own passport.** Today
      every passport route hangs off one gate, `requires_feature("passport")`
      on `passport_router` in `backend/app/features/passport/router.py`,
      and the frontend wraps the whole `/passport` subtree in
      `<RequireFeature feature="passport">` in `frontend/src/main.tsx`.
      So somebody who belongs nowhere the passport is switched on cannot
      even open their own record. That breaks a rule the passport already
      states: reading and exporting a passport you hold come from owning
      it, never from paying. Move the routes that read and export the
      caller's _own_ passport onto a router without the feature gate, and
      keep `_require_holder` on them, so ownership is the only check.
      Everything else stays behind the gate: writing, sign-off requests,
      the assessor inbox, and reading anybody else's. On the frontend, the
      passport's own read and export pages are reachable without the
      feature, and every write control is hidden or disabled there.
      Agreed on 1 October 2026. Tests: somebody with no passport-enabled
      membership can read and export their own passport, gets 403 on
      writing, and gets 404 on anybody else's.
- [ ] **A trainee who rotates off loses writing.** Removing a `trainee`
      member, or changing a trainee to `external`, closes their
      `organisation` row from this unit. A rotation is not a career move
      away from the team, and covering every trainee who ever passed
      through would grow the free group with no end. Agreed on 1 October
      2026, for now.
- [ ] **Switching it off closes every grant it made.** Every current row
      with `source` `organisation`, `competency_id` `passport_write` and
      this `org_unit_id` gets `ends_on` set to now, leavers included. This
      was chosen deliberately (see Decisions). Reading and export are
      untouched, because they come from owning a passport, never from
      paying. Somebody also covered by another source, such as another
      unit or their own subscription, keeps writing through that one.
- [ ] **Stop `sync_competency_rows` closing a paid grant.** Saving the
      user editor does not change only the competency that was edited. It
      treats the lists on the screen as everything the person should hold,
      and closes any current row whose competency is not on them. A grant
      made by an org unit's cover, or bought as a subscription, is never on
      those lists, because it was not given on that page. Without a fix,
      this would happen:

      1. Cheltenham's cover gives Dr Smith a `passport_write` row.
      2. Months later an admin opens Dr Smith's page to correct their
         email, and saves.
      3. `passport_write` is not on the lists, so the row is closed.
      4. Dr Smith can no longer write. Nobody chose that and nobody is
         told; the add button is simply greyed out one day.

      The fix: `sync_competency_rows` in `backend/app/cbac/grants.py`
      leaves alone every row whose `source` is `organisation` or
      `individual`. Only the mechanism that made such a row may end it:
      the cover switch for an `organisation` row, the subscription's own
      end date for an `individual` one. Agreed on 1 October 2026. A test
      replays the story above (cover a member, save their page through
      `PATCH /api/users/{id}` with lists that leave out `passport_write`,
      and check they can still write), so changing the code back fails
      the build.

- [ ] **The secondary switch on `OrgFeaturesPage`.** Under "Clinician
      passport", a second switch, "Cover members' writing", shown indented
      to the right only while the passport switch is on in the form. Turning
      the passport switch off in the form turns this one off too. When
      switching it off, the confirm dialog says how many people will lose
      writing. Count it from a new read-only route, or add it to the
      features response; decide which here. The page's stories and tests
      need the new switch's on, off, hidden and confirm states.
- [ ] **Tests**: - a feature on at a site reaches that site's members and nobody at
      the trust's other sites; a feature on at the trust still reaches
      every site - switching on grants every staff and trainee member, and no
      external or patient member - a staff or trainee member added afterwards is granted; an external
      one is not, until changed to staff or trainee - removing a member of staff does not close their row - a trainee removed, or moved to external, loses writing - switching off closes exactly this unit's rows, and leaves an
      `individual` row and another unit's row alone - switching it on without `passport` is refused - turning `passport` off ends the cover - a `manage_users` holder who is not a superadmin is refused the
      switch, in both directions - a ward refuses the switch, as it refuses every feature
- [ ] **Set up Cheltenham** once this has merged: Gloucestershire
      Hospitals as the `organisation`, Cheltenham oncology as a `site`
      under it, with `passport` and `passport_write` switched on at the
      site only.

## Phase 6: Individuals pay for themselves

For clinicians whose org unit does not cover them. Not started: built only
after the passport has been tested at Cheltenham under Phase 5's cover.

- [ ] **A Quill-run "Clinician Passport" organisation.** Paying for
      yourself means joining it: an `organisation` org unit run by Quill,
      with `passport` switched on. Membership is what gets an individual
      with no trust on Quill past `requires_feature("passport")`, the same
      gate Phase 5 relies on for leavers. Its `passport_write` cover switch
      stays off. Writing here comes from payment, not from joining.
- [ ] **Stripe Checkout**, hosted by Stripe, so no card details touch
      Quill. Once payment is confirmed, a webhook adds the person to the
      Clinician Passport organisation as a `trainee`, and writes a
      `passport_write` row with `source`
      `individual` and `org_unit_id` the Clinician Passport organisation.
      `TERMS` in `backend/app/cbac/grants.py` already gives it a year's
      `ends_on`. The webhook checks Stripe's signature, and each event is
      recorded by its Stripe event id in a table of its own, so a repeated
      delivery cannot grant twice. Decide in this step between a one-off
      yearly payment and an auto-renewing subscription, and say why.
- [ ] **Renewal adds a row; a lapse needs no code.** The row ends, and
      `passport_write_ends_on` in
      `backend/app/features/passport/entitlements.py` already takes the
      latest end across every source. The person stays a member of the
      Clinician Passport organisation, so they keep reading and exporting.

## Phase 7: An alliance pays for teams it does not own

Not started. The shape was agreed on 1 October 2026: SWAG is a linked
organisation that pays for the teams it funds, not a parent above them.

SWAG, the Somerset, Wiltshire, Avon and Gloucestershire cancer alliance,
might pay to cover the whole Severn deanery. It cannot be the parent of
Cheltenham, Taunton and Bristol. Each team belongs to its own trust,
because a parent in this tree means "governs", there is one per unit, and
an organisation is always the top of its own tree. SWAG commissions and
coordinates; it does not govern.

- [ ] **Add a `funds` relation** to `backend/app/org_units/relations.py`,
      with `grants_reach=False`. The four existing relations
      (`hosts`, `teaches_at`, `partners_with`, `shares_service`) all
      describe working together, and none means "pays for".
- [ ] **SWAG becomes its own organisation**, linked to each team it pays
      for, with `passport` and `passport_write` switched on at SWAG.
- [ ] **`cover.py` follows `funds` links**: members of a funded team get an
      `organisation` row whose `org_unit_id` is SWAG, so every grant says
      who paid. A team covered by both Cheltenham and SWAG gives its members
      two rows, and they write while either is current.

## Decisions

- **Rename the id, not just the display name** – so all four passport
  professions start `passport_`, like the teaching ones start `teaching_`.
  The cost is one data migration and one line in the router.
- **The clinical lead is a profession, not a position** – because that is
  how teaching does it. A `Position` would record who held the role and when,
  and could show that a place has no clinical lead. If that turns out to
  matter, the lead should move to a position rather than gain more powers
  as a profession.
- **The delegate reads and signs off, but does not write** – writing is the
  paid part, and it comes only from an organisation enablement or an
  individual subscription.
- **Turning an org unit's cover off ends it for everyone it covered** –
  leavers included. Leaving the unit ends nothing, so a doctor who moves on
  keeps writing for as long as Cheltenham chooses to pay. Switching the
  cover off is a commercial decision, and it is the one thing that ends it.
- **A leaver stays on the books as staff** – a doctor who leaves
  Cheltenham keeps their `staff` membership of the site, because the
  passport's feature gate asks for membership of an org unit where the
  passport is switched on. Agreed on 1 October 2026 as right for now.
  Revisit once patients use Quill: keeping somebody as staff of a unit
  they have left may then show them, or their name, somewhere it should
  not.
- **An alliance is linked, never a parent** – SWAG does not govern the
  trusts it pays for, and a trust may belong to more than one network. Agreed
  on 1 October 2026.
- **Cheltenham sits under its trust** – Gloucestershire Hospitals is the
  `organisation` and Cheltenham oncology a `site` under it, decided on
  1 October 2026. A stand-alone top-level unit would have been quicker,
  but it could never be moved under the trust later. This is what made
  site-level features necessary.
- **Three ways to get writing** – paying as an individual, which means
  joining a Quill-run Clinician Passport organisation; joining an org unit
  whose cover is on; and being granted it by a Passport admin or higher.
  Agreed on 1 October 2026. Each is its own `user_competency` row, so
  ending one never ends another.
