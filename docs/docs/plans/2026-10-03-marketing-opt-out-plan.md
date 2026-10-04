# Marketing opt-out plan

Somebody who registers for Quill gives an email address, and nothing asks
whether they want news sent to it. The register pages have no marketing
question, the `users` table holds no preference, and nothing tells Resend,
where the mailing list lives, that the person exists. So today nobody who
registers can be emailed news at all, and nobody has been offered a way to
refuse it.

The outcome is one choice, offered on the registration form and
changeable later in Settings. It is an opt-out: a new registrant gets
news unless they say no. The choice is recorded in Quill's database with
when and how it was made, and kept in step with Resend in both directions,
so an unsubscribe link in an email and the switch in Settings always agree.

## Phase 1: Resend (Mark, in the Resend dashboard)

Shared with [Public site email subscriptions](2026-03-21-subscriptions.md),
whose Phase 1 asks for the same things. Whichever plan is built first does
them; the other ticks them off.

- [x] **Create the "Quill Medical" segment and the "Newsletter" topic,**
      and note both ids. One list for everybody, registrants and public
      site signups alike: there is one newsletter. Resend groups contacts
      into segments, and a contact opts in or out of a topic; the topic is
      what an unsubscribe link switches off. Done on 3 October 2026, the
      topic public with a default of opt-out, so a contact that arrives
      some other way gets nothing until something opts it in.

- [x] **Make two API keys that can manage contacts,** with Full access:
      a "Sending access" key cannot. One for the dev stack, kept in
      `backend/.env`, and one for production, so either can be revoked
      without the other. The sending key the backend already holds stays
      as it is. Both made on 3 October 2026.

- [x] **Create the two secret containers, in `infra/main.tf`:**
      `resend-contacts-api-key` and `resend-webhook-secret`, added to the
      `secrets` module's list beside `resend-api-key`. Terraform makes
      the containers and nothing else; the values never enter its state.
      This step first said the secrets had to exist before any Terraform
      change, which had it backwards: this repository creates the
      containers in Terraform and fills them by hand. What does have to
      wait is mounting them, the step after next, because Cloud Run
      refuses a revision that mounts a secret with no version.

- [x] **Put the production key in, by hand, once the change above has
      applied:**
      `printf '%s' '<key>' | gcloud secrets versions add resend-contacts-api-key --data-file=- --project=quill-medical-app`.
      `printf`, not `echo`: a trailing newline in `resend-api-key` is
      what stopped every email in September. Done on 3 October 2026, at
      the third attempt: the first two versions hold the command's own
      placeholder text, run as written, and are disabled. Check a stored
      secret before anything is told to read it: its length, its prefix,
      whether it holds whitespace, and one harmless call with it. None of
      that needs the value printed. `pbpaste | tr -d '\n' | gcloud ...`
      takes it from the clipboard and keeps it out of the shell history.

- [x] **Mount the settings on the backend and the admin job, in
      `infra/`.** `RESEND_CONTACTS_API_KEY` joins `backend_secret_env_vars`
      and `admin_secret_env_vars` in `infra/runtime-identities.tf`, which
      also grants each service account access. The admin job needs it
      because `marketing-sync` runs there. `RESEND_NEWSLETTER_SEGMENT_ID`
      and `RESEND_NEWSLETTER_TOPIC_ID` are not secrets and go in as plain
      values, shared with the dev stack: there is one list. Done only
      after the key had a version. **Merging it did not make it live.**
      Terraform made a new revision carrying the settings and left traffic
      on the one before, which had none. Re-running `deploy.yml` is what
      moves traffic, as it is for a changed secret. Check which revision
      is serving, not only that the apply passed.

