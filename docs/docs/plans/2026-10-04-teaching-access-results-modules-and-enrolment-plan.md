# Teaching access: results, modules and enrolment plan

Found in UAT on 4 October 2026: a delegate with "Take Teaching
Assessments" removed could still open `/teaching`, open a module, sit a
whole assessment and download a certificate, and was refused only the
lesson slides, where the page went wholly white. The competency behind
that label, `view_teaching_cases`, is checked on the lesson and video
routes and on nothing to do with assessments. Every other learner route
asks only that the person's organisation has teaching switched on. So
the one competency a teaching admin can take away guards the wrong half,
and nothing says which person may enter which module: an organisation's
modules are open to all of its members or to none.

The outcome wanted is teaching run on the same three layers as clinical
work. A competency says what somebody may do: see their own results, or
take modules. A practising row says where: at this centre. An enrolment
row says which module. All three are given in one act when somebody
arrives, so the layers cost nobody any extra steps, and each can be taken
away alone: a centre that leaves the programme loses its practising rows,
and its people keep their results. Selling to the public is not built
here; it is recorded at the foot as work to come.

## Phase 1: Say why a lesson cannot be shown

- [x] In `frontend/src/features/teaching/pages/SlideReader.tsx`, replace
      the `return null` for "no slide to show" with `TeachingLayout`, the
      teaching menu and a `StateMessage`. Returning null drew no ribbon
      and no menu, so a refused learner saw a white screen with no way
      out. Two wordings: "You do not have access to this lesson" for a
      refusal, and "This lesson could not be loaded" for a module that is
      missing, has no slides or failed to fetch.

- [x] In `frontend/src/features/teaching/learning-data.ts`, let a 403
      through `getModuleDetail` instead of folding it into null with every
      other failure, and add `isRefused` to recognise it. Folded into
      null, a refusal read as "no such module" and the page had no way to
      say which it was.

- [x] Tests in `SlideReader.test.tsx` and `learning-data.test.ts`: a
      missing module, an empty one, a failed fetch and a refusal. Ran
      `just uf` on those two files: 16 passed.

- [x] Show the 404 page for a lesson somebody may not have, in place of
      "You do not have access to this lesson". The app's rule is that a
      page a person may not use looks as if it does not exist: every
      route guard shows `NotFoundLayout`, and the API already answers
      404 for a module that is not theirs. Naming the refusal confirms
      the lesson is there. So in `SlideReader.tsx` a 403 or a 404 from
      the API renders `NotFoundLayout`, and "This lesson could not be
      loaded" is kept for a real failure, a network or server error,
      which is worth retrying. `getModuleDetail` has to tell the three
      apart, where it now knows only "refused" and "anything else".
      Update the two test files to match. Done: a module with no
      slides gets the 404 too, since the API already answers 404 for
      one, and `getModuleDetail` returns null for a 403 or a 404 and
      throws the rest.

## Phase 2: Split the learner competency in two

- [x] In `shared/competency-definitions/teaching.yaml`, add
      `view_teaching_results` ("View own teaching results") and
      `take_teaching_modules` ("Take teaching modules"). Named for what
      the person does; "read" and "write" were set aside because nothing
      is written. Mark `view_teaching_cases` retired with `retired_on`,
      as `manage_teaching_content` was, so rows and audit entries naming
      it stay readable. Correct the comment in `safety.yaml` that cites
      it.

- [x] Put both new ids on `manage_teaching`'s `may_grant` list and take
      `view_teaching_cases` off it. A teaching admin manages both; a new
      competency can be granted by nobody but `manage_users` until it is
      listed.

- [x] In `shared/base-professions.yaml`, give `teaching_delegate`,
      `teaching_clinical_lead` and `teaching_admin` both new competencies
      in place of `view_teaching_cases`. Then `yarn generate:types` in
      `frontend/`. The profession only seeds rows for accounts made
      afterwards, which is why the next step exists.

