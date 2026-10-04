# Waiting on me inbox plan

Nobody finds out that something in Quill is waiting on them unless they go
and look. An operator learns of new feedback only by opening
`/admin/feedback`. A sender learns of a reply only by opening `/feedback`.
The passport solved this for itself with `InboxButton`, an envelope in its
own page header showing how many sign-off requests are waiting, and nothing
else in the application shares it. Each feature that needs attention would
otherwise grow its own corner to check.

The outcome wanted is one envelope in the top ribbon, on every page, showing
how many things are waiting on the person signed in, with an email for what
arrives while they are away. Feedback is the first source and the passport
the second. It is built so that clinician-to-clinician messages, expected
later as part of a paid messaging service, arrive as one more source with
the same weight and not as a second inbox.

## Phase 1: Email an operator when feedback arrives

First because it stands alone: it needs no new screen, and it is the half
that works while nobody is in the application.

- [x] Add `FEEDBACK_NOTIFY_EMAIL` to `Settings` in `backend/app/config.py`,
      an optional address, empty by default. Empty means no email is sent,
      which is what a development stack and the unit tests want. One
      configured address and not "every `superadmin`": test operator
      accounts exist in every environment and should not get mail.

- [x] In `submit_feedback` in `backend/app/feedback/router.py`, after the
      row is flushed, send one email through `send_email` in
      `backend/app/email_send.py`, as teaching's certificate email does.
      It goes out as a background task, so a slow or failing mail service
      never delays or fails the submission.

- [x] The email says who sent it, the category, the page it was sent from
      and a link to `/admin/feedback/{id}`. **It never carries the
      message.** The message may hold patient data, which is why it is
      never logged, and an email copies it into a system outside Quill.
      A test asserts the message text appears nowhere in what is passed to
      `send_email`, in the manner of `test_never_logs_the_message`.

- [x] Add a template under `backend/app/email/templates/` and a preview
      in `backend/app/email/previews.py`, so it is drawn in both themes
      with the others.

- [x] Set `FEEDBACK_NOTIFY_EMAIL` to `info@quill-medical.com` in
      `infra/main.tf`, beside `EMAIL_FROM`. It is an address and not a
      secret, so it needs no Secret Manager entry. The address is a guess
      at where an operator reads mail: it is the one the application
      already sends from. Change it there if feedback should go elsewhere.

- [x] Tests: an email is sent to the configured address on submission,
      none is sent when the setting is empty, and a failure to send
      leaves the feedback stored and the response a 201.

## Phase 2: A shared envelope

- [ ] Move `InboxButton` from `frontend/src/components/passport/` to
      `frontend/src/components/inbox/`, with its stylesheet, stories and
      test. It already does what is wanted: an envelope that turns amber
      while anything waits, a count capped at "9+", and nothing drawn at
      zero.

- [ ] Replace its fixed label, "Sign-off requests for me to assess", with
      a `label` prop, and keep the count in the accessible name. The
      passport page passes its present wording, so that page does not
      change in this phase.

## Phase 3: One answer to "what is waiting on me?"

- [ ] Add `GET /api/inbox`, in a new `backend/app/inbox/` module, for any
      signed-in user. It returns a typed list of sources, each with a
      `source` key and a `count`, and the total. A source with nothing
      waiting is left out.

- [ ] Each source is a function registered in that module, taking the
      user and the session and returning a count. **Nothing is copied
      into an inbox table.** Each feature already knows what is waiting
      and answers from its own rows, so the count cannot drift from the
      thing it counts. Something is waiting until it is dealt with, and
      each source says what "dealt with" means.

- [ ] The first source is `feedback_new`: for an operator, the number of
      `feedback` rows whose status is `new`. Anybody else gets nothing
      from it. It clears when the item is acknowledged, resolved or
      marked won't fix, never merely by being opened.

- [ ] Tests: an operator's count follows the status, somebody who is not
      an operator gets an empty list, and a signed-out caller is refused.

