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

- [x] Close a hole found on the way, in `create_user_with_cbac`:
      **somebody holding `manage_users` who is not an operator could
      create an account with the `superadmin` platform role.**
      `update_user` refuses exactly that ("Cannot grant the superadmin
      platform role"), and creating had no such check, so the refusal
      was stepped round by making a new account in place of promoting
      an old one. The account made also missed the operator
      competencies that a promotion merges in. Found on 11 October 2026
      while moving the competency rules, and left as it was then: this
      plan moves rules and does not change them, and closing it changes
      what a caller may do. Closed the same day, as a change of its own.
      - **Before**: `POST /api/users` from that caller answered 200 and
        made an operator who held only what their profession gave.
      - **Now**: it answers 403 "Cannot grant the superadmin platform
        role" (`SuperadminRoleNotAllowed`, the class and words a save
        gives) and writes nothing. An operator creating an operator is
        answered 200 as before, and the new account now holds the
        `superadmin_profession` competencies beside its own.
      - **One rule, asked twice**: `additional_for_platform_role` in
        `backend/app/users/competencies.py` refuses and merges, and
        both `settle_competencies` and `create_account` call it.
      - **Where it is asked on create**: last of the checks, after the
        ones on a limited scope and before the account is written. A
        save asks it after "You may not set a platform role." too, so a
        caller whose scope has a limit is still told that first, on
        both routes. Every other platform role and caller is answered
        as before.

- [x] Prove nothing changed. The route tests in `backend/tests/` that
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

- [x] Write the tests the split makes possible: one for each branch of
      the plain function, called directly. This is the point of the
      work. The figures for `main.py`, lines run by the unit tests:
      **80% before** (1,516 statements, 300 not run, on 10 October
      2026) and **88% after** (990 statements, 121 not run, on
      11 October 2026, with every pull request of Phases 1 to 4
      applied). A third of the file's statements have left it, and
      what left is tested where it now lives: the modules under
      `app/users/` and `app/patients/` are 781 statements with none
      not run.

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
- [x] The remaining routes of 40 lines or more. Measured again on
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
      - [x] **A conversation's status** -
            `update_conversation_status_endpoint` (57 lines, 3
            branches). The messaging rules already live in
            `messaging.py`; this is what is left in the route. The
            rule is now `set_conversation_status` there, raising the
            existing `ConversationNotFound` both for no conversation
            and for a caller not taking part; which statuses there
            are stays with the request model's pattern. Found: this
            route answers a refusal with a plain sentence where its
            siblings send a message and an error code, so it maps
            `exc.message` alone to keep that; and its response gives
            each participant's username as their display name and
            leaves `is_participant`, `can_write` and
            `include_patient_as_participant` at false, unlike the
            list routes. Both are kept as they were.

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

- [x] Record, for when there are real patients, the invite to a patient's record,
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

      **Not built here.** Mark, on 11 October 2026: these belong to EHR
      production, which holds no patients, and are to be fixed when it
      does. They are written into `docs/docs/plans/todo.md`, under
      "BEFORE ANY REAL PATIENT IS IN THE SYSTEM", with the other
      questions about who may read and write one patient's record, to
      be settled together as a plan of their own.

- [x] Let `update_patient` change only a patient its caller can reach.
      Found on 11 October 2026 while moving the patient routes: **it
      asked nothing about who was calling beyond that they were signed
      in.** No competency, and no shared org unit: any signed-in user
      could change any patient's name, date of birth and gender by
      naming the patient's id. Its own docstring said "any role can
      update patients". It is part of EHR production and nobody uses
      that yet, which is the only reason this was a step in a plan and
      not an incident. It was left unpinned by any test, on purpose, so
      that closing it would not read as a regression.

      - **Fixed here: the caller must share an org unit with the
        patient.** `PATCH /api/patients/{patient_id}` now calls
        `_require_shared_org_with_patient` in `main.py`, the check the
        routes that deactivate and reactivate a patient and revoke
        external access already make, before FHIR is asked anything.
        Before, anybody signed in was answered 200 and the change was
        made. Now somebody who shares no org unit with the patient is
        answered 404 `Patient not found`, the words a patient that does
        not exist is answered with, so the refusal does not confirm
        there is one; FHIR is neither read nor written. An operator is
        let through, as that check lets one through everywhere else.
        Pinned in `backend/tests/patient_update_route_scoping_test.py`.
      - **Chosen: the siblings' own check, called from the route.** It
        raises an `HTTPException` in `main.py` as it does for them, so
        there is no `app/patients/errors.py` and no new handler: the
        point was to answer exactly as they do. It asks for the shared
        org unit and not `check_user_patient_access`, so a patient may
        not change their own demographics through this route and nor
        may somebody with an external grant. Neither is what the form
        that calls it is for, and refusing is the cautious side.
      - **Still open: which competency editing demographics asks for.**
        None is asked. The catalogue has no single answer: the admin
        form that calls this route sits behind `manage_users`,
        `modify_patient_records` is defined and held by twelve clinical
        professions but asked for by no route, and
        `manage_patient_membership` is what inviting somebody to a
        record asks. Picking one decides who may edit a patient, which
        is a person's decision. Until then any member of an org unit
        the patient is cared for at may edit them, a receptionist and a
        trainee included.
      - **Found beside it, left: `upsert_demographics` and
        `write_letter` have the same hole.** `PUT
        /patients/{patient_id}/demographics` writes the same record and
        more, and `POST /patients/{patient_id}/letters` writes a
        letter, each asking only the `Clinician` role and no shared org
        unit. `get_patient`, `get_demographics`, the two letter reads
        and `get_patient_metadata` read one patient asking only that
        the caller is signed in. Left because this step is one route
        and one fix; they want a step of their own before anybody uses
        EHR production.
      - **Left: a FHIR outage on update answers 500** where every other
        route answers 502. A different fault, and changing a status is
        a change a client can see; it wants its own pull request.
      - **Left: an NHS number or MRN sent in the body is accepted and
        ignored.** Whether to refuse them or to write them is a
        decision about the form, not about access.
      - **Left: one FHIR record that fails validation empties the
        whole list.** That is the list route, not this one.

