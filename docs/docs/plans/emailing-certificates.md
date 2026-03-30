# Emailing certificates on pass

## Summary

When a student passes an assessment and the bank's `config.yaml` enables `email_student_on_pass` and/or `email_coordinator_on_pass`, automatically email the certificate PDF to:

1. The **student** (`User.email`)
2. The organisation's **coordinator** (`TeachingOrgSettings.coordinator_email`)

Emails use per-bank YAML templates (`coordinator-email.yaml`, `student-email.yaml`). Admins manage bank status (live/closed) and org settings via two new pages.

- **Email transport**: Resend (HTTP API, free 100/day tier, GCP-compatible)
- **Async sending**: FastAPI `BackgroundTasks` (no extra Docker services; upgrade to Celery later if needed)

---

## Phase 1: Backend — Email infrastructure

### 1.1 Add Resend package

Add `resend` to `backend/pyproject.toml` dependencies. Run `poetry lock` inside the backend container.

### 1.2 Add email config to Settings

Add to `backend/app/config.py` `Settings` class:

```python
RESEND_API_KEY: SecretStr | None = None
EMAIL_FROM: str = "noreply@quillmedical.com"
EMAIL_DRY_RUN: bool = True  # When True, log instead of sending (dev default)
```

Add corresponding env vars to `compose.dev.yml` under `backend.environment`.

### 1.3 Create email sending module

New file: `backend/app/email_send.py`

```python
def send_email(
    to: str,
    subject: str,
    html_body: str,
    attachments: list[Attachment],
) -> None: ...
```

- When `EMAIL_DRY_RUN=True`: log subject, recipient, attachment names to stdout (no actual send)
- When `EMAIL_DRY_RUN=False`: call `resend.Emails.send()` with API key

### Files

| Action | File                        |
| ------ | --------------------------- |
| Modify | `backend/pyproject.toml`    |
| Modify | `backend/app/config.py`     |
| Modify | `compose.dev.yml`           |
| New    | `backend/app/email_send.py` |

---

## Phase 2: Backend — Data model and API

### 2.1 New model — QuestionBankOrgStatus

New model in `backend/app/features/teaching/models.py`:

```python
class QuestionBankOrgStatus(Base):
    __tablename__ = "question_bank_org_status"
    __table_args__ = (
        UniqueConstraint("organisation_id", "question_bank_id"),
    )

    id: Mapped[int] (PK)
    organisation_id: Mapped[int] (FK organizations.id)
    question_bank_id: Mapped[str]
    is_live: Mapped[bool] (default False)
```

Tracks per-bank-per-org live/closed status separately from `config.yaml`.

### 2.2 Alembic migration

`just migrate "add question_bank_org_status table"`

### 2.3 Config.yaml schema addition

Add `email_student_on_pass` and `email_coordinator_on_pass` under `results:` in question bank config:

```yaml
results:
  certificate_download: true
  email_student_on_pass: true
  email_coordinator_on_pass: true
```

Sync validation: if `email_coordinator_on_pass` is true, the bank must have `coordinator-email.yaml` present. If `email_student_on_pass` is true, `student-email.yaml` must be present.

### 2.4 New endpoints

| Method | Path                                              | Purpose                                                                     | Gate                             |
| ------ | ------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------- |
| `GET`  | `/teaching/settings`                              | Return org settings (currently only PUT exists)                             | `manage_teaching_content`        |
| `GET`  | `/teaching/admin/banks/{bank_id}`                 | Bank info + `is_live` + email flags + template previews                     | `manage_teaching_content`        |
| `PUT`  | `/teaching/admin/banks/{bank_id}/status`          | Toggle `is_live`. Validates: if coordinator email enabled, email must exist | `manage_teaching_content` + CSRF |
| `GET`  | `/teaching/admin/banks/{bank_id}/email-templates` | Read-only preview of YAML template content                                  | `manage_teaching_content`        |

### 2.5 New schemas

