# Teaching feature

The teaching feature enables competency-based assessments for clinical trainees. Educators create question banks (image-based MCQs), candidates take timed assessments, and the system scores answers against configurable pass criteria.

The feature is **organisation-scoped** and gated behind a feature flag — only organisations with `teaching` enabled can access teaching routes.

---

## Architecture overview

```
question-bank repo (Git)
        │
        ▼
  ./question-bank/questions/   ── volume mount ──▶  /question-banks/  (container)
        │                                                    │
        │                                          sync (API or CLI)
        │                                                    │
        ▼                                                    ▼
  Local filesystem                                   PostgreSQL (auth DB)
  (images served via StaticFiles)                    (config + items + assessments)
```

### Three layers

| Layer        | Purpose                                  | Location                                                                |
| ------------ | ---------------------------------------- | ----------------------------------------------------------------------- |
| **Content**  | Question bank YAML + images              | `question-bank/` repo (Git LFS for images)                              |
| **Backend**  | Sync, scoring, assessments API           | `backend/app/features/teaching/`                                        |
| **Frontend** | Dashboard, assessment UI, educator pages | `frontend/src/features/teaching/` + `frontend/src/components/teaching/` |

### Storage backends

| Backend   | Class                 | When                                                                        |
| --------- | --------------------- | --------------------------------------------------------------------------- |
| **Local** | `LocalStorageBackend` | Dev — serves images via FastAPI `StaticFiles` mount at `/static/questions/` |
| **GCS**   | `GCSStorageBackend`   | Production — generates signed URLs with 15-minute expiry                    |

The backend is selected automatically based on config: if `TEACHING_GCS_BUCKET` is set, GCS is used; otherwise `TEACHING_IMAGES_BASE_URL` (or fallback `/static`) is used.

---

## Question bank format

A question bank is a directory containing a `config.yaml` and numbered question directories:

```
colonoscopy-optical-diagnosis-test/
├── config.yaml
├── question_001/
│   ├── question.yaml
│   ├── image_1.jpg
│   └── image_2.jpg
├── question_002/
│   ├── question.yaml
│   ├── image_1.jpg
│   └── image_2.jpg
└── ...
```

### config.yaml

The top-level configuration defines the bank's identity, options, assessment rules, and pass criteria.

```yaml
id: colonoscopy-optical-diagnosis-test
version: 1
title: "Optical Diagnosis of diminutive colorectal polyps MCQ Online - Test"
description: >
  A small test question bank for local development and CI.

type: uniform # "uniform" or "variable"

images_per_item: 2
image_labels:
  - "White light (WLI)"
  - "Narrow band imaging (NBI)"

options: # Shared options (uniform type only)
  - id: high_confidence_adenoma
    label: "High confidence adenoma"
    tags: [high_confidence, adenoma]
  - id: low_confidence_adenoma
    label: "Low confidence adenoma"
    tags: [low_confidence, adenoma]
  - id: high_confidence_serrated
    label: "High confidence serrated polyp"
    tags: [high_confidence, serrated]
  - id: low_confidence_serrated
    label: "Low confidence serrated polyp"
    tags: [low_confidence, serrated]

correct_answer_field: diagnosis
correct_answer_values:
  - adenoma
  - serrated

assessment:
  items_per_attempt: 3
  time_limit_minutes: 5
  min_pool_size: 4
  randomise_selection: true
  randomise_order: true
  allow_immediate_retry: true
  intro_page:
    title: "Before you begin"
    body: |
      Markdown content shown before the assessment starts.
  closing_page:
    title: "Assessment complete"
    body: |
      Markdown content shown after submission.

pass_criteria:
  - name: "High confidence rate"
    description: "≥70% of answers must be high-confidence"
    rule: tag_percentage
    tag: high_confidence
    threshold: 0.70
  - name: "High confidence accuracy"
    description: "≥85% of high-confidence answers must be correct"
    rule: tag_accuracy
    tag: high_confidence
    threshold: 0.85
```

### question.yaml (uniform type)

For uniform banks, each question only needs the answer field matching `correct_answer_field`:

```yaml
diagnosis: serrated
```

Options come from the shared `options` list in `config.yaml`.

### question.yaml (variable type)

For variable banks, each question defines its own options:

```yaml
text: "What is shown in this image?"
options:
  - id: option_a
    label: "Normal mucosa"
    tags: [normal]
  - id: option_b
    label: "Adenomatous polyp"
    tags: [adenoma]
correct_option_id: option_b
```

### Bank types

| Type         | Options                                    | Scoring                                                                           | Use case                                       |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Uniform**  | Shared across all items (in `config.yaml`) | Tag matching: selected option's non-confidence tags checked against item metadata | Standardised tests (e.g. polyp classification) |
| **Variable** | Per-item (in `question.yaml`)              | Direct option ID comparison                                                       | Varied question formats                        |

---

## Scoring

### Uniform scoring