- [x] Record, for when there are real patients, what listing people gives away, found on
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

      **Not built here.** Mark, on 11 October 2026: these belong to EHR
      production, which holds no patients, and are to be fixed when it
      does. They are written into `docs/docs/plans/todo.md`, under
      "BEFORE ANY REAL PATIENT IS IN THE SYSTEM", with the other
      questions about who may read and write one patient's record, to
      be settled together as a plan of their own.

- [x] List a bank whose content did not load as failed, in what the
      content sync answers. Five things were found on 11 October 2026
      while moving it, and none was changed then. Two are fixed here
      and three are left.

      A sync record has three statuses. `in_progress` is what it is
      made with, and `sync_question_bank` never hands one back in that
      state. `failed` is written when the assessment does not pass its
      checks: nothing of the bank is loaded. `success` is written when
      its questions went in. `sync_every_bank` now counts a bank as
      synced only on `success`, and any other status as failed.

      - **A failed assessment was reported as synced: fixed.**
        *Before*, a record whose status was `failed` was still a
        record, so the bank was listed under `synced` and CI was
        answered 200. Only a failed module check, or an exception,
        gave a 422, so CI could go green on content that did not load.
        *Now* the bank is listed under `errors` with the first five
        things the checks said, and the answer is 422. The response
        has the same fields as before. The path beside each message is
        left out, as it already is for a module that fails its checks:
        for a bank read from the bucket it begins with the folder the
        server downloaded it into. The paths are still on the sync
        record.
      - **A draft whose version is not 1 was on neither list: fixed.**
        It is a rejection, not a skip: `sync_question_bank` logs
        "Rejecting sync for draft bank", adds "Draft module version
        must be 1, got N" to what the checks found, and makes no
        record. *Before*, no record meant neither list, and a 200.
        *Now* no record together with a fault from the checks means
        `errors`, with those words, and a 422.
      - **No record and no fault is still neither list, and right.**
        That is a live bank whose version has not moved on: there is
        nothing new to load, only its card details are refreshed, and
        it happens to every unchanged bank at every deploy.
      - **A choice made here** - `sync_question_bank` hands back no
        record in two cases, and the fault is the only thing that
        tells them apart from outside. So a live bank whose version
        has not moved on, and whose assessment no longer passes its
        checks, is now also listed as failed where it was a 200. That
        is content in the bucket that could not be loaded if it were
        asked for, and the same validator runs at the merge gate, so
        it was taken as the cautious reading and not narrowed away.
      - **An exception's own words are sent back to CI: left.** For a
        bank whose sync raised. It is behind the sync token and is
        about content, never a patient, but it is text nobody wrote
        for a reader. Changing it changes what an author sees when
        something breaks, which is its own decision.
      - **Nothing is rolled back after a bank raises: left.** A
        database error part way could leave the session unusable for
        the banks after it. Not part of what CI is answered.
      - **`sync_all_banks` in the teaching router is the same loop a
        second time: left**, for Phase 3 to fold the two into one.
        **It has the same defects and they are not fixed here.** It
        puts a failed record in its `synced` list and answers 200,
        and a draft turned away for its version is on neither of its
        lists. The failed record does carry its own `status` and
        `errors` in that answer, so a page that reads them can tell,
        but the list it is in says synced.

- [x] Save a registration before sending its email, in `register`.
      Found on 11 October 2026 while moving the route's rules out:
      the route sent the verification email and only then committed.
      The order was deliberate, so that an email which could not be
      sent abandoned the registration by raising before the commit.
      The gap was the other way round: if the send worked and the
      commit after it failed, somebody held a verification link to an
      account that did not exist. Mark chose the fix on
      11 October 2026: commit first, then send, and take the account
      away again if the send fails.

      - **Before** - a caller whose email went and whose commit then
        failed was answered with an error, and was sent a link that
        verified nothing.
      - **Now** - the account is committed, then the email is sent. A
        commit that fails raises before anything is sent, and the
        session dependency rolls back. A send that fails is answered
        exactly as before, with the same three statuses and words (429
        rate limited, 400 not an allowed recipient, 502 could not be
        sent), and still leaves no account: the username and the
        address are free to register again.
      - **How the account is taken away** - `undo_registration` in
        `backend/app/users/register.py` removes this person's rows
        from every table a registration writes, by name, then the
        account: `module_enrolment`, `practising_competency`,
        `org_unit_member`, `marketing_preference_change`,
        `user_competency`, `users`. The database would cascade most of
        them, but the unit tests' SQLite does not enforce foreign
        keys, so each is named. It refuses, with a `ValueError`, an
        account that is verified, has had its password changed, has
        two-factor sign-in, is not a plain teaching delegate, or
        whose profession rows were written more than five minutes
        ago. `users` has no date of its own, which is why the rows
        date it. Signing in is refused until an address is verified,
        so unverified also means never signed in.
      - **If the undo itself fails** - it is logged with the user id
        only, the caller is still answered for the failed send, and
        the account is left saved and unverified, which is what the
        resend route is for. This was the choice the task left open,
        and the same answer was kept so a caller cannot tell the two
        apart.

      Tests are beside the module in
      `backend/app/users/register_test.py` and through the route in
      `backend/tests/register_saves_before_it_sends_test.py`. No
      existing test was changed: the promise they pin is kept.

