# Plan: Organisation-scoped access control + external access

## TL;DR

Enforce organisation boundaries so staff see only their org's patients and messages. Messages auto-include all shared orgs between creator and patient, and snowball when cross-org participants join. Add `external_hcp` and `patient_advocate` user types who gain per-patient access via invite-only registration (JWT link from patient or admin). External users see the full patient record and all messages for their granted patients. All endpoints enforce RBAC + CBAC.

## Design decisions

1. **Multi-org**: Staff and patients can belong to multiple orgs
2. **Strict internal boundary**: Staff see only patients in their org(s)
3. **Message org set**: Many-to-many with orgs. Auto-includes ALL shared orgs of creator + patient at creation. Snowballs when cross-org participants join. All staff in any linked org can view/contribute
4. **No org prompt**: All shared orgs are auto-added — no user selection needed
5. **Admin/superadmin**: System administration only, no extra clinical access. Superadmins see all patients only on admin pages
6. **External HCP**: `system_permissions = "external_hcp"`. Per-patient read-only clinical + messaging. No org membership. Writing clinical notes requires subscription (future)
7. **Patient advocate**: `system_permissions = "patient_advocate"`. Family, friends, solicitors, carers. Per-patient access, simple on/off for now (granular levels later)
8. **Invite-only**: No public registration page. External users join ONLY via invite from patient or admin. JWT in invite URL encodes patient_id, user_type, expiry
9. **Invite flow**: Click JWT link → if new user: registration form (single page, type from JWT) → auto-grant access. If existing user: login → auto-grant access
10. **Access grants**: Patient or admin sends invite. Only admin can revoke
11. **External user visibility**: External users see the FULL patient record and ALL messages for granted patients (not just ones they participate in)
12. **ExternalPatientAccess is many-to-many**: One external user can have access to multiple patients (separate row per patient). One patient can have multiple external users
13. **No org badge on messages**: Participant list is what matters
14. **British spelling**: "organisation" in all new code/comments/UI. Existing model names unchanged
15. **RBAC + CBAC on all endpoints**: Every endpoint checks system_permissions and competencies
16. **Existing messages**: Dev data, can be deleted

## Current state

- Organisation models exist (`Organization`, association tables) but access not enforced
- No User-to-FHIR link (User has no fhir_patient_id)
- Messaging has no org awareness
- system_permissions: patient | staff | admin | superadmin (no external_hcp or patient_advocate)
- No CBAC checks on messaging or patient endpoints
- Inconsistent spelling: class `Organization`, tables `organizations`, association tables `organisation_*`

---

## Phase 1: Data model foundations

### 1.1 Add `fhir_patient_id` to User model

- Add `fhir_patient_id: Mapped[str | None]` (nullable, unique) to User
- Links a patient user to their FHIR patient record (separate entities, linked on opt-in)
- File: `backend/app/models.py`
- Alembic migration

### 1.2 Add `external_hcp` and `patient_advocate` to system_permissions

- Update `SystemPermission` Literal to include `external_hcp` and `patient_advocate`
- Hierarchy: both sit alongside `patient` (lowest clinical access)
- `external_hcp`: clinician outside Quill orgs, per-patient read-only clinical + messaging
- `patient_advocate`: family/friends/solicitors/carers, per-patient access (simple on/off for now)
- Update `String(20)` column length if needed
- Files: `backend/app/system_permissions/permissions.py`, `backend/app/models.py`

### 1.3 Create ExternalPatientAccess model (many-to-many: external users ↔ patients)

- New model `ExternalPatientAccess`:
  - `id` (PK)
  - `user_id` (FK to users.id) — the external HCP or patient advocate
  - `patient_id` (String, FHIR patient ID) — the patient they have access to
  - `granted_by_user_id` (FK to users.id) — the patient user or admin who granted access
  - `granted_at` (datetime)
  - `revoked_at` (datetime, nullable) — set by admin to revoke
  - `access_level` (String, default "full") — for future granularity (messaging_only, read_clinical, full)
  - Unique constraint on (user_id, patient_id) — one access record per user-patient pair
- One external user can have multiple rows (access to multiple patients)
- One patient can have multiple rows (multiple external users)
- File: `backend/app/models.py`
- Alembic migration

### 1.4 Create message_organisation many-to-many

- New association table `message_organisation`:
  - `conversation_id` (FK to conversations.id)
  - `organisation_id` (FK to organizations.id)
  - Composite PK
- Add relationship on Conversation model
- File: `backend/app/models.py`
- Alembic migration (combined with above)

