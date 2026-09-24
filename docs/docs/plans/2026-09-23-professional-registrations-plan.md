# Professional registrations plan

A clinician's registration with the GMC, NMC or HCPC is stored as a JSON
object on the `users` row, `professional_registrations`, shaped
`{"GMC": "1234567"}`. A registration is not just a number. It has an issuing
body, a date it was declared, a date it lapses and a record of who checked it,
and the JSON has nowhere to put any of them. The passport code reads the blob
defensively in `backend/app/features/passport/router.py`, dropping anything
that is not a string-to-string pair, because the column accepts anything. So
the one column that says whether an assessor is who they claim to be has no
constraint on what goes in. Registrations lapse, so the reason
[User competency table](2026-09-23-user-competency-table-plan.md) moved
competencies onto rows applies here too.

This plan moves registrations onto a `professional_registration` table, one
row per declared registration. It also points
`AssessorRegistrationVerification` at that row, instead of copying the
authority and number a second time. It follows the same expand, dual-write,
backfill, switch-reads, contract order the competency plan used, for the same
reason: each stacked unit deploys when it merges.

## Phase 1: Add the table and write it beside the JSON

- [x] **Add a `ProfessionalRegistration` model** in
      `backend/app/models.py`. Columns: `user_id` (FK `users.id`, `ON DELETE
      CASCADE`, indexed), `authority` (`varchar(50)`), `number`
      (`varchar(50)`), `declared_at`, `ends_on` (`timestamptz`, nullable)
      and `created_at`. Add a relationship on `User`, loaded with `selectin`
      like `competency_grants`.

      **Rows are never edited in place.** A changed number is a new row, and
      the old one is closed by setting `ends_on`. That is what would let the
      verification table in Phase 4 point at a row instead of copying its
      contents: a verified row could never quietly become a different
      registration.

      `authority` is checked in code against the ids in
      `shared/jurisdiction-config.yaml` (`GMC`, `NMC`, `GPhC`, `HCPC` for
      the UK), the same way `validate_org_unit_type` checks org unit types,
      so a new body needs no migration. Today nothing checks it: the accept
      page takes the authority as free text.

- [x] **Dual-write in `accept_assessor_invite`** (`router.py:2810`), the
      only place the JSON is written. It creates the user with
      `professional_registrations={authority: number}`, and now writes the
      row beside it.

- [x] **Validate the authority at that boundary, in the same change.**
      `AssessorInviteAcceptIn` takes it as free text. The model refuses an
      authority the jurisdiction config does not list, so the route has to
      refuse it first, with a 422 rather than a 500. It matches regardless
      of case and stores the config's spelling, so `gmc` is accepted as
      `GMC` rather than refused. Additive for the API: the field keeps its
      name and type.

      The list is read by `backend/app/registrations.py` from the default
      jurisdiction in `shared/jurisdiction-config.yaml`, and the model's
      `@validates` hook refuses anything else as a last line of defence.

- [x] **Offer the listed bodies on the accept page.**
      `PassportAcceptInvitePage.tsx` offers a free `TextField`. Change it to
      a `Select` over the default jurisdiction's bodies in
      `jurisdiction-config.json`, which `InviteAssessorForm.tsx` already
      reads, so nobody types a body the backend then refuses. The list moved
      to `registrationAuthorities` in `frontend/src/lib/passport/`, shared
      by both.

## Phase 2: Backfill

- [x] **Copy every user's JSON into rows in one hand-written migration.**
      Use `json_each_text` over `professional_registrations`, guarded
      against a value that is not an object, like the competency backfill.
      `declared_at` was to be the user's `created_at`, but `users` has no
      such column, so it is when the migration runs; `ends_on` is null. An
      authority not in the jurisdiction config is copied anyway and
      reported: losing a registration silently is worse than keeping one
      the list does not know.

- [x] **Test it against Postgres** in the `alembic_drift_check` job, the
      way `backend/tests/test_user_competency_backfill.py` does.
      Written as `f14aae5e8d17`, tested in
      `backend/tests/test_professional_registration_backfill.py` under the
      `migration` marker. A user who already has any row is skipped whole,
      and an empty body or number copies nothing.

## Phase 3: Switch reads

- [x] **Rebuild `_registration_strings` and `_registration_dicts`**
      (`router.py:298-336`) from the current rows. The defensive parsing
      goes, because a row cannot hold a malformed registration.

- [x] **Rebuild the check in `verify_assessor_registration`**
      (`router.py:2347`) as a lookup of a current row with that authority
      and number. This keeps an existing route working once the JSON goes;
      it is not new verification work, which Phase 4 defers.

      Both read `User.current_registrations`, the rows with no end or an
      end still ahead. The body is matched as the accept route stores it,
      so an admin typing `gmc` finds `GMC`. Tests that built users with the
      JSON now declare rows through `backend/tests/registrations.py`.