The steps above headed "Decide what to do about" were written as each
thing was found, and each waits for somebody. That is against how this
plan is meant to run, so each is now built, in its own pull request, as
a change of behaviour and labelled as one: the pull request says what a
caller was answered before and what they are answered now. Where there
was a choice, the more cautious one was taken and is written into the
step. Mark reviews each, and any can be dropped without touching the
moves beneath it.

## Phase 3: The teaching router

`backend/app/features/teaching/router.py` had 38 routes, 2,485 lines
inside route bodies, and 27 routes of 40 lines or more: the highest
share of any router.

Measured again on 11 October 2026, when this phase was reached: 38
routes, 27 of them 40 lines or more. Routes that do one job together go
in one pull request, in the order a learner meets them last, so the
administrator's lists go first and taking an assessment, which matters
most, goes when the shape is most settled. A refusal here is a
`TeachingError`, in `backend/app/features/teaching/errors.py`, which
the video callbacks already brought in.

- [x] **Who may see which delegates and modules** - `list_delegates`
      (189 lines, 17 branches), `list_delegate_modules` (42 lines, 6
      branches) and `list_learning_modules` (115 lines, 16 branches).
      Each works out who may see what, which is what
      `backend/app/features/teaching/access.py` exists to hold: the
      rule goes there and not into a new module.
      Done: the rules are `delegates_in_view`,
      `modules_served_where_they_belong` and `modules_open_to` in
      `access.py`. What is said of each row is `delegate_rows` and
      `learning_module_rows` in a new `listing.py` beside it, because
      rows read attempts, sites and the content store, which is not a
      question of who may see what. None of the three routes refuses
      anybody itself, so no `TeachingError` was added. `delegate_rows`
      still asks up to three queries for each person listed, as the
      route did.
- [x] **What a learner is shown of a module** - `get_learning_content`
      (199 lines, 11 branches), `list_question_banks` (127 lines, 12
      branches) and `get_question_bank` (67 lines). Which banks is
      `banks_on_show_to` and `bank_status_on_show` in `access.py`; what
      the list says of each is `question_bank_rows` in `listing.py`;
      and a new `module_content.py` holds `check_bank_id`,
      `question_bank_detail`, `learning_content` and
      `module_is_servable`, which no other route used. Five refusals:
      `InvalidBankId` (400), `QuestionBankNotFound`, `ModuleNotFound`,
      `NoLearningContent` and `TeachingContentNotConfigured` (all 404).
      `resolve_visible_module` and `_get_user_org_ids` stay in the
      router, since other routes use them and they raise
      `HTTPException`. None of the words were pinned, so
      `backend/tests/teaching_module_shown_refusals_test.py` does it.
      **The three routes do not ask "may this person see this module"
      the same way, and they were moved as they are.** The learning
      pages want the module live; the list and the detail show a closed
      bank to somebody enrolled on it, the detail with its whole
      `config_yaml`. The list and the detail want a version promoted;
      the learning pages do not ask. Somebody with nowhere to take
      modules gets an empty list, a 403 from the detail and a 404 from
      the pages. And where two organisations serve one bank, the list
      asks about its media at whichever row came first and the detail
      reads only the first row, neither in any set order.
- [x] **Starting an assessment** - `start_assessment` (127 lines, 7
      branches), with `get_current_item` and `get_item_by_order`.
      Done in a new `attempts.py`: `bank_to_sit` and `begin_attempt`
      for starting, `attempt_of`, `next_unanswered_item` and
      `item_at_position` for reading, over two rules added to
      `access.py`, `bank_status_open_for_attempts` and
      `attempt_belonging_to`. The draw is still `random.sample` and
      `random.shuffle` through the `random` module, which a test
      replaces. Two things stay in the router: the 409 for too small a
      pool, because its words carry two counts, and
      `_build_candidate_item` with `_require_place_for_attempt`, which
      the answering routes share. Found and pinned, not changed:
      nothing stops a second attempt while one is under way, or counts
      attempts; a bank missing its media can still be started; reading
      a question does not ask whether time has run out; and starting
      takes any organisation's synced copy where reading asks for the
      learner's organisation's own, so an attempt started on another
      organisation's copy answers 500 when read.
- [x] **Answering and finishing one** - `submit_answer` (98 lines, 7
      branches), `update_answer` (66 lines, 6 branches) and
      `complete_assessment` (97 lines). Now `record_answer`,
      `change_answer` and `finish_attempt` in `attempts.py`, with
      `TimeLimitExceeded`, `AllItemsAlreadyAnswered` and
      `AnswerNotFound` added to `errors.py`; the commit and the emails
      about a pass stay in the route. Found and pinned, not changed:
      finishing never asks about time, so an attempt long past its
      limit is still marked and can pass; it does not ask for every
      answer either; a bank with no pass criteria passes every attempt;
      what is chosen is not checked against the options; and an answer
      can be "changed" on a question never answered.
