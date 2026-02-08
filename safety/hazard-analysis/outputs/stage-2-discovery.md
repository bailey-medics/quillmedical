# Stage 2: Hazard Discovery (SWIFT-style What-If)

Generated: 2026-02-04

This document contains all identified clinical safety hazards from Tier 1-3 files using SWIFT "what-if" reasoning from five perspectives: clinician workflow, system failure, security breach, concurrency/race conditions, and integration failure.

---

## Tier 1: Direct Clinical Data Files

### Demographics.tsx

#### WRONG_PATIENT_NAME_DISPLAYED

**Description:** Patient name displayed in demographics component does not match the actual patient record being viewed.

**Causes:**

- Race condition where patient prop updates but stale data renders before React reconciliation
- Parent component passes wrong patient object due to state management bug
- React key collision causing incorrect component instance to display

**Effect:**
Clinician sees wrong patient's name in demographics card/ribbon.

**Hazard:**
Clinician makes clinical decision based on wrong patient identity.

**Harm:**
Wrong patient receives treatment/medication/procedure. Potential for serious injury or death if high-risk intervention (surgery, chemotherapy, insulin administration).

**Code:**
`frontend/src/components/demographics/Demographics.tsx` lines 49-78 (rendering patient.name without identity verification)

---

#### NULL_PATIENT_SILENTLY_HIDDEN

**Description:** Demographics component returns null when patient prop is undefined, hiding patient identity without alerting clinician.

**Causes:**

- API fetch fails silently
- Patient ID not found in FHIR server
- Network timeout without retry

**Effect:**
Demographics section shows nothing (blank space) instead of displaying error or alert.

**Hazard:**
Clinician proceeds to view/edit clinical data without knowing which patient they're treating.

**Harm:**
Actions taken on wrong patient record. Could result in misdiagnosis, incorrect treatment, or missed critical alerts.

**Code:**
`frontend/src/components/demographics/Demographics.tsx` lines 47-48 (returns null for undefined patient with no error indication)

---

#### AGE_CALCULATION_OFF_BY_ONE

**Description:** Age calculation logic does not correctly handle edge cases (same-day birthdays, leap years, timezone differences).

**Causes:**

- Month/day comparison logic error in lines 145-149 of Home.tsx
- Timezone mismatch between server birthDate (UTC) and browser Date object (local time)
- Leap year birthday on Feb 29th causing calculation error

**Effect:**
Patient age displayed is incorrect (typically off by one year).

**Hazard:**
Clinician makes age-inappropriate clinical decisions (drug dosage, screening recommendations, treatment protocols).

**Harm:**
Pediatric patient receives adult dosage causing toxicity, or elderly patient misses age-appropriate screening leading to delayed cancer diagnosis.

**Code:**
`frontend/src/pages/Home.tsx` lines 140-151 (age calculation from birthDate)
`frontend/src/pages/Patient.tsx` lines 146-157 (duplicate age calculation logic)

---

### DemographicsDetailed.tsx

#### EDITABLE_DEMOGRAPHICS_WITHOUT_CONFIRMATION

**Description:** Detailed demographics form allows editing of critical patient identifiers (NHS number, name, DOB) without confirmation dialog or two-person verification.

**Causes:**

- Form submission has no confirmation step
- No "are you sure?" modal before saving critical changes
- No audit warning shown to user

**Effect:**
Accidental or malicious changes to patient identity saved to FHIR server.

**Hazard:**
Patient record becomes permanently linked to wrong identity (wrong NHS number, wrong name).

**Harm:**
Patient's entire medical history lost or merged with another patient. Life-threatening if allergy/medication history incorrect.

**Code:**
`frontend/src/components/demographics/DemographicsDetailed.tsx` (entire file - needs review for confirmation UX)

---

### NationalNumber.tsx

#### NHS_NUMBER_FORMAT_INCORRECT_DISPLAYED

**Description:** NHS number displayed with incorrect spacing or missing validation feedback.

**Causes:**

- Formatter does not validate 10-digit structure
- Non-NHS systems (international) display unformatted numbers
- Copy-paste removes spacing causing confusion

**Effect:**
Clinician reads NHS number incorrectly when transcribing to external system.

**Hazard:**
Wrong patient record referenced in external system (GP surgery, lab, pharmacy).

**Harm:**
Lab results sent to wrong patient, medication dispensed to wrong person.

**Code:**
`frontend/src/components/demographics/NationalNumber.tsx` lines 16-59 (formatting logic without checksum validation)

---

### patient.ts (domain type)

#### OPTIONAL_FIELDS_ASSUMED_PRESENT

**Description:** Patient type defines many fields as optional (dob, age, sex, nationalNumber) but calling code may not handle undefined safely.

**Causes:**

- TypeScript optional fields marked with `?` but no runtime checks
- Destructuring without default values
- String interpolation without null checks

**Effect:**
Components display "undefined" or crash with "cannot read property of undefined".

**Hazard:**
Critical patient information (DOB for age-based dosing, sex for pregnancy checks) missing when clinician expects it.

**Harm:**
Wrong drug dosage calculated, inappropriate treatment given (e.g., teratogenic drug given to pregnant patient).

