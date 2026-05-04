<!-- cspell:words mkstemp sslmode sslrootcert formedness lxml etree fromstring -->

# Hardening plan v2

CTO-level security, reliability, and code quality audit — 4 May 2026.

## Summary

Overall security posture is **good**. Authentication, authorisation, and XSS protections are solid. No critical exploitable vulnerabilities found. However, there are **2 high-severity issues** around data reliability, plus several medium items that need addressing for production readiness in a healthcare context.

---

## High severity

### 1. ~~In-memory push notification subscriptions~~ ✅

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| **Location** | `backend/app/push.py` (~line 13)                                                                     |
| **Risk**     | Push subscriptions stored in a Python dict — all are lost on container restart, deployment, or crash |
| **Impact**   | Users silently stop receiving notifications with no way to recover without re-subscribing            |

#### Fix plan

1. Create a `PushSubscription` SQLAlchemy model in `backend/app/models.py`:
   - Fields: `id`, `user_id` (FK to User), `endpoint`, `keys_p256dh`, `keys_auth`, `created_at`
   - Unique constraint on `(user_id, endpoint)`
2. Create an Alembic migration: `just migrate "add push_subscription table"`
3. Update `backend/app/push.py`:
   - Replace in-memory dict with DB queries
   - `subscribe()` → upsert to DB
   - `unsubscribe()` → delete from DB
   - `get_subscriptions(user_id)` → query DB
4. Update `backend/app/push_send.py` to read subscriptions from DB
5. Handle stale subscriptions (410 Gone from push service → delete from DB)
6. Add tests for subscribe/unsubscribe/send lifecycle

---

### 2. ~~Race condition in `get_or_create_ehr`~~ ✅

|              |                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Location** | `backend/app/ehrbase_client.py` (~line 104)                                                                                             |
| **Risk**     | Non-atomic check-then-create pattern. Two concurrent requests for the same patient could both see "no EHR exists" and create duplicates |
| **Impact**   | Duplicate clinical records for a patient — data integrity violation                                                                     |

#### Fix plan

1. Add a unique constraint in EHRbase configuration on `subject_id + subject_namespace` (if supported)
2. Wrap `get_or_create_ehr` in a retry pattern:

   ```python
   def get_or_create_ehr(subject_id: str, subject_namespace: str = "fhir") -> str:
       ehr = get_ehr_by_subject(subject_id, subject_namespace)
       if ehr:
           return ehr["ehr_id"]["value"]
       try:
           new_ehr = create_ehr(subject_id, subject_namespace)
           return new_ehr["ehr_id"]["value"]
       except EhrAlreadyExistsError:
           # Another request created it between our check and create
           ehr = get_ehr_by_subject(subject_id, subject_namespace)
           if ehr:
               return ehr["ehr_id"]["value"]
           raise
   ```

3. Alternatively, use an application-level advisory lock (Redis or PostgreSQL advisory lock) keyed on `subject_id` before the check-then-create
4. Add an integration test that simulates concurrent EHR creation for the same patient

---

## Medium severity

### 3. ~~No file locking in patient records~~ ❌ Removed

|              |                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Location** | `backend/app/patient_records.py` (deleted)                                                                                |
| **Status**   | **False positive** — module was legacy dead code, never imported or used. Deleted along with its test file. No fix needed |

---

### 4. ~~Unpinned Docker images in production~~ ✅

|              |                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Location** | `compose.prod.fhir-openehr.yml`                                                                                                                                                        |
| **Risk**     | `postgres:18-alpine`, `ehrbase/ehrbase-v2-postgres:16.2`, `hapiproject/hapi:v8.8.0-1` are not pinned by digest — a compromised or breaking upstream tag update could affect production |
| **Impact**   | Supply chain attack vector or unexpected breaking changes                                                                                                                              |

#### Fix plan

1. For each image, resolve the current digest:

   ```bash
   docker pull postgres:18-alpine
   docker inspect --format='{{index .RepoDigests 0}}' postgres:18-alpine
   ```

2. Update `compose.prod.fhir-openehr.yml` to use digest-pinned references:

   ```yaml
   image: postgres:18-alpine@sha256:<digest>
   ```

3. Add a Renovate config entry to auto-update these digests (already have `renovate.json`)
4. Document the pinning policy in the repo README or contributing guide

---

### 5. No email rate limiting

|              |                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Location** | `backend/app/email_send.py`                                                                   |
| **Risk**     | No rate limiting on email sends — a compromised account or bug could trigger mass email sends |
| **Impact**   | Provider cost overrun, spam reputation damage, potential account suspension                   |