- [x] Write a migration by hand that gives every holder of a current
      `view_teaching_cases` grant row a current row for each of the two
      new competencies, carrying the old row's `source`, `granted_by` and
      `org_unit_id`, then closes the old row. Ids as literals: a
      migration cannot read the catalogue. Idempotent, skipping anybody
      who already holds the new one. There is no model change, so
      `just migrate` has nothing to autogenerate. Practising rows are
      copied the same way. Its test,
      `tests/test_teaching_competency_split_migration.py`, is an
      integration test against Postgres, so it runs in the
      `alembic_drift_check` CI job and not in `just ub`; no recipe runs
      it locally.

- [x] In `backend/app/features/teaching/router.py`, replace
      `_DEP_VIEW_CASES` with two dependencies and put one on every
      learner route. None may be left with neither:

      - **Results** (`view_teaching_results`) – `GET /assessments/history`,
        `GET /assessments/{id}`, `GET /assessments/{id}/question-results`,
        `GET /assessments/{id}/certificate`, and `GET /question-banks`,
        which the `/teaching` page calls.

      - **Modules** (`take_teaching_modules`) – `GET /question-banks/{id}`,
        `GET /modules`, `GET /modules/{id}/learning`,
        `POST /modules/{id}/video-access`, `POST /assessments`, and the
        four routes that sit an attempt: `current`, `item/{order}`,
        `answer` (post and put) and `complete`.

      `GET /question-banks` returns an empty list to somebody without the
      modules competency, not a refusal: the page then shows what it
      shows an organisation with nothing open, and no module's name
      reaches a person who may not enter it.

      Adding a 403 to a route changes no schema, so the API
      breaking-change check should stay quiet. Run it on the push and
      read the result before assuming so.

- [x] Tests in `backend/tests/`: for each learner route, a holder of the
      right competency is served and a holder of only the other is
      refused. One test walks every route on `teaching_router` and fails
      if a learner route carries neither dependency, so a route added
      later cannot be left open by accident. Both are in
      `tests/test_teaching_learner_gates.py`.

- [x] Let the result page stand on the assessment alone. It asks for
      the module as well (`GET /question-banks/{id}`), for its title and
      whether a pass earns a certificate, and the module is behind the
      modules competency. Somebody keeping only their results would see
      a result with no title and no certificate button. So
      `GET /assessments/{id}` gains `bank_title` and
      `certificate_available`, read from the version that was sat, and
      `AssessmentResultPage.tsx` uses them and treats a refused module
      as "no retry on offer", not as an error. Both fields are additive.

- [x] In `frontend/src/routes.tsx`, wrap the `/teaching` routes in
      `<RequireCompetency competency="view_teaching_results">` inside the
      existing `RequireFeature`, and the module, lesson and assessment
      routes beneath it in a second guard for `take_teaching_modules`.
      The result and question-results pages stay under the outer guard
      only. Each page keeps its one route and its `handle`, using the
      third argument of `lazyFrom` for the guard, as
      `frontend/src/lib/lazyRoute.ts` explains.

- [x] In `frontend/src/components/navigation/featureNavItems.ts`, show
      the Teaching link only with the feature and
      `view_teaching_results`, matching the route. Somebody with neither
      then lands on `NoAccessLayout` through `HomeRedirect`, which
      already reads the same list.

- [x] In `frontend/src/features/teaching/pages/TeachingDashboard.tsx`,
      nothing new to build: a results-only person gets an empty module
      list from the API and so sees the existing "No assessments are
      currently open" text above their results. Add a test that says so.

- [x] Update the tests and stories that name `view_teaching_cases` or
      "Take Teaching Assessments": `MemberPracticePanel`,
      `PracticeByPlaceEditor`, `AddStaffToOrgPage`, `CompetencyBadge` and
      `src/lib/cbac/hooks.test.tsx`. Also the end-to-end test
      `frontend/e2e/tests/user-form-practice.spec.ts`, which picks the
      delegate's competency by its label.

