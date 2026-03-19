# Teaching feature — implementation plan

Add a **config-driven** MCQ assessment engine. Each question bank is defined by a YAML config file (e.g. `colonoscopy-optical-diagnosis.yaml`) that specifies the MCQ type, images, answer options, tagging, and compound pass criteria. The engine supports multiple MCQ types — `uniform` (every item has the same fixed structure) and `variable` (each item defines its own images, text, and options) — so the same system can host image-classification assessments, traditional MCQs, or mixed formats. No restructuring of existing EPR code. Teaching gets its own `features/teaching/` directories in both backend and frontend, gated by a new `OrganisationFeature` model. Same codebase deploys to separate GCP projects via environment config. Question bank images are version-controlled in Git (with Git LFS for binaries), then synced to a GCS bucket during CI/CD deployment and served via signed URLs at runtime.

> **Convention**: new optional functionality goes in `features/`. Existing code (e.g. messaging) will be migrated into `features/` later when it becomes gated.

---

## Question bank config format

Each question bank is a YAML file in `shared/question-banks/`. The backend loads these at startup; the frontend generates TypeScript types from them (same pattern as `shared/competencies.yaml`). Adding a new question bank = new YAML file + PR.

### Example: `shared/question-banks/colonoscopy-optical-diagnosis.yaml`

```yaml
id: colonoscopy-optical-diagnosis
version: 1
title: "Optical Diagnosis of Diminutive Colorectal Polyps"
description: >
  Assess colonoscopists' ability to optically diagnose diminutive (≤5mm)
  colorectal polyps using white light and narrow band imaging.

type: uniform # all items share the same image count + options (see MCQ types below)

images_per_item: 2
image_labels:
  - "White light (WLI)"
  - "Narrow band imaging (NBI)"

# item_text not used for this bank — polyp images speak for themselves.
# Future banks can add: item_text: { label: "Patient history", required: true }

options:
  - id: high_confidence_adenoma
    label: "High Confidence Adenoma"
    tags: [high_confidence, adenoma]
  - id: low_confidence_adenoma
    label: "Low Confidence Adenoma"
    tags: [low_confidence, adenoma]
  - id: high_confidence_serrated
    label: "High Confidence Serrated Polyp"
    tags: [high_confidence, serrated]
  - id: low_confidence_serrated
    label: "Low Confidence Serrated Polyp"
    tags: [low_confidence, serrated]

correct_answer_field: diagnosis # item metadata key holding the right answer
correct_answer_values: # valid values (used to validate educator uploads)
  - adenoma
  - serrated

# Correctness check at scoring time:
# 1. Candidate picks "high_confidence_adenoma" → option tags are [high_confidence, adenoma]
# 2. Engine strips confidence tags → remaining tag = "adenoma" (the diagnosis)
# 3. Compares "adenoma" against item's metadata["diagnosis"]
# 4. Match → correct; mismatch → incorrect

assessment:
  items_per_attempt: 120
  time_limit_minutes: 75
  min_pool_size: 200
  randomise_selection: true
  randomise_order: true
  allow_immediate_retry: true

  intro_page:
    title: "Before you begin"
    body: |
      You will be shown 120 polyp images, each displayed as a pair:
      white light (WLI) and narrow band imaging (NBI).

      For each image pair, select the single best answer from the four options.

      **Time limit**: 75 minutes. The timer starts when you click "Begin".

      **Marking criteria**:
      - ≥70% of your answers must be **high confidence**
      - ≥85% of your high-confidence answers must be **correct**

      You must meet **both** criteria to pass.

  closing_page:
    title: "Assessment complete"
    body: |
      Your answers have been submitted.

      Your scores and pass/fail result are shown below.
      Results have also been emailed to the assessment coordinator.

      Thank you for completing the optical diagnosis assessment.

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

results:
  certificate_download: true # candidate can download a PDF certificate on pass
  email_notification: true # send result to a coordinator email address
  email_subject: "Optical Diagnosis MCQ — Assessment Result"
  # The recipient email address is set per-organisation in the admin UI,
  # NOT in this config file — no email addresses in the codebase.
```

### Config field reference

| Field                              | Type      | Purpose                                                            |
| ---------------------------------- | --------- | ------------------------------------------------------------------ |
| `id`                               | string    | Unique identifier, matches filename                                |
| `version`                          | int       | Bank version — bump when correcting items (see versioning below)   |
| `title`                            | string    | Display title in UI                                                |
| `description`                      | string    | Shown on assessment dashboard                                      |
| `type`                             | string    | MCQ type: `uniform` or `variable` (see MCQ types section)          |
| `images_per_item`                  | int       | (`uniform` only) Fixed number of images per question               |
| `image_labels`                     | list[str] | (`uniform` only) Label for each image slot (displayed above image) |
| `item_text`                        | object?   | Optional per-item text block shown below images                    |
| `item_text.label`                  | string    | Heading displayed above the text (e.g. "Patient history")          |
| `item_text.required`               | bool      | Whether educators must provide text when uploading items           |
| `options`                          | list      | (`uniform` only) Answer choices, each with `id`, `label`, `tags`   |
| `options[].tags`                   | list[str] | (`uniform` only) Tags used by scoring rules                        |
| `correct_answer_field`             | string    | Item metadata key that holds the correct answer                    |
| `correct_answer_values`            | list[str] | Valid values for that field                                        |
| `assessment.items_per_attempt`     | int       | Questions per assessment                                           |
| `assessment.time_limit_minutes`    | int       | Server-enforced time limit                                         |
| `assessment.min_pool_size`         | int       | Minimum published items to start an assessment                     |
| `assessment.randomise_selection`   | bool      | Randomly draw from pool                                            |
| `assessment.randomise_order`       | bool      | Randomise presentation order                                       |
| `assessment.allow_immediate_retry` | bool      | Can retry immediately after failure                                |
| `assessment.intro_page`            | object?   | Optional page shown before the first question                      |
| `assessment.intro_page.title`      | string    | Heading for the intro page                                         |
| `assessment.intro_page.body`       | string    | Markdown body — instructions, marking criteria, time limit         |
| `assessment.closing_page`          | object?   | Optional page shown after the last answer, before results          |
| `assessment.closing_page.title`    | string    | Heading for the closing page                                       |
| `assessment.closing_page.body`     | string    | Markdown body — submission confirmation, next steps                |
| `pass_criteria`                    | list      | Compound rules — ALL must pass                                     |
| `pass_criteria[].rule`             | string    | `tag_percentage` or `tag_accuracy` (extensible)                    |
| `pass_criteria[].tag`              | string    | Which option tag the rule filters on                               |
| `pass_criteria[].threshold`        | float     | Required minimum (0.0–1.0)                                         |
| `results.certificate_download`     | bool      | Candidate can download a PDF certificate on pass                   |
| `results.email_notification`       | bool      | Send result to a coordinator email (address set in admin UI)       |
| `results.email_subject`            | string?   | Subject line for notification email (required if email enabled)    |