- `AdminBankDetailOut` — bank info, is_live, email_student_on_pass, email_coordinator_on_pass, email template previews
- `QuestionBankOrgStatusIn` — `{ is_live: bool }`
- `EmailTemplateOut` — subject, body, attach_certificate

### Files

| Action | File                                                    |
| ------ | ------------------------------------------------------- |
| Modify | `backend/app/features/teaching/models.py`               |
| Modify | `backend/app/features/teaching/router.py`               |
| Modify | `backend/app/features/teaching/schemas.py`              |
| New    | `alembic/versions/xxxx_add_question_bank_org_status.py` |

---

## Phase 3: Backend — Email templates and sending

### 3.1 YAML email template format

Per question bank, optional files: `coordinator-email.yaml`, `student-email.yaml`.

```yaml
subject: "Certificate: $exam_title"
body: |
  Dear $recipient_name,

  $student_name has passed **$exam_title** on $completion_date.

  The certificate is attached.
attach_certificate: true
```

Template variables: `$exam_title`, `$student_name`, `$recipient_name`, `$completion_date`, `$institution_name`, `$score_summary`.

Uses Python `string.Template` for variable substitution (`$variable` syntax) — stdlib, zero dependencies, safe against format-string injection. Body is Markdown, rendered to HTML for the email using the `markdown` package.

### 3.2 Template parser and renderer

New file: `backend/app/features/teaching/email_templates.py`

- `load_email_template(bank_path, bank_id, template_name)` — loads and parses YAML
- `render_email(template, context)` — substitutes variables, converts Markdown body to HTML

### 3.3 Hook into assessment completion

In `POST /assessments/{id}/complete` (after `db.commit()`):

1. Check `is_passed` and `results.email_student_on_pass` / `results.email_coordinator_on_pass` in config
2. Check `QuestionBankOrgStatus.is_live` is True (only send for live exams)
3. Load email templates from bank directory
4. Generate certificate PDF (reuse `generate_certificate_pdf`)
5. Build template context
6. Enqueue two `BackgroundTasks`: student email and coordinator email

### 3.4 Gate assessment start on is_live

In `POST /assessments` (start endpoint):

- Check `QuestionBankOrgStatus` — if `is_live=False` or no row exists, return 403
- Default is **closed** until explicitly set to live

Update `GET /question-banks` to include `is_live` per bank so the frontend can hide the start button.

### Files

| Action | File                                               |
| ------ | -------------------------------------------------- |
| New    | `backend/app/features/teaching/email_templates.py` |
| Modify | `backend/app/features/teaching/router.py`          |
| Modify | `backend/pyproject.toml` (add `markdown` package)  |

---

## Phase 4: Frontend — Types and dashboard updates

### 4.1 Extend teaching types

In `frontend/src/features/teaching/types.ts`:

- Add `is_live: boolean` to `QuestionBank`
- Add `AdminBankDetail` type
- Add `EmailTemplate` type
- Add `QuestionBankOrgStatusInput` type

### 4.2 Update assessment dashboard

- Hide the "Start exam" ActionCard when `is_live=false` for a bank
- Past attempts table still shows regardless of live/closed status
- "Try again" button never shown for closed banks

### Files

| Action | File                                      |
| ------ | ----------------------------------------- |
| Modify | `frontend/src/features/teaching/types.ts` |
| Modify | Assessment dashboard page                 |
| Modify | `AssessmentResultPage.tsx`                |

---

## Phase 5: Frontend — Bank detail page

### 5.1 AdminBankDetailPage

New page at `/admin/teaching/:bankId`.

Layout: `<Container size="lg" py="xl"><Stack gap="lg">`

Sections:

1. **PageHeader** with bank title and back link to `/admin/teaching`
2. **Bank info** — read-only display of type, version, item count
3. **Exam status** — `Switch` for live/closed, calls `PUT .../status`
   - If `email_coordinator_on_pass` is true and no coordinator email set: show warning with link to org settings page
4. **Email templates** — if either email flag is true, read-only preview of coordinator and student templates (subject + body)

### 5.2 Wire DataTable row click