- [x] Update the CBAC section of `.github/copilot-instructions.md`
      where it lists what a teaching admin may grant, then run
      `/sync-copilot-config`. Nothing to change: the instructions name
      no teaching learner competency, and what they say of
      `RequireFeature` and `RequireCompetency` still holds.

## Phase 3: Check the place

Decided on 4 October 2026, after Phase 2's backend half had landed:
teaching uses practising rows as clinical work does, in place of the
"open to all members" switch this plan first described. That switch sat
on an organisation's offer of a module, so it could not say "this centre
has left the programme and the organisation carries on". A practising
row at the centre can.

- [ ] Add `may_take_modules_through` to a new
      `backend/app/features/teaching/access.py`: the org units through
      which a person may take an organisation's modules. That is the
      organisation itself and everything beneath it where
      `can_practise_at(db, user, "take_teaching_modules", ...)` holds.
      Nothing is inherited, as everywhere else: a row at a centre says
      nothing about the organisation, so the function looks at each org
      unit the person belongs to under that organisation. Every teaching
      read of "where" goes through this module, as every other read of
      a place goes through `cbac/scoped.py`.

- [ ] Use it in `resolve_visible_module`, `get_question_bank`,
      `list_question_banks`, `list_learning_modules` and
      `start_assessment` in `router.py`: an organisation's module is
      there for somebody only if they may take modules through one of
      its org units. The refusal stays the 404 those routes already
      give. The routes that sit an attempt check it too, so an attempt
      under way stops when the row goes. Nobody uses production yet, so
      the simple rule is taken over a grace period.

- [ ] Results ask for no place. `view_teaching_results` and ownership
      of the attempt are the whole check, so results survive leaving a
      centre, a centre leaving the programme, and an enrolment ending.

- [ ] Check which org unit types may hold the row. `can_hold_competencies`
      in `shared/org-unit-types.yaml` decides, read through
      `type_can_hold_competencies`. Every type a delegate registers at
      must allow it; if one does not, that is a finding to bring back,
      not a flag to flip quietly.

- [ ] Write a migration by hand so nobody loses their way in: for every
      member of an org unit under a teaching organisation who holds a
      current `take_teaching_modules` grant, write a practising row for
      it at each such org unit they belong to, unless one is there.
      Idempotent, ids as literals. It lands in the same unit as the
      check, or the deploy between them locks everyone out.

- [ ] Leaving takes the row with it. Find what removing a membership
      does to practising rows today, in `backend/app/organisations.py`
      and the org-unit routes; if it leaves them, remove the
      `take_teaching_modules` row at that org unit when the membership
      goes. The competency and `view_teaching_results` are untouched.

- [ ] Tests: a row at the centre opens the organisation's modules; a
      row at another organisation does not; no row, with the competency,
      opens nothing; removing the row closes lessons, video and a
      running attempt and leaves results and the certificate reachable;
      leaving the centre removes the row.

## Phase 4: Enrolment rows

- [ ] Add `ModuleEnrolment` to `backend/app/features/teaching/models.py`
      and generate the migration with `just migrate`. Columns: `user_id`,
      `org_unit_id` (the organisation serving the module),
      `question_bank_id`, `starts_on`, `ends_on` (nullable), `source`,
      `granted_by` (nullable), each a foreign key where it names a row.
      A row means enrolled; there is no boolean, and withdrawing somebody
      sets `ends_on`, as `user_competency` does. One table with foreign
      keys, not a list on the user: an enrolment is a relationship
      between three things, and something will need to point at it.

- [ ] Enrolment is required for every module. There is no module open
      to all comers and no switch to make one so: the rule is the same
      everywhere, and "why can this person enter?" always has a row for
      an answer. The cost is that a module added later has nobody
      enrolled, which the script below pays.