### Versioning

The `version` field (integer, starting at 1) ties items and assessments to a specific snapshot of the question bank. When an error is found — e.g. a polyp image has the wrong diagnosis — the workflow is:

1. Bump `version` in the YAML config (e.g. 1 → 2)
2. Upload corrected items under the new version (or re-publish existing items unchanged)
3. New assessments are created against version 2 and draw only from version-2 items
4. Completed assessments remain tied to version 1 — their scores and pass/fail results are unchanged

Both `QuestionBankItem.bank_version` and `Assessment.bank_version` record the version, so historical results are always traceable to the exact item set that was used. The admin UI shows which version is current and lists past versions with their assessment counts.

### Scoring engine rules

- **`tag_percentage`**: of all answers, what fraction have the specified tag? Must be ≥ threshold. _Example_: ≥70% of answers must be tagged `high_confidence`.
- **`tag_accuracy`**: of answers that have the specified tag, what fraction are correct? Must be ≥ threshold. _Example_: of `high_confidence` answers, ≥85% must match the item's correct diagnosis.

New rule types can be added to the scoring engine without changing the config schema (e.g. `overall_accuracy`, `minimum_correct_count`).

### MCQ types

The `type` field determines the structural contract between the config and the items stored in the database. The frontend uses it to select the right rendering component.

#### `uniform`

Every item has the **same structure**: fixed image count, fixed image labels, and a shared set of options. The config defines `images_per_item`, `image_labels`, and `options` at the top level. Individual items store only their images, optional text, and metadata (correct answer).

- **Use when**: all questions are structurally identical (e.g. colonoscopy MCQ — always 2 images, always 4 options)
- **Frontend**: `QuestionView` renders a consistent layout for every item — N images side-by-side with labels, optional text, shared radio options
- **Upload**: educator provides N images + metadata per item; options are already defined in config
- **Scoring**: tag-based rules work because every option has the same tags across all items

#### `variable`

Each item defines its **own images, text, and options**. The config sets only assessment-level parameters (timing, pool size, pass criteria). Individual items store everything needed to render and score them.

- **Use when**: questions vary in format (e.g. some have 0 images, some have 3; each question has unique answer choices)
- **Frontend**: `QuestionView` adapts layout per item — renders whatever images, text, and options the item provides
- **Upload**: educator provides all content per item: images (0+) with labels, question text, options with tags, and the correct answer
- **Scoring**: tag-based rules still work — options still have tags, but they’re defined per-item rather than globally
- **Item-level fields** (stored in the `QuestionBankItem` row, not the config):
  - `images`: list of `{key, label}` objects (0 or more)
  - `text`: question/scenario text (optional, depending on `item_text.required`)
  - `options`: list of `{id, label, tags}` — same structure as `uniform`, but per-item
  - `correct_option_id`: which option is correct (replaces `metadata` + `correct_answer_field` lookup)

> **Implementation note**: the `QuestionBankItem` model uses the same table for both types. For `uniform` items, `options` and `images[].label` are null (read from config). For `variable` items, they’re populated per-row. The API and frontend check `type` to know where to read options from.

The colonoscopy optical diagnosis MCQ could not use off-the-shelf platforms because of the compound pass criteria — most platforms support only a single overall percentage threshold. The config-driven approach with pluggable MCQ types means any future question bank — whether uniform image-classification (like colonoscopy) or variable mixed-format MCQs — can be added with just a YAML file and content uploads.

---

## Colonoscopy MCQ — first question bank

**Context**: Optical diagnosis of diminutive (≤5mm) colorectal polyps. Colonoscopists trained on high-resolution endoscopes can visually classify polyps and discard them without histological analysis — saving ~£30 per polyp. Currently accredited only within the bowel cancer screening programme (~15% of procedures). This MCQ extends accreditation to the remaining ~85% of symptomatic colonoscopists.

**Assessment format** (defined by the config above):

- **120 polyps** per attempt, randomly selected from a pool of ~200
- Each polyp displayed as two side-by-side images: **white light (WLI)** and **narrow band imaging (NBI)**
- 4 answer choices per polyp (high/low confidence × adenoma/serrated)
- **75-minute time limit**
- Random selection + random order means **no two attempts are identical**

