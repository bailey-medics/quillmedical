# User feedback plan

## Context

Quill can see errors it throws, and nothing else.

The analytics plan built that first half well. `reportError` in
`frontend/src/lib/error-reporting/report.ts` catches unhandled React errors
via `ErrorBoundary` and global handlers, sanitises them, and posts them to
`POST /api/analytics/client-errors`, where they are logged as structured JSON
for Cloud Error Reporting to group. It uses `navigator.sendBeacon` rather than
the `api` client so that reporting an error can never cause one.

That machinery only fires when JavaScript throws. The failures that matter
most in a teaching application do not throw:

- a video plays but the captions are wrong
- a case renders but the content is inaccurate
- a button works but does the wrong thing
- an assessment is confusing rather than broken

No boundary catches any of those. Only a human can report them, and today
there is no way for them to do so. A delegate who spots a factual error in a
case has nowhere to put it.

There is a second gap alongside it. Error reports become log lines, and a log
line cannot be answered. If a learner reports a broken case and it is fixed,
they never find out, so they stop reporting. For a teaching product that
feedback loop closing is worth more than the volume of reports.

This plan adds one thing: a way for a signed-in user to type a message and
send it, and a way to read what they sent.

## Scope

In scope:

- A `Send feedback` nav link in the sidebar, above `Logout`
- A modal with one required free-text field
- Automatic capture of route, breadcrumbs and release alongside the message
- A `feedback` table in the core database, with a status
- An admin page listing submissions and allowing status changes
- A `Tell us what happened` button on the error boundary fallback

Out of scope, deliberately:

- **A floating widget.** Considered and rejected — see below.
- **Email notification on submission.** Worth adding once there is enough
  traffic to justify it; polling the admin page is sufficient at current
  volumes.
- **Replying to the user in-app.** The status field records the outcome for
  the reader. A reply channel needs the messaging feature and is a larger
  piece of work.
- **Screenshot capture.** Attractive, but a screenshot of a clinical screen is
  patient data by default, and the consent and retention questions it raises
  are out of proportion to the benefit.
- **Anonymous or signed-out feedback.** The link lives behind authentication.
  Users who cannot sign in have the support email address.

## Why a nav link and not a floating widget

A floating action button is the conventional answer and is wrong here, for
three reasons specific to this codebase.

- **The audience is always signed in.** `SideNavContent` renders behind
  `useAuth()`, but delegates and coordinators are authenticated users — that
  is the whole product. The only case a nav link misses is the login page, and
  a feedback widget on a login page collects spam, not feedback.
- **On mobile the nav is a drawer, so an overlay collides with content.**
  `NavigationDrawer` hides the nav behind a hamburger at `sm`. A floating
  button would sit permanently over teaching content — video players, case
  text — on exactly the screens with the least room to spare.
- **The context argument does not survive contact with the code.** Proximity
  to the problem is the widget's one real advantage, and it is supposed to buy
  automatic context. But `getCurrentRoute()` and `getBreadcrumbs()` already
  provide route and recent actions from anywhere in the app, and
  `SideNavContent` separately parses patient, user, org, site and module ids
  out of `location.pathname`. A modal opened from a nav link captures exactly
  what a floating button would, because the context comes from the router
  rather than from where the trigger sits.

What remains is the widget's cost: a permanent overlay, mobile collisions, and
a third competing UI layer beside the main sidebar and the teaching sidebar.

The error boundary fallback is the one exception, and it is not a floating
widget — it is a button on a screen that has already replaced everything else,
so none of the objections apply.

## Why a table and not the existing log pipe

Client errors are logged rather than stored, and that is right for them: high
volume, machine-grouped, read by one person with a dashboard.

User feedback is the opposite on every axis. It is low volume, each item is
individually meaningful, and the useful question is "what is still
outstanding?" — which a log cannot answer. A log line cannot be marked
resolved.

So feedback goes to a real table in the core database. This is the one place
this plan deliberately diverges from the pattern the analytics plan
established, and the divergence is the point.

It also means the submission path uses the ordinary `api` client, not
`sendBeacon`. `sendBeacon` is correct for a crash report, where there is no
answer worth having. It is wrong for someone who has just typed three
sentences: they need to see that it landed, or they will assume it did not and
either repeat themselves or give up.

## Patient data

Free text from a clinical application will contain patient data. Not
maliciously — someone describing a bug will paste what they were looking at.

The existing redactions in `sanitise.ts` are built for stack traces and error
messages. They will not reliably catch an NHS number written into a sentence,
and pretending otherwise would be worse than not trying.

So the approach is to assume the text may contain patient data and treat it
accordingly:

- A visible warning above the textarea: **Do not include patient details.**
- The stored text is treated as potentially patient-identifying: admin-gated
  read access, and never written to logs.
