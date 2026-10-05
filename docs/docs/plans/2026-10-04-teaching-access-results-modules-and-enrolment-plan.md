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

- [x] Add `places_for_modules` and `organisations_open_for_modules` to
      a new `backend/app/features/teaching/access.py`: the org units
      where a person holds a `practising_competency` row for
      `take_teaching_modules`, and the organisations reached from them.
      Nothing is inherited, as everywhere else: the row is at the centre
      and it is the centre's reach, the same reach membership always
      had, that opens its organisation's modules. `reach_of_org_units`
      was split out of `get_reachable_org_unit_ids` in
      `backend/app/organisations.py` so both start the same walk from
      different places. Every teaching read of "where" goes through
      this module, as every other read of a place goes through
      `cbac/scoped.py`.

- [x] A row counts only while the person still belongs there. Removing
      a membership does not remove practising rows, and memberships are
      removed in several places, some by a bare delete on the table. So
      the rule is in the read, where it cannot be missed: the row is
      joined to `org_unit_member`. Leaving a centre closes its modules
      with nobody remembering to remove anything, a row left behind has
      no effect, and rejoining restores it.

- [x] Use it in `router.py`. `_get_user_org_ids`, which all five
      learner routes that serve a module already ask
      (`resolve_visible_module`, `get_question_bank`,
      `list_question_banks`, `list_learning_modules`,
      `start_assessment`), now answers from
      `organisations_open_for_modules`. The module list answers empty,
      not 403, for somebody with no place, as it does for somebody
      without the competency. The five routes that sit an attempt check
      the attempt's organisation too, so an attempt under way stops
      when the row goes. Nobody uses production yet, so the simple rule
      is taken over a grace period.

- [x] Results ask for no place. `view_teaching_results` and ownership
      of the attempt are the whole check, so results survive leaving a
      centre, a centre's people having their access withdrawn, and an
      enrolment ending.

- [x] Check which org unit types may hold the row. Every type in
      `shared/org-unit-types.yaml` has `can_hold_competencies` true
      except `room`, which cannot have members either, so nobody can
      register at one. Nothing to change.

- [x] Registration gives the place. `POST /api/auth/register` is how a
      delegate arrives, through a centre's own link, and it adds them
      as a trainee of the organisation and the site. It now writes the
      row too, at the site named or else the organisation, with nobody
      named as having authorised it: the link admitted them. Moved here
      from Phase 5, because without it this phase deployed alone would
      let nobody new in. `authorise_practice` accepts an empty
      `authorised_by` for this, which the column always allowed.

- [x] Found while doing that, and fixed: a self-registered delegate held
      no teaching competency at all. Registration built the `User` and
      then assigned `base_profession`, and the constructor is what
      writes a profession's competencies as rows, so each got a
      patient's row and nothing from teaching. Until Phase 2 that showed
      only as a blank lesson, which is the white screen this plan
      started from; after it they would have been refused everything.
      The profession is now given to the constructor.

- [x] Write a migration by hand, `3d7a91c5e6f2`, so nobody loses their
      way in. First it gives both competencies to teaching accounts
      that never had a row for any teaching learner competency, current
      or closed: the self-registered delegates above. Somebody an
      administrator took it from has a closed row and is left alone.
      Then it writes a practising row at every org unit each holder is a
      member of, unless one is there, which is exactly what membership
      gave them before. Idempotent, ids as literals. Its test,
      `tests/test_teaching_place_migration.py`, is an integration test
      and runs in the `alembic_drift_check` CI job only.

- [x] `backend/scripts/seed_ci.py` gives its two teaching users a
      place, or every end-to-end teaching journey would find no module.

- [x] Tests, in `tests/test_teaching_place.py`: a row at the centre
      opens the organisation's modules; membership alone opens nothing;
      a row outliving the membership opens nothing; a row without the
      competency opens nothing; leaving one centre leaves another open;
      withdrawing the row closes the module list, lessons, starting an
      assessment and an attempt under way, and leaves the result and
      the history reachable; registering gives the place and both
      competencies. The teaching tests' members now join through a
      helper that writes the row, `join_for_teaching` in
      `tests/competencies.py`, as arriving through the door does.

## Phase 4: Enrolment rows

- [x] Add `ModuleEnrolment` to `backend/app/features/teaching/models.py`
      and generate the migration with `just migrate`. Columns: `user_id`,
      `org_unit_id` (the organisation serving the module),
      `question_bank_id`, `starts_on`, `ends_on` (nullable), `source`,
      `granted_by` (nullable). A row means enrolled; there is no boolean,
      and withdrawing somebody sets `ends_on`, as `user_competency` does.
      One table with foreign keys, not a list on the user: an enrolment
      is a relationship between three things, and something will need
      to point at it. The module is named by `question_bank_id`, a
      string, as `Assessment` and `QuestionBankOrgStatus` name it: a
      module is synced content with no table of its own to point at.
      `source` is one of `ENROLMENT_SOURCES`, checked in code.

- [x] Enrolment is required for every module. There is no module open
      to all comers and no switch to make one so: the rule is the same
      everywhere, and "why can this person enter?" always has a row for
      an answer. The cost is that a module added later has nobody
      enrolled, which the script below pays.