1. The candidate selects an option (e.g. `high_confidence_adenoma`)
2. The option's tags are resolved: `[high_confidence, adenoma]`
3. Confidence tags (`high_confidence`, `low_confidence`) are stripped, leaving diagnosis tags: `[adenoma]`
4. The item's `correct_answer_field` value (e.g. `diagnosis: adenoma`) is checked for membership in the diagnosis tags
5. If the correct value is in the diagnosis tags, the answer is **correct**

### Variable scoring

The selected option ID is compared directly against `correct_option_id`. Tags are still recorded for pass criteria evaluation.

### Pass criteria

Pass criteria are evaluated after all items are answered. Each criterion must pass for the assessment to be marked as passed.

| Rule             | Meaning                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `tag_percentage` | Of **all items** (including unanswered), what percentage have the specified tag? |
| `tag_accuracy`   | Of answers **with the specified tag**, what percentage are correct?              |

Both rules compare the computed value against the `threshold` (0.0–1.0).

---

## Database models

All models live in `backend/app/features/teaching/models.py`.

| Model                 | Table                   | Purpose                                                                       |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| `QuestionBankConfig`  | `question_bank_configs` | Cached config from YAML — one row per bank+version+org                        |
| `QuestionBankItem`    | `question_bank_items`   | Individual questions — images (JSON), metadata, status (`draft`/`published`)  |
| `Assessment`          | `assessments`           | One candidate attempt — tracks time limit, completion, score breakdown        |
| `AssessmentAnswer`    | `assessment_answers`    | One answer within an assessment — selected option, correctness, resolved tags |
| `TeachingOrgSettings` | `teaching_org_settings` | Per-org settings (coordinator email, institution name)                        |
| `QuestionBankSync`    | `question_bank_syncs`   | Audit trail for sync operations (status, items created/updated, errors)       |

---

## Backend API

All routes are under `/api/teaching` and require the `teaching` feature to be enabled on the user's organisation.

### Candidate endpoints

| Method | Path                         | Description                                     |
| ------ | ---------------------------- | ----------------------------------------------- |
| `GET`  | `/question-banks`            | List available question banks                   |
| `GET`  | `/question-banks/{bank_id}`  | Get full config detail                          |
| `POST` | `/assessments`               | Start a new assessment (randomly selects items) |
| `GET`  | `/assessments/history`       | List the user's past assessments                |
| `GET`  | `/assessments/{id}`          | Get assessment state                            |
| `GET`  | `/assessments/{id}/current`  | Get the current unanswered item (for resume)    |
| `POST` | `/assessments/{id}/answer`   | Submit an answer, get the next item             |
| `POST` | `/assessments/{id}/complete` | Finalise and compute pass/fail                  |

### Educator endpoints

These require the `manage_teaching_content` CBAC competency.

| Method | Path              | Description                                               |
| ------ | ----------------- | --------------------------------------------------------- |
| `GET`  | `/items`          | List items in the org's question bank                     |
| `POST` | `/items/validate` | Dry-run validation (no import)                            |
| `POST` | `/items/sync`     | Trigger sync from filesystem to database                  |
| `GET`  | `/results`        | List all completed assessment results                     |
| `GET`  | `/syncs`          | List sync history                                         |
| `PUT`  | `/settings`       | Update teaching settings (coordinator email, institution) |

### Sync process

The sync (`sync_question_bank()` in `sync.py`) runs these steps:

1. **Validate** — checks config.yaml structure, item directories, image counts, answer fields
2. **Upsert config** — creates or updates the `QuestionBankConfig` row
3. **Import items** — creates or updates `QuestionBankItem` rows (status defaults to `draft`)
4. **Record audit** — creates a `QuestionBankSync` record with status, counts, and timestamps

Items must be **published** (status changed from `draft` to `published`) before they appear in assessments. The `just sync-teaching` command auto-publishes items after sync.

### Validation

Validation (`validate.py`) runs in three contexts:

1. **CI** on the question bank repo (catches errors before merge)
2. **Dry-run API** (`POST /items/validate`) — educators check content without importing
3. **Pre-sync gate** — sync aborts on any validation error

Checks performed:

- Required config fields: `id`, `version`, `title`, `description`, `type`
- Valid type: `uniform` or `variable`
- Assessment section: `items_per_attempt`, `time_limit_minutes`, `min_pool_size`
- Uniform: `options` list and `images_per_item` required
- Per-item: correct image count, answer field presence, answer value in allowed values
- Variable: `options` list with `id`/`label`/`tags`, valid `correct_option_id`

---

## Feature gating

### Backend

The entire teaching router uses `requires_feature("teaching")` as a dependency:

```python
teaching_router = APIRouter(
    prefix="/teaching",
    dependencies=[Depends(requires_feature("teaching"))],
)
```

This checks the user's primary organisation has a row in `organisation_features` with `feature_key = 'teaching'`. Returns 403 if not.

### Frontend

Routes are wrapped in `<RequireFeature feature="teaching">`:

```tsx
{
  path: "/teaching",
  element: (
    <RequireFeature feature="teaching">
      <AssessmentDashboard />
    </RequireFeature>
  ),
}
```

