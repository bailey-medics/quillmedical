# Quill Medical - Technical Specification

**Last Updated:** 4 February 2026
**Version:** 0.1.0
**Status:** Early Development

---

## Executive Summary

Quill Medical is a secure messaging and clinical letter platform that enables patients to communicate with clinics, receive responses, and obtain signed letters with fair and transparent billing. The system uses healthcare interoperability standards (FHIR R4 for demographics, OpenEHR for clinical documents) to create durable, auditable, tamper-evident records.

### Current Implementation Status

**Phase:** Foundation Infrastructure ✅ | Core Features ⚠️ | Business Logic ❌

The system currently has:

- ✅ **Complete**: Authentication, FHIR/OpenEHR integration, patient demographics, clinical letters storage
- ⚠️ **Partial**: Patient management UI, letter creation (API only, no UI)
- ❌ **Not Started**: Messaging workflow, quotes/payments, billing, subscriptions, clinician assignment, letter workflows

---

## Technology Stack

### Backend

- **Framework**: FastAPI 0.115.2 (Python 3.13)
- **Databases**:
  - PostgreSQL 16 (auth + application state)
  - HAPI FHIR Server (patient demographics, FHIR R4)
  - EHRbase v2 (clinical documents, OpenEHR)
- **Authentication**: JWT (HS256), TOTP (pyotp), Argon2 password hashing
- **ORM**: SQLAlchemy 2.0.35
- **Migrations**: Alembic 1.16.5
- **Push Notifications**: pywebpush 2.0.3

### Frontend

- **Framework**: React 19.1.1, TypeScript, Vite
- **UI Library**: Mantine 8.3.1
- **Routing**: React Router 7.9.1
- **HTTP Client**: Axios 1.12.2
- **Type**: Single Page Application (SPA) + Progressive Web App (PWA)

### Infrastructure

- **Containerisation**: Docker Compose
- **Reverse Proxy**: Caddy (automatic HTTPS)
- **Development**: Hot reload for both frontend and backend

---

## Architecture Overview

### Multi-Database Architecture

```
┌──────────────┐
│   Client     │
└──────┬───────┘
       │ HTTPS (Caddy)
       ↓
┌──────────────┐      ┌──────────────────┐
│   FastAPI    │────→ │ PostgreSQL       │
│   Backend    │      │ (auth + users)   │
└──────┬───────┘      └──────────────────┘
       │
       ├────────────→ ┌──────────────────┐
       │              │ HAPI FHIR Server │
       │              │ (patient demos)  │
       │              └──────────────────┘
       │
       └────────────→ ┌──────────────────┐
                      │    EHRbase       │
                      │ (clinical docs)  │
                      └──────────────────┘
```

**Rationale for Three Databases:**

- **Security**: Isolation of auth credentials, patient data, and clinical records
- **Standards**: FHIR and OpenEHR require dedicated servers
- **Performance**: Independent resource allocation per service
- **Compliance**: Clear data boundaries for healthcare audit requirements

### API Prefix

All backend endpoints use `/api` prefix (configured in `app.config.API_PREFIX`)

### Frontend Base URL

Frontend served at `/app/` via Caddy reverse proxy (configured in `vite.config.ts` as `base: '/app/'`)

---

## Authentication & Authorization

### Implemented Features ✅

#### JWT-Based Authentication

- **Access Token**: 15-minute lifetime, stored in HTTP-only cookie
- **Refresh Token**: 7-day lifetime, stored in HTTP-only cookie
- **CSRF Token**: Stored in non-HTTP-only cookie (readable by JS for header)
- **Algorithm**: HS256 (symmetric signing)
- **Cookie Security**: HTTP-only, SameSite=Lax, Secure flag (configurable)

#### Password Security

- **Hashing**: Argon2 via `passlib[argon2]`
- **Minimum Length**: 6 characters (enforced at registration)
- **Storage**: Only hashed passwords stored, never plaintext

#### Two-Factor Authentication (TOTP)

- **Library**: `pyotp` (RFC 6238 compliant)
- **Setup Flow**:
  1. User requests setup → backend generates secret
  2. Backend returns provision URI (compatible with Google Authenticator, Authy, etc.)
  3. User scans QR code
  4. User verifies 6-digit code → TOTP enabled
- **Login Flow**: When TOTP enabled, login requires `totp_code` parameter
- **Disable**: Requires CSRF token (state-changing operation)

#### Role-Based Access Control (RBAC)

