# Quill Medical - Architecture Documentation

**Last Updated:** 4 February 2026
**Version:** 0.1.0
**Status:** Early Development - Foundation Complete

---

## System Overview

Quill Medical is a secure clinical messaging and letter platform built on healthcare interoperability standards. The system uses a multi-database microservices architecture with clear separation between authentication, patient demographics (FHIR R4), and clinical documents (OpenEHR).

### High-Level Component Diagram

```text
┌─────────────────────────────────────────────────────────────┐
│                        Client Browser                       │
│               (React 19 TypeScript SPA + PWA)               │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (Port 80/443)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                    Caddy Reverse Proxy                      │
│              (Automatic HTTPS, Load Balancing)              │
└───┬─────────────┬───────────────┬──────────────┬───────────┘
    │ /api/*      │ /ehrbase/*    │ /app/*       │ /*
    │             │               │              │
    ↓             ↓               ↓              ↓
┌────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│FastAPI │  │ EHRbase  │  │ Frontend │  │  Public  │
│Backend │  │  Server  │  │   SPA    │  │  Pages   │
│:8000   │  │  :8080   │  │  :5173   │  │  :5174   │
└───┬────┘  └────┬─────┘  └──────────┘  └──────────┘
    │            │
    │            │       ┌──────────────┐
    │            └──────→│ Postgres     │
    │                    │ (EHRbase)    │
    │                    │ :5432        │
    │                    └──────────────┘
    │
    ├──────────────────→ ┌──────────────┐
    │                    │ Postgres     │
    │                    │ (Auth)       │
    │                    │ :5432        │
    │                    └──────────────┘
    │
    │                    ┌──────────────┐
    └──────────────────→ │ HAPI FHIR   │
                         │ Server       │
                         │ :8080        │
                         └──────┬───────┘
                                │
                                ↓
                         ┌──────────────┐
                         │ Postgres     │
                         │ (FHIR)       │
                         │ :5432        │
                         └──────────────┘
```

**Network Isolation:**

- **Public Network**: Caddy, Frontend, Backend, FHIR, EHRbase (services requiring external access)
- **Private Network** (internal: true): All PostgreSQL databases (no external access)

⚠️ **INCOMPLETE**: File storage architecture (MinIO) documented in `/docs/docs/backend/files/index.md` but **NOT currently deployed** in `compose.dev.yml`.

✅ **CONFIRMED**: MinIO is the chosen object storage solution. File attachments are **MVP priority** (must be implemented in Phase 1, not deferred to Phase 3).

---

## Service Architecture

### 1. Caddy (Reverse Proxy)

**Container:** `quill_caddy`
**Image:** `caddy:2-alpine`
**Technology:** Go-based web server
**Ports:** 80 (HTTP), 443 (HTTPS)

**Responsibilities:**

- Edge proxy routing all client traffic
- Automatic HTTPS with Let's Encrypt certificates
- Route `/api/*` → `backend:8000`
- Route `/ehrbase/*` → `ehrbase:8080`
- Route `/app/*` → `frontend:5173` (SPA)
- Route `/*` → `frontend:5174` (public pages)
- Content compression (zstd, gzip)
- PWA manifest MIME type handling

**Security Features:**

- HSTS headers
- Modern TLS configuration (TLS 1.2+)
- Automatic certificate renewal
- No exposed database ports

**Configuration:** `caddy/dev/Caddyfile`

**Deployment Note:** Development uses HTTP (port 80), production uses HTTPS (port 443) with automatic certificates.

---

### 2. FastAPI Backend

**Container:** `quill_backend`
**Image:** Python 3.13-slim (custom Dockerfile)
**Technology:** FastAPI 0.115.2, Python 3.13
**Port:** 8000 (internal only, proxied by Caddy)

**Responsibilities:**

- REST API gateway for all business logic
- Authentication and authorisation (JWT, TOTP 2FA)
- FHIR client integration (patient demographics)
- EHRbase client integration (clinical letters)
- Push notification management (Web Push protocol)
- Session management and CSRF protection
- Database migrations (Alembic)

**Key Dependencies:**

- **SQLAlchemy 2.0.35**: ORM for auth database
- **Alembic 1.16.5**: Database migrations
- **fhirclient 4.3.2**: FHIR R4 client library
- **httpx**: EHRbase REST API client
- **pyotp**: TOTP implementation
- **passlib[argon2]**: Password hashing
- **python-jose**: JWT token handling
- **pywebpush 2.0.3**: Web Push notifications
- **itsdangerous**: CSRF token signing

**Process Management:**

- **Development:** Uvicorn with `--reload`, single worker
- **Production:** Uvicorn with 2 workers, no reload

**User Context:** Runs as unprivileged user `appuser` (UID 10001)

**Configuration:** Environment variables via `backend/.env` (Docker Compose injection)

**Deployment:**

- Multi-stage Dockerfile (base → dev/prod targets)
- Poetry for dependency management (no virtualenv in container)
- Hot reload in dev (volume mount `/backend → /app`)

---

### 3. Frontend (React SPA)

**Container:** `quill_frontend`
**Image:** Node 24.8.0-bookworm-slim (custom Dockerfile)
**Technology:** React 19.1.1, TypeScript, Vite
**Ports:** 5173 (SPA), 5174 (public pages)

**Responsibilities:**

- Single Page Application (SPA) served at `/app/`
- Progressive Web App (PWA) features
- User authentication UI (login, register, TOTP setup)
- Patient management interface
- Settings and profile management
- Push notification subscription

**Key Dependencies:**

- **React 19.1.1**: UI library
- **Mantine 8.3.1**: Component library
- **React Router 7.9.1**: Client-side routing
- **Axios 1.12.2**: HTTP client (wrapper in `lib/api.ts`)
- **@tanstack/react-query**: Server state management (assumed from best practices)

**Build System:**

- **Vite**: Module bundler and dev server
- **SWC**: Fast JavaScript/TypeScript compiler
- **Base URL:** `/app/` (configured in `vite.config.ts`)

**PWA Features:**

- Service Worker: `public/sw.js`
- Web App Manifest: `public/manifest.webmanifest`

⚠️ **INCOMPLETE**: Service Worker not extensively developed - push notification handling, offline functionality, background sync not fully implemented.

**Deployment:**

- Development: Hot reload via Vite dev server
- Production: Static build output served by Caddy
- Yarn 4.x with Plug'n'Play (PnP) for dependency management

**Workspace Structure:**

- **Root workspace:** Main SPA (`src/`)
- **Sub-workspace:** `public_pages/` for marketing/public pages (separate Vite server on port 5174)

---

### 4. HAPI FHIR Server

**Container:** `quill_fhir`
**Image:** `hapiproject/hapi:latest`
**Technology:** Java-based FHIR R4 server
**Port:** 8080 (internal only)

**Responsibilities:**

- Patient demographics storage (FHIR Patient resources)
- FHIR R4 REST API compliance
- Search and query capabilities
- Resource validation and conformance checking

**Database:** `postgres-fhir` (dedicated PostgreSQL instance)

**Configuration:**

- FHIR Version: R4
- Subscriptions: Disabled (resthook, email, websocket)
- CORS: Allowed for all origins (`*`)
- Dialect: HapiFhirPostgres94Dialect

