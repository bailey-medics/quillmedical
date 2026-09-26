# Passport specialties plan

Every competency picker in the passport lists the whole active catalogue, so a
holder can log a procedure against, or ask to be signed off for,
`access_own_patient_records` or `manage_users`. Those are software permissions,
not things anybody watches a clinician do. And the competencies that genuinely
are assessable arrive in one alphabetical list, so an oncologist scrolls past
chest drains to reach `prescribe_sact`.

The plan answers two separate questions. Whether a competency can be assessed
at all is a property of the competency, the same for everybody, so it becomes
an opt-in flag that the backend enforces. Which assessable competencies matter
most to a holder is a property of the holder, so they choose a specialty when
they create their passport, and it changes only the order of the picker, never
what it offers. The first release offers Oncology, General medicine, General
surgery and Generic, the last meaning no specialty order. Testing all of this
on teaching also needs a way to delete a test holder's passport and start
again, which phases 6 to 9 add without it ever reaching a real clinician's.

## Phase 1: Drop the site shortlist

- [x] **Remove `SiteCommonCompetency`** from `features/passport/models.py`, and
      `CommonCompetenciesIn`, `CommonCompetenciesOut` and `commonly_used_here`
      from `backend/app/schemas/passport.py`. The table was built for a
      per-site "commonly used here" list, but nothing ever wrote to it and no
      route exposes it, so no compatibility entry is needed. It goes first
      because the specialty ordering in phase 5 replaces it, and two ways of
      ordering one picker would clash. If a site later wants its own list, it
      gets a specialty list aimed at that site, not a second mechanism.

- [x] **Migration dropping `site_common_competency`**, via
      `just migrate "drop the unused site common competency table"`. It needs
      the `allow-destructive` marker, which is safe because the table has never
      held a row. Read the generated `upgrade()` and `downgrade()` before
      committing.

- [x] **Remove the shortlist from `CompetencyPicker`**: the
      `commonlyUsedHere` prop, `SHORTLIST_GROUP`, and their stories and tests.
      The picker is left as one alphabetical list until phase 5.

## Phase 2: The assessable flag

- [x] **Add `assessable: bool = False` to `CompetencyEntry`** in
      `backend/app/cbac/competencies.py`. Opt-in, so anything added for access
      control stays out of the passport until somebody decides otherwise, and
      adding a permission can never quietly widen what can be signed off. The
      model forbids extra fields, so the YAML cannot carry the flag until the
      model does.

- [x] **Mark the assessable competencies** in `clinical.yaml` and
      `oncology.yaml`. Clearly assessable: the `perform_*` procedures,
      `take_informed_consent`, `assess_mental_capacity`,
      `apply_deprivation_of_liberty`, `interpret_ecg`, the prescribing and
      certifying competencies, `manage_diabetes`, `manage_anticoagulation`,
      and the 16 oncology competencies. Clearly not: the `access_*` ids,
      `modify_patient_records`, and everything in `admin.yaml`,
      `clinical-admin.yaml`, `teaching.yaml` and `passport.yaml`.

- [x] **Decide the borderline ones by hand**: `request_ct_scan`,
      `request_mri_scan` and `request_plain_xray`, where IR(ME)R entitlement
      may make them genuinely assessable, and `discharge_without_review`,
      `approve_clinical_letters`, `admit_patient` and `refer_specialty`. A
      clinical governance call, not an engineering one. **Decided before the
      build: all seven left not assessable for now**, the safe default since
      nothing can be signed off against them in the meantime and each is one
      line to change. The reasoning sits in a comment at the top of
      `clinical.yaml`, where the next person to change one will see it.

- [x] **Expose `ASSESSABLE_COMPETENCY_IDS`** beside `ACTIVE_COMPETENCY_IDS`,
      meaning active and assessable.