- [x] **What comes after** - `download_certificate` (113 lines, 12
      branches) and `get_assessment_question_results` (71 lines). Now
      `certificate_due`, `certificate_background`,
      `give_exam_reference`, `certificate_pdf` and `question_results`
      in a new `attempt_results.py`, with `question_number_of`,
      `chosen_option_label` and `scored_criteria` moved there from the
      router, and `AssessmentNotComplete`, `CertificateNotEarned`,
      `CertificatesNotEnabled` and `NoCertificateBackground` added to
      `errors.py`. Both routes find the attempt with `attempt_of`, so
      only the person who sat it is given either, whatever anybody
      else holds. The commit of a late exam reference, the file name
      and the response stay in the route; drawing the PDF is untouched
      in `certificate.py`. `get_assessment` and `assessment_history`
      are left as they were. Found and pinned, not changed: the blank
      certificate is looked for by bank id alone, not by the version
      sat; a background fetched from the bucket is left behind when
      drawing fails; and the marked answers are still given when the
      bank's synced copy has gone, where the certificate answers 500.
- [x] **Syncing by hand** - `sync_all_banks` (99 lines, 13 branches),
      with `validate_items` and `sync_items`. Moved as it is. It is
      the same loop as `sync_every_bank` in `ci_sync.py`, and it has
      the fault the CI sync had: a bank that did not load is listed as
      synced, and the admin page shows it as imported. Folding the two
      into one would close that, and would change what the manual sync
      answers, so it is not done in this phase: it is recorded above
      with the other things found, for Mark to rule on.
      Done in a new `manual_sync.py`: `bank_named_in`, `check_bank`,
      `sync_bank`, `discard_download` and `sync_banks_by_hand`, with
      `BankIdRequired` (400) and `SyncRecordedNothing` (500) added to
      `errors.py`. It shares nothing with `ci_sync.py`, not even the
      listing of bank ids, so neither loop can change what the other
      answers. The fault is pinned as it stands, in
      `manual_sync_test.py` and through the route in
      `backend/tests/teaching_syncing_by_hand_test.py`, which are the
      first tests to drive these three routes. `_resolve_bank_path_or_gcs`
      and `_build_image_inventory` stay in the router, raising
      `HTTPException`: both loops send an exception's own words back,
      and an `HTTPException`'s begin with its status ("400: Neither
      ..."), which `ci_sync_test.py` pins, so a `TeachingError` in
      their place would change both answers. The routes call them and
      `sync_banks_by_hand` is handed the two functions; `ci_sync.py`
      still imports them inside its function. Found and pinned, not
      changed: syncing one live bank whose version has not moved on
      answers 500 "Sync failed unexpectedly", where the sync of every
      bank leaves it off both lists with a 200; a draft turned away
      for its version is on neither list of the sync of every bank;
      and the two single-bank routes look for the bank before asking
      whether the caller belongs to an organisation.
- [x] **The administrator's view of the banks** - `list_admin_banks`
      (83 lines), `get_admin_bank_detail` (88 lines) and
      `list_bank_organisations` (54 lines). Which copies and which
      organisations is `newest_copies_held_by`, `newest_copy_held_by`
      and `organisations_with_teaching_on` in `access.py`; the rows
      are `admin_bank_rows` and `bank_organisation_rows` in
      `listing.py`; and a new `admin_banks.py` holds
      `admin_bank_detail`, with `BankNotHeldHere` (404) added to
      `errors.py`. `_get_user_org_id` stays in the router. None of the
      three was driven for what it refuses or whose rows it shows, so
      `backend/tests/teaching_admin_banks_view_test.py` does it.
      **The three do not draw the same line, and were moved as they
      are.** Synced copies, items and the served version are read for
      the caller's own organisation only. The list also names every
      bank in the bucket by its id, whichever organisation it was
      written for, and says nothing else of it. The list of
      organisations for a bank is every organisation with teaching
      on, with whether the bank is open and takes site registration
      at each, whether or not the caller belongs there; saving a
      change for one that is not theirs is refused by the settings
      route. The list counts the newest version's items and the detail
      counts every version's.
- [x] **Video and other media** - `grant_video_access` (100 lines),
      `create_media_upload_url` (88 lines), `link_module_media` (91
      lines), `upload_media_content_locally` (84 lines),
      `delete_media_asset` (47 lines) and `put_media_captions` (44
      lines). Two pull requests if one is too much to read.
      All six in one. The learner's rule is
      `check_video_may_be_granted` and `video_prefix_to_grant` in
      `module_content.py`; the route keeps the key, the signing and
      the cookie. The administrator's are in a new `media_uploads.py`:
      `new_upload_target`, `link_upload`, `upload_held_by` (which
      `get_media_captions` now uses too), `delete_upload`,
      `save_captions`, `local_upload_root` and `local_upload_file`,
      with seven refusals added to `errors.py`. Driven through the
      routes by `backend/tests/teaching_video_and_media_test.py`.
      **Left in the routes:** the three refusals of a file type, whose
      words carry the allow-list, and one of them the suffix of the
      file name the caller sent; signing the upload address; and
      streaming the bytes to disk.
      **A grant is one module at one organisation**, and is refused
      by the same door as the learning pages. **An administrator
      names no organisation**, so another's uploads are not found.
      **Found and not changed**, each pinned by a test saying so:
      linking a reference again keeps the old upload's captions marked
      as checked; linking records whatever asset id and size it is
      sent, and an id that cannot be a path then cannot be deleted
      where there is a bucket; the transcode job and the captions are
      given the organisation's own id where the video is filed under
      its storage prefix; deleting removes the uploaded file and
      leaves its renditions and captions; and the route that takes
      bytes on a developer's machine asks for no organisation and does
      not check the shape of the module id.

**Found in the teaching router, and not changed.** This phase moves
rules and fixes nothing: Mark stopped the run on 11 October 2026 to say
that fixing what was found had gone further than he asked. Each of these
is pinned by a test as it stands, with the test saying so, and is here
for him to rule on before the go-live. Most serious first.

