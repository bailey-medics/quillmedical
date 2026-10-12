# A session and a request, seen from the browser

This page follows two things through the frontend: how a page load becomes
a signed-in screen, and what happens to every request on its way to the
API and back. Each step is clear in its own file. What no file shows is the
order, or the rules near the end.

It was written from `frontend/src/lib/api.ts`, `frontend/src/lib/csrf.ts`,
`frontend/src/auth/AuthContext.tsx`, `frontend/src/auth/RequireAuth.tsx`,
`frontend/src/auth/GuestOnly.tsx` and `frontend/src/main.tsx`. The reasons
given are the ones in those files' comments.

## From a page load to a signed-in screen

1. `main.tsx` mounts the providers, outermost first:
   `ConnectivityProvider`, `ForcedReloadProvider`, `AuthProvider`, then the
   router.
2. `AuthProvider` starts in the state `loading` and at once asks
   `GET /api/auth/me`.
3. A reply puts it in `authenticated`, holding the user. Any failure puts
   it in `unauthenticated`. A 401 here is expected: it is how the app
   learns nobody is signed in.
4. The route guards wait on that answer. `RequireAuth` shows a spinner
   while the state is `loading`, then renders the page or sends the visitor
   to `/login`. `GuestOnly` renders nothing while loading, then shows the
   login or register page, or sends a signed-in person to the home page.

The session itself is not in JavaScript. The backend sets it in HTTP-only
cookies, which the page cannot read. The one cookie the page can read is
`XSRF-TOKEN`, described below.

## What `api` does to every request

`api.get`, `api.post` and the rest all go through `request` in `api.ts`,
which does these things in this order.

1. **Refuses when offline.** If the browser reports no connection, it
   fires the `app:network-error` event and throws, without sending
   anything.
2. **Refuses a change while a reload is pending.** When the backend has
   said this tab is on an out-of-date build, every request but a `GET`
   throws. See [Client updates](client-updates.md).
3. **Sets the content type.** JSON by default. A `FormData` body, which
   carries a file, gets no content type, because only the browser can
   write the multipart boundary.
4. **Adds the CSRF header.** For anything but a `GET`, it copies the
   `XSRF-TOKEN` cookie into an `X-CSRF-Token` header. Another site can make
   the browser send the cookie, but cannot read it to fill the header in.
5. **Sends the request** to `/api` plus the path, with cookies.
6. **Checks the compatibility header** on the reply, which is how an old
   tab finds out it must reload.
7. **Leaves a breadcrumb** for error reports: the method, the path reduced
   to a pattern, and the status. No body and no identifier from the URL.
8. **On a 401, tries one silent refresh.** It posts to
   `/api/auth/refresh` and, if that succeeds, sends the original request
   once more. It never tries twice.
9. **On a 401 that survives, says the session has ended**, by firing
   `UNAUTHENTICATED_EVENT` on `window`. It does not navigate. See "A
   session that ends" below.
10. **Turns a failure into an `Error`**, as the next section describes.
11. **Fires `app:api-success`**, which the connectivity banner listens
    for, and returns the parsed JSON. A reply that is not JSON is thrown
    as an error even with a 200, so a proxy's HTML page is never taken for
    data.

`api.blob`, for downloads such as a PDF, follows the same path but returns
the bytes, leaves no breadcrumb, fires no event on a 401, and throws
only `HTTP <status>` on a failure.

### The error a caller catches

A failed request throws an `Error` with three extra fields:

- `status` - the HTTP status, always set
- `error_code` - set when the backend sent one, in `detail.error_code` or
  at the top level
- `email` - set when the backend sent one inside `detail`

The message comes from the backend's `detail`: the string itself, or its
`message` when `detail` is an object. `LoginPage` reads `error_code` to
decide what to do next.

### A request that cannot go through `api`

An upload that reports its progress is sent with `XMLHttpRequest`. It must
add the CSRF header itself, with `csrfHeader()` from `lib/csrf.ts`, and it
gets none of the steps above.

## A session that ends

**The API client never sends the browser anywhere.** It reports, and the
route's guard decides.

1. A request comes back 401 and the silent refresh does not help.
2. `request` fires `UNAUTHENTICATED_EVENT` and throws.
3. `AuthProvider` hears it and puts the state in `unauthenticated`.
4. The guard on the route reacts. `RequireAuth` sends the person to
   `/login`, passing the page they were on so that signing in returns them
   to it. A route with no guard does nothing, so somebody reading a public
   page stays where they are.

So **whether a page is open to somebody not signed in is said in one
place: its route has no `RequireAuth`.** Nothing else has to agree.

It was not always so. The client used to redirect to `/login` itself on
any 401, and `AuthProvider` asks `/api/auth/me` on every page load, where
a 401 is simply the answer for a signed-out visitor. So the client carried
a list of pages to spare, kept in step by hand with the routes that had no
guard. That list was forgotten three times: for the invited assessor's
page, the public guides and the newsletter unsubscribe link.

What can still go wrong is leaving the guard off by mistake, and that
fails open: the page is public. `frontend/src/routes.test.ts` covers it.
Every top-level route must be behind `RequireAuth`, behind `GuestOnly`, or
named in that test as open to anybody, with the reason.

## Rules kept by convention

### `login()` does not set the signed-in state

After a successful login, `AuthContext.login` returns the user and leaves
the state as it was. `LoginPage` then does a full page navigation, and the
new page's `AuthProvider` picks the session up from `/api/auth/me`.

Setting the state there would make `GuestOnly`, which wraps the login
page, redirect to the home page at once, racing `LoginPage`'s own choice
of where to go.

### Logging out forgets where you were

When a session expires, `RequireAuth` passes the current location to
`/login`, so signing in again returns the person to the page they were on.

After an explicit logout it does not. `logout()` marks the state
`loggedOut`, and `RequireAuth` then passes nothing. The comment gives the
reason: the next person to sign in on that tab would otherwise be sent to
whatever page the last user was viewing, which leaks patient information.

## Why the root route holds three things

`main.tsx` hangs every route tree off one pathless route, which carries
`FeaturePrefetch`, `RouteTracking` and the `errorElement`.

- **Route tracking** used to sit in `RootLayout`, inside `RequireAuth`, so
  the sign-in pages, the 404 and the whole `/teaching` tree reported errors
  with no route at all.
- **Feature prefetch** must see every tree's routes, for the same reason.
- **The error element** is there because a lazy chunk that cannot be
  fetched is rejected inside the router, where no `ErrorBoundary` in a
  layout can catch it.

A tree added later inherits all three.

## Not recorded

Why the providers are in that order is not written down in `main.tsx`.