#### Fix plan

1. Add a per-user email rate limit (e.g., max 10 emails/hour):
   - Option A: Use `slowapi` (already in project) with a custom key function
   - Option B: Add a simple DB counter (`EmailSendLog` table with timestamp + user_id)
2. Rate limit at the endpoint level (password reset, invite emails, etc.)
3. Add monitoring/alerting for unusual email volume
4. Add tests verifying rate limit enforcement

---

### 6. No explicit database SSL enforcement

|              |                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Location** | `infra/modules/cloud-sql/main.tf`                                                                                           |
| **Risk**     | Database uses private IP (good), but SSL is not explicitly required — traffic could theoretically be intercepted on the VPC |
| **Impact**   | Data in transit exposure (low probability on private network, but defence-in-depth)                                         |

#### Fix plan

1. In `infra/modules/cloud-sql/main.tf`, add:

   ```hcl
   settings {
     ip_configuration {
       require_ssl = true
     }
   }
   ```

2. Update backend database connection strings to include SSL parameters:

   ```
   ?sslmode=verify-full&sslrootcert=/path/to/server-ca.pem
   ```

3. Test database connectivity with SSL enforced
4. Apply via Terraform plan/apply with a maintenance window

---

### 7. Console.log statements in production code

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Location** | `frontend/src/pages/Home.tsx` (~L120, L189), `frontend/src/pages/admin/AdminPermissionsPage.tsx` (~L136)           |
| **Risk**     | Development logging left in production — could leak internal state, user data, or API responses in browser console |
| **Impact**   | Information disclosure to anyone with browser dev tools open                                                       |

#### Fix plan

1. Remove all `console.log` statements from the identified files
2. Add ESLint rule to prevent future occurrences:

   ```js
   // eslint.config.js
   rules: {
     "no-console": ["error", { allow: ["warn", "error"] }]
   }
   ```

3. Run `yarn lint --fix` to catch any remaining instances
4. CI will enforce going forward

---

### 8. Cascade deletes on clinical data

|              |                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Location** | `backend/app/models.py` (~L254, L438)                                                                                                          |
| **Risk**     | Some relationships use `ondelete="CASCADE"` — deleting a conversation or organisation could permanently destroy clinical messages/compositions |
| **Impact**   | Irreversible loss of clinical correspondence (regulatory and patient safety issue)                                                             |

#### Fix plan

1. Audit all `ondelete="CASCADE"` in `models.py` — identify which apply to clinical data
2. For clinical data (messages, compositions, letters):
   - Replace `ondelete="CASCADE"` with `ondelete="RESTRICT"` (prevent deletion if children exist)
   - Add soft-delete: `deleted_at: Mapped[datetime | None]` column
   - Update queries to filter out soft-deleted records
3. For non-clinical data (feature flags, session tokens): CASCADE is acceptable
4. Create Alembic migration for the schema changes
5. Update delete operations to use soft-delete for clinical records
6. Add tests verifying clinical data cannot be accidentally hard-deleted

---

## Low severity

### 9. No global React error boundary

|              |                                                                         |
| ------------ | ----------------------------------------------------------------------- |
| **Location** | `frontend/src/main.tsx` / `frontend/src/RootLayout.tsx`                 |
| **Risk**     | Unhandled React errors crash the entire application with a white screen |
| **Impact**   | Poor user experience, potential data loss if user was mid-form          |

#### Fix plan

1. Create `frontend/src/components/error-boundary/ErrorBoundary.tsx`:
   - Catch errors, display a friendly "something went wrong" message
   - Include a "reload" button
   - Log error to monitoring service (Sentry or similar)
2. Wrap the router outlet in `RootLayout.tsx` with `<ErrorBoundary>`
3. Add Storybook story and test
4. Consider adding route-level error boundaries for isolation

---

### 10. No request body size limit

|              |                                                                                  |
| ------------ | -------------------------------------------------------------------------------- |
| **Location** | `backend/app/main.py` / Uvicorn config                                           |
| **Risk**     | No explicit max request body size — attacker could send extremely large payloads |
| **Impact**   | Memory exhaustion DoS                                                            |

#### Fix plan

1. Add request size limiting middleware or configure Uvicorn:

   ```python
   # In backend/docker/entrypoint.sh or uvicorn config
   --limit-max-request-size 10485760  # 10MB
   ```

2. For specific endpoints that don't need large bodies (auth, messaging), add tighter limits via middleware
3. Test that oversized requests are rejected with 413