**Pass criteria** (compound — both must be met):

1. **≥70% High Confidence** — at least 84 of 120 answers must be high-confidence
2. **≥85% Accuracy of High Confidence** — of those high-confidence answers, at least 85% must match the correct diagnosis

**User flow**:

1. Candidate registers / logs in (Name, Institution, Work Email)
2. Selects the colonoscopy optical diagnosis question bank
3. Starts assessment → 120 random polyps presented sequentially
4. For each polyp: views WLI + NBI images, selects one of 4 options
5. On completion (or time expiry): sees result with score breakdown
6. Can immediately retry if failed
7. Result also sent to a central email for accreditation tracking

---

## Current state vs proposal

| Area                  | Current codebase                                                                                                       | Change needed                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend structure     | Flat — all routes in `main.py`, models in `models.py`                                                                  | Add `app/features/teaching/` with own router, models, schemas                                                                                              |
| Config                | `FHIR_SERVER_URL` and `EHRBASE_URL` are hardcoded required strings; FHIR/EHRbase DB passwords are required `SecretStr` | Add `FHIR_ENABLED: bool = True` / `EHRBASE_ENABLED: bool = True` flags. Keep existing URL defaults and required passwords. Teaching sets flags to `False`. |
| Organisation features | `Organization` model exists, no feature gating                                                                         | New `OrganisationFeature` model — runtime feature flags per org                                                                                            |
| CBAC                  | 34 clinical competencies, 18 professions                                                                               | Add teaching competencies and professions (`learner`, `educator`)                                                                                          |
| Image storage         | No object storage anywhere                                                                                             | Images version-controlled in Git (LFS), synced to GCS bucket on deploy, served via signed URLs                                                             |
| Frontend routes       | Statically imported in `main.tsx` (~40 eager imports)                                                                  | Add teaching routes under `/teaching/*`, gated by org feature                                                                                              |
| Navigation            | Static links in `SideNavContent.tsx`                                                                                   | Conditionally show teaching nav items                                                                                                                      |
| Terraform             | Teaching env already configured with `enable_fhir = false`                                                             | Add GCS bucket, CI/CD image sync step, storage env vars to Cloud Run                                                                                       |

---

## Phase 1: OrganisationFeature + config changes

### Step 1.1 — OrganisationFeature model

**All-explicit model**: no `OrganisationFeature` rows = no access. Features must be explicitly enabled per organisation. There are no implicit defaults — a brand-new org has zero features until an admin enables them.

Add to `backend/app/models.py`:

- `OrganisationFeature` table with `id` (UUID PK), `organisation_id` (FK → organizations.id), `feature_key` (str, e.g. "epr", "teaching", "messaging"), `enabled` (bool), `enabled_at` (datetime), `enabled_by` (FK → users.id)
- Unique constraint on `(organisation_id, feature_key)`
- Relationship from `Organization` → `OrganisationFeature` (one-to-many)

Migration: `just migrate "add_organisation_features_table"`

**Data migration**: the same migration must seed `OrganisationFeature` rows for all existing organisations — enable `epr`, `messaging`, and `letters` on every current org so existing deployments are unaffected.

**Admin UI**: the organisation creation form (`pages/admin/organisations/`) must include a feature checklist so admins choose which features to enable at creation time.

**Files**: `backend/app/models.py`, new migration in `alembic/versions/`

### Step 1.2 — Make FHIR/EHRbase conditionally required

Modify `backend/app/config.py`:

- Add `FHIR_ENABLED: bool = True` and `EHRBASE_ENABLED: bool = True`
- **Keep** existing URL defaults (`FHIR_SERVER_URL: str = "http://fhir:8080/fhir"`) and required `SecretStr` passwords — do NOT make these optional
- Add a Pydantic `model_validator`: if `FHIR_ENABLED` is `True` but `FHIR_SERVER_URL` or required passwords are missing, raise `ValidationError`. Same for EHRbase. This is belt-and-braces: the defaults are safe for EPR, but the validator catches typos.
- Teaching deployment sets `FHIR_ENABLED=false` and `EHRBASE_ENABLED=false` in env vars. Because the flags default to `True`, any EPR deployment that forgets them still gets FHIR/EHRbase — the safe default.
- Guard `FHIR_DATABASE_URL` / `EHRBASE_DATABASE_URL` properties to return `None` when disabled

**Clinical safety note**: defaults are EPR-centric. An EPR deployment with zero config changes gets `FHIR_ENABLED=True` + `EHRBASE_ENABLED=True` — clinical services are on by default. Only an explicit `= false` disables them.

**Files**: `backend/app/config.py`

### Step 1.3 — Guard existing FHIR/EHRbase calls

_Depends on 1.2_

- `backend/app/fhir_client.py` — Guard initialisation; raise `HTTPException(503)` if called when disabled
- `backend/app/ehrbase_client.py` — Same pattern
- Patient routes in `main.py` that call FHIR (demographics, letters) — return 503 when FHIR disabled
- Health check endpoints — report FHIR/EHRbase as "not provisioned" rather than erroring

**Files**: `backend/app/fhir_client.py`, `backend/app/ehrbase_client.py`, `backend/app/main.py`

### Step 1.4 — OrganisationFeature API endpoints

_Depends on 1.1_

- `GET /api/organizations/{id}/features` — List enabled features for an org (admin only)
- `PUT /api/organizations/{id}/features/{feature_key}` — Enable/disable feature (admin only)
- Extend `GET /api/auth/me` response to include `enabled_features: list[str]` for the user's primary org