- **Roles Table**: `roles` (id, name)
- **User-Role Association**: `user_role` (many-to-many)
- **Enforcement**: Decorator `require_roles(*role_names)` on routes
- **Current Roles**: Only "Clinician" role actively used (for patient/letter operations)

### API Endpoints

#### POST `/api/auth/login`

**Purpose**: Authenticate user and set auth cookies

**Request:**

```json
{
  "username": "string",
  "password": "string",
  "totp_code": "string | null" // Required if TOTP enabled
}
```

**Response (200):**

```json
{
  "detail": "ok",
  "user": {
    "username": "string",
    "roles": ["string"]
  }
}
```

**Errors:**

- 400: Invalid credentials
- 400: `{"message": "Two-factor required", "error_code": "two_factor_required"}`
- 400: `{"message": "Invalid two-factor code", "error_code": "invalid_totp"}`

**Cookies Set:**

- `access_token` (HTTP-only, path=/)
- `refresh_token` (HTTP-only, path=/api/auth/refresh)
- `XSRF-TOKEN` (readable by JS, path=/)

#### POST `/api/auth/register`

**Purpose**: Create new user account

**Request:**

```json
{
  "username": "string",
  "email": "string",
  "password": "string" // min 6 chars
}
```

**Response (200):**

```json
{
  "detail": "User created"
}
```

**Errors:**

- 400: Missing fields
- 400: Password too short
- 400: Username or email already exists

#### GET `/api/auth/me`

**Purpose**: Get current user profile

**Authentication**: Required (JWT cookie)

**Response (200):**

```json
{
  "username": "string",
  "email": "string",
  "roles": ["string"],
  "totp_enabled": boolean
}
```

#### POST `/api/auth/refresh`

**Purpose**: Rotate tokens (issues new access + refresh + CSRF)

**Authentication**: Requires `refresh_token` cookie

**Response (200):**

```json
{
  "detail": "ok"
}
```

**Cookies Set**: New access_token, refresh_token, XSRF-TOKEN

**Errors:**

- 401: Invalid or missing refresh token

#### POST `/api/auth/logout`

**Purpose**: End session and clear auth cookies

**Authentication**: Required (JWT cookie)

**Response (200):**

```json
{
  "detail": "Logged out"
}
```

**Cookies Deleted**: access_token, refresh_token, XSRF-TOKEN

#### POST `/api/auth/totp/setup`

**Purpose**: Generate TOTP secret and provision URI

**Authentication**: Required (JWT cookie)

**Response (200):**

```json
{
  "provision_uri": "otpauth://totp/Quill:username?secret=...&issuer=Quill"
}
```

**Implementation**: Frontend renders this as QR code using `qrcode` library

#### POST `/api/auth/totp/verify`

**Purpose**: Verify TOTP code and enable 2FA

**Authentication**: Required (JWT cookie)

**Request:**

```json
{
  "code": "123456" // 6-digit string
}
```

**Response (200):**

```json
{
  "detail": "TOTP verified and enabled"
}
```

**Errors:**

- 400: Invalid TOTP code

#### POST `/api/auth/totp/disable`

**Purpose**: Disable TOTP and clear secret

**Authentication**: Required (JWT cookie + CSRF token)

**CSRF**: Requires `X-CSRF-Token` header

**Response (200):**

```json
{
  "detail": "TOTP disabled"
}
```

### Security Implementation Details

**CSRF Protection:**

- Token generated via `itsdangerous.Signer`
- Signed with `JWT_SECRET` + username
- Validated by `require_csrf` dependency
- Required for all state-changing operations by clinicians

**Token Refresh Strategy:**

- Access token expires after 15 minutes
- Frontend automatically calls `/api/auth/refresh` on 401 responses
- If refresh fails → redirect to login
- Refresh token stored in HTTP-only cookie (not accessible to JS)

**Cookie Domain:**

- Configurable via `COOKIE_DOMAIN` env var
- Defaults to None (current domain)
- Required for subdomain deployments

---

## Patient Management (FHIR Integration)

### Implemented Features ✅

The system integrates with HAPI FHIR Server to manage patient demographics using FHIR R4 standard.

#### Data Model

**FHIR Patient Resource Fields Used:**

- `id`: FHIR-assigned patient identifier
- `name[0].family`: Surname
- `name[0].given[]`: First/middle names
- `birthDate`: Date of birth (YYYY-MM-DD)
- `gender`: male | female | other | unknown
- `identifier[]`: NHS number, MRN, etc.
  - `system`: "<https://fhir.nhs.uk/Id/nhs-number>"
  - `value`: 10-digit NHS number

