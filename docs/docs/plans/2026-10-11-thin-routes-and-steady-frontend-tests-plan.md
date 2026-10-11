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

- [x] Split `update_user` in `backend/app/main.py` in two. It is the
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
      - [x] **The competency lists** - what `additional` and `removed`
            come to after a change of profession and a promotion to
            `superadmin`, and the write through `sync_competency_rows`.
            Now `settle_competencies` in
            `backend/app/users/competencies.py`, which also sets the
            profession and the platform role, since neither can be
            separated from the lists. `create_user_with_cbac` was left
            as it is: a new account has no carry-over and no merge on
            promotion, so the two share only the scope check and the
            write, which are one function each already.
      - [x] **Where they belong** - membership of the org units the
            caller administers, and keeping passport cover in step.
            `settle_membership` in `backend/app/users/membership.py`,
            beside `org_units_the_caller_administers`,
            `org_units_the_caller_places_people_in` and `capacity_at`,
            which `create_user_with_cbac` calls too. Its one refusal,
            `PlaceNotFound`, repeats the org unit id the request sent.
            The create route keeps its own insert loop: a new account
            has nothing to clear and no capacity to carry.
      - [x] **Teaching enrolments** - `_settle_teaching_enrolments`,
            shared with `create_user_with_cbac`. Its input models are
            defined in `main.py`, so the plain function takes ordinary
            values: for each organisation, the modules wanted and when
            each ends. Now `settle_teaching_enrolments` in
            `backend/app/users/enrolments.py`, taking a mapping of
            organisation to module to end date, which the two routes
            build with `_enrolments_wanted` beside the models. Its last
            refusal, for somebody who belongs nowhere under the
            organisation, cannot be reached through a request, because
            an earlier check asks the same thing; the tests pin its
            words by making the writer raise it.
      - [x] **The practice rules of the org units router** - brought
            forward from Phase 4, on 11 October 2026, because the next
            part cannot be done without it. `_settle_practice` asks
            `practice_refusal` in `backend/app/org_units/router.py`
            whether each change is allowed, and that function lives in
            a router and answers with an `HTTPException`. A plain
            function cannot call it. So `practice_refusal` and the
            checks it rests on move out of the router first, to a plain
            module beside it, with the two practice routes still
            answering as they do.
            Now `practice_refusal` in
            `backend/app/org_units/practice.py`, which hands back an
            `OrgUnitError` from `backend/app/org_units/errors.py` and
            still never raises. The checks every org unit route shares
            (`require_visible`, `through_a_scope`, `require_member`,
            `require_in_scope`) moved once, to
            `backend/app/org_units/access.py`, and the routes' bodies
            were not otherwise touched. Found on the way: the withdraw
            route takes its competency id from the path and checks it
            against nothing, so a scoped manager refused there is
            handed back whatever they typed.
      - [x] **Practice** - `_settle_practice`, shared with
            `create_user_with_cbac`. It gathers every refusal and
            answers once, with the first one's status and all their
            reasons joined, so somebody is told everything wrong with
            the form in one go. That stays. Now `settle_practice` in
            `app/users/practice.py`, taking a mapping of org unit id to
            competency ids, which each route builds with
            `_practice_wanted` beside the request model. The gathered
            answer is `PracticeRefused` in `app/users/errors.py`, a
            refusal made of the org unit refusals it is handed. The
            other two refusals had no test of their words, so
            `tests/user_practice_refusals_test.py` pins them on both
            routes.
      - [x] **The whole save as one function**, calling the parts above
            in order, with the route left to find the person, check the
            caller may reach them, and return. Now `update_account` in
            `backend/app/users/update.py`, taking an `AccountChanges`:
            a frozen dataclass with one field for each thing the form
            can send, `None` when it was not sent, which the route
            builds from the request. Whether a save acts on the whole
            account is its own function, `acts_on_whole_account`, with
            `changes_profession` and `changes_platform_role` beside it.
            The route keeps the 404, "Cannot modify superadmin users"
            and `_require_shared_org_with_user`, which five other
            routes share and which run in that order before anything
            else. Found on the way: an address sent in other capitals
            counts as acting on the account, though `change_identity`
            then treats it as no change. Left as it is.

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

