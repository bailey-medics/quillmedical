# Marketing opt-out plan

Somebody who registers for Quill gives an email address, and nothing asks
whether they want news sent to it. The register pages have no marketing
question, the `users` table holds no preference, and nothing tells Resend,
where the mailing list lives, that the person exists. So today nobody who
registers can be emailed news at all, and nobody has been offered a way to
refuse it.

The outcome is one choice, offered at registration on both register pages
and changeable later in Settings. It is an opt-out: a new registrant gets
news unless they say no. The choice is recorded in Quill's database with
when and how it was made, and kept in step with Resend in both directions,
so an unsubscribe link in an email and the switch in Settings always agree.

## Phase 1: Resend (Mark, in the Resend dashboard)

Shared with [Public site email subscriptions](2026-03-21-subscriptions.md),
whose Phase 1 asks for the same things. Whichever plan is built first does
them; the other ticks them off.

- [ ] **Create the "Quill Medical" segment and the "Newsletter" topic,**
      and note both ids. One list for everybody, registrants and public
      site signups alike: there is one newsletter. Resend groups contacts
      into segments, and a contact opts in or out of a topic; the topic is
      what an unsubscribe link switches off.

- [ ] **Make an API key that can manage contacts,** stored in GCP Secret
      Manager as `resend-contacts-api-key` and read by Terraform. The
      sending key the backend holds today may be send-only. It belongs in
      Secret Manager, not GitHub, because GitHub would only relay it.

- [ ] **Add a webhook for contact changes,** pointing at
      `https://<host>/api/marketing/resend-webhook`, subscribed to
      `contact.updated` and `contact.deleted`. Store its signing secret in
      Secret Manager as `resend-webhook-secret`. Do this after Phase 4 has
      deployed, since the address does not exist until then. Check the event
      names against Resend's webhook list when doing it: this plan was
      written from the documentation, not from a working webhook.

- [ ] **Give the backend its four settings, in `infra/`,** once the
      secrets above exist: `RESEND_CONTACTS_API_KEY` and
      `RESEND_WEBHOOK_SECRET` from Secret Manager through
      `google_secret_manager_secret_version` data sources, and
      `RESEND_NEWSLETTER_SEGMENT_ID` and `RESEND_NEWSLETTER_TOPIC_ID` as
      plain environment variables on the backend Cloud Run service and the
      admin job. Not done with the code: a data source for a secret that
      does not exist yet fails the Terraform apply that runs on merge.
      Until this is done the code below is inert in production: with the
      settings unset nothing is sent to Resend, and people still register.

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

- [ ] **`POST /api/marketing/resend-webhook`,** public, in a new
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
      Rate limited with the existing limiter. It needs no CSRF token, being
      called by Resend and not a browser: mark it as an intentional
      exception where the others are listed.

- [ ] **Give the route a typed response model** in
      `backend/app/schemas/marketing.py`, as every route needs.

- [ ] **Tests** in `backend/tests/test_marketing_webhook.py`: a valid
      unsubscribe flips the column and writes a `resend` row; a bad or
      missing signature is 401 and changes nothing; an unknown address is
      200 and changes nothing; a repeat of the same event writes no second
      row; an unset secret answers 503.

## Phase 5: Registration and Settings

- [ ] **Accept the choice at registration.** Add
      `marketing_opt_out: bool = False` to `RegisterIn` in
      `backend/app/schemas/auth.py`. Optional with a default, so it is an
      additive API change and an open tab on the old form still registers.
      In `register` in `backend/app/main.py`, after the user is created,
      call `set_marketing_preference` with `wants=not payload.marketing_opt_out`,
      source `registration` and the current wording version. Both register
      pages post to this one route.

- [ ] **Add the question to both register pages,**
      `frontend/src/pages/RegisterPage.tsx` and
      `frontend/src/pages/TeachingRegisterPage.tsx`, with `CheckboxField`
      from `components/form/`. Unticked by default, below the password
      fields and above the submit button, reading:
      "We'll email you news and updates about Quill Medical from time to
      time. Tick this box if you would rather not get them." Sentence case,
      British English, the same words on both pages: put the sentence in one
      shared constant so the two cannot drift, and bump
      `MARKETING_WORDING_VERSION` if it changes.

- [ ] **Sync an opt-out straight away, and say so if it fails.** Email is
      sent from Resend, so an opt-out that only reached Quill's database
      would not stop anything. The Settings route below calls
      `sync_contact` in the request when the person is opting out, and
      answers 502 with "We could not update your email preferences. Please
      try again." if Resend refuses. Opting in may go in the background:
      a late opt-in costs nothing.

- [ ] **Read and change it in Settings.** Return `marketing_emails` from
      `/api/auth/me`, and add `PUT /api/auth/marketing-preference` taking
      `{ wants_marketing: bool }`, with `DEP_CURRENT_USER` and
      `DEP_REQUIRE_CSRF`, source `settings`. In
      `frontend/src/pages/Settings.tsx`, add a `SolidSwitch` titled "News
      and updates by email" with the subtitle "Account emails, such as
      password resets and certificates, are always sent." It saves on
      change, like the other switches on that page, and puts the switch
      back and shows the error if the save fails.

- [ ] **Tests.** Backend, in `backend/tests/test_marketing_registration.py`:
      registering with the box unticked sets the column true with a
      `registration` row; ticked sets it false; an admin-created user is
      false with no row; the Settings route flips it, needs a session and a
      CSRF token, and returns 502 when an opt-out cannot reach Resend.
      Frontend: both register page tests send `marketing_opt_out` as
      ticked; the Settings test covers on, off and a failed save.

- [ ] **Say what counts, in `docs/docs/backend/`:** a short page,
      "Marketing email", registered in the docs index. Marketing is news,
      new courses and product updates, sent from Resend broadcasts to the
      Newsletter topic. Everything Quill sends itself through
      `email_send.py` (password resets, invites, email verification,
      certificates, course reminders) is a service message, is not affected
      by this choice, and must never be used to carry marketing.

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
