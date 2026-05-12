# Offline detection plan

Detect when the network is unavailable and communicate it clearly to the user. Block all navigation and write actions while offline. No offline mode — the app requires connectivity to function.

## Decision

**No offline functionality.** This is a clinical healthcare application — serving stale patient data, letters, or appointments offline is a safety risk. When connectivity is lost, the user can still _read_ what is already rendered, but all navigation and mutations are blocked until the connection is restored.

## Current state

- No offline or network-error handling exists in the frontend
- API client (`api.ts`) handles 401 refresh but not network failures — a `fetch` `TypeError` (offline) is unhandled
- App provider tree: `MantineProvider` → `AuthProvider` → `RouterProvider`
- `/api/health` backend endpoint already exists (checks FHIR + EHRbase service health)
- Service worker is registered for PWA but has no offline fallback
- Existing patterns: `AuthContext` (context/provider/hook), `NavigationDrawer` (Mantine `Overlay` with z-index), `StateMessage` (status cards), `ErrorBoundary` (global error catch)
- `ButtonPair` is the standard save/cancel pattern with `aria-disabled` support
- `useBlocker` from React Router is used by `DirtyFormNavigation` to intercept route changes
- `ConfirmModal` exists as a reusable modal component
- `AppTooltip` exists for consistent tooltips

## Architecture

### Connectivity hook: `useConnectivity()`

Located in `frontend/src/lib/connectivity/`.

React context modelled on `AuthContext`:

- **State**: `{ isOnline: boolean; isChecking: boolean; lastSyncedAt: Date | null; showOfflineModal: boolean }`
- **Init**: read `navigator.onLine` on mount
- **Browser events**: subscribe to `window` `online`/`offline` events
  - On `offline` → immediately set `isOnline = false`
  - On `online` → run health check before marking online (browser `online` event only confirms local NIC state, not backend reachability)
- **API events**:
  - Listen for `app:network-error` DOM event (dispatched by `api.ts` on `fetch` `TypeError` or pre-check failure) → trigger health check + set `showOfflineModal = true`
  - Listen for `app:api-success` DOM event (dispatched by `api.ts` on every successful response) → update `lastSyncedAt`
- **Auto-poll**: when offline, poll `GET /api/health` every 10 seconds for automatic recovery
- **Debounce**: wait 1 second before flipping to offline state to avoid flicker on brief blips
- **Expose**: `useConnectivity()` hook returning `{ isOnline, isChecking, lastSyncedAt, showOfflineModal, dismissOfflineModal, retry }`
- **Health check**: `GET /api/health` — already exists in backend, confirms full-stack connectivity

### OfflineStrip (`frontend/src/components/offline-strip/`)

Thin horizontal strip rendered below the `TopRibbon` header, above the main content area:

- Approximately 28-32px tall, positioned in `MainLayout` between the `<header>` and the content `<Flex>`
- Adds to layout flow (not overlay) — pushes content down
- Visible only when offline or in "reconnected" state. Animates in/out with a short fade (150-200ms)
- **White background, dark grey text** (can be refined later)
- Content: `IconWifiOff` icon, message "No connection to Quill — reconnecting…", and "Last synced HH:MM" timestamp
- Accessibility: `role="status"`, `aria-live="polite"` (not `role="alert"`)
- Pure presentational component — accepts props, no context dependency
- Stories and tests required

**Reconnected state**: When connectivity is restored, the strip shows a "Reconnected" confirmation message (e.g. success colour). This **persists until the next page navigation or reload** — a clinician may be busy talking to a patient and not notice the state change immediately. They see the "all clear" when they next interact.

### OfflineModal (`frontend/src/components/offline-modal/`)

Contextual modal shown when a user **attempts an action** while offline:

