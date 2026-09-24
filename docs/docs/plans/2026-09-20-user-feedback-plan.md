# User feedback plan

Quill only sees the errors it throws. `reportError` in
`frontend/src/lib/error-reporting/report.ts` catches unhandled errors and
logs them for Cloud Error Reporting, but the failures that matter most in a
teaching app do not throw: wrong captions, an inaccurate case, a button that
does the wrong thing, a confusing assessment. Only a person can report those,
and today there is nowhere for them to do it. Error reports also become log
lines, which cannot be answered, so a learner who reports a broken case never
finds out it was fixed and stops reporting.

This plan adds a `Send feedback` link that opens a modal, stores what is
typed in a `feedback` table with a status, gives operators a page to read
submissions and close them, and shows each sender the status of what they
sent. The same modal is offered from the error boundary fallback, where the
user has certainly just hit a bug.

## Phase 1: Icon registration

Small and isolated; it unblocks the frontend phases. Independent of Phase 2,
so either can go first.

- [x] Register `IconMessageReport` in
      `frontend/src/components/icons/appIcons.ts` — in the import, the
      re-export, and `iconCatalogue` as `MessageReport`, all three as that
      file's header comment requires. A speech bubble with an exclamation
      mark is outbound and about something being wrong, which is the dual
      scope the label carries. The alternatives are taken or misleading:
      `IconMessage` is already the Messages link, `IconSend` is wanted for
      the submit button, `IconAlertTriangle` and `IconExclamationCircle`
      would make the link look like a warning indicator, `IconMail` implies
      email and `IconBell` is inbound.
- [x] Add it to `frontend/src/components/icons/NavIcon.tsx` as `"feedback"` —
      the import from `appIcons`, `| "feedback"` on the `IconName` union, and
      `feedback: IconMessageReport` in `iconMap`.

## Phase 2: Backend model, migration and submit endpoint

Nothing user-visible yet; submissions can land before there is a form.

- [x] Add a `Feedback` model to `backend/app/models.py` — `Mapped[...]`
      annotations, explicit `nullable`, bounded `String` lengths. Fields:
      `id`; `user_id` (FK to `user.id`, set from the session); `category`
      (nullable, constrained to the known set); `message` (length-bounded);
      `route`, `release`, `viewport`, `user_agent`; `breadcrumbs` as `JSON`;
      `error_name` and `error_code` (nullable, set when sent from the error
      boundary); `status` of `new`, `acknowledged`, `resolved` or `wont_fix`,
      defaulting to `new`; and a timezone-aware `created_at`. The status is
      what makes this a workflow rather than a pile — a log line cannot be
      marked resolved, which is why feedback goes to a table rather than the
      client-errors log pipe.
- [x] Run `just migrate "add feedback table"` and read the generated
      `upgrade()` and `downgrade()` before committing.
- [x] Add `backend/app/schemas/feedback.py` — `extra='forbid'`, every field
      length-bounded, `category` a `Literal`. The message body is stored as
      typed: redacting prose destroys the report, so the patient-data
      controls are access and retention, not transformation. The captured
      context fields still go through the existing `sanitise.ts` helpers on
      the client.
- [x] Add `POST /api/feedback` in a new router at
      `backend/app/feedback/router.py`, not in the analytics router or
      `main.py` — analytics ingests machine telemetry into logs, this stores
      human text and reads it back. Gate it with `DEP_CURRENT_USER` and
      `DEP_REQUIRE_CSRF`; unlike client errors there is no case for a
      signed-out caller, since knowing who sent it is the value and an open
      endpoint storing free text is an abuse target. Attribute the user from
      the session cookie, never the body, so feedback cannot be pinned on
      someone else. Rate-limit at `5/minute` — a person typing prose cannot
      legitimately go faster. Validate before any work, return the new id,
      and **never log the message body**: free text from a clinical app will
      contain patient data, and the analytics logging habit is the easy way
      to leak it. The captured context also gets the error reports'
      server-side backstop (`redact`, `clean_release`, `build_breadcrumbs`
      from `app/analytics/router.py`), since the browser's sanitising is
      not something the server can trust.
- [x] Backend tests, `just ub -k "feedback"`: stores the record and
      attributes the user from the session; rejects unauthenticated callers,
      missing CSRF, over-length and extra fields; the message body does not
      appear in logs.

## Phase 3: Modal and nav link

The feature becomes usable here.

- [ ] Build `frontend/src/components/feedback/FeedbackModal.tsx` with
      `.stories.tsx` and `.test.tsx`. A modal, not a page: routing away loses
      the screen being complained about and trips `DirtyFormNavigation`, and
      people describe better what they can still see. Contents:
  - **Title** — `Send feedback`.
  - **Sub-line** — `Tell us what went wrong, or what would make this
    better.` This widens the scope beyond bugs, so the label does not have
    to.
  - **Category** — optional `SelectField`: `Something is broken`,
    `Something is wrong or inaccurate`, `Suggestion`, `Something else`.
  - **Message** — required, autofocused `Textarea`, with **Do not include
    patient details.** directly above it.
  - **Actions** — `ButtonPair`, submit labelled `Send feedback` with
    `IconSend`.
- [ ] Submit through the `api` client, not `sendBeacon`, and show a success
      state in place of the form rather than closing. `sendBeacon` suits a
      crash report where no answer is worth having; someone who has typed
      three sentences needs to see it landed, or they repeat themselves or
      give up.
- [ ] Capture context at submit time: `route` from `getCurrentRoute()` (the
      matched pattern, never a resolved URL), `breadcrumbs` from
      `getBreadcrumbs()`, the same `release` error reports carry, and
      `viewport` and `user_agent` bounded as the error path bounds them.
