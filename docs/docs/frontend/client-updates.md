# How an open tab picks up a new build

A browser tab keeps the JavaScript it downloaded until it reloads, and a
session can last for weeks, because the refresh token renews itself. So after
a deploy there are tabs running an older build than the server. This page
says how those tabs catch up, and what somebody adding a route has to decide
because of it.

There are three separate mechanisms. No single file shows all three, and they
fail in opposite directions on purpose.

It was written from `frontend/src/lib/swUpdateGate.ts`, `frontend/src/sw.ts`,
`frontend/src/main.tsx`, `frontend/src/lib/compat-generation/`,
`frontend/src/lib/api.ts` and `frontend/vite.config.ts`.

## The rule for a new route

Every route answers one question: **is it safe to reload this page without
asking?**

- **Safe** means the page can be rebuilt from its URL alone: a dashboard, a
  list, a settings page, a read-only result. Reloading it gives the same page
  back, so nothing is lost.
- **Unsafe** means the page holds something the user would lose: an exam in
  progress, a half-written sign-off.

A safe route says so on its route object in `frontend/src/main.tsx`:

```tsx
{
  path: "/passport/logbook",
  lazy: () => import("./pages/passport/PassportLogbookPage"),
  handle: { safeForReload: true },
},
```

Three things follow, and none of them is enforced by a test or the compiler:

- **A route with no `handle.safeForReload` is unsafe.** That is the fail-safe
  default, so a new route never becomes reloadable by accident. The cost is
  that a route left without it never receives a silent update while it is on
  screen. Decide, do not leave it blank by default.
- **`handle` goes on the route object, never inside the lazily loaded
  module.** `isRouteSafeForReload` reads it before the module has loaded.
  Moved into the module, it silently makes the route unsafe.
- **Only the deepest matched route counts.** `isRouteSafeForReload` looks at
  the leaf, so a parent's `handle` does not make its children safe.

There is one list, not a list of safe routes and a second list of unsafe
ones. A route in an exam simply has no `handle`. The reasoning is recorded in
item 14 of the
[Alembic review and revisions plan](../plans/2026-08-09-alembic-review-and-revisions-plan.md).

A second key on `handle` is unrelated to reloading. `handle: { clinical: true }`
sits on the root of the clinical routes, and `usePageViewTracking` counts no
page view beneath it. It is read from any matched route, not only the leaf,
so a clinical route added later inherits the exclusion.

## 1. A new service worker is waiting

This is the ordinary path after a deploy.

The service worker in `frontend/src/sw.ts` does not take over on its own.
A new worker waits until the page posts `SKIP_WAITING` to it.
`wireUpdateChecks` in `swUpdateGate.ts` decides when to post it, and checks
at three moments:

- once when the page loads
- every time the matched route changes
- once an hour, for a tab that stays on one page

A check activates the waiting worker only when all of these hold:

- it is a production build
- the current route has `handle.safeForReload`
- no flash message is being carried in the navigation's state, because a
  reload would lose it
- this tab has not already reloaded for an update in this session
  (`quill-sw-update-reloaded` in `sessionStorage`), which stops a reload loop

If the check for an update fails, for example offline, nothing happens. A
failed check is never treated as an update.

When the worker activates it claims the page, the browser fires
`controllerchange`, and `wireControllerChangeReload` reloads. It ignores the
first `controllerchange` on a first visit, when a worker takes control of a
page that had none: nothing was updated, and reloading then emptied a login
form somebody had started typing in.

There is never a prompt. On an unsafe route nothing happens, and the check
runs again at the next navigation or the next hour.

## 2. The server says this build is too old

This path is for a breaking API change, where waiting for the next safe
route is not good enough. It is described in full in
[API compatibility](../backend/api-compatibility.md); this is the short form.

Each build carries a number, `CLIENT_COMPAT_GENERATION`, set at build time.
The backend sends its own on every response in the `Compat-Generation`
header, and `checkCompatHeader` in `frontend/src/lib/api.ts` compares them.

- **Equal**: nothing to do.
- **The server is behind**: a deploy is still rolling out. Nothing is done.
- **The header is missing or not a number**: unknown, and nothing is done.
- **This build is behind**: every request that is not a `GET` is refused from
  then on, and `ForcedReloadProvider` takes over.

`ForcedReloadProvider` saves what is typed into the page, shows a blocking
"updating" overlay briefly and reloads. If the reload does not fix it, or the
tab is offline, it shows a banner instead and checks again every five
minutes with a real request. It never reloads blind.

This path does not look at `handle.safeForReload`. A build the server cannot
talk to is not safe to keep using, whatever the route.

## 3. A page's code is no longer there

Most pages are loaded on demand. A tab from before a deploy asks for a file
name the server stopped serving, and the navigation fails. Vite reports this
as a `vite:preloadError` event.

The JavaScript is not held by the service worker: `globPatterns` in
`frontend/vite.config.ts` caches logos and icons only, and there is no
offline fallback page. So without recovery the result is a dead page.

`wirePreloadErrorRecovery` decides between two outcomes:

- **Reload**, when the route the user is on is safe and no flash message is
  in flight. Typed text is saved first, then the page reloads and the
  navigation completes against the current build.
- **Defer**, when reloading would destroy something. The error is let
  through, and the nearest `ErrorBoundary` shows its fallback with a reload
  button.

It also defers if this tab already made a recovery reload in the last 60
seconds. A reload that did not fix the problem fails again within seconds, so
another would spin. A stale file hours later is a new deploy, and reloading
is the right answer again. That is why the guard stores a time and not a
flag.

This guard uses its own key, `quill-preload-reloaded`. Sharing the service
worker's key would let one kind of reload silently suppress the other.

## Why the two route checks fail in opposite directions

Both the service worker check and the missing-code recovery ask whether the
route is safe. They treat doubt differently:

- **The service worker check defers when unsure.** The tab is working, and an
  update can wait an hour.
- **The missing-code recovery reloads when it can.** The navigation has
  already failed, so doing nothing is the worse outcome. It holds back only
  when a reload would actively destroy work.

## What is saved before a reload

`persistFormState` in `formStatePersistence.ts` is a best effort, not a
guarantee:

- it covers native text inputs and text areas only, not Mantine selects or a
  rich text editor
- a value is restored only to a field with exactly the same `name` or `id`,
  on the same path

That is why it sits behind the route check and does not replace it. A page
whose state lives anywhere else must stay unsafe.