- [x] Write `backend/app/features/teaching/enrolment.py` with
      `is_enrolled`, `enrol` and `withdraw`, and add `may_enter_module`
      to `access.py`, which answers the whole question: the person may
      take modules through a place that reaches the organisation, and
      holds a current enrolment there. In `router.py` the five queries
      that find which modules to serve somebody all read
      `QuestionBankOrgStatus`, so one clause, `enrolled_on_offer`, is
      added to each and leaves only the modules they are enrolled on.
      The routes that sit an attempt check the enrolment too.

- [x] In the same migration, `13369e6db053`, enrol everybody who can
      enter a module today: each person with a place, on every module
      the organisation above it serves (an `active_version` that is not
      null), and on the modules of an organisation their place is
      linked to by `teaches_at`. `source` `migration`. Without it the
      deploy closes every module to every delegate.

- [x] Registration enrols. `/teaching/register/:module` is the join
      link and already exists. `POST /api/auth/register` gains an
      optional `teaching_module_id`, sent by
      `frontend/src/pages/TeachingRegisterPage.tsx` from the address,
      and enrols the person on that module and no other. Accepted only
      where the organisation has `site_registration` on for that
      module, which is what the public module list already reads; any
      other is refused with a 400 and no account is made, so a crafted
      request cannot enrol somebody on a module that is not open to
      registration. Moved here from Phase 5, for the reason
      registration's place moved to Phase 3: without it this phase
      deployed alone would let a new delegate into nothing.

- [x] Write `backend/scripts/enrol_teaching_members.py`: given an
      organisation and a module, enrol everybody who may take modules
      through that organisation's org units and is not yet enrolled.
      Prints the usernames it enrolled; `--dry-run` prints and writes
      nothing. The work is `enrol_everyone_with_a_place` in `access.py`,
      so it is tested without the script. This is how a new module
      reaches the people already there. `just enrol-teaching-members`
      (`just etm`) runs it against the dev stack. How it is run against
      production is deliberately left for later: nothing needs it until
      a module is added to an organisation with people already in it.

- [x] `backend/scripts/seed_ci.py` enrols its teaching users on each
      module as it opens it.

- [x] Tests, in `tests/test_teaching_enrolment.py`: no row, a current
      row, a row not yet started, a row ended, a row with an end to
      come, a row at another organisation, a row without a place, the
      module list hiding what cannot be entered, an attempt stopping
      when the enrolment ends, a result outliving it, the bulk enrol
      and its dry run, and registration through a module's link.

## Phase 5: One act at the door

Three layers are three things to forget, so nobody is asked to do them
one at a time. Arriving does all three; leaving undoes the right one.

- [x] Add `admit` to `access.py`: for one person, one org unit and a
      list of modules, give `view_teaching_results` and
      `take_teaching_modules` if they lack them, write the practising
      row for `take_teaching_modules` at the org unit, and enrol them
      on each module, with an optional end date. One transaction: all
      of it or none, the rule `grant_and_authorise` in
      `backend/app/org_units/router.py` already follows for two of the
      three. Asking again changes nothing. A module the organisation
      does not serve is refused before anything is written. The routes
      are in a new `backend/app/features/teaching/door.py`, on a router
      of their own whose dependencies are the teaching feature and
      `manage_teaching`, so a route cannot be added without them.

- [x] Add `POST /api/teaching/admin/org-units/{unit_id}/members/{user_id}/admit`,
      gated on `_DEP_MANAGE` and scoped to the caller's org units in
      the body, taking the modules and an optional end date. For
      somebody already a member who is to be given teaching. The
      scope is `org_units_whose_people_reached_by`, the same answer the
      people routes use. Admitting gives competencies, so it keeps
      their rules: only an operator changes an operator, and nobody
      admits themselves. An end date already past is refused.

- [x] No route takes a place away. `.../members/{user_id}/withdraw`,
      which removed one person's practising row at an org unit, was
      built here and taken out on 5 October 2026 before it merged, for
      the reasons its whole-centre sibling below was. It left their
      modules ticked and doing nothing, it left in anybody who also
      held a place at the organisation above, and ending an enrolment
      already stops somebody, with a record. An admin has one switch:
      the module's tick.

- [x] Withdrawing everybody at a centre at once was built here and
      taken out again on 5 October 2026, before it merged. Nobody had
      asked for it: it came from one "what if a centre leaves the
      programme". Closing a module to registration already stops new
      people, an end date on an enrolment already handles a term
      running out, and those already enrolled have usually been put
      forward and are meant to finish. What was left was one request
      that locks out a whole centre, with no undo and no record of who
      had a place, which is likelier to be made by mistake than needed.
      It also did not do what it said for most people: the Phase 3
      migration and the user form write a place at the organisation as
      well as the site, so withdrawing at the site left them in.

- [x] Add `GET /api/teaching/admin/org-units/{unit_id}/members/{user_id}/access`:
      for each module the organisation serves, whether the person may
      enter, and if not which of the three is missing. Three layers are
      only workable if the missing one can be named without reading
      the database, which is how this plan began.

- [x] Tests, in `tests/test_teaching_door.py`: `admit` gives all
      three layers; `admit` twice writes nothing new; a module not
      served writes nothing; a non-member, an org unit out of reach and
      the caller themselves are refused; giving the place back restores
      what somebody had; the access route names each missing layer.

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
