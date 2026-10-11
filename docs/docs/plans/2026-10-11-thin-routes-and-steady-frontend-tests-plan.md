# Thin routes and steady frontend tests plan

Two pieces of test debt that the
[tests beside the source plan](2026-10-09-tests-beside-the-source-plan.md)
turned up and left alone. The first is in the backend: four routers hold
their rules inside the route functions, where a rule can be reached only
by building a whole request, so the rules are slow to test and several
are not tested at all. `main.py` and the teaching router are among the
least covered files in the backend for that reason. The second is in the
frontend: under load, different page tests fail from run to run, each
unable to find something on the page in time. A test that fails for the
machine and not for the code teaches everybody to re-run a red build
without reading it.

Neither changes what the application does. The outcome is that a rule
can be tested in a few lines by calling a function, and that a frontend
test fails only when the code is wrong. The routes come first, because
that work is larger and each step of it is safe to land alone.

## Phase 1: Set the shape on one route, `update_user`

- [ ] Split `update_user` in `backend/app/main.py` in two. It is the
      largest route in the backend, 294 lines and 28 branches, so if
      the shape works here it works anywhere. It is too much to read as
      one pull request, so it goes a part at a time, each its own pull
      request with the route tests passing unchanged, and the work
      carries on: a change of mind about the shape, on review, is made
      on the first and followed by the rest.

      - **A plain function decides** - it takes ordinary values (the
        person, who is asking, what was sent) and a session, and either
        makes the change or raises an error of its own. It knows
        nothing of HTTP: no `Request`, no `HTTPException`, no status
        code. `backend/app/cbac/grants.py` and
        `backend/app/cbac/practising.py` already work this way, and are
        the pattern to copy.
      - **The route stays thin** - it checks who is asking, calls the
        function, and turns the result or the error into a response.

      The parts, in the order the route does them. This list was
      written when the first part was built, on 11 October 2026: read
      closely, the route is five separate jobs and a set of checks on
      who may ask.

      - [x] **Name, email and password** - `change_identity` in
            `backend/app/users/identity.py`. The smallest part, and so
            the one that sets the shape. The route tests never pinned
            the words of these four refusals, so
            `backend/tests/user_update_identity_refusals_test.py` now
            does, through the route.
      - [x] **Who may change what** - the checks that the caller's
            scope reaches the account, the profession and the
            competencies changed (`_require_account_in_scope`,
            `_require_profession_in_scope`, `_require_changes_in_scope`)
            and the rule that nobody grants themselves a competency.
            `create_user_with_cbac` uses the same helpers, so they move
            once and both routes call them.
            Now `check_account_in_scope`,
            `check_profession_in_scope`, `check_changes_in_scope`,
            `check_may_set_platform_role` and
            `check_not_granting_to_self` in
            `backend/app/users/scope.py`. Two of the refusals carry
            catalogue ids (the competencies, the profession), so their
            words did not change.
      - [ ] **The competency lists** - what `additional` and `removed`
            come to after a change of profession and a promotion to
            `superadmin`, and the write through `sync_competency_rows`.
      - [ ] **Where they belong** - membership of the org units the
            caller administers, and keeping passport cover in step.
      - [ ] **Practice and teaching enrolments** - `_settle_practice`
            and `_settle_teaching_enrolments`, both shared with
            `create_user_with_cbac`.
      - [ ] **The whole save as one function**, calling the five above
            in order, with the route left to find the person, check the
            caller may reach them, and return.

- [x] Put the plain functions in a module for each area, beside the
      code they belong with, each with its `_test.py` beside it:
      `backend/app/users/` for the people routes, to start with.
      `main.py` is 6,367 lines, and moving rules from one end of it to
      the other gains little. A rule that already has a home goes
      there and not into a new module, as Phase 3 does with
      `teaching/access.py`.

