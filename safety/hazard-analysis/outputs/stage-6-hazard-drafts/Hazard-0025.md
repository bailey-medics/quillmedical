# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Logout fails silently leaving session active

---

## General utility label

[2]

---

## Likelihood scoring

TBC

---

## Severity scoring

TBC

---

## Description

Logout function wraps API call in try/catch and ignores errors, always clearing local state even if server-side session termination fails, causing user to believe they're logged out while session remains active.

---

## Causes

1. Logout function ignores API errors and always clears local state
2. Server-side session not guaranteed to be terminated
3. JWT tokens still valid until expiry even if logout API called
4. Browser cookies not reliably cleared

---

## Effect

User believes they're logged out and closes browser, but session remains active on server. Next user on shared workstation can reopen browser and resume session.

---

## Hazard

Unauthorized access to previous user's session on shared clinical workstation. Next clinician or unauthorized person accesses patient records using previous session.

---

## Hazard type

- UnauthorizedAccess

---

## Harm

Data breach with unauthorized viewing of patient records. Wrong clinician makes clinical decisions using previous user's session, potentially affecting wrong patient. GDPR violation from unauthorized access.

---

## Existing controls

None identified during initial analysis.

---

## Assignment

Clinical Safety Officer

---

## Labelling

TBC (awaiting scoring)

---

## Project

Clinical Risk Management

---

## Hazard controls

### Design controls (manufacturer)

- Remove try/catch from logout function or re-throw error after local cleanup. If logout API fails, display error modal: "Logout failed - session may still be active. Please close browser or contact IT."
- Implement token revocation list (blacklist) on backend: add logged-out access tokens to Redis set with TTL matching token expiry. Check blacklist on every authenticated request, reject if token found.
- Force cookie deletion on logout: explicitly set cookie expiry to past date with multiple domain/path combinations to ensure deletion across subdomain configurations.
- Add logout confirmation with session status: after logout API succeeds, display "You have been logged out. All sessions terminated. It is safe to close browser."
- Implement server-side session tracking: store active session IDs in Redis linked to user account. Logout endpoint deletes all sessions for user. Provides ability to force logout on all devices.

### Testing controls (manufacturer)

- Integration test: Mock /api/auth/logout to return 500 error, call logout function. Assert error displayed to user warning session may still be active. Verify local state NOT cleared until API succeeds.
- Integration test: Login, obtain access token, call logout API. Attempt API request with logged-out access token. Assert 401 Unauthorized returned indicating token revoked/blacklisted.
- Integration test: Login on device A, login on device B, logout on device A. Verify device B session also terminated (global logout). Or verify only device A logged out if per-device sessions implemented.
- Unit test: After logout, verify all authentication cookies deleted (access_token, refresh_token, XSRF-TOKEN). Assert cookies have max-age=0 or expires in past.

### Training controls (deployment)

- Train staff to always click Logout button before leaving shared workstation, never just close browser tab. Emphasize importance for patient data security.
- Document workstation security procedure: "End of shift checklist: 1) Save work 2) Click Logout 3) Wait for confirmation 4) Close browser 5) Lock workstation (Windows+L)."
- Post reminder signs at shared workstations: "Always LOG OUT before leaving - patient confidentiality depends on it."

### Business process controls (deployment)

- NHS Trust IT security policy: Shared clinical workstations must have automatic screen lock after 5 minutes of inactivity AND require explicit logout.
- Audit requirement: Log all logout events with timestamp and user ID. Daily review of sessions >8 hours duration without explicit logout (forgotten logout, browser crash).
- Incident response: If unauthorized access via abandoned session detected, treat as serious security incident. Review all patient records accessed during session for inappropriate access.
- Technical control: Implement automatic session timeout after 8 hours regardless of activity. Force logout at end of maximum session lifetime even if user still active.

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- frontend/src/auth/AuthContext.tsx:102-107
