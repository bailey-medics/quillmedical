# What protects an exam in progress

One rule runs through the frontend: **nothing may disturb an exam between
starting it and seeing its result.** A learner part-way through a timed
attempt must not have the page reload under them, fail to load its next
screen, or be pulled somewhere else.

No single file keeps that rule. About ten each keep a piece of it, and
each piece was added by hand. This page lists them, names the one
deliberate exception, and says what somebody adding new background
behaviour has to check.

It was written from `frontend/src/routes.tsx`,
`frontend/src/features/teaching/teachingChunk.ts`,
`frontend/src/features/teaching/pages/AssessmentAttempt.tsx`,
`frontend/src/lib/prefetchFeatures.ts`, `frontend/src/lib/FeaturePrefetch.tsx`,
`frontend/src/lib/swUpdateGate.ts`,
`frontend/src/lib/compat-generation/ForcedReloadProvider.tsx`,
`frontend/src/components/layouts/TeachingLayout.tsx` and
`frontend/src/components/layouts/MainLayout.tsx`. The reasons are the ones
in those files' comments.

## The flag everything reads

A route says it is safe to interrupt with `handle: { safeForReload: true }`
in `routes.tsx`. A route without the flag is unsafe by default.

Two teaching routes leave it off on purpose:

- `/teaching/assessment/:id` - the attempt itself, `AssessmentAttempt`
- `/teaching/assessment/:id/result` - its result, `AssessmentResultPage`

Every other teaching route has it. [Client updates](../frontend/client-updates.md)
describes the flag in general; what follows is what it buys an exam.

## What keeps the rule

### No code is fetched during an exam

Teaching is **one lazy chunk**. `teachingChunk.ts` exports every learner
page, and every `/teaching` route loads that one module through
`loadTeaching`. So by the time an exam starts, the attempt page, the
result page and everything between them are already in the browser.

The comment in `teachingChunk.ts` gives the reason: a fetch that failed
between starting an exam and seeing its result could not be recovered
without losing the attempt. A page added to teaching is exported from that
file, never given a `lazy` of its own.

### Background prefetch will not start

`prefetchFeatures.ts` fetches other features' files in the background, so
the first click into each is instant. `mayPrefetch` lets nothing start
unless the current route is safe to reload, and `FeaturePrefetch` reads
that from the leaf route's flag. The exam is not safe, so nothing starts
during one.

It also fetches with `fetch()`, not `import()`. A failed `fetch()` cannot
fire `vite:preloadError`, so it can never reach the recovery that reloads
the page.

### A new build waits

`swUpdateGate.ts` activates a waiting service worker, and reloads the
page, only when the current route is safe. On an exam route the update is
left waiting. The check runs again on every navigation, so the update
lands once the learner reaches a safe page.

### A missing chunk does not reload the page

If a lazy chunk cannot be fetched, the same file decides between `reload`
and `defer`. On an unsafe route it always defers: the error is shown, and
the tab stays where it is.

### The ribbon fetches nothing

The exam runs in `TeachingLayout`. That layout normally puts `RibbonInbox`,
the count of what is waiting on somebody, at the right of the ribbon.
`AssessmentAttempt` passes its own `ribbonRight`, the timer and the close
button, which takes that slot. So the inbox is not mounted and does not
poll during an attempt.

`MainLayout` has the same rule behind its `examMode` prop, which leaves
the inbox out and hides the navigation. Nothing sets `examMode` today,
because no exam runs in that layout.

### The learner cannot leave by accident

`AssessmentAttempt` guards its own exits while the intro or the questions
are showing:

- `useBlocker` stops a navigation inside the app, unless it stays within
  `/teaching/assessment/`
- a `beforeunload` handler makes the browser ask before the tab is closed
  or refreshed

### An attempt can be picked up again

The attempt lives on the server, not in the page. Opening
`/teaching/assessment/:id` for an attempt that exists asks the API for it
and for its current question, and carries on from there. An attempt that
is already complete goes straight to its result. So a tab that is lost
despite all of the above costs time on the clock, not the answers already
given.

## The one exception

**A forced reload for an API compatibility change ignores the flag.**
When the backend says this tab's build speaks a contract it no longer
honours, `ForcedReloadProvider` shows the "Updating" overlay, saves any
form state, and reloads, whatever route is showing. It does not ask
whether the route is safe.

That is the right way round. A tab in that state cannot submit an answer
anyway: `api` refuses every change while the reload is pending. The
attempt is picked up again from the server after the reload.
[API compatibility](../backend/api-compatibility.md) covers when a release
forces this.

## Adding something new

The rule holds only because each piece above was written to keep it. A new
feature does not inherit it. Before adding any of these, check it against
an exam:

- **A background fetch, a poll or a timer** - gate it on the route being
  safe to reload, as `mayPrefetch` does.
- **Something in a layout's ribbon or shell** - `TeachingLayout` renders
  during an exam, so anything mounted there runs during one unless it is
  left out, as `RibbonInbox` is.
- **A new teaching page** - export it from `teachingChunk.ts`. A separate
  `lazy` breaks the one-chunk rule, and no test fails when it does.
- **A modal that opens by itself** - the
  [install prompt plan](../plans/2026-09-26-pwa-install-prompt-plan.md)
  says the prompt will read the same flag. That step is not yet built.

## Not recorded

The plan that added the leave guards also proposed catching the browser's
back button with a `popstate` handler. `AssessmentAttempt` has none, and
why it was left out is not written down.