**Code:**
`frontend/src/domains/patient.ts` lines 5-19 (all optional fields)

---

### Patient.tsx

#### STALE_PATIENT_DEMOGRAPHICS_AFTER_UPDATE

**Description:** Patient page fetches demographics on mount but never re-fetches if another user updates demographics in parallel.

**Causes:**

- useEffect dependency array only includes `[id, setPatient]`
- No polling or WebSocket subscription for real-time updates
- React Router navigation reuses component instance without re-mount

**Effect:**
Clinician views outdated patient name, DOB, NHS number while another clinician has corrected errors.

**Hazard:**
Clinician makes decision based on incorrect demographics (wrong age, wrong identity).

**Harm:**
Age-inappropriate medication dosage, patient identification error.

**Code:**
`frontend/src/pages/Patient.tsx` lines 92-193 (useEffect fetch with no refresh mechanism)

---

#### FHIR_IDENTIFIER_ARRAY_ASSUMPTION

**Description:** Code assumes FHIR identifier array contains expected structure but does not validate system/value existence.

**Causes:**

- Lines 131-140 use optional chaining `identifier.system?.includes()` but assume value exists
- No check if identifier array is empty or malformed
- FHIR server may return identifiers without system field

**Effect:**
nationalNumber extracted incorrectly (undefined or wrong value).

**Hazard:**
Patient displayed without NHS number, or with wrong person's NHS number.

**Harm:**
Patient identity confusion, wrong record accessed in external system.

**Code:**
`frontend/src/pages/Patient.tsx` lines 123-142 (national identifier extraction logic)

---

### Home.tsx

#### PATIENT_LIST_RACE_CONDITION

**Description:** Multiple rapid API calls to `/patients` can cause race condition where older response overwrites newer data.

**Causes:**

- fetchPatients function does not cancel in-flight requests
- Component re-renders trigger duplicate fetches
- useEffect cleanup sets `cancelled = true` but fetch promise still settles

**Effect:**
Patient list shows stale data (missing newly added patient or showing deleted patient).

**Hazard:**
Clinician cannot find patient in list and assumes they don't exist, creates duplicate record.

**Harm:**
Duplicate patient records with different FHIR IDs causing fragmented medical history.

**Code:**
`frontend/src/pages/Home.tsx` lines 105-170 (fetchPatients with cancellation flag but promise can still settle after cleanup)

---

#### PATIENT_CARD_CLICK_WRONG_PATIENT

**Description:** PatientsList component passes navigate function to cards but if list re-renders mid-click, wrong patient ID may be captured in closure.

**Causes:**

- React closure captures patient.id from props at render time
- List re-sorts or filters between mouse-down and mouse-up
- Event handler fires after patient prop changed

**Effect:**
Clinician clicks on "John Smith" but navigates to "Jane Doe" patient page.

**Hazard:**
Clinician views wrong patient's clinical data.

**Harm:**
Wrong patient's medications reviewed, wrong patient discharged.

**Code:**
`frontend/src/pages/Home.tsx` lines 213-231 (PatientsList receives patients array and navigate callback)

---

### PatientsList.tsx

#### AVATAR_GRADIENT_INSUFFICIENT_DISTINCTION

**Description:** Avatar gradient colors generated may not provide sufficient visual distinction for rapid patient identification in high-pressure environment.

**Causes:**

- Only 30 gradient variations (0-29) means collisions likely with >30 patients
- Color-blind clinicians cannot distinguish similar hues
- Low contrast on different displays

**Effect:**
Clinician relies on visual color cue but confuses two patients with similar gradient.

**Hazard:**
Wrong patient selected based on visual recognition instead of reading name.

**Harm:**
Clinical action performed on wrong patient.

**Code:**
`frontend/src/components/patients/PatientsList.tsx` (avatar rendering with gradientIndex)

---

### LetterView.tsx

#### LETTER_DISPLAYED_FOR_WRONG_PATIENT

**Description:** Letter view component fetches letter by composition UID but does not verify letter belongs to current patient in context.

**Causes:**

- URL parameter manipulation (patient_id and composition_uid mismatch)
- API does not validate letter ownership
- React Router state allows stale patient ID

**Effect:**
Letter from Patient A displayed while viewing Patient B's page.

**Hazard:**
Clinician reads wrong patient's clinical history and makes treatment decision.

**Harm:**
Wrong medication prescribed based on another patient's letter (e.g., allergy information incorrect).

**Code:**
`frontend/src/pages/LetterView.tsx` (needs API-side validation that letter belongs to requested patient)

---

### Letters.tsx

#### LETTERS_LIST_MISSING_LETTER

**Description:** Letters list page displays letters from EHRbase query but does not handle pagination or limit, potentially missing recent letters.

**Causes:**

- AQL query may have default row limit
- Letters created during page load not shown
- No "refresh" button or auto-refresh

**Effect:**
Clinician does not see most recent clinical letter in list.

**Hazard:**
Critical clinical information in recent letter not reviewed before making decision.

**Harm:**
Clinician prescribes medication that conflicts with contraindication documented in unseen letter.

**Code:**
`frontend/src/pages/Letters.tsx` (letter list fetch logic)