- Mantine `Modal` with `IconWifiOff` icon, heading, description, and single "OK" dismiss button
- Triggered by: any navigation attempt (caught by `useBlocker`) or any API call attempt (caught by `api.ts` pre-check)
- Message: "Quill is offline. Your text is preserved in this form. Reconnect to save."
- Single "OK" button to dismiss (no cancel/proceed — the action is blocked regardless)
- Not ambient — only appears in response to user action
- Pure presentational — `opened` and `onClose` props

### Guest route status message (login, register, forgot-password) — These routes don't have `MainLayout`/`TopRibbon`, so the strip has nowhere to sit:

- Render a `StateMessage` (or similar inline status component) within the guest form, informing the user the app is offline
- Message: "Quill is offline. Please check your connection to log in."
- Buttons on guest forms are blocked by the `api.ts` pre-check — any login/register attempt fires `app:network-error` → OfflineModal appears
- No full-viewport overlay — just a clear inline message within the form

### Background tint

When offline, shift the app body background colour one shade in the primary scale:

- **Light mode**: `white` → `primary.0` (very pale blue tint)
- **Dark mode**: `primary.8` → `primary.7` (slightly lighter navy)
- Applied via a CSS class or `data-offline` attribute on the app root, toggled by `ConnectivityProvider`
- Purpose: peripheral-vision awareness, not alarm
- The `TopRibbon` is naturally excluded (uses its own navy background class, unaffected by body colour changes)
- WCAG AA contrast ratios must remain valid (4.5:1 normal, 3:1 large text) — both primary.0 and primary.7 are subtle shifts that preserve contrast

### Navigation blocking (authenticated routes)

All route changes are blocked while offline via React Router's `useBlocker`:

- Single `useBlocker` hook in `RootLayout`, gated on `!isOnline`
- Catches ALL navigation: SideNav links, `<Link>` components, `useNavigate()` calls, cancel buttons that navigate, browser back/forward
- When blocked → set `showOfflineModal = true` in connectivity context, then reset the blocker
- Zero changes needed to individual pages, `SideNav`, or `ButtonPair`

### Mutation blocking (all routes)

**No buttons are individually disabled.** Instead, mutations are caught at the API layer:

- `api.ts` pre-checks `navigator.onLine` before making any `fetch` call
- If offline → immediately dispatch `app:network-error` and throw an error (never hits the network)
- The connectivity context listens for `app:network-error` → sets `showOfflineModal = true`
- The form's own error handling catches the rejection too, but the modal gives the user the clear "you're offline" message
- This covers ALL API calls (not just ButtonPair) with zero per-page or per-button changes

### API client integration

In `api.ts`, three changes to keep it decoupled from React context:

**Pre-check before fetch** (immediate offline rejection):

```ts
if (!navigator.onLine) {
  window.dispatchEvent(new Event("app:network-error"));
  throw new Error("No network connection");
}
```

**On network failure** (catch actual fetch errors):

```ts
try {
  const res = await fetch(url, init);
  // ...existing handling...
} catch (err) {
  if (err instanceof TypeError) {
    window.dispatchEvent(new Event("app:network-error"));
  }
  throw err;
}
```

**On successful response** (lastSyncedAt tracking):

```ts
// After confirming res.ok or before returning data:
window.dispatchEvent(new Event("app:api-success"));
```

## Integration

In `main.tsx`, add `ConnectivityProvider` inside `MantineProvider` but outside `AuthProvider`:

```
MantineProvider
  └─ ConnectivityProvider
       └─ AuthProvider
            └─ RouterProvider
```

**Authenticated routes** (inside `RootLayout`):

```
<MainLayout>
  <OfflineStrip />        ← in MainLayout, between header and content
  <NavigationBlocker />   ← useBlocker + OfflineModal trigger
  <OfflineModal />        ← reads showOfflineModal from context
  <ErrorBoundary>
    <Outlet />
  </ErrorBoundary>
</MainLayout>
```

**Guest routes** (login, register, forgot-password):

