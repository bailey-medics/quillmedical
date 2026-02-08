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

**Hazard controls:**

### Design controls (manufacturer)

- Implement path normalization using URL constructor: create URL object from path, extract pathname property (automatically resolves ".." segments). Validate normalized path starts with "/api/". Reject paths containing ".." after normalization. Example: new URL(path, "<https://dummy.com").pathname>.
- Add allowlist of valid API endpoint patterns: maintain list of allowed path regex patterns [/^\/api\/patients/, /^\/api\/auth/, /^\/api\/letters/]. Validate requested path matches at least one pattern. Reject requests to unrecognized endpoints.
- Implement Content Security Policy (CSP): set CSP header that restricts fetch/XMLHttpRequest to same-origin only. Prevents malicious browser extensions from making API calls to arbitrary URLs. CSP: "default-src 'self'; connect-src 'self'".
- Add request origin validation: backend checks Origin header matches expected frontend domain. Reject requests from unexpected origins (e.g., attacker-controlled page). CORS policy: only allow requests from <https://quillmedical.com>.
- Implement Subresource Integrity (SRI) for all JavaScript files: include integrity attribute on script tags with base64 hash of file content. Browser refuses to execute script if hash mismatch (prevents tampering with api.ts file). Example: `<script src="api.js" integrity="sha384-..."></script>`.

### Testing controls (manufacturer)

- Unit test: Call api.request with path="/api/../admin". Assert request rejected with error "Invalid API path". Assert no HTTP request sent (check mock fetch not called).
- Security test: Attempt path traversal patterns: "/api/../admin", "/api/../../etc/passwd", "/api/./../debug". Verify all rejected before reaching backend.
- Integration test: Inject malicious path via XSS vulnerability (if any). Verify API client rejects malicious path. Verify backend never receives request to non-API endpoint.
- CSP test: Load application with CSP enabled. Use browser devtools to attempt fetch() call to external domain. Assert browser blocks request with CSP violation error.
- Allowlist test: Call api.request with path="/api/unknown-endpoint". Assert request rejected with error "Endpoint not in allowlist" (if allowlist implemented). Verify no HTTP request sent.

### Training controls (deployment)

- Train developers on path traversal risks: always normalize paths using URL constructor, validate against allowlist, never construct URLs from untrusted input via string concatenation.
- Document secure API client usage: examples of safe API calls, common pitfalls to avoid, requirement to use api.ts client (not raw fetch).

### Business process controls (deployment)

- Code review policy: All API endpoint additions reviewed by security team. New endpoints added to allowlist after security approval. Allowlist updated via configuration file (not hardcoded).
- Security testing: Annual penetration test includes path traversal testing. Verify API client rejects malicious paths. Verify backend rejects requests to administrative endpoints from frontend.
- CSP monitoring: Monitor CSP violation reports sent to backend /api/csp-report endpoint. Investigate violations: legitimate false positives vs. actual attack attempts. Tighten CSP policy if violations detected.

**Hazard types:**

- DataBreach

**Harm:**
Data breach with unauthorized access to patient records. Potential for system compromise allowing attacker to modify clinical records causing patient harm through falsified information.

**Code associated with hazard:**

- `frontend/src/lib/api.ts:48-51`