**Data Stored:**

- Patient demographics (name, DOB, gender, address, contact)
- Patient identifiers (NHS number, MRN)
- Relationships and next of kin

**Resource Limits:**

- CPUs: 2
- Memory: 2GB (postgres-fhir)

**Healthcheck:** Java version check (30s interval, 120s start period)

**Access Pattern:** Backend connects via `fhirclient` library (`backend/app/fhir_client.py`)

---

### 5. EHRbase Server

**Container:** `quill_ehrbase`
**Image:** `ehrbase/ehrbase:latest`
**Technology:** Java-based OpenEHR server
**Port:** 8080 (internal only)

**Responsibilities:**

- Clinical document storage (OpenEHR Compositions)
- Letter management (archetype-based)
- Audit trail for clinical data
- AQL (Archetype Query Language) support
- Template management

**Database:** `postgres-ehrbase` (dedicated PostgreSQL instance with EHRbase schema extensions)

**Configuration:**

- Authentication: BASIC auth
- API User: `ehrbase_user` / `SecureEHRbasePassword123`
- Admin User: `ehrbase_admin` / `SuperSecureAdminPassword456`
- Template Overwrite: Enabled
- Node Name: `quill.ehrbase.node`

**Data Stored:**

- Clinical letters (as Compositions)
- Letter metadata (author, date, title)
- Clinical documents (future: notes, observations)

⚠️ **INCOMPLETE**: OpenEHR template `quill_letter.v1` referenced in code but not yet created or uploaded to EHRbase.

✅ **CONFIRMED**: Template creation is **immediate priority** - must be completed now, not deferred.

**Resource Limits:**

- CPUs: 2
- Memory: 3GB (postgres-ehrbase)

**Healthcheck:** REST API endpoint check with admin credentials (30s interval, 60s start period)

**Access Pattern:** Backend connects via raw HTTP requests (`backend/app/ehrbase_client.py`)

---

## Database Strategy

### Three-Database Architecture Rationale

Quill Medical uses **three separate PostgreSQL 16 databases** instead of a monolithic database for critical architectural reasons:

#### 1. Security Isolation

- **Auth Database:** User credentials, password hashes, TOTP secrets
  - Most sensitive data requiring highest protection
  - Breach in app logic doesn't expose patient data
  - Different encryption and access control policies

- **FHIR Database:** Patient demographics (PII/PHI)
  - Controlled via HAPI FHIR with built-in FHIR security
  - Subject to GDPR and healthcare privacy regulations
  - Separate data retention policies

- **EHRbase Database:** Clinical documents (PHI)
  - Contains detailed medical information
  - Versioned and immutable (audit trail)
  - Long-term retention requirements (NHS: 8+ years)

#### 2. Performance Optimisation

- **Independent Scaling:** Each database can be scaled independently based on workload
  - Auth DB: Low volume, high read frequency
  - FHIR DB: Medium volume, frequent searches
  - EHRbase DB: High volume, large documents, append-heavy

- **Resource Allocation:**
  - Auth DB: 1 CPU, 1GB RAM (lightest load)
  - FHIR DB: 2 CPU, 2GB RAM (search-intensive)
  - EHRbase DB: 2 CPU, 3GB RAM (heaviest load, large compositions)

- **Query Optimisation:** Indexes and query patterns optimised per database purpose

#### 3. Compliance & Audit

- **Clear Data Boundaries:** Healthcare auditors can inspect clinical data (FHIR/EHRbase) without accessing auth credentials
- **Separate Backup Policies:** Clinical data requires long-term retention, auth data may not
- **Access Logging:** Different logging requirements per data type

#### 4. Standards Compliance

- **FHIR Requires Dedicated Server:** HAPI FHIR server manages its own schema (Hibernate-generated)
- **OpenEHR Requires Dedicated Server:** EHRbase manages OpenEHR reference model schema
- **Standards-Based Access:** FHIR and OpenEHR accessed via REST APIs, not raw SQL

#### 5. Operational Flexibility

- **Independent Maintenance:** Update/patch one database without affecting others
- **Backup & Restore:** Restore only the affected database in disaster recovery
- **Migration:** Easier to migrate to cloud services (e.g., Azure PostgreSQL for FHIR, separate instance for EHRbase)

### Database Configuration

#### Auth Database (`postgres-auth`)

**Container:** `quill_postgres_auth`
**Image:** `postgres:16-alpine`
**Database:** `quill_auth`
**User:** `auth_user`

**Schema:** Managed by Alembic migrations in `backend/alembic/versions/`

**Tables:**

- `users`: User accounts (id, username, email, password_hash, totp_secret, is_totp_enabled, is_active)
- `roles`: Role definitions (id, name)
- `user_role`: Many-to-many join table (user_id, role_id)

**ORM:** SQLAlchemy 2.0 with `DeclarativeBase` and `Mapped` type hints

**Connection:** FastAPI connects via SQLAlchemy engine (`backend/app/db/auth_db.py`)

```python
# Connection string constructed from settings
AUTH_DATABASE_URL = "postgresql+psycopg://auth_user:{password}@postgres-auth:5432/quill_auth"
```

**Healthcheck:** `pg_isready -U auth_user -d quill_auth` (5s interval, 10 retries)

**Resource Limits:** 1 CPU, 1GB RAM

**Volumes:** `postgres_auth_data:/var/lib/postgresql/data`

#### FHIR Database (`postgres-fhir`)

**Container:** `quill_postgres_fhir`
**Image:** `postgres:16-alpine`
**Database:** `hapi`
**User:** `hapi_user`

**Schema:** Managed by HAPI FHIR Server (Hibernate auto-generates schema)

**Tables:** (HAPI internal, examples)

- `hfj_resource`: FHIR resources (Patient, Observation, etc.)
- `hfj_res_ver`: Resource versions
- `hfj_idx_*`: Search parameter indexes

**Access:** Via HAPI FHIR REST API (`http://fhir:8080/fhir`), **NOT direct SQL**

**Connection:** HAPI FHIR connects via JDBC:

```
jdbc:postgresql://postgres-fhir:5432/hapi
```

**Healthcheck:** `pg_isready -U hapi_user -d hapi` (5s interval, 10 retries)

**Resource Limits:** 2 CPU, 2GB RAM

**Volumes:** `postgres_fhir_data:/var/lib/postgresql/data`

#### EHRbase Database (`postgres-ehrbase`)

**Container:** `quill_postgres_ehrbase`
**Image:** `ehrbase/ehrbase-v2-postgres:16.2` (custom EHRbase image with schema extensions)
**Database:** `ehrbase`
**User:** `ehrbase_user`

**Schema:** Managed by EHRbase (OpenEHR reference model schema)

**Tables:** (EHRbase internal, examples)

- `ehr`: Electronic Health Records
- `composition`: Clinical documents/letters
- `entry`: Composition entries
- `contribution`: Audit trail
- `ehr_status`: EHR status and lifecycle

**Access:** Via EHRbase REST API (`http://ehrbase:8080/ehrbase`), **NOT direct SQL**

**Connection:** EHRbase connects via JDBC:

```
jdbc:postgresql://postgres-ehrbase:5432/ehrbase?stringtype=unspecified&lc_collate=C
```