- [x] Compare an address as it would be stored, in
      `acts_on_whole_account` in `backend/app/users/update.py`. Every
      address is stored in lower case, by `normalise_email` on each
      write. But the question "does this save change the address?" was
      asked of the address as typed, trimmed and not lower-cased, so
      `Sam@nhs.net` against a stored `sam@nhs.net` counted as a change.
      The scope check then ran, and a scoped manager saving somebody
      outside their scope was refused for a change that was not one.
      It was so before the rule moved, and was moved as it was. Mark
      asked about it on 11 October 2026, and it is fixed in a pull
      request of its own: the one deliberate change of behaviour in
      Phases 1 and 2 so far. The test that pinned the old answer now
      pins the new one.

- [ ] Decide what to do about a hole found on the way, in
      `create_user_with_cbac`: **somebody holding `manage_users` who is
      not an operator can create an account with the `superadmin`
      platform role.** `update_user` refuses exactly that ("Cannot
      grant the superadmin platform role"), and creating has no such
      check, so the refusal is stepped round by making a new account in
      place of promoting an old one. The account made also misses the
      operator competencies that a promotion merges in. Found on
      11 October 2026 while moving the competency rules, and left as it
      is: this plan moves rules and does not change them, and closing
      it changes what a caller may do. The fix is small, the same
      refusal on create, and wants its own pull request.

- [ ] Prove nothing changed. The route tests in `backend/tests/` that
      drive `update_user` through the API must pass **unchanged**,
      before and after. They are the safety net for the whole plan. A
      route test that fails means the split moved the behaviour: put
      the split right, and leave the test as it is. Done for every
      part: the files in `backend/tests/` that drive `/api/users`,
      thirty-one of them when the last part landed, were run unedited
      with each one, `security_pentest_test.py` among them, beside
      `no_raw_exceptions_in_details_test.py`,
      `every_route_is_guarded_test.py` and
      `api_schema_coverage_test.py`.

- [ ] Write the tests the split makes possible: one for each branch of
      the plain function, called directly. This is the point of the
      work. Run `just tc py` before and after and record both figures
      for `main.py` here. Before, measured on 10 October 2026:
      `app/main.py` at 80%, 1,516 statements with 300 missed. The
      tests are written, one file beside each module in
      `backend/app/users/`. The after figure is to be taken with
      `just tc py` once the stack has merged.

## Phase 2: The rest of `main.py`

One route to a pull request, largest first, each with the same two
checks as Phase 1: the route tests pass unchanged, and the new function
has tests of its own. Measured on 9 October 2026, `main.py` had 64
routes, 2,636 lines inside route bodies, and 18 routes of 40 lines or
more.

- [x] `create_user_with_cbac`, 119 lines. Do it with `update_user`
      fresh in mind: the two share rules, and the split should leave
      one copy of each. Listed fourth by size and brought forward to
      first, on 11 October 2026, for that reason. Now `create_account`
      in `backend/app/users/create.py`, taking a `NewAccount`: a
      frozen dataclass the route builds from the request, and handing
      back the account. The route sends nothing, so it is left with
      building that, the call and the response. Two new refusals,
      `MissingRequiredFields` and `NoPlaceChosen`; the short password,
      the taken username and the taken address are the classes a save
      raises, and the three checks behind them are now one function
      each in `backend/app/users/identity.py`, called by both. The
      words of those five refusals were not pinned on this route, so
      `backend/tests/user_create_refusals_test.py` does it. The hole
      in Phase 1 is left open, and a test in `create_test.py` pins it
      as it is. Found on the way: a username given is kept exactly as
      sent, untrimmed, where a save trims it. Left as it is.
- [x] `register`, 270 lines and 24 branches. It decides several things
      in a row, and is the first thing a new person meets. Now
      `register_account` in `backend/app/users/register.py`, taking a
      `Registration` and handing back the account, flushed.
      `clinical_lead_site` moved there with it, unchanged, since the
      rule asks it and a module cannot import from `main.py`. The route
      keeps the rate limit, the refusal where clinical services are on,
      the verification email with its three refusals, and the commit:
      the email is still sent after every write and before the commit,
      so a refusal or a failed send leaves nobody behind. Eleven new
      refusals in `errors.py`; the short password is the class a save
      raises. A taken username and a taken address are one class,
      `UsernameOrEmailInUse`, so the two cannot come to answer
      differently, and the shared checks in `identity.py`, which say
      which was taken, are not used. None of the words were pinned, so
      `backend/tests/register_refusals_test.py` does it. Found on the
      way: four refusals no request can reach, because the organisation
      and the site now both come from the clinical lead's address (the
      two asking for an organisation, a site beneath another
      organisation, and a module not open to registration). Kept, and
      tested by calling the part that raises them.