**Files**: `backend/app/main.py`, new `backend/app/schemas/features.py`

### Step 1.5 — `requires_feature` FastAPI dependency

_Depends on 1.1_

Reusable dependency for gating routes by feature (same pattern as existing `has_competency()` in `backend/app/cbac/decorators.py`):

```python
def requires_feature(feature_key: str) -> Callable:
    """FastAPI dependency: checks user's org has feature enabled. Returns 403 if not."""
```

Resolves: user → primary org → `OrganisationFeature` → 403 if disabled.

**Files**: new `backend/app/features/__init__.py`

---

## Phase 2: Teaching domain models + storage

### Step 2.1 — Teaching models

_Depends on 1.1_

Create `backend/app/features/teaching/models.py`:

**QuestionBankItem** (one item in a question bank — e.g. one polyp with its images)

| Field               | Type                 | Notes                                                                                                   |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                | UUID                 | Primary key                                                                                             |
| `organisation_id`   | UUID (FK)            | Owning org                                                                                              |
| `question_bank_id`  | str                  | Matches config `id` (e.g. `"colonoscopy-optical-diagnosis"`)                                            |
| `bank_version`      | int                  | Version of the question bank this item belongs to                                                       |
| `image_keys`        | JSON list[str]       | Paths relative to the question bank images directory, one per image slot                                |
| `text`              | str \| None          | Optional free-text shown below images (e.g. patient history)                                            |
| `options`           | JSON list \| None    | Per-item options (`variable` type only); null for `uniform` (read from config)                          |
| `correct_option_id` | str \| None          | Correct option id (`variable` type only); null for `uniform` (uses `metadata` + `correct_answer_field`) |
| `metadata`          | JSON dict            | Correct answer + any extra fields (e.g. `{"diagnosis": "adenoma"}`)                                     |
| `status`            | str                  | `"draft"` / `"published"`                                                                               |
| `created_by`        | UUID (FK → users.id) | User who ran the sync command                                                                           |
| `created_at`        | datetime             | Auto-set                                                                                                |

The `metadata` field is freeform JSON validated against the question bank config at upload time. For the colonoscopy MCQ, it would be `{"diagnosis": "adenoma"}` or `{"diagnosis": "serrated"}`. The `correct_answer_field` in the config tells the scoring engine which metadata key to check.

**Assessment** (one attempt at a question bank)

| Field                | Type                 | Notes                                           |
| -------------------- | -------------------- | ----------------------------------------------- |
| `id`                 | UUID                 | Primary key                                     |
| `user_id`            | UUID (FK → users.id) | Candidate                                       |
| `organisation_id`    | UUID (FK)            | Org context                                     |
| `question_bank_id`   | str                  | Which question bank config this assessment uses |
| `bank_version`       | int                  | Version of the bank when assessment was started |
| `started_at`         | datetime             | When assessment began                           |
| `completed_at`       | datetime or None     | When submitted / timed out                      |
| `time_limit_minutes` | int                  | Copied from config at creation (e.g. 75)        |
| `total_items`        | int                  | Copied from config at creation (e.g. 120)       |
| `score_breakdown`    | JSON dict or None    | Per-criterion results computed on completion    |
| `is_passed`          | bool or None         | Null until completed                            |

`score_breakdown` stores the result of each pass criterion, e.g.:

```json
{
  "criteria": [
    {
      "name": "High confidence rate",
      "value": 0.73,
      "threshold": 0.7,
      "passed": true
    },
    {
      "name": "High confidence accuracy",
      "value": 0.88,
      "threshold": 0.85,
      "passed": true
    }
  ],
  "overall_passed": true
}
```

**AssessmentAnswer** (one answer within an assessment)

| Field             | Type             | Notes                                        |
| ----------------- | ---------------- | -------------------------------------------- |
| `id`              | UUID             | Primary key                                  |
| `assessment_id`   | UUID (FK)        | Parent assessment                            |
| `item_id`         | UUID (FK)        | Which `QuestionBankItem`                     |
| `display_order`   | int              | Position in this assessment (1–N)            |
| `selected_option` | str or None      | Option `id` from config; null until answered |
| `answered_at`     | datetime or None | When answered                                |

**Scoring engine** (computed server-side on assessment completion):

The scoring engine reads the question bank config's `pass_criteria` list and evaluates each rule:

1. For each answer, look up the selected option's `tags` from the config
2. **`tag_percentage`** rule: count answers where option has the specified tag ÷ `total_items`. Must be ≥ threshold.
3. **`tag_accuracy`** rule: of answers tagged with the specified tag, count those where the option's diagnosis tag matches the item's `metadata[correct_answer_field]`. Must be ≥ threshold.
4. `is_passed` = ALL criteria pass

_Example (colonoscopy MCQ)_: `high_confidence_adenoma` has tags `[high_confidence, adenoma]`. Item metadata is `{"diagnosis": "adenoma"}`. The `high_confidence` tag contributes to the 70% threshold; the `adenoma` tag matches the item's diagnosis, so it's counted as correct for the 85% accuracy threshold.

Import these in `alembic/env.py` so Alembic detects them for migration generation.

Migration: `just migrate "add_teaching_tables"`

**Files**: new `backend/app/features/teaching/__init__.py`, new `backend/app/features/teaching/models.py`, `backend/alembic/env.py`

### Step 2.2 — Image storage (Git + GCS)

_Parallel with 2.1_

Images are **version-controlled in Git** (source of truth, PR review) and **served from GCS** at runtime (fast, scalable, signed URLs).

#### Git side — source of truth

