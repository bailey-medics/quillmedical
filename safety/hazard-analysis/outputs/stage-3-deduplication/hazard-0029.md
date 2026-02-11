# Hazard

**Hazard id:** Hazard-0029

**Hazard name:** New user accounts active by default

**Description:** User model sets is_active=True by default, allowing newly registered accounts to immediately access system without email verification or admin approval.

**Causes:**

- Column default is True in database schema
- No email verification step in registration flow
- No admin approval workflow before account activation

**Effect:**
Attacker can self-register via registration endpoint (if open) and immediately access patient data without any verification or approval process.

**Hazard:**
Unauthorized users access clinical system with full read/write access to patient records.

**Harm:**
Data breach with unauthorized viewing/editing of patient records. GDPR violation. Potential patient harm if attacker modifies clinical records causing incorrect treatment decisions.

**Code associated with hazard:**

- `backend/app/models.py`
