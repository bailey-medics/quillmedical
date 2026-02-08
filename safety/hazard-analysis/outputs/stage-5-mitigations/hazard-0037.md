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

**Hazard controls:**

### Design controls (manufacturer)

- Create push_subscriptions database table: columns include id, user_id (FK to users.id), endpoint (unique), p256dh_key, auth_key, created_at, last_used_at. Replace in-memory list with database persistence. Subscribe endpoint requires JWT authentication, associates subscription with current user.
- Implement notification routing logic: before sending push notification, determine target users based on notification type. For patient-specific notifications (new letter, demographics updated), send only to clinicians assigned to that patient. For system notifications (scheduled maintenance), send to all users with role Administrator.
- Add notification preferences table: users.notification_preferences JSONB column storing preferences like {"patient_updates": true, "system_alerts": false, "lab_results": true}. Respect preferences when sending notifications. Provide UI in settings for managing preferences.
- Implement clinician-patient assignment tracking: create clinician_patients table with columns clinician_id, patient_id, role (primary, covering, consultant). Query this table to determine which clinicians should receive notifications about specific patient.
- Add notification priority levels: HIGH (critical lab values, deteriorating observations), MEDIUM (new letter ready), LOW (system announcements). Send HIGH priority to all assigned clinicians regardless of preferences. MEDIUM/LOW respect user preferences. Display priority in notification: urgent notifications use sound + vibration, low priority silent.

### Testing controls (manufacturer)

- Unit test: Create 2 users (Alice, Bob) with push subscriptions. Send notification targeting Alice only. Assert Alice receives notification (check push service called with Alice's endpoint). Assert Bob does not receive notification (Bob's endpoint not called).
- Integration test: Assign clinician to patient A. Create new letter for patient A. Trigger notification. Verify only assigned clinician receives notification. Create letter for patient B (different clinician). Verify first clinician does not receive notification for patient B.
- Preference test: User disables "patient_updates" preference. Trigger patient update notification. Assert user does not receive notification. Trigger HIGH priority critical lab notification. Assert user receives notification despite preferences (HIGH priority overrides preferences).
- Assignment test: Add clinician C as covering clinician for patient A (primary clinician is clinician D). Send notification about patient A. Assert both clinician C and D receive notification (covering + primary both notified).
- Load test: Send notification to 100 clinicians simultaneously. Measure processing time (target: <2 seconds). Verify all 100 receive notification (no missing notifications due to concurrency issues).

### Training controls (deployment)

- Train clinicians on notification preferences: configure preferences in settings to receive notifications only for assigned patients. Explain HIGH priority notifications cannot be disabled (safety-critical).
- Document notification types for clinical staff: explain what triggers each notification type (new letter, demographics update, lab critical value, etc.), who receives each type, how to customize preferences.

### Business process controls (deployment)

- Notification routing policy: Patient-specific notifications sent only to clinicians with documented care relationship (assigned in clinician_patients table). System-wide notifications sent to administrators only. Emergency alerts sent to all clinicians on duty.
- Alarm fatigue prevention: Monitor notification volume per clinician per day. Alert if clinician receiving >50 notifications/day (indicates potential alarm fatigue risk). Review notification routing rules if alert triggered.
- Clinician assignment management: Administrators update clinician_patients table when care relationships change (new patient assignment, handover, discharge). Audit clinician assignments monthly to remove stale assignments (reduce notification noise).
- Notification effectiveness monitoring: Track notification acknowledge rates (how many clinicians click notification to view details). Investigate if acknowledge rate <70% (suggests notifications not relevant or alarm fatigue). Adjust routing rules based on acknowledge rate data.

**Hazard types:**

- AlarmFatigue

**Harm:**
Missed critical alert (lab critical value, drug interaction warning, deteriorating vital signs) due to alarm fatigue, leading to delayed treatment and potential patient harm.

**Code associated with hazard:**

- `backend/app/push_send.py`
- `backend/app/push.py`
