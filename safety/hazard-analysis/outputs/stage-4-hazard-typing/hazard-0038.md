# Hazard

**Hazard id:** Hazard-0038

**Hazard name:** Push notification endpoints unauthenticated

**Description:** Push notification subscribe and send endpoints have no authentication requirement, allowing anyone to subscribe devices or trigger notifications to all users.

**Causes:**

- Endpoints not decorated with require_roles or current_user dependency
- No JWT token validation before processing subscription or send requests
- Anyone with API access can spam users or subscribe malicious devices

**Effect:**
Attacker can spam clinical users with fake notifications causing alarm fatigue, or subscribe to intercept legitimate notifications.

**Hazard:**
Clinicians desensitized to notifications due to spam, miss real critical alerts when they occur.

**Hazard types:**

- AlarmFatigue
- DataBreach

**Harm:**
Missed lab critical value notification (e.g., dangerously high potassium requiring immediate treatment) or missed deteriorating patient observation alert, leading to delayed treatment and potential cardiac arrest, respiratory failure, or death.

**Code associated with hazard:**

- `backend/app/push.py:30-50`
- `backend/app/push_send.py:20-40`
