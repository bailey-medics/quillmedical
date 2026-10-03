# User form practice step plan

Creating somebody takes two visits today. The new and edit user form
(`/admin/users/new`, `/admin/users/:id/edit`) puts a person at their org
units and gives them their competencies, and then stops: a competency
with no `practising_competency` row behind it authorises nothing, so the
new starter can do nothing anywhere until an admin opens each org unit's
staff table, finds them, and switches their practice on. An admin who
runs one site, and has just created somebody for it, has to leave the
form to finish the job the form was opened to do.

The outcome is a **Practice** step in that form, after Competencies. It
shows one block per org unit the person is being put at, each with a "may
practise here" switch for every competency they will hold, and it is
saved with the rest of the form. Nothing in the authorisation model
changes: the step is a third way in to the rows the member practice page
and the org unit routes already write.

## Phase 1: One place that writes a practice row

Backend only, and nothing a person would notice. The member practice
page (`/admin/sites/:id/members/:userId`) and its routes keep their
addresses and their behaviour; the code behind them is shared so that
the user form can write the same rows without a second copy of the rule.

- [x] **Share the writing of a practice row, in
      `backend/app/cbac/scoped.py`**, as `authorise_practice` and
      `withdraw_practice`. Three routes in
      `backend/app/org_units/router.py` wrote the row inline:
      `authorise_practising_competency`, `withdraw_practising_competency`
      and `grant_and_authorise`. Each carried the same rule: a repeat is
      a no-op and not an error, and the row already there keeps who
      authorised it. The user routes are about to write the same rows,
      and `scoped.py` already says every read of a place goes through it.
      Two copies of the rule would drift; the first to drift would be the
      one a new admin meets. The routes keep their own gates and call the
      writers. No behaviour changes, and the existing tests in
      `backend/tests/test_member_practice_api.py`,
      `test_practising_competency_api.py` and
      `test_manage_teaching_org_unit_routes.py` pass untouched. The
      writers have tests of their own in `test_cbac_scoped.py`.

- [x] **Put "may this caller set practice at this org unit, for this
      competency?" in one function, `practice_refusal`**, taking the
      caller, the org unit, the person and the competency. It is the two
      practice routes' checks, gathered: the org unit must be one the
      caller reaches for `manage_practising_competencies`, and a caller
      who reaches it only through a scoped manager such as
      `manage_teaching` stays inside its whitelist. Authorising also asks
      that the org unit's type can hold competencies
      (`type_can_hold_competencies`), that the person exists, and, for a
      scoped manager, that the person is a member there. Withdrawing asks
      for none of those three, as before, so a row can always be taken
      away. It returns the refusal, as `_grant_refusal` does, so the user
      routes can collect every refusal and name them together instead of
      stopping at the first.

      It lives in `backend/app/org_units/router.py`, not beside the
      writers in `scoped.py` as first planned. It is built from that
      module's own helpers for who reaches an org unit
      (`_require_visible`, `_through_a_scope`, `_require_member`), and it
      answers in HTTP refusals, which `scoped.py` knows nothing of.
      `main.py` already imports from the router, so the user routes can
      call it from there.

## Phase 2: The user routes take practice

- [x] **Add `practising` to `AdminUserCreateIn` and `AdminUserUpdateIn`**
      in `backend/app/main.py`: an optional list of `PractisingAtIn`,
      `{org_unit_id, competencies}`, one entry per org unit, validated
      with `validate_competency_ids` as the two competency lists already
      are. Optional and defaulting to nothing, for two reasons. A client
      built before this step sends no such field and must change nobody's
      practice. And it keeps the change additive, so the API
      breaking-change check has nothing to flag. Both models already set
      `extra="forbid"`. The same org unit listed twice is a 422: each
      entry is the whole answer for its org unit, so the second would
      undo the first.