---

### fhir-patient.ts

#### AVATAR_GRADIENT_COLLISION

**Description:** Avatar gradient index extraction from FHIR extension may return same index for different patients due to modulo operation or random generation collision.

**Causes:**

- `generate_avatar_gradient_index()` in backend uses random.randint(0, 29)
- Two patients randomly assigned same gradient
- No uniqueness check

**Effect:**
Multiple patients have identical avatar colors in UI.

**Hazard:**
Clinician uses color as rapid identification cue and confuses patients.

**Harm:**
Wrong patient selected based on visual recognition.

**Code:**
`frontend/src/lib/fhir-patient.ts` (extractAvatarGradientIndex function)
`backend/app/utils/colors.py` (generate_avatar_gradient_index with random generation)

---

### fhir_client.py

#### FHIR_PATIENT_CREATION_NO_DUPLICATE_CHECK

**Description:** create_fhir_patient function does not check if patient with same NHS number or name/DOB already exists before creating.

**Causes:**

- No search query before POST
- FHIR server allows duplicate resources
- Frontend does not prevent duplicate submission

**Effect:**
Duplicate patient records created in FHIR server.

**Hazard:**
Clinical team works on two separate records for same patient, medical history fragmented.

**Harm:**
Allergy documented in one record but not visible in duplicate record, causing allergic reaction.

**Code:**
`backend/app/fhir_client.py` lines 89-212 (create_fhir_patient with no pre-creation search)

---

#### NHS_NUMBER_VALIDATION_INSUFFICIENT

**Description:** NHS number validation only checks 10-digit format but does not validate checksum (Modulus 11 algorithm).

**Causes:**

- Lines 127-132 only check length and isdigit()
- No checksum validation against NHS number standard
- Invalid NHS numbers accepted

**Effect:**
Invalid NHS number stored in FHIR server.

**Hazard:**
Patient record cannot be matched to NHS Spine, external systems reject queries.

**Harm:**
Patient's medication history not retrieved from GP system, drug interaction missed.

**Code:**
`backend/app/fhir_client.py` lines 127-132 (NHS number validation without checksum)

---

#### FHIR_GENDER_LOWERCASE_CONVERSION

**Description:** Gender input converted to lowercase without validation, may not match FHIR R4 required values.

**Causes:**

- Line 217 converts to .lower() but FHIR R4 requires exact values: male|female|other|unknown
- Input "Male" becomes "male" (correct) but "Unknown" becomes "unknown" (correct)
- However, typo like "femail" passes lowercase conversion but is invalid FHIR

**Effect:**
Invalid gender value submitted to FHIR server, rejected or stored incorrectly.

**Hazard:**
Gender-specific clinical rules not applied (pregnancy checks for "female", prostate checks for "male").

**Harm:**
Inappropriate treatment or missed screening.

**Code:**
`backend/app/fhir_client.py` lines 120-125, 217 (gender validation and conversion)

---

#### FHIR_EXTENSION_OVERWRITE_RISK

**Description:** add_avatar_gradient_extension function appends to patient.extension array without checking for existing gradient extension.

**Causes:**

- Lines 63-67 append new Extension without deduplication
- Multiple calls to function result in duplicate extensions
- No check if AVATAR_GRADIENT_EXTENSION_URL already exists

**Effect:**
Patient resource has multiple avatar gradient extensions with different values.

**Hazard:**
Frontend extracts first or last extension value non-deterministically, avatar color inconsistent across pages.

**Harm:**
Low clinical harm but contributes to patient identification confusion.

**Code:**
`backend/app/fhir_client.py` lines 54-67 (add_avatar_gradient_extension without duplicate check)

---

### ehrbase_client.py

#### EHRBASE_EHR_CREATION_NO_ATOMICITY

**Description:** get_or_create_ehr function checks for existing EHR then creates if missing, but two concurrent requests can both create EHR for same patient.

**Causes:**

- Lines 100-106 are not atomic (check-then-create race condition)
- No database-level unique constraint on subject_id
- Two FastAPI workers handle requests simultaneously

**Effect:**
Two EHR records created for same patient in EHRbase.

**Hazard:**
Clinical letters split across two EHRs, clinician only sees subset of patient's letters.

**Harm:**
Recent clinical letter with contraindication not visible, medication prescribed causing adverse reaction.

**Code:**
`backend/app/ehrbase_client.py` lines 100-106 (get_or_create_ehr race condition)

---

#### EHRBASE_SUBJECT_ID_NOT_VALIDATED

**Description:** create_ehr function accepts subject_id string without validating it corresponds to real FHIR patient.

**Causes:**

- Lines 28-30 only check not empty/whitespace
- No FHIR patient existence verification
- Accepts arbitrary UUIDs or strings

**Effect:**
EHR created with non-existent patient ID, orphaned clinical letters.

**Hazard:**
Letters written for wrong patient ID, cannot be retrieved via patient page.

**Harm:**
Clinical information lost, treatment decisions made without complete history.

**Code:**
`backend/app/ehrbase_client.py` lines 28-30 (subject_id validation without FHIR verification)

---

#### EHRBASE_LETTER_COMPOSITION_NO_VALIDATION

