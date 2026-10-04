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

The outcome wanted is two doors and a list. The outer door, a results
competency, lets somebody reach `/teaching` and keep their past results
and certificates. The inner door, a modules competency, lets them into
modules to learn and be assessed, the way `passport_write` can lapse and
leave the passport readable. The list is an enrolment row per person per
module. Every module starts "open to all members", which is all EoEETA
needs; an organisation that switches that off for a module can sell or
assign it one person at a time, with an end date where access is timed. Selling to the public is not built here; it is recorded at the
foot as work to come.

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

- [ ] In `frontend/src/routes.tsx`, wrap the `/teaching` routes in
      `<RequireCompetency competency="view_teaching_results">` inside the
      existing `RequireFeature`, and the module, lesson and assessment
      routes beneath it in a second guard for `take_teaching_modules`.
      The result and question-results pages stay under the outer guard
      only. Each page keeps its one route and its `handle`, using the
      third argument of `lazyFrom` for the guard, as
      `frontend/src/lib/lazyRoute.ts` explains.

- [ ] In `frontend/src/components/navigation/featureNavItems.ts`, show
      the Teaching link only with the feature and
      `view_teaching_results`, matching the route. Somebody with neither
      then lands on `NoAccessLayout` through `HomeRedirect`, which
      already reads the same list.

- [ ] In `frontend/src/features/teaching/pages/TeachingDashboard.tsx`,
      nothing new to build: a results-only person gets an empty module
      list from the API and so sees the existing "No assessments are
      currently open" text above their results. Add a test that says so.

- [x] Update the tests and stories that name `view_teaching_cases` or
      "Take Teaching Assessments": `MemberPracticePanel`,
      `PracticeByPlaceEditor`, `AddStaffToOrgPage`, `CompetencyBadge` and
      `src/lib/cbac/hooks.test.tsx`. Also the end-to-end test
      `frontend/e2e/tests/user-form-practice.spec.ts`, which picks the
      delegate's competency by its label.

- [ ] Update the CBAC section of `.github/copilot-instructions.md`
      where it lists what a teaching admin may grant, then run
      `/sync-copilot-config`.

## Phase 3: Enrolment rows

- [ ] Add `ModuleEnrolment` to `backend/app/features/teaching/models.py`
      and generate the migration with `just migrate`. Columns: `user_id`,
      `org_unit_id`, `question_bank_id`, `starts_on`, `ends_on`
      (nullable), `source`, `granted_by` (nullable), each a foreign key
      where it names a row. A row means enrolled; there is no boolean,
      and withdrawing somebody sets `ends_on`, as `user_competency` and
      `practising_competency` do. One table with foreign keys, not a
      list on the user: an enrolment is a relationship between three
      things, and something will need to point at it.

- [ ] Add an `open_to_all_members` boolean to `QuestionBankOrgStatus`,
      default true, in the same migration. True is today's behaviour:
      any member of the organisation or one of its sites may enter the
      module, so EoEETA changes nothing and clicks nothing. Named for
      what it allows, not what it withholds, so the switch reads the
      same way round as its label. It sits beside `is_live` because it
      is the same kind of fact: how this organisation offers this
      module.

- [ ] Write `backend/app/features/teaching/enrolment.py` with
      `is_enrolled`, `enrol` and `withdraw`, and one function,
      `may_enter_module`, that answers the whole question: the
      organisation serves the module, and either it is open to all
      members or the person holds a current row. Every read goes
      through this module, as every read of a place goes through
      `cbac/scoped.py`.

- [ ] Call `may_enter_module` from `resolve_visible_module` in
      `router.py`, which is already the single gate for lessons and
      video, and from `get_question_bank` and `start_assessment`. Filter
      `list_question_banks` by it too. The refusal is the 404 those
      routes already give, so "not enrolled" cannot be told from "no
      such module".

- [ ] An attempt already started is stopped when its enrolment ends.
      Check `may_enter_module` on the routes that sit an attempt. Nobody
      uses production yet, so the simple rule is taken over a grace
      period.