Question bank images live in the repository under `shared/question-banks/<bank-id>/images/`. Git LFS tracks the binary files so the repo stays fast.

Directory structure for the colonoscopy bank:

```
shared/question-banks/
  colonoscopy-optical-diagnosis.yaml          # config
  colonoscopy-optical-diagnosis/
    items.csv                                  # item manifest: filename prefix, diagnosis
    images/
      001_wli.jpg
      001_nbi.jpg
      002_wli.jpg
      002_nbi.jpg
      ...
```

**`items.csv`** is a simple manifest mapping each item to its metadata:

```csv
item_id,diagnosis
001,adenoma
002,serrated
003,adenoma
...
```

Image filenames follow the convention `{item_id}_{label_slug}.{ext}` where `label_slug` maps to the config's `image_labels` (e.g. `wli` → "White light (WLI)").

Add `.gitattributes` entry:

```
shared/question-banks/*/images/** filter=lfs diff=lfs merge=lfs -text
```

#### GCS side — runtime serving

Each GCP project (staging, teaching, production) has a dedicated GCS bucket (e.g. `quill-teaching-images-teaching`). The CI/CD pipeline syncs images from the repo to the bucket on every deploy:

```bash
# In CI/CD deploy step:
gsutil -m rsync -r shared/question-banks/ gs://$TEACHING_GCS_BUCKET/question-banks/
```

The backend generates **signed URLs** (short-lived, e.g. 15 minutes) when serving items to candidates. The frontend never accesses GCS directly — it receives signed URLs from the API.

Add to `config.py`:

- `TEACHING_GCS_BUCKET: str | None = None` — GCS bucket name (set per environment)
- `TEACHING_IMAGES_BASE_URL: str | None = None` — optional override for dev (local file serving)

For **local dev**, images are served directly from the filesystem via a static files endpoint — no GCS needed. The backend detects `TEACHING_GCS_BUCKET` is unset and falls back to local file paths.

Create `backend/app/features/teaching/storage.py`:

- `get_image_url(bank_id: str, filename: str) → str` — returns a signed GCS URL in production, or a local file URL in dev
- Uses `google-cloud-storage` for signed URL generation

Add `google-cloud-storage` to `pyproject.toml` dependencies.

#### Sync command

`just sync-question-bank colonoscopy-optical-diagnosis` — reads the manifest + images directory, creates/updates `QuestionBankItem` rows in the database for the current `version`. Validates image count matches `images_per_item`, metadata values match `correct_answer_values`.

**Why this hybrid approach?**

- **Version control**: image changes tracked in Git history, tied to the YAML version bump in one PR
- **PR review**: educators submit images via PR → reviewers can inspect before merge
- **Single source of truth**: config, images, and manifest are co-located in the repo
- **Fast serving**: GCS signed URLs are fast and scalable — no load on the backend for image delivery
- **Security**: signed URLs expire, so images can’t be hotlinked or shared permanently

**Files**: `shared/question-banks/colonoscopy-optical-diagnosis/items.csv`, `shared/question-banks/colonoscopy-optical-diagnosis/images/`, `.gitattributes`, `backend/app/config.py`, `backend/pyproject.toml`, new `backend/app/features/teaching/storage.py`, new `backend/app/features/teaching/sync.py`

### Step 2.3 — Teaching API router

_Depends on 1.5, 2.1, 2.2_

Create `backend/app/features/teaching/router.py` and `schemas.py`.

All routes gated by `Depends(requires_feature("teaching"))`.

**Educator endpoints** (require `manage_teaching_content` competency):

| Method | Path                           | Purpose                                                   |
| ------ | ------------------------------ | --------------------------------------------------------- |
| GET    | `/api/teaching/items`          | List items in org's bank (filtered by `question_bank_id`) |
| POST   | `/api/teaching/items/sync`     | Trigger sync from Git manifest + images to database       |
| GET    | `/api/teaching/results`        | All assessment results for org (reporting)                |
| POST   | `/api/teaching/results/email`  | Trigger result email to central address                   |
| GET    | `/api/teaching/question-banks` | List available question bank configs                      |

**Candidate endpoints** (require `view_teaching_cases` competency):

