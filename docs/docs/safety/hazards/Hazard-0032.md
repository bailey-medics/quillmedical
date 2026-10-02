# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

Login response exposes role information

---

## General utility label

[2]

---

## Likelihood scoring

TBC

---

## Severity scoring

TBC

---

## Description

Login endpoint returns the user's roles in the HTTP response body JSON. A person who has just logged in is told the names of the roles they hold.

Corrected on 2 October 2026: the draft said this exposed role names to unauthenticated attackers. It does not. The roles are returned only after a correct password (and second factor, where enabled), and only for the account that logged in. `/api/auth/me` gives the same person the same information.

---

## Causes

1. Login response includes roles array in JSON
2. Information not necessary for client-side auth (roles already in JWT payload)
3. A logged-in user learns the names of their own roles. Nobody learns anybody else's, and nothing is returned before authentication succeeds

---

## Effect

An attacker who already controls an account can read that account's role names from the login response. They cannot list the roles the system has, or see another user's. The role names in the draft ("Clinician", "Administrator", "Billing Staff") were illustrative; access is now decided by competencies and by membership of an org unit, not by role name.

---

## Hazard

Information disclosure aids targeted attacks on administrative or high-privilege accounts.

---

## Hazard type

- WrongPatientContext

---

## Harm

Increased risk of successful privilege escalation attack leading to unauthorized administrative access. Potential for complete system compromise allowing attacker to modify clinical records causing patient harm.

---

## Existing controls

Identified on review, 2 October 2026:

- Roles are returned only on a successful login, and only for the account that logged in.
- A failed login returns the single message "Invalid credentials", whether the username or the password was wrong.
- `/api/auth/login` is rate limited to 5 requests a minute.
- `/api/auth/me` requires authentication and returns 401 without it.
- API responses carry security headers, set at the load balancer for every route: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'self'`, `Strict-Transport-Security` and `Referrer-Policy`. A deploy fails if they go missing. See `docs/docs/plans/2026-10-02-api-security-headers-plan.md`.

---

## Assignment

Clinical Safety Officer

---

## Labelling

TBC (awaiting scoring)

---

## Project

Clinical Risk Management

---

## Hazard controls

### Design controls (manufacturer)

- Remove roles array from login response JSON. Return only success indicator: {"detail": "ok", "user": {"username": "string"}}. Frontend retrieves roles from separate authenticated endpoint /api/auth/me after login succeeds.
- Implement role enumeration protection: add generic error messages for authentication failures. Never return "Invalid role" or role-specific errors. Use single error: "Invalid username or password."
- Add rate limiting to /api/auth/me endpoint: limit to 10 requests per minute per authenticated user. Prevents bulk role enumeration via authenticated account.
- Implement role name obfuscation: store human-readable role names (Clinician, Administrator) in database but use UUIDs as role identifiers in JWT payload and API responses. Map UUID to name only in backend for authorization checks.
- Add API security headers: X-Content-Type-Options: nosniff, X-Frame-Options, Content-Security-Policy. Prevent role information leakage via XSS or clickjacking attacks. **Implemented 2 October 2026**, with `X-Frame-Options: SAMEORIGIN` rather than `DENY`: the certificate page shows a PDF from the API in an iframe, so the application itself must be able to frame an API response. Another site still cannot.

### Testing controls (manufacturer)

- Integration test: Call /api/auth/login with valid credentials. Parse response JSON. Assert "roles" key not present in response. Assert only "detail" and "user" keys present.
- Security test: Call /api/auth/me without authentication. Assert 401 Unauthorized (prevents unauthenticated role enumeration).
- Enumeration test: Attempt to enumerate roles by trying different role names in attack payloads. Verify system never reveals valid role names in error messages.
- Rate limit test: Authenticate user, call /api/auth/me 11 times in 1 minute. Assert 11th request returns 429 Too Many Requests.

### Training controls (deployment)

- Train developers on information disclosure risks: avoid exposing internal system structure (role names, table names, internal IDs) in API responses or error messages.
- Document secure error handling: use generic error messages, never reveal implementation details, log detailed errors server-side only.

### Business process controls (deployment)

- Security review policy: All API endpoints returning user information reviewed by security team before production deployment. Check for information disclosure vulnerabilities.
- Penetration testing: Annual penetration test includes role enumeration testing. Verify attackers cannot determine role structure without authentication.
- Incident response: If role structure disclosed in security incident, evaluate impact on privilege escalation attack surface. Consider renaming roles or implementing role obfuscation.
- DataBreach

---

## Residual hazard risk assessment

TBC – awaiting scoring by the Clinical Safety Officer.

One of the five design controls, the API security headers, is in place. The first, removing the roles array from the login response, is not: login still returns `user: {username, roles}`. Given the correction in the description, that the response tells a user only their own roles and only after they have logged in, the remaining design controls may not be needed. That is a judgement for the Clinical Safety Officer.

---

## Hazard status

Draft from LLM – facts corrected and controls updated 2 October 2026, scoring still awaited

---

## Code associated with hazard

- backend/app/main.py:821 (the `login` route)