- [x] Report a refusal the way the messaging module does.
      `MessagingError` in `backend/app/messaging.py` has a subclass for
      each refusal, and each fixes its own message, code and status;
      the route returns those and never formats the exception. Use the
      same shape for each new module, so that nothing can reach a
      caller that somebody did not write for them to read. The status
      and the words a caller gets today must not change. **Built as
      `UserAdminError` in `backend/app/users/errors.py`, with one
      handler in `main.py`** and not a `try` in each route, which is
      where it differs from messaging: the people routes share their
      helpers, so a helper moved out of `main.py` answers the same way
      from every route that calls it, with nothing to remember. The
      handler's body is `{"detail": message}`, which is what an
      `HTTPException` gives.

- [ ] Prove nothing changed. The route tests in `backend/tests/` that
      drive `update_user` through the API must pass **unchanged**,
      before and after. They are the safety net for the whole plan. A
      route test that fails means the split moved the behaviour: put
      the split right, and leave the test as it is.

- [ ] Write the tests the split makes possible: one for each branch of
      the plain function, called directly. This is the point of the
      work. Run `just tc py` before and after and record both figures
      for `main.py` here.

## Phase 2: The rest of `main.py`

One route to a pull request, largest first, each with the same two
checks as Phase 1: the route tests pass unchanged, and the new function
has tests of its own. Measured on 9 October 2026, `main.py` had 64
routes, 2,636 lines inside route bodies, and 18 routes of 40 lines or
more.

- [ ] `register`, 270 lines and 24 branches. It decides several things
      in a row, and is the first thing a new person meets.
- [ ] `ci_teaching_sync`, 168 lines.
- [ ] `list_users`, 159 lines.
- [ ] `create_user_with_cbac`, 119 lines. Do it with `update_user`
      fresh in mind: the two share rules, and the split should leave
      one copy of each.
- [ ] The remaining routes of 40 lines or more, thirteen at the time of
      measuring. Measure again when this step is reached, since the
      list will have moved, write the routes here, and do them largest
      first. A route under 40 lines is left alone unless
      it holds a rule worth a test: most of them check, call and
      return, which is what a route should do.

## Phase 3: The teaching router

`backend/app/features/teaching/router.py` had 38 routes, 2,485 lines
inside route bodies, and 27 routes of 40 lines or more: the highest
share of any router.

- [ ] `list_delegates` (189 lines, 17 branches) and
      `list_learning_modules` (115 lines, 16 branches). Both work out
      who may see what, which is what
      `backend/app/features/teaching/access.py` exists to hold. Move
      the rule there and not into a new module.
- [ ] `get_learning_content` (199 lines), `list_question_banks` (127)
      and `start_assessment` (127).
- [ ] The remaining long routes: measure again, write them here, and
      do them largest first.

## Phase 4: The org units and passport routers

- [ ] `backend/app/org_units/router.py`: `add_org_unit_member` (120
      lines), `get_org_unit` (85), `set_org_unit_feature` (77 lines, 10
      branches) and `grant_and_authorise` (65). 26 routes, 9 of them
      long.
- [ ] `backend/app/features/passport/router.py`: `request_sign_off`
      (120 lines) and `accept_assessor_invite` (113). This router is in
      better shape than its 4,017 lines suggest, with more plain helper
      functions than routes and only 7 long routes, so it comes last.
- [ ] Record the coverage of each of the four routers, from
      `just tc py`'s log, beside the figures taken in Phase 1.

## Phase 5: Find why frontend tests fail under load

Seen on 10 October 2026, running the frontend suite with coverage on a
busy machine. In five runs, two passed all 4,456 tests and three
failed, and never the same tests twice: `AssessmentResultPage` could
not find the "View results by question" link, `Settings` could not find
the "Clinician passport" heading, `CertificateForm` timed out, and
`UserInfoUpdatePage`, `NewPatientPage` and `ResetPasswordPage` failed in
another run. The slowest run took 510 seconds against a usual 260.

