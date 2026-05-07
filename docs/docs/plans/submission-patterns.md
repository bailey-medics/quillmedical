# Form Submission UX Pattern — Quill Medical

## Decision Tree

### 1. Destructive or irreversible actions

- **Pattern:** Confirmation modal _before_ submission
- **Examples:** Deleting a patient record, sending a letter to a GP, finalising a clinical note, removing a member from a CareBoard
- **Modal acts as a safety gate, not a success message**
- After confirmation, fall through to standard success feedback (see below)

### 2. Standard submissions that stay on the form

- **Pattern:** Submit button state change + status card at top of form
- **Button lifecycle:**
  - Idle: action label (e.g. "Save", "Submit")
  - Submitting:
    - `aria-disabled="true"` (not `disabled`) to remain focusable and screen-reader-accessible
    - Spinner with `role="status"` / `aria-label`, delayed by 150–300ms to avoid flashing on fast requests
    - Label changes to action-appropriate verb + ellipsis (U+2026): "Saving…", "Sending…", "Uploading…", "Submitting…"
    - Button width fixed (or `min-width` set) to prevent layout shift
    - For long-running operations, cancel affordance appears after ~2s, wired to the form's AbortController
  - Success: briefly "Saved ✓" (1–2s) then return to idle, OR remain disabled if re-submission should be blocked
  - Error: return to idle; error surfaced in status card
- **Status card:** rendered in a reserved slot at the top of the form
- **Scroll into view** on success/error if off-screen
- **Do not auto-dismiss** — clears on next navigation or user action

### 3. Submissions that navigate away on success

- **Pattern:** Button state during submission + status card on destination page
- No status card on the form (user has left it)
- Status card on destination page (e.g. "Letter created — ID #1234")
- Clears on next navigation; no timer-based auto-dismiss

## Status Card Requirements

- Rendered at the top of the form (or destination page)
- Same width as the form
- Semantic variants: success, warning (partial success), error
- Includes icon for at-a-glance recognition
- `role="status"` with `aria-live="polite"` for screen readers
- Dismissible by user, but never auto-dismissed on a timer
- Content should carry useful information:
  - Generated record ID
  - Timestamp
  - Link to view created record (where applicable)
  - Composite outcomes for multi-layer writes (e.g. "Letter saved to patient record. Delivery to GP queued.")

## Submit Button Requirements

- **Always disabled during in-flight submission** to prevent double-submits (clinical safety: avoids duplicate `Communication` resources, duplicate clinical entries)
- Spinner + "Saving…" label during submission
- Brief success state ("Saved ✓") before returning to idle, where appropriate

## Patterns to Avoid

- Toasts/snackbars as the _primary_ confirmation for clinical or transactional actions
- Auto-dismissing notifications for anything safety-relevant
- Confirmation modals as _post_-submission acknowledgement (modals are pre-action only)
- Button morphing into a permanent "Finished" state with no other feedback

## Acceptable Use of Toasts

- Lightweight, non-clinical, ambient confirmations only (e.g. "Theme updated", "Preferences saved")
- Never as the sole signal for any write to the clinical layer or administrative layer with clinical consequence

## Composite (Multi-Layer) Submissions

- Where a submission writes to both administrative and clinical layers, the status card must communicate the composite outcome honestly
- Partial success states (e.g. "Saved, but FHIR sync pending") must be surfaced, not hidden

---

## FormStatus architecture

### Pattern: form wrapper with context-aware children

Inspired by Django's `Form` object on the server: a single source of truth for submission state, with the UI rendered from it. In React, this is implemented via a `<Form>` wrapper that owns a state machine and exposes it through context.

### Component composition

```tsx
<Form onSubmit={handleSubmit} timeoutMs={30000}>
  <FormStatus /> {/* subscribes to context */}
  <FormField name="..." />
  <FormField name="..." />
  <SubmitButton /> {/* subscribes to context */}
</Form>
```

- `<Form>` owns state, validation, submission, timeout handling
- `<FormStatus>`, `<FormField>`, `<SubmitButton>` all subscribe to the same context
- No prop drilling; no manual wiring of status to fields to button
- UI cannot drift out of sync with form state

