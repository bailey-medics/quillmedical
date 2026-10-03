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

- [ ] **Make two API keys that can manage contacts,** with Full access:
      a "Sending access" key cannot. One for the dev stack, kept in
      `backend/.env`, and one for production, so either can be revoked
      without the other. The sending key the backend already holds stays
      as it is.

- [x] **Create the two secret containers, in `infra/main.tf`:**
      `resend-contacts-api-key` and `resend-webhook-secret`, added to the
      `secrets` module's list beside `resend-api-key`. Terraform makes
      the containers and nothing else; the values never enter its state.
      This step first said the secrets had to exist before any Terraform
      change, which had it backwards: this repository creates the
      containers in Terraform and fills them by hand. What does have to
      wait is mounting them, the step after next, because Cloud Run
      refuses a revision that mounts a secret with no version.

- [ ] **Put the production key in, by hand, once the change above has
      applied:**
      `printf '%s' '<key>' | gcloud secrets versions add resend-contacts-api-key --data-file=- --project=<project>`.
      `printf`, not `echo`: a trailing newline in `resend-api-key` is
      what stopped every email in September. The webhook secret goes in
      the same way, later, once the webhook exists.

- [ ] **Mount the settings on the backend and the admin job, in
      `infra/`.** `RESEND_CONTACTS_API_KEY` joins `backend_secret_env_vars`
      and `admin_secret_env_vars` in `infra/runtime-identities.tf`, which
      also grants each service account access. The admin job needs it
      because `marketing-sync` runs there. `RESEND_NEWSLETTER_SEGMENT_ID`
      and `RESEND_NEWSLETTER_TOPIC_ID` are not secrets and go in as plain
      environment variables beside `EMAIL_FROM` in `infra/main.tf`. Only
      after the key has a version. Until this is done the code is inert
      in production: with the settings unset nothing is sent to Resend,
      and people still register.

- [ ] **Add a webhook for contact changes,** once Phase 4 has deployed,
      since the address does not exist until then:
      `https://<host>/api/marketing/resend-webhook`, subscribed to
      `contact.updated` and `contact.deleted`. Put its signing secret
      into `resend-webhook-secret` as above, then
      mount it as `RESEND_WEBHOOK_SECRET` on the backend in a last
      `infra/` change. Without it the webhook answers 503 and everything
      else works.

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

- [ ] **Merge and deploy the stack, and check the migration ran.** The
      deploy runs migrations itself before the new revision takes
      traffic. In the `deploy.yml` run, the migration job should show
      `add marketing preference`. Then load the login page and sign in:
      a missing `users.marketing_emails` column fails every sign-in, as
      it did on the dev stack before `just migrate-local` was run.

- [ ] **Finish Phase 1 for production, with its own key.** Make a second
      contacts API key in Resend for production, not the one in the dev
      stack's `backend/.env`, so either can be revoked without the other.
      Store it and wire the settings as Phase 1 says, merge the `infra/`
      change, and check the `terraform.yml` run applied. The segment and
      topic are the ones already made: dev and production share one list,
      which is why every test contact below is removed afterwards.

- [ ] **Check the running service has the three sync settings.** By
      name, never by value: in the Cloud Run console the backend revision
      should list `RESEND_CONTACTS_API_KEY`, `RESEND_NEWSLETTER_SEGMENT_ID`
      and `RESEND_NEWSLETTER_TOPIC_ID`. If a secret was changed after the
      last deploy, re-run `deploy.yml`, which is what makes a new revision
      read it; do not use `gcloud run services update`.

- [ ] **Register, and see that nothing reaches Resend yet.** On the live
      site, go through `/register` to the account form and register with
      the marketing box left unticked. Before clicking the verification
      link, search Resend's contacts for the address. It should not be
      there: an unverified address never joins the list.

- [ ] **Verify, and see the contact arrive.** Click the link in the
      verification email. Within a few seconds Resend should have the
      contact, with the name, in the "Quill Medical" segment, opted in
      to "Newsletter". Sign in and check the Settings switch "News and
      updates by email" is on.

- [ ] **Register a second account with the box ticked.** After verifying,
      Resend should hold that contact opted **out** of "Newsletter", and
      its Settings switch should be off.

- [ ] **Flip the Settings switch both ways.** On the first account,
      switch news off, wait a few seconds, and check Resend shows opted
      out. Switch it on again and check Resend shows opted in. Resend's
      reads lag its writes by a second or two, so reload its page before
      deciding a change has not arrived.

- [ ] **Add the webhook in Resend, as Phase 1's last step says,** now that
      the address exists: `https://<teaching host>/api/marketing/resend-webhook`,
      events `contact.updated` and `contact.deleted`. Store the signing
      secret, wire `RESEND_WEBHOOK_SECRET`, and re-run `deploy.yml`.

- [ ] **Check the webhook refuses a stranger.** From a terminal:
      `curl -i -X POST https://<teaching host>/api/marketing/resend-webhook -d '{}'`
      should answer 401. A 503 means the secret has not reached the
      running revision. A 200 would mean anybody can change a preference,
      and is a reason to take the route down.

- [ ] **Unsubscribe from Resend's side, and see Quill follow.** Wait at
      least a minute after the last Settings change, because the route
      ignores an event within sixty seconds of Quill's own sync as an
      echo. Then, in Resend, open the first test contact and opt it out
      of "Newsletter". In Resend's webhook log the delivery should show a
      200. Reload Settings in Quill: the switch should now be off. This
      is the step nothing before production could test.

- [ ] **Do the same through a real email.** Send a test broadcast to the
      "Newsletter" topic with only the test contacts opted in, using the
      template from `just email-export quill`. Check it arrives, looks
      like Quill's other email, and that its unsubscribe link opens
      Resend's page. Unsubscribe there, and check the Settings switch
      goes off as in the step before. This is the path a real person
      takes.

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

- [ ] **Read the logs for addresses.** In Cloud Logging, search the
      backend's logs for the test addresses. The marketing code logs a
      user id and an HTTP status, never an address; a hit from
      `app.marketing` is a bug to fix before real people register.

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

- **No scheduled retry yet** – `just marketing-sync` is run by hand. With
  no real users there is nothing to schedule for; a Cloud Scheduler job
  calling the admin Cloud Run job is the obvious next step once
  registrations are regular.

- **No existing users to migrate** – nobody is registered in production,
  so there is no backfill, and no question of what an existing person
  agreed to.
