# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

JWT token expiry during long clinical session

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

Access token expires after 15 minutes regardless of user activity, causing authentication failure mid-workflow during long clinical sessions where clinician fills out forms or reviews records for extended periods.

---

## Causes

1. Token expiry is time-based not activity-based
2. Frontend only retries on 401, doesn't proactively refresh before expiry
3. Long-running clinical session times out mid-workflow

---

## Effect

Clinician fills out clinical documentation form for 20+ minutes, submits, receives 401 error, loses unsaved form data.

---

## Hazard

Clinical documentation lost, must be re-entered from memory. Clinician forgets or omits critical details during re-entry.

---

## Hazard type

- UnauthorizedAccess
- DataLoss

---

## Harm

Incomplete documentation affects patient care. Critical clinical details (allergies, medication changes, examination findings) forgotten during re-entry, leading to patient harm from missing information.

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

- Implement proactive token refresh: frontend checks token expiry every 60 seconds, refreshes token when <5 minutes remaining before expiry. Prevents 401 errors during active sessions.
- Add sliding window token refresh: backend extends access token lifetime on each authenticated request (sliding session). Configure access token 30-minute lifetime with refresh-on-use up to 8-hour maximum session.
- Implement form autosave: automatically save form state to localStorage every 30 seconds. On 401 error and re-login, restore form state from localStorage. Display notification "Form restored from autosave [timestamp]."
- Add session activity detection: track mouse movements, keyboard input, API requests as activity signals. Extend token lifetime during active periods, allow expiry during inactivity >15 minutes.
- Display session timeout warning: when <2 minutes until expiry, show modal with countdown timer: "Session expiring in 1:45. Click to extend session." Allow user to extend without losing context.

### Testing controls (manufacturer)

- Integration test: Open form page, wait 16 minutes (beyond token expiry), submit form. Assert token automatically refreshed during wait period, form submission succeeds without 401 error.
- Unit test: Mock token with 1-minute expiry, start proactive refresh timer. Assert refresh triggered when <5 minutes remaining (immediately). Verify new token obtained before expiry.
- Integration test: Fill form with test data, disable network, re-enable after 1 minute, submit form. Assert form state persisted to localStorage, restored after network recovery, submission succeeds.
- Integration test: Simulate inactive session (no mouse/keyboard/API activity) for 20 minutes. Assert token expires, next action prompts re-login. After re-login, verify previous page context restored.

### Training controls (deployment)

- Train clinicians to save clinical documentation incrementally: click Save Draft button every 5-10 minutes during long documentation sessions. Don't wait until end to save.
- Document workflow: "For complex clinical notes taking >15 minutes, use Save Draft button regularly to prevent data loss."
- Include in induction training: System will automatically keep session active during regular use. If away from keyboard >15 minutes, session may expire requiring re-login.

### Business process controls (deployment)

- IT policy: Clinical workstation screen timeout after 5 minutes of inactivity. On return, require re-authentication but preserve unsaved form data via autosave.
- Clinical governance: Electronic medical records policy must specify session timeout values balancing security (shorter timeouts) with workflow disruption (longer timeouts). Current: 15-minute access token, 8-hour session maximum with activity-based refresh.
- Incident reporting: If clinician reports data loss due to session timeout, report as safety incident. Investigate autosave functionality and consider adjustments to timeout policies.

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- backend/app/main.py:1-300
- backend/app/security.py:87-101