- **A learner can hold two attempts in progress on one bank.**
  `start_assessment` never looks for an unfinished attempt and never
  counts attempts. A second start writes a second attempt, and both
  stay open and answerable. There is no limit on attempts and no check
  of time at the start.
- **An attempt long past its time limit can still be finished, marked
  and passed.** Answering is refused after the deadline, but
  `complete_assessment` never asks about time. It marks whatever was
  answered in time, and a pass gets its exam reference and its email.
- **Finishing does not ask that every question was answered**, and **a
  bank with no pass criteria passes every attempt**, one with no
  answers included.
- **An attempt on a bank that gives no time limit can never be
  answered.** The limit is stored as 0, which is read as no time and
  not as no limit.
- **What a learner chooses is not checked against the question's
  options.** Any text is stored and marked wrong.
- **The route for changing an answer does not need one to have been
  given**, so a question can be answered ahead of its turn.
- **An attempt can be started on a bank whose media is incomplete.**
  Reading that bank is refused, with a comment saying "assessment
  included". Starting it never asks.
- **Starting and reading look for different copies of the bank.** Start
  takes any organisation's copy of the bank at that version; reading
  asks for the copy held by the learner's own organisation. Where the
  learner's organisation only points at another's content, the attempt
  starts, the first question is sent, and every later read answers 500
  "Config not found for assessment".
- **Reading a question does not ask about time.** A question of an
  attempt long past its limit is still handed out. Only answering
  checks the deadline.
- **The manual sync lists a bank that did not load as synced**, and
  the admin page shows it as imported. The CI's sync had the same
  fault and no longer does. Folding the two loops into one would close
  it here too.
- **An administrator is shown things beyond their own organisation in
  two places.** The list of organisations for a bank shows every
  organisation with teaching switched on, and whether the bank is live
  there, whether or not the caller belongs to it. The list of banks
  names every bank id in the bucket. Saving settings for an
  organisation that is not theirs is refused, so this is reading only.
- **Syncing one live bank whose version has not moved answers 500
  "Sync failed unexpectedly"**, though nothing is wrong: there is
  nothing new to load.
- **Linking a new video over an old one keeps the old one's "captions
  checked" mark.** Everything else from the old upload's jobs is
  cleared. So the new video counts as having had its captions read by
  a person, and can reach learners as soon as it has been transcoded.
- **Linking a video records whatever asset id the request sends.** It
  cannot reach outside its folder, but an id of the wrong shape makes
  the row impossible to delete where there is a bucket: every delete
  answers 500.
- **No media route checks that the module exists**, and nothing limits
  the size recorded for an upload.
- **Deleting a video removes the uploaded file only.** Its renditions,
  poster and captions are left in the processed bucket.
- **A video grant already issued lasts until it expires**, half an hour
  by default, even if the enrolment ends meanwhile.
- **Some calls are given the organisation's id where its storage prefix
  is meant.** The same number unless a prefix has been recorded for
  the org unit, when the job would look in the wrong place.
- **Downloading a certificate can write.** For an older attempt with
  no exam reference, the download gives it one and saves it, and keeps
  it even if drawing the certificate then fails.
- **The blank certificate is found by the bank's id alone**, so it is
  whatever is in the content store today and not what was there for
  the version sat.
- **Nobody but the person who sat an attempt can read its certificate
  or its question results**, a teaching manager at the same
  organisation included. That may be meant; it is recorded because the
  competency is called `view_teaching_results`.
- **Somebody enrolled on a bank closed to new attempts is still shown
  it**, with its whole assessment configuration though never the
  correct answers. Comments in the code say this is meant.
- **The three routes that show a module ask "may they see it" in three
  different ways**: whether it must be live, whether a version must
  have been chosen, and what somebody with nowhere to take modules is
  answered.

## Phase 4: The org units and passport routers

- [x] `backend/app/org_units/router.py`: `add_org_unit_member` (120
      lines), `get_org_unit` (85), `set_org_unit_feature` (77 lines, 10
      branches) and `grant_and_authorise` (65). 26 routes, 9 of them
      long.
      Measured again on 11 October 2026, counting the lines inside
      each route body after its docstring: `add_org_unit_member` 120
      (9 `if`s), `get_org_unit` 83 (4), `set_org_unit_feature` 77
      (10), `grant_and_authorise` 65 (8), and four more of 40 lines or
      over with several branches, which joined the list:
      `update_org_unit` 50 (8), `set_org_unit_clinical_lead` 43 (4),
      `create_org_unit` 42 (4) and `create_org_unit_link` 41 (3). The
      ninth long route, `get_member_practice` at 49 lines, has no `if`
      in it and is all response, so it stays.
      Each rule is now a plain function beside the router:
      `add_member` and `name_clinical_lead` in `members.py`,
      `switch_feature` in `features.py`, `grant_then_authorise` and
      `grant_refusal` in `practice.py`, `org_unit_detail` in
      `detail.py`, `add_org_unit` and `change_org_unit` in
      `structure.py`, `add_link` in `links.py`, and `require_editable`
      in `access.py`. Every refusal is an `OrgUnitError` in
      `errors.py`, and the router fell from 2,061 lines to 1,434 with
      no route over 49. The router's own account check went: it said
      what `check_account_in_scope` in `app/users/scope.py` says, in
      the same words and status, so both member routes call that.
      Three files in `backend/tests/`, named
      `org_unit_*_refusals_test.py`, pin the status and words of each
      refusal through the routes; almost none had a test of its words.
      Found on the way: adding a member writes the membership before
      it checks a scoped manager's limits, so a refusal there rests on
      the request being rolled back, which the tests now pin; and the
      feature key in the path is checked against nothing, so any text
      is stored as a feature.