### 1.5 Create organisation helpers module

- New file: `backend/app/organisations.py`
- Functions:
  - `get_user_org_ids(db, user_id) -> list[int]`
  - `get_patient_org_ids(db, patient_id) -> list[int]`
  - `get_shared_org_ids(db, user_id, patient_id) -> list[int]`
  - `check_user_patient_access(db, user, patient_id) -> bool` — checks org membership OR ExternalPatientAccess
  - `get_org_patient_ids(db, org_ids) -> set[str]`
  - `get_org_staff_ids(db, org_ids) -> set[int]`
  - `get_accessible_patient_ids(db, user) -> set[str]` — returns all patient IDs a user can access (via orgs or external grants)
- Tests for all helpers

---

## Phase 2: Organisation-scoped patient and staff lists

### 2.1 Org-filtered patient list

- Update `GET /patients`: filter to user's org(s) for staff/admin on clinical pages
- Admin pages: full list via `?scope=admin` param (requires admin/superadmin)
- External HCP/advocate: return only patients they have ExternalPatientAccess for
- CBAC: require appropriate competency to view patient data
- File: `backend/app/main.py`

### 2.2 Org-filtered staff list for participant selection

- Add query param to `GET /users`: `?patient_id={id}` returns only staff who share an org with that patient
- Also include external users who have ExternalPatientAccess for that patient
- Used by NewMessageModal when selecting participants
- File: `backend/app/main.py`

### 2.3 Frontend: NewMessageModal updates

- After patient selection, re-fetch staff filtered by patient's org(s) + external users with access
- File: `frontend/src/components/messaging/NewMessageModal.tsx`

### 2.4 Tests

- Staff sees only their org's patients
- External HCP/advocate sees only granted patients
- Admin override on admin pages
- Filtered staff list by patient org
- CBAC enforcement

---

## Phase 3: Organisation-scoped messages

### 3.1 Message creation with auto org context

- Update `create_conversation()`:
  - Compute shared orgs between creator and patient
  - Auto-add ALL shared orgs to message_organisation table
  - For external users: no org needed (they have per-patient access)
  - Validate creator has access to patient (via org or external grant)
- Files: `backend/app/schemas/messaging.py`, `backend/app/messaging.py`

### 3.2 Cross-org participant snowball

- When a participant from a different org is added (`add_participant`):
  - Get participant's org(s)
  - Add those org(s) to message_organisation
  - All staff in those orgs can now view the message thread
- When a staff member self-joins (`join_conversation`):
  - Verify they're in one of the message's orgs
- File: `backend/app/messaging.py`

### 3.3 Message listing and access filters

- `list_conversations()`: filter where user is participant OR user's org(s) overlap with message's orgs
- `list_patient_conversations()`: same org filter
- `get_conversation_detail()`: verify user has access via participation or org membership
- External users: see ALL messages for their granted patients (not just ones they participate in)
- File: `backend/app/messaging.py`

### 3.4 RBAC + CBAC on all messaging endpoints

- All messaging endpoints check system_permissions (reject patient_advocate if no messaging competency, etc.)
- Add CBAC competency checks where appropriate (e.g. viewing clinical messages)
- File: `backend/app/main.py`

### 3.5 Tests

- Auto org set on message creation
- Cross-org snowball on participant add
- List filtering by org
- External user sees all messages for granted patient
- RBAC/CBAC enforcement on all messaging endpoints

---

## Phase 4: Frontend org context in messaging

### 4.1 Shared orgs endpoint (for display, not selection)

- New endpoint: `GET /patients/{patient_id}/shared-organisations`
- Returns orgs shared between current user and patient
- For external users: returns empty (they use per-patient access)
- File: `backend/app/main.py`

### 4.2 NewMessageModal updates

- Remove org selector (no longer needed — all shared orgs auto-added)
- If user has 0 shared orgs AND is not external: show error "You do not share an organisation with this patient"
- External users: skip org check entirely (access via ExternalPatientAccess)
- Files: `frontend/src/components/messaging/NewMessageModal.tsx`, `frontend/src/lib/messaging.ts`

### 4.3 Tests

- Auto-org story + test
- External user no-org story + test
- Zero-shared-org error story + test

---

## Phase 5: Invite-only external registration and access

### 5.1 Backend: invite generation