- [ ] Write `backend/app/features/teaching/enrolment.py` with
      `is_enrolled`, `enrol` and `withdraw`, and add the check to
      `access.py` so one function, `may_enter_module`, answers the
      whole question: the organisation serves the module, the person
      may take modules through one of its org units, and they hold a
      current enrolment. The routes from Phase 3 call that.
      `list_question_banks` lists only what may be entered.

- [ ] In the same migration, enrol everybody who can enter a module
      today: each person with a practising row from Phase 3, on every
      module their organisation serves (an `active_version` that is not
      null). `source` `migration`. Without it the deploy closes every
      module to every delegate.

- [ ] Write `backend/scripts/enrol_teaching_members.py`: given an
      organisation and a module, enrol everybody who may take modules
      through that organisation's org units and is not yet enrolled.
      Prints who it enrolled; `--dry-run` prints and writes nothing.
      This is how a new module reaches the people already there. Add a
      `just` recipe for it, following `.claude/rules/just.md`. How it is
      run against production is deliberately left for later: nothing
      needs it until a module is added to an organisation with people
      already in it.

- [ ] Tests: no row, a current row, a row not yet started, a row ended,
      a row at another organisation, the module list hiding what cannot
      be entered, and the script enrolling only those with a place.

## Phase 5: One act at the door

Three layers are three things to forget, so nobody is asked to do them
one at a time. Arriving does all three; leaving undoes the right one.

- [ ] Add `admit` to `access.py`: for one person, one org unit and a
      list of modules, give `view_teaching_results` and
      `take_teaching_modules` if they lack them, write the practising
      row for `take_teaching_modules` at the org unit, and enrol them
      on each module, with an optional end date. One transaction: all
      of it or none, the rule `grant_and_authorise` in
      `backend/app/org_units/router.py` already follows for two of the
      three. Asking again changes nothing.

- [ ] Public registration admits. `/teaching/register/:module` is the
      join link and already exists; `POST /api/auth/register` already
      takes the organisation and the site and adds the person as a
      trainee of both. It does not take the module. Add an optional
      `teaching_module_id` to its body, sent by
      `frontend/src/pages/TeachingRegisterPage.tsx` from the address,
      and call `admit` for the site (or the organisation when no site
      is named) and that module. Accept it only where the organisation
      has `site_registration` on for that module, which is what the
      public module list already reads; anything else is refused, so a
      crafted request cannot enrol somebody on a module that is not
      open to registration.

- [ ] Add `POST /api/teaching/admin/org-units/{unit_id}/members/{user_id}/admit`,
      gated on `_DEP_MANAGE` and scoped to the caller's org units in
      the body, taking the modules and an optional end date. For
      somebody already a member who is to be given teaching.

- [ ] Add the two ways out, under the same gate and scope:
      `.../members/{user_id}/withdraw` removes one person's practising
      row at the org unit, and
      `POST /api/teaching/admin/org-units/{unit_id}/withdraw-everyone`
      does the same for every member there at once, for a centre
      leaving the programme. It is people's access that is withdrawn,
      never the centre: the org unit, its memberships and its place in
      the tree stay exactly as they are, so everybody can still open
      their results. Neither route touches a competency, a result or an
      enrolment: the enrolment stays as a record of what was bought,
      and does nothing without a place.

- [ ] Add `GET /api/teaching/admin/org-units/{unit_id}/members/{user_id}/access`:
      for each module the organisation serves, whether the person may
      enter, and if not which of the three is missing. Three layers are
      only workable if the missing one can be named without reading
      the database, which is how this plan began.

- [ ] Tests: registration through the link leaves somebody able to
      enter that module and no other; registration naming a module not
      open to registration is refused; `admit` twice writes nothing
      new; withdrawing a centre closes its people's modules and leaves
      another centre's untouched; the access route names each missing
      layer.

## Phase 6: The admin pages