- [x] **Add a webhook for contact changes,** once Phase 4 has deployed,
      since the address does not exist until then:
      `https://app.quill-medical.com/api/marketing/resend-webhook`,
      subscribed to `contact.updated` and `contact.deleted` and nothing
      else. Its signing secret went into `resend-webhook-secret` as above,
      and is mounted as `RESEND_WEBHOOK_SECRET` on the backend alone: the
      admin job receives no webhooks. Until it was mounted the route
      answered 503, and a single test request to it raised the "a user
      has been failed" alert, because Cloud Run logs any 5xx as an error.
      With the secret in place an unsigned request gets a 401, which does
      not.

## Phase 2: The record in Quill

- [x] **Add `marketing_emails` to `User`, in `backend/app/models.py`:** a
      boolean, not null, `server_default` false. It is the current answer,
      read by anything that needs to know. The default is false, not true,
      on purpose. The opt-out is something a person is offered at
      registration; an account made any other way (an admin creating
      somebody at `/admin/users/new`, a seeded account) was never offered
      it, and must not be sent news on the strength of a column default.
      Registration sets it true explicitly.

- [x] **Add a `marketing_preference_change` table:** `id`, `user_id`
      (foreign key, cascade on delete), `wants_marketing` (boolean),
      `source` (one of `registration`, `settings`, `resend`), `wording_version`
      (short string, nullable: set when a person answered a question on a
      page, null when Resend told us), and `created_at`. One row per change,
      never updated. This is the evidence: "what were they shown, what did
      they choose, and when" is answered by rows, and the column on `User`
      is only the latest of them. It is a table and not a JSON column on
      the user because each entry needs its own date and source.
      Validate `source` in code against a tuple in `models.py`, as
      `PLATFORM_ROLES` is, so a new source needs no migration.

- [x] **Add `marketing_synced_at` to `User`:** a nullable timestamp, set
      when Resend last accepted this person's current choice. Null means
      Resend has not been told, which is what Phase 3's retry looks for.

- [x] **`just migrate "add marketing preference"`,** then read the
      generated `upgrade()` and `downgrade()`. Additive only: one table and
      two columns, both with defaults, so it is safe on a populated table.

- [x] **One module that changes the preference,
      `backend/app/marketing/preferences.py`:**
      `set_marketing_preference(db, user, *, wants, source, wording_version)`.
      It does nothing when the answer has not changed, and otherwise writes
      the change row, sets `marketing_emails` and clears
      `marketing_synced_at`. Every route in this plan goes through it, so
      there is one place that writes the evidence. Keep the wording version
      as a constant beside it, `MARKETING_WORDING_VERSION`, bumped whenever
      the sentence on the register pages changes.

- [x] **Tests** in `backend/tests/test_marketing_preferences.py`: a change
      writes one row and flips the column; an unchanged answer writes
      nothing; an unknown source is refused; deleting the user deletes
      their rows.

## Phase 3: Telling Resend

- [x] **Settings, in `backend/app/config.py`:** `RESEND_CONTACTS_API_KEY`
      (`SecretStr`), `RESEND_NEWSLETTER_SEGMENT_ID`,
      `RESEND_NEWSLETTER_TOPIC_ID` and `RESEND_WEBHOOK_SECRET`
      (`SecretStr`), all optional. The subscriptions plan names the first
      three the same; they are the same settings. With any unset, syncing
      is skipped and logged once, so a local or CI stack with no Resend
      still registers people.

- [x] **A Resend contacts client, `backend/app/marketing/resend_contacts.py`:**
      `sync_contact(user)` creates or updates the contact by email address,
      in the segment, with the topic opted in or out to match
      `marketing_emails`. `remove_contact(email)` deletes it. Both
      idempotent, both wrapped in try/except around the HTTP call, both
      logging the user id and never the address. Two things found while
      building it, both departures from what this step first said:

      **It calls the REST API with `httpx`, not the `resend` SDK.** The SDK
      (2.48 in the image) does cover contacts, segments and topics, but it
      keeps its API key in one module-level variable, `resend.api_key`,
      which `email_send.py` sets on every send. This needs a different
      key, so setting it here would race with a password reset being sent
      on another thread, and one of the two would go out with the wrong
      key. `httpx` was already a dependency. The paths and bodies were
      read from the SDK's own source: `GET` and `DELETE /contacts/{email}`,
      `POST /contacts`, `POST /contacts/{email}/segments/{segment_id}`, and
      `PATCH /contacts/{email}/topics` taking a bare list.

      **No consent properties are sent to Resend.** Custom properties have
      to be defined in Resend before a contact can carry them, so sending
      `consent_source` and `consent_wording_version` would have made every
      sync fail until somebody set them up in the dashboard, for a copy of
      what `marketing_preference_change` already records. Resend holds the
      list and Quill holds the evidence, as Decisions says. Only the
      address and the name are sent.

