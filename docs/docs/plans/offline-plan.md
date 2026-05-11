# Offline detection plan

Detect when the network is unavailable, block app usage with a clear message, and provide a retry button. No offline mode — the app requires connectivity to function.

## Decision

**No offline functionality.** This is a clinical healthcare application — serving stale patient data, letters, or appointments offline is a safety risk. When connectivity is lost, the app blocks all interaction until the connection is restored.

## Current state

- No offline or network-error handling exists in the frontend
- API client (`api.ts`) handles 401 refresh but not network failures — a `fetch` `TypeError` (offline) is unhandled
- App provider tree: `MantineProvider` → `AuthProvider` → `RouterProvider`
- `/api/health` backend endpoint already exists (checks FHIR + EHRbase service health)
- Service worker is registered for PWA but has no offline fallback
- Existing patterns: `AuthContext` (context/provider/hook), `NavigationDrawer` (Mantine `Overlay` with z-index), `StateMessage` (status cards), `ErrorBoundary` (global error catch)

## Architecture

### NetworkContext (`frontend/src/lib/network/`)

React context modelled on `AuthContext`:

- **State**: `{ isOnline: boolean; isChecking: boolean }`
- **Init**: read `navigator.onLine` on mount
- **Browser events**: subscribe to `window` `online`/`offline` events
  - On `offline` → immediately set `isOnline = false`
  - On `online` → run health check before marking online (browser `online` event only confirms local NIC state, not backend reachability)
- **API error event**: listen for custom `app:network-error` DOM event (dispatched by `api.ts` on `fetch` `TypeError`) → trigger health check
- **Auto-poll**: when offline, poll `GET /api/health` every 10 seconds for automatic recovery — user doesn't need to manually retry
- **Expose**: `useNetwork()` hook returning `{ isOnline, isChecking, retry }`
- **Health check**: `GET /api/health` — already exists in backend, confirms full-stack connectivity

### OfflineOverlay (`frontend/src/components/offline-overlay/`)

Full-viewport blocking overlay, always mounted, self-conditionally renders:

- Fixed position, z-index above Mantine modals (z-index 300+)
- Semi-transparent backdrop over entire viewport
- Centred content:
  - `IconWifiOff` icon (registered in `appIcons.tsx`)
  - Heading: "You are offline"
  - Description: "Please check your internet connection. Quill requires an active connection to ensure patient safety."
  - "Retry connection" button — calls `retry()`, shows loading spinner while checking
- Only renders when `isOnline === false`
- CSS module for styling
- Stories (with forced offline state) and tests required

### API client integration

In `api.ts`, wrap the `fetch` call to catch `TypeError` (network failure) and dispatch a DOM event:

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

This keeps `api.ts` decoupled from React context — no React imports needed.

## Integration

In `main.tsx`, add `NetworkProvider` inside `MantineProvider` but outside `AuthProvider`:

```
MantineProvider
  └─ NetworkProvider
       ├─ OfflineOverlay        (always mounted, self-conditionally renders)
       └─ AuthProvider
            └─ RouterProvider
```

Covers both authenticated and guest routes (login, register, forgot-password).

## Steps

| #   | Task                                                              | Files                                                                       |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Create `NetworkContext` with provider and `useNetwork` hook       | `frontend/src/lib/network/NetworkContext.tsx`, `index.ts`                   |
| 2   | Register `IconWifiOff` in app icons                               | `frontend/src/components/icons/appIcons.tsx`                                |
| 3   | Create `OfflineOverlay` component with CSS module                 | `frontend/src/components/offline-overlay/OfflineOverlay.tsx`, `.module.css` |
| 4   | Create stories and tests for OfflineOverlay                       | `OfflineOverlay.stories.tsx`, `OfflineOverlay.test.tsx`                     |
| 5   | Integrate `NetworkProvider` and `OfflineOverlay` into `main.tsx`  | `frontend/src/main.tsx`                                                     |
| 6   | Add `TypeError` catch + `app:network-error` dispatch to `api.ts`  | `frontend/src/lib/api.ts`                                                   |
| 7   | Test: unit tests, storybook build, manual DevTools offline toggle | —                                                                           |

## Verification

- `docker exec quill_frontend sh -lc "yarn unit-test:run"` — component and context tests
- `docker exec quill_frontend sh -lc "yarn storybook:build"` — stories build
- Manual: DevTools Network → offline → overlay blocks all interaction
- Manual: reconnect → overlay clears automatically (10s poll) or immediately via retry button
- Manual: retry button shows loading spinner while health check runs
- Manual: overlay renders above open modals/drawers (z-index)
- Manual: overlay appears on guest routes (login page) as well as authenticated routes

## Scope

### Included

- Global offline detection via browser events + health check
- Blocking overlay preventing all app usage while offline
- Manual retry button + automatic 10s polling for recovery
- API client network-error detection via DOM event
- Single message for all connectivity failures (no internet, server down, etc.)

### Excluded

- No offline data caching, mutation queueing, or background sync
- No service worker offline fallback page
- No progressive offline support or offline-capable features
- No differentiation between "no internet" and "server unreachable" (single message for v1)
- No special teaching/exam offline carve-out (considered and rejected — keep it simple)

## Implementation guide

Build component-first in Storybook, validate visually and with tests, then integrate into the app.

### Step 1: Register the icon

