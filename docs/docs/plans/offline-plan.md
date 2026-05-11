# Offline detection plan

Block app usage when the network is unavailable, showing a clear message and retry button.

## Current state

- No offline or network-error handling exists in the frontend
- API client ([api.ts](../../frontend/src/lib/api.ts)) handles 401 refresh but not network failures
- App provider tree: `MantineProvider` → `AuthProvider` → `RouterProvider`
- Existing patterns: `AuthContext` (context/provider/hook), `NavigationDrawer` (Mantine `Overlay` with z-index), `StateMessage` (status cards), `ErrorBoundary` (global error catch)
- Service worker is registered for PWA but has no offline fallback page

## Architecture

### NetworkContext (`frontend/src/lib/network/`)

React context modelled on `AuthContext`:

- **State**: `{ isOnline: boolean; isChecking: boolean }`
- **Init**: `navigator.onLine`
- **Events**: subscribe to `window` `online`/`offline` events
- On `offline` → set `isOnline = false`
- On `online` → confirm via `GET /api/health` before marking online
- Listen for custom `app:network-error` DOM event (dispatched by api.ts on fetch TypeError) → trigger health check
- **Auto-poll**: when offline, poll health endpoint every 10 seconds for auto-recovery
- **Expose**: `useNetwork()` hook returning `{ isOnline, isChecking, retry }`

### OfflineOverlay (`frontend/src/components/offline-overlay/`)

Full-viewport blocking overlay:

- Fixed position, z-index above Mantine modals (z-index 300+)
- Centred content: `IconWifiOff` icon, "You are offline" heading, "Please check your internet connection" description
- "Retry connection" button calls `retry()`, shows loading spinner while checking
- Only renders when `isOnline === false`
- CSS module for styling
- Stories and tests required

### API client integration

In `api.ts`, catch `TypeError` from `fetch` (network failure) and dispatch:

```ts
window.dispatchEvent(new Event("app:network-error"));
```

This keeps api.ts decoupled from React context while allowing NetworkContext to react to failed requests.

### Backend health endpoint

Trivial FastAPI route at `GET /api/health` returning `{"status": "ok"}` (200). Confirms full-stack connectivity — browser `online` event alone only detects local network state, not backend reachability.

## Integration

In `main.tsx`, add `NetworkProvider` inside `MantineProvider` but outside `AuthProvider`:

```
MantineProvider
  └─ NetworkProvider
       ├─ OfflineOverlay        (always mounted, self-conditionally renders)
       └─ AuthProvider
            └─ RouterProvider
```

This ensures offline detection covers both authenticated and guest routes.

## Steps

| #   | Task                                                              | Files                                                     |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Create `/api/health` backend endpoint                             | `backend/app/main.py`                                     |
| 2   | Create `NetworkContext` with provider and `useNetwork` hook       | `frontend/src/lib/network/NetworkContext.tsx`, `index.ts` |
| 3   | Create `OfflineOverlay` component with CSS module                 | `frontend/src/components/offline-overlay/`                |
| 4   | Create stories and tests for OfflineOverlay                       | `OfflineOverlay.stories.tsx`, `OfflineOverlay.test.tsx`   |
| 5   | Integrate NetworkProvider and OfflineOverlay into `main.tsx`      | `frontend/src/main.tsx`                                   |
| 6   | Add network-error dispatch to api.ts fetch catch                  | `frontend/src/lib/api.ts`                                 |
| 7   | Test: unit tests, storybook build, manual DevTools offline toggle | —                                                         |

## Verification

- `docker exec quill_backend sh -lc "pytest -q -m 'not integration'"` — health endpoint test
- `docker exec quill_frontend sh -lc "yarn unit-test:run"` — component tests
- `docker exec quill_frontend sh -lc "yarn storybook:build"` — stories build
- Manual: DevTools → offline → overlay blocks all interaction
- Manual: reconnect → overlay clears after health check
- Manual: retry button shows loading while checking
- Manual: overlay covers modals/drawers (z-index)

## Scope

### Included

- Global offline detection via browser events + health check
- Blocking overlay preventing all app usage while offline
- Manual retry button + automatic 10s polling for recovery
- API client network-error detection

### Excluded

- Offline data caching or mutation queueing
- Service worker offline fallback page
- Progressive offline support or data sync
- Differentiating "no internet" vs "server unreachable" (v1 uses single message)

## Open questions

1. **Auto-poll interval** — 10 seconds is the current recommendation. Too frequent wastes bandwidth; too slow delays recovery. Configurable?
2. **"Server unreachable" vs "No internet"** — Should we differentiate these messages in a future iteration? The health check catches both cases.
3. **Exam mode** — Should the overlay also block during exams, or should exams have special handling (e.g. cached questions)?