| Method | Path                                      | Purpose                                                                    |
| ------ | ----------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/teaching/question-banks`            | List question banks available to candidate (with titles, descriptions)     |
| POST   | `/api/teaching/assessments`               | Start new assessment (specify `question_bank_id`, randomly selects items)  |
| GET    | `/api/teaching/assessments/{id}`          | Get assessment state (progress, time remaining, question bank config)      |
| GET    | `/api/teaching/assessments/{id}/current`  | Get current unanswered item (signed image URLs, option labels from config) |
| POST   | `/api/teaching/assessments/{id}/answer`   | Submit answer for current item, advance to next                            |
| POST   | `/api/teaching/assessments/{id}/complete` | Finalise assessment, run scoring engine, return result                     |
| GET    | `/api/teaching/assessments/history`       | List user's past assessments with results                                  |

**Assessment lifecycle**:

1. `POST /assessments` with `{"question_bank_id": "colonoscopy-optical-diagnosis"}` → loads config, validates pool size ≥ `min_pool_size`, creates `Assessment` row + N `AssessmentAnswer` rows (items randomly selected + ordered, `selected_option` null)
2. `GET /assessments/{id}/current` → returns first unanswered item with signed image URLs (GCS in production, local in dev) + option labels from config. Returns 404 if all answered.
3. `POST /assessments/{id}/answer` → validates time limit not exceeded, validates `selected_option` is a valid option `id` from config, sets `selected_option` + `answered_at`, returns next item (or signals completion)
4. `POST /assessments/{id}/complete` → runs scoring engine against config's `pass_criteria`, sets `score_breakdown`, `is_passed`, `completed_at`. If `results.email_notification` is enabled, sends result email to the org's configured coordinator address. Returns full result breakdown.
5. Server-side timer: if `now > started_at + time_limit_minutes`, auto-complete with whatever answers exist. Unanswered items count as having no tags (penalises `tag_percentage` rules).

Register in `main.py`: `app.include_router(teaching_router)`.

**Files**: new `backend/app/features/teaching/router.py`, new `backend/app/features/teaching/schemas.py`, `backend/app/main.py`

---

## Phase 3: Teaching CBAC competencies

_Parallel with Phase 2_

### Step 3.1 — Competencies and professions

Add to `shared/competencies.yaml`:

| Competency ID             | Risk level | Description                                 |
| ------------------------- | ---------- | ------------------------------------------- |
| `view_teaching_cases`     | low        | Take teaching assessments                   |
| `manage_teaching_content` | medium     | Manage question bank items and view results |
| `view_teaching_analytics` | low        | View aggregated assessment results          |

Add to `shared/base-professions.yaml`:

| Profession | Base competencies                                                           |
| ---------- | --------------------------------------------------------------------------- |
| `learner`  | `view_teaching_cases`                                                       |
| `educator` | `view_teaching_cases`, `manage_teaching_content`, `view_teaching_analytics` |

### Step 3.2 — Question bank config loading

_Depends on 3.1_

- Backend: load all YAML files from `shared/question-banks/` at startup, validate against a Pydantic schema, expose via `GET /api/teaching/question-banks`
- Frontend: `yarn generate:types` generates `src/generated/question-banks.json` from the YAML files (same pattern as competencies), plus updates `src/generated/competencies.json` and `src/generated/base-professions.json`

**Files**: `shared/question-banks/colonoscopy-optical-diagnosis.yaml`, `frontend/scripts/generate-types.ts`, `frontend/src/generated/question-banks.json` (auto), `frontend/src/generated/competencies.json` (auto), `frontend/src/generated/base-professions.json` (auto)

---

## Phase 4: Frontend — feature context and routing

### Step 4.1 — Auth context and feature hook

_Depends on 1.4_

- Extend `User` type in `frontend/src/auth/AuthContext.tsx` with `enabled_features: string[]`
- New `frontend/src/lib/features.ts`: `useHasFeature(key: string): boolean` hook

### Step 4.2 — RequireFeature guard

_Depends on 4.1_

New `frontend/src/auth/RequireFeature.tsx` — same pattern as existing `RequirePermission.tsx`. Returns 404 if feature not enabled (hides feature existence from users without access).

### Step 4.3 — Teaching routes

_Depends on 4.2_

Add to `frontend/src/main.tsx` (inside authenticated children array), all wrapped in `<RequireFeature feature="teaching">`:

| Path                              | Page                                                   | Access             |
| --------------------------------- | ------------------------------------------------------ | ------------------ |
| `/teaching`                       | Question bank selection + recent attempts              | All teaching users |
| `/teaching/assessment/:id`        | Active assessment (images, options, timer from config) | All teaching users |
| `/teaching/assessment/:id/result` | Assessment result breakdown (criteria from config)     | All teaching users |
| `/teaching/history`               | Full attempt history across all question banks         | All teaching users |
| `/teaching/manage`                | Question bank item management (select bank first)      | Educators only     |
| `/teaching/manage/upload`         | Upload items (images + metadata per config)            | Educators only     |
| `/teaching/results`               | All candidate results (central reporting)              | Educators only     |

### Step 4.4 — Feature-aware navigation

_Depends on 4.1_

Modify `frontend/src/components/navigation/SideNavContent.tsx`:

- Import `useHasFeature` hook
- If `useHasFeature("teaching")` → show "Teaching" nav section with sub-items: Assessments, My history
- If user also has `manage_teaching_content` competency → show "Manage items", "Results" sub-items

---

## Phase 5: Frontend — teaching UI

### Step 5.1 — Components (Storybook-first)

_Parallel with Phase 4_

All in `frontend/src/components/teaching/` with `.stories.tsx` and `.test.tsx`:

| Component                | Purpose                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QuestionView`           | Renders item based on question bank `type`: `uniform` → N images with config labels + config options; `variable` → item-provided images, text, and options. Optional text block (label from config) shown below images in both modes. |
| `AssessmentTimer`        | Countdown timer (from config `time_limit_minutes`), visual warning at 5 min remaining                                                                                                                                                 |
| `AssessmentProgress`     | Progress bar showing question X of N (from config `items_per_attempt`)                                                                                                                                                                |
| `AssessmentResult`       | Pass/fail display with config-driven score breakdown                                                                                                                                                                                  |
| `ScoreBreakdown`         | Per-criterion results: name, value, threshold, visual pass/fail (from `pass_criteria`)                                                                                                                                                |
| `ItemUpload`             | Educator upload form: adapts to question bank `type` — `uniform` shows N image slots + metadata; `variable` shows dynamic image/text/options fields                                                                                   |
| `AssessmentHistoryTable` | Table of past attempts with date, question bank, scores, pass/fail badge                                                                                                                                                              |
| `QuestionBankCard`       | Card: question bank title, description, item count, "Start assessment" button                                                                                                                                                         |
| `AssessmentIntro`        | Intro page before questions: renders `title` + markdown `body` from config + "Begin" button                                                                                                                                           |
| `AssessmentClosing`      | Closing page after last answer: renders `title` + markdown `body` from config + "View results" button                                                                                                                                 |

