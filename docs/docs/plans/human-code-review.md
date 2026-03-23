# Human code review plan

Systematically review all LLM-generated code in risk-prioritised order: security-critical backend first, then healthcare data handling, then business logic, then frontend auth/API, then UI components. Each file gets specific review focus areas. ~40 backend files + ~50 key frontend files across 7 phases.

## Principles

- **Risk-first**: Security and healthcare-critical code reviewed before UI
- **Outside-in**: Start from system boundaries (auth, API, external integrations) then move inward
- **Tests alongside code**: Review the test for each file immediately after reviewing the file itself — catch gaps while context is fresh
- **One phase at a time**: Complete and sign off each phase before starting the next
- **Track progress**: Check off files as reviewed in the plan document

## Phase 1: Security core (highest risk)

Review the code that protects the entire system. A bug here affects everything.

### Files

- [ ] `backend/app/security.py` (~350 lines)
  - **Focus**: Argon2 password hashing params (memory cost, time cost), JWT algorithm and claims validation, token expiry enforcement, TOTP implementation against RFC 6238, CSRF token generation and validation (itsdangerous signing), no PHI in tokens
  - **Test**: `backend/tests/test_security.py`
- [ ] `backend/app/config.py` (~120 lines)
  - **Focus**: All `SecretStr` fields actually marked `SecretStr`, no secrets with defaults that could leak to prod, database URL construction (no injection), environment variable completeness
  - **Test**: `backend/tests/test_config.py`
- [ ] `backend/app/system_permissions/permissions.py` (~70 lines)
  - **Focus**: Permission hierarchy is correct and complete, `check_permission_level()` cannot be bypassed, no off-by-one in hierarchy
  - **Also review**: `backend/app/system_permissions/decorators.py` — FastAPI `Depends()` gates raise 403 correctly
  - **Also review**: `backend/app/system_permissions/__init__.py` — exports are correct
- [ ] `backend/app/cbac/decorators.py` (~80 lines)
  - **Focus**: `has_competency()` dependency actually blocks access (not just logs), high-risk competencies are audit-logged, competency resolution logic is correct
  - **Also review**: `backend/app/cbac/competencies.py` and `backend/app/cbac/base_professions.py`
  - **Test**: related CBAC tests
- [ ] `backend/app/db/auth_db.py` (~60 lines)
  - **Focus**: Connection pooling params, `pool_pre_ping`, session lifecycle (no leaked sessions), engine disposal
  - **Test**: `backend/tests/test_db.py`

### Phase 1 checklist

- [ ] No hardcoded secrets or default passwords
- [ ] All crypto uses standard libraries (no hand-rolled crypto)
- [ ] JWT validation checks expiry, issuer, algorithm
- [ ] TOTP window is tight (1-2 intervals max)
- [ ] Permission checks are deny-by-default
- [ ] CBAC resolution formula correct: `base + additional - removed`
- [ ] No SQL injection vectors (parameterised queries only)
- [ ] Error messages don't leak internal state

---

## Phase 2: API routes and input validation

The main attack surface — every endpoint needs correct auth, input validation, and authorisation.

### Files

- [ ] `backend/app/main.py` (~350 lines)
  - **Focus**: Every mutating endpoint has CSRF protection, every endpoint has appropriate auth dependency, correct HTTP methods used, rate limiting on login/register, error responses don't leak PHI, CORS configuration is correct
  - **Test**: `backend/tests/test_auth.py`
- [ ] `backend/app/schemas/auth.py` (~60 lines)
  - **Focus**: Password validation (min length, complexity?), username sanitisation, email validation, `extra='forbid'` on all models, no `Any` types
- [ ] `backend/app/schemas/cbac.py` (~70 lines)
  - **Focus**: Competency IDs validated against known set, no arbitrary strings accepted
- [ ] `backend/app/schemas/messaging.py` (~120 lines)
  - **Focus**: Message content length limits, conversation access properly scoped
- [ ] `backend/app/schemas/letters.py` (~25 lines)
  - **Focus**: Letter body sanitised (Markdown injection?), author validated
- [ ] `backend/app/schemas/features.py` (~25 lines)

### Phase 2 checklist

- [ ] Every route has auth dependency (no accidentally public endpoints)
- [ ] All mutating endpoints require CSRF
- [ ] Input validation at API boundary (Pydantic models with constraints)
- [ ] Admin endpoints check admin/superadmin permission
- [ ] Error responses use safe HTTP status codes (no 500 leaks)
- [ ] No mass assignment vulnerabilities (`extra='forbid'`)

---