- [x] `ci_teaching_sync`, 168 lines. Now `sync_every_bank` in
      `backend/app/features/teaching/ci_sync.py`, beside the sync it
      drives. It refuses nothing, so there is no error class: a bank
      that cannot be synced is listed with its reason and the next is
      tried, and the function hands back the answer the route sends.
      The route keeps the token check with its three refusals, and
      sets the 422 where any bank is listed. The route never committed:
      `sync_question_bank` commits as each bank finishes, and still
      does. The words of the three refusals were not pinned, so
      `backend/tests/ci_teaching_sync_refusals_test.py` does it. Found
      on the way, and left as they are: the reason for a bank whose
      sync raises is the exception's own text, sent to the pipeline;
      an assessment that fails its checks is recorded as a failed sync
      and still listed under `synced`, so the answer is 200; a draft
      whose version is not 1 is on neither list; and `sync_all_banks`
      in the teaching router is the same loop a second time, with a
      user, which Phase 3 can fold into this one. The two helpers that
      find a bank still live in that router and raise `HTTPException`,
      so they are imported from it until Phase 3 moves them.
- [x] `list_users`, 159 lines. Now five functions in
      `backend/app/users/listing.py`, since the route answers two
      questions. Asked about a patient: `people_around_a_patient`, then
      `picker_rows`. Asked about nobody: `people_within_reach` gives
      the ids the caller may see, or None for an operator,
      `people_to_list` reads those people less the members of the org
      unit excluded, and `admin_rows` says where each belongs. One new
      refusal, `PatientPickerNotAllowed`, for a scoped manager asking
      about a patient. The 500 for a list that cannot be read stays in
      the route, because its `detail` is a message and a code and not a
      sentence; the reach is still worked out before that `try`, as it
      was. Neither answer was pinned, so
      `backend/tests/user_listing_refusals_test.py` does it. No query
      runs once for each person: the two reads of where people belong
      take every id at once. Found on the way, and left as they are:
      neither list is put in an order; `exclude_org_unit` is not
      checked against the caller's reach, and leaves out the members of
      that org unit alone and not of those beneath it; `sites` names
      every org unit somebody belongs to, organisations among them; the
      patient picker does not ask whether the caller shares an org unit
      with the patient; and an empty `patient_id` is the admin list.