Add `IconWifiOff` to `frontend/src/components/icons/appIcons.tsx`. Confirm it appears in the Icon stories in Storybook.

### Step 2: Build the OfflineOverlay component (isolated)

Create the component **without** any NetworkContext dependency first. Accept props directly so it can be developed and tested in Storybook independently:

```
frontend/src/components/offline-overlay/
  OfflineOverlay.tsx          — pure presentational component
  OfflineOverlay.module.css   — full-viewport fixed overlay styles
```

**Props (for Storybook development):**

- `isChecking: boolean` — whether retry is in progress (shows spinner on button)
- `onRetry: () => void` — callback when retry button is clicked

The component always renders when mounted — visibility is controlled by the parent (or context wrapper later). This keeps it a pure presentational component.

**Visual checklist for Storybook:**

- [ ] Full viewport coverage (fixed, inset 0)
- [ ] Semi-transparent dark backdrop
- [ ] Centred card/panel with icon, heading, description, button
- [ ] Button shows loading spinner when `isChecking = true`
- [ ] z-index above Mantine modals (300+)
- [ ] Looks correct in both light and dark colour schemes
- [ ] Responsive — works on mobile viewport

### Step 3: Create the Storybook stories

```
frontend/src/components/offline-overlay/OfflineOverlay.stories.tsx
```

Stories to create:

| Story      | Description                                                 |
| ---------- | ----------------------------------------------------------- |
| `Default`  | Overlay visible, idle state (button ready to click)         |
| `Checking` | Overlay visible, `isChecking = true` (button shows spinner) |
| `DarkMode` | Same as Default but in dark colour scheme                   |

Use `fn()` from `@storybook/test` for the `onRetry` action. Each story should demonstrate one clear state.

### Step 4: Create component tests

```
frontend/src/components/offline-overlay/OfflineOverlay.test.tsx
```

Test cases:

- Renders icon, heading, description text
- Retry button is present and clickable
- Clicking retry calls `onRetry` callback
- Button shows loading state when `isChecking = true`
- Button is disabled when `isChecking = true` (prevent double-click)

Use `renderWithMantine` from `@test/test-utils`.

### Step 5: Validate in Storybook

Build and visually review before proceeding:

```sh
docker exec quill_frontend sh -lc "yarn storybook:build"
```

Check in the running Storybook that:

- The overlay fills the viewport correctly
- The card is centred and readable
- The button interaction works (action logged)
- Dark mode variant looks correct

### Step 6: Create NetworkContext

```
frontend/src/lib/network/
  NetworkContext.tsx    — provider, context, useNetwork hook
  index.ts             — barrel export
```

Implementation:

1. Create context with `{ isOnline, isChecking, retry }` shape
2. Provider reads `navigator.onLine` on mount
3. Subscribe to `window` `online`/`offline` events
4. Subscribe to custom `app:network-error` event
5. Health check function: `GET /api/health` with a short timeout (5s)
6. On `offline` event → `isOnline = false`
7. On `online` event → run health check → set `isOnline` based on result
8. On `app:network-error` → run health check
9. When offline, start 10s interval polling health check; clear interval when online
10. `retry()` — manually trigger health check, set `isChecking = true` during request

### Step 7: Create NetworkContext tests

Test the context in isolation (no OfflineOverlay needed):

- Initial state matches `navigator.onLine`
- Responds to `offline` window event
- Responds to `online` window event (mock health check)
- Responds to `app:network-error` custom event
- `retry()` triggers health check and updates state
- Auto-poll starts when offline, stops when online

### Step 8: Create the connected wrapper

Create a thin wrapper component (or update OfflineOverlay) that connects the presentational overlay to NetworkContext:

```tsx
// In OfflineOverlay.tsx or a separate ConnectedOfflineOverlay.tsx
export function ConnectedOfflineOverlay() {
  const { isOnline, isChecking, retry } = useNetwork();
  if (isOnline) return null;
  return <OfflineOverlay isChecking={isChecking} onRetry={retry} />;
}
```

### Step 9: Add TypeError catch to api.ts

Wrap the `fetch` call in `api.ts` to dispatch the DOM event on network failure:

```ts
try {
  const res = await fetch(url, init);
} catch (err) {
  if (err instanceof TypeError) {
    window.dispatchEvent(new Event("app:network-error"));
  }
  throw err;
}
```

### Step 10: Integrate into main.tsx

Add `NetworkProvider` and `ConnectedOfflineOverlay` to the app provider tree:

```tsx
<MantineProvider ...>
  <NetworkProvider>
    <ConnectedOfflineOverlay />
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </NetworkProvider>
</MantineProvider>
```

### Step 11: Run all tests

```sh
docker exec quill_frontend sh -lc "yarn unit-test:run"
docker exec quill_frontend sh -lc "yarn storybook:build"
```

### Step 12: Manual integration testing

| Test                                   | Expected                                                       |
| -------------------------------------- | -------------------------------------------------------------- |
| DevTools → Network → Offline           | Overlay appears, blocks all clicks/navigation                  |
| Click "Retry connection" while offline | Button shows spinner, overlay stays                            |
| Reconnect network                      | Overlay clears within 10s (auto-poll) or immediately via retry |
| Open a modal, then go offline          | Overlay renders above the modal                                |
| Navigate to `/login`, then go offline  | Overlay appears on guest route                                 |
| Go offline during page load            | Overlay appears, no JS errors in console                       |
