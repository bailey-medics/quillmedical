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

Login endpoint returns user roles in HTTP response body JSON, exposing authorization structure and role names to potential attackers via enumeration.

---

## Causes

1. Login response includes roles array in JSON
2. Information not necessary for client-side auth (roles already in JWT payload)
3. Allows attacker to enumerate role names without being authenticated

---

## Effect

Attacker can learn system has "Clinician", "Administrator", "Billing Staff" roles by calling login endpoint, aiding privilege escalation attack planning.

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

None identified during initial analysis.

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
- Add API security headers: X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Content-Security-Policy. Prevent role information leakage via XSS or clickjacking attacks.

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

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

- backend/app/main.py:280-285