- [x] **Settle practice in `create_user_with_cbac` and `update_user`,
      after membership and competencies are settled** and in the same
      transaction, so a new starter is never left created and
      unauthorised. Both call `_settle_practice`. For each org unit
      named, the list is the whole answer for the competencies the person
      holds once this save is applied: listed ones are authorised, held
      ones not listed are withdrawn. Three limits on that:

      - **An org unit not named is not touched.** The form names only
        the org units it showed, and an admin who cannot see a place must
        not empty it by saving.
      - **A row for a competency outside the person's ceiling is left
        alone.** Those are the "Authorised here but not held" rows the
        member practice page shows on purpose, so that a lapsed
        qualification is seen. The form has no switch for them, so its
        silence about one is not an instruction to withdraw it. To see
        them at all, the settling reads the rows through a new
        `authorised_at` in `scoped.py`, which applies no ceiling;
        `competencies_at` narrows to the ceiling and would have hidden
        them.
      - **A row that does not change keeps its `authorised_by` and
        `authorised_at`.** Rewriting every row on every save would turn
        "who authorised this?" into "who last opened the form?".

      A listed competency the person does not hold is authorised all the
      same, as the authorise route has always allowed: the row does
      nothing until the ceiling catches up. The form never sends one.

- [x] **Refuse what the caller may not set, using `practice_refusal`
      from phase 1**, and refuse the whole save, not part of it. Every
      change is checked before any is written, and the refusals are
      gathered into one answer: the status of the first, and each
      distinct reason. The user routes admit `manage_users` or a scoped
      manager; setting practice needs `manage_practising_competencies` or
      a scoped manager acting within its whitelist. `practice_refusal`
      does not ask that itself, because the practice routes sit behind a
      dependency that does, so `_settle_practice` asks it first: a caller
      with `manage_users` alone gets a 403. Each named org unit must also
      be one the person belongs to once the save is applied, or the save
      is a 422: the form offers practice only where it is putting them.

      A list that changes nothing is never refused. The form sends every
      field on every save, so a caller who may not set practice, or a
      scoped manager looking at a clinician, must be able to save a form
      that carries the practice it was shown.

- [x] **Return what the form needs to open in edit mode.** `practising`,
      as `PractisingAtOut` in the request's own shape, is added to
      `UserOut` (`backend/app/schemas/auth.py`), read through
      `competencies_at` in `scoped.py`. One entry per org unit the person
      belongs to, with an empty list where nothing is authorised.
      Narrowed to the org units the caller reaches, by the rule
      `org_units_whose_people_reached_by` already gives the user routes,
      so the response never names a place the caller could not open. An
      added response field is not a breaking change.

- [x] **Test it in `backend/tests/test_user_form_practice.py`**: a new
      user created with practice at two org units holds exactly those
      rows; a refused save leaves no account behind; an update authorises
      and withdraws in one save; an org unit left out is untouched; a
      row for a competency they do not hold survives; an unchanged row
      keeps its author; a caller with `manage_users` alone is refused,
      and is not refused for a list that changes nothing; a scoped
      manager is held to its whitelist; an org unit the person does not
      belong to is a 422; a request with no `practising` changes nothing;
      and what `GET` returns can be sent straight back.

## Phase 3: The practice editor component