---

### 11. FHIR client missing error handling

|              |                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------- |
| **Location** | `backend/app/fhir_client.py`                                                             |
| **Risk**     | FHIR API calls propagate as unhandled exceptions — poor error messages and 500 responses |
| **Impact**   | Bad UX, potential information leakage in error responses                                 |

#### Fix plan

1. Create a custom exception class: `FhirClientError`
2. Wrap all `httpx`/`requests` calls in the FHIR client with try/except:

   ```python
   try:
       response = httpx.get(url, headers=headers)
       response.raise_for_status()
   except httpx.HTTPStatusError as e:
       logger.error("FHIR request failed: %s %s", e.response.status_code, url)
       raise FhirClientError(f"FHIR service error: {e.response.status_code}") from e
   except httpx.RequestError as e:
       logger.error("FHIR connection error: %s", url)
       raise FhirClientError("FHIR service unavailable") from e
   ```

3. Add a FastAPI exception handler for `FhirClientError` that returns a clean 502/503 response
4. Never include raw FHIR error bodies in user-facing responses

---

### 12. EHRbase XML template upload without validation

|              |                                                                                |
| ------------ | ------------------------------------------------------------------------------ |
| **Location** | `backend/app/ehrbase_client.py` (~line 123)                                    |
| **Risk**     | `upload_template` posts XML to EHRbase without local schema validation         |
| **Impact**   | Malformed templates could be rejected by EHRbase or cause unexpected behaviour |

#### Fix plan

1. Add basic XML well-formedness check before upload:

   ```python
   from lxml import etree

   def validate_template_xml(xml_content: str) -> None:
       try:
           etree.fromstring(xml_content.encode())
       except etree.XMLSyntaxError as e:
           raise ValueError(f"Invalid template XML: {e}") from e
   ```

2. Call `validate_template_xml` in `upload_template` before the HTTP POST
3. Note: Full OPT schema validation is handled by EHRbase itself — this is a fail-fast guard only

---

### 13. CBAC frontend hooks are placeholders

|              |                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Location** | `frontend/src/lib/cbac/hooks.ts`                                                                                                   |
| **Risk**     | `useHasCompetency`, `useHasAnyCompetency`, `useHasAllCompetencies` all return `false` — any UI gated by CBAC is permanently hidden |
| **Impact**   | Features are invisible to users who should have access (not a security risk since backend enforces, but a UX/functionality issue)  |

#### Fix plan

1. Extend the `/api/auth/me` response to include the user's resolved competencies list
2. Store competencies in `AuthContext` state
3. Implement the hooks to check against the stored competency list:

   ```typescript
   export function useHasCompetency(id: string): boolean {
     const { state } = useAuth();
     return state.user?.competencies?.includes(id) ?? false;
   }
   ```

4. Add tests for each hook with various competency combinations
5. Verify UI elements correctly show/hide based on competencies

---

## Additional recommendations

### Audit logging

No centralised audit trail for clinical data access was found. For NHS DSPT and ISO 27001 compliance, implement:

- Log who accessed which patient record, when
- Log all clinical document modifications (who, what, when)
- Store audit logs separately from application logs (tamper-resistant)
- Consider a dedicated `AuditLog` table or external service (Cloud Audit Logs)

### Dependency scanning in CI

Add automated vulnerability scanning for dependencies:

```yaml
# In CI pipeline
- run: pip-audit --strict
- run: yarn audit --level moderate
```

### Penetration testing

Code-level review looks solid, but a proper pentest against the running application would catch:

- Timing attacks on authentication
- SSRF via FHIR/EHRbase proxying
- Header smuggling through Caddy
- Business logic bypass under load

---

## Things done well

- JWT + HTTP-only cookies with `token_version` — proper session invalidation on password change
- CSRF double-submit with signed tokens
- Argon2id password hashing with sensible parameters
- Rate limiting on auth endpoints via slowapi
- XSS prevention via DOMPurify with strict allowlist in MarkdownView
- No PHI in localStorage/sessionStorage
- Digest pinning on main application Docker images
- Full security header suite in Caddy (HSTS, CSP, X-Frame-Options, Referrer-Policy)
- Secrets via GCP Secret Manager — never in Terraform state or code
- Pydantic `extra="forbid"` rejecting unexpected API fields
- Defence-in-depth (client guards + server enforcement)
- Network isolation with private subnets and no public database IPs
- Backups and point-in-time recovery configured for Cloud SQL