### State machine

The `<Form>` wrapper owns these states:

- `idle` — initial state, no submission attempted
- `validating` — client-side validation running
- `submitting` — request in flight
- `success` — full success
- `partial_success` — composite write where some layers succeeded, some did not
- `error` — server rejected, validation failed, or other known failure
- `timeout` — request exceeded configured timeout (distinct from `error`)

#### Why `partial_success` matters for Quill

Submissions that write to both administrative and clinical layers can succeed in one and fail in the other (e.g. FHIR `Communication` written, admin-layer thread metadata failed). This must be modelled explicitly, not collapsed into success or error.

#### Why `timeout` is distinct from `error`

"The network hung" and "the server rejected your submission" require different user messages and different recovery actions. Conflating them risks misleading clinical users about whether data was saved.

### `<FormStatus>` component

- Standalone, reusable, themeable component
- Renders nothing in `idle` and `validating` states
- Subscribes to form context — no props needed in production use
- Accepts props in Storybook for variant testing
- Variants:
  - `success`
  - `partial_success` (warning styling)
  - `error`
  - `timeout`
- Accessibility:
  - `role="status"` for success/partial_success
  - `role="alert"` for error/timeout
  - `aria-live="polite"` (or `assertive` for errors)
- Persistent — never auto-dismissed on a timer
- Dismissible by user action
- Renders at top of form, scrolls into view if off-screen
- Content includes:
  - Status message
  - Generated record ID (where applicable)
  - Timestamp
  - Link to created record (where applicable)
  - Composite outcome details for `partial_success`

### `<SubmitButton>` component

- Subscribes to form context
- Disabled during `validating` and `submitting` (prevents double-submit — clinical safety)
- Shows spinner + "Saving…" during `submitting`
- Brief "Saved ✓" state on `success` before returning to idle (or remains disabled if re-submit should be blocked)
- Returns to idle on `error` or `timeout`

### `<FormField>` components

- Subscribe to form context for their own error state
- Field-level errors rendered inline beneath the field
- Form-level errors handled by `<FormStatus>`
- Both can coexist (e.g. `<FormStatus>` shows "3 issues to fix", fields show specific errors)

### Timeout handling

- Configured at the `<Form>` level (e.g. `timeoutMs={30000}`)
- Implemented via `AbortController`
- Transitions form to `timeout` state on expiry
- `<FormStatus>` renders a `timeout` variant with appropriate recovery guidance

### Storybook strategy

- `<FormStatus>` built as a standalone component with prop-driven variants for stories
- All states represented: `success`, `partial_success`, `error`, `timeout`
- Production usage wraps it in form context — no prop drilling
- Same component, two integration modes: prop-driven for stories, context-driven for real forms

### Library recommendation

Build on **React Hook Form** (or TanStack Form if preferred for stricter type safety):

- Mature `formState` API (`isSubmitting`, `isSubmitSuccessful`, `errors`, `submitCount`)
- Performant (uncontrolled inputs by default)
- Wide ecosystem, well-documented, low risk
- Wrap it in a Quill-specific `<Form>` to add the state machine extensions Quill needs (`partial_success`, `timeout`, composite outcome modelling)

Do not roll the form state from scratch — the wrapper is Quill-specific, but the underlying form library should not be.

### Why the wrapper pattern earns its complexity in Quill

- **Audit and safety:** a single, documented state machine is far easier to reason about for DCB 0129 hazard analysis than scattered `useState` calls
- **Consistency:** Quill will have many forms (registration, clinic venues, file uploads, letters, messaging) — the wrapper enforces consistent behaviour without copy-paste
- **Composite outcomes:** the admin/clinical layer split makes `partial_success` a real and recurring case; the wrapper is the right place to model it
- **Testability:** state transitions can be unit-tested in isolation from the UI

### Summary

- Not a standalone status component you wire up manually
- Not a monolithic form component
- A **wrapper that owns state**, with **composable children that subscribe to it**
- The React equivalent of Django's `Form` object as a single source of truth