- [x] `backend/app/features/passport/router.py`: `request_sign_off`
      (120 lines) and `accept_assessor_invite` (113). This router is in
      better shape than its 4,017 lines suggest, with more plain helper
      functions than routes and only 7 long routes, so it comes last.
      Measured again on 11 October 2026, counting the lines inside
      each route body after its docstring: 44 routes, 9 of them of 40
      lines or over. `request_sign_off` 120 (4 `if`, `for` or `try`),
      `accept_assessor_invite` 113 (8), `upload_evidence` 83 (5),
      `sign_off` 69 (4), `revoke_assessor_membership` 52 (2),
      `amend_logbook_entry` 50 (3), `answer_logbook_confirmation` 43
      (3), `decline_sign_off` 42 (4) and `search_assessors` 40 (1).
      Only the two named were done. `upload_evidence` and `sign_off`
      are over 60 lines with several branches and were left, each for
      a reason: the first is reading an upload in pieces, which is the
      route's own work, and the second answers `Already <status>` with
      a value read from the database and repeats the text of a caught
      `SignOffError`, neither of which a refusal class may carry.
      The rules are now in two plain modules beside the router.
      `assessor_invites.py` has `holder_org_unit`, `join_as_external`,
      `let_existing_account_assess`, `invite_for` (the invitation row
      and its token), `invite_named_by` and `accept_invite`.
      `sign_off_requests.py` has `asks_today`, `who_is_asked` and
      `record_ask`. `accept_assessor_invite` is 15 lines with no
      branch, and the router fell from 4,054 lines to 3,657.
      `request_sign_off` is 87 lines with one `try`: what is left is
      comment, the email, and three things that stay on purpose. They
      are `_offered_refs` and `_checked_request`, which repeat a caught
      exception's text and log through the router's logger that the
      tests listen to, and the 500 given when the record refuses a
      request whose email has gone. Sending, and the link built from
      settings, stay in `_email_sign_off_request`, since the tests
      replace `send_email` and `INVITES_PER_DAY` on the router: the
      route hands the limit to the rule.
      The passport's own modules raise exceptions with no status,
      which the router answers one route at a time. That did not fit
      thirteen refusals with four statuses between them, so they are
      `PassportError` classes in a new `errors.py`, with one handler in
      `main.py`. One carries a value, the daily limit, a number fixed
      in the code. The logbook's ask for a supervisor and the invite
      preview call the moved functions and answer as they did.
      Two files in `backend/tests/`, named `passport_*_refusals_test.py`,
      pin the status and words of each refusal through the routes;
      none had a test of its words.
      Found on the way, and pinned by tests that say so, not fixed:
      withdrawing a request leaves its invitation usable for the rest
      of its fortnight, and nothing withdraws an invitation; nobody
      asked is checked for the right to assess, since an account that
      is asked is given `assess_clinician_passport` and a membership by
      the ask itself, an inactive account included; an account that
      comes by its address after the invitation went is linked on
      accepting and given the membership without the competency; the
      address on the invitation row and its `token_hash` are written
      and never compared with the token; an address asked twice holds
      two invitations, and the second is accepted as the account the
      first made, with no sign-in; and a username of only spaces is
      stored as an empty one.
**Found in the org units and passport routers, and not changed.** As
in Phase 3: each is pinned by a test as it stands, and is here for Mark
to rule on.

- **Asking somebody to sign off a competency gives them the right to
  assess.** An existing account that is asked is given the
  `assess_clinician_passport` competency and a membership at the
  holder's org unit, by the ask, before any email is sent. A holder may
  ask any address but their own, up to a daily limit. So the check made
  when somebody signs is met by what the holder caused. An inactive
  account is given it all the same.
- **An invitation to assess cannot be withdrawn.** Withdrawing the
  request leaves the invitation as it was, and for the rest of its
  fourteen days the link still makes an account that may assess.
- **An address asked twice holds two invitations.** The first makes the
  account; the second is then accepted as that account with no sign-in.
- **The address an invitation was sent to is never compared with the
  token**, though the model's own docstring says it is.
- **Adding a member to an org unit writes the row, then checks a
  scoped manager's limits.** A refusal there relies on the request
  rolling back.
- **A feature's key is checked against nothing**: any text can be
  switched on as a feature of an org unit.

- [x] Record the coverage of each of the four routers, beside the
      figures taken in Phase 1. Measured on 11 October 2026 by running
      the whole backend suite with coverage, with every pull request
      of Phases 1 to 4 applied:

      - **`main.py`** - 88%, from 80%. 990 statements, from 1,516.
      - **Teaching router** - 95%, from 77%. 539 statements, from
        1,164. The ten teaching modules the rules moved into are 1,062
        statements with two not run.
      - **Org units router** - 99%. 256 statements, three not run. No
        figure was taken before.
      - **Passport router** - 88%. 856 statements, 103 not run. No
        figure was taken before; two routes moved, and it had the
        fewest long routes to begin with.
      - **The backend as a whole** - 94%, from 91%. 803 statements not
        run, from 1,250, though the code has grown by about 1,300
        statements of new modules.

## Phase 5: Find why frontend tests fail under load