- [x] **Sync when the email address is verified, not at registration.**
      In `verify_email` in `backend/app/main.py`, after `email_verified` is
      set, call `sync_contact`. An address somebody mistyped, or typed for
      somebody else, never reaches the list, because its owner never clicks
      the verification link. This is what stands in for the double opt-in
      the public site's form needs. A person who opted out is still synced,
      as a contact opted out of the topic, so Resend holds the refusal and
      a later import cannot subscribe them by accident. Done in the request
      and not as a background task, which is what this step first said: a
      background task runs after the request's session has closed and
      would need a session of its own, for a call with a five second
      timeout on a link somebody clicks once. A failure is logged and
      swallowed, `marketing_synced_at` stays null and the retry below picks
      it up.

- [x] **A retry for the ones that failed:** `just marketing-sync`, running
      `python -m app.marketing.sync` in the dev stack's backend container,
      which syncs every verified, active user whose `marketing_synced_at`
      is null. It needs the live database, so it carries the worktree
      guard. In production the same code is the admin job's
      `marketing-sync` action, in `backend/scripts/admin_cli.py`. Run by
      hand for now; a scheduled job is in Decisions.

- [x] **Remove the contact when the account goes.** There is no route
      that deletes an account; closing one is `deactivate_user` in
      `backend/app/main.py`, which sets `is_active` false. It now calls
      `remove_contact`, best effort, and clears `marketing_synced_at`, so
      an account that is reactivated is picked up by the retry and put
      back as it was.

- [x] **Tests** with Resend stubbed, in
      `backend/tests/test_marketing_resend_sync.py`: verifying an address
      syncs with the right segment, topic state and properties; an
      unverified user is never synced; a Resend failure leaves
      `marketing_synced_at` null and does not fail verification; unset
      settings skip the call; the retry picks up only unsynced, verified
      users.

## Phase 4: Hearing from Resend

- [x] **`POST /api/marketing/resend-webhook`,** public, in a new
      `backend/app/marketing/router.py`. Somebody who clicks "unsubscribe"
      in an email changes their topic in Resend, and Quill would otherwise
      go on showing the Settings switch as on. The route verifies the
      webhook signature against `RESEND_WEBHOOK_SECRET` before reading the
      body and answers 401 on a bad one, finds the user by the contact's
      email address, and calls `set_marketing_preference` with source
      `resend`, then sets `marketing_synced_at`, since Resend already knows.
      Found while building Phase 3: a `contact.updated` event carries the
      contact's address and its global `unsubscribed` flag, but not its
      topics. So the route asks Resend for the contact's topics
      (`GET /contacts/{email}/topics`) and takes the person as wanting
      news only when they are not globally unsubscribed and not opted out
      of the Newsletter topic. The `resend` SDK's `Webhooks.verify` checks
      the signature and needs no API key, so it is safe to use here.
      An address with no user (a public site signup) is ignored with a 200.
      Rate limited with the existing limiter, at 120 a minute. It needs no
      CSRF token, being called by Resend and not a browser. There turned
      out to be no list of intentionally public routes to add it to, so
      the exception is a comment on the route itself. As built, it also
      answers 502 when Resend cannot be asked about the topics, so that
      Resend sends the event again, and it treats `contact.deleted` as an
      opt-out that clears `marketing_synced_at`: the retry then puts the
      contact back, opted out, so Resend goes on holding the refusal.

