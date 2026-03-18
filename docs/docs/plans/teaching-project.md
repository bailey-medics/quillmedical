# Teaching module — implementation plan

Add a gastroenterology MCQ teaching module as an **additive feature** — no restructuring of existing EPR code. Teaching gets its own `modules/teaching/` directories in both backend and frontend, gated by a new `OrganisationModule` model. Same codebase deploys to separate GCP projects via environment config. GCS handles image storage with local-filesystem fallback for dev.

---

## Current state vs proposal

| Area                 | Current codebase                                                                                                       | Change needed                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Backend structure    | Flat — all routes in `main.py`, models in `models.py`                                                                  | Add `app/modules/teaching/` with own router, models, schemas                              |
| Config               | `FHIR_SERVER_URL` and `EHRBASE_URL` are hardcoded required strings; FHIR/EHRbase DB passwords are required `SecretStr` | Make all optional (`str \| None = None`) with `fhir_enabled`/`ehrbase_enabled` properties |
| Organisation modules | `Organization` model exists, no module gating                                                                          | New `OrganisationModule` model — runtime feature flags per org                            |
| CBAC                 | 34 clinical competencies, 18 professions                                                                               | Add teaching competencies and professions (`learner`, `educator`)                         |
| Image storage        | No object storage anywhere                                                                                             | Abstract storage: filesystem (dev), GCS (cloud)                                           |
| Frontend routes      | Statically imported in `main.tsx` (~40 eager imports)                                                                  | Add teaching routes under `/teaching/*`, gated by org module                              |
| Navigation           | Static links in `SideNavContent.tsx`                                                                                   | Conditionally show teaching nav items                                                     |
| Terraform            | Teaching env already configured with `enable_fhir = false`                                                             | Add GCS storage env vars to Cloud Run, CI/CD pipeline                                     |

---

## Phase 1: OrganisationModule + config changes

### Step 1.1 — OrganisationModule model

Add to `backend/app/models.py`:

- `OrganisationModule` table with `id` (UUID PK), `organisation_id` (FK → organizations.id), `module_key` (str, e.g. "epr", "teaching", "messaging"), `enabled` (bool), `enabled_at` (datetime), `enabled_by` (FK → users.id)
- Unique constraint on `(organisation_id, module_key)`
- Relationship from `Organization` → `OrganisationModule` (one-to-many)

Migration: `just migrate "add_organisation_modules_table"`

**Files**: `backend/app/models.py`, new migration in `alembic/versions/`

### Step 1.2 — Make FHIR/EHRbase optional

Modify `backend/app/config.py`:

- `FHIR_SERVER_URL: str` → `FHIR_SERVER_URL: str | None = None`
- `EHRBASE_URL: str` → `EHRBASE_URL: str | None = None`
- All FHIR DB fields optional (`SecretStr | None = None`) with `None` defaults
- All EHRbase DB/API fields optional with `None` defaults
- Add computed properties: `fhir_enabled` → `self.FHIR_SERVER_URL is not None`, `ehrbase_enabled` → `self.EHRBASE_URL is not None`
- Guard `FHIR_DATABASE_URL` / `EHRBASE_DATABASE_URL` to return `None` when disabled

**Files**: `backend/app/config.py`

### Step 1.3 — Guard existing FHIR/EHRbase calls

_Depends on 1.2_

- `backend/app/fhir_client.py` — Guard initialisation; raise `HTTPException(503)` if called when disabled
- `backend/app/ehrbase_client.py` — Same pattern
- Patient routes in `main.py` that call FHIR (demographics, letters) — return 503 when FHIR disabled
- Health check endpoints — report FHIR/EHRbase as "not provisioned" rather than erroring

**Files**: `backend/app/fhir_client.py`, `backend/app/ehrbase_client.py`, `backend/app/main.py`

### Step 1.4 — OrganisationModule API endpoints

_Depends on 1.1_

- `GET /api/organizations/{id}/modules` — List enabled modules for an org (admin only)
- `PUT /api/organizations/{id}/modules/{module_key}` — Enable/disable module (admin only)
- Extend `GET /api/auth/me` response to include `enabled_modules: list[str]` for the user's primary org

**Files**: `backend/app/main.py`, new `backend/app/schemas/modules.py`

