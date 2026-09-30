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
services: `passport_delegate`, `passport_clinical_lead`, `passport_manager`
and `passport_external_assessor`, which is `external_assessor` renamed. The
manager gets a new `manage_passport` competency. It uses the grant scope from
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

## Phase 3: Passport manager

This phase depends on Phase 1 of the manage teaching competency plan, which
adds `may_grant`, `may_assign_professions` and `backend/app/cbac/grant_scope.py`.
Do not start it until that phase has merged.

- [ ] **Add `manage_passport` to `shared/competency-definitions/passport.yaml`**
      with `may_grant: [assess_clinician_passport, manage_passport]` and
      `may_assign_professions: [passport_delegate, passport_clinical_lead,
      passport_manager, passport_external_assessor]`. `manage_passport` is
      on its own list so that one manager can appoint another. If the
      assessor access split has landed by then, list its competencies in
      place of `assess_clinician_passport`.
- [ ] **Stop `passport_write` appearing on any `may_grant` list**, with the
      same check at load time that the teaching plan uses to keep
      `manage_users` off. A manager who could grant it would be giving
      away the paid feature, and nothing would visibly go wrong.
- [ ] **Add `passport_manager`** ("Passport manager") to
      `shared/base-professions.yaml` with `requires_clinical_services: false`
      and `base_competencies: [manage_passport]`. Leave out
      `assess_clinician_passport`: running the scheme is not the same as
      holding a passport, and a manager who is also a clinician can be
      given it.
- [ ] **Scope the people routes to `manage_passport`** alongside
      `manage_teaching`. The teaching plan's Phase 4 changes
      `create_user_with_cbac` and the membership routes to ask
      `grant_scope`. As long as those routes ask `grant_scope` generically
      and do not check for `manage_teaching` by name, a passport manager
      needs nothing more than the YAML. Check that when Phase 4 lands, and
      add any passport-specific route guard here.
- [ ] **Tests**: a passport manager can create a passport delegate at their
      own org unit and give them `assess_clinician_passport`. They cannot
      give out `passport_write`, `manage_users` or any clinical or teaching
      competency. They cannot change the profession of a user who is not
      in a passport profession.

## Phase 4: Documentation

- [ ] **Update the passport docs** in `docs/docs/` that describe
      `external_assessor`, to the new id and to the four professions.
- [ ] **Add `manage_passport` to the authorisation notes** in
      `.github/copilot-instructions.md` beside `manage_teaching`, then run
      `/sync-copilot-config`.

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