Seen on 10 October 2026, running the frontend suite with coverage on a
busy machine. In five runs, two passed all 4,456 tests and three
failed, and never the same tests twice: `AssessmentResultPage` could
not find the "View results by question" link, `Settings` could not find
the "Clinician passport" heading, `CertificateForm` timed out, and
`UserInfoUpdatePage`, `NewPatientPage` and `ResetPasswordPage` failed in
another run. The slowest run took 510 seconds against a usual 260.

- [x] Confirm the cause before fixing anything, and write what was
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

      **Found, on 11 October 2026: the mismatch is real, and it is one
      of three causes, not the only one.** All six files named above
      failed again under load, and the failures were of these kinds:

      - **A correct wait that ran out of its one second.** Proven. The
        test used `findBy` or `waitFor`, the thing arrived late, and the
        error was `Unable to find role=...`. Nineteen of these in the
        two runs of the third attempt below, among them the two seen on
        10 October: the "Clinician passport" heading in `Settings` and
        the "View results by question" link on `AssessmentResultPage`.
      - **A whole test that ran out of its fifteen seconds.** The larger
        share once the machine is badly loaded: about 190 of the 369
        failures. These are the tests that fill a form in through
        `userEvent`, a key at a time. `CertificateForm` on 10 October
        was one. No wait inside them is wrong, and the one second has
        nothing to do with them.
      - **A knock-on from a timeout earlier in the same file.** About
        155 of the 369. Once one test in a file times out, later tests
        in that file can find nothing at all: the page they print is an
        empty `<body><div /></body>`. `navCoverage.test.tsx` lost over
        seventy tests this way after one timeout, and
        `SignOffRequestForm` and `ExamCloseButton` lost theirs the same
        way. The likely reason is that the test that timed out is
        still running inside React's `act`, so the next test's render
        waits behind it. That reason was read from the output and not
        proven.

      Two things failed that are not tests failing at all. Under load
      vitest could not start some workers (`Failed to start forks
      worker`, `Timeout waiting for worker to respond`), so up to
      fifteen files in a run were never run, and the run still printed
      a count as if they did not exist. And
      `featureChunks.test.ts` timed out importing a whole feature chunk
      inside the fifteen seconds, which was the only failure in two
      otherwise clean runs.

      What the load is made of matters. The test container starts
      sixteen workers, one for each core Docker has, and Docker has
      7.65 GB of memory. One suite uses about half of that. Two at once
      came close to all of it, and during the third attempt two other
      worktrees were running their own tests as well. So a "busy
      machine" here mostly means a second worktree testing at the same
      time.

- [x] Find a way to reproduce it on demand, so that a fix can be shown
      to work. Running the suite twice at once did it by accident.
      Something repeatable, such as running the suite with coverage
      while a second copy runs, belongs in a `just` recipe or a note
      here.

      **A note, not a recipe: it reproduces, but not to order.** What
      was run, each from the repository root:

      - Quiet, the six named files alone: `just uf` followed by
        `src/features/teaching/pages/pages.test.tsx`,
        `src/pages/Settings.test.tsx`,
        `src/components/passport/CertificateForm.test.tsx`,
        `src/pages/UserInfoUpdatePage.test.tsx`,
        `src/pages/NewPatientPage.test.tsx` and
        `src/pages/ResetPasswordPage.test.tsx`. 136 tests passed in 54
        seconds.
      - First attempt: `just uf`, and beside it the six files three
        times over. The six files passed all three times, in 158, 102
        and 48 seconds. The whole suite took 266 seconds with one
        failure, the `featureChunks` timeout. Not a reproduction.
      - Second attempt: `just tc ts`, and `just uf` fifteen seconds
        later. The coverage run stopped after 5 minutes 39 seconds with
        no figure and a long row of failures its dot reporter does not
        name. The other took 523 seconds, failed `featureChunks`
        again, and never ran fifteen files because their workers did
        not start.
      - Third attempt, the one that worked: `just uf --coverage
        --coverage.reporter=text-summary --coverage.reportOnFailure
        --coverage.reportsDirectory=/tmp/coverage`, which is the
        coverage run with a reporter that names what failed, and `just
        uf` fifteen seconds later. They took 1,214 and 1,161 seconds
        and failed 206 of 4,465 tests and 163 of 4,492.

      The third attempt was as bad as it was partly because two other
      worktrees were testing at the time, which nobody arranged. So
      the honest recipe is "run the coverage suite and the plain suite
      together, and expect anything from one failure to two hundred".
      A `just` recipe would promise more than that, so there is none.

- [x] Sort the failures into two kinds, because they have different
      fixes. A test that waits correctly and simply ran out of time is
      fixed by the limit. A test that reads the page once with `getBy`
      before the page has finished loading is wrong at any speed and
      passes only by luck: those need the test changed to wait. There
      are about 3,500 `getBy` calls, most of them correct, so look only
      at the tests that have been seen to fail.

      **Found: every one is of the first kind, or is not a waiting
      failure at all. None of the second kind turned up.** Each bare
      `getBy` that failed did so on an empty page after a timeout
      earlier in its file, which is the knock-on above and not a test
      reading too early.

      Waited correctly and ran out of the one second:

      - `src/pages/Settings.test.tsx` lines 297, 307 and 400, each a
        `findByRole` for the "Clinician passport" heading.
      - `src/features/teaching/pages/pages.test.tsx` lines 304, 351 and
        369, each a `findByRole` for the "View results by question"
        link, and line 361, for the certificate button.
      - `src/pages/UserInfoUpdatePage.test.tsx` line 411, a `waitFor`
        on the "Review" heading.
      - Outside the six: `PassportPage.test.tsx` lines 230 and 254,
        `PassportCpdEntryPage.test.tsx` line 84,
        `PassportCpdPage.test.tsx` line 93,
        `AdminFeedbackPage.test.tsx` line 95,
        `AddStaffToOrgPage.test.tsx` line 280,
        `OrganisationAdminPage.test.tsx` line 167,
        `AddStaffToSitePage.test.tsx` line 88 and
        `CreateSitePage.test.tsx` line 95.

      Ran out of the whole fifteen seconds, with nothing wrong in how
      they wait:

      - `src/components/passport/CertificateForm.test.tsx`, the tests
        at lines 79, 100 and 120, all of which fill the form in first.
      - `src/pages/NewPatientPage.test.tsx`, seven tests from line 136
        to line 432.
      - `src/pages/ResetPasswordPage.test.tsx`, the test at line 73.
      - `src/pages/UserInfoUpdatePage.test.tsx`, 25 of its 38 tests.
        Four of them already carry a limit of thirty seconds of their
        own and ran out of that.
      - `src/pages/Settings.test.tsx`, the tests at lines 208, 301 and
        450.