## Phase 4: The envelope in the ribbon

- [ ] Add `frontend/src/lib/inbox/` with the client call and a hook that
      fetches the summary when the layout mounts and when the route
      changes. Not polled and not live: the email covers the time away,
      and a count that is right at each navigation is enough inside the
      application.

- [ ] Build `InboxMenu` in `frontend/src/components/inbox/`, with stories
      and a test: the envelope, and on pressing it a dropdown listing each
      source with its count, each a link. A dropdown and not a page,
      since with one or two sources a page would be mostly empty. The
      label and the address for each source live in the frontend, keyed
      on `source`.

- [ ] Show it through `TopRibbon`'s `rightSection`, from `MainLayout`.
      `TeachingLayout` already uses that slot for an exam's timer and
      keeps it: nothing may compete with the timer, and nothing is
      fetched between starting an exam and seeing its result.

- [ ] On a narrow ribbon the envelope stays and the name gives way, which
      is what `brandYields` in `TopRibbon.module.scss` already does for a
      right section. Check it at phone width with the hamburger showing.

- [ ] Tests: the envelope shows the total, the dropdown lists what the
      API returned, it is absent from the exam ribbon, and a failed fetch
      draws the envelope with no count and no error.

## Phase 5: Tell the sender about a reply

- [ ] Add a nullable `comment_seen_at` to `feedback`, with
      `just migrate`. A reply is waiting when `operator_comment` is set
      and `comment_seen_at` is empty. Saving a changed comment clears it,
      so an update added as a new line counts as new again.

- [ ] Add `POST /api/feedback/mine/seen`, which stamps the caller's own
      rows, and call it when `YourFeedbackPage` loads.

- [ ] Add the source `feedback_reply`: the number of the caller's own
      feedback rows with an unseen reply. Its link is `/feedback`.

- [ ] Email the sender when a comment is saved, on the same rule as
      phase 1: that there is a reply, and a link. Neither the comment
      nor their own message goes in it.

## Phase 6: The passport joins

- [ ] Add the source `passport_sign_off`: what `GET
      /api/passport/requests/inbox` already counts, the sign-off requests
      waiting on the caller as an assessor.

- [ ] Take `InboxButton` off the header of `PassportPage`. Two envelopes
      would count the same requests twice in view of each other.

## Phase 7: Accessibility journeys

- [ ] The ribbon is on the path of every journey in
      `docs/docs/frontend/accessibility/journeys.md`. Add journeys 1 to 4
      to the "Not yet run" list in `testing-log.md` against this change,
      naming the envelope and its dropdown as what is new to reach.

## Decisions

- **Messages and tasks carry the same weight** – for a clinician a
  message is usually a task: it is finished when something has been done
  about it, not when it has been read. So there is one idea under the
  envelope, "waiting on me", and every source stays in the count until it
  is dealt with. A message will clear on a reply or on being marked done,
  never on opening, with unread shown separately so that what is new can
  still be seen.

- **A message may be marked as needing no action** – by its sender, or
  by the recipient in one press. Without that, every "thanks" sits in the
  count, the count stops meaning anything, and people learn to ignore it.

- **No central inbox table** – each feature answers for its own rows. A
  table of copies would need keeping in step with every feature that
  writes to it, and would be wrong the first time one forgot.

- **No text from a message in any notification** – an email, and later a
  push, says who and what kind and gives a link. The words stay in Quill,
  behind its access checks.

- **Deferred: clinician-to-clinician messages** – they arrive as a
  source in phase 3's list, with read and done held apart as above. The
  existing patient messaging feature is not changed here.

- **Deferred: web push** – `push.py` and `push_send.py` exist and have
  never been finished or tested. Email covers the time away until they
  are.

- **Rejected: a count on the Feedback link in the admin menu** – only an
  operator opens Admin. An assessor with sign-offs waiting and a sender
  with a reply to read never would.