**Healthcheck:** `pg_isready -U ehrbase_user -d ehrbase` (5s interval, 10 retries)

**Resource Limits:** 2 CPU, 3GB RAM

**Volumes:** `postgres_ehrbase_data:/var/lib/postgresql/data`

### Database Access Patterns

**Direct SQL Access:** Only Auth database (via SQLAlchemy ORM)

**REST API Access:** FHIR and EHRbase databases (via their respective Java servers)

**Why No Direct SQL for FHIR/EHRbase?**

- FHIR and OpenEHR have complex schemas optimised for their standards
- Direct SQL bypasses validation, versioning, and audit trails
- REST APIs provide standards-compliant access with proper error handling
- Schema changes managed by respective servers, not our application

### Backup & Disaster Recovery

⚠️ **INCOMPLETE**: No backup strategy currently implemented. File storage documentation (`docs/backend/files/index.md`) mentions backup approach:

- MinIO: Continuous replication + versioning (MinIO confirmed, needs deployment)
- PostgreSQL: Hourly incremental, daily full backups
- Retention: 30 days point-in-time recovery
- Long-term: Clinical records retained per NHS requirements (8+ years)

✅ **CONFIRMED**: Backup strategy **critical priority** - needs in-depth discussion to determine approach. Current knowledge level on backup strategies is low.

**Production Requirements:**

- Automated PostgreSQL backups (pg_dump or continuous archiving with WAL)
- Off-site backup storage (options: S3, Azure Blob Storage, or other)
- Regular restore testing
- Documented disaster recovery procedures

**To Discuss:**

- Development backup needs vs. production
- Backup frequency and retention policies
- Restore time objectives (RTO) and recovery point objectives (RPO)
- Testing and validation procedures

---

## Storage Architecture

### Current State: No File Storage

🔍 **CURRENT IMPLEMENTATION:** Quill Medical **does not currently implement file storage**. The `compose.dev.yml` file contains **no MinIO, S3, or object storage service**.

### Documented Future Architecture

Documentation exists in `docs/backend/files/index.md` describing a **planned three-layer storage architecture**:

```text
┌─────────────────────────────────────────────────────────────┐
│                      Quill Backend (FastAPI)                 │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    MinIO     │    │ PostgreSQL   │    │  EHRbase     │
│   (Binary    │    │  (Metadata)  │    │(DocumentRef) │
│   Storage)   │    │  & Audit)    │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
```

**Planned Components (NOT IMPLEMENTED):**

1. **Binary Storage (MinIO):**
   - S3-compatible object storage
   - Server-side encryption
   - Versioning and presigned URLs

2. **Metadata & Audit (PostgreSQL):**
   - File metadata (size, type, hash, ownership)
   - SHA-256 checksums
   - Access audit trail

3. **Clinical Index (FHIR):**
   - DocumentReference resources
   - Standards-compliant document management

⚠️ **INCOMPLETE**: File attachments are **Roadmap Phase 3**. Current system cannot handle document uploads.

❓ **CLARIFY**:

1. Is MinIO the confirmed choice or should we consider Azure Blob Storage (UK region) directly?
2. Should file storage be part of MVP (Phase 1) or deferred to Phase 3?
3. Do we need document attachments for messaging workflow (Phase 1) or can messages be text-only initially?

---

## Network Architecture

### Docker Compose Networks

#### Public Network (`public`)

**Type:** Bridge network (default)
**Purpose:** Services requiring external connectivity or inter-service communication

**Services:**

- `caddy` (edge proxy, must accept external traffic)
- `backend` (needs to communicate with FHIR and EHRbase)
- `frontend` (proxied by Caddy)
- `fhir` (needs to be reachable by backend)
- `ehrbase` (needs to be reachable by backend)

**Security Note:** Services on public network can potentially communicate with each other, but Caddy only exposes specific paths to external clients.

#### Private Network (`private`)

**Type:** Internal bridge network (`internal: true`)
**Purpose:** Database isolation - no external connectivity allowed

**Services:**

- `postgres-auth`
- `postgres-fhir`
- `postgres-ehrbase`

**Security Benefit:**

- Databases have **zero external access** - cannot reach internet
- Only accessible from services on both networks (backend, fhir, ehrbase)
- Prevents accidental exposure of database ports
- Reduces attack surface

### Service Communication Patterns

#### External Client → System

```
Browser (HTTPS) → Caddy:80/443
                   ├→ /api/* → backend:8000
                   ├→ /ehrbase/* → ehrbase:8080
                   ├→ /app/* → frontend:5173
                   └→ /* → frontend:5174
```

#### Backend → Databases

```
backend:8000 → postgres-auth:5432 (via SQLAlchemy, both networks)
backend:8000 → fhir:8080 → postgres-fhir:5432 (via FHIR REST API)
backend:8000 → ehrbase:8080 → postgres-ehrbase:5432 (via OpenEHR REST API)
```

#### Frontend → Backend

```
frontend:5173 → Caddy:80 → backend:8000 (via /api/* proxy)
```

**Why Not Direct?** Frontend runs in browser, must go through Caddy for CORS/security.

### Port Exposure

**Exposed to Host:**

- `caddy:80` → `host:80` (HTTP)
- `caddy:443` → `host:443` (HTTPS, production)
- `frontend:5173` → `host:5173` (dev hot reload)
- `frontend:5174` → `host:5174` (public pages dev server)

**Internal Only:**

- `backend:8000` (proxied by Caddy)
- `fhir:8080` (accessed via backend or Caddy `/ehrbase/*` route)
- `ehrbase:8080` (accessed via backend or Caddy `/ehrbase/*` route)
- `postgres-*:5432` (all databases, no host exposure)

### Network Security Boundaries

**Trust Boundaries:**

1. **External → Caddy:** TLS encryption, authentication required for API
2. **Caddy → Backend Services:** Internal network, no TLS (trusted zone)
3. **Backend → Databases:** Internal network, authenticated connections
4. **Frontend → Backend:** Via Caddy proxy only, credentials in HTTP-only cookies

**No Direct Database Access:** Databases completely isolated on private network.

---

## Integration Patterns

### FHIR Integration

**Architecture:** Backend acts as FHIR client, HAPI FHIR acts as server

**Client Library:** `fhirclient` 4.3.2 (Python)

**Implementation:** `backend/app/fhir_client.py`

**Pattern:** RESTful Resource Operations

**Functions:**

```python
# List all patients
GET http://fhir:8080/fhir/Patient
→ Returns: Bundle with Patient resources

# Read specific patient
GET http://fhir:8080/fhir/Patient/{id}
→ Returns: Patient resource

# Create patient
POST http://fhir:8080/fhir/Patient
Body: Patient resource JSON
→ Returns: Created Patient with ID

# Update patient
PUT http://fhir:8080/fhir/Patient/{id}
Body: Updated Patient resource
→ Returns: Updated Patient
```

**Data Flow:**

1. Frontend sends patient request to `/api/patients`
2. Backend `fhir_client.py` constructs FHIR Patient resource
3. `fhirclient` library sends HTTP request to HAPI FHIR server
4. HAPI validates against FHIR R4 specification
5. HAPI persists to `postgres-fhir` database
6. Response returned through chain

**Error Handling:**