In `AdminTeachingPage.tsx`, change `onRowClick={() => {}}` to navigate to `/admin/teaching/${bank.id}`.

### 5.3 Add route

In `main.tsx`: `/admin/teaching/:bankId` → `AdminBankDetailPage`

### Files

| Action | File                                                               |
| ------ | ------------------------------------------------------------------ |
| New    | `frontend/src/pages/admin/teaching/AdminBankDetailPage.tsx` + test |
| Modify | `frontend/src/pages/admin/teaching/AdminTeachingPage.tsx`          |
| Modify | `frontend/src/main.tsx`                                            |

---

## Phase 6: Frontend — Org teaching settings page

### 6.1 TeachingOrgSettingsPage

New page at `/admin/teaching/settings`.

Layout: `<Container size="lg" py="xl"><Stack gap="lg">`

Sections:

1. **PageHeader** "Teaching settings"
2. **Form**: coordinator email (`TextInput`, email validation) + institution name (`TextInput`)
3. Pre-populated via `GET /teaching/settings` on load
4. Save button → `PUT /teaching/settings`
5. Dirty form navigation guard (`DirtyFormNavigation`)

### 6.2 Add route

In `main.tsx`: `/admin/teaching/settings` → `TeachingOrgSettingsPage`

**Important**: this route must come **before** `/admin/teaching/:bankId` to avoid the wildcard matching "settings".

### Files

| Action | File                                                                   |
| ------ | ---------------------------------------------------------------------- |
| New    | `frontend/src/pages/admin/teaching/TeachingOrgSettingsPage.tsx` + test |
| Modify | `frontend/src/main.tsx`                                                |

---

## Phase 7: Question bank email templates

Add to both test banks (quill-question-bank repo):

- `coordinator-email.yaml`
- `student-email.yaml`
- `email_student_on_pass: true` and `email_coordinator_on_pass: true` under `results:` in `config.yaml`

---

## Decisions

| Decision                                                  | Rationale                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Resend** over SendGrid                                  | Modern DX, simpler API, free 100/day, HTTP-only                                     |
| **FastAPI BackgroundTasks**                               | Simplest async, no extra Docker services; upgrade to Celery later if needed         |
| **Student email → `User.email`**                          | Existing field, no new data needed                                                  |
| **Centre email → `coordinator_email`**                    | Existing field on `TeachingOrgSettings`                                             |
| **Default closed**                                        | Banks are closed until explicitly toggled live by admin                             |
| **Closed semantics**                                      | Hides start ActionCard, shows past attempts, never shows "Try again"                |
| **Email templates are read-only in admin UI**             | Authored by bank creators in YAML, not editable by admins                           |
| **`email_student_on_pass` / `email_coordinator_on_pass`** | Per-bank settings, controlled by bank author — can be toggled independently         |
| **Two admin pages**                                       | Bank detail (`/admin/teaching/:bankId`) + org settings (`/admin/teaching/settings`) |
| **`string.Template`** for email templates                 | Stdlib, zero deps, safe `$variable` syntax, no injection risk unlike `str.format`   |

---

## Verification

1. **Backend unit tests**: `send_email` dry-run mode, template loading/rendering, completion endpoint with email trigger, `is_live` gating on assessment start, new GET/PUT endpoints
2. **Frontend unit tests**: AdminBankDetailPage (toggle, no-email warning), TeachingOrgSettingsPage (form load/save), dashboard (hidden start when closed)
3. **Manual dev test**: Complete an assessment with `EMAIL_DRY_RUN=True`, verify email is logged to backend stdout with correct subject, recipient, and attachment
4. **Integration test**: Set `EMAIL_DRY_RUN=False` with a Resend test API key, verify in Resend dashboard

---

## Further considerations

- **Markdown → HTML**: Add `markdown` Python package for email body rendering
- **Resend domain**: Requires domain verification in prod. Dev uses `onboarding@resend.dev` test sender
- **Rate limiting**: Not urgent at current volume — revisit when scaling