- [ ] On the admin module page for an organisation, list who is
      enrolled, with dates, and an action to enrol or withdraw one
      person. Reuse `DataTableControlled` with its `action` slot and
      the existing member picker before building anything; a new
      component needs a plan and a person's agreement first.

- [ ] An "Add to teaching" action on a member of an org unit: a short
      form of the org unit (fixed), the modules as ticks and an optional
      end date, calling `admit`. This is the wizard. It is a form, not
      a multi-step flow, because there is one decision in it.

- [ ] On the same member, show the access route's answer: each module
      with a yes, or the missing layer in plain words ("not enrolled",
      "no place at this centre", "may not take modules").

- [ ] A "Withdraw everyone's access" action on an org unit, behind a
      confirmation that says how many people it affects, that the
      centre itself is not removed, and that their results are kept.

- [ ] Tests and stories for each, and tests for the pages.

- [ ] Add journey 3, "open and complete a teaching lecture", to the
      "Not yet run" list in
      `docs/docs/frontend/accessibility/testing-log.md`. This plan
      changes who is offered the Teaching link and adds refusal states
      on the way to a lesson.

## To do later: selling to the public

Not built by this plan. Each needs its own plan when its time comes.

- [ ] **A public page for a module** – title, description, cover image
      and price, shown to somebody who cannot enter it. Today a person
      who may not enter a module is told nothing about it, on purpose;
      a selling organisation needs the opposite, so the two have to be
      reconciled per organisation, not app-wide.

- [ ] **Online payment** – a successful checkout calls `admit`, with
      `source` naming the sale. Prices, VAT, receipts and refunds come
      with it. Until then an admin admits by hand and the sale is
      invoiced.

- [ ] **Bundles and subscriptions** – undecided. A bundle can be
      several enrolment rows; a subscription may want a different
      shape.

## Decisions

- **Teaching uses the three layers clinical work uses** – competency,
  practising row, and a row for the thing itself. It is more to set up
  than a single switch, and it was chosen anyway: it is the model the
  rest of the app already explains, it answers "why could this person
  do that?" with one row per layer, and teaching is a good place to
  prove it on something lower-stakes than prescribing.

- **Two competencies, kept separate** – holding the modules competency
  without the results one reaches nothing, because `/teaching` is the
  way in. That odd state is accepted over letting "modules" quietly
  include "results": one competency meaning two things is what caused
  the confusion this plan starts from. The professions carry both.

- **A centre leaves by its people losing their practising rows, not by
  a switch and not by removing the centre** –
  the first version of this plan had an "open to all members" switch
  per organisation per module, then a passport-style cover was
  considered. Both were dropped for the practising row, which already
  exists, belongs to the centre and not the organisation, and leaves
  the competency and the results alone. The centre stays where it is.

- **Results are given at the door and never taken back** – a result
  records something done. Leaving, a centre withdrawing and an
  enrolment ending all leave `view_teaching_results` in place.

- **Enrolment for every module, with a script for the bulk case** – a
  module marked "by enrolment" beside modules open to everyone at a
  centre was the alternative, and would spare a customer the script
  when a module is added. One rule everywhere was preferred to two.

- **The enrolment outlives the place** – withdrawing people's access at
  a centre removes practising rows and leaves enrolments. If the centre returns, giving
  the place back restores exactly what each person had.

- **A results-only person sees no module names** – the module area
  shows the same text as an organisation with nothing open. Showing the
  modules they once sat, with a renewal date, was considered and set
  aside for now.

- **A competency per module was rejected** – competencies are a
  hand-written catalogue and modules arrive by sync, so every new
  module would need a catalogue edit and a release.

- **An organisation per product was rejected** – it works today with
  no code, but ten modules is ten organisations and a buyer's results
  are split across them.

- **No cohorts** – enrolling a group with shared dates is a layer on
  top of rows, left until a course is run that way.
