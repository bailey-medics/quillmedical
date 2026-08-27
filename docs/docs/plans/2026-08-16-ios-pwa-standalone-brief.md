# iOS PWA not entering standalone mode: diagnostic brief

**Date:** 2026-08-16
**Status:** Complete — fixed, see `fix(pwa): correct manifest scope/start_url to match SPA root`

## Task

The Quill Teaching web app at `teaching.quill-medical.com` is installed to the iOS home screen but does not run in standalone mode. Investigate the causes below, confirm which apply to this repository, and fix so that the app launches with no browser chrome.

## Symptom

On launching the installed app from the iOS home screen, a Safari View Controller bar is rendered above the page. It contains a close (X) button on the left, the domain `teaching.quill-medical.com` in the centre, and a page-settings control on the right. The bar persists across all in-app navigation, including pages that are clearly part of the app.

Pressing the X button dismisses the overlay and lands on the Quill 404 page.

## Background on the iOS behaviour

iOS home-screen web apps show this chrome when the current URL falls outside the manifest `scope`, or when iOS has no usable manifest at all. Once the app has handed off to Safari View Controller, iOS does not hand control back, so a single out-of-scope navigation at launch causes the bar to persist for the whole session.

The 404 on pressing X is a separate but related fault. X dismisses the overlay and returns to the underlying web app window, which is still on the URL it held at the moment of handoff. That is normally the manifest `start_url`. A 404 there indicates `start_url` resolves to a path that does not exist.

## What has already been ruled out

Deleting the home screen icon and re-adding it did not resolve the issue. iOS caches the manifest at install time, so a stale cached manifest is not the cause. The fault is in what is currently being served.

## Hypotheses to check, in priority order

### 1. The manifest is not reachable or not parseable at install time

The most common cause. If iOS cannot fetch or parse the manifest, it falls back to web clip behaviour with no scope, and everything opens in the in-app browser.

Check:

- Request the manifest URL unauthenticated, from outside the app. Confirm HTTP 200, not a 302 to a login page and not a 401.
- Confirm the `Content-Type` response header is `application/manifest+json`.
- Confirm the manifest is not behind any authentication middleware, Cloud Run IAM policy, or route guard. If the manifest requires credentials, add `crossorigin="use-credentials"` to the `<link rel="manifest">` tag, though excluding it from auth is the better fix.
- Confirm the manifest passes `JSON.parse` with no trailing commas or comments.

### 2. The `<link rel="manifest">` tag is not in the server-rendered HTML

If the app is a client-rendered SPA and the manifest link tag is injected by JavaScript after hydration, iOS may not see it when the user adds the app to the home screen.

Check:

- `curl` the start URL and grep the raw HTML response for `rel="manifest"`. It must be present in the initial server response, inside `<head>`.
- Confirm the `href` resolves correctly. A relative href resolves against the current document URL, so a manifest link of `manifest.webmanifest` on a page at `/modules/123` resolves to `/modules/manifest.webmanifest`. Use a root-relative path.

### 3. `scope` and `start_url` are wrong or absent

Check the manifest contains, at minimum:

```json
{
  "start_url": "/",
  "scope": "/",
  "display": "standalone"
}
```

Notes:

- `scope` is a same-origin prefix match. Any subdomain difference counts as a different origin. If `scope` or `start_url` point at `quill-medical.com` or `www.quill-medical.com` rather than `teaching.quill-medical.com`, every page in the app is out of scope.
- `display` must be `standalone` or `fullscreen`. A value of `browser`, or a missing key, produces browser chrome.
- If `display_override` is present, check its first supported value. It takes precedence over `display`.

### 4. The authentication flow performs a cross-origin top-level redirect

The screenshot shows an authenticated session (`mark.bailey.superadmin`). If login redirects to a different origin and back, that top-level navigation is out of scope and triggers the handoff at launch, before the user sees anything.

Check:

- Trace the full redirect chain on cold launch, from `start_url` through to the authenticated landing page. Every hop must stay on `teaching.quill-medical.com`.
- If an external identity provider is involved, move the flow to a same-origin callback, a popup, or a backend-mediated exchange rather than a top-level redirect.

### 5. `start_url` 404s

This is what the X button is exposing.

Check:

- Request the exact `start_url` value from the manifest, both authenticated and unauthenticated. Confirm 200 or a same-origin redirect to a 200.
- Watch for a `start_url` carrying a query string such as `?source=pwa` that the router does not have a matching route for.
- Watch for a `start_url` pointing at a path that has been renamed since the manifest was written.

## Supporting checks

- Confirm `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="mobile-web-app-capable" content="yes">` are present in the server-rendered head. Recent iOS should honour the manifest alone, but these cost nothing.
- If a service worker is registered, confirm its scope covers `/` and that it is not serving a cached 404 for `start_url`.
- Confirm the app was added to the home screen from Safari. Third-party browsers on iOS can produce different web clip behaviour.

## Acceptance criteria

1. Launching the app from the iOS home screen shows no top bar and no URL.
2. Navigating through the teaching modules, logging in, and logging out all keep the app in standalone mode.
3. `window.navigator.standalone` returns `true`, and `window.matchMedia('(display-mode: standalone)').matches` returns `true`, when checked from within the launched app.
4. The manifest `start_url` returns 200 when requested directly.

## Verification method

Attach the iPhone to a Mac and use Safari Web Inspector (Develop menu, select the device, select the web app context). This attaches to home-screen web apps as well as to Safari tabs, so console and network output from the launched app can be inspected directly.

After any manifest change, delete the home screen icon and re-add it before retesting, since iOS reads the manifest at install time.