- [x] **Allow for Resend's reads lagging its writes.** Found on
      3 October 2026 by running `sync_contact` against the real service
      from the dev stack, with a throwaway contact. Creating, opting out,
      opting in and removing all work. But a topic read within about a
      second of a write still returns the old value, and is right by two
      seconds. That matters to the webhook twice over. First, Resend sends
      `contact.updated` for changes Quill itself made; read at once, the
      stale answer would look like the person changing their mind, and
      would undo the choice they had just made (opting in, then being
      switched off in Quill while Resend goes on emailing them). So an
      event within `ECHO_WINDOW`, sixty seconds, of Quill's own sync is
      ignored, unless it is a deletion or a full unsubscribe, which Quill
      never does to a contact it has just synced. Second, a real
      unsubscribe's event can arrive before a read shows it. So when the
      first read says nothing changed, the route waits `SETTLE_SECONDS`,
      two, and asks once more. The same run showed Resend's rate limit is
      ten requests a second, well clear of the three a sync makes, and one
      call that took longer than the five second timeout, which the retry
      exists for.

- [x] **Give the route a typed response model** in
      `backend/app/schemas/marketing.py`, as every route needs.

- [x] **Tests** in `backend/tests/test_marketing_webhook.py`: a valid
      unsubscribe flips the column and writes a `resend` row; a bad or
      missing signature is 401 and changes nothing; an unknown address is
      200 and changes nothing; a repeat of the same event writes no second
      row; an unset secret answers 503.

## Phase 5: Registration and Settings

- [x] **Accept the choice at registration.** Add `marketing_opt_out` to
      `RegisterIn` in `backend/app/schemas/auth.py`, as `bool | None`
      defaulting to null. Optional, so it is an additive API change and an
      open tab on the old form still registers. This step first said
      `bool = False`, which would have subscribed that open tab's user
      without ever showing them the sentence; null means "the form never
      asked", and that person is left unsubscribed. In `register` in
      `backend/app/main.py`, after the user is created, an answer that was
      given is recorded through `set_marketing_preference` with
      `wants=not payload.marketing_opt_out`, source `registration` and the
      current wording version. A refusal is recorded too, with
      `first_answer=True`, though it changes nothing: shown the question
      and said no is evidence, and without a row it looks the same as
      never having been asked. Both register pages post to this one route.

- [x] **Add the question where somebody registers.** This step first
      said "both register pages", and there turned out to be one form.
      `/register` (`frontend/src/pages/RegisterPage.tsx`) only asks which
      module and who the clinical lead is; it takes no personal details
      and creates no account. The account is made on the next page,
      `frontend/src/pages/TeachingRegisterPage.tsx`, through the shared
      `RegistrationForm` in `frontend/src/components/registration/`, so
      the question goes there, with `CheckboxField` from
      `components/form/`: unticked by default, below the password fields
      and above the submit button. The label is "I would rather not get
      news and updates" and the description is "We'll email you news and
      updates about Quill Medical from time to time. Tick this box if you
      would rather not get them." Both are in
      `frontend/src/lib/marketing/wording.ts`, so any later form asks in
      the same words; bump `MARKETING_WORDING_VERSION` if they change.
      The page always sends `marketing_opt_out`, ticked or not, because
      "not ticked" is what says the person was shown the question.
      `frontend/src/pages/NewPatientPage.tsx` also posts to
      `/api/auth/register`, when an admin makes an account for a patient.
      It sends no answer, so that account is left unsubscribed, which is
      right: the patient was never asked.

- [x] **Read and change it from Settings, backend.** `/api/auth/me`
      returns `marketing_emails`, and `PUT /api/marketing/preference`
      takes `{ wants_marketing: bool }`, with `DEP_CURRENT_USER`, a CSRF
      token and a rate limit, source `settings`. It lives in
      `backend/app/marketing/router.py` beside the webhook, not under
      `/api/auth/` as this step first said: it is not about signing in.

