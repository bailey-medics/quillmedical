# Hazard

**Hazard id:** Hazard-0023

**Hazard name:** Authentication state race condition on app mount

**Description:** AuthContext useEffect calls reload() on mount without cleanup or cancellation, causing race condition where multiple rapid mounts (React StrictMode, navigation events) trigger duplicate authentication fetches with potential setState after unmount.

**Causes:**

- useEffect calls reload() on mount without cancellation token
- No cleanup function to cancel in-flight requests
- React StrictMode double-mounts in dev causing duplicate fetches
- setState called multiple times with different authentication state

**Effect:**
User authentication state becomes inconsistent. User may appear logged in but actually unauthenticated, or vice versa.

**Hazard:**
User believes they are authenticated and proceeds to view patient data, but requests fail mid-workflow with 401 errors causing lost work and confusion.

**Hazard controls:**

### Design controls (manufacturer)

- Add AbortController to reload() function: create AbortController, pass signal to axios config, abort in useEffect cleanup. Prevents setState after unmount.
- Use React Query for authentication state management: replaces custom reload logic with built-in request cancellation, caching, and stale-while-revalidate behavior.
- Add authentication state machine: define explicit states (LOADING, AUTHENTICATED, UNAUTHENTICATED, ERROR). Prevent invalid state transitions. Use xstate library for formal state machine.
- Implement request de-duplication: track in-flight auth requests using useRef, skip new fetch if request already in-flight. Return existing promise to multiple callers.
- Disable React StrictMode in production build (already disabled by default). In development, handle double-mount gracefully by ignoring second mount's fetch if first still active.

### Testing controls (manufacturer)

- Unit test: Mount AuthContext, immediately unmount before fetch completes. Assert no setState warnings in console about updating unmounted component. Verify AbortController.abort() called in cleanup.
- Integration test: Mount AuthContext, verify reload() called once. Unmount and remount 3 times rapidly. Assert only 1 in-flight request at any time, previous requests aborted.
- Unit test: Mock auth API to return authenticated state, then immediately return unauthenticated state (race condition). Verify state machine prevents invalid state transition or reconciles correctly.
- React StrictMode test: Enable StrictMode in test environment, mount AuthContext, verify no duplicate fetches or state inconsistencies despite double-mount behavior.

### Training controls (deployment)

- Document for developers: Always use cleanup functions in useEffect for async operations. Add AbortController pattern to coding standards.
- Train on React best practices: setState after unmount indicates missing cleanup. Use linting rules to detect potential issues.

### Business process controls (deployment)

- Code review: All useEffect hooks with async operations must include cleanup function canceling in-flight requests.
- CI/CD: Run tests with React StrictMode enabled to catch mount/unmount race conditions before production.

**Harm:**
Clinical workflow interrupted causing unsaved clinical documentation to be lost. Critical details forgotten during re-entry of documentation leading to incomplete clinical records and potential patient harm.

**Code associated with hazard:**

- `frontend/src/auth/AuthContext.tsx:110-112`