- [ ] The remaining routes of 40 lines or more. Measured again on
      11 October 2026, once the five above were done: `main.py` had 60
      routes and 15 of 40 lines or more, none over 76, where it began
      with one of 294. Two of the 15 are `register` and `update_user`
      themselves, now only building plain values from the request.
      Forty lines is a guide and not a rule, so the rest are sorted by
      whether they hold a rule worth a test of its own, which the count
      of branches says better than the count of lines.

      - [x] **The two callbacks CI makes when a video is done** -
            `ci_transcode_complete` (76 lines, 7 branches) and
            `ci_caption_complete` (44 lines, 4 branches). One pull
            request: they are the same job for two kinds of file. Now
            `record_transcode` and `record_captions` in
            `backend/app/features/teaching/ci_media.py`, with the one
            rule they share, finding the upload, written once. Teaching
            gets its error base here: `TeachingError` in
            `backend/app/features/teaching/errors.py`, with one
            refusal, `MediaAssetNotFound`, and one handler in
            `main.py`. Each route keeps its token check; the three
            refusals are still written out in all three CI routes,
            because the sync uses another token and other words for
            the 503. Neither route committed, and neither function
            does. None of the words were pinned, so
            `backend/tests/ci_media_callback_refusals_test.py` does it.
            Found on the way, and left as they are: a transcode report
            naming no files still stamps `transcoded_at`; and the
            caption job is fired after a flush and before the commit,
            so its start time is not yet visible to another session.
      - [x] **Patients** - `list_patients` (61 lines, 6 branches) and
            `update_patient` (36 lines, 7 branches, under forty lines
            and still the most branched route left). A new package,
            `backend/app/patients/`: `patients_shown` in `listing.py`
            is the list for one caller, made of
            `patients_within_reach`, `sees_deactivated`,
            `activation_by_patient` and `patient_rows`; and
            `changes_to_send` in `update.py` is what an update sends
            to FHIR. The calls to FHIR stay in the two routes, because
            existing tests fake them at `app.main`, and so do the
            update's two refusals, which each answer what FHIR said:
            there is no errors module and no new handler. Nothing
            pinned either route, so
            `backend/tests/patient_list_and_update_routes_test.py`
            does. Found on the way, and left as they are:
            `update_patient` asks nothing about the caller beyond
            being signed in, so no competency and no shared org unit
            is needed to change a patient; a FHIR outage there is
            answered 500 where the list answers 502; the
            request's NHS number, MRN and patient id are accepted and
            ignored; and one record FHIR returns that will not
            validate empties the whole list as `fhir_ready: false`.
      - [x] **Accepting an invite** - `accept_invite` (65 lines, 6
            branches). Now `accept_external_invite` in
            `backend/app/users/invites.py`, returning `InviteAccepted`
            (the account, and whether the invite made it), with
            `InviteTokenInvalid` (400), `InviteNeedsUsernameAndPassword`
            (422) and `InviteUsernameTaken` (409). This is the invite
            to a patient's record, not a way into an account: it signs
            nobody in and sets no password on an account that exists.
            Found, and kept as it was: nothing records that a token was
            used, so it works again until it runs out, and a second use
            gives back access that was revoked; an account with the
            address is given access whether or not it is active; a new
            account's password is asked no length, its username is not
            trimmed and its address is not marked verified; and the
            route has no rate limit.
      - [x] **Deactivating somebody, and sending an invite** -
            `deactivate_user` (42 lines, 4 branches) and
            `send_invite_email` (40 lines), with the shared
            `_require_shared_org_with_user`, which six routes call and
            which is the last helper of the people routes still in
            `main.py`. The helper is now `check_account_within_reach`
            in `app/users/reach.py`, beside
            `account_the_caller_may_act_on`, the one sequence that
            deactivating, reactivating and inviting share; the rules
            are `deactivate_account` and `reactivate_account` in
            `activation.py` and `setup_invite_for` in
            `setup_invite.py`, and the operator check is
            `check_may_act_on_operator` in `scope.py`. Found:
            deactivating only sets `is_active`, with no check for the
            last holder of `manage_users` at a place; an operator out
            of the caller's reach answers 403, not 404, because that
            check comes first; and `invites_test.py`'s altered-token
            case fails about one run in sixteen, when the token ends
            in `A`.
      - [ ] **A conversation's status** -
            `update_conversation_status_endpoint` (57 lines, 3
            branches). The messaging rules already live in
            `messaging.py`; this is what is left in the route.

      **Left as they are, on purpose:**

      - **`login`, `refresh`, `reset_password` and `change_password`** -
        61 lines at most. Most of each is cookies, tokens and the rate
        limiter, which are the request and belong in a route, and what
        is left decides who may sign in. Moving that for tidiness, in a
        long unattended run, is the wrong trade: a mistake there is not
        a failed test but somebody locked out, or let in. If they are
        wanted, they want a pull request each and a person watching.
      - **`get_user`, `me`, `list_teaching_modules_public` and
        `update_my_competencies`** - 40 to 73 lines with one or two
        branches each. They build a response and decide almost nothing.

