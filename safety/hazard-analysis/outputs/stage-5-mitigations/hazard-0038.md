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

**Hazard controls:**

### Design controls (manufacturer)

- Add JWT authentication to POST /api/push/subscribe endpoint: decorate with user: CurrentUser = Depends(get_current_user_from_jwt). Associate subscription with user.id in database. Only authenticated users can subscribe their devices.
- Restrict POST /api/push/send-test to administrators: decorate with @require_roles("Administrator"). Only users with Administrator role can send test notifications. Remove public send endpoint entirely (only internal notification system triggers sends).
- Implement notification signature verification: sign notification payload with server-side secret. Service worker verifies signature before displaying notification. Reject unsigned or invalid signatures (prevents attacker injecting fake notifications via compromised push service).
- Add rate limiting to subscribe endpoint: limit to 5 subscriptions per user account. Prevent attacker creating hundreds of subscriptions to overload notification system. Implement rate limit: 10 subscribe requests per hour per IP address.
- Implement notification origin validation: backend stores notification_secret for each subscription (generated server-side, never sent to client). Before sending notification, include HMAC of notification content using subscription-specific secret. Service worker validates HMAC before displaying (prevents replay attacks or notification injection).

### Testing controls (manufacturer)

- Unit test: Call POST /api/push/subscribe without JWT token. Assert 401 Unauthorized response. Call with valid JWT token. Assert 200 OK and subscription created with user_id populated.
- Role test: Authenticate as regular Clinician user. Call POST /api/push/send-test. Assert 403 Forbidden. Authenticate as Administrator. Call POST /api/push/send-test. Assert 200 OK and notification sent.
- Signature test: Send notification with invalid signature. Assert service worker rejects notification (not displayed to user). Send notification with valid signature. Assert notification displayed.
- Rate limit test: Call POST /api/push/subscribe 6 times in 1 hour with same user account. Assert 6th request returns 429 Too Many Requests.
- Subscription limit test: Create 6 subscriptions for user A. Assert 6th subscription creation returns 400 Bad Request with error "Maximum 5 subscriptions per user".

### Training controls (deployment)

- Train clinicians on notification subscription management: only subscribe devices you personally use, review subscriptions in settings and remove old devices, report suspicious notifications to IT security.
- Document notification security for IT staff: explain signature verification mechanism, how to rotate notification secrets, incident response for compromised notification system.

### Business process controls (deployment)

- Notification security policy: Only authenticated users can subscribe devices. Test notifications restricted to administrators. Production notifications signed with secret keys rotated quarterly.
- Subscription audit: Security team reviews subscriptions monthly. Identify suspicious patterns (single user with 5+ subscriptions, subscriptions from unexpected IP ranges). Investigate and disable suspicious subscriptions.
- Alarm fatigue monitoring: Track notification volume per user per day. Alert if any user receiving >50 notifications/day (potential spam attack or misconfiguration). Investigate alert within 4 hours.
- Incident response: If notification spam attack detected (>100 notifications sent in 1 hour), immediately disable push notification system. Investigate compromised credentials or vulnerability. Rotate notification signing secrets before re-enabling system.

**Hazard types:**

- AlarmFatigue
- DataBreach

**Harm:**
Missed lab critical value notification (e.g., dangerously high potassium requiring immediate treatment) or missed deteriorating patient observation alert, leading to delayed treatment and potential cardiac arrest, respiratory failure, or death.

**Code associated with hazard:**

- `backend/app/push.py:30-50`
- `backend/app/push_send.py:20-40`