**Description:** create_letter_composition function does not validate letter content before submission to EHRbase.

**Causes:**

- No content length limits
- No validation of markdown safety
- No check for required fields beyond type checking

**Effect:**
Invalid or malicious letter content stored in OpenEHR composition.

**Hazard:**
Letter content contains injection attacks or corrupted data, cannot be displayed.

**Harm:**
Critical clinical letter unreadable when needed for emergency treatment decision.

**Code:**
`backend/app/ehrbase_client.py` lines 155-233 (create_letter_composition function)

---

### main.py

#### JWT_TOKEN_EXPIRY_NOT_SYNCHRONIZED

**Description:** Access token expires after 15 minutes but frontend auto-refresh may fail if user keeps page open without activity.

**Causes:**

- Token expiry is time-based not activity-based
- Frontend only retries on 401, doesn't proactively refresh
- Long-running clinical session times out mid-workflow

**Effect:**
Clinician fills out form for 20 minutes, submits, gets 401, loses unsaved data.

**Hazard:**
Clinical documentation lost, must be re-entered from memory.

**Harm:**
Critical clinical details forgotten during re-entry, incomplete documentation affects patient care.

**Code:**
`backend/app/main.py` lines 1-300 (JWT configuration with 15min access token)
`backend/app/security.py` lines 87-101 (create_access_token with ACCESS_TTL_MIN)

---

#### FHIR_HEALTH_CHECK_FALSE_NEGATIVE

**Description:** Startup health check only queries FHIR server once; if server starts after backend, health appears unavailable but actually works.

**Causes:**

- Lines 158-186 run on startup event, never re-check
- FHIR container may take 30s to fully start
- Backend starts faster, sees 500 error, continues anyway

**Effect:**
Backend logs "FHIR server not available" but server actually works.

**Hazard:**
Clinician assumes patient operations unavailable, uses workaround system, data entry duplicated.

**Harm:**
Duplicate patient records created in backup system.

**Code:**
`backend/app/main.py` lines 158-186 (startup_event health checks)

---

#### NO_RATE_LIMITING_ON_LOGIN

**Description:** Login endpoint `/api/auth/login` has no rate limiting, allows brute force attacks.

**Causes:**

- No rate limiting middleware installed
- No failed login attempt tracking
- No account lockout after N failed attempts

**Effect:**
Attacker can brute force weak passwords.

**Hazard:**
Unauthorized access to clinician account with patient data access.

**Harm:**
Data breach, unauthorized viewing of patient records (GDPR violation, patient privacy harm).

**Code:**
`backend/app/main.py` lines 220-290 (login route with no rate limiting)

---

#### CSRF_TOKEN_NOT_REQUIRED_ON_LETTER_CREATE

**Description:** POST /api/patients/{patient_id}/letters does not require CSRF token, vulnerable to CSRF attack.

**Causes:**

- Route uses `require_roles("Clinician")` but not `require_csrf`
- CSRF token only required on some routes inconsistently

**Effect:**
Malicious website can trigger clinician browser to create letter via POST request.

**Hazard:**
Forged clinical letters created in patient records.

**Harm:**
False clinical information entered into medical record, incorrect treatment decisions made.

**Code:**
`backend/app/main.py` lines 650-680 (letter creation route)

---

### patient_records.py

#### PATIENT_RECORDS_STALE_CACHE

**Description:** If patient_records.py implements caching (not visible in current code but architectural concern), stale cached demographics may be returned.

**Causes:**

- Cache TTL too long
- Cache not invalidated on patient update
- Multiple backend workers with separate cache state

**Effect:**
Clinician views outdated patient demographics.

**Hazard:**
Clinical decision based on wrong age, wrong name, wrong contact details.

**Harm:**
Age-inappropriate dosage, emergency contact called for wrong patient.

**Code:**
`backend/app/patient_records.py` (review for caching implementation)

---

### letters.py

#### LETTER_API_NO_PATIENT_OWNERSHIP_CHECK

**Description:** Letter API endpoints accept patient_id and letter_id but don't verify letter belongs to patient.

**Causes:**

- URL parameter validation only checks existence, not ownership
- Backend trusts frontend to only request valid combinations
- EHRbase query doesn't enforce patient association

**Effect:**
Letter from Patient A retrieved when viewing Patient B's letters page.

**Hazard:**
Clinician reads wrong patient's clinical history.

**Harm:**
Wrong treatment based on another patient's letter (e.g., "patient allergic to penicillin" but wrong patient, real patient receives penicillin and has anaphylaxis).

**Code:**
`backend/app/schemas/letters.py` (LetterIn schema)
API routes in `main.py` lines 650-750 (letter CRUD endpoints)

---

### colors.py

#### GRADIENT_INDEX_NOT_CRYPTOGRAPHICALLY_SECURE

**Description:** Avatar gradient index generated using `random.randint()` not `secrets.randbelow()`, predictable for attacker.

**Causes:**

- Python random module is PRNG not CSPRNG
- Seed may be predictable
- Low security concern for avatar color but sets pattern of using insecure random

**Effect:**
Attacker can predict avatar gradients for new patients.

**Hazard:**
Low direct clinical harm, but demonstrates insecure random number generation in codebase.

