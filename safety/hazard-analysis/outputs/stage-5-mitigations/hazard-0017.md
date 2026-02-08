# Hazard

**Hazard id:** Hazard-0017

**Hazard name:** Invalid letter content stored in EHRbase

**Description:** create_letter_composition function does not validate letter content before submission to EHRbase including content length limits, markdown safety, or required field validation beyond type checking.

**Causes:**

- No content length limits enforced
- No validation of markdown safety (potential XSS if rendered unsafely)
- No check for required fields beyond TypeScript/Pydantic type checking
- Malicious or corrupted letter content accepted

**Effect:**
Invalid or malicious letter content stored in OpenEHR composition. Letter cannot be displayed correctly or contains injection attacks.

**Hazard:**
Critical clinical letter unreadable when needed for emergency treatment decision. Corrupted letter content causes UI crash or display errors.

**Hazard controls:**

### Design controls (manufacturer)

- Add content length validation: reject letters with body >1MB (configurable limit). Return 400 error: "Letter content exceeds maximum length of 1MB."
- Implement markdown sanitization using Python markdown-it library with safe defaults: strip HTML tags, disallow JavaScript, remove event handlers. Only allow safe markdown syntax (headers, lists, bold, italic, links).
- Add Pydantic field validators on LetterIn schema: validate title length 1-500 characters, body length 1-1,000,000 characters, author_name matches email-like pattern if provided.
- Implement content validation endpoint: POST /api/validate/letter-content accepts letter JSON, returns validation errors without saving. Frontend can pre-validate before submission.
- Add character encoding validation: ensure letter content is valid UTF-8, reject malformed encoding that could cause rendering issues. Normalize Unicode characters (NFD to NFC form).

### Testing controls (manufacturer)

- Unit test: Attempt to create letter with 2MB body content. Assert 400 error returned with message about length limit. Verify no OpenEHR composition created.
- Unit test: Submit letter containing HTML script tags `<script>alert('XSS')</script>`. Assert markdown sanitizer strips dangerous HTML, final stored content contains only safe markdown.
- Integration test: Create letter with empty title, empty body, or invalid author_email format. Assert Pydantic validation errors returned, no composition created in EHRbase.
- Unit test: Test malformed UTF-8 byte sequences in letter body. Assert validation catches encoding errors before attempting EHRbase submission.

### Training controls (deployment)

- Train clinicians on letter content guidelines: professional clinical language, structured format, clear sections. Provide templates for common letter types.
- Document acceptable markdown syntax: headers, lists, bold/italic text, hyperlinks. Explain HTML tags not supported for security reasons.

### Business process controls (deployment)

- Clinical governance: Clinical letters must follow structured template (reason for consultation, history, examination, assessment, plan). Template enforcement via form design.
- Quality assurance: Random sampling of 50 letters monthly for content quality review. Identify deviations from clinical documentation standards.
- IT security policy: Regular penetration testing of letter rendering to verify markdown sanitization prevents XSS attacks.

**Harm:**
Clinician cannot access critical clinical information during emergency, leading to delayed treatment or incorrect treatment decisions. Patient harm due to missing clinical context.

**Code associated with hazard:**

- `backend/app/ehrbase_client.py:155-233`