- [x] **Refuse a non-assessable competency at the write boundary**, not just
      in the picker. A sign-off for "access own patient records" means
      nothing, so there is no reason to let an API call record one.
      `assessable_ref` in `features/passport/definitions.py` raises
      `NotAssessableError`, and the router answers 400 naming the id, where
      an unknown id stays 404. Found while building: there was no retired
      check on these routes, contrary to what this step first said, and
      `ASSESSABLE_COMPETENCY_IDS` excludes retired ids, so this adds one.
      It covers every route creating a record: sign-off requests, logbook
      entries and certificates as planned, and reflections and CPD entries
      too, since they name competencies the same way. On a sign-off request
      the check runs **before the email**, which also fixes an existing gap:
      an unknown competency used to reach the assessor's inbox before the
      404. The amend routes keep the looser existence check, so an old
      record naming a competency since marked not assessable can still have
      its date corrected. Existing records stay readable, as retired ones
      already do.

- [x] **Carry `assessable` through `generate-json-from-yaml.ts`**, add an
      `ASSESSABLE_COMPETENCIES` helper to `frontend/src/types/cbac.ts` next to
      `ACTIVE_COMPETENCIES`, and have `CompetencyPicker` offer only those.

- [x] **Tests.** The backend refuses a non-assessable id on each write route;
      a record already holding one still renders and exports; the picker
      never offers `manage_users` or `access_own_patient_records`.

## Phase 3: The specialty files

- [x] **Create `shared/passport-specialties/`, one file per specialty**, each
      with an `id`, a `display_name` and an ordered `common_competencies`
      list, and a header comment saying the list orders the picker and
      requires nothing. The specialty lists its competencies, rather than
      each competency listing its specialties, so the shared catalogue gains
      nothing but the `assessable` flag, a clinician reviewing oncology reads
      one file, and a list can put `prescribe_sact` above
      `assess_sact_toxicity`, which a tag on each competency could not.

  ```yaml
  id: oncology
  display_name: "Oncology"
  common_competencies:
    - prescribe_sact
    - assess_sact_toxicity
  ```

- [x] **Start with three specialties**: `oncology.yaml`,
      `general_medicine.yaml` and `general_surgery.yaml`, so the first
      choices are Oncology, General medicine, General surgery and Generic.
      The option with no ordering is called Generic rather than General
      because "General" beside "General medicine" and "General surgery"
      would read as a third specialty. Each list below is a starting draft,
      in an order a clinician reviewing it chooses, and later specialties are
      one new file each, with no code change.

  - **Oncology** — the 16 competencies in
    `shared/competency-definitions/oncology.yaml`: `prescribe_sact`,
    `assess_sact_toxicity`, `manage_sact_complications`, `consent_for_sact`,
    `define_radiotherapy_target_volume`, `deliver_radical_radiotherapy`,
    `deliver_palliative_radiotherapy`, `deliver_radioisotope_therapy`,
    `manage_brachytherapy_patients`, `consent_for_radiotherapy`,
    `manage_oncological_emergency`, `deliver_acute_oncology_take`,
    `manage_neutropenic_sepsis`, `manage_metastatic_cord_compression`,
    `contribute_to_tumour_mdt`, `manage_end_of_life_care`. Whether anything
    from `clinical.yaml`, `take_informed_consent` say, belongs on it is part of
    the same review.

  - **General medicine** — from `clinical.yaml`: `interpret_ecg`,
    `perform_venepuncture`, `perform_cannulation`, `perform_lumbar_puncture`,
    `perform_chest_drain`, `manage_diabetes`, `manage_anticoagulation`,
    `prescribe_non_controlled`, `prescribe_controlled_schedule_2`,
    `take_informed_consent`, `assess_mental_capacity`,
    `apply_deprivation_of_liberty`, `certify_death`. `admit_patient`,
    `discharge_without_review` and `refer_specialty` join it if phase 2 marks
    them assessable.

  - **General surgery** — from `clinical.yaml`: `take_informed_consent`,
    `perform_venepuncture`, `perform_cannulation`, `perform_chest_drain`,
    `prescribe_non_controlled`, `prescribe_controlled_schedule_2`,
    `manage_anticoagulation`, `assess_mental_capacity`, `certify_death`. **This
    list is thin, and will stay thin until the catalogue has surgical
    competencies.** There is nothing yet for an appendicectomy, a hernia repair
    or a laparotomy, so the list mostly holds the shared ward competencies.
    Adding surgical definitions is a separate piece of clinical content work,
    not part of this plan; each one then joins this list as one line.

