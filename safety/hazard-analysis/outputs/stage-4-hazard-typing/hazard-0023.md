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

**Hazard types:**

- DataLoss
- NoAccessToData

**Harm:**
Clinical workflow interrupted causing unsaved clinical documentation to be lost. Critical details forgotten during re-entry of documentation leading to incomplete clinical records and potential patient harm.

**Code associated with hazard:**

- `frontend/src/auth/AuthContext.tsx:110-112`