- [x] **Sync an opt-out straight away, and say so if it fails.** Email is
      sent from Resend, so an opt-out that only reached Quill's database
      would not stop anything. The route above calls `sync_contact` in the
      request, and when the person is opting out and Resend refuses, it
      answers 502 with "We could not update your email preferences. Please
      try again." and the change is rolled back, so Quill and Resend still
      agree. A failed opt-in is saved anyway and left for the retry: a
      late opt-in costs nothing. An address not yet verified is not sent
      at all; verifying it sends it.

- [x] **The Settings switch, frontend.** In
      `frontend/src/pages/Settings.tsx`, a `SolidSwitch` in a card titled
      "News and updates by email", with the subtitle "News about Quill
      Medical, new courses and product updates. Account emails, such as
      password resets and certificates, are always sent." It saves on
      change, like the other switches on that page, and puts the switch
      back and shows the error under it if the save fails.

- [x] **Tests.** Backend, in `backend/tests/test_marketing_registration.py`:
      registering with the box unticked sets the column true with a
      `registration` row; ticked leaves it false, with a row; a form that
      sent no answer leaves it false with no row, and so does an
      admin-created user; the Settings route flips it, needs a session and
      a CSRF token, and returns 502 when an opt-out cannot reach Resend.
      Frontend: `RegistrationForm.test.tsx` covers the box unticked and
      ticked, `TeachingRegisterPage.test.tsx` what is posted, and
      `Settings.test.tsx` on, off and a failed save.

- [x] **Say what counts, in `docs/docs/backend/marketing-email.md`,**
      added to the navigation in `docs/mkdocs.yml`. Marketing is news,
      new courses and product updates, sent from Resend broadcasts to the
      Newsletter topic. Everything Quill sends itself through
      `email_send.py` (password resets, invites, email verification,
      certificates, course reminders) is a service message, is not affected
      by this choice, and must never be used to carry marketing.

## Phase 6: Checking it on production

"Production" is the live teaching app. Phases 2 to 5 were tested against
a stub, and Phase 3 once against real Resend from the dev stack. Three
things have never run for real: the settings arriving through Terraform
and Secret Manager, a registration going the whole way from the form to
Resend, and the webhook, which Resend cannot reach on a laptop. Done in
this order, each step proves what the next one stands on. Use an email
address of Mark's own for every test account, and plus-addresses
(`name+test1@...`) to make several.

- [x] **First run on production, 3 October 2026, and two things it
      found.** Mark registered `mark.bailey.teaching.delegate` on the live
      app with the box unticked. The contact reached Resend, in the
      segment and opted in, within half a second of the address being
      verified, and Resend's first signed call to the webhook was
      accepted. The Settings switch then changed the topic correctly each
      time. Two faults showed, both fixed in
      `backend/app/marketing/resend_contacts.py`:

      **Two of three saves from the Settings switch took 10.5 seconds.**
      Resend's API has two IPv6 addresses and two IPv4 ones, and the
      backend on Cloud Run has no IPv6 route out. Tried in the order the
      resolver gives, each IPv6 address hangs for the whole five second
      connect timeout before an IPv4 one is reached: two of those and one
      ordinary request is 10.5 seconds. This is worked out from the
      timings and the DNS records, not seen directly. The client now
      connects over IPv4 only and gives up on a connection after two
      seconds. The save times in the logs after the next deploy are the
      proof. `email_send.py` reaches the same host through the `resend`
      SDK and may be slowed the same way; it has not been changed.

      **Resend's Audience page showed "Subscribed" for somebody who had
      opted out.** Resend holds two switches for a contact: the topic,
      which Quill was setting, and the contact's own `unsubscribed` flag,
      which it was not. A broadcast sent to the segment without naming the
      topic checks only the second, so it would have emailed a person who
      had refused. `sync_contact` now sets both to match. Tried against
      real Resend from the dev stack with a throwaway contact, through
      four changes of mind: both switches followed each time. A contact
      synced before this change keeps the old state until its preference
      next changes.

      Also seen: Resend sent `contact.updated` when the contact was
      created, and nothing when its topic was changed through the API.
      Whether it sends one when a person changes their own topic on
      Resend's page is still to be tested, below.