- [ ] Results are untouched by enrolment. The results routes ask only
      for `view_teaching_results` and ownership of the attempt, so a
      certificate outlives the enrolment that earned it.

- [ ] Tests: an open module with no row, a module not open to all with
      and without a row, a row not yet started, a row ended, a row at
      another organisation, and the module list hiding what cannot be
      entered.

## Phase 4: Let a teaching admin enrol people

- [ ] Add routes under `/api/teaching/admin`, gated on `_DEP_MANAGE` and
      scoped to the caller's own organisations in the body: list a
      module's enrolments, enrol a member with an optional end date,
      withdraw one. Refuse to enrol somebody who is not a member of the
      organisation. All additive.

- [ ] Add an "Open to all members" switch, on by default, to the
      module's organisation settings route and page, beside "Open for
      assessments"
      (`PUT /admin/banks/{bank_id}/org-units/{org_unit_id}/settings`).
      Its description says who that is: any member of the organisation
      or its sites. Turning it off is what makes the enrolment list
      below it matter, so the list is shown only then.

- [ ] On the admin module page for an organisation, when the module is
      not open to all members, show who is enrolled, with the dates, and an action to add or withdraw. Reuse
      `DataTableControlled` with its `action` slot and the existing
      member picker before building anything; a new component needs a
      plan and a person's agreement first.

- [ ] Tests for the routes (scope, non-member, end date in the past)
      and for the page.

- [ ] Add journey 3, "open and complete a teaching lecture", to the
      "Not yet run" list in
      `docs/docs/frontend/accessibility/testing-log.md`. This plan
      changes who is offered the Teaching link and adds two refusal
      states on the way to a lesson.

## To do later: selling to the public

Not built by this plan. Each needs its own plan when its time comes.

- [ ] **A public page for a module** – title, description, cover image
      and price, shown to somebody who cannot enter it. Today a person
      who may not enter a module is told nothing about it, on purpose;
      a selling organisation needs the opposite, so the two have to be
      reconciled per organisation, not app-wide.

- [ ] **Self-registration into a selling organisation** – a buyer has
      no account and belongs nowhere. `TeachingRegisterPage` is the
      starting point.

- [ ] **Online payment** – a successful checkout writes a
      `ModuleEnrolment` row with `source` naming the sale. Prices, VAT,
      receipts and refunds come with it. Until then an admin enrols by
      hand and the sale is invoiced.

- [ ] **Bundles and subscriptions** – undecided. A bundle can be
      several rows; a subscription may want a different shape.

## Decisions

- **Two competencies, kept separate** – holding the modules competency
  without the results one reaches nothing, because `/teaching` is the
  way in. That odd state is accepted over letting "modules" quietly
  include "results": one competency meaning two things is what caused
  the confusion this plan starts from. The professions carry both.

- **A results-only person sees no module names** – the module area
  shows the same text as an organisation with nothing open. Showing the
  modules they once sat, with a renewal date, was considered and set
  aside for now.

- **An enrolment row per person per module, not an organisation per
  product** – making one organisation for each thing sold works today
  with no code, but ten modules is ten organisations and a buyer's
  results are split across them. A competency per module was rejected
  too: competencies are a hand-written catalogue and modules arrive by
  sync.

- **The competency says "may take modules", the row says "which"** –
  the same split as competencies and practising competencies. Removing
  the competency closes every module at once without a row being
  touched.

- **Any organisation may close a module to enrolled people** – the
  seller may be Quill or a customer. It is a setting on the
  organisation's offer of a module, not a property of the module.

- **The switch is per module, not one for the whole organisation** – a
  seller can leave a taster module open and charge for the rest, which
  a single organisation-wide switch could not do. The cost is one
  switch per paid module. Because every module starts open, an
  organisation like EoEETA never meets it. An organisation-wide default
  can be added on top if flipping them one by one becomes a chore.

- **Enrolment can end; the modules competency cannot yet** – an end
  date on the row covers timed access. A term on the competency itself,
  as `passport_write` has, waits until somebody asks for it.

- **No cohorts** – enrolling a group with shared dates is a layer on
  top of rows, left until a course is run that way.