- [x] **A loader in `backend/app/features/passport/specialties.py`**, with a
      `Specialty` model (`extra="forbid"`), refusing at load so a bad list
      stops the application starting. The rules: every listed id exists in
      `shared/competency-definitions/`, is `assessable: true` and is not
      retired; no id appears twice in one list; the filename matches the
      `id`; and specialty ids are unique across the folder, the same rule as
      `competency-definitions/`. It must import without `app.config`, like
      the rest of the feature package.

- [x] **`test_passport_specialties.py`**, so CI names the problem as well as
      the loader refusing it: one fixture directory breaking each rule, and
      one test loading the real folder.

- [x] **Carry the specialties through `generate-json-from-yaml.ts`** into
      `src/generated/`, so the frontend reads the same lists.

## Phase 4: The specialty on the profile

- [x] **Add `specialties` to `Profile`** in `features/passport/schemas.py`: a
      list of `{id, name}`, defaulting to empty. It lives in `profile.yaml`
      because it is the holder's own statement about themselves, so it
      belongs in their record and travels with the export. The name is stored
      next to the id, the way sign-offs store their competency wording, so an
      export stays readable with no Quill. Optional, because `profile.yaml` is
      validated on read and no existing passport has the field.

- [x] **Generic is the empty list, not a specialty.** Foundation doctors and
      GP trainees have no specialty yet, and Generic means no ordering: one
      alphabetical list. Storing it as an empty list means no `generic.yaml`
      to keep empty and nothing for the loader to special-case, and an
      existing passport with no field reads as Generic. A holder may hold
      more than one specialty, since acute oncology and general medicine
      together is ordinary.

- [x] **An unknown specialty id is kept and shown on read, never refused.**
      It stops ordering the picker and nothing else, so a renamed or removed
      specialty never makes a passport unreadable. On write, an unknown id is
      refused.

- [x] **Accept specialties at creation.** `POST /passport` takes an optional
      body with `specialties`, defaulting to Generic. An added optional
      request body is additive, so no compatibility entry is needed. The API
      defaults rather than requiring the field; asking the question is the
      frontend's job, in phase 5.

- [x] **A holder-only route to change them**, writing a new `profile.yaml`
      with a `passport:profile:` commit. Behind `_require_writer`, like every
      other write: without the write entitlement there is nothing to pick a
      competency for. Built as `PUT /api/passport/{passport_id}/specialties`,
      returning the passport, with `setPassportSpecialties` in the frontend
      client beside it so the contract tests comparing the two route lists
      stay in step.

- [x] **Render the specialty** in the profile section of the Markdown and PDF
      exports.

- [x] **Tests.** An old `profile.yaml` with no `specialties` still loads;
      creation with Generic and with Oncology; an unknown id refused on write
      and kept on read; changing specialty makes one commit; a holder without
      the write entitlement is refused.

## Phase 5: The frontend

- [x] **Ask for the specialty when a passport is first created**, on the
      create step of `PassportPage`. The question is always shown and must be
      answered before the create button is enabled, with nothing preselected,
      so Generic is a choice somebody made rather than a default they missed.
      The options are every file in `shared/passport-specialties/`, plus
      "Generic (no specialty order)". Choosing Generic clears any specialty
      already ticked, and ticking a specialty clears Generic, because the two
      contradict each other. The helper text says the choice only changes the
      order competencies are listed in, and can be changed later in settings.
      Built as `SpecialtyField`, composed from `MultiSelectField` rather than
      from scratch, with three states: `null` unanswered, `[]` Generic, or
      the chosen ids.

- [x] **`CompetencyPicker` orders by the holder's specialties**, on the
      logbook and sign-off pages. Each specialty's common competencies come
      first, in its file's order, under "Common in" followed by the
      specialty's name; everything else follows alphabetically under "All competencies". A competency
      common to two chosen specialties appears once, under the first. Never
      "Required" and never a count, so an ordering cannot turn into a
      syllabus.