### Step 1.5 — `requires_module` FastAPI dependency

_Depends on 1.1_

Reusable dependency for gating routes by module (same pattern as existing `has_competency()` in `backend/app/cbac/decorators.py`):

```python
def requires_module(module_key: str) -> Callable:
    """FastAPI dependency: checks user's org has module enabled. Returns 403 if not."""
```

Resolves: user → primary org → `OrganisationModule` → 403 if disabled.

**Files**: new `backend/app/modules/__init__.py`

---

## Phase 2: Teaching domain models + storage

### Step 2.1 — Teaching models

_Depends on 1.1_

Create `backend/app/modules/teaching/models.py`:

**Curriculum**

| Field             | Type                 | Notes                   |
| ----------------- | -------------------- | ----------------------- |
| `id`              | UUID                 | Primary key             |
| `organisation_id` | UUID (FK)            | Owning org              |
| `title`           | str                  | Curriculum name         |
| `description`     | str or None          | Optional summary        |
| `created_by`      | UUID (FK → users.id) | Educator who created it |
| `created_at`      | datetime             | Auto-set                |
| `updated_at`      | datetime             | Auto-updated            |

**Case**

| Field            | Type      | Notes                                    |
| ---------------- | --------- | ---------------------------------------- |
| `id`             | UUID      | Primary key                              |
| `curriculum_id`  | UUID (FK) | Parent curriculum                        |
| `title`          | str       | Case title                               |
| `question`       | str       | MCQ question text                        |
| `options`        | JSON list | Answer options                           |
| `correct_option` | int       | Index into options (0-based)             |
| `explanation`    | str       | Shown after answer                       |
| `difficulty`     | str       | "beginner" / "intermediate" / "advanced" |
| `image_keys`     | JSON list | Storage object keys                      |
| `status`         | str       | "draft" / "published"                    |
| `order`          | int       | Display order within curriculum          |
| `created_at`     | datetime  | Auto-set                                 |

**UserAttempt**

| Field             | Type                 | Notes                  |
| ----------------- | -------------------- | ---------------------- |
| `id`              | UUID                 | Primary key            |
| `user_id`         | UUID (FK → users.id) | Learner                |
| `case_id`         | UUID (FK)            | Attempted case         |
| `selected_option` | int                  | Learner's answer       |
| `is_correct`      | bool                 | Computed on submission |
| `attempted_at`    | datetime             | Auto-set               |

Import these in `alembic/env.py` so Alembic detects them for migration generation.

Migration: `just migrate "add_teaching_tables"`

**Files**: new `backend/app/modules/teaching/__init__.py`, new `backend/app/modules/teaching/models.py`, `backend/alembic/env.py`

### Step 2.2 — Storage abstraction

_Parallel with 2.1_

Create `backend/app/modules/teaching/storage.py`:

- `StorageBackend` protocol with methods: `upload(key, data, content_type) → str`, `get_signed_url(key) → str`, `delete(key) → None`
- `LocalStorageBackend` — writes to a configurable directory (Docker volume in dev). Returns local URL.
- `GCSStorageBackend` — uses `google-cloud-storage` library. Returns signed URL with expiry.
- Factory: `get_storage_backend()` reads config to return the right backend.

Add to `config.py`:

- `TEACHING_STORAGE_BACKEND: str = "local"` (or `"gcs"`)
- `TEACHING_GCS_BUCKET: str | None = None`

Add `google-cloud-storage` to `pyproject.toml` dependencies.

**Files**: new `backend/app/modules/teaching/storage.py`, `backend/app/config.py`, `backend/pyproject.toml`

### Step 2.3 — Teaching API router

_Depends on 1.5, 2.1, 2.2_

Create `backend/app/modules/teaching/router.py` and `schemas.py`.

All routes gated by `Depends(requires_module("teaching"))`.

**Educator endpoints** (require `manage_teaching_content` competency):