- FHIR validation errors return OperationOutcome resources
- Backend wraps in FastAPI HTTPException
- Frontend displays user-friendly error messages

**Authentication:** None currently - FHIR server open within internal network

🔍 **ASSUMPTION**: Production will require authentication between backend and FHIR server (OAuth2 or mutual TLS).

### OpenEHR Integration

**Architecture:** Backend acts as OpenEHR client, EHRbase acts as server

**Client:** Raw HTTP requests using `httpx` (no dedicated Python library)

**Implementation:** `backend/app/ehrbase_client.py`

**Pattern:** RESTful Composition Operations + AQL Queries

**Authentication:** HTTP Basic Auth

- Regular operations: `ehrbase_user:SecureEHRbasePassword123`
- Admin operations: `ehrbase_admin:SuperSecureAdminPassword456`

**Functions:**

```python
# Create EHR for patient
POST http://ehrbase:8080/ehrbase/rest/openehr/v1/ehr
Body: EHR_STATUS with subject (patient FHIR ID)
→ Returns: EHR ID

# Create letter composition
POST http://ehrbase:8080/ehrbase/rest/openehr/v1/ehr/{ehr_id}/composition
Body: Composition JSON (letter data)
→ Returns: Composition UID

# Query letters for patient (AQL)
POST http://ehrbase:8080/ehrbase/rest/openehr/v1/query/aql
Body: AQL query string
→ Returns: Query result set

# Retrieve specific composition
GET http://ehrbase:8080/ehrbase/rest/openehr/v1/ehr/{ehr_id}/composition/{uid}
→ Returns: Composition JSON
```

**Data Flow:**

1. Frontend sends letter request to `/api/patients/{id}/letters`
2. Backend ensures patient has EHR in EHRbase (creates if missing)
3. Backend constructs OpenEHR Composition JSON
4. HTTP POST to EHRbase with Basic Auth header
5. EHRbase validates against template (if exists)
6. EHRbase persists to `postgres-ehrbase` with audit trail
7. Response returned through chain

**Template Handling:**

⚠️ **INCOMPLETE**: Code references `quill_letter.v1` template but template not yet created or uploaded to EHRbase. Composition creation may fail without template.

**EHR-Patient Linking:**

- Each FHIR Patient gets corresponding EHR in EHRbase
- Link via `subject_id` = FHIR Patient ID
- EHR created lazily (first time letter is created for patient)

### Frontend-Backend Integration

**Architecture:** SPA communicates via REST API only

**API Client:** `frontend/src/lib/api.ts` (Axios wrapper)

**Pattern:** JSON-based REST with automatic token refresh

**Authentication Flow:**

```
1. User logs in: POST /api/auth/login
   → Returns: HTTP-only cookies (access_token, refresh_token, XSRF-TOKEN)

2. Subsequent requests include cookies automatically
   → Server validates access_token from cookie

3. On 401 response (token expired):
   → Client automatically calls POST /api/auth/refresh
   → New tokens issued in cookies
   → Original request retried

4. On 401 after refresh fails:
   → Redirect to login page
```

**CSRF Protection:**

- State-changing operations (POST/PUT/PATCH/DELETE) require `X-CSRF-Token` header
- CSRF token stored in readable cookie (not HTTP-only)
- Token signed with JWT secret + username using `itsdangerous`
- Backend validates via `require_csrf` dependency

**API Conventions:**

- All endpoints prefixed with `/api`
- JSON-only (no form data, except future file uploads)
- Errors return `{ "detail": "message" }` or `{ "detail": { "message": "...", "error_code": "..." } }`
- Frontend extracts error messages for toast notifications

**CORS:** Not required - frontend served under same domain via Caddy

### Push Notification Integration

**Architecture:** Web Push protocol (RFC 8030) via `pywebpush`

**Flow:**

```
1. Frontend: Service worker subscribes to push notifications
   → Browser generates endpoint + keys (p256dh, auth)

2. Frontend: POST /api/push/subscribe with subscription object
   → Backend stores in-memory list

3. Backend: Send notification via pywebpush
   POST to push service endpoint with VAPID signature
   → Push service delivers to browser

4. Browser: Service worker 'push' event
   → Display notification
```

**VAPID Configuration:**

- Private key: `VAPID_PRIVATE` env var
- Public key: `VITE_VAPID_PUBLIC` env var (frontend)
- Contact: `mailto:admin@example.com` (configurable via `COMPANY_EMAIL`)

⚠️ **INCOMPLETE**:

- Subscriptions stored in-memory (lost on restart)
- No authentication on subscribe/send endpoints
- Service worker not extensively developed
- No user-subscription association

❓ **CLARIFY**: Should push subscriptions be persisted in auth database with user_id foreign key?

---

## Security Architecture

### Authentication Mechanisms

#### JWT Token-Based Authentication

**Algorithm:** HS256 (symmetric HMAC-SHA256)
**Secret:** `JWT_SECRET` (min 32 characters, from env)

**Token Types:**

1. **Access Token** (15-minute TTL)
   - Payload: `{ sub: username, roles: [role names], exp: timestamp }`
   - Stored in: HTTP-only cookie (`access_token`, path=`/`)
   - Used for: All authenticated API requests

2. **Refresh Token** (7-day TTL)
   - Payload: `{ sub: username, type: "refresh", exp: timestamp }`
   - Stored in: HTTP-only cookie (`refresh_token`, path=`/api/auth/refresh`)
   - Used for: Rotating access tokens without re-login

3. **CSRF Token** (same TTL as access token)
   - Generated via `itsdangerous.URLSafeSerializer`
   - Stored in: Readable cookie (`XSRF-TOKEN`, path=`/`)
   - Used in: `X-CSRF-Token` header for state-changing operations

**Cookie Security:**

- `HttpOnly`: True (access/refresh tokens - not accessible to JavaScript)
- `SameSite`: Lax (CSRF protection)
- `Secure`: Configurable via `SECURE_COOKIES` (true for production HTTPS)
- `Domain`: Configurable via `COOKIE_DOMAIN` (for subdomain deployments)

**Token Rotation:**

```
Access token expires (15min)
 ↓
Frontend receives 401
 ↓
Frontend automatically calls /api/auth/refresh
 ↓
Backend validates refresh token
 ↓
New access + refresh + CSRF tokens issued
 ↓
Original request retried with new tokens
```

**Logout:**

- Cookies deleted client-side
- ⚠️ **INCOMPLETE**: No server-side token revocation - tokens valid until expiry

🔍 **ASSUMPTION**: Production requires token blacklist (Redis or database table) for immediate revocation.

#### Two-Factor Authentication (TOTP)

**Library:** `pyotp` (RFC 6238 compliant)

**Setup Flow:**

```
1. User: POST /api/auth/totp/setup
   → Backend generates 32-char base32 secret
   → Returns provision URI: otpauth://totp/Quill:{username}?secret={secret}&issuer=Quill

2. User scans QR code with authenticator app

3. User: POST /api/auth/totp/verify with 6-digit code
   → Backend verifies code against secret
   → Sets is_totp_enabled=true, stores totp_secret

4. Future logins require totp_code parameter
```

**Enforcement:**

