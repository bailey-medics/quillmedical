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
  - Success: return to idle; success surfaced in status card
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

## Patterns to Avoid

- Toasts/snackbars as the _primary_ confirmation for clinical or transactional actions
- Auto-dismissing notifications for anything safety-relevant
- Confirmation modals as _post_-submission acknowledgement (modals are pre-action only)
- Button morphing into a permanent "Finished" state with no other feedback

## Acceptable Use of Toasts

- Lightweight, non-clinical, ambient confirmations only (e.g. "Theme updated", "Preferences saved")
- Never as the sole signal for any write to the clinical layer or administrative layer with clinical consequence

## Composite (Multi-Layer) Submissions

- ~~Where a submission writes to both administrative and clinical layers, the status card must communicate the composite outcome honestly~~
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
- Returns to idle on `success`, `error`, or `timeout`

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

---

## ConfirmModal architecture

### Purpose

A reusable confirmation modal for destructive or irreversible actions (Decision Tree §1). Acts as a safety gate _before_ submission — not a post-action acknowledgement.

### Layout

Icon-centred, vertically stacked, centre-aligned. No title bar. No close button (forces conscious dismissal via Cancel).

```
┌─────────────────────────────────────┐
│                                     │
│            ⚠  (icon)                │  ← optional
│                                     │
│         Remove staff member         │  ← optional title, bold, centred
│                                     │
│   Are you sure you want to remove   │  ← message (children), centred
│   Dr Smith from this organisation?  │
│   This action cannot be undone.     │
│                                     │
│         [Cancel] [Remove]           │  ← ButtonPairRed, right-justified
│                                     │
└─────────────────────────────────────┘
```

All three content elements (icon, title, message) are optional independently:

```
┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────┐
│                       │    │                       │    │                       │
│    Remove member      │    │        ⚠              │    │        ⚠              │
│                       │    │                       │    │                       │
│  Are you sure you     │    │  You have unsaved     │    │   Send to GP          │
│  want to remove…?     │    │  changes.             │    │                       │
│                       │    │                       │    │  This will deliver     │
│  [Cancel] [Remove]    │    │  [Stay] [Leave]       │    │  the letter now.      │
│                       │    │                       │    │                       │
└───────────────────────┘    └───────────────────────┘    │  [Cancel] [Send]      │
   (title only)                 (icon only)               │                       │
                                                          └───────────────────────┘
                                                             (icon + title + message)
```

### Props

| Prop          | Type                          | Required | Default     | Description                                   |
| ------------- | ----------------------------- | -------- | ----------- | --------------------------------------------- |
| `opened`      | `boolean`                     | Yes      | —           | Controls modal visibility                     |
| `onClose`     | `() => void`                  | Yes      | —           | Called on Cancel or Escape                    |
| `onAccept`    | `() => void \| Promise<void>` | Yes      | —           | Async-aware; component manages loading        |
| `children`    | `ReactNode`                   | Yes      | —           | Message body                                  |
| `title`       | `string`                      | No       | —           | Bold centred heading between icon and message |
| `acceptLabel` | `string`                      | No       | `"Confirm"` | Red action button label                       |
| `cancelLabel` | `string`                      | No       | `"Cancel"`  | Outline button label                          |
| `icon`        | `ReactElement`                | No       | —           | Centred icon above title/message              |

### Behaviour

- `onAccept` can be sync or async — component shows loading spinner on the accept button while the promise is pending
- Both buttons disabled during loading (prevents double-submit)
- On success (promise resolves): calls `onClose` automatically
- On error (promise rejects): stays open, caller handles error display
- `closeOnClickOutside={false}` — prevents accidental dismissal of a safety gate
- `closeOnEscape={true}` — Escape triggers `onClose` (same as Cancel)
- No `withCloseButton` — modal only dismisses via Cancel or successful Accept

### Integration with `<Form>`

`ConfirmModal` can be wired into the `<Form>` component via an optional `confirm` prop:

```tsx
<Form
  onSubmit={handleSendLetter}
  submitLabel="Send to GP"
  submittingLabel="Sending…"
  confirm={{
    title: "Send letter to GP",
    children:
      "This will deliver the letter immediately. This cannot be undone.",
    acceptLabel: "Send",
    icon: <IconSend />,
  }}
>
  <FormStatus />
  <LetterFields />
  <SubmitButton />
</Form>
```

Flow with `confirm` prop:

```
validate → [confirm gate] → submit → status card
```