- [ ] Decide what to do about the invite to a patient's record,
      `POST /accept-invite`, found on 11 October 2026 while moving it.
      It is the invite an external clinician or a patient's advocate
      is sent, part of EHR production. None is changed here; each is
      pinned by a test as it stands.

      - **A token can be used again, and using it again gives back
        access that was taken away.** Nothing records that a token was
        used, so it works for its seven days. After an administrator
        revokes somebody's access, replaying the token clears the
        revocation. This is the one that matters.
      - **A new account made through an invite is asked no minimum
        password length.** One character is accepted, where every other
        way of setting a password asks eight.
      - **The route has no rate limiter**, and is open to anybody.
      - **A deactivated account is still given access**, though it
        cannot sign in to use it.
      - **The address is not marked verified**, though the invite was
        sent to it, and the username is not trimmed.

- [ ] Decide what to do about `update_patient`, found on 11 October
      2026 while moving the patient routes. **It asks nothing about who
      is calling beyond that they are signed in.** No competency, and no
      shared org unit: any signed-in user can change any patient's
      name, date of birth and gender by naming the patient's id. Its
      own docstring says "any role can update patients". It is part of
      EHR production and nobody uses that yet, which is the only reason
      this is a step in a plan and not an incident; it must be closed
      before anybody does. Left unpinned by any test, on purpose, so
      that closing it does not read as a regression. Smaller, in the
      same routes: a FHIR outage on update answers 500 where every
      other route answers 502; an NHS number or MRN sent in the body is
      accepted and ignored; and one FHIR record that fails validation
      empties the whole list.

- [ ] Decide what to do about what listing people gives away, found on
      11 October 2026 while moving `list_users`. None is changed here.

      - **The picker of people around a patient never asks whether the
        caller shares an org unit with that patient.** Somebody holding
        `manage_users` at one trust who names a patient of another is
        given that trust's people. It belongs to messaging, so to EHR
        production, but it is a list of staff handed across an
        organisation boundary. This is the one that matters.
      - **`exclude_org_unit` is not checked against what the caller may
        see**, and leaves out the members of that org unit only, not of
        those beneath it.
      - **Neither list is in any order.** There is no `order_by`, so the
        order is whatever the database gives.
      - **`sites` names every org unit somebody belongs to,
        organisations included**, so a trust shows in both lists.
      - **An empty `patient_id` falls through to the full list.**

- [ ] Decide what to do about what the content sync answers, found on
      11 October 2026 while moving it. None is changed here.

      - **A failed assessment is reported as synced** - when
        `sync_question_bank` records a sync whose status is `failed`,
        the record is still there, so the bank is listed under `synced`
        and CI is answered 200. Only a failed module check, or an
        exception, gives a 422. So CI can go green on content that did
        not load. This is the one that matters.
      - **A draft whose version is not 1 is on neither list**, and so
        is also a 200.
      - **An exception's own words are sent back to CI**, for a bank
        whose sync raised. It is behind the sync token and is about
        content, never a patient, but it is text nobody wrote for a
        reader.
      - **Nothing is rolled back after a bank raises**, so a database
        error part way could leave the session unusable for the banks
        after it.
      - **`sync_all_banks` in the teaching router is the same loop a
        second time**, started by a person. Phase 3 should fold the two
        into one.

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