- Login endpoint checks `user.is_totp_enabled`
- If enabled and `totp_code` not provided → 400 error `{ "error_code": "two_factor_required" }`
- If code invalid → 400 error `{ "error_code": "invalid_totp" }`

**Disable Flow:**

```
POST /api/auth/totp/disable
 → Requires CSRF token (state-changing operation)
 → Sets is_totp_enabled=false, clears totp_secret
```

#### Password Security

**Hashing:** Argon2 via `passlib[argon2]`

**Parameters:** Defaults from `passlib` (time cost: 2, memory cost: 512 MiB, parallelism: 2)

**Validation:**

- Minimum length: 6 characters (enforced at registration)
- No complexity requirements currently

✅ **CONFIRMED**: Production requires **good/excellent quality passwords**. Two-factor authentication (TOTP) highly recommended for all users and **mandatory for administrators and superusers**.

### Authorisation (RBAC)

**Model:** Role-Based Access Control with many-to-many user-role relationship

**Implementation:** Database tables + decorator

**Tables:**

- `roles`: (id, name)
- `user_role`: (user_id, role_id)
- `users.roles`: SQLAlchemy relationship (eager loaded via `lazy="joined"`)

**Current Roles:**

- `Clinician`: Only role actively used in code (for patient/letter operations)

⚠️ **INCOMPLETE**: Administrator, Clinic Owner, Billing Staff roles not implemented (Roadmap Phase 1 priority).

**Decorator Usage:**

```python
@router.get("/patients")
@require_roles("Clinician")
def list_patients(user: CurrentUser, ...):
    # Only users with Clinician role can access
    ...
```

**Enforcement:** Decorator checks `user.roles` list, raises 403 if role not present.

**Limitations:**