- Validation passes → modal opens (instead of immediate submission)
- User confirms → `onSubmit` fires, spinner shows on button, status card renders
- User cancels → modal closes, form stays idle

Forms without `confirm` behave exactly as before — no breaking change.

### Standalone usage (outside `<Form>`)

For non-form contexts (e.g. table row actions, ellipsis menus):

```tsx
<ConfirmModal
  opened={showConfirm}
  onClose={() => setShowConfirm(false)}
  onAccept={handleRemoveStaff}
  title="Remove staff member"
  acceptLabel="Remove"
  icon={<IconAlertTriangle />}
>
  Are you sure you want to remove <strong>Dr Smith</strong> from this
  organisation? This action cannot be undone.
</ConfirmModal>
```

### File structure

```
frontend/src/components/confirm-modal/
├── ConfirmModal.tsx
├── ConfirmModal.stories.tsx
├── ConfirmModal.test.tsx
└── index.ts
```

### Refactoring existing instances (follow-up)

6 ad-hoc confirmation modals to replace:

| Location                    | Action                         |
| --------------------------- | ------------------------------ |
| `OrganisationAdminPage.tsx` | Remove staff from organisation |
| `DeactivateUserPage.tsx`    | Deactivate user account        |
| `DeactivatePatientPage.tsx` | Deactivate patient record      |
| `OrgFeaturesPage.tsx`       | Toggle features                |
| `ExamCloseButton.tsx`       | End exam early                 |
| `AssessmentAttempt.tsx`     | Leave during active exam       |

Additionally, `DirtyFormNavigation` can delegate its visual to `ConfirmModal` while keeping its React Router `useBlocker` logic.

---

## PageFlash architecture

### Purpose

Implements Decision Tree §3 — submissions that navigate away on success. The submitting page cannot show a status card (it unmounts), so the success message is passed to the destination page via React Router state.

### Mechanism: React Router state

The `onSubmit` handler navigates with a flash payload:

```tsx
const handleSubmit = async (data: LetterFormValues) => {
  const result = await api.post("/api/letters", data);
  navigate("/patients/123/letters", {
    state: { flash: { title: "Letter sent", description: `ID #${result.id}` } },
  });
  return { state: "success", message: { title: "" } }; // form unmounts — never rendered
};
```

The destination page reads and displays it:

```tsx
function PatientLettersPage() {
  return (
    <Container size="lg" py="xl">
      <PageFlash />
      <LetterList />
    </Container>
  );
}
```

### Layout

Renders a `<FormStatus>` at the top of the destination page:

```
┌──────────────────────────────────────────────┐
│ ✓  Letter sent                               │
│    ID #1234                                  │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│            Patient letters list...           │
└──────────────────────────────────────────────┘
```

### Props

None. Zero-config — drop it at the top of any page that might receive a flash.

### Flash state shape

```ts
interface FlashState {
  flash?: {
    variant?: "success" | "partial_success" | "error"; // defaults to "success"
    title: string;
    description?: string;
  };
}
```

### Behaviour

- Renders nothing if no `flash` in `useLocation().state`
- Shows the status card once, dismissible by user
- Automatically clears flash from history state after first render (via `navigate(location.pathname, { replace: true, state: {} })`) — prevents ghost messages on back-navigation
- No timer — clears on next navigation or user dismiss (consistent with §2)

### Why Router state (not global context)

- Already built into React Router — no new provider, no new store
- Scoped to a single history entry — naturally expires
- Survives page refresh (router state is serialised in the history stack)
- No global flash queue to manage, no race conditions

### File structure

```
frontend/src/components/page-flash/
├── PageFlash.tsx
├── PageFlash.stories.tsx
├── PageFlash.test.tsx
└── index.ts
```

---

## Summary of all four patterns

| #   | Pattern                    | Components                                   | Feedback location               |
| --- | -------------------------- | -------------------------------------------- | ------------------------------- |
| 1   | Submit, stay on page       | `<Form>` + `<FormStatus>`                    | Status card on same page        |
| 2   | Submit + confirm, stay     | `<Form>` + `<ConfirmModal>` + `<FormStatus>` | Status card on same page        |
| 3   | Submit, navigate away      | `<Form>` + `<PageFlash>` on destination      | Status card on destination page |
| 4   | Submit + confirm, navigate | `<Form>` + `<ConfirmModal>` + `<PageFlash>`  | Status card on destination page |