### Step 5.2 — Pages

_Depends on 4.3, 5.1_

All in `frontend/src/features/teaching/pages/`, using `<Container size="lg">` wrapper:

| Page                    | Purpose                                                                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `AssessmentDashboard`   | Grid of `QuestionBankCard`s + recent attempts summary                                                                                          |
| `AssessmentAttempt`     | Config-driven MCQ: intro page (from config) → `QuestionView` + `AssessmentTimer` + `AssessmentProgress` → closing page (from config) → results |
| `AssessmentResultPage`  | Detailed result: `ScoreBreakdown` (per-criterion from config) + retry button                                                                   |
| `AssessmentHistoryPage` | Complete attempt history with `AssessmentHistoryTable`                                                                                         |
| `ManageItems`           | Educator CRUD table for items (filtered by question bank, uses `AdminTable`)                                                                   |
| `UploadItems`           | Bulk upload form: `ItemUpload` × N with config-driven metadata fields                                                                          |
| `AllResults`            | Educator view of all candidate results (filterable by question bank, CSV export)                                                               |

---

## Phase 6: Infrastructure and CI/CD

### Step 6.1 — Terraform

- `infra/environments/teaching/terraform.tfvars` is already configured (`enable_fhir = false`)
- Add `TEACHING_STORAGE_BACKEND=gcs` and `TEACHING_GCS_BUCKET` env vars to Cloud Run backend config in `infra/main.tf`
- Verify `cloud_storage` module provisions bucket for teaching images

### Step 6.2 — Docker Compose (local dev)

- No new services needed (uses local filesystem storage)
- Add `TEACHING_STORAGE_BACKEND=local` to backend env in `compose.dev.yml`

### Step 6.3 — GitHub Actions

- Teaching deployment workflow (separate from EPR)
- Trigger: push to `main`
- Deploy to `quill-medical-teaching` GCP project
- Same Docker image build, different env vars
- Workload Identity Federation (per existing pattern)

### Step 6.4 — Seed data

Create `dev-scripts/seed-teaching-data.sh`:

- Create a teaching organisation
- Enable "teaching" feature on it
- Create sample educator and learner users
- Upload sample question bank items (e.g. polyp WLI + NBI pairs with correct diagnoses for the colonoscopy bank)
- Mark items as published (need ≥ `min_pool_size` for a valid assessment)

---

## Phase 7: Testing

### Backend

- `OrganisationFeature` model CRUD
- `requires_feature` dependency (enabled, disabled, no-org cases)
- Question bank config loading + validation (valid YAML, required fields, option tag consistency)
- Item CRUD endpoints (upload, list, update, soft-delete)
- Item metadata validation against question bank config at upload time
- Assessment lifecycle (start → answer → complete → score)
- Scoring engine: test `tag_percentage` and `tag_accuracy` rules independently, compound criteria
- Edge cases: time expiry mid-assessment, resume after disconnect, pool < `min_pool_size`
- Storage backends (local + GCS mock)
- Config with `FHIR_ENABLED=false` / `EHRBASE_ENABLED=false` (app starts without clinical services)
- Result email notification to central address

### Frontend

- `useHasFeature` hook
- `RequireFeature` guard (show/hide routes)
- `QuestionView` component (renders based on `type`: `uniform` → config-driven images/options; `variable` → per-item images/options; optional text in both modes)
- `AssessmentTimer` (countdown from config `time_limit_minutes`, expiry handling)
- `AssessmentProgress` (question X of N from config)
- `AssessmentResult` + `ScoreBreakdown` (config-driven criteria display, pass/fail)
- `QuestionBankCard` (title, description, item count from config)
- All teaching components (Storybook stories + test files)
- Teaching pages (render with mock API data + mock config)
- Navigation conditional rendering

### Integration

- Full flow: educator uploads items → candidate selects question bank → starts assessment → answers N items → scoring engine runs → pass/fail displayed → email sent
- Scoring engine: test each rule type with different configs (single criterion, compound criteria, different thresholds)
- Timer expiry: assessment auto-completes on timeout, unanswered items penalise `tag_percentage` rules
- Feature gating: teaching routes 403 when feature disabled
- EPR routes still work when teaching feature enabled alongside

---

## Verification checklist

1. `just start-dev b` — app starts with `FHIR_ENABLED=false` and `EHRBASE_ENABLED=false`
2. `just start-dev b` — app starts normally with defaults (FHIR/EHRbase enabled, EPR mode)
3. `just unit-tests-backend` — all existing and new tests pass
4. `just unit-tests-frontend` — all existing and new tests pass
5. `just storybook` — teaching components render correctly
6. `just pre-commit` — mypy strict, ruff, eslint all pass
7. Manual: teaching org → enable feature → educator uploads items for colonoscopy bank → candidate selects bank → starts assessment → answers 120 → compound score correct → result email received
8. Manual: EPR routes return 503 (not crash) when FHIR/EHRbase disabled
9. Manual: teaching nav hidden for EPR-only organisations
10. Manual: new org has zero features until admin explicitly enables them
11. `terraform plan -var-file=environments/teaching/terraform.tfvars` — no unexpected diffs

---

## Decisions