- All-or-nothing role checks (no fine-grained permissions)
- No resource-level permissions (can't restrict "Clinician A can only see their own patients")
- No role hierarchy

🔍 **ASSUMPTION**: Future implementation may need attribute-based access control (ABAC) for fine-grained permissions.

### CSRF Protection

**Implementation:** `itsdangerous.URLSafeSerializer`

**Signing Key:** `JWT_SECRET` + username (per-user tokens)

**Generation:**

```python
signer = URLSafeSerializer(JWT_SECRET)
csrf_token = signer.dumps(username)
```

**Validation:**

```python
@router.post("/some-action")
def action(csrf_token: str = Depends(require_csrf)):
    # Token validated by dependency
    ...
```

**Scope:** Currently only some routes protected (TOTP disable, patient updates).

⚠️ **INCOMPLETE**: CSRF protection not applied to all state-changing operations.

❓ **CLARIFY**: Should CSRF be required for all POST/PUT/PATCH/DELETE operations or only specific sensitive actions?

### Data Protection

#### Encryption at Rest

**Databases:**

- ⚠️ **INCOMPLETE**: No database-level encryption currently implemented
- PostgreSQL supports Transparent Data Encryption (TDE) - not configured

🔍 **ASSUMPTION**: Production requires:

- PostgreSQL encryption (pg_crypto or TDE)
- Encrypted volumes for Docker data volumes
- Key management via HashiCorp Vault or cloud KMS

#### Encryption in Transit

**External:**

- Caddy provides TLS 1.2+ for external connections
- Automatic HTTPS with Let's Encrypt certificates (production)

**Internal:**

- ⚠️ **INCOMPLETE**: No TLS between services (backend → FHIR/EHRbase, backend → databases)
- Services communicate over internal Docker network (not encrypted)

✅ **CONFIRMED**: Production **requires TLS** for internal service communication (mutual TLS between backend ↔ FHIR/EHRbase/databases).

#### Secrets Management

**Current:** Environment variables in `.env` files (Docker Compose injection)

**Sensitive Values:**

- JWT_SECRET (min 32 chars)
- Database passwords
- VAPID private key
- EHRbase API credentials

⚠️ **INCOMPLETE**: No secrets rotation, no secrets vault, `.env` files in repository (gitignored but present on disk).

✅ **CONFIRMED**: Secrets management **required** for production. Specific solution to be determined (options: HashiCorp Vault, Azure Key Vault, AWS Secrets Manager).

**Requirements:**

- Secrets rotation policy
- Docker secrets or external secrets provider
- No secrets in `.env` files

#### Audit Logging

⚠️ **INCOMPLETE**: No audit logging currently implemented.

**Planned (Roadmap Phase 1):**

- Append-only `audit_log` table
- Cryptographic hash chain (each record hashes previous state)
- Capture: who, what, when, before/after state
- Required for clinical-grade compliance

### Network Security

**Firewall Rules:**

- Only Caddy ports exposed to host (80, 443)
- All databases on isolated private network
- No database ports accessible from host

**Attack Surface:**

- Minimised: Only Caddy accepts external traffic
- Backend/FHIR/EHRbase accessible only via Caddy reverse proxy

**Rate Limiting:**

⚠️ **INCOMPLETE**: No rate limiting implemented.

🔍 **ASSUMPTION**: Production requires rate limiting on all API endpoints (slowapi or Caddy middleware).

**IP Allowlisting:**

⚠️ **INCOMPLETE**: No IP allowlisting.

✅ **CONFIRMED**: IP allowlisting **required** - to be implemented inside the backend environment for access control.

### Security Gaps & Roadmap

**Critical (Pre-Production):**

1. Token revocation mechanism
2. Rate limiting on all endpoints
3. CSRF on all state-changing operations
4. Audit logging with hash chain
5. Database encryption at rest
6. Secrets management vault
7. Authentication on push notification endpoints

**Important (Early Production):**

1. Service-to-service TLS
2. Stronger password policy
3. Fine-grained permissions (ABAC)
4. Session management (max concurrent sessions)
5. Automated secrets rotation
6. Intrusion detection

**Future (Scaling):**

1. WAF (Web Application Firewall)
2. DDoS protection
3. Security scanning in CI/CD
4. Penetration testing
5. SOC 2 / ISO 27001 compliance

---

## Scalability & Migration Paths

### Current Capacity

**Development Configuration:**

- Single host, Docker Compose
- All services on one machine
- No load balancing
- No horizontal scaling

**Resource Limits:**

- Backend: No limits (dev), assumes ample host resources
- FHIR DB: 2 CPU, 2GB RAM
- EHRbase DB: 2 CPU, 3GB RAM
- Auth DB: 1 CPU, 1GB RAM

**Estimated Capacity:**

✅ **CONFIRMED**: Expected user growth is **100-1000 users initially** (lower than typical SaaS assumptions). However, architecture must support **fast scaling capability** if rapid growth occurs.

🔍 **ASSUMPTION**: Current architecture can handle:

- ~100 concurrent users
- ~1000 patients
- ~10,000 clinical letters
- ~1GB database growth per month

**Scaling Requirement:** Must be prepared to scale quickly if user adoption exceeds expectations.

### Horizontal Scaling Strategy

#### Phase 1: Vertical Scaling (0-10,000 users)

**Approach:** Increase resources on single host

```
Current:
- 8 CPU cores, 16GB RAM (typical dev machine)

Scale to:
- 16 CPU cores, 64GB RAM (single server)
- Increase database CPUs/RAM limits
- Add backend workers (uvicorn --workers 4)
```

**Bottlenecks:**

- Backend: Add Uvicorn workers (CPU-bound operations)
- FHIR: Increase HAPI memory (heap size)
- EHRbase: Increase memory (Java heap)
- Databases: Vertical scaling (bigger instances)

#### Phase 2: Database Replication (10,000-50,000 users)

**Approach:** Read replicas for databases

```
┌─────────────┐
│   Backend   │
└─┬─────────┬─┘
  │ writes  │ reads
  ↓         ↓
┌──────┐  ┌──────────────┐
│ Auth │  │ Auth Replica │
│  DB  │  │  (read-only) │
└──────┘  └──────────────┘

Same pattern for FHIR and EHRbase DBs
```

**Implementation:**

- PostgreSQL streaming replication
- Update SQLAlchemy to route reads to replicas
- HAPI FHIR supports read replicas via config
- EHRbase supports read replicas

**Benefit:** Reduce load on primary databases, faster reads

#### Phase 3: Service Replication (50,000-500,000 users)

**Approach:** Multiple backend instances + load balancing

```
┌─────────────┐
│    Caddy    │
│ (LB + TLS)  │
└─┬─────────┬─┘
  │         │
  ↓         ↓
┌────────┐ ┌────────┐
│Backend │ │Backend │
│   #1   │ │   #2   │
└────────┘ └────────┘
```

**Changes Required:**

- Shared session storage (Redis for push subscriptions, token blacklist)
- Stateless backend (no in-memory state)
- Database connection pooling (pgbouncer)
- Horizontal pod autoscaling (Kubernetes)

#### Phase 4: Multi-Region (500,000+ users, international)

**Approach:** Geo-distributed deployment

```
UK Region:
- Caddy + Backend + FHIR + EHRbase + Databases

US Region:
- Caddy + Backend + FHIR + EHRbase + Databases

Shared:
- User directory (Auth DB replication)
- Cross-region data replication (carefully!)
```

**Considerations:**

- Data sovereignty (GDPR, HIPAA)
- Cross-region latency
- Patient data must stay in-region
- Conflict resolution for replicated data

### Cloud Migration Paths

#### Current State: Self-Hosted

**Pros:** Full control, no cloud costs
**Cons:** Limited scaling, manual management, single point of failure

#### Path 1: Lift-and-Shift (Azure VMs)

**Approach:** Docker Compose on Azure VMs

```
Azure VM (Ubuntu)
  ├→ Docker Compose (same setup)
  └→ Managed Disks (persistent volumes)

Azure Database for PostgreSQL (optional)
  ├→ FHIR DB
  ├→ EHRbase DB
  └→ Auth DB
```

**Pros:** Minimal code changes, familiar setup
**Cons:** Still manual scaling, not cloud-native

#### Path 2: Kubernetes (Azure AKS)

**Approach:** Containerised deployment with orchestration

```
Azure Kubernetes Service (AKS)
  ├→ Backend Deployment (3 replicas)
  ├→ Frontend Deployment (2 replicas)
  ├→ FHIR Deployment (2 replicas)
  ├→ EHRbase Deployment (2 replicas)
  └→ Caddy Ingress Controller

Azure Database for PostgreSQL Flexible Server
  ├→ FHIR DB (with read replicas)
  ├→ EHRbase DB (with read replicas)
  └→ Auth DB (with read replicas)

Azure Blob Storage (for future file attachments)

Azure Redis Cache (push subscriptions, token blacklist)
```

**Pros:** Auto-scaling, high availability, cloud-native
**Cons:** Complexity, learning curve, Kubernetes overhead

**Changes Required:**

- Kubernetes manifests (Deployments, Services, Ingress)
- Helm charts for deployment
- Azure AD integration for authentication
- Terraform for infrastructure as code
- Azure Key Vault for secrets

#### Path 3: Managed Services (Serverless)

**Approach:** Fully managed platform services

```
Azure Functions (Backend API)
Azure Static Web Apps (Frontend)
Azure API Management (API gateway)
Azure Database for PostgreSQL
Azure FHIR Service (managed FHIR R4 server)
Azure Blob Storage (files)
Azure Redis Cache
```

**Pros:** No infrastructure management, auto-scaling, pay-per-use
**Cons:** Vendor lock-in, less control, cold start latency

**Changes Required:**

- Rewrite backend for Azure Functions runtime
- Replace HAPI FHIR with Azure FHIR Service
- OpenEHR migration (no Azure managed service - stay with EHRbase on AKS or VM)

### Performance Optimisation Strategies

#### Backend Optimisations

1. **Connection Pooling:**
   - SQLAlchemy pool size: 5 → 20
   - pgbouncer for PostgreSQL connection pooling
   - HAPI FHIR connection pool tuning

2. **Caching:**
   - Redis for frequently accessed data (user profiles, role lookups)
   - FHIR search result caching
   - EHRbase composition caching (with TTL)

3. **Async Operations:**
   - Background tasks for notifications (Celery + Redis)
   - Async database queries (SQLAlchemy async)
   - Batch processing for audit logs

#### Database Optimisations

1. **Indexing:**
   - Auth DB: Username, email indexes (already present)
   - FHIR DB: Patient identifier indexes (HAPI manages)
   - EHRbase DB: Composition query indexes

2. **Partitioning:**
   - Audit log table partitioned by month
   - EHRbase compositions partitioned by patient

3. **Query Optimisation:**
   - Analyse slow queries with EXPLAIN
   - Eager loading for relationships (already doing for roles)
   - Limit result sets, implement pagination

#### Frontend Optimisations

1. **Code Splitting:**
   - Route-based code splitting (React.lazy)
   - Lazy load Mantine components
   - Tree shaking unused code

2. **Caching:**
   - Service Worker caching (not yet implemented)
   - React Query for server state caching
   - CDN for static assets

3. **Performance Monitoring:**
   - Lighthouse CI in GitHub Actions
   - Sentry for frontend error tracking
   - Web vitals monitoring

### Current Bottlenecks

🔍 **IDENTIFIED BOTTLENECKS:**

1. **Single Backend Instance:** No horizontal scaling
2. **In-Memory Push Subscriptions:** Lost on restart, no HA
3. **No Caching Layer:** All requests hit databases
4. **Synchronous Processing:** Notifications block request threads
5. **No CDN:** Static assets served from origin
6. **Single PostgreSQL Instances:** No read replicas

### Migration Timeline Estimate

🔍 **ASSUMPTION**:

- **Year 1 (0-10k users):** Current architecture sufficient with vertical scaling
- **Year 2 (10k-50k users):** Add database read replicas, backend replicas, Redis cache
- **Year 3 (50k-500k users):** Migrate to Kubernetes, implement multi-region
- **Year 4+ (500k+ users):** Evaluate managed services, consider serverless migration

❓ **CLARIFY**: What is the expected user growth rate? Timeline assumptions based on typical SaaS growth patterns - may differ for clinical applications.

---

## Key Architectural Decisions

### 1. Why Three Separate Databases?

**Decision:** Use three PostgreSQL databases instead of monolithic single database.

**Rationale:**

- **Security Isolation:** Separate auth credentials from patient data from clinical records
- **Standards Compliance:** FHIR and OpenEHR require dedicated servers with specific schemas
- **Performance:** Independent scaling and optimisation per data type
- **Operational Flexibility:** Update, backup, restore independently
- **Compliance:** Clear audit boundaries for healthcare regulations

**Trade-offs:**

- More complex deployment (3 databases vs 1)
- More backup/restore operations
- Slightly higher resource usage (3 instances)

**Why Not Alternatives?**

- ❌ Single database: Security risk, single point of failure, mixed data types
- ❌ Microservices with separate stores: Over-engineering for current scale
- ✅ Three databases: Best balance of security, standards, and simplicity

### 2. Why FHIR and OpenEHR (Not Just One)?

**Decision:** Use FHIR for demographics, OpenEHR for clinical documents.

**Rationale:**

- **FHIR Strengths:** Patient demographics, administrative data, interoperability
- **OpenEHR Strengths:** Clinical documents, long-term records, archetype-based modeling
- **Complementary:** FHIR for "who and where", OpenEHR for "what happened clinically"
- **Standards:** Both are international healthcare standards

**Trade-offs:**

- Two healthcare systems to maintain (complexity)
- Two Java servers (HAPI FHIR, EHRbase) - higher memory/CPU usage
- Dual integration patterns (REST API for both)

**Why Not Alternatives?**

- ❌ FHIR only: Not designed for long-term clinical document storage, complex templates
- ❌ OpenEHR only: Less mature patient demographics support, harder interoperability
- ✅ Both: Leverage strengths of each standard

### 3. Why Caddy (Not Nginx)?

**Decision:** Use Caddy as reverse proxy and web server.

**Rationale:**

- **Automatic HTTPS:** Zero-config TLS with Let's Encrypt (critical for healthcare)
- **Simple Config:** Caddyfile much simpler than Nginx config
- **Modern:** Built-in HTTP/2, HTTP/3, WebSocket support
- **Developer Experience:** Easier to maintain and troubleshoot

**Trade-offs:**

- Less mature than Nginx (but stable)
- Smaller community (but excellent docs)
- Slightly higher memory usage

**Why Not Alternatives?**

- ❌ Nginx: More complex config, manual TLS management, steeper learning curve
- ❌ Traefik: Kubernetes-focused, overkill for Docker Compose
- ✅ Caddy: Best developer experience, automatic HTTPS crucial for compliance

### 4. Why React 19 + Mantine (Not Other Frameworks)?

**Decision:** Use React 19 with Mantine UI library.

**Rationale:**

- **React 19:** Latest version with concurrent features, server components (future)
- **Mantine 8.x:** Comprehensive component library, accessible, themeable
- **TypeScript:** Type safety for healthcare application (reduce runtime errors)
- **Ecosystem:** Massive React ecosystem for future features

**Trade-offs:**

- React 19 very new (potential breaking changes)
- Mantine less popular than Material-UI (smaller community)
- SPA requires client-side routing (SEO considerations)

**Why Not Alternatives?**

- ❌ Vue/Angular: Smaller ecosystems, less TypeScript support
- ❌ Next.js: SSR complexity overkill for clinical admin tool (not public-facing)
- ❌ Material-UI: Larger bundle size, more opinionated
- ✅ React + Mantine: Balance of features, bundle size, developer experience

### 5. Why Docker Compose (Not Kubernetes)?

**Decision:** Use Docker Compose for development and initial deployment.

**Rationale:**

- **Simplicity:** Easy to understand, minimal config, fast iteration
- **Development:** Hot reload, familiar to developers
- **Sufficient:** Handles current scale (hundreds of users)
- **Migration Path:** Can migrate to Kubernetes later when needed

**Trade-offs:**

- No automatic scaling
- Single host deployment (no HA)
- Manual failover

✅ **CONFIRMED**: Consider **building with Kubernetes early** - may move to Kubernetes sooner than initially planned to support fast scaling capability.

**Kubernetes Considerations:**

- Enables horizontal pod autoscaling
- Multi-node high availability
- Easier cloud-agnostic deployment
- Steeper learning curve but better long-term scalability

**Recommendation:** Evaluate Kubernetes implementation in Phase 1 or early Phase 2, not wait until 50k+ users.

### 6. Why In-Memory Push Subscriptions?

**Decision:** Store push subscriptions in-memory Python list (temporary).

**Rationale:**

- **Speed:** Fast prototyping, no database overhead
- **Temporary:** Push notifications not critical MVP feature
- **Migration Path:** Clear that this needs database persistence

**Trade-offs:**

- Lost on backend restart
- No high availability
- No user association

**Why?**

- ⚠️ **INCOMPLETE**: Explicitly temporary solution, flagged for Phase 1 fix
- Moving to PostgreSQL table with user foreign key

### 7. Why File Storage in MVP?

**Decision:** Implement MinIO file storage as **MVP priority** (Phase 1, not Phase 3).

**Rationale:**

✅ **CONFIRMED**: File attachments required for MVP - clinical workflows need document upload capability from the start.

- MinIO confirmed as object storage solution
- Medical documents (PDFs, images, scans) are core to clinical communication
- Messaging and letters need attachment support

**Implementation Requirements:**

- Deploy MinIO in Docker Compose
- FHIR DocumentReference integration
- Virus scanning (ClamAV or cloud-based)
- Presigned URLs for secure download
- Metadata in PostgreSQL with audit trail

**Updated Roadmap:**

- Phase 1: Messaging system + File storage (revised priority)
- Phase 2: Letter workflow
- Phase 3: Advanced file features (versioning, bulk upload, etc.)

### 8. Why No Billing System Yet?

**Decision:** Defer Stripe/billing to Roadmap Phase 4 (optional).

**Rationale:**

- **Business Model Uncertain:** May not need payment processing for MVP
- **Clinical Focus First:** Get core clinical workflows right before monetisation
- **Quotes Without Payment:** Can generate estimates without collecting payment

**Trade-offs:**

- No revenue collection
- Manual invoicing required

**Why Optional?**

- Business model may rely on subscriptions or contracts (not per-transaction)
- Can launch with manual billing initially

---

## Questions for Human

### 1. Database & Storage

❓ **Q1:** Backup strategy for development vs. production - are Docker volumes sufficient for dev or should we implement backup scripts now?

❓ **Q2:** Is MinIO the confirmed choice for file storage or should we consider Azure Blob Storage (UK region) directly?

❓ **Q3:** Should file storage be part of MVP (Phase 1) or can it wait until Phase 3 as currently planned?

❓ **Q4:** Do we need document attachments for messaging workflow (Phase 1) or can messages be text-only initially?

❓ **Q5:** Should push subscriptions be persisted in auth database with user_id foreign key? **REQUIRES DISCUSSION** - to be determined later.

### 2. Security & Compliance

❓ **Q6:** Should CSRF be required for all POST/PUT/PATCH/DELETE operations or only specific sensitive actions?

❓ **Q7:** Is IP allowlisting required for clinical environments? Should admin operations be restricted to specific IP ranges?

❓ **Q8:** What password policy should we enforce for production? (Current: min 6 chars, no complexity requirements)

❓ **Q9:** Do we need TLS between internal services (backend ↔ FHIR/EHRbase, backend ↔ databases) for production?

❓ **Q10:** What secrets management solution should we target for production? (HashiCorp Vault, Azure Key Vault, AWS Secrets Manager?)

### 3. Scalability & Performance

❓ **Q11:** What is the expected user growth rate? (Timeline assumptions: Year 1: 0-10k users, Year 2: 10k-50k, Year 3: 50k-500k)

❓ **Q12:** ~~At what scale should we migrate from Docker Compose to Kubernetes?~~ **ANSWERED**: Consider building with Kubernetes **early** (Phase 1 or early Phase 2) to support fast scaling capability.

❓ **Q13:** ~~Is multi-tenant architecture required for MVP?~~ **CLARIFICATION NEEDED**: Multi-tenancy definition:

**What is Multi-Tenancy?**

Multi-tenancy means **multiple independent organisations (clinics) using the same application deployment** while keeping their data completely isolated.

**Example:**

- St Mary's Hospital uses Quill Medical
- London General Practice uses Quill Medical
- Both on the same servers/database cluster
- Each sees only their own patients/staff/data
- Reduces infrastructure costs (shared servers)
- Centralised maintenance and updates

**Alternatives:**

1. **Single-tenant**: Each clinic gets their own deployment (separate servers, databases)
2. **Multi-tenant**: All clinics share infrastructure, data isolated by `clinic_id`

**Question:** Does Quill need multi-tenant architecture for MVP, or is single-tenant sufficient initially?

### 4. Healthcare Standards

❓ **Q14:** ~~Should we implement FHIR authentication (OAuth2)?~~ **ANSWERED**: Yes, OAuth2 between backend and HAPI FHIR required **very soon** (early implementation priority).

❓ **Q15:** ~~Is OpenEHR template creation a priority?~~ **ANSWERED**: Yes, template `quill_letter.v1` creation is **immediate priority** - must be completed now.

❓ **Q16:** ~~Do we need FHIR Practitioner resources?~~ **CLARIFICATION NEEDED**: FHIR Practitioner definition:

**What are FHIR Practitioner Resources?**

FHIR Practitioner resources represent healthcare professionals in the FHIR system:

- Doctor profiles (name, qualifications, specialisation)
- Registration numbers (GMC number in UK)
- Contact information
- Role and organisation associations

**Current State:**

- Clinicians stored in auth database (users table with Clinician role)
- No FHIR Practitioner resources

**Question:** Should clinicians be represented as FHIR Practitioner resources (for interoperability with other systems) or is the auth database sufficient?

### 5. Integration & Deployment

❓ **Q17:** ~~Are there any other healthcare systems we need to integrate with?~~ **ANSWERED**: Not needed now - NHS Spine, GP systems integration excluded from initial scope.

❓ **Q18:** ~~What is the target deployment environment?~~ **REQUIRES IN-DEPTH DISCUSSION**:

**Key Requirements:**

- Code must be **agnostic to deployment location** (portable architecture)
- **Ease of scaling** is important
- **Cost** is important factor

**Options to Discuss:**

1. Self-hosted VMs (full control, manual scaling)
2. Azure (UK regions available, managed services)
3. AWS (extensive services, UK regions)
4. On-premises (maximum control, capital expense)
5. Hybrid approach

**Action:** Schedule in-depth discussion on deployment strategy, weighing portability, scaling, and cost.

❓ **Q19:** ~~Do we need HL7 v2 or CDA support?~~ **ANSWERED**: Not sure we need HL7 v2 or CDA - excluded from initial scope unless specific use case identified.

❓ **Q20:** ~~Should we plan for offline-first capabilities?~~ **ANSWERED**: **Some simple offline capabilities are important** - implement basic PWA features (service worker caching, offline page, background sync for failed requests).

---

## Assumptions to Verify

### Security Assumptions

🔍 **A1:** Production requires token blacklist (Redis or database table) for immediate JWT revocation after logout.

🔍 **A2:** Production requires stronger password policy: min 12 chars, uppercase, lowercase, numbers, symbols.

🔍 **A3:** Production requires authentication between backend and FHIR server (OAuth2 or mutual TLS).

🔍 **A4:** Production requires rate limiting on all API endpoints.

🔍 **A5:** Production requires database encryption at rest (PostgreSQL TDE or encrypted volumes).

🔍 **A6:** Production requires HashiCorp Vault or cloud KMS for secrets management.

🔍 **A7:** Production requires service-to-service TLS for backend ↔ FHIR/EHRbase communication.

### Scalability Assumptions

🔍 **A8:** Current architecture can handle ~100 concurrent users, ~1000 patients, ~10,000 letters, ~1GB/month growth.

🔍 **A9:** Migration timeline: Year 1 (vertical scaling), Year 2 (replicas), Year 3 (Kubernetes), Year 4+ (multi-region).

🔍 **A10:** Single-region deployment sufficient until 500k+ users.

### Integration Assumptions

🔍 **A11:** Future implementation may need attribute-based access control (ABAC) for fine-grained permissions beyond RBAC.

🔍 **A12:** No other healthcare integrations required initially (NHS Spine, HL7 v2, CDA) - FHIR and OpenEHR sufficient.

### Operational Assumptions

🔍 **A13:** Development environment doesn't need automated backups - Docker volumes sufficient.

🔍 **A14:** Production requires: automated PostgreSQL backups, off-site storage, regular restore testing, documented disaster recovery.

🔍 **A15:** Kubernetes migration triggered by scaling needs (50k+ users) or HA requirements, not technical preference.

---

## Architectural Gaps

### Critical Gaps (Blocking Production)

⚠️ **G1:** No audit logging - required for clinical-grade compliance (append-only table with hash chain planned in Roadmap Phase 1).

⚠️ **G2:** No token revocation mechanism - logout doesn't invalidate tokens until expiry.

⚠️ **G3:** No backup/disaster recovery strategy - data loss risk.

⚠️ **G4:** No database encryption at rest - data at risk if disks compromised.

⚠️ **G5:** No secrets management - credentials in .env files on disk.

### Important Gaps (Early Production)

⚠️ **G6:** No rate limiting - vulnerable to brute force and DoS attacks.

⚠️ **G7:** CSRF protection incomplete - only some routes protected.

⚠️ **G8:** No authentication on push notification endpoints - anyone can subscribe/send.

⚠️ **G9:** Push subscriptions stored in-memory - lost on restart, no HA.

⚠️ **G10:** Service Worker not extensively developed - offline functionality, background sync missing.

### Feature Gaps (Roadmap Phases)

⚠️ **G11:** No file storage - attachments not supported (Phase 3).

⚠️ **G12:** OpenEHR template `quill_letter.v1` not created - letter composition may fail.

⚠️ **G13:** No fine-grained permissions - only role-based, not resource-level.

⚠️ **G14:** No multi-tenant support - single clinic only (needs design for multiple clinics).

⚠️ **G15:** No monitoring/observability - no APM, no error tracking, no metrics.

### Infrastructure Gaps

⚠️ **G16:** No horizontal scaling - single backend instance.

⚠️ **G17:** No load balancing - Caddy serves single backend.

⚠️ **G18:** No database replication - single point of failure for data.

⚠️ **G19:** No CDN - static assets served from origin.

⚠️ **G20:** No CI/CD pipelines beyond pre-commit hooks - deployment is manual.

---

## End of Architecture Documentation