- [x] **Merge and deploy the stack, and check the migration ran.** The
      deploy runs migrations itself before the new revision takes
      traffic. Mark signed in to the live app afterwards, which reads
      `users.marketing_emails`: a missing column fails every sign-in, as
      it did on the dev stack before `just migrate-local` was run.

- [x] **Finish Phase 1 for production, with its own key.** Done as
      Phase 1 now records. The segment and topic are the ones already
      made: dev and production share one list, which is why every test
      contact below is removed afterwards.

- [x] **Check the running service has the sync settings.** By name, never
      by value. The serving revision lists `RESEND_CONTACTS_API_KEY`,
      `RESEND_NEWSLETTER_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID` and
      `RESEND_WEBHOOK_SECRET`, and the admin job the first three. It took
      a re-run of `deploy.yml` to get there; see Phase 1.

- [x] **Register, and see that nothing reaches Resend until the address
      is verified.** Mark registered `mark.bailey.teaching.delegate` with
      the box unticked. Not checked by looking in Resend before verifying,
      as this step first asked, but shown by the times: registered at
      20:33:00 UTC, verified at 20:33:29, and the contact's own creation
      time in Resend is 20:33:29.

- [x] **Verify, and see the contact arrive.** Half a second after the
      verification, the contact was in the "Quill Medical" segment, named,
      opted in to "Newsletter". A second later Resend made its first
      signed call to the webhook, which was accepted with a 200 and
      recognised as an echo of Quill's own change.

- [x] **Register a second account with the box ticked.** Done by Mark on
      4 October 2026. Registered at 08:25:30 UTC, verified at 08:25:47,
      and the contact was in Resend the same second: unsubscribed as a
      contact and opted **out** of "Newsletter", both switches agreeing.
      So a refusal at registration is held by Resend from the start, as
      designed.

- [x] **Flip the Settings switch both ways.** Each change reached
      Resend's topic. This is where the two faults in the entry above
      showed: saves of ten seconds, and "Subscribed" on Resend's Audience
      page for somebody opted out. Both fixes deployed at 21:01 UTC on
      3 October.

- [x] **Flip it again after the fix, and read the times.** Done on
      4 October 2026. Six saves took between 0.8 and 1.6 seconds and none
      took ten, so the IPv6 account of the slow saves holds. Resend's
      Audience page shows the contact's true status. One save in seven
      failed: Resend took longer than five seconds to answer one request,
      and because it was an opt-out the change was refused with a 502 and
      the person asked to try again, as designed. Three things followed
      from that one failure:

      **A stalled call is tried once more.** A save is four calls to
      Resend in a row, so one stall failed the whole save. Resend has now
      stalled twice in about thirty calls and been back to normal on the
      next each time. `_reaching_resend` in
      `backend/app/marketing/resend_contacts.py` runs the calls again from
      the top on a timeout, and only on a timeout: a refusal would be
      refused again. Safe to repeat, because the sync looks at what Resend
      holds before changing it.

      **The alert that fired said "(null)".** The backend error alert
      quotes the message of the entry that set it off. That entry was
      Cloud Run's own record of the 502, which has no message; the code's
      account of why was a line away, logged as a warning. A refused
      opt-out is now logged as an error that says why, and a late opt-in,
      which fails nobody, stays a warning.

      **The alert now names the request.** In
      `infra/modules/monitoring/main.tf` it quotes the method, the path
      and the status as well as the message, so an entry with no message
      still says which request failed. The path only, without its query
      string, which can hold what somebody typed into a search box.