## Phase 3: Healthcare data handling

Clinical data — correctness is patient safety. FHIR/OpenEHR integrations must be robust.

### Files

- [ ] `backend/app/fhir_client.py` (~370 lines)
  - **Focus**: Patient data mapping correctness (NHS number format, name parsing, DOB), FHIR resource creation follows spec, error handling for unavailable FHIR server, no PHI in logs, avatar gradient extension is non-clinical and safe to lose
  - **Tests**: `backend/tests/test_fhir_client.py` and `test_fhir_integration.py`
- [ ] `backend/app/ehrbase_client.py` (~270 lines)
  - **Focus**: EHR creation idempotency (`get_or_create_ehr`), subject_id validation, letter composition structure follows OpenEHR templates, Basic Auth credentials not logged, error handling
  - **Tests**: `backend/tests/test_ehrbase_client.py` and `test_ehrbase_integration.py`
- [ ] `backend/app/messaging.py` (~280 lines)
  - **Focus**: CQRS pattern correctness (FHIR write then SQL projection), org snowballing logic, message access control (can user A see user B's messages?), participant management, no PHI in SQL projection beyond what's needed
  - **Test**: `backend/tests/test_messaging.py`
- [ ] `backend/app/organisations.py` (~140 lines)
  - **Focus**: Org membership queries are correct (no data leakage across orgs), `check_user_patient_access()` is deny-by-default, shared org calculation
  - **Test**: related tests
- [ ] `backend/app/patient_records.py` (~90 lines)
  - **Flag as deprecated**: Confirm file-based storage is actually unused, or mark for removal

### Phase 3 checklist

- [ ] FHIR resources validate against FHIR R4 spec
- [ ] EHRbase templates are correct OpenEHR archetypes
- [ ] No PHI in application logs
- [ ] Error states fail safely (deny access, not grant)
- [ ] Idempotent operations are actually idempotent
- [ ] Cross-org data isolation is enforced

---

## Phase 4: Data models, migrations, and teaching feature

Database schema correctness and the teaching module business logic.

### Files

- [ ] `backend/app/models.py` (~750 lines)
  - **Focus**: All relationships correct (FK constraints, cascade deletes), `Mapped[Type]` annotations match actual DB types, no missing indexes on frequently queried columns, sensitive fields appropriately typed, password column length sufficient for Argon2 hash
  - **Test**: `backend/tests/test_models.py`
- [ ] `backend/alembic/versions/` (19 migrations)
  - **Focus**: Migration chain is unbroken, no data-loss migrations, FK constraints present, indexes on join columns
  - Spot-check 3-4 key migrations: init, CBAC, messaging, orgs
- [ ] `backend/app/features/teaching/router.py` (~350 lines)
  - **Focus**: Feature gate (`requires_feature("teaching")`) on all routes, educator routes require competency, assessment creation validates bank exists, scoring endpoint validates assessment ownership
- [ ] `backend/app/features/teaching/scoring.py` (~90 lines)
  - **Focus**: Scoring algorithm correctness, edge cases (empty answers, all wrong, all right), pass criteria evaluation
- [ ] `backend/app/features/teaching/validate.py` (~220 lines)
  - **Focus**: Validation catches malformed YAML, path traversal in image refs, handles missing files gracefully
- [ ] `backend/app/features/teaching/sync.py` (~170 lines)
  - **Focus**: Upsert logic (no duplicates), audit trail recorded, handles partial sync failures
- [ ] `backend/app/features/teaching/storage.py` (~120 lines)
  - **Focus**: GCS bucket access is read-only, local storage doesn't escape intended directory (path traversal), temp file cleanup
- [ ] `backend/app/features/teaching/models.py` (~180 lines)
  - **Also review**: `backend/app/features/teaching/schemas.py`
  - **Tests**: `backend/tests/test_teaching_*.py`

### Phase 4 checklist

- [ ] No path traversal in file operations
- [ ] Database constraints match business rules
- [ ] Scoring is deterministic and correct
- [ ] Feature gates are not bypassable
- [ ] Migrations are reversible

---

## Phase 5: Frontend security and data handling

Frontend auth, API communication, and data-sensitive code.

### Files

- [ ] `frontend/src/lib/api.ts` (~160 lines)
  - **Focus**: 401 retry logic doesn't loop infinitely, CSRF token attached to mutating requests, `credentials: 'include'` on all requests, no token stored in localStorage, error handling doesn't expose internals
- [ ] `frontend/src/auth/AuthContext.tsx`
  - **Focus**: Auth state transitions are correct, logout clears all state, no stale auth after session expiry, reload doesn't race
- [ ] `frontend/src/auth/RequireAuth.tsx`
  - **Focus**: Unauthenticated users redirected (not shown content briefly), no flash of protected content
- [ ] `frontend/src/auth/RequirePermission.tsx`
  - **Focus**: Permission check is deny-by-default, hierarchy comparison matches backend
- [ ] `frontend/src/auth/GuestOnly.tsx`
  - **Focus**: Authenticated users redirected away from login
- [ ] `frontend/src/auth/RequireFeature.tsx`
  - **Focus**: Feature check correct
- [ ] `frontend/src/main.tsx`
  - **Focus**: All routes wrapped in correct guards, no unprotected admin routes, route definitions match expected permissions
- [ ] `frontend/src/lib/cbac/hooks.ts`
  - **Focus**: Competency checks match backend logic, `useHasCompetency` doesn't default to `true`
- [ ] `frontend/src/types/cbac.ts`
  - **Focus**: Types match backend schema, type guards are correct
- [ ] `frontend/src/lib/fhir-patient.ts`
  - **Focus**: Patient data extraction handles missing fields, no crash on malformed FHIR response
- [ ] `frontend/src/RootLayout.tsx`
  - **Focus**: Patient context provider, layout structure

### Phase 5 checklist

- [ ] No tokens or credentials in localStorage/sessionStorage
- [ ] API client uses httpOnly cookies only
- [ ] Auth guards are deny-by-default
- [ ] No XSS vectors (React handles most, but check `dangerouslySetInnerHTML`)
- [ ] Permission/CBAC checks mirror backend (defence in depth)
- [ ] Route guards cannot be bypassed by direct URL navigation

---

## Phase 6: Frontend pages and components (lower risk)

UI code — focus on correctness and UX rather than security (already gated by Phase 5 guards). Spot-check key pages rather than all 34.

### Priority pages (data mutations or PHI)

- [ ] Login/Register pages (credential handling)
- [ ] Admin user management pages (permission assignment)
- [ ] Patient creation/messaging pages (PHI display)
- [ ] Teaching assessment pages (scoring display)

### Priority components (sensitive data)

- [ ] `Messaging` component (message content)
- [ ] `LetterView` (clinical content rendering — check for XSS in Markdown)
- [ ] `Demographics` (PHI display)
- [ ] `MarkdownView` (sanitisation)
- [ ] `MultiStepForm` (form submission)

### Phase 6 checklist

- [ ] No `dangerouslySetInnerHTML` without sanitisation
- [ ] Markdown rendering is sanitised (XSS via Markdown)
- [ ] Forms validate before submission
- [ ] Error states handled (loading, error, empty)
- [ ] No PHI in `console.log` statements
- [ ] Consistent UI patterns (Container, responsive breakpoints)

---

## Phase 7: Infrastructure and configuration

### Files

- [ ] `compose.dev.yml` — Hardcoded passwords (acceptable for dev?), network isolation, health checks
- [ ] `Justfile` — Command correctness, no destructive commands without confirmation
- [ ] `caddy/prod/Caddyfile` — Security headers complete, CSP policy, HSTS, caching
- [ ] `shared/*.yaml` — Competency definitions, profession templates, jurisdiction config (clinical accuracy — may need clinical safety officer input)
- [ ] `infra/` (Terraform) — Spot-check secrets management, IAM, firewall rules
- [ ] Dev scripts — Guard mechanism works, no accidental prod access

### Phase 7 checklist

- [ ] Dev credentials not usable in production
- [ ] Prod security headers are comprehensive
- [ ] Clinical competency definitions are clinically accurate
- [ ] Terraform secrets use Secret Manager (no plaintext)
- [ ] Destructive dev scripts have safety guards

---

## Review workflow per file

1. Read the file end-to-end
2. Check against the focus areas listed for that phase
3. Add inline comments for anything unclear or suspicious
4. Review the corresponding test file — are edge cases covered?
5. Run the tests if changes are made
6. Mark as reviewed with initials and date

## Key decisions

- **Review order follows risk**: security, API, healthcare, models, frontend auth, UI, infra
- **Tests reviewed alongside source files**, not in a separate pass
- **Deprecated code** (`patient_records.py`) flagged for removal rather than deep review
- **Infrastructure reviewed last** because it's less likely to have LLM-introduced bugs
- **Shared YAML files** may need clinical safety officer review for clinical accuracy, not just code review
- **Phase 6 is spot-check only** — reviewing all 34 pages and 180+ components isn't practical; focus on data-handling ones