- [x] **A passport specialty action card on `Settings.tsx`**, offering the
      same choices as creation, Generic included. Shown only when the user
      has a passport, not merely the competency to read one, and disabled
      when a write would be refused, matching the create buttons. Built as
      `PassportSpecialtyCard`, an `ActionCard` holding a `SpecialtyField`,
      saving on each change. The page asks for the passport only when the
      user has the `passport` feature and `assess_clinician_passport`, the
      same test the side navigation uses, and a 404 means no card.

- [x] **Stories and tests** for the picker with Generic, one specialty and two;
      for the create step refusing to submit until a choice is made, and
      Generic and a specialty clearing each other; and for the settings card
      present, absent and disabled.

- [x] **Update the docs.** The shortlist decisions in the clinician passport
      plan point to this plan, and `docs/docs/backend/passport/index.md`
      describes the assessable flag and specialties.

## Phase 6: Archiving a passport in the stores

- [x] **Archive functions in `backend/app/features/passport/archive.py`**:
      `archive_local` and `archive_bucket`. Each copies the repository and
      its evidence blobs to the destination, checks every copy against its
      original (file sizes on disk, CRC32C in the bucket), then removes the
      originals. Copy before remove, so a failure part way leaves the
      passport where it was. **Departed from the first draft of this step**,
      which put an `archive` method on `PassportStore`: the two backends
      archive to different kinds of place, and the evidence belongs to the
      blob stores, so one function per backend moving the passport's whole
      shard is simpler than a method with a differently typed destination on
      each class. Its bucket protocol is its own, so the stores and their
      test fakes gain nothing they never use.

- [x] **The passport bucket keeps its noncurrent versions.** The bucket is
      versioned and nothing removes versions, so removing the live objects
      leaves their bytes recoverable indefinitely. That is acceptable for a
      test passport, and is recorded here rather than worked around: making
      deletion real would mean a lifecycle rule on a bucket designed never to
      have one.

- [x] **Tests** for both stores: archiving copies everything, removes the
      originals, refuses an unknown passport, and leaves the passport intact
      when the copy fails.

## Phase 7: The admin command

- [x] **Add a `delete-passport` action to `backend/scripts/admin_cli.py`**,
      reading `ADMIN_USERNAME` and an optional `CONFIRM`.

- [x] **Without `CONFIRM`, report and stop.** Print the holder's username and
      user id, the passport id, and counts of sign-offs, logbook entries,
      certificates, CPD entries, reflections and open requests, whether the
      holder is on the allow-list, and the `CONFIRM` value to pass back. This
      is also how the ids for phase 9 are found, since it reads without
      changing anything. Evidence files are not counted, since that means
      listing the bucket; the confirmed run reports how many objects it
      moved instead.

- [x] **With `CONFIRM`, act only if every check passes**, refusing with a
      message naming the one that failed:
      - the holder's user id is in `PASSPORT_DELETABLE_USER_IDS`, a
        comma-separated list, where unset or empty means nobody
      - `CONFIRM` equals the passport id exactly
      - the holder has exactly one passport, which a unique constraint
        already guarantees

- [x] **Then archive, then remove the rows.** Archive to
      `deleted/<date>/` in the archive bucket, keeping each object's name, and
      delete the `passport`, `passport_signoff_request` and
      `passport_assessor_invite` rows in one transaction that commits only
      once the archive has succeeded. The dependent rows are deleted by name
      rather than left to the foreign keys' cascade, so the command does not
      rely on the database enforcing it. Entitlements in `user_competency`
      and any assessor memberships stay: they describe the person, not the
      record. The one gap left, the archive succeeding and the commit then
      failing, is reported as exactly that, with where the files went.

- [x] **One passport per run.** No list, no pattern, and no "all".

- [x] **Tests** covering each refusal (not listed, wrong id, empty list,
      unset list), the dry run changing nothing, and a confirmed run
      archiving and removing exactly one passport.

## Phase 8: The recipe

