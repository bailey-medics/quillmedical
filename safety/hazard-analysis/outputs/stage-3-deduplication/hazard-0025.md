# Hazard

**Hazard id:** Hazard-0025

**Hazard name:** Logout fails silently leaving session active

**Description:** Logout function wraps API call in try/catch and ignores errors, always clearing local state even if server-side session termination fails, causing user to believe they're logged out while session remains active.

**Causes:**

- Logout function ignores API errors and always clears local state
- Server-side session not guaranteed to be terminated
- JWT tokens still valid until expiry even if logout API called
- Browser cookies not reliably cleared

**Effect:**
User believes they're logged out and closes browser, but session remains active on server. Next user on shared workstation can reopen browser and resume session.

**Hazard:**
Unauthorized access to previous user's session on shared clinical workstation. Next clinician or unauthorized person accesses patient records using previous session.

**Harm:**
Data breach with unauthorized viewing of patient records. Wrong clinician makes clinical decisions using previous user's session, potentially affecting wrong patient. GDPR violation from unauthorized access.

**Code associated with hazard:**

- `frontend/src/auth/AuthContext.tsx:102-107`