## Phase 6: Make the frontend tests steady

- [x] Raise how long Testing Library waits, once Phase 5 has confirmed
      the cause: `configure({ asyncUtilTimeout: ... })` in
      `frontend/src/test/setup.ts`. A passing test is no slower for it,
      since a wait ends the moment the thing appears. Only a test that
      is going to fail takes longer to say so. Choose the figure from
      what Phase 5 measured, and keep it well under `testTimeout`, so a
      wait that runs out is reported as the thing it could not find and
      not as a bare timeout.

      **Done: five seconds.** The loaded runs took between two and
      five times as long as a quiet one, and the waits that
      ran out are on pages that appear in well under half a second
      alone, so five times the old limit covers what was measured.
      It is a third of `testTimeout`, which leaves a wait room to run
      out and say what it could not find before the test itself is
      stopped.

- [x] Fix each test of the second kind from Phase 5, the ones that read
      the page before it was ready.

      **Nothing to fix.** Phase 5 found none among the tests seen to
      fail, so no test file was changed.

- [x] Look at whether the suite starves itself. vitest reported 392
      workers spawned for 392 files, about two seconds of start-up
      each, and that `isolate: false` would save about 54 seconds. Less
      start-up work means less load and fewer timing failures, but
      sharing a worker lets one test's leftovers reach the next.
      Measure it, and turn it on only if the suite passes repeatedly
      with it.

      **Not measured, and not turned on.** No run was made with
      `isolate: false`. What there is comes from vitest's own estimate
      at the foot of each run: 42 to 51 seconds saved on a quiet run of
      about 220 to 266 seconds, and 137 to 234 seconds on the loaded
      runs, where each of 391 workers took about five and a half
      seconds to start. Phase 5 adds a reason to look: the suite does
      starve itself, but of memory as much as of start-up time, with
      sixteen workers in a 7.65 GB machine. Running fewer workers at
      once is the other way to the same end and carries no risk of
      one test reaching the next. Either is its own decision, so this
      stays open.

      **Closed without being done, by Mark's decision on 12 October
      2026.** The failures under load are accepted as they are. They
      show only on his own machine, when two worktrees run their suites
      at once inside Docker's 7.65 GB, and he has seen little trouble
      from it. CI splits the suite over three runners and has not shown
      them. If it becomes a real nuisance, the place to start is fewer
      vitest workers in the local test container only, so that CI keeps
      its speed.

- [x] Show it worked: the reproduction from Phase 5, run five times,
      passing five times.

      **Not shown, and it will not pass five times as things stand.**
      The third attempt was run once more with the five seconds in
      place. Each run takes ten to twenty minutes and slows every
      other worktree while it lasts, so it was not run five times.

      - The coverage run took 557 seconds and failed 41 of 4,531
        tests. One was a wait that ran out, down from nine and ten in
        the two runs before the change. The rest were tests running
        out of their fifteen seconds and what follows from that. The
        machine was also less loaded this time, so the fall from 206
        to 41 is not all the change's doing.
      - The plain run beside it was ended from outside after 4 minutes
        12 seconds (exit code 129) and gave no result.
      - Alone, `just uf` passed: 398 files, 4,538 tests, 222 seconds.

      So the change removes the kind of failure seen on 10 October,
      which was mostly `Unable to find`, and leaves the two kinds a
      longer wait cannot reach. What is left to do, none of it done
      here:

      - Tests that fill in a long form run out of fifteen seconds
        under heavy load. Fewer workers, or more memory for Docker,
        goes at the cause; a longer `testTimeout` only moves the line.
      - One timeout takes the rest of its file with it, which is what
        turns ten slow tests into two hundred failures.
      - `featureChunks.test.ts` imports a whole feature inside the
        ordinary limit, and was the first thing to fail every time.
      - A worker that does not start drops its file from the run
        without failing a test, though the run does still end red.

      **Closed without being done, by Mark's decision on 12 October
      2026.** The failures under load are accepted as they are. They
      show only on his own machine, when two worktrees run their suites
      at once inside Docker's 7.65 GB, and he has seen little trouble
      from it. CI splits the suite over three runners and has not shown
      them. If it becomes a real nuisance, the place to start is fewer
      vitest workers in the local test container only, so that CI keeps
      its speed.

- [x] Leave CI as it is unless Phase 5 shows it failing there too. CI
      splits the suite across three runners and has not shown these
      failures. A retry in CI is not the fix: it hides a test that is
      wrong, which is the thing this phase removes.

      **Left alone.** Phase 5 looked only at this machine. Nothing
      under `.github/workflows` was changed and no retry was added
      anywhere.

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
