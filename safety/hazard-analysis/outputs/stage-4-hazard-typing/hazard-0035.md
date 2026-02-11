# Hazard

**Hazard id:** Hazard-0035

**Hazard name:** API path validation insufficient

**Description:** API request validates path starts with "/" but doesn't prevent path traversal attacks like "/api/../admin", potentially allowing malicious code to bypass API prefix and access unintended endpoints.

**Causes:**

- Path validation only checks startsWith("/") without normalization
- No canonicalization of path to resolve ".." segments
- Fetch URL constructed as template string without sanitization

**Effect:**
Malicious code can construct API requests that bypass intended endpoint restrictions and access administrative or debug endpoints.

**Hazard:**
Unauthorized access to administrative endpoints, debug information, or internal APIs that should not be publicly accessible.

**Hazard types:**

- DataBreach

**Harm:**
Data breach with unauthorized access to patient records. Potential for system compromise allowing attacker to modify clinical records causing patient harm through falsified information.

**Code associated with hazard:**

- `frontend/src/lib/api.ts:48-51`
