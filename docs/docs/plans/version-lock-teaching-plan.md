# Version locking for live teaching modules

## Summary

Prevent accidental content changes to live teaching module assessments without
incrementing the version. Enforce via CI on PRs (teaching repos get branch
protection), and require version bump +1 in `assessment.yaml` for any
assessment file change in a live module.

## Current state

- `version` is a top-level integer in `assessment.yaml` (e.g. `version: 1`)
- Used as a composite key in the DB: `QuestionBankConfig` unique on
  `(organisation_id, bank_slug, version)`
- No validation prevents reusing the same version number
- Teaching repos push directly to main with no PR requirement

## Risk

An educator changes questions in an assessment but forgets to bump the version.
Students who already took v1 now see different results/scores for "the same"
version. Assessment history becomes unreliable.

## Scope rationale

Only **assessment content** is version-locked. Learning content (slides, diagrams,
explanatory text) is exempt because:

- Learning edits don't invalidate past exam results
- The DB only tracks assessment attempts against versions — learning has no
  version-linked state
- Forcing a version bump for a typo fix in a slide creates friction without
  safety benefit

## Design decisions

| Decision               | Choice                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| Version location       | `assessment/assessment.yaml` (stays where it is today)                     |
| Module lifecycle       | `draft → live → retired` (one-way, no reopening)                           |
| Scope of lock          | Changes to `assessment/` dir require a version bump; `learning/` is exempt |
| Increment rule         | Exactly +1 (no skipping, no decrease)                                      |
| First deploy           | Must be `version: 1`; version stays at 1 until module goes live            |
| Override               | None — always bump version                                                 |
| Enforcement            | CI on PRs (primary) + backend reject on sync (secondary)                   |
| Teaching repo workflow | Feature branches + PRs (add branch protection)                             |

### Rules by module status (on main)

| main status | Repo changes                                                          | Runtime behaviour                                                |
| ----------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| draft       | Any change allowed, but version must remain 1                         | Not visible to delegates                                         |
| live        | Assessment changes require version bump +1; learning changes are free | Full access: learning materials + assessments                    |
| retired     | No changes allowed (module is permanently frozen)                     | No new access; past results remain viewable but module is hidden |

## Implementation

### Phase 1: Version lock validation in CI

- [x] 1. Update `teaching-tooling/.github/workflows/validate.yml`:
  - Add `fetch-depth: 0` to content repo checkout (need git history)
  - Add `git fetch origin main` step
  - Add new validation step: `python tooling/scripts/check_version_lock.py content/modules/`

- [x] 2. Create `teaching-tooling/scripts/check_version_lock.py`:

  ```
  For each module directory:
    Read module.yaml from origin/main via:
      git show origin/main:modules/<id>/module.yaml
    If module doesn't exist on main → new module, skip (nothing to protect)
    main_status = status from main's module.yaml

    If main_status == "draft":
      pr_version = version from PR branch's assessment.yaml
      If pr_version != 1 → FAIL (version must stay at 1 until module is live)
      → pass

    If main_status == "retired":
      → FAIL (retired modules are permanently frozen; create a new module instead)

    If main_status == "live":
      Read assessment/assessment.yaml from origin/main
      main_version = version from main's assessment.yaml
      pr_version = version from PR branch's assessment.yaml
      changed_assessment = git diff --name-only origin/main -- modules/<id>/assessment/
      (note: modules/<id>/learning/ is NOT checked — exempt from lock)
      If no assessment files changed → pass (no-op)
      If assessment files changed AND pr_version == main_version → FAIL
      If assessment files changed AND pr_version == main_version + 1 → PASS
      If assessment files changed AND pr_version > main_version + 1 → FAIL (no skipping)
      If assessment files changed AND pr_version < main_version → FAIL (no decrease)
  ```

### Phase 2: Branch protection via Terraform

- [x] 3. Create `teaching-tooling/infra/main.tf`:
  - GitHub provider with `bailey-medics` org
  - `github_branch_protection` resource using `for_each` over teaching repos
  - Require PRs to merge to main
  - Require "Validate teaching content" status check to pass
  - Terraform state stored in GCS (or local — small enough)
  - Apply via GitHub Actions on push to `teaching-tooling/infra/`

### Phase 3: Backend defence-in-depth

- [x] 4. In `backend/app/features/teaching/sync.py`:
  - **Draft modules**: reject sync if `version != 1`
  - **Live modules**: reject sync if incoming `version <= stored_version`
    (log warning, skip bank, don't error the whole sync)
  - **Retired modules**: import normally (backend needs to know the module
    is retired so it can hide it from delegates and block new assessments)

### Phase 4: Sync UI feedback

- [ ] 5. Update the sync admin page to show a detailed result breakdown:
  - `StateMessage` summary: "Sync complete: X imported, Y skipped, Z errors"
  - `DataTable` below with per-module rows: name, status (imported/skipped/error),
    version (previous → new), and reason for any skip/failure
  - Results persist on screen until the next sync is triggered

## Files to change

| File                                              | Change                                             |
| ------------------------------------------------- | -------------------------------------------------- |
| `teaching-tooling/scripts/check_version_lock.py`  | **NEW** — version lock enforcement                 |
| `teaching-tooling/.github/workflows/validate.yml` | Add fetch-depth + new step                         |
| `teaching-tooling/scripts/validate.py`            | Add 'retired' to valid status values               |
| `teaching-tooling/infra/main.tf`                  | **NEW** — branch protection for teaching repos     |
| `backend/app/features/teaching/sync.py`           | Add version monotonicity guard + detailed response |
| `backend/app/features/teaching/storage.py`        | Add `get_module_status_from_gcs` helper            |
| `backend/app/main.py`                             | Pass module_status to sync in CI endpoint          |
| `backend/app/features/teaching/router.py`         | Pass module_status to sync in admin endpoints      |
| Frontend sync admin page                          | Show per-module import results with reasons        |

## Verification

- [x] 1. `check_version_lock.py` unit tests pass (10 tests — draft, live, retired, new module)
- [ ] 2. `python teaching-tooling/scripts/validate.py teaching-repos/eoeeta-teaching/modules/` — passes
- [ ] 3. Backend tests pass: `docker exec quill_backend sh -lc "pytest -q -m 'not integration'"`
- [ ] 4. Backend sync version guard tests (new tests for draft/live/retired rejection)
- [ ] 5. Teaching-tooling full test suite: `cd teaching-tooling && pytest`
- [ ] 6. Frontend sync UI tests (Phase 4)

## Outstanding test work (requires Docker)

- [ ] Backend: test `_load_module_status` reads from parent dir correctly
- [ ] Backend: test draft module rejected when version != 1
- [ ] Backend: test live module rejected when version <= stored
- [ ] Backend: test live module accepted when version > stored
- [ ] Backend: test retired module imports normally (no version guard)
- [ ] Backend: test `get_module_status_from_gcs` (mock GCS client)
- [ ] Teaching-tooling: integration test with real git repo fixture

## Rollout order

1. `teaching-tooling` — lock script + branch protection Terraform (merged first)
2. `quillmedical` backend — add monotonicity guard
3. Run `terraform apply` in teaching-tooling/infra to activate:
   - Content repos: require "Validate teaching content" status check
   - `teaching-tooling` itself: require "python-tests" + "node-tests" status checks
   - All teaching repos: branch naming restricted to `main` or `feature/*` only
4. All repos use PRs to main — no direct pushes
