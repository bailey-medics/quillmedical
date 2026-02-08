# Hazard

**Hazard id:** Hazard-0031

**Hazard name:** No email verification on registration

**Description:** User registration endpoint creates account immediately without email confirmation, allowing attackers to register with fake emails and gain immediate system access.

**Causes:**

- No verification token sent to email after registration
- No "pending verification" account state
- Account usable immediately after registration API call completes

**Effect:**
Attacker can register with fake or disposable email address and immediately access clinical system.

**Hazard:**
Unauthorized users access clinical data without any verification that they are legitimate clinicians or authorized personnel.

**Harm:**
Data breach with unauthorized viewing of patient records. GDPR violation. Potential patient harm if attacker modifies clinical records causing incorrect treatment decisions.

**Code associated with hazard:**

- `backend/app/schemas/auth.py`
- `backend/app/main.py:255-290`