- [x] **Add `just passport-delete env username confirm=""`**, following
      `.claude/rules/just.md` and the existing `add-role` recipe: it executes
      the admin job with `ADMIN_ACTION=delete-passport`, and passes `CONFIRM`
      only when given. Because the job prints to Cloud Logging rather than
      the terminal, the recipe reads that execution's log back, so the dry
      run's report appears where it was asked for. It refuses a username or
      confirmation containing anything but the expected characters, since
      both go into a comma-separated list of variables.

## Phase 9: Terraform

- [x] **An archive bucket, `quill-passports-deleted-{env}`**, in
      `infra/modules/passport-storage/`, with a lifecycle rule deleting
      objects after 30 days, versioning off and public access prevented. A
      separate bucket rather than a prefix, because the passport bucket's own
      comment rules out any lifecycle rule there, and that decision stands.

- [x] **Grant the admin job's identity** object access on both buckets, in
      `infra/runtime-identities.tf`. It has none today.

- [x] **Add `passport_deletable_user_ids`**, a `list(number)` defaulting to
      empty, to `infra/variables.tf`, and pass it to the admin job as
      `PASSPORT_DELETABLE_USER_IDS` in `infra/main.tf`, beside
      `CORE_DB_HOST`. Found while building phase 7: the admin job also needs
      `PASSPORT_GCS_BUCKET` and `PASSPORT_ARCHIVE_GCS_BUCKET`, which it does
      not have today. Without the first it would look for passports on its
      own disk, find none, and refuse.

- [ ] **List the three test holders** in
      `infra/environments/app/terraform.tfvars`, by id, each with a comment
      naming the account. Find the ids with the phase 7 dry run:
      `mark.bailey.superadmin`, `mark.bailey.admin` and `mark.bailey`.
      **A change of its own, after the rest of this phase is deployed**: the
      dry run needs the admin job to have `PASSPORT_GCS_BUCKET`, which only
      the step above gives it, so the ids cannot be looked up any sooner.
      Until then `passport_deletable_user_ids = []` is set explicitly in the
      tfvars, with a comment naming the three accounts to add.

## Decisions

- **A specialty, not a "passport type"** — "type" suggests a different kind of
  passport, with its own structure or a defined set of contents. The clinician
  passport plan decided a passport is not a defined set of competencies, and a
  specialty that only orders a list keeps that true.

- **Everybody can log and be signed off for the same competencies** — the
  specialty decides the order and never what is offered. An oncologist can
  still record a chest drain, and a consultant of thirty years can still be
  signed off on something new.

- **No coupling with the assessor access plan** — the
  [assessor access plan](2026-09-24-passport-assessor-access-plan.md) renames
  the ids in `passport.yaml`, and this plan leaves those ids without the
  `assessable` flag, which is their correct state, so the two can land in
  either order.

- **Deferred: a required list from a deanery or college** — still the open
  question in the clinician passport plan, and deliberately not a specialty
  list. A specialty list orders; a required list would report against an
  outside body's stated requirement, which needs deciding on its own.

- **Deletion is impossible until phase 9** — the command refuses every
  holder while `PASSPORT_DELETABLE_USER_IDS` is unset or empty, so phases 6
  to 8 are safe to deploy before the Terraform list names anybody.

- **An admin job, never a route** — anything reachable from the web app is
  one stolen session or one bug away from being used. Running the job needs
  gcloud permission on the project, and Cloud Audit Logs record who ran it.

- **Holders named by user id, in Terraform** — a username can be changed by
  an admin, and an invited assessor chooses their own, so a pattern such as
  `mark.bailey.*` could come to match a real clinician. An id means one
  account for good, and adding one is a reviewed change to `infra/` that
  applies on merge.

- **Not decided by what a passport contains** — a check refusing passports
  signed off by somebody else was considered and dropped, because testing
  means signing off your own passport from other addresses, which makes a
  test passport look real.

- **`mark.bailey` is listed too** — that account's passport is deletable
  while it is on the list. Acceptable while nobody uses production; once a
  real record matters there, take it off in its own pull request.