- [x] **Add the webhook in Resend,** as Phase 1 records.

- [x] **Check the webhook refuses a stranger.** A request with no
      signature and one with a made-up signature both got a 401,
      "Invalid signature.", and neither was logged as an error.

- [x] **Send a real newsletter and unsubscribe from it.** On 4 October
      2026 a test broadcast went to the "Newsletter" topic, built from
      `just email-export quill` with a short test message in place of the
      campaign content, and created and sent through Resend's API. The
      segment held only Mark's contact. It arrived, the footer's
      "Unsubscribe" link opened Resend's own page, and unsubscribing there
      marked the contact unsubscribed in Resend. **Quill was not told.**
      The webhook in Resend was subscribed to `contact.created` and
      `contact.deleted`, where it should have been `contact.updated` and
      `contact.deleted`: an unsubscribe is an update, so Resend had
      nothing to send. That also explains the silence noted in the first
      production run, when a topic was changed through the API. Mark
      corrected the webhook's events the same day. Nobody could have been
      emailed wrongly, since Resend held the unsubscribe; the fault was
      Quill's Settings switch going on showing "on".

- [ ] **Unsubscribe from Resend's side again, and see Quill follow,** now
      that the webhook reports updates. Very likely done already: at
      08:21:43 UTC on 4 October, three minutes after the last change made
      in Quill and so outside the echo window, Resend called the webhook,
      the route asked Resend for the contact's topics (the call took a
      quarter of a second where an ignored one takes a few milliseconds)
      and answered 200, and the contact is now unsubscribed in Resend.
      What the logs cannot show is the Settings switch itself, so this
      stays unticked until somebody has looked at it and seen it off. Switch news off and on in Quill
      first, so the contact is subscribed again in Resend, and wait at
      least a minute, because the route ignores an event within sixty
      seconds of Quill's own sync as an echo. Then unsubscribe the contact
      in Resend. Its webhook log should show a 200, and Settings in Quill
      should show the switch off after a reload. Still the one step that
      has never run for real.

- [x] **Check Quill against Resend once a week.** The missed unsubscribe
      showed what the design had been relying on: if a webhook call is
      ever lost, Quill stays wrong for good, because nothing goes back to
      look. `backend/app/marketing/reconcile.py` goes back. It sends
      Resend any choice Quill has not yet managed to send, then reads the
      segment's contacts and changes Quill to match wherever the two
      disagree. **Resend wins**, Mark's decision, in both directions:
      somebody who re-subscribed on Resend's page is switched on in Quill
      as surely as somebody who unsubscribed is switched off. The one
      thing that comes first is a choice Resend has not had yet, which is
      Quill knowing something newer and not a disagreement. An account
      with no contact in Resend is switched off and sent again, opted
      out, by the next run, as the webhook treats a deleted contact. It
      is the admin job's `marketing-reconcile` action and
      `just marketing-reconcile` on the dev stack.

      **Run by a scheduled workflow, `.github/workflows/marketing-reconcile.yml`,**
      every Tuesday at 05:00 UTC, not by Cloud Scheduler as Decisions
      first suggested. The project has neither the Cloud Scheduler API
      enabled nor a role for the Terraform identity that could create a
      schedule, and the deploy already runs this same job for migrations
      with the identity the workflow uses, so there was nothing new to
      grant. It posts to Slack only when it fails. Weekly is enough
      because nobody is emailed wrongly in the meantime.

      **The first run will add contacts.** Every verified, active account
      Resend has not been told about is sent first, as the retry has
      always done, so accounts that existed before this plan arrive in
      Resend as contacts opted out.

- [ ] **Check an admin-created account is left alone.** Create a user at
      `/admin/users/new` with a test address. No contact should appear in
      Resend, even after they set a password and sign in, until they
      switch news on in Settings themselves.

- [ ] **Deactivate a test account, and see the contact go.** Deactivate
      the second test account from the admin users page. Its contact
      should be gone from Resend.