- `POST /patients/{patient_id}/invite-external`
  - Called by patient user or admin
  - Requires CSRF
  - Accepts: `email` (recipient), `user_type` ("external_hcp" | "patient_advocate")
  - Generates JWT containing: patient_id, user_type, email, expiry
  - Sends email with invite link containing JWT
  - Also returns: invite URL (for QR code generation on frontend)
  - Does NOT create ExternalPatientAccess yet (created on accept)
- File: `backend/app/main.py`

### 5.2 Backend: invite acceptance / registration

- `POST /accept-invite` — single endpoint, single page
  - Accepts JWT from URL
  - Decodes JWT to get patient_id, user_type, email
  - If user already exists (by email): grant access immediately (create ExternalPatientAccess), return login redirect
  - If new user: accept registration fields (name, password) + set up 2FA
    - Create user with `system_permissions` = user_type from JWT
    - Create ExternalPatientAccess record
    - Return login redirect
- File: `backend/app/main.py`

### 5.3 Backend: admin revocation

- `DELETE /patients/{patient_id}/external-access/{user_id}`
  - Admin-only: sets `revoked_at` on ExternalPatientAccess
  - CSRF required
- File: `backend/app/main.py`

### 5.4 Frontend: patient invite UI

- On patient's profile/settings or dedicated page
- Single form with:
  - Email address input
  - Dropdown: "External healthcare professional" or "Family member / advocate"
  - Submit sends invite
- Show QR code / copy link after invite generated
- Show list of external users with access to this patient (with type label)
- Files: new component in `frontend/src/components/`

### 5.5 Frontend: invite acceptance page

- Single page at `/accept-invite?token={jwt}`
- Decodes JWT to show: patient name (from FHIR), access type
- If new user: registration form (name, email pre-filled from JWT, password, 2FA setup)
- If existing user: "Click to accept access" button (then redirect to login)
- Files: `frontend/public_pages/` or new route

### 5.6 Tests

- Invite generation (email + QR/link)
- New user registration via invite
- Existing user auto-grant via invite
- Expired JWT rejected
- Admin revocation
- External user can view full patient record and all messages
- External user cannot view other patients
- RBAC enforcement

---

## Phase 6: Organisation management cleanup

### 6.1 Remove staff/patients from orgs (currently missing)

- `DELETE /organizations/{org_id}/staff/{user_id}`
- `DELETE /organizations/{org_id}/patients/{patient_id}`
- Admin/superadmin only, CSRF required
- File: `backend/app/main.py`

### 6.2 Frontend admin pages

- Add remove buttons to OrganisationAdminPage staff/patient lists
- Files: `frontend/src/pages/admin/organisations/OrganisationAdminPage.tsx`

### 6.3 Admin endpoint: link patient user to FHIR record

- `PATCH /users/{user_id}/link-patient` (admin only)
- Validates FHIR patient exists and not already linked
- File: `backend/app/main.py`

### 6.4 Tests

---

## Relevant files

- `backend/app/models.py` — User, Conversation, Organization, new ExternalPatientAccess, new message_organisation
- `backend/app/main.py` — all endpoint changes
- `backend/app/messaging.py` — org-scoped messaging functions
- `backend/app/schemas/messaging.py` — schema updates
- `backend/app/system_permissions/permissions.py` — add external_hcp, patient_advocate
- `backend/app/organisations.py` — NEW: org access helpers
- `backend/app/security.py` — JWT generation for invite tokens
- `frontend/src/lib/messaging.ts` — API types
- `frontend/src/components/messaging/NewMessageModal.tsx` — filtered staff, no org selector
- `frontend/src/pages/Messages.tsx`, `PatientMessages.tsx` — list pages
- `backend/tests/test_messaging.py` — tests

## Verification

1. Two orgs with different staff/patients: staff in A sees only A's patients
2. Message creation auto-adds all shared orgs
3. Adding participant from org B snowballs org B access to message thread
4. Superadmin on admin pages sees all patients; clinical pages only their org's
5. Patient sends invite to external HCP: HCP registers via JWT link, gains access
6. Patient sends invite to advocate: advocate registers via JWT link, gains access
7. External user sees full patient record and all messages for granted patient
8. External user cannot see other patients
9. Admin can revoke external access
10. All endpoints enforce RBAC + CBAC
11. `just ub` and `just uf` pass

## Noted for future (not this work)

- External referrals to non-Quill specialities (e.g. tertiary neurosurgery referral)
- Subscription paywall for external HCP clinical note writing
- Push notification org scoping
- Audit logging for org membership changes
- Granular access levels for patient advocates (messaging_only, read_clinical, full)