- [ ] Confirm the cause before fixing anything, and write what was
      found here. The likely one is a
      mismatch between two limits. `testTimeout` in
      `frontend/vitest.config.ts` was raised to 15 seconds, with a
      comment saying it stops a busy machine being reported as a bug.
      But `findBy` and `waitFor` from Testing Library give up after one
      second by default, and nothing in `frontend/src/test/setup.ts`
      changes that. So a test has fifteen seconds to run and one second
      to see each thing appear. The suite has about 655 `findBy` calls
      and 709 `waitFor` calls resting on that one second. Check it by
      running the failing files alone under load and seeing whether the
      failures are all of the "could not find it in time" kind.

- [ ] Find a way to reproduce it on demand, so that a fix can be shown
      to work. Running the suite twice at once did it by accident.
      Something repeatable, such as running the suite with coverage
      while a second copy runs, belongs in a `just` recipe or a note
      here.

- [ ] Sort the failures into two kinds, because they have different
      fixes. A test that waits correctly and simply ran out of time is
      fixed by the limit. A test that reads the page once with `getBy`
      before the page has finished loading is wrong at any speed and
      passes only by luck: those need the test changed to wait. There
      are about 3,500 `getBy` calls, most of them correct, so look only
      at the tests that have been seen to fail.

## Phase 6: Make the frontend tests steady

- [ ] Raise how long Testing Library waits, once Phase 5 has confirmed
      the cause: `configure({ asyncUtilTimeout: ... })` in
      `frontend/src/test/setup.ts`. A passing test is no slower for it,
      since a wait ends the moment the thing appears. Only a test that
      is going to fail takes longer to say so. Choose the figure from
      what Phase 5 measured, and keep it well under `testTimeout`, so a
      wait that runs out is reported as the thing it could not find and
      not as a bare timeout.

- [ ] Fix each test of the second kind from Phase 5, the ones that read
      the page before it was ready.

- [ ] Look at whether the suite starves itself. vitest reported 392
      workers spawned for 392 files, about two seconds of start-up
      each, and that `isolate: false` would save about 54 seconds. Less
      start-up work means less load and fewer timing failures, but
      sharing a worker lets one test's leftovers reach the next.
      Measure it, and turn it on only if the suite passes repeatedly
      with it.

- [ ] Show it worked: the reproduction from Phase 5, run five times,
      passing five times.

- [ ] Leave CI as it is unless Phase 5 shows it failing there too. CI
      splits the suite across three runners and has not shown these
      failures. A retry in CI is not the fix: it hides a test that is
      wrong, which is the thing this phase removes.

## Decisions

- **Routes first** - Mark's order, on 11 October 2026. It is the larger
  piece, and it is what raises the backend's coverage where it is
  lowest.

- **One route to a pull request** - each split rewrites an endpoint
  that is in use. Small pull requests keep each one readable in a
  sitting, and mean a mistake is one revert.

- **The route tests are not edited** - they are what proves the
  behaviour did not move. This is stricter than usual on purpose.

- **No step waits for a person** - the plan is written to be built from
  top to bottom unattended, and read afterwards as a row of pull
  requests. Where it first had "decide" and "stop for Mark to read",
  it now says what to do. Mark, on 11 October 2026: plans should run
  to the end, and each pull request is reviewed later.

- **As many pull requests as the work needs, in one run** - Mark, on
  11 October 2026. The plan is not cut into a run for each phase: a
  long row of pull requests, each a comfortable read, is what is
  wanted.

- **The teaching router is not held back for the EoEETA go-live** -
  Mark, on 11 October 2026. Phase 3 rewrites the routes learners use,
  and it goes ahead in its turn, with the route tests as its guard.

- **Forty lines is a guide, not a rule** - it was the line used to
  measure, and it separates routes that hold logic from routes that
  check, call and return. A short route holding one important rule is
  still worth splitting; a long one that only builds a response is not.

- **A test that fails on timing still fails the run** - Mark's
  decision, on 10 October 2026, about `just tc`. The answer to a test
  that fails under load is to fix the test or the wait, not to stop
  counting the failure.

- **No new features** - both halves are refactoring. Nothing here
  changes what a person using Quill sees.
