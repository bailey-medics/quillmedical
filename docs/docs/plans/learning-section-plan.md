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

### One private repo per organisation

**One repo per organisation** (e.g. `eoeeta-teaching`) — contains both MCQ question banks and learning modules for that organisation. Each repo is self-contained: if the relationship ends, archive or delete the repo and remove the synced data from the database. No other organisation's content is affected.

The existing `question-bank` repo content is split during migration:

- `questions/colonoscopy-optical-diagnosis-test/` → `eoeeta-teaching/modules/colonoscopy-optical-diagnosis/assessment/`
- `questions/chest-xray-interpretation-test/` → `respiratory-teaching/modules/chest-xray-interpretation/assessment/`

During migration, `config.yaml` is renamed to `assessment.yaml` to clarify that it configures the assessment (not the module). The file contents are unchanged.

After migration, `question-bank` is archived.

**Known organisation repos:**

| Repo                   | `org_id`      | Content                                                                                    |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `eoeeta-teaching`      | `eoeeta`      | EoEETA endoscopy modules — learning + MCQ assessments (migrated from `question-bank`)      |
| `respiratory-teaching` | `respiratory` | Chest X-ray interpretation exam — assessment-only initially, learning materials may follow |

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
├── .github/
│   └── workflows/
│       ├── validate.yml                # Reusable workflow: PR validation gate
│       └── deploy.yml                  # Reusable workflow: build + deploy to GCS/API
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

**Adding a new organisation:** create a new repo with just `modules/`, `.github/workflows/` (two thin callers), `CONTENT_FORMAT.md`, and `README.md`. No scripts to copy or maintain. `respiratory-teaching` will be the first repo created this way, validating the pattern before EoEETA migration.

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

## 12. Suggested implementation order

**Phase 1a — Storybook-first frontend (YouTube videos)** ✅

1. `<SlideViewer>` and layout components (with Storybook stories) — stub data, no backend needed ✅
2. `<VideoPlayer>` component using `react-player` with YouTube embed (Storybook story) ✅
3. Slide navigation sidebar (`LearningNav`) in Storybook ✅
4. `TeachingLayout` component — the shared layout for all teaching pages (learning + assessments). No patient context, optional sidebar slot. Storybook stories showing learning (with `LearningNav` sidebar) and assessment (no sidebar) variants ✅

**Phase 1b — Static data layer and conference demo**

Wire the scaffolded pages to a data access layer that serves static content through async functions shaped exactly like the future API calls. This produces a working end-to-end demo (navigable from the assessment section) without any backend work. When the backend lands (Phase 2), swap the data layer implementation from static imports to `api.get()` calls — zero page changes needed.

**Architecture:** In production, the frontend never sees MDX — it receives `CompiledSlide[]` JSON (compiled server-side by `teaching-tooling`). Static TypeScript files exporting that same JSON shape are the most realistic mock. No MDX tooling is needed in the frontend.

```
Pages → learning-data.ts (async functions) → static content files
                ↓ (later, one-line swap per function)
Pages → learning-data.ts (async functions) → api.get() calls
```

Steps:

5. Create static content module at `frontend/src/features/teaching/content/colorectal-polyps.ts` — exports module metadata (`LearningModule`), description, and slides (`CompiledSlide[]`). Move existing stub slide data from `stubSlides.ts` here as the single source of truth. Include a `questionBankId` field to map this module to its assessment bank (`colonoscopy-optical-diagnosis-test`). Add a minimal Barrett's oesophagus entry for the second card on the dashboard
6. Create content index at `frontend/src/features/teaching/content/index.ts` — exports a `MODULES` map keyed by `moduleId` and a `BANK_TO_MODULE` map for question-bank-ID → module-ID lookup
7. Create data access layer at `frontend/src/features/teaching/learning-data.ts` with async functions matching the future API shape:
   - `getModules(): Promise<LearningModule[]>` — returns all live modules
   - `getModuleDetail(moduleId): Promise<{ module: LearningModule; description: string; slides: CompiledSlide[] } | null>` — returns one module's full data
   - `getModuleIdForBank(bankId): string | null` — maps question bank ID to learning module ID
   - All functions are async (returning resolved promises) so the swap to real API calls is signature-compatible
8. Update `LearningDashboard.tsx` — replace inline `STUB_MODULES` / `STUB_PROGRESS` with `getModules()` call using `useEffect` + state (consistent with assessment pages)
9. Update `ModuleOverview.tsx` — replace inline `STUB_MODULES` record with `getModuleDetail(moduleId)` call
10. Update `SlideReader.tsx` — replace `import { stubSlides }` with `getModuleDetail(moduleId)` to load slides; add loading state while data resolves
11. Fix `TeachingModuleMain.tsx` learning link — use `getModuleIdForBank()` so "Learning materials" navigates to `/teaching/learn/${moduleId}` instead of `/teaching/learn`. Hide the learning card if no learning module exists for the bank
12. Fix `SlideReader.tsx` finish navigation — "Finish" on the final slide navigates to `/teaching/${bankId}` (the module hub) instead of `/teaching` (the dashboard), so the learner can immediately start the assessment. Data layer provides the reverse mapping (module → bank)
13. Keep `stubSlides.ts` for Storybook — re-export from the content file so stories work unchanged with a single source of truth
14. Tests — update any tests whose imports change, add tests for `learning-data.ts` functions (call function, assert shape), verify all existing SlideViewer/SlideReader tests still pass
15. Accessibility audit and fixes
16. Playwright tests for slide flow (navigation, keyboard, touch gestures)

**Phase 2 — Backend and content pipeline**

17. Database models and Alembic migration (`backend/app/features/teaching/models.py`)
18. Bookmark/progress endpoints and frontend integration
19. `teaching-tooling` repo: validation scripts, MDX compiler, reusable GitHub Actions workflows
20. Content sync API endpoint + thin workflow callers in `eoeeta-teaching` organisation repo

**Phase 3 — GCS video infrastructure (replaces YouTube)**

21. Terraform: video buckets and Cloud CDN (`infra/modules/teaching-video-pipeline/`)
22. Cloud Run transcoding job — get one test video through end to end
23. Cloud Run caption job — Whisper integration
24. Signed URL minting endpoint — security-critical, prioritise tests
25. Swap `<VideoPlayer>` from `react-player`/YouTube to GCS signed URLs (evaluate Plyr at this point)

**Phase 4 — Migrate assessments to TeachingLayout**

26. Move assessment pages (`AssessmentAttempt`, `AssessmentResultPage`) from `MainLayout` + `examMode` to `TeachingLayout` (no sidebar variant)
27. Remove `examMode` flag from `MainLayout` and `RootLayout` — no longer needed
28. Update `LayoutCtx` to remove `setExamMode` — assessment pages no longer toggle layout state
29. Verify all assessment Storybook stories and tests pass with the new layout

**Phase 5 — Polish and ship**

30. Manual QA (quality assurance) across browsers and PWA modes
31. `CONTENT_FORMAT.md` finalisation in organisation repo
32. First real EoEETA module through the pipeline

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