**Harm:**
If pattern repeated for security-sensitive features (session tokens, TOTP secrets), high security risk.

**Code:**
`backend/app/utils/colors.py` (generate_avatar_gradient_index function)

---

## Tier 2: Clinical Workflow Support Files

### AuthContext.tsx

#### AUTH_STATE_RACE_CONDITION_ON_MOUNT

**Description:** useEffect calls reload() on mount without cleanup, multiple rapid mounts can cause race condition.

**Causes:**

- Lines 110-112 call reload() on mount
- No cancellation token or cleanup
- React StrictMode double-mounts in dev cause duplicate fetches

**Effect:**
setState called multiple times with different authentication state.

**Hazard:**
User appears logged in but actually unauthenticated, proceeds to view patient data, gets 401 mid-workflow.

**Harm:**
Clinical workflow interrupted, unsaved data lost.

**Code:**
`frontend/src/auth/AuthContext.tsx` lines 110-112 (useEffect reload with no cleanup)

---

#### LOGIN_TOTP_VALIDATION_CLIENT_SIDE

**Description:** AuthContext.login validates TOTP length client-side but accepts any 6-digit number, actual validation only server-side.

**Causes:**

- Lines 87-90 check length but not format
- User could submit "000000" or "abcdef" (alphabet chars allowed before server rejects)

**Effect:**
Invalid TOTP submitted to server, user sees generic error message.

**Hazard:**
Clinician locked out of account during emergency, cannot access patient records.

**Harm:**
Delayed treatment while clinician resets 2FA or uses backup system.

**Code:**
`frontend/src/auth/AuthContext.tsx` lines 87-90 (TOTP validation)

---

#### LOGOUT_FAILS_SILENTLY

**Description:** logout function ignores API errors and always clears local state, user believes they're logged out but session may still be active on server.

**Causes:**

- Lines 103-107 wrap logout API in try/catch and ignore errors
- Server-side session not guaranteed to be terminated
- JWT tokens still valid until expiry even if logout called

**Effect:**
User believes they're logged out, closes browser, session remains active.

**Hazard:**
Next user on shared workstation can reopen browser and resume session (if cookies not cleared).

**Harm:**
Unauthorized access to patient records on shared clinical workstation.

**Code:**
`frontend/src/auth/AuthContext.tsx` lines 102-107 (logout error handling)

---

### TopRibbon.tsx

#### DEMOGRAPHICS_DISPLAY_STALE_AFTER_UPDATE

**Description:** TopRibbon displays patient from outlet context but doesn't re-fetch if another user updates demographics.

**Causes:**

- Patient object passed via context is cached
- No polling or WebSocket for real-time updates
- Component assumes patient prop is always current

**Effect:**
Clinician sees outdated patient name/DOB/NHS number in ribbon while working on record.

**Hazard:**
Clinician makes decision based on wrong demographics (wrong age, wrong identity).

**Harm:**
Age-inappropriate medication dosage, patient identification error.

**Code:**
`frontend/src/components/ribbon/TopRibbon.tsx` (patient display without refresh mechanism)

---

### security.py

#### PASSWORD_HASH_NO_PEPPER

**Description:** hash_password uses Argon2 with default parameters but no pepper (server-side secret), vulnerable if database dumped.

**Causes:**

- Lines 40-48 use argon2.hash() with no additional secret
- No PEPPER environment variable mixed into hash
- Standard Argon2 can be cracked if attacker has database dump

**Effect:**
Attacker with database access can crack weak passwords.

**Hazard:**
Unauthorized access to clinician accounts.

**Harm:**
Data breach, unauthorized viewing/editing of patient records.

**Code:**
`backend/app/security.py` lines 40-48 (hash_password without pepper)

---

#### JWT_SECRET_REUSE_FOR_CSRF

**Description:** CSRF token signing uses JWT_SECRET, same secret as JWT tokens, increasing attack surface.

**Causes:**

- make_csrf and verify_csrf use settings.JWT_SECRET
- If JWT secret compromised, CSRF protection also compromised

**Effect:**
Single secret compromise breaks both authentication and CSRF protection.

**Hazard:**
Attacker can forge both JWT tokens and CSRF tokens.

**Harm:**
Unauthorized access to patient data, forged clinical actions (create letter, edit demographics).

**Code:**
`backend/app/security.py` lines 152-178 (make_csrf and verify_csrf using JWT_SECRET)

---

#### TOTP_SECRET_NOT_ENCRYPTED_AT_REST

**Description:** TOTP secret stored in database as plain VARCHAR, not encrypted.

**Causes:**

- `models.py` defines `totp_secret` as VARCHAR(64)
- No column-level encryption
- Database dump exposes all TOTP secrets

**Effect:**
Attacker with database access can bypass 2FA for all users.

**Hazard:**
Unauthorized access to clinician accounts even with 2FA enabled.

**Harm:**
Data breach, unauthorized viewing/editing of patient records.

**Code:**
`backend/app/models.py` (totp_secret column definition)
`backend/app/security.py` (TOTP functions assume plaintext storage)

---

### models.py

#### USER_IS_ACTIVE_DEFAULT_TRUE