- [x] **Build `PracticeByPlaceEditor` in
      `frontend/src/components/member-practice/`**, with stories and
      tests. One `BaseCard` per org unit, headed with its name, holding a
      table of the competencies the person will hold and a `SolidSwitch`
      for each: the same row the member practice page draws, composed
      from the same parts, so no new atomic component is needed. It is
      controlled: it takes the org units, the competencies, the current
      choices and what the viewer may change, and reports a change. It
      saves nothing itself. Each switch is named with its org unit as
      well as its competency ("Certify Death at Oncology: may practise
      here"), because the same competency has a switch in every card and
      a screen reader hears them all. The naming and sorting of
      competency rows moved out of `MemberPracticePanel` into
      `competencyRows.ts`, which both now use.

- [x] **Disable, do not hide, what the viewer may not switch.** A
      teaching admin sees every competency the person holds and may
      switch only the teaching ones, as `MemberPracticePanel` already
      does with `may_change`. Hiding the rest would make a clinician look
      as if they held nothing. The editor takes a `mayChange` function,
      and the form passes it from `useGrantScope`.

- [x] **Say plainly when there is nothing to show**: no org unit chosen
      yet, an org unit whose type holds no competencies (a room, where
      "nobody is clinical lead of room four" applies as much to practice),
      or a person who will hold no competencies. Whether a type holds
      competencies is read by `typeCanHoldCompetencies` in
      `frontend/src/domains/orgUnit.ts`, from the same
      `shared/org-unit-types.yaml` the backend asks before it writes a
      row.

## Phase 4: The step in the form

- [ ] **Add the step to `frontend/src/pages/UserInfoUpdatePage.tsx`
      after Competencies**, so the steps read Basic details,
      Organisation/site, Competencies, Practice, Permissions, Review. It
      has to follow both of the steps before it, because it is built from
      their answers: the org units chosen in Organisation/site, and the
      competencies the profession and the two lists in Competencies
      resolve to. Going back and changing either must drop choices that
      no longer apply: practice at an org unit since removed, or for a
      competency since taken away.

- [ ] **Everything starts switched off for a new user.** A ceiling with
      no row behind it authorises nothing, and the form should not grant
      practice by default any more than the API does. In edit mode the
      switches open as the server holds them.

- [ ] **Offer the step only to somebody who may use it**: a holder of
      `manage_practising_competencies`, or a scoped manager. Anybody else
      gets the form as it is today and sends no `practising`, so the API
      leaves practice alone.

- [ ] **Show practice in the Review step, per org unit**, and in edit
      mode mark what will be withdrawn, with the member practice page's
      wording: withdrawing stops them practising it there straight away,
      and they stay qualified and stay authorised anywhere else. The
      Review step is this form's confirmation, so it is where that
      warning belongs; a second modal on top of it would be the same
      question asked twice.

- [ ] **Send `practising` with the create and the update**, and load it
      in edit mode from the field added to `GET /api/users/{id}`.

- [ ] **Extend `frontend/src/pages/UserInfoUpdatePage.test.tsx`** for
      the new step, and add an end-to-end case beside
      `frontend/e2e/tests/member-practice.spec.ts`: an admin creates
      somebody at an org unit with one competency switched on, and that
      person's page at the org unit shows it authorised.

## Decisions

- **Called "Practice", not "Grants".** In this app to grant a competency
  is to give somebody the competency itself, which follows them
  everywhere: the "Grant competency" button, `may_grant`, the modal that
  says "everywhere they work". This step decides only where a competency
  already held may be used, which the app calls practising. A step named
  "Grants" directly after Competencies, which is the granting step, would
  blur the two halves the access model keeps apart.

- **Saved with the form, not as it is switched.** The member practice
  page moved from saving each switch at once to a save and a
  confirmation, in pull request 1420, because a switch that acts at once
  cannot be reviewed. The form already has a Review step and one submit;
  practice joins them.

- **The whole save is refused when part of it is not allowed.** The
  member practice page tries every change and reports how many failed,
  because each is its own request. Here it is one request and one
  transaction, and a new user half created is worse than one not
  created.

- **Removing somebody from an org unit does not withdraw their practice
  there, and this plan does not change that.** `remove_org_unit_member`
  leaves the rows today, and the form's membership step behaves the same
  way. The rows authorise nothing the person can reach, and come back
  into effect if they are added again. Whether they should be withdrawn
  with the membership is a question about the model, not about this
  form, and is left for its own decision.

- **No "authorise everything here" control.** It would be one click to
  authorise a new starter for everything at a place, which is the
  decision the step exists to make deliberately. If creating people
  proves slow without it, it is a small addition to the editor.