- Sanitisation is still applied to the automatically captured fields — route,
  breadcrumbs, release — which go through the existing helpers unchanged.
- A retention limit, so submissions do not accumulate indefinitely.

The message body itself is stored as typed. Redacting prose destroys the
report; the controls above are access and retention, not transformation.

## Frontend

### Nav link

Added in `SideNavContent.tsx`, directly above the `Logout` link and below the
`featureItems` map.

Ungated — no `hasClinicalServices` check, no competency gate. Everyone can hit
a bug.

- **Label**: `Send feedback`
- **Behaviour**: opens a modal, does not navigate

The verb matters. Every other entry in that sidebar is a noun naming a
destination — Home, Messages, Teaching, Passport, Settings, Admin. This one is
an action, and it sits directly above `Logout`, the sidebar's other verb.

`Feedback` on its own was rejected: it reads as a destination where feedback
would be viewed, which is wrong for a modal and would collide with the admin
page below, which is genuinely called Feedback.

`Report a problem` was rejected as too narrow — it suppresses the suggestions
half of what people would say.

### Icon

`IconMessageReport` — a speech bubble with an exclamation mark. Outbound, and
about something being wrong, which is the dual scope the label carries.

Registered as `"feedback"` in `NavIcon`. Two registries need updating:

In `frontend/src/components/icons/appIcons.ts` — add `IconMessageReport` to
the import, the re-export, and `iconCatalogue` as `MessageReport`. All three,
per that file's header comment.

In `frontend/src/components/icons/NavIcon.tsx` — add to the import from
`appIcons`, add `| "feedback"` to the `IconName` union, and add
`feedback: IconMessageReport` to `iconMap`.

Existing icons were considered and rejected: `IconMessage` is already the
Messages link in the same sidebar; `IconSend` is needed for the modal's submit
button; `IconAlertTriangle` and `IconExclamationCircle` belong to the error
vocabulary and would make the link look like a warning indicator; `IconMail`
implies email; `IconBell` is inbound.

### Modal

New component at `frontend/src/components/feedback/FeedbackModal.tsx`, with
`.stories.tsx` and `.test.tsx` alongside, per the component conventions.

A modal rather than a page, for two reasons: routing away loses the screen
being complained about, and if the user is mid-form it trips
`DirtyFormNavigation`. Keeping the broken thing visible behind the modal also
improves report quality, because people describe what they can see.

Contents:

- **Title**: `Send feedback`
- **Sub-line**: `Tell us what went wrong, or what would make this better.`
  This is where the scope is widened beyond bugs, which is why the label does
  not have to.
- **Category** — optional `SelectField`: `Something is broken`, `Something is
wrong or inaccurate`, `Suggestion`, `Something else`. Remember this is a
  Mantine `Select`, so tests query it as `role="combobox"`.
- **Message** — required `Textarea`, autofocused, with the patient-data
  warning directly above it
- **Actions** — `ButtonPair`, submit labelled `Send feedback` with `IconSend`

On submit, the component sends the typed fields plus the captured context, and
shows a success state in place of the form rather than closing immediately —
the confirmation is the thing the nav link route buys over `sendBeacon`, so it
should be visible.

Buttons right-justified on desktop, full-width stacked on mobile, which
`ButtonPair` already handles.

### Captured context

Gathered at submit time, not typed by the user:

- `route` — from `getCurrentRoute()`, the matched pattern, never a resolved URL
- `breadcrumbs` — from `getBreadcrumbs()`
- `release` — the same value the error reports carry
- `viewport` and `user_agent` — bounded as the error path bounds them

The user is attributed server-side from the session cookie, never from the
body. Same reasoning as the client-errors endpoint: a caller-supplied
identifier could be used to attribute feedback to anyone.

When the modal is opened from the error boundary, it also carries the error
name and code that was just reported, so the submission and the logged error
can be lined up.

### Error boundary

`ErrorFallback` in `frontend/src/components/error-boundary/ErrorBoundary.tsx`
currently offers only `Reload page`. Add a second action, `Tell us what
happened`, opening the same modal.

This is the highest-yield placement in the application: the user has certainly
hit a bug and is motivated right then. It needs care in one respect — the
boundary renders when the tree below it has already failed, so the modal must
not depend on anything that may be broken. It is rendered from the fallback
itself, and the submit path must not assume router context is intact.

## Backend

### Model

New `Feedback` model in `backend/app/models.py`, following the existing
conventions — `Mapped[...]` annotations, explicit `nullable`, `String` lengths
bounded.

Fields:

