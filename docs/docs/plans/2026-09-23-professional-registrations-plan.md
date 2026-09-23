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

- [ ] **Add a `ProfessionalRegistration` model** in
      `backend/app/models.py`. Columns: `user_id` (FK `users.id`, `ON DELETE
      CASCADE`, indexed), `authority` (`varchar(50)`), `number`
      (`varchar(50)`), `declared_at`, `ends_on` (`timestamptz`, nullable)
      and `created_at`. Add a relationship on `User`, loaded with `selectin`
      like `competency_grants`.

      **Rows are never edited in place.** A changed number is a new row, and
      the old one is closed by setting `ends_on`. That is what lets the
      verification table in Phase 4 point at a row instead of copying its
      contents: a verified row can never quietly become a different
      registration.

      `authority` is checked in code against the ids in
      `shared/jurisdiction-config.yaml` (`GMC`, `NMC`, `GPhC`, `HCPC` for
      the UK), the same way `validate_org_unit_type` checks org unit types,
      so a new body needs no migration. Today nothing checks it: the accept
      page takes the authority as free text.

- [ ] **Dual-write in `accept_assessor_invite`** (`router.py:2810`), the
      only place the JSON is written. It creates the user with
      `professional_registrations={authority: number}`, and now writes the
      row beside it.

- [ ] **Validate the authority at that boundary.** `AssessorAcceptIn`
      takes it as free text, and `PassportAcceptInvitePage.tsx` offers a
      free `TextField`. Change the page to a `Select` over
      `jurisdiction-config.json`, which `InviteAssessorForm.tsx` already
      builds, and reject an unknown authority with a 422. Additive for the
      API: the field keeps its name and type.

## Phase 2: Backfill

- [ ] **Copy every user's JSON into rows in one hand-written migration.**
      Use `json_each_text` over `professional_registrations`, guarded
      against a value that is not an object, like the competency backfill.
      `declared_at` is the user's `created_at`, the nearest thing to a
      declaration date the JSON can offer, and `ends_on` is null. An
      authority not in the jurisdiction config is copied anyway and
      reported: losing a registration silently is worse than keeping one
      the list does not know.

- [ ] **Test it against Postgres** in the `alembic_drift_check` job, the
      way `backend/tests/test_user_competency_backfill.py` does.

## Phase 3: Switch reads

- [ ] **Rebuild `_registration_strings` and `_registration_dicts`**
      (`router.py:298-336`) from the current rows. The defensive parsing
      goes, because a row cannot hold a malformed registration.

- [ ] **Rebuild the check in `verify_assessor_registration`**
      (`router.py:2347`) as a lookup of a current row with that authority
      and number.

- [ ] **Stop skipping `test_a_lapsed_registration_drops_clinical_grants_not_memberships`**
      in `backend/tests/test_org_scoped_access_criteria.py:386`, if the
      behaviour it describes is wanted. It is skipped because "the JSON is
      something nothing reads". Rows remove that reason, but whether a lapsed
      registration should narrow clinical grants is a policy question, which
      the open questions below cover.

## Phase 4: Point verification at the registration

- [ ] **Answer the question this plan was asked to settle first.** Should
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

- [ ] **Add `registration_id`** (FK `professional_registration.id`,
      nullable) to the verification table, backfill it by matching user,
      authority and number, then switch the route to write it. Drop the two
      copied columns in Phase 6.

- [ ] **Decide whether `verified` should start appearing.**
      `_registration_dicts` hardcodes `verified: False`, and the sign-off
      call never passes `registration_verified`. So the verification route
      writes rows that nothing shows, and `RegistrationBadge` never draws its
      verified marker. Wiring it up is a visible change to sign-off records,
      which are frozen and hashed (`hashing.py:81`). It belongs to its own
      unit with its own review, not folded into a storage change.

## Phase 5: Stop writing JSON, and clear what is already dead

- [ ] **Remove the JSON write** from `accept_assessor_invite`.

- [ ] **Delete the dead code found during the investigation**, each in
      its own commit so a reviewer can see it is unused:
      - `ProfessionalRegistration` in `backend/app/schemas/cbac.py:43-60`,
        a schema with expiry and status fields that nothing uses.
      - `AssessorInviteIn` (`backend/app/schemas/passport.py:650`) and
        `InviteAssessorForm.tsx`, with its `inviteAssessor` client call.
        They post to `/passport/{id}/assessor-invites`, a route that no
        longer exists. Invites are now raised inside the sign-off request.
      - `verifyAssessorRegistration` in `frontend/src/lib/passport/api.ts`,
        unless Phase 4 builds the admin page that calls it.

## Phase 6: Drop the columns

- [ ] **Drop `users.professional_registrations`**, and the copied
      `registration_authority` and `registration_number` on the
      verification table, in one destructive migration with the
      `allow-destructive` marker. It goes through the
      `db-destructive-migration-review` environment.

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
  expressible. Whether it narrows clinical competencies, only stops somebody
  signing off, or only warns is a clinical governance decision.

- **Where does `ends_on` come from?** Quill checks no register. Until one is
  integrated, an end date is either typed by an administrator or absent.

- **Should a verification lapse?** `AssessorRegistrationVerification` never
  expires, and `test_passport_models.py:578` asserts it has no expiry column.
  A re-check cycle, annual like revalidation, would reverse that.