- [ ] **Run the retry once, and expect nothing to do.** Execute the admin
      job with `ADMIN_ACTION=marketing-sync`, the way `just migrate-remote`
      runs `run-migrations`. It should print `Synced 0, failed 0.` or
      sync only the reactivated or unverified-then-verified accounts from
      the steps above. If it is worth running often, add a
      `marketing-sync-remote` recipe beside `migrate-remote` then.

- [x] **Read the logs for addresses.** Searched the backend's logs for
      the test address. Nothing from `app.marketing` names it: that code
      logs a user id and an HTTP status. One entry does, and it is not
      marketing's: `email_send.py` logs `Email sent – to=<address>` for
      every email it sends, the verification email here. An email address
      in the logs is personal data, and for a patient's account it would
      sit beside the fact that they have one. Outside this plan, and
      older than it, but found by this check; see Decisions.

- [ ] **Tidy up.** Delete the test contacts in Resend and deactivate the
      test accounts, so the first real broadcast goes to nobody who did
      not register for real.

- [ ] **Before the first real broadcast, settle the soft opt-in
      question** in Decisions. Everything above proves the machinery
      works. It does not prove an opt-out is the right basis for emailing
      people who registered for free.

## Decisions

- **Opt-out, not opt-in** – Mark's decision. UK rules (PECR) allow
  marketing email without prior consent only under the "soft opt-in":
  the address was given in the course of a sale or negotiation for a
  service, the marketing is for the sender's own similar services, and the
  person was given a simple way to refuse when the address was collected
  and in every message. This plan supplies the last two. Whether a free
  registration counts as the first is a legal question this plan does not
  settle, and it is worth one check with whoever advises on data protection
  before the first broadcast is sent. If the answer is no, the fix is small:
  flip the checkbox to an unticked "Send me news and updates" and bump the
  wording version. Nothing else in the plan changes.

- **An unticked "rather not" box, not a pre-ticked "yes" box** – both are
  opt-outs. A pre-ticked box is the pattern regulators single out as
  misleading; a plain sentence saying news will be sent, with a box to
  refuse, says the same thing honestly.

- **One list, one choice** – a single Newsletter topic. Resend topics
  would allow a choice per teaching organisation or per subject later, and
  the change table already records which wording was shown, so splitting
  the choice is additive.

- **Resend holds the list, Quill holds the evidence** – broadcasts are
  sent from Resend, so its contact record decides who is emailed. Quill's
  column and change table exist to show the person their own choice and to
  prove what they were asked. Where the two disagree, an opt-out wins
  whichever side it is on, and the webhook and the retry bring them back
  together.

- **Admin-created accounts are not subscribed** – they were never shown
  the sentence. They can switch news on in Settings.

- **The retry is scheduled, weekly, as part of the reconcile** – this
  bullet first read "no scheduled retry yet", with a Cloud Scheduler job
  as the obvious next step. The weekly reconcile in Phase 6 runs the
  retry before it compares anything, from a scheduled workflow, so there
  is no separate schedule to add.

- **Dev and production share one list** – different keys, the same
  segment and topic. It made the first tests simple and it means a
  contact made from the dev stack is a real contact. Running
  `just marketing-sync` or `just marketing-reconcile` on the dev stack
  sends every verified dev account to the real list. A second segment
  for development would end that, and is worth making before anybody
  else works on this.

- **`email_send.py` logs the address it sends to** – found by Phase 6's
  log check, and left alone here because it is not marketing's code and
  changing it is a decision about what the logs are for. It wants its own
  small change: log the user id, or nothing, as the rest of the
  application does.

- **`email_send.py` may be slowed by IPv6 as the sync was** – it reaches
  the same host through the `resend` SDK. Not measured and not changed.
  If a password reset is ever seen to take ten seconds, this is the first
  place to look.

- **No existing users to migrate** – nobody is registered in production,
  so there is no backfill, and no question of what an existing person
  agreed to.
