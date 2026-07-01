# Plan: post-deploy GCS image verification

## Problem

When teaching content repos deploy via `pipeline.yml`, images are uploaded to GCS via `gsutil rsync`. If an upload silently fails, or the pipeline doesn't handle a file type (e.g. cover images were previously missing from `pipeline.yml`), there's no verification step — missing images are only noticed by humans visiting the live site.

## Goal

Two layers of protection, implemented in sequence:

1. **CI post-deploy check** (this plan) — after GCS upload, verify every declared image exists in the bucket before calling the backend sync endpoint
2. **Backend sync-time validation** (follow-up) — when the sync endpoint runs, verify all referenced images exist in GCS and return warnings/errors

---

## Phase 1: CI post-deploy GCS inventory check

### Where

`teaching-tooling/.github/workflows/pipeline.yml` — new step between "Sync to GCS" and "Trigger backend sync".

### What it does

A new Python script `teaching-tooling/scripts/verify_gcs_images.py` that:

1. For each module directory in `content/modules/*/`:
   - Parses `module.yaml` → extracts `coverImage` filename
   - Parses `assessment/assessment.yaml` (uniform) → extracts image keys
   - Parses each `assessment/question_*/question.yaml` (variable) → extracts image keys
   - Scans `learning/images/` directory for all image files present locally
2. Builds an expected GCS object list from the above:
   - `modules/<bank_id>/<coverImage>` (cover)
   - `questions/<bank_id>/<item_folder>/<filename>` (assessment images)
   - `learning/<bank_id>/images/<filename>` (learning images)
3. Runs `gsutil ls gs://<bucket>/<prefix>` for each bank and compares against expected
4. Reports missing objects and exits non-zero if any are absent

### Pipeline integration

```yaml
# In pipeline.yml, after "Sync to GCS", before "Trigger backend sync"
- name: Verify GCS image inventory
  run: |
    python scripts/verify_gcs_images.py \
      content/modules/ \
      --bucket "${{ secrets.GCP_TEACHING_GCS_BUCKET }}"
```

### Script design (`scripts/verify_gcs_images.py`)

```
verify_gcs_images.py <modules_path> --bucket <bucket_name>

Exit codes:
  0 — all declared images present in GCS
  1 — one or more declared images missing
```

**Dependencies**: `google-cloud-storage`, `pyyaml` (both already available in the pipeline environment).

**Approach**: Use the `google.cloud.storage` client (already authenticated via workload identity in the preceding step) to call `bucket.blob(path).exists()` for each expected object. This is cheaper than `gsutil ls` and gives per-file granularity.

**Output on failure**:

```
ERROR: Missing images in GCS:
  - modules/colonoscopy-optical-diagnosis-test/cover-colonoscopy.webp
  - questions/chest-xray-interpretation-test/question_003/lateral.jpg

2 image(s) declared but not found in bucket.
```

### Tests (`tests/test_verify_gcs_images.py`)

- Mock `google.cloud.storage` client
- Test: all images present → exit 0
- Test: missing cover image → exit 1 with correct error message
- Test: missing question image → exit 1
- Test: missing learning image → exit 1
- Test: module with no coverImage declared → skip cover check
- Test: module with no assessment dir → skip assessment checks

### Files to create/modify

| File                                               | Action                                    |
| -------------------------------------------------- | ----------------------------------------- |
| `teaching-tooling/scripts/verify_gcs_images.py`    | Create                                    |
| `teaching-tooling/tests/test_verify_gcs_images.py` | Create                                    |
| `teaching-tooling/.github/workflows/pipeline.yml`  | Add step                                  |
| `teaching-tooling/requirements.txt`                | Add `google-cloud-storage` if not present |

---

## Phase 2: Backend sync-time validation (follow-up)

### Where

`backend/app/features/teaching/` — enhancement to the sync endpoint.

### What it does

When `POST /api/ci/teaching/sync` runs:

1. After downloading each module's `module.yaml` from GCS, parse it for `coverImage`
2. For each question bank item, check that referenced image blobs exist
3. Collect any missing images into a `warnings` list
4. Return warnings in the sync response JSON:
   ```json
   {
     "synced_modules": ["colonoscopy-optical-diagnosis-test"],
     "warnings": ["Missing cover image: modules/chest-xray-test/cover.webp"]
   }
   ```
5. The CI step that calls sync can then fail if warnings are present

### Files to modify

| File                                       | Action                                     |
| ------------------------------------------ | ------------------------------------------ |
| `backend/app/features/teaching/router.py`  | Add image existence checks in sync handler |
| `backend/app/features/teaching/storage.py` | Add `check_images_exist()` helper          |
| `backend/tests/test_teaching_sync.py`      | Add tests for missing image warnings       |

---

## Implementation order

1. Write `verify_gcs_images.py` with tests
2. Add pipeline step
3. Test against a real deployment (manually trigger workflow)
4. Once confirmed working, implement phase 2 backend validation
