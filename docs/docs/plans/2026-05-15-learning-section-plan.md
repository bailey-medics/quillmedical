# Learning Section — Implementation Plan

## 1. Scope

This plan adds a **learning section** alongside the existing MCQ (multiple-choice question) assessment in the EoEETA (East of England Endoscopy Training Academy) teaching platform.

**Out of scope:**

- xAPI (Experience API)/SCORM (Sharable Content Object Reference Model)/LTI (Learning Tools Interoperability) compliance (deferred to V2)
- In-app authoring UI (deferred — content authored as MDX (Markdown + JSX) in private repo)
- Interactive widgets, fragments, presenter mode
- Analytics beyond bookmark/resume position

**In scope:**

- MDX-based learning content rendered as slide-paced reader
- Mixed content types per module: text slides, image slides, video slides, intro/outro slides
- Video hosting on GCS (Google Cloud Storage) with Cloud CDN (Content Delivery Network) and 8-hour signed URLs
- Caption generation via Whisper at deployment time
- Resume position tracking ("bookmark") per learner per module
- Free navigation, no enforced progression
- Mobile-first PWA (Progressive Web App), WCAG (Web Content Accessibility Guidelines) 2.1 AA accessibility

---

## 2. Architectural decisions

1. **Content format:** MDX for learning modules, YAML for MCQ question banks — both stored in a **single private repo per organisation** (e.g. `eoeeta-teaching` for EoEETA, `respiratory-teaching` for the Chest X-ray interpretation exam). Each repo contains the organisation's assessments AND learning materials. One repo per organisation means we can archive or delete an entire provider's materials cleanly if the relationship ends. The existing `question-bank` repo content is split: colonoscopy content migrates into `eoeeta-teaching`, chest x-ray content into `respiratory-teaching`
2. **Deployment pipeline:** each organisation repo has thin GitHub Actions workflow callers that delegate to reusable workflows in `teaching-tooling` (see Section 3). The reusable deploy workflow deploys into the teaching GCP (Google Cloud Platform) project (same pattern as `question-bank`'s existing `deploy.yml` which syncs to `gs://$GCP_TEACHING_GCS_BUCKET/`)
3. **Slide-break convention:** both `#` and `##` headings start a new slide, mirroring Quarto. `#` creates a section-title slide (large centred heading, optional body content). `##` creates a content slide. Compile-time AST (Abstract Syntax Tree) transform splits MDX into a slide array
4. **Per-slide layout:** specified via Quarto-style curly-brace attributes after the heading (e.g. `## Recorded lecture {.video-slide}`, `## Polyp morphology {.text-with-figure}`). A custom remark plugin parses these and attaches them to the slide node
5. **Video hosting:** Google Cloud Storage (private bucket) + Cloud CDN + 8-hour signed URLs minted by the FastAPI backend
6. **Transcoding:** FFmpeg in a Cloud Run job, triggered on video upload, produces 720p and 1080p H.264 variants plus a poster frame
7. **Captions:** Whisper-large in a Cloud Run job, produces WebVTT (Web Video Text Tracks), written alongside the video assets. Reviewed by author/editor before content is marked live
8. **Resume position:** single table keyed by `(learner_id, module_id)` storing slide index and (for video slides) seconds-into-video
9. **Auth and access control:** existing `requires_feature("teaching")` gate + CBAC (Competency-Based Access Control) `view_teaching_cases` competency. Module access uses the existing feature-gating pattern in `backend/app/features/`
10. **No DRM (Digital Rights Management):** signed URLs are the access boundary. Determined ripping is not in scope to prevent

---

## 3. Content repository structure

### One repo per organisation

**One repo per organisation** (e.g. `eoeeta-teaching`) — contains both MCQ question banks and learning modules for that organisation. Each repo is self-contained: if the relationship ends, archive or delete the repo and remove the synced data from the database. No other organisation's content is affected. Repos are private by default; `respiratory-teaching` is public as an open-source reference example.

The existing `question-bank` repo content is split during migration:

- `questions/colonoscopy-optical-diagnosis-test/` → `eoeeta-teaching/modules/colonoscopy-optical-diagnosis-test/assessment/` (kept as a fast test/demo module)
- `questions/chest-xray-interpretation-test/` → `respiratory-teaching/modules/chest-xray-interpretation/assessment/`

The `eoeeta-teaching` repo will contain two colonoscopy modules:

- `colonoscopy-optical-diagnosis-test` — the existing 4-question test data, kept permanently for fast manual testing and showcasing the assessment flow to external stakeholders
- `colonoscopy-optical-diagnosis` — the real clinical assessment (authored later by the clinical team with full question bank)

During migration, `config.yaml` is renamed to `assessment.yaml` to clarify that it configures the assessment (not the module). The `id` field is removed from the file — the bank ID is now derived from the `moduleId` in `module.yaml` (with a small backend change to `sync.py`). All other contents are unchanged.

After migration, `question-bank` is no longer needed. It remains readable until manually deleted by the maintainer — archiving or deletion is a human decision made after confirming both org repos deploy correctly and the app works end-to-end.

**Known organisation repos:**

| Repo                   | `org_id`      | Visibility | Content                                                                               |
| ---------------------- | ------------- | ---------- | ------------------------------------------------------------------------------------- |
| `eoeeta-teaching`      | `eoeeta`      | Private    | EoEETA endoscopy modules — learning + MCQ assessments (migrated from `question-bank`) |
| `respiratory-teaching` | `respiratory` | **Public** | Chest X-ray interpretation — learning + assessment. Open-source reference example     |

This means:

- Content ownership is clear — each repo belongs to one provider
- Removal is clean — archive the repo, run a teardown script to purge synced data
- Access control is granular — collaborators from N&N can be given access to `eoeeta-teaching` without seeing other providers' content
- Shared tooling (validation scripts, MDX compiler) is distributed via a reusable GitHub Actions workflow

### Organisation repo structure (e.g. `eoeeta-teaching`)

```
eoeeta-teaching/               # One repo per organisation (private if content is proprietary)
├── modules/                    # One folder per topic/module
│   ├── colorectal-polyps/
│   │   ├── module.yaml         # Module metadata (covers both learning + assessment)
│   │   ├── learning/           # Learning materials for this module
│   │   │   ├── content.mdx     # Content of slides aka learning material as MDX
│   │   │   └── images/
│   │   │       ├── polyp-morphology-overview.png
│   │   │       └── paris-0iia.png
│   │   └── assessment/         # Assessment content (matches existing question-bank structure)
│   │       ├── assessment.yaml # Assessment config (time limit, pass mark, certificate, etc.)
│   │       ├── certificate-blank.png
│   │       ├── question_001/
│   │       │   ├── question.yaml
│   │       │   ├── image_1.png
│   │       │   └── image_2.png
│   │       ├── question_002/
│   │       │   └── ...
│   │       └── ...
│   └── ...                     # Additional modules follow the same structure
├── shared-assets/              # Cross-module assets within this org
├── .github/
│   └── workflows/
│       ├── deploy.yml           # Thin caller → teaching-tooling reusable workflow
│       └── validate.yml         # Thin caller → teaching-tooling reusable workflow
├── CONTENT_FORMAT.md           # Documented spec (Section 11)
└── README.md
```

Each module is a self-contained folder organised by topic. Within each module, `learning/` holds the MDX slides and images; `assessment/` holds the question bank and `assessment.yaml` config. Either subfolder can be empty — a module may have only learning materials, only an assessment, or both. `module.yaml` at the module root is the source of truth for shared metadata (title, status, etc.).

**Videos are not stored in Git.** Source video files (any format — the transcoding pipeline normalises to H.264) are uploaded to `gs://quill-teaching-videos-source/{org}/{module_id}/` via the in-app video upload page (see Section 7) or `gsutil cp` for bulk operations. The MDX `<Video>` component references videos by filename only — the pipeline and frontend resolve these to GCS paths at build time and runtime respectively.

### Shared tooling — `teaching-tooling` repo

All validation, compilation, and deployment logic lives in a central **`teaching-tooling`** repo (`bailey-medics/teaching-tooling`). This repo is **public** — it contains no sensitive content (just scripts and reusable workflows) and can serve as a reference for other organisations setting up their own teaching repos. Organisation repos contain only content — no scripts.

```
teaching-tooling/                       # Central repo — shared across all orgs
├── scripts/
│   ├── validate.py                     # Module metadata + assessment validation
│   ├── validate_mdx.js                 # MDX parse + validate (CI gate)
│   └── compile_mdx.js                  # MDX → compiled.json
├── tests/
│   ├── fixtures/                       # Golden test modules (valid + invalid)
│   ├── test_validate.py                # pytest for validate.py
│   └── test_mdx.js                     # Node.js tests for MDX scripts
├── .github/
│   └── workflows/
│       ├── validate.yml                # Reusable workflow: PR validation gate
│       ├── deploy.yml                  # Reusable workflow: build + deploy to GCS/API
│       └── self-test.yml               # CI for teaching-tooling itself
├── package.json                        # Node.js deps (@mdx-js/mdx, unified, etc.)
├── requirements.txt                    # Python deps (pyyaml, pydantic)
├── .gitignore
├── LICENSE
└── README.md
```

Each organisation repo calls the reusable workflows with thin callers:

```yaml
# eoeeta-teaching/.github/workflows/validate.yml
on:
  pull_request:
jobs:
  validate:
    uses: bailey-medics/teaching-tooling/.github/workflows/validate.yml@v1
    with:
      org_id: eoeeta
    secrets: inherit
```

```yaml
# eoeeta-teaching/.github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  deploy:
    uses: bailey-medics/teaching-tooling/.github/workflows/deploy.yml@v1
    with:
      org_id: eoeeta
    secrets: inherit
```

The reusable workflows check out both the calling repo (content) and `teaching-tooling` (scripts), then run validation/compilation/deployment against the caller's `modules/` directory.

**Version pinning:** org repos reference a tag (e.g. `@v1`) for stability. Bump the tag to roll out tooling updates to all orgs at once. Use `@main` in `eoeeta-teaching` during initial development, switch to tags before adding a second organisation.

**Adding a new organisation:** create a new private repo with just `modules/`, `.github/workflows/` (two thin callers), `CONTENT_FORMAT.md`, and `README.md`. No scripts to copy or maintain. Use `respiratory-teaching` (the public reference example) as a template. `respiratory-teaching` was the first repo created this way, validating the pattern before EoEETA migration.

### `module.yaml` schema

```yaml
moduleId: colorectal-polyps # kebab-case, unique within the org
title: "Colorectal Polyps"
order: 2 # display order; ties broken by moduleId
status: draft | live # gating flag
renewalMonths: 36 # null = no renewal
```

`renewalMonths` is the number of months after completion before a delegate must redo both the learning module and its assessment. When set (e.g. `36` for EoEETA's 3-year renewal requirement), the backend flags the module as "due for renewal" once `completed_at + renewalMonths` has passed. Previous completion records are preserved — the learner simply needs to complete a new attempt. When `null`, completion is permanent.

**Renewal notifications:** a Cloud Scheduler job (daily, e.g. `0 8 * * *`) triggers a Cloud Run job that queries for completions approaching their `renewalMonths` deadline. Sends email (via existing `email_send.py`) and push notifications (via existing `push_send.py`) at 30 days and 7 days before expiry. Uses the same Cloud Run job pattern as video transcoding/captioning. Terraform: a `google_cloud_scheduler_job` resource targeting a `google_cloud_run_v2_job`.

Validate at deployment time with Pydantic. Unknown fields are deployment errors.

---

## 4. MDX content format

A module's `content.mdx` looks like:

```mdx
---
moduleId: colorectal-polyps
---

# Colorectal Polyps

## What this module covers

A short introduction:

- Morphology categories of superficial lesions
- Clinical implications of each
- How to communicate findings consistently

## Recorded lecture {.video-slide}

<Video youtubeId="dQw4w9WgXcQ" durationSeconds="1080" />

## Key teaching point

<Callout type="warning">
  The presence of a depressed component (0-IIc) changes management. Any 0-IIc or
  mixed lesion with a depressed area should be assessed carefully with
  chromoendoscopy before attempting resection.
</Callout>

# In summary

## Key takeaways

- Polypoid (0-I) vs non-polypoid (0-II) is the primary axis
- Depressed components (0-IIc) change management
- Refer back to this module whenever you need to standardise reporting
```

### Layout vocabulary (initial set)

Both `#` and `##` start a new slide. Curly-brace attributes work on both levels.

**Heading-level attributes** — control the whole-slide layout:

- `{.video-slide}` — video fills slide area, minimal chrome
- `{.image-slide}` — single image, optional caption (for slide-image-only PowerPoint exports)
- `{.text-with-figure}` — text on one side, image on the other
- (default) `#` with no attribute — section-title slide (large centred heading with optional body content, used for intro/summary dividers)
- (default) `##` with no attribute — standard text-and-content layout

**Inline MDX components** — used within any slide's body content (see MDX components below):

- `<Callout type="warning|info|success">` — coloured emphasis box within a slide
- `<Figure>`, `<Video>` — embedded media

### MDX components (initial set)

Implement as thin wrappers around existing Storybook primitives:

- `<Video youtubeId? src? durationSeconds poster?>` — video player. **V1 (YouTube):** `youtubeId` embeds a YouTube video via `react-player` — no backend video infrastructure needed. **V2 (GCS):** `src` is a filename resolved to a signed GCS URL at runtime; captions are auto-generated and stored in GCS alongside the processed video. Exactly one of `youtubeId` or `src` must be provided; the MDX validator enforces this
- `<Figure src caption? alt>` — image with caption. `src` is a filename (not a path); resolved at runtime to a signed GCS URL via the existing `StorageBackend` abstraction (same 15-minute signed URLs as assessment question images)
- `<Callout type="info|warning|success">` — styled call-out box

### Slide reader navigation

All navigation is handled by the slide reader — content authors never need to add navigation elements to MDX files.

**Slide-to-slide navigation** — the reader provides previous/next controls via three input methods:

- **On-screen buttons** — a `PreviousNextButton` pair (existing component) pinned to the bottom of the slide area. `onPrevious` is omitted on slide 1 (hides the "Previous" button). On the final slide, `nextLabel` changes to "Finish" and navigates back to the `TeachingModuleMain` page (`/teaching/:bankId`) where the learner can choose to start the assessment or revisit learning. Responsive sizing is already built in (`md` on mobile, `lg` on desktop)
- **Keyboard** — left/right arrow keys advance slides. Focus is managed so arrow keys work immediately without requiring a click into the slide area first
- **Touch gestures** — horizontal swipe left/right on touch devices. Use a lightweight swipe hook (e.g. `use-gesture` or a minimal custom `onTouchStart`/`onTouchEnd` handler) — no heavy gesture library. Swipe is disabled while a video is playing to avoid conflicts with video scrubbing

All three methods update the URL (`/teaching/learn/:moduleId/slide/:slideIndex`), which is the single source of truth for position. The `slide-progress/` bar and `LearningNav` sidebar (see Section 7) update reactively from the URL.

**Slide navigation sidebar** — covered in detail in Section 7. Provides a table-of-contents view of all slides with jump-to-slide, current position highlighting, and visited-slide indicators. Rendered in the existing `MainLayout` sidebar on desktop and `NavigationDrawer` on mobile.

**End-of-module behaviour** — pressing "Finish" on the final slide marks the module as complete (POST to `/api/teaching/modules/{module_id}/complete`) and navigates to the `TeachingModuleMain` page (`/teaching/:bankId`). From there the learner can start the assessment, revisit the learning materials, or navigate elsewhere.

---

## 5. Backend (FastAPI)

### New database models

Add to the existing teaching feature module at `backend/app/features/teaching/models.py` (alongside `QuestionBankConfig`, `Assessment`, etc.):

```python
# In backend/app/features/teaching/models.py

class LearningModule(Base):
    """A learning module synced from an organisation repo."""

    __tablename__ = "learning_modules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_id: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )  # e.g. "eoeeta" — identifies the source organisation repo
    module_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )  # unique within org, not globally
    title: Mapped[str] = mapped_column(String(500), nullable=False)

    __table_args__ = (
        UniqueConstraint("org_id", "module_id", name="uq_org_module"),
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)  # draft | live
    slide_count: Mapped[int] = mapped_column(Integer, nullable=False)
    renewal_months: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # null = no renewal
    captions_reviewed: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )  # set true by admin after reviewing Whisper-generated captions
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    compiled_json: Mapped[dict] = mapped_column(JSON, nullable=False)  # compiled slide array
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )


class LearnerModuleProgress(Base):
    """Resume position per learner per module."""

    __tablename__ = "learner_module_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "learning_module_id", name="uq_learner_module"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    learning_module_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("learning_modules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    last_slide_index: Mapped[int] = mapped_column(Integer, nullable=False)
    last_video_position_seconds: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
```

Alembic migration: `add_learning_module_tables`.

### New API endpoints

Add to the existing `backend/app/features/teaching/router.py`. All gated by `requires_feature("teaching")` (same as existing MCQ routes). Use `get_session` for the DB dependency.

**Multi-org module resolution:** learner-facing endpoints use `{module_id}` in the URL path. Since `module_id` is unique only within an org, the backend resolves the correct module using the authenticated user's organisation membership. If the same `module_id` exists in two orgs (unlikely but possible), the user only sees the one belonging to their org. Admin/sync endpoints include `org_id` explicitly in the request body.

| Method | Path                                                    | Purpose                                                                 |
| ------ | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/teaching/modules`                                 | List live modules with learner's progress overlay (renewal-aware)       |
| GET    | `/api/teaching/modules/{module_id}`                     | Module metadata + compiled slide structure                              |
| GET    | `/api/teaching/modules/{module_id}/slide/{slide_index}` | Single slide's compiled content                                         |
| POST   | `/api/teaching/modules/{module_id}/progress`            | Upsert learner's bookmark                                               |
| POST   | `/api/teaching/modules/{module_id}/complete`            | Mark module as complete                                                 |
| GET    | `/api/teaching/video-url`                               | Mint 8-hour signed URL for a video asset                                |
| POST   | `/api/admin/teaching/modules/sync`                      | Upsert module metadata from deploy pipeline (service token, org-scoped) |
| POST   | `/api/admin/teaching/videos/upload-url`                 | Generate presigned upload URL for GCS source bucket                     |
| GET    | `/api/admin/teaching/videos`                            | List uploaded videos for a module (source + processed status)           |

**Signed URL endpoint** must:

1. Authenticate the learner (existing dependency)
2. Verify `requires_feature("teaching")`
3. Verify the requested `video_path` belongs to the requested module (no path traversal)
4. Mint a v4 signed URL via `google-cloud-storage` library, valid for **8 hours**
5. Return the URL plus its expiry timestamp
6. Log the request (user_id, module_id, video_path, timestamp) for audit

### Config additions (`backend/app/config.py`)

Extend existing teaching config fields:

```python
TEACHING_VIDEOS_BUCKET: str = ""  # gs bucket for processed videos
```

### Service account and IAM

The existing Cloud Run service account needs `roles/storage.objectViewer` on the videos bucket + `iam.serviceAccountTokenCreator` to sign URLs via IAM (Identity and Access Management) Credentials API (no key files). Configure via Terraform following existing WIF (Workload Identity Federation) patterns.

---

## 6. Content build and deployment pipeline

Each organisation repo (e.g. `eoeeta-teaching`) has thin workflow callers (`deploy.yml` and `validate.yml`) that delegate to the reusable workflows in `teaching-tooling` (see Section 3). The reusable deploy workflow iterates over each module in `modules/`:

1. **Validate** — for each module in `modules/`: parse `module.yaml` against a Pydantic schema (via `teaching-tooling/scripts/validate.py`); if `learning/` exists, **parse and validate `content.mdx`** (via `teaching-tooling/scripts/validate_mdx.js`) and verify referenced images and videos exist; if `assessment/` exists, run existing question bank validation. This step runs in both `validate.yml` (on PR) and `deploy.yml` (before sync), so invalid content never merges.

   `validate_mdx.js` performs:
   - Full MDX parse via `@mdx-js/mdx` compiler — catches syntax errors, unclosed JSX tags, malformed expressions
   - Allowlist check: only known MDX components (`<Video>`, `<Figure>`, `<Callout>`) are permitted; unknown components fail the build
   - Required prop validation: e.g. `<Video>` must have exactly one of `youtubeId` or `src`, plus `durationSeconds`; `<Figure>` must have `src` and `alt`
   - Layout attribute validation: curly-brace attributes must be from the defined vocabulary (`.video-slide`, `.image-slide`, `.text-with-figure`, etc.); unknown layouts fail
   - Asset reference check: all image `src` paths in `<Figure>` components resolve to files that exist in the module's `images/` folder; `<Video>` `src` filenames are validated against the GCS source bucket during deploy (not during PR validation, since videos are uploaded separately)

2. **Compile MDX** — Node.js build step (`teaching-tooling/scripts/compile_mdx.js`) that:
   a. Parses MDX with custom remark plugin for `{.attribute}` syntax
   b. Splits at `#` and `##` boundaries into a slide array
   c. For each slide, captures its layout class(es) and renders to a JSON structure: `{slideIndex, layout, title, contentAst}`
   d. Outputs a `compiled.json` per module into a `dist/modules/` directory
3. **Process videos** — triggered when new or updated video files appear in `gs://quill-teaching-videos-source/{org}/{module_id}/` (uploaded via the video upload page or `gsutil cp`). The deploy workflow then:
   a. Detects unprocessed videos by comparing source and processed bucket contents
   b. Triggers Cloud Run job `video-transcode` (FFmpeg): produces 720p and 1080p H.264 variants + poster frame; writes to `gs://quill-teaching-videos-processed/{org_id}/{module_id}/`
   c. Triggers Cloud Run job `video-caption` (Whisper-large): produces WebVTT; writes to same processed bucket
   d. Sets `captions_reviewed = false` on the `LearningModule` DB record until an admin marks them reviewed in-app
4. **Deploy content** — for each module: `gsutil rsync` the `assessment/` subfolder to GCS (existing pattern), `gsutil rsync` learning images/static assets, then POST compiled module data to `POST /api/admin/teaching/modules/sync` (service token auth, same pattern as existing question bank sync)

**Authentication and org identity:** each organisation repo passes its `org_id` (e.g. `eoeeta`) as a parameter to the reusable workflow. The deploy workflow includes `org_id` in the `POST /api/admin/teaching/modules/sync` payload so the backend knows which organisation owns each module. All repos share the same WIF secrets (`GCP_TEACHING_WIF_PROVIDER` / `GCP_TEACHING_SERVICE_ACCOUNT`) for V1. For V2 with multiple organisations, consider per-org service accounts for audit isolation. The `org_id` is also used to scope GCS video paths: `gs://quill-teaching-videos-source/{org_id}/{module_id}/` and `gs://quill-teaching-videos-processed/{org_id}/{module_id}/`.

**Status gating:** `draft` modules are synced but not exposed via learner API. `live` modules visible to all users with the teaching feature enabled.

---

## 7. Frontend (React/TypeScript PWA)

### Route changes

The current `/teaching` route renders `AssessmentDashboard` — a page that lists question banks as `ActionCard` components, each with a "Start assessment" button. With learning modules added, each `ActionCard` on `/teaching` now navigates to a **new intermediate page** where the user chooses between learning materials and assessments.

**Revised route structure** (all under `<RequireFeature feature="teaching">`):

- `/teaching` — existing `AssessmentDashboard` (**stays at this path**). Each question bank `ActionCard` changes from "Start assessment" to navigating to `/teaching/:bankId`
- `/teaching/:bankId` — **new `TeachingModuleMain`**. Two `ActionCard` components:
  - "Learning materials" → navigates to `/teaching/learn`
  - "Start assessment" → navigates to `/teaching/assessment/new?bank={bankId}` (existing flow)
- `/teaching/learn` — module list with progress overlay
- `/teaching/learn/:moduleId` — module overview (title, description, "start" / "resume" button)
- `/teaching/learn/:moduleId/slide/:slideIndex` — slide reader
- `/teaching/assessment/:id` — existing `AssessmentAttempt` (unchanged)
- `/teaching/assessment/:id/result` — existing `AssessmentResultPage` (unchanged)
- `/teaching/results` — existing `AllResults` (unchanged)
- `/teaching/sync` — existing `SyncStatus` (unchanged)
- `/admin/teaching/videos` — **new `VideoUploadPage`**. Admin/superadmin only (gated by `<RequirePermission level="admin">`, same as all `/admin/*` routes). Uploading source videos to GCS

Deep-linking to a specific slide is supported. The slide index in the URL is the source of truth for "where am I."

### Pages and components

**Pages** in `src/features/teaching/pages/` (alongside existing `AssessmentDashboard`, `AssessmentAttempt`, etc.):

- `TeachingModuleMain.tsx` — **new**, mounted at `/teaching/:bankId`. Shows the bank title as a `PageHeader` and a `SimpleGrid` of two `ActionCard` components: "Learning materials" (→ `/teaching/learn`) and "Start assessment" (→ existing assessment flow for that bank). The assessment history table stays on `AssessmentDashboard`
- `LearningDashboard.tsx` — lists modules with progress overlay
- `ModuleOverview.tsx` — module metadata, start/resume CTA (call to action)
- `SlideReader.tsx` — the main slide runtime
- `VideoUploadPage.tsx` — **new**, mounted at `/admin/teaching/videos` under the existing admin section (gated by `<RequirePermission level="admin">`). A module `<Select>` dropdown at the top scopes the entire page to one module at a time — prevents accidental uploads to the wrong module. Once a module is selected, the page shows a table of all video filenames referenced by `<Video src>` in that module's compiled MDX. Each row shows:
  - **Filename** (from MDX)
  - **Status**: missing / uploaded / transcoding / processed / captions generated / captions reviewed
  - **Action**: "Upload" button (for missing), "Re-upload" (for existing) — opens file picker or drag-and-drop zone (`<Dropzone>` from Mantine), uploads directly to `gs://quill-teaching-videos-source/{org}/{module_id}/{filename}` via presigned URL from `POST /api/admin/teaching/videos/upload-url`
  - **Upload progress** bar shown during upload
  - A module cannot transition to `live` status while any referenced video is missing or unprocessed

**Reusable components** in `src/components/teaching/` (alongside existing `assessment-intro/`, `question-view/`, etc.):

- `slide-viewer/` — renders a single slide via layout dispatch
- `slide-layouts/` — one component per layout class: `SlideLayoutSectionTitle`, `SlideLayoutVideo`, `SlideLayoutImage`, `SlideLayoutTextWithFigure`, `SlideLayoutDefault`
- `video-player/` — **V1:** wraps **react-player** (YouTube support out of the box, lightweight). Props: `youtubeId?, signedUrl?, posterUrl?, captionsUrl?, onProgress(seconds), resumeAt?`. **V2:** evaluate swapping to **Plyr** for native captions/accessibility when GCS pipeline lands
- `slide-progress/` — progress indicator showing current position as a fraction (e.g. "5/23") and a thin progress bar. Always visible at the top of the slide reader

Each new component gets `.stories.tsx` and `.test.tsx`.

### TeachingLayout — clinical safety through separation of concerns

All teaching pages (both learning and assessment) use a dedicated `TeachingLayout` component instead of `MainLayout`. This is a deliberate clinical safety decision: teaching pages have **zero access to patient data** by design, not by flag.

**Why not `MainLayout` + `examMode`?** The current assessment implementation uses `MainLayout` with an `examMode` flag that hides patient UI. This is a clinical safety risk:

- The patient data pipeline (`LayoutCtx`) is still active — if `examMode` fails to toggle (bug, race condition, unmount timing), PHI (Protected Health Information) could leak into a teaching context
- Developers working on `MainLayout` could accidentally break exam mode or vice versa
- Harder to audit — the clinical safety officer must understand a flag rather than a structural boundary

**`TeachingLayout` eliminates these risks structurally:**

|                 | MainLayout              | TeachingLayout           |
| --------------- | ----------------------- | ------------------------ |
| Purpose         | Clinical pages          | All teaching pages       |
| Patient context | Yes (via `LayoutCtx`)   | **None — not in scope**  |
| Sidebar         | `SideNav` (patient nav) | Optional `sidebar` slot  |
| TopRibbon       | Patient info, search    | No patient, no search    |
| Footer          | Auth-aware              | Auth-aware (same)        |
| PHI risk        | By design               | **Eliminated by design** |

**Props:**

```typescript
interface TeachingLayoutProps {
  /** Optional sidebar content (e.g. LearningNav). No sidebar when omitted */
  sidebar?: ReactNode;
  /** Optional sidebar content for mobile drawer. Falls back to sidebar */
  drawerContent?: ReactNode;
  /** Page content */
  children: ReactNode;
  /** Override footer text (defaults to auth context) */
  footerText?: string;
}
```

**Usage patterns:**

- **Learning slides:** `<TeachingLayout sidebar={<LearningNav .../>} drawerContent={<LearningNav .../>}>` — sidebar with slide list, drawer on mobile
- **Module hub (`TeachingModuleMain`):** `<TeachingLayout sidebar={<ModuleNav .../>} drawerContent={<ModuleNav .../>}>` — sidebar with module-level navigation (see below)
- **Assessments:** `<TeachingLayout>` — no sidebar, full-width content for exam focus
- **Teaching dashboards (list pages):** `<TeachingLayout>` — no sidebar needed

**Implementation:** lives in `src/components/layouts/TeachingLayout.tsx` alongside `MainLayout`. Composes the same primitives (TopRibbon, Footer, NavigationDrawer) but deliberately excludes patient context. Renders `<Box hiddenFrom="sm"><PreviousNextButton/></Box>` when `onPrevious`/`onNext` props are provided (mobile-only navigation for learning slides).

### Module navigation sidebar

The **`ModuleNav`** component renders in `TeachingLayout`'s sidebar slot on the `TeachingModuleMain` page (`/teaching/:bankId`). It provides module-level navigation with three links:

- **Dashboard** — navigates back to `/teaching` (the main teaching dashboard)
- **Learning materials** — navigates to `/teaching/learn/:moduleId`
- **Start assessment** — navigates to the assessment flow for this module

Uses the same Mantine `NavLink` primitives as `LearningNav` and `SideNav`. Lives in `src/components/navigation/ModuleNav.tsx` with `.stories.tsx` and `.test.tsx`.

### Slide navigation sidebar

The `LearningNav` component renders inside `TeachingLayout`'s optional sidebar slot — **not** inside `MainLayout`. There is no conditional layout switching or sidebar swapping within `MainLayout`.

- **`LearningNav.tsx`** — component in `src/components/navigation/`. Receives the compiled slide list, current slide index, and visited set as props. Renders:
  - `TeachingProgressBar` fraction + progress bar at the top
  - A list of all slide titles as `NavLink` items, each with a type icon (text, video, callout). Current slide highlighted via `active` prop. Video slides show duration for unvisited slides
  - Click any title to jump directly to that slide (calls `onNavigate` to close drawer on mobile, same pattern as `SideNavContent`)
  - Exit link at the bottom to return to the module overview
- **Desktop** — `LearningNav` renders in `TeachingLayout`'s fixed sidebar (260px wide)
- **Mobile** — `LearningNav` renders inside `TeachingLayout`'s `<NavigationDrawer>`, triggered by the burger button. `PreviousNextButton` appears below the content for quick prev/next without opening the drawer
- **Assessments** — `TeachingLayout` with no sidebar slot = no sidebar at all. No `examMode` flag needed

### Types

Add to `src/features/teaching/types.ts`:

```typescript
export interface LearningModule {
  module_id: string;
  title: string;
  order_index: number;
  status: "draft" | "live";
  slide_count: number;
}

export interface LearnerProgress {
  module_id: string;
  last_slide_index: number;
  last_video_position_seconds: number | null;
  completed_at: string | null;
}

export interface CompiledSlide {
  slideIndex: number;
  layout: string;
  title: string;
  contentAst: unknown;
}
```

### State and data flow

- Use `api` client from `@/lib/api.ts` (existing pattern: `useEffect` + `api.get<T>(...)`)
- Bookmark state: local React state for current slide and video position; debounced POST to `/api/teaching/modules/{id}/progress` on change
- Signed video URL: fetched on demand when a video slide is rendered; cached in memory until expiry; refreshed proactively at expiry minus 5 minutes if the user is still on the slide

### Accessibility (WCAG 2.1 AA)

Non-negotiable, builds in from the start:

- Keyboard navigation: arrow keys for prev/next, sensible tab order
- All interactive elements have visible focus indicators (Mantine defaults)
- Video player has captions on by default for first-time viewers (toggleable, preference saved)
- Images have meaningful alt text from `<Figure alt>` prop; decorative images use `alt=""`
- Colour contrast meets AA throughout (Mantine theme tokens)
- Focus management: on slide change, focus moves to slide heading for screen reader announcement
- Reduced motion: respect `prefers-reduced-motion`

---

## 8. Video hosting infrastructure (Terraform)

Extend the existing teaching GCP project infrastructure (`infra/environments/teaching/`).

### Buckets

Add via the existing `infra/modules/cloud-storage/` module pattern (or a new `teaching-video-pipeline` module):

- `quill-teaching-videos-source` — raw uploads, lifecycle: delete after 90 days
- `quill-teaching-videos-processed` — transcoded variants and captions, signed URL access only

Both buckets:

- Region: `europe-west2` (matches existing `quill-images-teaching` bucket)
- Uniform bucket-level access enabled
- Public access prevention: enforced
- Versioning enabled on processed bucket

### Cloud CDN

Enable Cloud CDN in front of the processed bucket via a backend bucket. Cache TTL: 24 hours for video assets. Cloud CDN handles signed URL validation correctly.

### Cloud Run jobs

- `video-transcode` — Docker image with FFmpeg. 4 CPU, 4GB RAM. Timeout 60 minutes.
- `video-caption` — Docker image with Whisper-large. 4 CPU, 10GB RAM. Timeout 60 minutes.

Both triggered by GitHub Actions in the organisation repo's deploy workflow.

### Terraform structure

New module at `infra/modules/teaching-video-pipeline/` containing:

- Bucket resources and lifecycle policies
- Cloud CDN backend bucket config
- Cloud Run job definitions and service accounts
- IAM: `roles/storage.objectViewer` + `iam.serviceAccountTokenCreator` for the backend Cloud Run service account

---

## 9. Testing strategy

### Backend unit tests (pytest, run in Docker)

- All new endpoints — happy path and auth/authz failure modes
- Signed URL generation: assert expiry is 8 hours, assert URL contains expected path, wrong-user rejected, wrong-module-for-video rejected
- LearnerModuleProgress upsert: assert no row before first POST, row exists after, updated on subsequent POST
- Run: `docker exec quill_backend sh -lc "pytest -q -m 'not integration'"`

### Frontend unit tests (vitest + @testing-library/react)

- All new components with `renderWithMantine`/`renderWithRouter` from `@test/test-utils`
- Cover: props variations, loading/error states, keyboard navigation
- Run: `docker exec quill_frontend sh -lc "yarn unit-test:run"`

### MDX compilation tests (in organisation repo)

- Golden tests for a representative module (one of each layout type), assert compiled output matches expected JSON structure

### Playwright E2E (end-to-end)

- Navigate to teaching, open a module, advance to slide 3, leave, return — assert resume offered at slide 3
- Open a video slide, assert player loads with captions toggle visible, assert progress is recorded
- Mark module complete from final slide, assert UI updates

---

## 10. `CONTENT_FORMAT.md` (in each organisation repo)

A document at the root of each organisation repo (e.g. `eoeeta-teaching/CONTENT_FORMAT.md`) describing:

- The folder structure and naming conventions
- The `module.yaml` schema with all fields documented
- The MDX format: frontmatter, slide-break convention, available components and their prop contracts, available layout classes
- The video delivery format: any common format accepted (the pipeline transcodes to H.264); 1080p source preferred; max length suggestion
- The image format expected (PNG or WebP, max dimensions, alt text guidance)
- The build pipeline behaviour, status flags, and what each status means
- How to add a new module from scratch (step-by-step)

This is both internal documentation and the contractual artefact for each content provider's delivery expectations.

---

## 11. Content repository implementation

This section provides the detailed specification for creating the three new repos (`teaching-tooling`, `eoeeta-teaching`, `respiratory-teaching`), migrating content from `question-bank`, and wiring up the deployment pipeline. This is the operational counterpart to the architectural description in Section 3.

### 11.1 Prerequisites

- GitHub CLI (`gh`) authenticated with `bailey-medics` org permissions
- Node.js 22+ and Python 3.13+ available locally
- Access to `GCP_TEACHING_WIF_PROVIDER`, `GCP_TEACHING_SERVICE_ACCOUNT`, `GCP_TEACHING_GCS_BUCKET`, and `SLACK_CICD_WEBHOOK_URL` secrets

### 11.2 Create `teaching-tooling` repo

This is the dependency for both organisation repos — must land first.

```bash
gh repo create bailey-medics/teaching-tooling \
  --public \
  --description "Shared validation, compilation, and deployment tooling for Quill teaching repos" \
  --clone
```

#### Full directory structure

```
teaching-tooling/
├── scripts/
│   ├── validate.py             # Module metadata + assessment validation (Python)
│   ├── validate_mdx.js         # MDX parse + validate (Node.js, CI gate)
│   └── compile_mdx.js          # MDX → compiled.json (Node.js, deploy step)
├── tests/
│   ├── fixtures/
│   │   ├── valid-module/       # Golden test: valid module with learning + assessment
│   │   │   ├── module.yaml
│   │   │   ├── learning/
│   │   │   │   ├── content.mdx
│   │   │   │   └── images/
│   │   │   │       └── example.png
│   │   │   └── assessment/
│   │   │       ├── assessment.yaml
│   │   │       └── question_001/
│   │   │           ├── question.yaml
│   │   │           └── image_1.png
│   │   ├── assessment-only/    # Golden test: no learning folder
│   │   │   ├── module.yaml
│   │   │   └── assessment/
│   │   │       └── ...
│   │   └── invalid/            # Modules that should fail validation
│   │       ├── bad-mdx/
│   │       ├── missing-module-yaml/
│   │       └── unknown-component/
│   ├── test_validate.py        # pytest tests for validate.py
│   └── test_mdx.js             # Node.js tests for validate_mdx.js and compile_mdx.js
├── .github/
│   └── workflows/
│       ├── validate.yml        # Reusable workflow: PR validation gate
│       ├── deploy.yml          # Reusable workflow: build + deploy to GCS/API
│       └── self-test.yml       # CI for teaching-tooling itself (runs tests on PR)
├── package.json
├── package-lock.json
├── requirements.txt
├── .gitignore
├── LICENSE
└── README.md
```

#### `package.json`

```json
{
  "name": "teaching-tooling",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "validate:mdx": "node scripts/validate_mdx.js",
    "compile:mdx": "node scripts/compile_mdx.js",
    "test": "node --test tests/test_mdx.js"
  },
  "dependencies": {
    "@mdx-js/mdx": "^3.1.0",
    "unified": "^11.0.0",
    "remark-parse": "^11.0.0",
    "remark-mdx": "^3.1.0",
    "unist-util-visit": "^5.0.0",
    "yaml": "^2.7.0"
  }
}
```

#### `requirements.txt`

```
pyyaml>=6.0
pydantic>=2.10
```

#### `scripts/validate.py` specification

Adapted from `question-bank/scripts/validate.py`. Key differences from the existing script:

1. **Input structure**: accepts a `modules/` directory (not `questions/`). Each child folder is a module
2. **`module.yaml` validation**: new Pydantic model validates the module metadata envelope
3. **`assessment.yaml`** (not `config.yaml`): same validation logic as current `_validate_config()`, `_validate_certificate_section()`, `_validate_email_sections()`, and item validation — just reads from `assessment/assessment.yaml` instead of `config.yaml`. The `id` field is no longer required in `assessment.yaml` (bank ID is derived from `moduleId` in the parent `module.yaml`)
4. **Learning folder**: if `learning/` exists, verifies `content.mdx` is present and non-empty (MDX content validation delegated to `validate_mdx.js`)
5. **Exit codes**: 0 = all modules valid, 1 = validation errors found

```python
# module.yaml Pydantic schema
class ModuleMetadata(BaseModel):
    """Pydantic schema for module.yaml validation."""

    model_config = ConfigDict(extra="forbid")

    moduleId: str  # kebab-case, unique within org
    title: str
    order: int
    status: Literal["draft", "live"]
    renewalMonths: int | None = None

    @field_validator("moduleId")
    @classmethod
    def validate_module_id(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", v):
            raise ValueError("moduleId must be kebab-case")
        return v
```

**Assessment validation**: reuses all existing validation logic from the current `validate.py` (config schema, uniform/variable item checks, certificate section, email templates, image naming, cross-item checks). Changes from the current script: file path is `assessment/assessment.yaml` instead of `config.yaml`, question folders at `assessment/question_NNN/` instead of `question_NNN/`, and `id` field is no longer required (derived from `moduleId`).

#### `scripts/validate_mdx.js` specification

```javascript
// Usage: node scripts/validate_mdx.js <path-to-content.mdx> [--images-dir <path>]
// Exit code: 0 = valid, 1 = errors found
// Output: JSON array of errors to stdout

// Validation steps:
// 1. Parse MDX via @mdx-js/mdx compile() — catches syntax errors
// 2. Walk AST for JSX elements:
//    - Allowlist: only Video, Figure, Callout permitted
//    - Unknown components → error
// 3. Prop validation per component:
//    - Video: exactly one of youtubeId|src required, durationSeconds required (positive int)
//    - Figure: src required, alt required
//    - Callout: type required, must be info|warning|success
// 4. Layout attribute validation:
//    - Parse {.class-name} from heading text via regex
//    - Allowed: video-slide, image-slide, text-with-figure
//    - Unknown → error
// 5. Asset reference check (if --images-dir provided):
//    - All Figure src values must resolve to a file in images-dir
//    - Missing file → error
```

**Error output format** (JSON to stdout):

```json
[
  {
    "line": 15,
    "column": 1,
    "severity": "error",
    "rule": "unknown-component",
    "message": "Unknown MDX component 'Quiz' — allowed: Video, Figure, Callout"
  }
]
```

#### `scripts/compile_mdx.js` specification

```javascript
// Usage: node scripts/compile_mdx.js <modules-dir> [--output <dist-dir>]
// For each module with learning/content.mdx:
//   1. Read and parse MDX
//   2. Split into slides at # and ## boundaries
//   3. For each slide, produce a CompiledSlide JSON object
//   4. Write dist/<moduleId>/compiled.json

// Output JSON schema per module (array of CompiledSlide):
// [
//   {
//     "slideIndex": 0,
//     "layout": "section-title" | "video-slide" | "image-slide" | "text-with-figure" | "default",
//     "title": "Heading text (without {.attributes})",
//     "body": "Markdown body text (plain text, lists rendered as text)",
//     "youtubeId": "abc123",        // present only for video slides with youtubeId prop
//     "durationSeconds": 1080,      // present only for video slides
//     "imageSrc": "filename.png",   // present only for image/figure slides
//     "imageAlt": "Alt text",       // present only for image/figure slides
//     "imageCaption": "Caption",    // optional, for figure slides
//     "calloutType": "warning",     // present only if slide contains a Callout
//     "calloutBody": "Text..."      // present only if slide contains a Callout
//   }
// ]
```

**Layout determination logic:**

| Heading level | Attribute             | Resulting `layout` |
| ------------- | --------------------- | ------------------ |
| `#`           | (none)                | `section-title`    |
| `#`           | `{.video-slide}`      | `video-slide`      |
| `##`          | (none)                | `default`          |
| `##`          | `{.video-slide}`      | `video-slide`      |
| `##`          | `{.image-slide}`      | `image-slide`      |
| `##`          | `{.text-with-figure}` | `text-with-figure` |

**Slide splitting algorithm:**

1. Walk the MDX AST top-level nodes
2. When a heading node (`h1` or `h2`) is encountered, start a new slide
3. Accumulate subsequent nodes (paragraphs, lists, JSX elements) into the current slide's body
4. Extract `{.attribute}` from heading text using regex `/\{\.([a-z-]+)\}\s*$/`
5. Extract component props from JSX elements (`<Video>`, `<Figure>`, `<Callout>`) and promote to slide-level fields

#### Reusable workflow: `.github/workflows/validate.yml`

```yaml
name: Validate teaching content

on:
  workflow_call:
    inputs:
      org_id:
        description: "Organisation identifier (e.g. eoeeta, respiratory)"
        required: true
        type: string

permissions:
  contents: read

jobs:
  validate:
    name: Validate modules
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout content repo
        uses: actions/checkout@v4

      - name: Checkout teaching-tooling
        uses: actions/checkout@v4
        with:
          repository: bailey-medics/teaching-tooling
          path: .tooling

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.13"

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install Python deps
        run: pip install -r .tooling/requirements.txt

      - name: Install Node deps
        working-directory: .tooling
        run: npm ci

      - name: Validate module metadata and assessments
        run: python .tooling/scripts/validate.py modules/

      - name: Validate MDX content
        run: |
          for module_dir in modules/*/; do
            if [ -f "${module_dir}learning/content.mdx" ]; then
              echo "Validating MDX: ${module_dir}learning/content.mdx"
              node .tooling/scripts/validate_mdx.js \
                "${module_dir}learning/content.mdx" \
                --images-dir "${module_dir}learning/images"
            fi
          done
```

#### Reusable workflow: `.github/workflows/deploy.yml`

```yaml
name: Deploy teaching content

on:
  workflow_call:
    inputs:
      org_id:
        description: "Organisation identifier"
        required: true
        type: string

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    name: Validate, compile, and deploy
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: teaching
    steps:
      - name: Checkout content repo
        uses: actions/checkout@v4

      - name: Checkout teaching-tooling
        uses: actions/checkout@v4
        with:
          repository: bailey-medics/teaching-tooling
          path: .tooling

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.13"

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install Python deps
        run: pip install -r .tooling/requirements.txt

      - name: Install Node deps
        working-directory: .tooling
        run: npm ci

      - name: Validate all modules
        run: python .tooling/scripts/validate.py modules/

      - name: Validate MDX content
        run: |
          for module_dir in modules/*/; do
            if [ -f "${module_dir}learning/content.mdx" ]; then
              node .tooling/scripts/validate_mdx.js \
                "${module_dir}learning/content.mdx" \
                --images-dir "${module_dir}learning/images"
            fi
          done

      - name: Compile MDX to JSON
        run: node .tooling/scripts/compile_mdx.js modules/ --output dist/

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.GCP_TEACHING_WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_TEACHING_SERVICE_ACCOUNT }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Sync assessment content to GCS
        run: |
          for module_dir in modules/*/; do
            module_id=$(basename "$module_dir")
            if [ -d "${module_dir}assessment" ]; then
              echo "Syncing assessment: $module_id"
              gsutil -m rsync -r -d \
                "${module_dir}assessment/" \
                "gs://${{ secrets.GCP_TEACHING_GCS_BUCKET }}/questions/${{ inputs.org_id }}/${module_id}/"
            fi
          done

      - name: Sync learning images to GCS
        run: |
          for module_dir in modules/*/; do
            module_id=$(basename "$module_dir")
            if [ -d "${module_dir}learning/images" ]; then
              echo "Syncing learning images: $module_id"
              gsutil -m rsync -r -d \
                "${module_dir}learning/images/" \
                "gs://${{ secrets.GCP_TEACHING_GCS_BUCKET }}/learning/${{ inputs.org_id }}/${module_id}/images/"
            fi
          done

      - name: Sync compiled modules to API
        run: |
          for compiled in dist/*/compiled.json; do
            module_id=$(basename "$(dirname "$compiled")")
            echo "Syncing module to API: $module_id"
            curl -sf -X POST \
              "${{ secrets.TEACHING_API_URL }}/api/admin/teaching/modules/sync" \
              -H "Authorization: Bearer ${{ secrets.TEACHING_SERVICE_TOKEN }}" \
              -H "Content-Type: application/json" \
              -d "{
                \"org_id\": \"${{ inputs.org_id }}\",
                \"module_id\": \"${module_id}\",
                \"compiled\": $(cat "$compiled")
              }"
          done

      - name: Notify Slack on success
        if: success()
        uses: slackapi/slack-github-action@v2.1.1
        with:
          webhook: ${{ secrets.SLACK_CICD_WEBHOOK_URL }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "✅ Teaching content deployed (${{ inputs.org_id }})",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*✅ Teaching content deployed*\n\n*Org:* `${{ inputs.org_id }}`\n*Commit:* ${{ github.event.head_commit.message }}\n*Author:* ${{ github.actor }}"
                  }
                }
              ]
            }

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v2.1.1
        with:
          webhook: ${{ secrets.SLACK_CICD_WEBHOOK_URL }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "❌ Teaching content deploy failed (${{ inputs.org_id }})",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*❌ Teaching content deploy failed*\n\n*Org:* `${{ inputs.org_id }}`\n*Author:* ${{ github.actor }}\n*Action:* <${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View Run>"
                  }
                }
              ]
            }
```

### 11.3 Create `eoeeta-teaching` repo

```bash
gh repo create bailey-medics/eoeeta-teaching \
  --private \
  --description "EoEETA endoscopy teaching modules — learning materials and MCQ assessments" \
  --clone
```

#### Content migration from `question-bank`

The colonoscopy optical diagnosis **test** content moves from `question-bank/questions/colonoscopy-optical-diagnosis-test/` into a dedicated test module. This module is kept permanently for fast manual testing and showcasing the assessment to external stakeholders.

```bash
# From within eoeeta-teaching/
mkdir -p modules/colonoscopy-optical-diagnosis-test/assessment
mkdir -p modules/colonoscopy-optical-diagnosis-test/learning/images

# Copy assessment content (config.yaml renamed to assessment.yaml)
cp ../question-bank/questions/colonoscopy-optical-diagnosis-test/config.yaml \
   modules/colonoscopy-optical-diagnosis-test/assessment/assessment.yaml

cp ../question-bank/questions/colonoscopy-optical-diagnosis-test/certificate-blank.png \
   modules/colonoscopy-optical-diagnosis-test/assessment/

# Copy all question folders
cp -r ../question-bank/questions/colonoscopy-optical-diagnosis-test/question_* \
   modules/colonoscopy-optical-diagnosis-test/assessment/
```

**`assessment.yaml` changes**: the `id` field is **removed**. The bank ID is now derived from `moduleId` in `module.yaml` — the sync logic in `backend/app/features/teaching/sync.py` uses `moduleId` as the `question_bank_id` (a small change: ~3 lines). This eliminates the confusing dual-ID situation. All other content (assessment config, pass criteria, certificate, emails) is unchanged.

#### `modules/colonoscopy-optical-diagnosis-test/module.yaml`

```yaml
moduleId: colonoscopy-optical-diagnosis-test
title: "Optical diagnosis — test bank (demo/QA)"
order: 99
status: live
renewalMonths: null
```

#### `modules/colonoscopy-optical-diagnosis-test/learning/content.mdx`

Minimal placeholder demonstrating each layout type. Useful for verifying the learning flow works end-to-end.

#### The real module: `modules/colonoscopy-optical-diagnosis/`

Created later when the clinical team authors the full assessment. Placeholder structure added now so the module exists in the repo:

#### `modules/colonoscopy-optical-diagnosis/module.yaml`

```yaml
moduleId: colonoscopy-optical-diagnosis
title: "Optical diagnosis of diminutive colorectal polyps"
order: 1
status: draft
renewalMonths: 36
```

#### `modules/colonoscopy-optical-diagnosis/learning/content.mdx`

Minimal placeholder demonstrating each layout type. Real educational content authored later by the clinical team.

```mdx
---
moduleId: colonoscopy-optical-diagnosis
---

# Optical Diagnosis of Diminutive Colorectal Polyps

## What this module covers

A short introduction to the key concepts:

- Morphology categories of superficial lesions (Paris classification)
- High-confidence optical diagnosis criteria (NICE and WASP)
- How to communicate findings consistently using standardised terminology

## Recorded lecture {.video-slide}

<Video youtubeId="2OTbDQh3MxM" durationSeconds="1080" />

## Key teaching point

The distinction between adenomatous and serrated polyps determines surveillance intervals.

<Callout type="warning">
  The presence of a depressed component (0-IIc) changes management. Any 0-IIc or
  mixed lesion with a depressed component warrants chromoendoscopy before
  attempting resection.
</Callout>

# In summary

## Key takeaways

- Polypoid (0-I) vs non-polypoid (0-II) is the primary axis of classification
- High-confidence optical diagnoses require ≥85% accuracy to be clinically useful
- Depressed components (0-IIc) change management — always escalate
- Refer back to this module whenever you need to standardise polyp reporting
```

#### `.github/workflows/validate.yml`

```yaml
name: Validate

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    uses: bailey-medics/teaching-tooling/.github/workflows/validate.yml@main
    with:
      org_id: eoeeta
    secrets: inherit
```

#### `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    uses: bailey-medics/teaching-tooling/.github/workflows/deploy.yml@main
    with:
      org_id: eoeeta
    secrets: inherit
```

#### `README.md`

```markdown
# EoEETA Teaching

Teaching modules for the East of England Endoscopy Training Academy.

Contains learning materials (MDX slides) and MCQ assessment question banks
for EoEETA's endoscopy training programme.

## Structure

Each module lives under `modules/<module-id>/` with:

- `module.yaml` — module metadata
- `learning/` — MDX slides and images (optional)
- `assessment/` — MCQ question bank (optional)

See [CONTENT_FORMAT.md](CONTENT_FORMAT.md) for the full content specification.

## Workflows

- **Validate** — runs on PR, checks all module metadata, MDX syntax, and assessment structure
- **Deploy** — runs on push to `main`, compiles MDX and syncs to GCS + API
```

### 11.4 Create `respiratory-teaching` repo

This repo is **public** — it serves as an open-source reference example showing other organisations how to structure their own teaching repos. The content is non-proprietary test data suitable for public viewing. Private organisations (like `eoeeta-teaching`) follow the same structure but with `--private`.

```bash
gh repo create bailey-medics/respiratory-teaching \
  --public \
  --description "Respiratory medicine teaching — chest X-ray interpretation. Open-source reference example for Quill teaching repos." \
  --clone
```

#### Content migration

```bash
# From within respiratory-teaching/
mkdir -p modules/chest-xray-interpretation/assessment
mkdir -p modules/chest-xray-interpretation/learning/images

# Copy assessment content
cp ../question-bank/questions/chest-xray-interpretation-test/config.yaml \
   modules/chest-xray-interpretation/assessment/assessment.yaml

cp ../question-bank/questions/chest-xray-interpretation-test/certificate-blank.png \
   modules/chest-xray-interpretation/assessment/

cp -r ../question-bank/questions/chest-xray-interpretation-test/question_* \
   modules/chest-xray-interpretation/assessment/
```

#### `modules/chest-xray-interpretation/module.yaml`

```yaml
moduleId: chest-xray-interpretation
title: "Chest X-ray interpretation"
order: 1
status: live
renewalMonths: null
```

#### `modules/chest-xray-interpretation/learning/content.mdx`

Placeholder learning material demonstrating the MDX format for this module:

```mdx
---
moduleId: chest-xray-interpretation
---

# Chest X-ray Interpretation

## What this module covers

A systematic approach to interpreting PA chest X-rays:

- ABCDE method (Airway, Breathing, Circulation, Disability, Everything else)
- Common pathologies and their radiographic appearances
- Clinical correlation — matching findings to presentation
- Pitfalls and mimics to avoid misdiagnosis

## The systematic approach

Always use the same structured method for every film:

1. **Airway** — tracheal position, carina, main bronchi
2. **Breathing** — lung fields, pleural spaces, costophrenic angles
3. **Circulation** — heart size (cardiothoracic ratio), mediastinal contour, aortic knuckle
4. **Disability** — bones (ribs, clavicles, spine), soft tissues
5. **Everything else** — review areas (apices, behind the heart, below diaphragm, edges of film)

<Callout type="info">
  The most commonly missed findings are in the "review areas" — apices,
  retrocardiac space, and costophrenic recesses. Always check these last as a
  deliberate final step.
</Callout>

## Example case walkthrough {.video-slide}

<Video youtubeId="dQw4w9WgXcQ" durationSeconds="600" />

## Key teaching point

<Callout type="warning">
  A normal cardiothoracic ratio on a PA film is less than 0.5. On an AP film
  (common in acutely unwell patients), the heart appears magnified — do not
  diagnose cardiomegaly from an AP film alone.
</Callout>

## Common findings summary

| Finding          | Key radiographic sign                                     | Clinical context                          |
| ---------------- | --------------------------------------------------------- | ----------------------------------------- |
| Pneumothorax     | Visible pleural edge, absent lung markings beyond         | Sudden pleuritic pain, tall young male    |
| Pleural effusion | Meniscus sign, blunted costophrenic angle                 | Dull to percussion, reduced breath sounds |
| Lobar pneumonia  | Air bronchograms, consolidation respecting lobar boundary | Fever, productive cough, raised WCC       |
| Pneumoperitoneum | Air under diaphragm (erect film)                          | Acute abdomen, rigid, peritonitic         |

# In summary

## Key takeaways

- Use ABCDE on every film — consistency prevents missed findings
- Always check review areas last (apices, retrocardiac, costophrenic)
- Correlate with clinical presentation — a finding without context is incomplete
- Know your film type (PA vs AP) before interpreting heart size
- When in doubt, compare with previous imaging
```

#### Workflow callers

Identical pattern to `eoeeta-teaching` but with `org_id: respiratory`:

```yaml
# .github/workflows/validate.yml
name: Validate

on:
  pull_request:
    branches: [main]

jobs:
  validate:
    uses: bailey-medics/teaching-tooling/.github/workflows/validate.yml@main
    with:
      org_id: respiratory
    secrets: inherit
```

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    uses: bailey-medics/teaching-tooling/.github/workflows/deploy.yml@main
    with:
      org_id: respiratory
    secrets: inherit
```

#### `README.md`

```markdown
# Respiratory Teaching

Open-source example of a Quill teaching content repository.

This repo demonstrates the standard structure for organising MCQ assessments
and learning materials using the Quill teaching platform. Use it as a template
when creating your own private teaching repo for a new organisation.

## Structure

Each module lives under `modules/<module-id>/` with:

- `module.yaml` — module metadata (title, order, status, renewal)
- `learning/` — MDX slides and images (optional)
- `assessment/` — MCQ question bank (optional)

See [CONTENT_FORMAT.md](CONTENT_FORMAT.md) for the full content specification.

## Using this as a template

1. Create a new **private** repo for your organisation
2. Copy the `modules/`, `.github/workflows/`, and `CONTENT_FORMAT.md` structure
3. Update workflow callers to use your `org_id`
4. Configure the required secrets (see teaching-tooling README)
5. Add your content and push

## Shared tooling

Validation, compilation, and deployment are handled by
[teaching-tooling](https://github.com/bailey-medics/teaching-tooling).
This repo contains only content — no scripts.
```

#### `CONTENT_FORMAT.md`

Same pattern as `eoeeta-teaching`, adjusted for respiratory context.

### 11.5 GCS path strategy (backward compatibility)

**Problem:** The existing backend (`storage.py`) discovers question banks at `gs://$BUCKET/questions/{bank_id}/` (flat structure). The new org repos deploy to `gs://$BUCKET/questions/{org_id}/{module_id}/` (org-scoped).

**Solution — phased migration:**

1. **Phase A (initial deploy):** The deploy workflow syncs assessment content to `gs://$BUCKET/questions/{org_id}/{module_id}/`. The existing backend `discover_banks_in_gcs()` function in `storage.py` currently lists top-level prefixes under `questions/` — it will now find `eoeeta/` and `respiratory/` as prefixes instead of `colonoscopy-optical-diagnosis-test/`. This requires a backend update to handle the nested structure.

2. **Alternative — dual-write during migration:** Deploy to BOTH the old flat path AND the new org-scoped path temporarily. This keeps the existing backend working while the new sync endpoint (Phase 2 backend work) is built:

   ```bash
   # Old path (backward compat — existing sync endpoint reads from here)
   # Uses moduleId as the folder name (backend updated to look for this)
   gsutil rsync assessment/ gs://$BUCKET/questions/colonoscopy-optical-diagnosis-test/
   # New path (new sync endpoint will read from here)
   gsutil rsync assessment/ gs://$BUCKET/questions/eoeeta/colonoscopy-optical-diagnosis-test/
   ```

3. **Phase B (after backend update):** Remove the dual-write. Backend reads exclusively from org-scoped paths. The `moduleId` from `module.yaml` is used as the `question_bank_id` in the database.

**Recommendation:** Use the dual-write approach (option 2) during migration so the existing app continues to work without any backend changes. Remove the old paths once the backend is updated to read from org-scoped paths.

### 11.6 GitHub secrets configuration

Both organisation repos need the following secrets. Configure as **organisation-level secrets** in `bailey-medics` (shared across all teaching repos):

| Secret                         | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `GCP_TEACHING_WIF_PROVIDER`    | Workload Identity Federation provider (GCP auth) |
| `GCP_TEACHING_SERVICE_ACCOUNT` | Service account email for GCS access             |
| `GCP_TEACHING_GCS_BUCKET`      | GCS bucket name for teaching content             |
| `TEACHING_API_URL`             | Backend API base URL (for module sync POST)      |
| `TEACHING_SERVICE_TOKEN`       | Service-to-service auth token for sync endpoint  |
| `SLACK_CICD_WEBHOOK_URL`       | Slack notifications                              |

The `teaching` environment (referenced in the deploy workflow) must be configured on each org repo with the same protection rules as the existing `question-bank` repo.

### 11.7 Verification checklist

Before archiving `question-bank`:

1. **Local validation passes:**

   ```bash
   cd eoeeta-teaching && python ../teaching-tooling/scripts/validate.py modules/
   cd respiratory-teaching && python ../teaching-tooling/scripts/validate.py modules/
   ```

2. **MDX validation passes:**

   ```bash
   node teaching-tooling/scripts/validate_mdx.js \
     eoeeta-teaching/modules/colonoscopy-optical-diagnosis-test/learning/content.mdx \
     --images-dir eoeeta-teaching/modules/colonoscopy-optical-diagnosis-test/learning/images
   ```

3. **MDX compilation produces valid JSON:**

   ```bash
   node teaching-tooling/scripts/compile_mdx.js eoeeta-teaching/modules/ --output dist/
   # Inspect dist/colonoscopy-optical-diagnosis-test/compiled.json
   # Verify shape matches CompiledSlide[] from frontend/src/features/teaching/types.ts
   ```

4. **CI green:** push to feature branches on each org repo — validate workflow passes

5. **Deploy workflow succeeds:** merge to main — content appears in GCS at expected paths, module sync POST returns 200

6. **App still works:** run `just sync-teaching` locally, verify assessment starts and questions render (existing flow unchanged)

7. **Question-bank no longer needed:** once steps 1–6 pass, notify the maintainer that `bailey-medics/quill-question-bank` can be archived or deleted at their discretion. Do not archive or delete automatically

### 11.8 `CONTENT_FORMAT.md` template

Each organisation repo includes this document. Below is the template (values in `{braces}` are org-specific):

````markdown
# Content format specification

This document describes the content structure, naming conventions, and authoring
guidelines for the `{org-name}` teaching repository.

## Repository structure

```
modules/
└── {module-id}/
    ├── module.yaml         # Required: module metadata
    ├── learning/           # Optional: learning materials
    │   ├── content.mdx     # MDX slide content
    │   └── images/         # Referenced images (PNG or WebP)
    └── assessment/         # Optional: MCQ question bank
        ├── assessment.yaml # Assessment configuration
        ├── certificate-blank.png
        └── question_NNN/   # One folder per question
            ├── question.yaml
            └── image_N.png
```

## `module.yaml` schema

| Field           | Type              | Required | Description                                               |
| --------------- | ----------------- | -------- | --------------------------------------------------------- |
| `moduleId`      | string            | Yes      | Kebab-case identifier, unique within this repo            |
| `title`         | string            | Yes      | Human-readable module title                               |
| `order`         | integer           | Yes      | Display order (lower = first)                             |
| `status`        | `draft` \| `live` | Yes      | Gating flag — `draft` modules are not visible to learners |
| `renewalMonths` | integer \| null   | Yes      | Months until renewal required; `null` = permanent         |

## MDX content format

### Slide breaks

Both `#` (h1) and `##` (h2) headings start a new slide:

- `#` → section-title slide (large centred heading)
- `##` → content slide (standard layout)

### Layout attributes

Add `{.class-name}` after the heading to control layout:

| Attribute             | Effect                               |
| --------------------- | ------------------------------------ |
| `{.video-slide}`      | Video fills the slide area           |
| `{.image-slide}`      | Single image with optional caption   |
| `{.text-with-figure}` | Text on one side, image on the other |

### Available components

#### `<Video>`

| Prop              | Type   | Required                    | Description                      |
| ----------------- | ------ | --------------------------- | -------------------------------- |
| `youtubeId`       | string | One of `youtubeId` or `src` | YouTube video ID                 |
| `src`             | string | One of `youtubeId` or `src` | Video filename (resolved to GCS) |
| `durationSeconds` | number | Yes                         | Video duration                   |
| `poster`          | string | No                          | Poster image filename            |

#### `<Figure>`

| Prop      | Type   | Required | Description                              |
| --------- | ------ | -------- | ---------------------------------------- |
| `src`     | string | Yes      | Image filename (must exist in `images/`) |
| `alt`     | string | Yes      | Alt text for accessibility               |
| `caption` | string | No       | Caption text below image                 |

#### `<Callout>`

| Prop   | Type                             | Required | Description  |
| ------ | -------------------------------- | -------- | ------------ |
| `type` | `info` \| `warning` \| `success` | Yes      | Visual style |

## Images

- Format: PNG or WebP
- Maximum dimensions: 2048×2048px
- Place in `learning/images/` within the module folder
- Reference by filename only (not path) in `<Figure src>`
- All images must have meaningful `alt` text

## Videos

- **Not stored in Git** — upload via the admin video upload page or `gsutil cp`
- Any common format accepted (MP4, MOV, MKV) — the pipeline transcodes to H.264
- 1080p source preferred
- Maximum recommended length: 60 minutes per video
- Reference by filename only in `<Video src>`

## Adding a new module

1. Create folder: `modules/{module-id}/`
2. Create `module.yaml` with status `draft`
3. Add `learning/content.mdx` and/or `assessment/` content
4. Open a PR — validation runs automatically
5. Merge to `main` — content deploys to staging
6. When ready, update `status: live` in `module.yaml` and merge
````

---

## 12. Suggested implementation order

<!-- Tick off each item as it is completed. Use [x] for done, [ ] for pending. -->

**Phase 1a — Storybook-first frontend (YouTube videos)** ✅

- [x] 1. `<SlideViewer>` and layout components (with Storybook stories) — stub data, no backend needed
- [x] 2. `<VideoPlayer>` component using `react-player` with YouTube embed (Storybook story)
- [x] 3. Slide navigation sidebar (`LearningNav`) in Storybook
- [x] 4. `TeachingLayout` component — the shared layout for all teaching pages (learning + assessments). No patient context, optional sidebar slot. Storybook stories showing learning (with `LearningNav` sidebar) and assessment (no sidebar) variants

**Phase 1b — Static data layer and conference demo**

Wire the scaffolded pages to a data access layer that serves static content through async functions shaped exactly like the future API calls. This produces a working end-to-end demo (navigable from the assessment section) without any backend work. When the backend lands (Phase 2), swap the data layer implementation from static imports to `api.get()` calls — zero page changes needed.

**Architecture:** In production, the frontend never sees MDX — it receives `CompiledSlide[]` JSON (compiled server-side by `teaching-tooling`). Static TypeScript files exporting that same JSON shape are the most realistic mock. No MDX tooling is needed in the frontend.

```
Pages → learning-data.ts (async functions) → static content files
                ↓ (later, one-line swap per function)
Pages → learning-data.ts (async functions) → api.get() calls
```

Steps:

- [x] 5. Create static content module at `frontend/src/features/teaching/content/colorectal-polyps.ts` — exports module metadata (`LearningModule`), description, and slides (`CompiledSlide[]`). Move existing stub slide data from `stubSlides.ts` here as the single source of truth. The `moduleId` is the bank ID (same identifier used for both). Add a minimal Barrett's oesophagus entry for the second card on the dashboard
- [x] 6. Create content index at `frontend/src/features/teaching/content/index.ts` — exports a `MODULES` map keyed by `moduleId`
- [x] 7. Create data access layer at `frontend/src/features/teaching/learning-data.ts` with async functions matching the future API shape:
  - `getModules(): Promise<LearningModule[]>` — returns all live modules
  - `getModuleDetail(moduleId): Promise<{ module: LearningModule; description: string; slides: CompiledSlide[] } | null>` — returns one module's full data
  - All functions are async (returning resolved promises) so the swap to real API calls is signature-compatible
- [x] 8. Update `LearningDashboard.tsx` — replace inline `STUB_MODULES` / `STUB_PROGRESS` with `getModules()` call using `useEffect` + state (consistent with assessment pages)
- [x] 9. Update `ModuleOverview.tsx` — replace inline `STUB_MODULES` record with `getModuleDetail(moduleId)` call
- [x] 10. Update `SlideReader.tsx` — replace `import { stubSlides }` with `getModuleDetail(moduleId)` to load slides; add loading state while data resolves
- [x] 11. Fix `TeachingModuleMain.tsx` learning link — "Learning materials" navigates to `/teaching/learn/${moduleId}` (the `moduleId` IS the bank ID now, so no mapping needed). Hide the learning card if no learning module exists for the bank
- [x] 12. Fix `SlideReader.tsx` finish navigation — "Finish" on the final slide navigates to `/teaching/${moduleId}` (the module hub) instead of `/teaching` (the dashboard), so the learner can immediately start the assessment
- [x] 13. Keep `stubSlides.ts` for Storybook — re-export from the content file so stories work unchanged with a single source of truth
- [x] 14. Tests — update any tests whose imports change, add tests for `learning-data.ts` functions (call function, assert shape), verify all existing SlideViewer/SlideReader tests still pass
- [ ] 15. Accessibility audit and fixes
- [ ] 16. Playwright tests for slide flow (navigation, keyboard, touch gestures)

**Phase 2 — Backend, content pipeline, and repo migration**

- [ ] 17. Database models and Alembic migration (`backend/app/features/teaching/models.py`)
- [ ] 18. Bookmark/progress endpoints and frontend integration
- [x] 19. Plan `teaching-tooling` repo — full spec written (see Section 11.2)
- [x] 20. Plan `eoeeta-teaching` repo — structure, migration steps, placeholder MDX defined (see Section 11.3)
- [x] 21. Plan `respiratory-teaching` repo — structure, migration steps, placeholder learning MDX defined (see Section 11.4)
- [ ] 19a. Implement `teaching-tooling` repo — create repo, write `validate.py`, `validate_mdx.js`, `compile_mdx.js`, reusable workflows, tests
- [ ] 20a. Implement `eoeeta-teaching` repo — create repo, migrate colonoscopy content, add `module.yaml`, `content.mdx`, workflow callers
- [ ] 21a. Implement `respiratory-teaching` repo — create repo, migrate chest X-ray content, add learning MDX, workflow callers
- [ ] 22. Configure GitHub org-level secrets for WIF, GCS bucket, service token, Slack (see Section 11.6)
- [ ] 23. Verify: local validation passes, CI green on both org repos, deploy workflow syncs to GCS, app still works (see Section 11.7)
- [ ] 24. Content sync API endpoint (`POST /api/admin/teaching/modules/sync`) — accepts compiled JSON from deploy workflow
- [ ] 25. Notify maintainer that `question-bank` is no longer needed (do not archive/delete — that's a human decision)

**Phase 3 — GCS video infrastructure (replaces YouTube)** ⏳ LATER

> **Note:** Phase 3 will be built, but only after Phases 1–2 and 4–5 are complete and shipped. YouTube embeds via `react-player` are sufficient for the initial release. Begin this phase when explicitly instructed.

- [ ] 26. Terraform: video buckets and Cloud CDN (`infra/modules/teaching-video-pipeline/`)
- [ ] 27. Cloud Run transcoding job — get one test video through end to end
- [ ] 28. Cloud Run caption job — Whisper integration
- [ ] 29. Signed URL minting endpoint — security-critical, prioritise tests
- [ ] 30. Swap `<VideoPlayer>` from `react-player`/YouTube to GCS signed URLs (evaluate Plyr at this point)

**Phase 4 — Migrate assessments to TeachingLayout**

- [x] 31. Move assessment pages (`AssessmentAttempt`, `AssessmentResultPage`) from `MainLayout` + `examMode` to `TeachingLayout` (no sidebar variant)
- [ ] 32. Remove `examMode` flag from `MainLayout` and `RootLayout` — no longer needed (dead code: nothing calls `setExamMode` now)
- [ ] 33. Update `LayoutCtx` to remove `setExamMode` — assessment pages no longer toggle layout state
- [ ] 34. Verify all assessment Storybook stories and tests pass with the new layout

**Phase 5 — Polish and ship**

- [ ] 35. Manual QA (quality assurance) across browsers and PWA modes
- [ ] 36. `CONTENT_FORMAT.md` finalisation in organisation repo
- [ ] 37. First real EoEETA module through the pipeline

---

## 14. Out of scope for this iteration (V2 candidates)

- xAPI event emission to an LRS (Learning Record Store)
- SCORM packaging
- LTI 1.3 tool provider
- Full-text search across modules
- Granular analytics (drop-off points, replays, etc.)
- In-app authoring UI
- CPD (Continuing Professional Development) hour metadata and certificate-of-completion for teaching (separate from MCQ certificate)
- Backward MCQ→teaching remediation linking
- Offline support for video (text slides will work offline via service worker caching)
- Multi-org tenancy on the teaching project (single-org until V2 demand)

These are deliberate omissions, not forgotten requirements.