**Description:** User model sets is_active=True by default, new accounts immediately active without verification.

**Causes:**

- Column default is True
- No email verification step
- No admin approval workflow

**Effect:**
Attacker can self-register and immediately access patient data (if registration endpoint open).

**Hazard:**
Unauthorized users access clinical system.

**Harm:**
Data breach, GDPR violation, patient privacy harm.

**Code:**
`backend/app/models.py` (User.is_active column definition)

---

#### NO_AUDIT_COLUMNS

**Description:** User, Role tables have no audit columns (created_at, updated_at, created_by, updated_by).

**Causes:**

- SQLAlchemy models don't define timestamp columns
- No mixin for audit trail
- No foreign key to track who made changes

**Effect:**
Cannot determine when user account created, by whom, when roles changed.

**Hazard:**
Security incident investigation hindered, cannot prove compliance with access control policies.

**Harm:**
Regulatory penalty, inability to prove proper access controls during audit.

**Code:**
`backend/app/models.py` (all model definitions missing audit columns)

---

### auth.py

#### REGISTER_ENDPOINT_NO_EMAIL_VERIFICATION

**Description:** User registration endpoint creates account immediately without email confirmation.

**Causes:**

- No verification token sent to email
- No "pending verification" state
- Account usable immediately

**Effect:**
Attacker can register with fake email and access system.

**Hazard:**
Unauthorized users access clinical data.

**Harm:**
Data breach, GDPR violation.

**Code:**
`backend/app/schemas/auth.py` (RegisterIn schema)
`backend/app/main.py` lines 255-290 (register route)

---

#### LOGIN_RESPONSE_INCLUDES_ROLES

**Description:** Login response returns user roles in HTTP response body, exposing authorization information.

**Causes:**

- Lines 280-285 return roles array in JSON
- Not necessary for client-side auth (roles in JWT payload)

**Effect:**
Attacker can enumerate role names via login endpoint.

**Hazard:**
Information disclosure aids privilege escalation attacks.

**Harm:**
Attacker learns system has "Clinician", "Administrator" roles and can craft targeted attacks.

**Code:**
`backend/app/main.py` lines 280-285 (login response body)

---

### config.py

#### SECRETS_LOGGED_ON_STARTUP

**Description:** If config.py or main.py logs settings, sensitive secrets like JWT_SECRET may be exposed in logs.

**Causes:**

- Pydantic BaseSettings **repr** includes all fields
- Dev logging may print entire settings object
- Logs shipped to external service

**Effect:**
JWT_SECRET exposed in application logs.

**Hazard:**
Attacker with log access can forge JWT tokens.

**Harm:**
Unauthorized access to all patient records.

**Code:**
`backend/app/config.py` (Settings class definition with SecretStr fields)

---

### api.ts

#### API_CLIENT_INFINITE_REFRESH_LOOP

**Description:** API client retries request after 401, but if refresh also fails with 401, redirects to login. However, if login page also makes API call that fails with 401, potential infinite redirect loop.

**Causes:**

- Lines 56-66 recursive call to request() with retry flag
- No maximum retry count
- Login page redirect may happen multiple times

**Effect:**
Browser stuck in redirect loop between app and login page.

**Hazard:**
Clinician unable to access system during emergency.

**Harm:**
Delayed treatment while clinician uses backup system.

**Code:**
`frontend/src/lib/api.ts` lines 56-66 (retry logic with no max attempts)

---

#### API_PATH_VALIDATION_INCOMPLETE

**Description:** API request validates path starts with "/" but doesn't prevent path traversal attacks ("/api/../admin").

**Causes:**

- Lines 48-51 only check startsWith("/")
- No normalization of path
- Fetch URL constructed as template string

**Effect:**
Malicious code can bypass API prefix and access unintended endpoints.

**Hazard:**
Unauthorized access to administrative endpoints.

**Harm:**
Data breach, system compromise.

**Code:**
`frontend/src/lib/api.ts` lines 48-51 (path validation)

---

### sw.js (Service Worker)

#### SERVICE_WORKER_CACHE_STALE_PATIENT_DATA

**Description:** Service worker may cache API responses for patient data, serving stale demographics when offline.

**Causes:**

- Cache-first or stale-while-revalidate strategy
- No cache invalidation on patient update
- Offline mode serves cached data without staleness warning

**Effect:**
Clinician views outdated patient demographics when offline or on slow network.

**Hazard:**
Clinical decision based on wrong age, wrong name, wrong contact details.

**Harm:**
Age-inappropriate dosage, emergency contact called for wrong patient.

**Code:**
`frontend/public/sw.js` (service worker caching strategy)

---

### push_send.py

#### PUSH_NOTIFICATION_NO_USER_ASSOCIATION

**Description:** Push subscriptions stored without user_id, cannot selectively notify specific users or roles.

**Causes:**

- In-memory list stores subscriptions without context
- No database table with user foreign key
- Backend sends to all subscribers indiscriminately

**Effect:**
Clinical notifications sent to all users, including wrong clinicians.

**Hazard:**
Clinician receives notification about patient they don't treat, ignores important notification for their own patient.

**Harm:**
Missed critical alert (lab result, drug interaction warning).