| Method | Path                                 | Purpose                |
| ------ | ------------------------------------ | ---------------------- |
| POST   | `/api/teaching/curricula`            | Create curriculum      |
| GET    | `/api/teaching/curricula`            | List curricula for org |
| PUT    | `/api/teaching/curricula/{id}`       | Update curriculum      |
| DELETE | `/api/teaching/curricula/{id}`       | Soft-delete curriculum |
| POST   | `/api/teaching/curricula/{id}/cases` | Create case            |
| PUT    | `/api/teaching/cases/{id}`           | Update case            |
| DELETE | `/api/teaching/cases/{id}`           | Soft-delete case       |
| POST   | `/api/teaching/cases/{id}/images`    | Upload image(s)        |

**Learner endpoints** (require `view_teaching_cases` competency):

| Method | Path                                 | Purpose                                 |
| ------ | ------------------------------------ | --------------------------------------- |
| GET    | `/api/teaching/curricula`            | List available curricula                |
| GET    | `/api/teaching/curricula/{id}/cases` | List cases in curriculum                |
| GET    | `/api/teaching/cases/{id}`           | Get case (without correct answer)       |
| POST   | `/api/teaching/cases/{id}/attempt`   | Submit answer, get result + explanation |
| GET    | `/api/teaching/progress`             | User's progress (attempts, scores)      |

Register in `main.py`: `app.include_router(teaching_router)`.

**Files**: new `backend/app/modules/teaching/router.py`, new `backend/app/modules/teaching/schemas.py`, `backend/app/main.py`

---

## Phase 3: Teaching CBAC competencies

_Parallel with Phase 2_

### Step 3.1 — Competencies and professions

Add to `shared/competencies.yaml`:

| Competency ID             | Risk level | Description                              |
| ------------------------- | ---------- | ---------------------------------------- |
| `view_teaching_cases`     | low        | Access teaching case content             |
| `manage_teaching_content` | medium     | Create, edit, delete curricula and cases |
| `view_teaching_analytics` | low        | View aggregated learner progress         |

Add to `shared/base-professions.yaml`:

| Profession | Base competencies                                                           |
| ---------- | --------------------------------------------------------------------------- |
| `learner`  | `view_teaching_cases`                                                       |
| `educator` | `view_teaching_cases`, `manage_teaching_content`, `view_teaching_analytics` |

### Step 3.2 — Regenerate frontend types

_Depends on 3.1_

Run `yarn generate:types` to update `src/generated/competencies.json` and `src/generated/base-professions.json`.

**Files**: `shared/competencies.yaml`, `shared/base-professions.yaml`, `frontend/src/generated/competencies.json` (auto), `frontend/src/generated/base-professions.json` (auto)

---

## Phase 4: Frontend — module context and routing

### Step 4.1 — Auth context and module hook

_Depends on 1.4_

- Extend `User` type in `frontend/src/auth/AuthContext.tsx` with `enabled_modules: string[]`
- New `frontend/src/lib/modules.ts`: `useHasModule(key: string): boolean` hook

### Step 4.2 — RequireModule guard

_Depends on 4.1_

New `frontend/src/auth/RequireModule.tsx` — same pattern as existing `RequirePermission.tsx`. Returns 404 if module not enabled (hides feature existence from users without access).

### Step 4.3 — Teaching routes

_Depends on 4.2_

Add to `frontend/src/main.tsx` (inside authenticated children array), all wrapped in `<RequireModule module="teaching">`:

| Path                                      | Page                                | Access             |
| ----------------------------------------- | ----------------------------------- | ------------------ |
| `/teaching`                               | Curriculum list (learner dashboard) | All teaching users |
| `/teaching/:curriculumId`                 | Case list within curriculum         | All teaching users |
| `/teaching/:curriculumId/:caseId`         | MCQ quiz view                       | All teaching users |
| `/teaching/progress`                      | Learner progress dashboard          | All teaching users |
| `/teaching/manage`                        | Curriculum management               | Educators only     |
| `/teaching/manage/:curriculumId`          | Case management                     | Educators only     |
| `/teaching/manage/:curriculumId/new-case` | Create/edit case                    | Educators only     |

### Step 4.4 — Module-aware navigation

_Depends on 4.1_

Modify `frontend/src/components/navigation/SideNavContent.tsx`:

- Import `useHasModule` hook
- If `useHasModule("teaching")` → show "Teaching" nav section with sub-items: Cases, My progress
- If user also has `manage_teaching_content` competency → show "Manage" sub-item

---

## Phase 5: Frontend — teaching UI