- [ ] Add the link in `SideNavContent.tsx`, below the `featureItems` map and
      directly above `Logout`. Label `Send feedback`, icon `"feedback"`,
      opens the modal rather than navigating. Ungated — no
      `hasClinicalServices` or competency check, because everyone can hit a
      bug and a learner spotting a factual error is the report most worth
      having. Every other entry is a noun naming a destination; this one is
      a verb beside `Logout`, the sidebar's other verb. `Feedback` alone
      reads as a destination and collides with the admin page; `Report a
      problem` suppresses suggestions.
- [ ] Frontend tests, `just uf <path>`: the modal renders, requires the
      message, submits, shows success and handles failure — query the
      category as `role="combobox"`, and set unset handlers in stories to
      `undefined` so `argTypesRegex` does not inject spies. `SideNavContent`
      shows the link regardless of gating, above `Logout`. Run
      `yarn typecheck:all`, since bare `tsc --noEmit` skips stories.

## Phase 4: Admin list and status

This closes the loop; without it the table is write-only and decays into the
log pipe it was meant to improve on.

- [ ] Add `GET /api/feedback` (newest first) and `PATCH /api/feedback/{id}`
      (status only) to the feedback router, both behind
      `DEP_REQUIRE_OPERATOR`. Tests: both refuse non-operators; the patch
      rejects an unknown status.
- [ ] Add a page under `frontend/src/pages/admin/feedback/`, following the
      existing admin list pages and wrapped in `<RequireOperator>` in
      `main.tsx`. List status, category, sender, time and route; filter by
      status so `new` can be isolated; change status inline. Add it as a
      `Feedback` child of `adminNavItem` in `SideNavContent.tsx`; under Admin
      the noun plainly means the submissions, so it does not collide with the
      `Send feedback` action.

## Phase 5: Your feedback

The operator page closes the loop for us; this closes it for the sender, which
is the reason the plan exists. Read-only — replying is deferred.

- [ ] Add `GET /api/feedback/mine` to the feedback router, behind
      `DEP_CURRENT_USER` and filtered to the caller's `user_id` from the
      session, newest first. It returns the caller's own message, category,
      status and date, and nothing captured automatically — the only text it
      exposes is text they wrote. Declare it before `/{id}` routes so the
      path is not parsed as an id. Tests: returns only the caller's
      submissions, and refuses unauthenticated callers.
- [ ] Add a page at `frontend/src/pages/feedback/`, routed at `/feedback`
      inside `<RequireAuth>` with no further gate. List each submission with
      its message and a sender-facing status label: `new` shows as
      `Received`, `acknowledged` as `Being looked at`, `resolved` as `Fixed`,
      `wont_fix` as `Won't fix`. Map these in one place so the stored values
      never reach the screen. An empty state for somebody who has sent
      nothing.
- [ ] Give the page no sidebar entry. `Send feedback` is an action, so it
      cannot carry children the way Teaching does, and a separate `Feedback`
      destination would sit beside it saying almost the same thing. Instead
      link to `/feedback` from two places in `FeedbackModal`: a `Your
      previous feedback` link under the form, and the success state, which
      reads `We'll post the outcome in Your feedback.` Following either link
      closes the modal. Test both links.

## Phase 6: Error boundary button

Last, because rendering the modal inside a failed tree is the fiddliest part.

- [ ] Add `Tell us what happened` beside `Reload page` in `ErrorFallback`
      (`frontend/src/components/error-boundary/ErrorBoundary.tsx`), opening
      the same modal with the error name and code just reported, so the
      submission and the logged error can be lined up. Render the modal from
      the fallback itself, and do not let the submit path assume router
      context is intact — the tree below has already failed.
- [ ] Tests: the fallback offers both actions; a story for the
      error-boundary variant of the modal.

## Decisions

- **A nav link, not a floating widget.** The audience is always signed in,
  so a nav link misses only the login page, where a widget collects spam.
  On mobile the nav is a drawer and a floating button would sit over video
  and case text on the smallest screens. And the widget's one advantage,
  context from proximity, does not exist here: route and breadcrumbs come
  from the router wherever the trigger sits. The error boundary button is
  not an exception to this — it sits on a screen that has already replaced
  everything else.

- **Sending is one click; checking is not in the sidebar.** A `Feedback`
  destination page with a Send button would match the other nouns in the
  sidebar, but sending from it means leaving the broken screen, so
  `getCurrentRoute()` records `/feedback` and the user can no longer see
  what they are describing. Sending happens far more often than checking,
  and only sending needs that context. The weakness is that nothing prompts
  a sender to go back and look; status-change notifications are the fix,
  and they would link straight to `/feedback`.

- **Operator-gated reading, not `manage_users`.** Feedback spans every
  organisation, and `manage_users` is scoped to a place. Reading it is
  operating the deployment, which is what `platform_role` answers. The
  earlier draft gated on `system_permissions`, which no longer exists.

- **Deferred: email on submission.** Polling the admin page is enough at
  current volumes.

- **Deferred: notifying the sender when status changes.** Push is not fully
  built yet. Until it is, senders only see an outcome if they go to
  `/feedback`.

- **Deferred: replying in-app.** The status records the outcome; a reply
  channel needs the messaging feature.

- **Rejected: screenshots.** A screenshot of a clinical screen is patient
  data by default, and the consent and retention questions outweigh the
  benefit.

- **Rejected: signed-out feedback.** Users who cannot sign in have the
  support email address.

- **Open: retention period.** The patient-data position needs one; ninety
  days unless use suggests otherwise.

- **Open: learner and staff submissions together.** The link is ungated on
  purpose, so the admin list mixes both, and they may deserve different
  handling.

- **Open: the category set.** Four options is a guess. If everything arrives
  as `Something else`, drop the field rather than expand it.