- [ ] **Deferred: stop skipping
      `test_a_lapsed_registration_drops_clinical_grants_not_memberships`**
      in `backend/tests/test_org_scoped_access_criteria.py:386`. Rows remove
      the reason it is skipped, but decided on 23 September 2026 that a
      lapsed registration is not linked to competencies for now, so the test
      stays skipped. Not built in this plan.

## Phase 4: Point verification at the registration (deferred)

Decided on 24 September 2026: no verification work now. Everything in this
phase waits for a later decision, so `AssessorRegistrationVerification`
keeps its own copy of the authority and number, as it does today, and
Phase 6 leaves those two columns alone. The reasoning is kept for whoever
picks it up.

- [x] **Answer the question this plan was asked to settle first.** Should
      `AssessorRegistrationVerification` hold the registration itself?
      **No.** It records a different fact. A registration is the person's
      declaration. A verification is one organisation's act of checking it
      against a register, per `org_unit`, which is why its unique constraint
      includes `org_unit_id`. Two organisations checking one registration
      are two verifications of one registration. Folding the declaration
      into the verification would leave an unchecked registration with no
      row, and would duplicate the declaration once per organisation that
      checked it.

      What it should not do is copy the authority and number. It copies them
      today so that a later edit to the JSON cannot inherit a verification
      made against an earlier value. Rows that are closed rather than edited
      give the same guarantee by construction, so a foreign key replaces
      the copy.

- [ ] **Deferred: add `registration_id`** (FK `professional_registration.id`,
      nullable) to the verification table, backfill it by matching user,
      authority and number, then switch the route to write it. Drop the two
      copied columns in Phase 6.

- [ ] **Deferred: decide whether `verified` should start appearing.**
      `_registration_dicts` hardcodes `verified: False`, and the sign-off
      call never passes `registration_verified`. So the verification route
      writes rows that nothing shows, and `RegistrationBadge` never draws its
      verified marker. Wiring it up is a visible change to sign-off records,
      which are frozen and hashed (`hashing.py:81`). It belongs to its own
      unit with its own review, not folded into a storage change.

## Phase 5: Stop writing JSON, and clear what is already dead

- [x] **Remove the JSON write** from `accept_assessor_invite`.

- [x] **Take `users.professional_registrations` out of every statement
      in the same change.** As the competency plan found, a column the
      model still maps is named in every `SELECT`
      of `users`, and a revision still serving while the drop runs would
      fail on all of them. It is nullable with no default, so deferring it
      is enough, with no migration.

- [x] **Delete the dead code found during the investigation**, each named
      in the pull request with how it was shown to be unused:
      - `ProfessionalRegistration` in `backend/app/schemas/cbac.py:43-60`,
        a schema with expiry and status fields that nothing uses.
      - `AssessorInviteIn` (`backend/app/schemas/passport.py:650`) and
        `InviteAssessorForm.tsx`, with its `inviteAssessor` client call.
        They post to `/passport/{id}/assessor-invites`, a route that no
        longer exists. Invites are now raised inside the sign-off request.
      - `verifyAssessorRegistration` in `frontend/src/lib/passport/api.ts`
        stays: it is the client for the verification route, which Phase 4
        may one day give a page.

      Deleting them turned up two more of the same: `fetchAssessorInvites`
      and its `AssessorInvite` type call a `GET` on the same missing route,
      and the backend's `AssessorInviteOut` was the response of the route
      that went. Both went too. Each was shown unused by a search of the
      repository finding nothing outside its own file and tests.

## Phase 6: Drop the columns

- [ ] **Drop `users.professional_registrations`** in its own destructive
      migration with the `allow-destructive` marker, through the
      `db-destructive-migration-review` environment. Approved on 24
      September 2026. The verification table's copied
      `registration_authority` and `registration_number` stay, because
      Phase 4 is deferred.

## Decisions

- **One table for the declaration, one for the check** — a registration
  and a verification of it are different facts with different owners: the
  person, and an organisation. Phase 4 has the reasoning.

- **Closed, never edited** — the same rule as `user_competency`, and for a
  second reason here: it is what makes a foreign key from a verification
  as safe as the copy it replaces.

- **The authority list is `shared/jurisdiction-config.yaml`** — it already
  exists, is already generated into the frontend and already carries each
  body's display name and verification URL. It is currently read only by a
  form nothing renders.

## Open questions

- **What does a lapsed registration do?** `ends_on` makes lapsing
  expressible. Decided on 23 September 2026 that it is **not linked to
  competencies** for now: a lapsed registration narrows nothing anybody may
  do. What it should do is left for another day, so the step in Phase 3
  that would stop skipping
  `test_a_lapsed_registration_drops_clinical_grants_not_memberships` stays
  unbuilt.

- **Where does `ends_on` come from?** Quill checks no register. Until one is
  integrated, an end date is either typed by an administrator or absent.

- **Should a verification lapse?** `AssessorRegistrationVerification` never
  expires, and `test_passport_models.py:578` asserts it has no expiry column.
  A re-check cycle, annual like revalidation, would reverse that.