- **Additive only**: existing EPR code stays in place. New optional functionality goes in `features/`. Teaching code goes in `app/features/teaching/` (backend) and `src/features/teaching/` (frontend). Existing code (e.g. messaging) will be migrated into `features/` later.
- **Config-driven question banks**: each assessment type is a YAML file in `shared/question-banks/` defining MCQ type, images, options, tags, scoring rules, and assessment parameters. The engine is generic; adding a new question bank = new YAML file + content uploads. No code changes required.
- **MCQ types**: `uniform` (fixed structure per item — same images + options, defined in config) vs `variable` (each item has its own images, text, and options). Same scoring engine, different rendering and upload flows. New types can be added without schema changes (just a new frontend renderer + upload form).
- **All-explicit feature model**: no `OrganisationFeature` rows = no access. Features must be explicitly enabled per org. No implicit defaults. Data migration seeds existing orgs with `epr`, `messaging`, `letters` rows.
- **EPR-safe defaults**: `FHIR_ENABLED: bool = True` and `EHRBASE_ENABLED: bool = True` — clinical services are on by default. Teaching deployment must explicitly set `= false`. A missing env var never silently disables clinical functionality.
- **Belt-and-braces**: infrastructure flags (`FHIR_ENABLED`) control whether services start; feature rows (`OrganisationFeature`) control whether users can access features. Both layers must agree.
- **Storage**: GCS for cloud, local filesystem for dev. No MinIO. Abstract `StorageBackend` interface allows future backends.
- **Single migration history**: teaching tables always created everywhere (dormant in EPR env). No Alembic branching.
- **Feature keys**: string constants (`"epr"`, `"teaching"`, `"messaging"`, `"letters"`), not an enum — extensible without migrations.
- **Route prefixes**: `/api/teaching/*` (backend), `/teaching/*` (frontend).
- **Item status**: `draft`/`published` field — only published items enter the random selection pool for assessments.
- **Tag-based scoring**: option tags drive the scoring engine. `tag_percentage` and `tag_accuracy` rules are composable — any number of criteria, any combination of tags. Works identically for `uniform` (tags from config) and `variable` (tags from per-item options). New rule types (e.g. `overall_accuracy`, `minimum_correct_count`) can be added without schema changes.
- **Random selection**: each assessment randomly draws N items from the published pool per config. Order is also randomised — no two attempts are identical.
- **Timer**: server-validated, duration from config. Unanswered items after time expiry have no tags (penalises `tag_percentage` rules).
- **Metadata validation**: item metadata is validated against the question bank config at upload time — prevents orphan data that the scoring engine can't evaluate.

---

## Teaching deployment flow

How a teaching-only environment goes from zero to working:

1. **Terraform provisions GCP project** — `terraform apply -var-file=environments/teaching/terraform.tfvars` creates Cloud Run service, Cloud SQL (Postgres), GCS bucket. No HAPI FHIR or EHRbase services.
2. **Same Docker image deploys** — identical backend image to EPR, but env vars set `FHIR_ENABLED=false`, `EHRBASE_ENABLED=false`, `TEACHING_STORAGE_BACKEND=gcs`, `TEACHING_GCS_BUCKET=quill-teaching-images`.
3. **App starts without clinical services** — FHIR/EHRbase clients are not initialised. Clinical routes return 503. Teaching routes are available.
4. **Admin creates organisation** — e.g. "Gastroenterology MCQs" via admin UI or API. Enables `teaching` feature on it. Does NOT enable `epr`, `messaging`, or `letters`.
5. **Admin creates users** — educator and learner accounts, assigned to the teaching org with appropriate professions (`educator` / `learner`).
6. **Educator uploads items** — polyp WLI + NBI image pairs with correct diagnosis metadata, tagged to the `colonoscopy-optical-diagnosis` question bank.
7. **Users see teaching-only UI** — no EPR nav items, no patient demographics, no clinical letters. Only assessment dashboard listing available question banks, MCQ assessments, scoring results, and attempt history.

---

## Open considerations

1. **Multi-org users**: a user could belong to both an EPR org and a teaching org. `requires_feature` should check the user's active org context, not just primary. May need org-switching UI in future.
2. **Central reporting**: results emailed to a configured central address for accreditation tracking. May need structured export (CSV) for integration with accreditation bodies. The `AllResults` page provides the educator-facing view; the email provides the external audit trail.
3. **Self-registration**: the spec describes users creating their own accounts (Name, Institution, Work Email). The current system uses admin-created accounts. Options: (a) self-registration endpoint for teaching orgs with email verification, (b) admin creates accounts and sends invitation links, (c) open registration with auto-assignment to teaching org. Decision deferred — start with admin-created accounts.
4. **Timer behaviour**: if the candidate's browser closes mid-assessment, the assessment should remain open and resumable within the time limit. Server-side timer validation prevents extending time by manipulating the client. On timeout, unanswered items penalise `tag_percentage` rules.
5. **Pool size safety**: if the item pool has fewer than `min_pool_size` published items, refuse to start an assessment (HTTP 409). Educator management page should show a warning banner when pool is below threshold.
6. **EPR document storage**: the same `StorageBackend` abstraction could later serve EPR binary documents (clinical scans, letters). Out of scope for this plan.
7. **Educator analytics**: future work could add cohort-level analytics (commonly misclassified items, confidence calibration curves, pass rates over time) — generic across all question banks.
8. **Institution field**: the `User` model may need an `institution` field (or it could live as metadata). Required for accreditation tracking but not currently in the model.
9. **Question bank versioning**: if a config changes (e.g. new pass criteria thresholds), existing in-progress assessments should use the config snapshot from when they started. May need to store config version on the `Assessment` row.
10. **Future question bank examples**: the same engine could host radiology image classification (`uniform`), medication safety MCQs (`variable` — text-only, no images), dermatology lesion assessment (`uniform` — single image), or mixed clinical scenarios (`variable` — varying images + text per question) — each as a new YAML file with the appropriate `type`.