### Step 5.1 — Components (Storybook-first)

_Parallel with Phase 4_

All in `frontend/src/components/teaching/` with `.stories.tsx` and `.test.tsx`:

| Component         | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `CurriculumCard`  | Card: title, description, progress bar, case count                     |
| `CaseCard`        | Preview: thumbnail, difficulty badge, completion status                |
| `QuizView`        | Full MCQ: image carousel, question, radio options, submit              |
| `QuizResult`      | After submission: correct/incorrect, explanation, next case            |
| `ProgressChart`   | Score visualisation by curriculum                                      |
| `ImageUpload`     | Drag-and-drop for educators (Mantine Dropzone)                         |
| `DifficultyBadge` | Coloured badge: beginner (green), intermediate (amber), advanced (red) |

### Step 5.2 — Pages

_Depends on 4.3, 5.1_

All in `frontend/src/modules/teaching/pages/`, using `<Container size="lg">` wrapper:

| Page                | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `TeachingDashboard` | Grid of `CurriculumCard`s                            |
| `CurriculumView`    | List of `CaseCard`s with progress summary            |
| `CaseAttempt`       | `QuizView` → `QuizResult` flow                       |
| `ProgressPage`      | `ProgressChart` + attempt history table              |
| `ManageCurricula`   | Educator CRUD table (uses `AdminTable`)              |
| `ManageCases`       | Educator case CRUD within a curriculum               |
| `CreateEditCase`    | Form: `ImageUpload`, question editor, options editor |

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
- Enable "teaching" module on it
- Create sample educator and learner users
- Create sample curriculum with placeholder cases

---

## Phase 7: Testing

### Backend

- `OrganisationModule` model CRUD
- `requires_module` dependency (enabled, disabled, no-org cases)
- Teaching router endpoints (full CRUD for curricula, cases, attempts)
- Storage backends (local + GCS mock)
- Config with optional FHIR/EHRbase (app starts without them)
- Progress calculation logic

### Frontend

- `useHasModule` hook
- `RequireModule` guard (show/hide routes)
- All teaching components (Storybook stories + test files)
- Teaching pages (render with mock API data)
- Navigation conditional rendering

### Integration

- Full flow: create curriculum → add cases → learner attempts → check progress
- Module gating: teaching routes 403 when module disabled
- EPR routes still work when teaching module enabled alongside

---

## Verification checklist

1. `just start-dev b` — app starts without FHIR/EHRbase env vars
2. `just unit-tests-backend` — all existing and new tests pass
3. `just unit-tests-frontend` — all existing and new tests pass
4. `just storybook` — teaching components render correctly
5. `just pre-commit` — mypy strict, ruff, eslint all pass
6. Manual: teaching org → enable module → educator creates curriculum + cases → learner attempts → progress verified
7. Manual: EPR routes return 503 (not crash) when FHIR/EHRbase disabled
8. Manual: teaching nav hidden for EPR-only organisations
9. `terraform plan -var-file=environments/teaching/terraform.tfvars` — no unexpected diffs

---

## Decisions

- **Additive only**: existing EPR code stays in place. No restructure to `app/core/` + `app/modules/epr/`. Teaching code goes in `app/modules/teaching/`.
- **Storage**: GCS for cloud, local filesystem for dev. No MinIO. Abstract `StorageBackend` interface allows future backends.
- **Single migration history**: teaching tables always created everywhere (dormant in EPR env). No Alembic branching.
- **Module keys**: string constants (`"epr"`, `"teaching"`, `"messaging"`, `"letters"`), not an enum — extensible without migrations.
- **Route prefixes**: `/api/teaching/*` (backend), `/teaching/*` (frontend).
- **Case status**: `draft`/`published` field on `Case` model — only published cases visible to learners.

---

## Open considerations

1. **Multi-org users**: a user could belong to both an EPR org and a teaching org. `requires_module` should check the user's active org context, not just primary. May need org-switching UI in future.
2. **Educator analytics**: Phase 5 covers learner progress. Future work could add class-level analytics (cohort performance, commonly failed cases, difficulty calibration).
3. **EPR document storage**: the same `StorageBackend` abstraction could later serve EPR binary documents (clinical scans, letters). Out of scope for this plan.