**Code:**
`backend/app/push_send.py` (in-memory subscription list)
`backend/app/push.py` (subscription endpoint without user context)

---

#### PUSH_NOTIFICATION_NO_AUTHENTICATION

**Description:** Push notification subscribe and send endpoints have no authentication requirement.

**Causes:**

- Endpoints not decorated with require_roles or current_user dependency
- Anyone can subscribe or trigger notifications

**Effect:**
Attacker can spam clinical users with fake notifications.

**Hazard:**
Clinicians desensitized to notifications, miss real critical alerts (alarm fatigue).

**Harm:**
Missed lab critical value notification, delayed treatment, patient harm.

**Code:**
`backend/app/push.py` lines 30-50 (subscribe endpoint without auth)
`backend/app/push_send.py` lines 20-40 (send endpoint without auth)

---

## Tier 3: Infrastructure Files

### RootLayout.tsx

#### LAYOUT_PATIENT_STATE_LOST_ON_NAV

**Description:** RootLayout provides patient state via outlet context but if user navigates away and back, state may be lost requiring re-fetch.

**Causes:**

- Patient state stored in component state, not React Router loader
- Navigation clears component state
- No persistent cache

**Effect:**
Unnecessary re-fetch of patient demographics, slight delay.

**Hazard:**
During re-fetch window, TopRibbon shows empty/loading state, clinician thinks patient cleared.

**Harm:**
Low clinical harm but contributes to user confusion and potential workflow error.

**Code:**
`frontend/src/RootLayout.tsx` (patient state management)

---

### Date.tsx

#### DATE_FORMAT_LOCALE_ASSUMPTION

**Description:** Date formatting component uses browser locale for date display, may not match hospital's standard format.

**Causes:**

- Intl.DateTimeFormat() uses default locale
- No forced en-GB or hospital-specific format
- US clinicians see MM/DD/YYYY, UK clinicians see DD/MM/YYYY

**Effect:**
Date interpretation ambiguity (01/02/2024 = Feb 1 or Jan 2?).

**Hazard:**
Clinician misreads appointment date or medication start date.

**Harm:**
Missed appointment, medication taken on wrong dates.

**Code:**
`frontend/src/components/date/Date.tsx` (FormattedDate component using Intl.DateTimeFormat)

---

### config.py (backend)

#### CONFIG_NO_VALIDATION_ON_LOAD

**Description:** Settings class uses pydantic-settings but doesn't validate critical fields like JWT_SECRET minimum length.

**Causes:**

- SecretStr type doesn't enforce length constraints
- No validator function for JWT_SECRET
- Weak secrets allowed (e.g., "secret123")

**Effect:**
Production deployment with weak JWT secret.

**Hazard:**
Attacker can brute force weak secret and forge tokens.

**Harm:**
Unauthorized access to all patient records.

**Code:**
`backend/app/config.py` (Settings class definition without validators)

---

#### CONFIG_DATABASE_PASSWORDS_NO_COMPLEXITY

**Description:** Database passwords loaded from env vars but no complexity requirements enforced.

**Causes:**

- pydantic SecretStr accepts any string
- No regex validation for password strength
- Dev environments may use weak passwords

**Effect:**
Production database accessible with weak password.

**Hazard:**
Attacker can brute force database credentials.

**Harm:**
Data breach, all patient records exposed.

**Code:**
`backend/app/config.py` (Settings class database password fields)

---

### auth_db.py

#### DATABASE_SESSION_NO_AUTOCOMMIT_OFF

**Description:** SQLAlchemy session configuration should explicitly disable autocommit but current code relies on defaults.

**Causes:**

- sessionmaker created without autocommit parameter
- Default is autocommit=False but not explicit
- Future SQLAlchemy version change could alter behavior

**Effect:**
Transaction boundaries unclear, potential for partial commits.

**Hazard:**
User record created but role association fails, user has no roles but is active.

**Harm:**
Unprivileged user accesses patient data they shouldn't see.

**Code:**
`backend/app/db/auth_db.py` (sessionmaker configuration)

---

#### DATABASE_CONNECTION_POOL_EXHAUSTION

**Description:** SQLAlchemy connection pool has default limits, high concurrent load could exhaust pool.

**Causes:**

- No explicit pool_size or max_overflow configuration
- Default pool_size=5 may be insufficient for production
- Long-running transactions hold connections

**Effect:**
New API requests wait for database connection, timeout.

**Hazard:**
Clinician unable to access patient data during high load.

**Harm:**
Delayed treatment while system recovers.

**Code:**
`backend/app/db/auth_db.py` (engine creation without pool configuration)

---

### Caddyfile

#### CADDY_NO_RATE_LIMITING

**Description:** Caddy reverse proxy has no rate limiting configuration, allows DoS attacks.

**Causes:**

- Caddyfile defines routes but no rate_limit directive
- No request throttling
- Attacker can flood /api endpoints

**Effect:**
Backend overwhelmed with requests, becomes unresponsive.

**Hazard:**
Clinical system unavailable during attack.

**Harm:**
Delayed treatment while clinicians use backup paper system.

**Code:**
`caddy/dev/Caddyfile` (entire configuration missing rate limiting)