```
<GuestOnly>
  <LoginPage />   ← form includes inline offline status message via useConnectivity()
</GuestOnly>
```

**Mutations on all routes** are caught by `api.ts` pre-check → `app:network-error` event → `showOfflineModal` in context.

## Implementation guide

Build component-first in Storybook, validate visually and with tests, then integrate into the app.

### Step 1: Register icons

`IconWifiOff` already registered in `appIcons.ts`. Also register `IconWifi` or `IconCheck` for the "reconnected" state.

### Step 2: Build OfflineStrip component (isolated)

Pure presentational component with props:

- `lastSyncedAt: Date | null` — timestamp of last successful API call
- `state: "offline" | "reconnected"` — controls message and colour

White background, dark grey text. No context dependency — Storybook-friendly.

### Step 3: Create OfflineStrip stories

| Story              | Description                                                              |
| ------------------ | ------------------------------------------------------------------------ |
| `JustWentOffline`  | Strip with "No connection to Quill — reconnecting…" and recent timestamp |
| `SustainedOffline` | Strip with stale `lastSyncedAt` (e.g. 15 minutes ago)                    |
| `Reconnected`      | Strip with "Reconnected" confirmation message, success colour            |
| `DarkMode`         | Offline state in dark colour scheme                                      |

### Step 4: Create OfflineStrip tests

- Renders offline message when `state="offline"`
- Renders reconnected message when `state="reconnected"`
- Shows formatted `lastSyncedAt` timestamp
- Has correct `role="status"` and `aria-live="polite"`

### Step 5: Build OfflineModal component (isolated)

Mantine `Modal` with icon, heading, description, and single "OK" dismiss button. Pure presentational:

- `opened: boolean`
- `onClose: () => void`

### Step 6: Create OfflineModal stories and tests

- Story: modal open with offline message
- Tests: renders message, close button works

### Step 7: Validate in Storybook

```sh
docker exec quill_frontend sh -lc "yarn storybook:build"
```

### Step 8: Create ConnectivityContext

`frontend/src/lib/connectivity/ConnectivityContext.tsx` + `index.ts`:

1. Context with `{ isOnline, isChecking, lastSyncedAt, showOfflineModal, dismissOfflineModal, retry }` shape
2. Provider reads `navigator.onLine` on mount
3. Subscribe to `window` `online`/`offline` events
4. Subscribe to `app:network-error` and `app:api-success` events
5. Health check: `GET /api/health` with 5s timeout
6. 1s debounce before showing offline state
7. Auto-poll every 10s when offline
8. Track `lastSyncedAt` from `app:api-success` events
9. Track "reconnected" state: set when transitioning from offline → online
10. `showOfflineModal` state: set by `app:network-error` event and navigation blocker

### Step 9: Create ConnectivityContext tests

- Initial state matches `navigator.onLine`
- Responds to `offline`/`online` events
- 1s debounce before marking offline
- `lastSyncedAt` updates on `app:api-success` event
- `showOfflineModal` set on `app:network-error` event
- Auto-poll when offline
- `retry()` triggers health check

### Step 10: Add DOM event dispatches to api.ts

- Pre-check `navigator.onLine` before `fetch` — throw immediately if offline
- `app:network-error` on `fetch` `TypeError` or pre-check failure
- `app:api-success` on successful response

### Step 11: Wire navigation blocker in RootLayout

Create `NavigationBlocker` component:

- Uses `useBlocker` gated on `!isOnline` from `useConnectivity()`
- When blocked → set `showOfflineModal = true`, reset blocker (stay on current page)
- `OfflineModal` reads `showOfflineModal` from context and renders accordingly

### Step 12: Wire OfflineStrip into MainLayout

- Render between header and content area
- Connect to `useConnectivity()` for state and `lastSyncedAt`
- Animate in/out with CSS transition
- Clear "reconnected" state on route change (listen to `location.pathname`)

### Step 13: Add inline offline message to guest forms