- `id` — integer primary key
- `user_id` — FK to `user.id`, nullable, set from the session cookie
- `category` — short string, constrained to the known set, nullable
- `message` — the typed text, length-bounded
- `route`, `release`, `viewport`, `user_agent` — captured context
- `breadcrumbs` — `JSON`
- `error_name`, `error_code` — nullable, set when raised from the boundary
- `status` — `new`, `acknowledged`, `resolved`, `wont_fix`; defaults to `new`
- `created_at` — timezone-aware, defaulting to now

`status` is what makes this a workflow rather than a pile. Without it the
table is a log with extra steps.

Then `just migrate "add feedback table"`, and read the generated `upgrade()`
and `downgrade()` before committing.

### Endpoints

Feedback is its own concern, so it gets its own router at
`backend/app/feedback/router.py` rather than joining the analytics one or
landing in `main.py`. Analytics ingests machine-generated telemetry into logs;
this stores human-written content in a table and reads it back. The analytics
router's own docstring gives the reasoning for keeping routers beside their
code.

`POST /api/feedback` — submit.

- Authenticated: `DEP_CURRENT_USER`. Unlike the client-errors endpoint, there
  is no case for accepting this from a signed-out caller — the value of
  feedback is knowing who sent it, and an open endpoint storing free text is
  an obvious abuse target.
- `DEP_REQUIRE_CSRF`, being a mutating endpoint.
- Rate-limited. Lower than the error endpoints — a person typing prose cannot
  legitimately submit often. `5/minute` is generous.
- Pydantic schema in `backend/app/schemas/feedback.py`, `extra='forbid'`,
  every field length-bounded, category constrained to a `Literal`.
- Validate before any work, per the fail-fast convention.
- Returns the created record's id, so the frontend can confirm.

`GET /api/feedback` — list, admin-gated.

`PATCH /api/feedback/{id}` — update status, admin-gated.

Both admin endpoints follow the existing gate pattern:
`if current_user.system_permissions not in ["admin", "superadmin"]: raise
HTTPException(403)`.

Note the endpoint must not log the message body. The whole point of the
patient-data position above is that the text is treated as potentially
identifying, and the analytics logging habit is the easy way to undo that
by accident.

## Admin page

New page under `frontend/src/pages/admin/feedback/`, following the shape of
the existing admin list pages.

- Lists submissions newest first, with status, category, who sent it, when,
  and the route they were on
- Filter by status, so `new` can be isolated
- Status can be changed inline
- Reached from the Admin section of the sidebar

This is the half that turns reports into a loop. Without somewhere to read and
close them, the table is write-only and the feature decays into the log pipe
it was supposed to improve on.

## Testing

Per the testing conventions — tests written alongside, run in Docker, targeted
rather than whole-suite.

Frontend, `just uf <path>`:

- `FeedbackModal` — renders, validates the required field, submits, shows the
  success state, handles a failed submission. Remember the `Select` is a
  combobox for query purposes, and that `argTypesRegex` will inject spies into
  unset handlers in stories unless they are explicitly `undefined`.
- `SideNavContent` — the link is present regardless of gating, and sits above
  `Logout`
- `ErrorBoundary` — the fallback offers both actions
- Stories for the modal, including the error-boundary variant

Backend, `just ub -k "feedback"`:

- Submission stores the record and attributes the user from the session
- Rejects unauthenticated callers
- Rejects missing CSRF
- Rejects over-length and extra fields
- Admin list and status update reject non-admin callers
- The message body does not appear in logs

Run `yarn typecheck:all` rather than bare `tsc --noEmit`, since the stories are
only covered by the former.

## Sequencing

Each step is a reviewable unit; the stack tooling suits this well.

1. **Icon registration** — `appIcons.ts` and `NavIcon.tsx`. Small, isolated,
   unblocks the frontend work.
2. **Backend model, migration and submit endpoint** — with tests. Nothing
   user-visible yet.
3. **Modal and nav link** — the feature becomes usable. Submissions land in the
   table.
4. **Admin list and status** — the loop closes.
5. **Error boundary button** — last, because it depends on the modal being
   able to render inside a failed tree, which is the fiddliest part.

Steps 1 and 2 are independent of each other and could be built in either
order.

## Open questions

- **Retention period.** The patient-data position requires one, but the right
  number depends on how the submissions get used. Ninety days is a reasonable
  default if nothing better suggests itself.
- **Whether `single-user` delegates should see the link.** The plan says
  ungated, which includes them. That is the intent — a delegate spotting a
  factual error in a case is exactly the report most worth having — but it
  means the admin list will carry learner submissions alongside staff ones,
  and they may deserve different handling.
- **Whether the category set is right.** Four options is a guess. It may turn
  out that everything arrives as `Something else`, in which case the field is
  not earning its place and should be dropped rather than expanded.