---

#### CADDY_EHRBASE_ROUTE_PUBLICLY_EXPOSED

**Description:** Caddyfile exposes `/ehrbase/*` route, allows direct access to EHRbase API without backend authorization.

**Causes:**

- Line configures reverse proxy to EHRbase
- No authentication requirement on route
- Anyone can query clinical letters via AQL

**Effect:**
Attacker can bypass backend authorization and query EHRbase directly.

**Hazard:**
Unauthorized access to all clinical letters.

**Harm:**
Data breach, GDPR violation, patient privacy harm.

**Code:**
`caddy/dev/Caddyfile` (ehrbase route configuration)

---

#### CADDY_CORS_HEADERS_PERMISSIVE

**Description:** If Caddyfile configures CORS headers, overly permissive policy could allow cross-origin attacks.

**Causes:**

- Access-Control-Allow-Origin set to wildcard "\*"
- No credentials=true check
- Allows malicious site to make requests

**Effect:**
Attacker-controlled website can make API requests using victim's cookies.

**Hazard:**
CSRF attacks bypass protection, forged clinical actions.

**Harm:**
False clinical information entered into medical record.

**Code:**
`caddy/dev/Caddyfile` (CORS configuration if present)

---

### compose.dev.yml

#### DOCKER_COMPOSE_NO_RESOURCE_LIMITS

**Description:** Docker Compose file defines resource limits for databases but not for backend/frontend containers.

**Causes:**

- Backend service has no mem_limit or cpus configuration
- Runaway process can consume all host resources
- No OOM killer threshold

**Effect:**
Backend container consumes all RAM, entire system freezes.

**Hazard:**
Clinical system unavailable until manual restart.

**Harm:**
Delayed treatment while IT staff restore service.

**Code:**
`compose.dev.yml` (backend and frontend service definitions missing resources block)

---

#### DOCKER_COMPOSE_FHIR_SERVER_NO_HEALTHCHECK

**Description:** FHIR service has healthcheck but depends_on only checks container start, not health status.

**Causes:**

- Backend service depends_on fhir without condition: service_healthy
- Backend starts before FHIR server ready
- Initial requests fail until FHIR server ready

**Effect:**
Backend logs errors on startup, patients not loadable for first 30 seconds.

**Hazard:**
Clinician thinks system broken, uses backup system.

**Harm:**
Duplicate data entry in backup system.

**Code:**
`compose.dev.yml` (backend service depends_on configuration)

---

### alembic/env.py

#### ALEMBIC_MIGRATION_NO_BACKUP_PROMPT

**Description:** Alembic migrations run automatically on `alembic upgrade head` without prompting for backup.

**Causes:**

- No pre-migration hook to check for database backup
- No warning displayed to operator
- Destructive migrations can run without rollback plan

**Effect:**
Migration fails mid-operation, database left in inconsistent state.

**Hazard:**
Clinical system unusable until database restored from backup.

**Harm:**
Delayed treatment while IT staff restore database, recent patient data lost if backup stale.

**Code:**
`backend/alembic/env.py` (run_migrations functions without backup check)

---

#### ALEMBIC_DOWNGRADE_NOT_TESTED

**Description:** Alembic migrations include upgrade() functions but downgrade() functions rarely tested.

**Causes:**

- No CI/CD test of downgrade path
- Developers write upgrade only
- Downgrade may reference non-existent tables/columns

**Effect:**
Cannot rollback failed migration, must restore from backup.

**Hazard:**
Extended downtime during production incident.

**Harm:**
Delayed treatment while system restored.

**Code:**
`backend/alembic/versions/*.py` (all migration files)

---

### Dockerfile (backend)

#### DOCKERFILE_RUNS_AS_ROOT

**Description:** Backend Dockerfile creates appuser but if misconfigured, could run FastAPI as root.

**Causes:**

- USER instruction in Dockerfile but CMD could override
- Entrypoint script doesn't verify UID
- Privilege escalation vulnerability

**Effect:**
Backend process runs with root privileges inside container.

**Hazard:**
Container escape vulnerability allows attacker root access to host.

**Harm:**
Complete system compromise, all patient data exposed.

**Code:**
`backend/Dockerfile` (USER directive and CMD configuration)

---

### Justfile

#### JUSTFILE_MIGRATE_NO_CONFIRMATION

**Description:** `just migrate` command runs Alembic upgrade without confirmation prompt.

**Causes:**

- Recipe directly calls alembic upgrade head
- No "are you sure?" step
- Accidental invocation possible

**Effect:**
Developer runs migration in production by mistake.

**Hazard:**
Destructive migration runs without backup.

**Harm:**
Database corruption, patient data loss.

**Code:**
`Justfile` (migrate recipe definition)

---

---

## Summary Statistics

- **Total Hazards Identified:** 68
- **Tier 1 (Direct Clinical Data):** 28 hazards
- **Tier 2 (Clinical Workflow):** 20 hazards
- **Tier 3 (Infrastructure):** 20 hazards

---

## Next Steps

This output feeds into **Stage 3: Deduplication** to consolidate similar hazards and ensure each unique hazard is documented once with all associated code locations.