---

## Frontend pages and components

### Pages

All page components live in `frontend/src/features/teaching/pages/`.

| Route                             | Page                   | Description                                                         |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| `/teaching`                       | `AssessmentDashboard`  | Lists available question banks, start new assessments, view history |
| `/teaching/assessment/:id`        | `AssessmentAttempt`    | Active assessment — shows images, options, timer, progress          |
| `/teaching/assessment/:id/result` | `AssessmentResultPage` | Pass/fail result with score breakdown                               |
| `/teaching/manage`                | `ManageItems`          | Educator: view/publish items, trigger sync                          |
| `/teaching/results`               | `AllResults`           | Educator: view all candidate results                                |
| `/teaching/sync`                  | `SyncStatus`           | Educator: sync history and status                                   |

### Components

All reusable components live in `frontend/src/components/teaching/`.

| Component                | Purpose                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `AssessmentIntro`        | Pre-assessment information page (from `intro_page` config) |
| `AssessmentProgress`     | Progress bar showing items answered                        |
| `AssessmentTimer`        | Countdown timer with time-limit enforcement                |
| `AssessmentResult`       | Pass/fail display with certificate download                |
| `AssessmentClosing`      | Post-assessment message (from `closing_page` config)       |
| `AssessmentHistoryTable` | Table of past assessment attempts                          |
| `CertificateDownload`    | PDF certificate generation for passed assessments          |
| `ItemManagementTable`    | Educator table for managing question bank items            |
| `QuestionBankCard`       | Card displaying a question bank summary                    |
| `QuestionView`           | Displays images and options for a single question          |
| `ScoreBreakdown`         | Detailed breakdown of pass criteria results                |

---

## Configuration

### Environment variables

Set in `compose.dev.yml` for local development:

| Variable                      | Dev value              | Description                                 |
| ----------------------------- | ---------------------- | ------------------------------------------- |
| `TEACHING_STORAGE_BACKEND`    | `local`                | Storage backend type                        |
| `TEACHING_QUESTION_BANK_PATH` | `/question-banks`      | Container path to question bank directories |
| `TEACHING_IMAGES_BASE_URL`    | `/api/teaching/images` | Base URL for image serving                  |
| `TEACHING_GCS_BUCKET`         | _(not set)_            | GCS bucket name (production only)           |

### Docker volume mount

```yaml
volumes:
  - ./question-bank/questions:/question-banks
```

This mounts the local `question-bank/questions/` directory into the container at `/question-banks`, making question bank content available for sync and image serving.

---

## Local development

### First-time setup

1. **Clone the question bank** (private repo):

   ```bash
   just question-bank-clone
   ```

2. **Start the dev stack** (teaching-only, without FHIR/EHRbase):

   ```bash
   just start-teaching     # alias: st
   ```

3. **Seed the database** (creates org, users, enables feature, syncs questions):

   ```bash
   just seed-teaching      # alias: sdt
   ```

4. Open `http://localhost` and log in with the seeded credentials.

### Pushing new questions (no restart needed)

After editing question bank content:

```bash
just sync-teaching          # alias: sy
```

This finds the teaching-enabled organisation, syncs all question bank directories, and auto-publishes draft items.

### Justfile commands

| Command                        | Alias  | Description                                                                |
| ------------------------------ | ------ | -------------------------------------------------------------------------- |
| `just start-teaching`          | `st`   | Start dev stack without clinical services                                  |
| `just seed-teaching`           | `sdt`  | Seed fresh DB with teaching org, users, feature flag, and synced questions |
| `just sync-teaching`           | `sy`   | Sync all local question banks into the DB (no restart needed)              |
| `just question-bank-clone`     | `qbc`  | Clone the private question bank repo                                       |
| `just question-bank-push`      | `qbp`  | Push local question bank changes                                           |
| `just question-bank-pull-sync` | `qbps` | Pull latest question bank and sync                                         |
| `just question-bank-update`    | `qbpu` | Pull latest question bank content                                          |

---

## Production design

In production, question bank content lives in a **GCS bucket** rather than the local filesystem:

1. CI/CD pushes updated question bank content to GCS via `gsutil rsync`
2. An educator manually triggers a sync via the UI (`/teaching/sync` page) or API
3. The backend reads config and item YAML from GCS, persists to the database
4. Images are served via signed GCS URLs (15-minute expiry)

The manual sync trigger is intentional — it gives educators control over when new content goes live, which is important for clinical safety.

---

## Testing

Backend tests live in `backend/tests/` and use pytest. The teaching tests cover:

- Scoring logic (uniform + variable)
- Pass criteria evaluation
- Validation (config schema, item structure, image counts)
- Sync process (create, update, error handling)
- API endpoints (auth, feature gating, CRUD)

Run with:

```bash
just unit-tests-backend     # alias: ub
```

Frontend component tests live alongside each component (`.test.tsx` files) and use vitest + testing-library. Run with:

```bash
just unit-tests-frontend    # alias: uf
```