- In `LoginForm`, `RegistrationForm`, `ForgotPasswordForm`: check `useConnectivity().isOnline`
- When offline, render a `StateMessage` above the form fields: "Quill is offline. Please check your connection to log in."
- Mutation attempts are already caught by `api.ts` pre-check → OfflineModal appears

### Step 14: Add background tint

- Light mode: `white` → `primary.0` when offline
- Dark mode: `primary.8` → `primary.7` when offline
- Apply via `data-offline` attribute on app root, toggled by `ConnectivityProvider`
- CSS rule: `[data-offline] { --mantine-color-body: var(--mantine-color-primary-0); }` (plus dark variant)
- TopRibbon excluded (uses own background)

### Step 15: Integrate ConnectivityProvider into main.tsx

- Wrap inside `MantineProvider`, outside `AuthProvider`

### Step 16: Run all tests

```sh
docker exec quill_frontend sh -lc "yarn unit-test:run"
docker exec quill_frontend sh -lc "yarn storybook:build"
```

### Step 17: Manual integration testing

| Test                                    | Expected                                                               |
| --------------------------------------- | ---------------------------------------------------------------------- |
| DevTools → Network → Offline            | Strip appears below ribbon after 1s debounce, background tint applies  |
| Click a SideNav link while offline      | OfflineModal appears, navigation blocked, stay on current page         |
| Click Submit/Save while offline         | API pre-check rejects, OfflineModal appears, form stays as-is          |
| Click Cancel (navigating) while offline | `useBlocker` catches it, OfflineModal appears                          |
| Reconnect network                       | Strip changes to "Reconnected", background tint clears                 |
| Navigate after reconnecting             | "Reconnected" strip disappears                                         |
| Stay on page after reconnecting         | "Reconnected" strip persists (clinician may be busy)                   |
| Go offline on `/login` page             | Inline status message appears in login form, submit shows OfflineModal |
| Go offline on `/register` page          | Inline status message appears in registration form                     |

## Scope

### Included

- Ambient offline indicator (OfflineStrip below TopRibbon, white bg, dark grey text)
- Subtle background tint when offline (primary.0 light / primary.7 dark)
- All navigation blocked while offline (via `useBlocker` in RootLayout)
- All mutations blocked while offline (via `api.ts` pre-check, no per-button changes)
- Contextual OfflineModal on attempted action (navigation or API call)
- Inline offline status message on guest routes (login, register, forgot-password)
- "Reconnected" confirmation that persists until page navigation
- `lastSyncedAt` timestamp tracking from successful API responses
- 1s debounce to avoid flicker on brief blips
- API client network-error + success event dispatching

### Excluded

- No offline data caching, mutation queueing, or background sync
- No service worker offline fallback page
- No progressive offline support or offline-capable features
- No differentiation between "no internet" and "server unreachable" (single message for v1)
- No special teaching/exam offline carve-out
- No session/auth expiry handling during disconnection (separate concern)
- No idempotency keys on mutations (separate backend concern)
- No individual button disabling — all blocking is at the action/API layer

## Existing component reuse

| Existing component    | Reused as         | Notes                                                       |
| --------------------- | ----------------- | ----------------------------------------------------------- |
| `DirtyFormNavigation` | Pattern reference | Same `useBlocker` + modal pattern, applied to offline state |
| `AppTooltip`          | Not needed        | No individual button disabling, so no tooltips needed       |

## Clinical safety note

The design preserves patient identification under all connectivity conditions (TopRibbon unaffected by offline state or background tint), surfaces system state via both foveal cue (strip) and peripheral cue (background tint), and prevents writes during offline state to avoid the clinician believing data has been saved when it has not. Navigation is also blocked to prevent routing to pages that would fail to load data. The "reconnected" strip persists until navigation to ensure busy clinicians notice the state change.

Hazard log entry to follow under CSO review.

<!-- CSO review required -->
