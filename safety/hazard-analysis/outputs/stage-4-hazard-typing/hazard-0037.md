# Hazard

**Hazard id:** Hazard-0037

**Hazard name:** Push notifications lack user association

**Description:** Push subscriptions stored in-memory list without user_id foreign key, preventing selective notification targeting and causing all notifications to be sent to all subscribed devices indiscriminately.

**Causes:**

- In-memory subscription list stores subscriptions without user context
- No database table with user_id foreign key
- Backend sends to all subscribers without filtering by role or patient assignment

**Effect:**
Clinical notifications sent to all users including wrong clinicians who are not involved in patient's care.

**Hazard:**
Clinician receives notification about patient they don't treat, develops alarm fatigue and ignores important notification for their own patient.

**Hazard types:**

- AlarmFatigue

**Harm:**
Missed critical alert (lab critical value, drug interaction warning, deteriorating vital signs) due to alarm fatigue, leading to delayed treatment and potential patient harm.

**Code associated with hazard:**

- `backend/app/push_send.py`
- `backend/app/push.py`