**Frontend Patient Type** (`frontend/src/domains/patient.ts`):

```typescript
type Patient = {
  id: string;
  name: string;
  dob?: string;
  age?: number;
  sex?: string;
  nhsNumber?: string;
  address?: string;
  telephone?: string;
  mobile?: string;
  onQuill?: boolean;
  nextOfKin?: {
    name?: string;
    phone?: string;
  };
};
```

⚠️ **TODO**: Update Patient type to align with FHIR R4 Patient resource standard. Fields like `address`, `telecom` (telephone/mobile), and `contact` (next of kin) should map to FHIR ContactPoint, Address, and Patient.contact structures. The `onQuill` boolean needs FHIR extension definition.

### API Endpoints

#### GET `/api/patients`

**Purpose**: List all patients from FHIR server

**Authentication**: Required (JWT cookie)

**Response (200):**

```json
{
  "patients": [
    {
      "resourceType": "Patient",
      "id": "string",
      "name": [{"family": "string", "given": ["string"]}],
      "birthDate": "YYYY-MM-DD",
      "gender": "string",
      "identifier": [...]
    }
  ]
}
```

**Implementation**: Calls `fhirclient.list_fhir_patients()` → HAPI FHIR API

#### POST `/api/patients`

**Purpose**: Create new patient in FHIR server

**Authentication**: Required (JWT cookie)

⚠️ **INCOMPLETE**: Route conflict exists - two POST `/api/patients` endpoints defined (lines 579 and 698 in main.py). Only the last one (line 698) is registered by FastAPI. **Decision: Combine these into single endpoint** with optional query parameters for verification functionality.

**Current Active Route (line 698):**

```json
Request: {
  "given_name": "string",
  "family_name": "string",
  "patient_id": "string | null"  // Optional FHIR ID
}

Response (200): <FHIR Patient resource>
```

**TODO**: Merge conflicting route (line 579) verification logic into this endpoint.

#### GET `/api/patients/{patient_id}/demographics`

**Purpose**: Fetch patient demographics from FHIR

**Authentication**: Required (JWT cookie)

**Response (200):**

```json
{
  "patient_id": "string",
  "data": <FHIR Patient resource>
}
```

**Errors:**

- 404: Patient not found

#### PUT `/api/patients/{patient_id}/demographics`

**Purpose**: Update patient demographics in FHIR

**Authentication**: Required (Clinician role + CSRF token)

**Request:** FHIR-compatible demographics fields (free-form dict)

**Response (200):**

```json
{
  "patient_id": "string",
  "updated": <FHIR Patient resource>
}
```

**Implementation**: Calls `fhirclient.update_fhir_patient(patient_id, demographics)`

### FHIR Client Implementation (`backend/app/fhir_client.py`)

**Functions:**

- `list_fhir_patients()` → GET /fhir/Patient
- `read_fhir_patient(patient_id)` → GET /fhir/Patient/{id}
- `create_fhir_patient(given, family, patient_id)` → POST /fhir/Patient
- `update_fhir_patient(patient_id, data)` → PUT /fhir/Patient/{id}

**HTTP Client**: Uses `fhirclient` library (v4.3.2)

**Configuration**:

- FHIR Server URL: `settings.FHIR_SERVER_URL` (default: <http://fhir:8080/fhir>)

### Frontend Implementation

**Page**: `frontend/src/pages/Home.tsx`

**Functionality**:

1. Fetches patients via `api.get('/patients')`
2. Transforms FHIR resources to internal `Patient` type:
   - Concatenates `given` + `family` names
   - Extracts NHS number from identifiers (system = "<https://fhir.nhs.uk/Id/nhs-number>")
   - Calculates age from birth date
3. Displays patient cards with demographics
4. Shows loading skeleton during fetch
5. Error handling with toast notifications

⚠️ **INCOMPLETE**: No UI for creating/editing patients - only viewing existing FHIR data

---

## Clinical Letters (OpenEHR Integration)

### Implemented Features ✅

The system integrates with EHRbase to store clinical letters and documents using OpenEHR Compositions.

#### Data Model

**Letter Schema** (`backend/app/schemas/letters.py`):

```python
class LetterIn(BaseModel):
    title: str
    body: str  # Markdown format
    author_name: str | None = None
    author_email: str | None = None
```

**OpenEHR Composition Structure**:

- Template: "quill_letter.v1"
- Archetype: Custom letter composition
- Composer: Author name/email
- Content: Letter body (Markdown stored as string)

⚠️ **TODO**: Create OpenEHR template `quill_letter.v1` and upload to EHRbase. Template not yet implemented but required for letter composition creation.

### API Endpoints

#### POST `/api/patients/{patient_id}/letters`

**Purpose**: Create new letter composition in EHRbase

**Authentication**: Required (Clinician role + CSRF token)

**Request:**

```json
{
  "title": "string",
  "body": "string", // Markdown
  "author_name": "string | null",
  "author_email": "string | null"
}
```

**Response (200):**

```json
{
  "composition_uid": "string",
  "patient_id": "string",
  "title": "string"
}
```

**Implementation**:

1. Ensures patient has EHR in EHRbase (creates if missing)
2. Creates OpenEHR Composition with letter data
3. Returns composition UID for future retrieval

#### GET `/api/patients/{patient_id}/letters`

**Purpose**: List all letters for patient from EHRbase

**Authentication**: Required (JWT cookie)

**Response (200):**

```json
{
  "patient_id": "string",
  "letters": [
    {
      "uid": "string",
      "title": "string",
      "created": "ISO8601 timestamp"
    }
  ]
}
```

**Implementation**: Uses EHRbase AQL query to find all compositions for patient's EHR

#### GET `/api/patients/{patient_id}/letters/{composition_uid}`

**Purpose**: Retrieve specific letter composition

**Authentication**: Required (JWT cookie)

**Response (200):**

```json
{
  "composition_uid": "string",
  "patient_id": "string",
  "title": "string",
  "body": "string",
  "author_name": "string | null",
  "author_email": "string | null",
  "created": "ISO8601 timestamp"
}
```

**Errors:**

- 404: Letter not found
- 500: EHRbase retrieval failure

### EHRbase Client Implementation (`backend/app/ehrbase_client.py`)

**Functions:**

- `ensure_ehr_for_patient(patient_id)` → Creates EHR if doesn't exist
- `create_letter_composition(patient_id, letter_data)` → POST composition
- `list_letters_for_patient(patient_id)` → AQL query
- `get_letter_composition(patient_id, composition_uid)` → GET composition

**HTTP Client**: Raw `httpx` (no dedicated EHRbase Python library)

**Authentication**: Basic auth with `EHRBASE_API_USER` + `EHRBASE_API_PASSWORD`

**Configuration**:

- EHRbase URL: `settings.EHRBASE_URL` (default: <http://ehrbase:8080/ehrbase>)
- Admin credentials for EHR creation operations

### Letter Workflow Status

🔍 **ASSUMPTION**: The SPEC.md document describes a full letter workflow with states (DRAFT → REVIEW → APPROVED → SENT → ACKNOWLEDGED), but this is **NOT implemented** in current codebase. Only letter creation/storage exists.

**Current Implementation**: Simple CRUD for letters
**Planned** (per SPEC.md): Multi-stage approval workflow with PDF generation, signing, distribution

⚠️ **INCOMPLETE**:

- No letter states/workflow
- No PDF rendering
- No digital signatures
- No letter sending/distribution
- No recipient management
- No approval process

---

## Push Notifications

### Implemented Features ✅

Web Push notifications using pywebpush (WebPush protocol, RFC 8030).

#### Data Model

**Subscription Schema** (`backend/app/push.py`):

```python
class PushSubscription(BaseModel):
    endpoint: str  # Browser push service URL
    expirationTime: int | None
    keys: PushKeys  # p256dh, auth

class PushKeys(BaseModel):
    p256dh: str  # Public key
    auth: str  # Auth secret
```

**Storage**: In-memory list (NOT persisted to database)

⚠️ **DECISION NEEDED**: Determine production persistence strategy - PostgreSQL table, Redis, or other solution. Current in-memory storage will not survive restarts.

### API Endpoints

#### POST `/api/push/subscribe`

**Purpose**: Register device for push notifications

**Authentication**: None (public endpoint)

⚠️ **TODO**: Add JWT authentication requirement - endpoint should verify user identity before accepting subscriptions

**Request:**

```json
{
  "endpoint": "string",
  "expirationTime": number | null,
  "keys": {
    "p256dh": "string",
    "auth": "string"
  }
}
```

**Response (200):**

```json
{
  "ok": true,
  "count": number  // Total subscribers
}
```

**Implementation**: De-duplicates by endpoint URL

#### POST `/api/push/send-test`

**Purpose**: Send test notification to all subscribers

**Authentication**: None (public endpoint)

⚠️ **TODO**: Add JWT authentication requirement - endpoint should require authenticated user (ideally admin role) before sending notifications

**Response (200):**

```json
{
  "sent": true,
  "removed": ["endpoint1", ...]  // Invalid subscriptions
}
```

**Notification Payload:**

```json
{
  "title": "Quill",
  "body": "Test notification",
  "data": { "url": "/app/" }
}
```

**Error Handling**: Automatically removes failed subscriptions (410 Gone, invalid endpoints)

### VAPID Configuration

**Environment Variables**:

- `VAPID_PRIVATE`: Private key for signing push messages
- `COMPANY_EMAIL`: Contact email (default: mailto:admin@example.com)

**Generation**: Use `yarn dlx web-push generate-vapid-keys` (frontend package.json script)

### Frontend Integration

⚠️ **INCOMPLETE**:

- Push notification UI exists in Settings page but actual subscription logic not verified
- Service Worker (`public/sw.js`) exists but has not been extensively worked on - push event handling not fully implemented
- Background notification display and click handling need development

---

## Database Schema

### Auth Database (PostgreSQL)

**Tables:**

#### `users`

| Column          | Type         | Constraints               |
| --------------- | ------------ | ------------------------- |
| id              | INTEGER      | PRIMARY KEY               |
| username        | VARCHAR(150) | UNIQUE, NOT NULL, INDEXED |
| email           | VARCHAR(255) | UNIQUE, NOT NULL          |
| password_hash   | VARCHAR(255) | NOT NULL                  |
| totp_secret     | VARCHAR(64)  | NULLABLE                  |
| is_totp_enabled | BOOLEAN      | DEFAULT FALSE             |
| is_active       | BOOLEAN      | DEFAULT TRUE              |

#### `roles`

| Column | Type        | Constraints      |
| ------ | ----------- | ---------------- |
| id     | INTEGER     | PRIMARY KEY      |
| name   | VARCHAR(64) | UNIQUE, NOT NULL |

#### `user_role` (join table)

| Column  | Type    | Constraints              |
| ------- | ------- | ------------------------ |
| user_id | INTEGER | FK users.id, PRIMARY KEY |
| role_id | INTEGER | FK roles.id, PRIMARY KEY |

**Migrations**: Managed by Alembic, 7 migration files in `backend/alembic/versions/`

### FHIR Database (PostgreSQL via HAPI FHIR)

Managed by HAPI FHIR Server - schema auto-generated by Hibernate.

**Key Tables** (HAPI internal):

- `hfj_resource`: Stores FHIR resources
- `hfj_res_ver`: Resource versions
- `hfj_idx_*`: Search parameter indexes

**Access**: Via FHIR REST API, not direct SQL

### EHRbase Database (PostgreSQL via EHRbase)

Managed by EHRbase - schema follows openEHR Reference Model.

**Key Tables** (EHRbase internal):

- `ehr`: Electronic Health Records
- `composition`: Clinical documents
- `entry`: Composition entries
- `contribution`: Audit trail

**Access**: Via EHRbase REST API and AQL, not direct SQL

---

## Missing Features vs. SPEC.md

The SPEC.md document describes a comprehensive messaging and billing system. Current implementation has foundational infrastructure but lacks core business logic.

### ❌ NOT IMPLEMENTED

#### Messaging System

- No conversation/thread model
- No message sending/receiving
- No message states (NEW → ADMIN_REVIEW → etc.)
- No administrator message triage
- No clinician assignment

#### Billing & Payments

- No quote generation
- No time estimation (6-minute units)
- No Stripe integration
- No payment tracking
- No subscription management
- No pricing configuration

#### Letter Workflow

- No letter states (DRAFT → REVIEW → APPROVED → SENT → ACKNOWLEDGED)
- No approval process
- No PDF generation
- No digital signatures (Git hash signing mentioned in SPEC)
- No letter sending/distribution
- No recipient management (patient, GP, insurer)

#### User Roles (beyond basic RBAC)

- Only "Clinician" role exists in code
- Administrator, Clinic Owner, Billing Staff roles not implemented
- No role-specific UI/workflows

#### Audit Logging (Enterprise-Level Required)

- No append-only audit log yet
- Need cryptographic hash chain linking each action to previous state
- Must capture: who performed action, what was changed, when it occurred, before/after state
- Required for clinical-grade compliance and tamper-evidence
- Implementation spans all phases - should start in Phase 1

#### Consent Management

- No consent capture
- No consent events

#### Service Levels (Bronze/Silver/Gold)

- No SLA tracking
- No response time monitoring
- No breach notifications

---

## Frontend Architecture

### Routing Structure

**Base URL**: `/app/` (configured in vite.config.ts)

**Route Protection**:

- `<RequireAuth>`: Redirects to login if not authenticated
- `<GuestOnly>`: Redirects to home if authenticated

**Routes**:

| Path              | Component    | Protection | Purpose           |
| ----------------- | ------------ | ---------- | ----------------- |
| `/app/`           | Home         | Protected  | Patient dashboard |
| `/app/login`      | LoginPage    | Guest      | Authentication    |
| `/app/register`   | RegisterPage | Guest      | User registration |
| `/app/settings`   | Settings     | Protected  | Account settings  |
| `/app/totp-setup` | TotpSetup    | Protected  | 2FA configuration |
| `/app/about`      | About        | Protected  | App information   |
| `/app/*`          | NotFound     | Public     | 404 handler       |

### State Management

**Auth Context** (`frontend/src/auth/AuthContext.tsx`):

- Provides global user state
- Handles automatic token refresh
- Manages login/logout
- Persists nothing to localStorage (relies on HTTP-only cookies)

**Local State**: React `useState` for component-specific UI state

### API Client (`frontend/src/lib/api.ts`)

**Features**:

- Prefixes all requests with `/api`
- Automatically includes credentials (cookies)
- Auto-refreshes tokens on 401 responses
- Redirects to login on auth failure
- Extracts `response.data.detail` for error messages

**Methods**:

```typescript
api.get(url, config?)
api.post(url, data?, config?)
api.put(url, data?, config?)
api.delete(url, config?)
```

### Component Library

**UI Framework**: Mantine 8.3.1

**Key Components Used**:

- Layout: Container, Stack, Group, Paper
- Forms: TextInput, PasswordInput, Button
- Data: Table, Card
- Feedback: Notifications (toast), Skeleton (loading)

### Progressive Web App (PWA)

**Manifest**: `public/manifest.webmanifest`
**Service Worker**: `public/sw.js`

⚠️ **INCOMPLETE**: PWA infrastructure files exist but service worker has not been extensively developed. Push notification handling, offline functionality, and caching strategies need implementation.

---

## Development Workflow

### Backend Development

**Start Services**:

```bash
just start-dev  # or: docker compose -f compose.dev.yml up
```

**Run Migrations**:

```bash
just migrate "description"  # Auto-generates + applies Alembic migration
```

**Create User**:

```bash
just create-user  # Interactive user creation in container
```

**Run Tests**:

```bash
just unit-tests-backend  # pytest in backend/tests
```

**Type Checking**:

- MyPy with `--strict` mode enabled
- All functions require type annotations

**Code Quality**:

- Ruff for linting
- Black for formatting (excluded: alembic/versions)

### Frontend Development

**Hot Reload**: Vite dev server auto-reloads on file changes

**Run Tests**:

```bash
just unit-tests-frontend  # vitest with jsdom
```

**Linting**:

```bash
yarn eslint  # ESLint with React/TypeScript rules
yarn prettier  # Prettier for formatting
yarn stylelint  # CSS/SCSS linting
```

**Build Storybook**:

```bash
yarn storybook:build  # Outputs to docs/docs/code/storybook
```

**Build TypeDoc**:

```bash
yarn docs:build  # Outputs to docs/docs/code/frontend
```

### Documentation

**Build Docs**:

```bash
just docs  # Builds frontend docs + Storybook + MkDocs
```

**Export OpenAPI**:

```bash
cd backend
poetry run python scripts/dump_openapi.py --dev
```

Outputs to `docs/docs/code/swagger/openapi.json`

### Continuous Integration

**Pre-commit Hooks**:

- Formatters (black, prettier)
- Linters (ruff, eslint)
- Type checker (mypy)
- Spell checker (cspell)

**GitHub Actions**: Runs pre-commit checks on all pushes/PRs

---

## Configuration

### Environment Variables

#### Backend (`backend/.env`)

**Required**:

```bash
JWT_SECRET=<32+ char secret>
AUTH_DB_PASSWORD=<secure password>
FHIR_DB_PASSWORD=<secure password>
EHRBASE_DB_PASSWORD=<secure password>
EHRBASE_API_PASSWORD=<API password>
EHRBASE_API_ADMIN_PASSWORD=<admin password>
VAPID_PRIVATE=<VAPID private key>
```

**Optional**:

```bash
COOKIE_DOMAIN=<domain for cookies>
SECURE_COOKIES=<true|false>
BACKEND_ENV=<development|production>
COMPANY_EMAIL=<contact email>
```

#### Frontend (`frontend/.env`)

**Required**:

```bash
VITE_VAPID_PUBLIC=<VAPID public key for push notifications>
```

**Note**: This is the only environment variable currently used by the frontend. The VAPID public key must match the private key configured in the backend.

### Docker Compose

**Services**:

- `backend`: FastAPI app (port 8000, internal)
- `frontend`: Vite dev server (ports 5173, 5174)
- `postgres-auth`: Auth DB (port 5432, internal)
- `postgres-fhir`: FHIR DB (port 5432, internal)
- `postgres-ehrbase`: EHRbase DB (port 5432, internal)
- `fhir`: HAPI FHIR Server (port 8080, internal)
- `ehrbase`: EHRbase Server (port 8080, internal)
- `caddy`: Reverse proxy (port 80/443)

**Networks**:

- `public`: Frontend, Caddy
- `private`: Backend, databases

**Resource Limits**:

- postgres-auth: 1 CPU, 1GB RAM
- postgres-fhir: 2 CPU, 2GB RAM
- postgres-ehrbase: 2 CPU, 3GB RAM

---

## Questions for Human

### Architecture & Design

1. ❓ **Route Conflict**: Two POST `/api/patients` endpoints exist (create vs verify). Should these be separate paths?

2. ❓ **Patient Fields**: Frontend Patient type has many fields (address, telephone, mobile, onQuill, nextOfKin) not populated from FHIR. Are these future extensions or should they be removed?

3. ❓ **OpenEHR Template**: Code references `quill_letter.v1` template - where is this defined? Not found in repository.

4. ❓ **Push Notification Auth**: Push endpoints have no authentication. Should they require JWT tokens?

5. ❓ **Service Worker**: `public/sw.js` exists - is it functional for push notifications?

### Implementation Priorities

**Priority Order** (confirmed):

1. **Messaging System** (Phase 1) - Conversations, threads, message states, clinician assignment
2. **Letter Workflow** (Phase 2) - States, approval process, PDF generation, distribution
3. **File Attachments** (Phase 3) - Document uploads, FHIR DocumentReference integration
4. **Billing Integration** (Phase 4, maybe) - Stripe, quotes, payments if business model requires

**Audit Logging Requirements**: Enterprise-level clinical application standard - full append-only audit log with cryptographic hash chain linking each action to previous state, capturing who/what/when for all data modifications.

**Role Implementation**: Administrator, Clinic Owner, and Billing Staff roles needed **very soon** - should be implemented alongside messaging system (Phase 1) to enable proper workflow management.

---

## Confirmed Architecture Decisions

1. ✅ **Push Storage**: In-memory storage is temporary - production persistence strategy to be determined (PostgreSQL table vs Redis)

2. ✅ **OpenEHR Template**: Template `quill_letter.v1` needs to be created - not yet uploaded to EHRbase

3. ✅ **Letter Workflow Priority**: Letter workflow implementation in Phase 2, after messaging system (Phase 1)

4. ✅ **Messaging System**: Implementation starting in Phase 1 - highest priority feature

5. ✅ **Billing Priority**: Billing integration in Phase 4 (optional) - after messaging, letters, and files

6. ✅ **Patient Type Alignment**: Frontend Patient type will be updated to match FHIR R4 standard structures

7. ✅ **Role Implementation**: Administrator, Clinic Owner, Billing Staff roles needed very soon in Phase 1

8. ✅ **Audit Logging**: Enterprise-level append-only PostgreSQL table with cryptographic hash chain (not yet created)

---

## Incomplete Implementations

### Push Notifications

⚠️ **INCOMPLETE**:

- No authentication on subscribe/send endpoints
- In-memory storage (not persisted)
- No user-subscription association
- No selective sending (sends to all subscribers)
- Service Worker existence/functionality not verified

### Patient Management

⚠️ **INCOMPLETE**:

- No UI for creating/editing patients
- Route conflict between create and verify operations
- Many frontend Patient fields unpopulated
- No patient search/filtering

### Clinical Letters

⚠️ **INCOMPLETE**:

- No UI for creating/viewing letters
- No workflow states
- No PDF generation
- No digital signatures
- No letter distribution
- No recipient management
- No approval process

### Role-Based Access Control

⚠️ **INCOMPLETE** (Phase 1 Priority):

- Only "Clinician" role actively used
- **Urgent**: Need Administrator, Clinic Owner, Billing Staff roles implemented very soon
- No role-specific UI
- No fine-grained permissions (only all-or-nothing role checks)
- Should be implemented alongside messaging system to enable proper workflow management

### Security

⚠️ **INCOMPLETE**:

- No audit logging
- No rate limiting
- No IP allowlisting
- No session management (logout only clears cookies, no token revocation)
- CSRF protection exists but only enforced on some routes

---

## Implementation Roadmap (Confirmed)

Based on confirmed priorities:

### Phase 1: Core Messaging System (HIGHEST PRIORITY)

**Goal**: Enable patient-clinician conversations with proper workflow management

1. **User Roles** (needed very soon):
   - Implement Administrator, Clinic Owner, Billing Staff roles
   - Role-specific UI and permissions
   - Migration to add roles to database

2. **Database Models**:
   - Conversation, Message, MessageState tables
   - Clinician assignment tracking
   - Alembic migrations
   - **Audit log table** with cryptographic hash chain

3. **API Endpoints**:
   - POST /api/conversations (create thread)
   - GET /api/conversations (list with filtering)
   - GET /api/conversations/{id} (thread details)
   - GET /api/conversations/{id}/messages (message history)
   - POST /api/conversations/{id}/messages (send message)
   - PATCH /api/conversations/{id}/state (admin triage, clinician assignment)
   - POST /api/conversations/{id}/estimate (create time/cost estimate)

4. **Frontend**:
   - Conversations list page with filters
   - Message thread UI with real-time updates
   - Message composition with markdown support
   - Administrator triage dashboard
   - Clinician assignment interface

5. **Infrastructure**:
   - Fix duplicate POST /api/patients routes
   - Add JWT authentication to push endpoints
   - Update Patient type to align with FHIR R4

### Phase 2: Letter Workflow

**Goal**: Enable letter creation, approval, signing, and distribution

1. **OpenEHR Template**:
   - Create `quill_letter.v1` template
   - Upload to EHRbase
   - Test composition creation

2. **Letter States**:
   - State machine (DRAFT → REVIEW → APPROVED → SENT → ACKNOWLEDGED)
   - Approval routing by role
   - Notification system for state changes

3. **PDF Generation**:
   - Markdown → PDF conversion library
   - Letter template system
   - Digital signature integration (Git hash signing as per SPEC.md)

4. **Distribution**:
   - Recipient management (patient, GP, insurer)
   - Email/print/portal delivery options
   - Acknowledgement tracking

5. **Frontend**:
   - Letter creation UI with markdown editor
   - Letter approval workflow interface
   - Letter preview and PDF download
   - Distribution management

### Phase 3: File Attachments

**Goal**: Support document uploads and FHIR DocumentReference integration

1. **Storage**:
   - File upload handling
   - Storage backend (S3/local/other)
   - Virus scanning

2. **FHIR Integration**:
   - DocumentReference resource creation
   - Link attachments to messages/letters
   - FHIR Binary resource handling

3. **API Endpoints**:
   - POST /api/files (upload)
   - GET /api/files/{id} (download)
   - DELETE /api/files/{id} (remove)

4. **Frontend**:
   - File upload component
   - Attachment display in messages
   - Document preview

### Phase 4: Billing Integration (Optional)

**Goal**: Implement payment processing if business model requires it

1. **Stripe Setup**:
   - Checkout API integration
   - Webhook handling
   - Payment event storage

2. **Quote Workflow**:
   - Clinician time estimation (6-minute units)
   - Quote generation API
   - Payment status tracking

3. **Subscription Management**:
   - Subscription plans (Bronze/Silver/Gold per SPEC.md)
   - Quota tracking
   - Renewal handling

4. **Reporting**:
   - Revenue reporting
   - Billing staff dashboard
   - Invoice generation

### Ongoing: Security & Compliance

**Throughout all phases**:

1. **Audit Logging**:
   - Implement enterprise-level append-only audit log
   - Cryptographic hash chain (each record hashes previous state)
   - Capture all clinical data modifications
   - Export functionality for compliance

2. **Security Hardening**:
   - Rate limiting on all endpoints
   - IP allowlisting (if required)
   - Session management and token revocation
   - CSRF protection on all state-changing operations

3. **Service Worker**:
   - Implement push notification event handling
   - Offline functionality
   - Background sync
   - Caching strategies

4. **Push Notifications**:
   - Decide on production persistence (PostgreSQL vs Redis)
   - User-subscription association
   - Selective notification targeting
   - Notification preferences

---

## End of Technical Specification
