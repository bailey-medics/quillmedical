# API compatibility manual testing & validation

## Overview

This guide walks through recreating the full API compatibility workflow locally or in test scenarios: detecting a breaking change, going through the approval gate, creating a decision file, and verifying the CI validation passes.

Use this when:

- Testing the workflow before real breaking changes happen
- Diagnosing why CI validation failed
- Demonstrating the process to a team member

## Prerequisites

Ensure you're on a feature branch (not `main`) with:

```bash
cd /Users/markbailey/github/quillmedical
git checkout -b feature/test-api-compat
```

## Step 1: Create a breaking change to the OpenAPI spec

Edit the FastAPI backend to introduce a breaking change. For testing, a safe option is to rename or remove a response field.

**Example: remove an optional field from a response** (`backend/app/main.py` or a relevant route file):

Before:

```python
class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str  # ← Will be removed
    created_at: datetime
```

After:

```python
class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime
```

**Example: add a required request field** (even more obviously breaking):

Before:

```python
@router.post("/api/patients")
def create_patient(data: PatientCreateRequest):
    ...
```

After (add a new **required** field):

```python
class PatientCreateRequest(BaseModel):
    name: str
    nhs_number: str  # ← NEW and required
    dob: date

@router.post("/api/patients")
def create_patient(data: PatientCreateRequest):
    ...
```

Push your change:

```bash
git add backend/app/main.py
git commit -m "test: introduce breaking API change for compat testing"
git push origin feature/test-api-compat
```

## Step 2: Trigger CI and observe the breaking-change detection

Go to GitHub and open a pull request from `feature/test-api-compat` → `main`. Do **not** draft it (the CI only runs on non-draft PRs).

The CI workflow will:

1. Generate the OpenAPI spec from your branch
2. Download and diff against the `main` branch spec via `oasdiff breaking`
3. Report any breaking changes found

**Check the CI logs:**

In the **Checks** tab of your PR, find the `heavy_api_schema_diff` job and click **View workflow run**:

- Look for the step: "Run openapi schema diff"
- The output will show `breaking=true` if your change was detected
- Look for `oasdiff`'s JSON report listing your change (e.g., `"response-required-property-removed"` or `"request-required-property-added"`)

**Expected output snippet** in the job log:

```
...
+++ oasdiff - OpenAPI diff and breaking changes detector
+ oasdiff breaking --format json main.json pr.json > oasdiff-report.json
[check-api-breaking-changes] Detected 1 breaking change(s)
breaking=true
```

## Step 3: Observe the GitHub Actions approval gate

Once CI detects `breaking=true`, GitHub Actions will pause and require approval from the **api-breaking-change-review** environment.

**What you'll see:**

In your PR, a new check appears: "Waiting for approval in api-breaking-change-review environment" (with a clickable link).

Click the environment link or go to **Settings** → **Environments** → **api-breaking-change-review** to see:

- Required reviewers (repo owner/author)
- Deployment summary showing your run awaiting approval
- A blue **Approve and deploy** button

**To approve:**

1. Click **Approve and deploy**
2. (Optional) add a comment explaining the business case for the breaking change
3. Confirm approval

Approving advances the workflow to the next jobs (validation, Slack notification, etc.).

## Step 4: Run the validation script and observe it fail

Before you can merge, the `validate-compat-files.sh` script must pass. It will **fail** if you haven't created a decision file yet.

**To run validation locally:**

```bash
cd /Users/markbailey/github/quillmedical

# Download the oasdiff report the CI generated, or generate it locally
# Option A: Use CI's report from the PR
#   (Click the PR's "Checks" tab → heavy_api_schema_diff → download oasdiff-report.json)

# Option B: Generate locally
bash backend/scripts/dump_openapi.py > /tmp/main.json  # on main branch
git stash && bash backend/scripts/dump_openapi.py > /tmp/pr.json && git stash pop
oasdiff breaking --format json /tmp/main.json /tmp/pr.json > /tmp/oasdiff-report.json

# Now run the validation
bash .github/scripts/ci/validate-compat-files.sh /tmp/oasdiff-report.json api-compatibility
```

**Expected output (failure):**

```
[validate-compat-files] ERROR: Flagged change not covered by any decision file:
'response-required-property-removed GET /api/users'
```

The script lists which exact `oasdiff` change ID + operation + path it found but for which no decision file exists.

## Step 5: Create a decision file

Use the interactive script to create a decision file covering your breaking change:

```bash
python backend/scripts/new_compat_decision.py
```

**Follow the prompts:**

```
Enter the oasdiff change ID + operation + path exactly as it appears in the error:
> response-required-property-removed GET /api/users

Enter forces_reload (true/false) — does this breaking change require every open
tab to reload immediately?

  - true: if a tab's cached data depends on the removed field and will crash or
    malfunction without it
  - false: if the app gracefully handles the missing field (e.g. optional field,
    or the UI doesn't use it)

Enter (true/false):
> false

Enter a reason (for the safety/audit trail):
> The removed field "full_name" was only used in the admin dashboard list view,
  not in core workflows. The UI safely renders without it (displays "N/A" as
  fallback). Existing tabs pick up the new bundle silently via the hourly timer,
  well before the contract-step deploy.

```

The script generates a file like:

```yaml
# api-compatibility/20260821120345-user-fullname-removal.yaml
generation: 3
forces_reload: false
change: "response-required-property-removed GET /api/users"
reason: 'The removed field "full_name" was only used in the admin dashboard list view, not in core workflows. The UI safely renders without it (displays "N/A" as fallback). Existing tabs pick up the new bundle silently via the hourly timer, well before the contract-step deploy.'
```

## Step 6: Run validation again (expect pass)

```bash
bash .github/scripts/ci/validate-compat-files.sh /tmp/oasdiff-report.json api-compatibility
```

**Expected output (success):**

```
[validate-compat-files] Validation passed (11 rule checks)
```

No errors, exit code 0.

## Step 7: Commit and watch CI pass

```bash
git add api-compatibility/
git commit -m "docs: add decision file for user.full_name removal (forces_reload=false)"
git push origin feature/test-api-compat
```

Push to the PR. CI re-runs:

- `heavy_api_schema_diff` still detects the breaking change (`breaking=true`)
- `heavy_api_breaking_change_gate` still waits for approval (or auto-skips if you already approved)
- **NEW**: `heavy_api_compat_notify` **does NOT fire** (because validation passed, job succeeds)
- The workflow completes green

## Step 8: Observe Slack notification on validation failure (optional)

To test the **failure path** (Slack alert when validation fails), temporarily remove or corrupt your decision file:

```bash
rm api-compatibility/20260821120345-user-fullname-removal.yaml
git add api-compatibility/
git commit -m "test: remove decision file to trigger Slack alert"
git push origin feature/test-api-compat
```

CI runs and validation fails. You'll see:

- `heavy_api_schema_diff` job **fails** (validation step returns non-zero exit code)
- `heavy_api_compat_notify` **fires** and posts to Slack #teaching channel:

```
🚨 api-compatibility validation failed

The "API breaking-change check" job failed on this PR - most likely
validate-compat-files.sh rejected a breaking API change because it
isn't covered by a valid decision file. Open the run below to fix it
(see docs/docs/backend/api-compatibility.md).

PR: #<number>
Author: @<your-username>
Action: View Run

[error output in backticks]
```

Restore your decision file and push again to verify it clears.

## Step 9: Clean up

Delete your test branch:

```bash
git checkout main
git branch -D feature/test-api-compat
git push origin --delete feature/test-api-compat
```

## Common errors and fixes

| Error                                                          | Cause                                                          | Fix                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `oasdiff: command not found`                                   | oasdiff not installed                                          | Install: `brew install oasdiff` or download from [oasdiff releases](https://github.com/Tufin/oasdiff/releases) |
| `[validate-compat-files] ERROR: Flagged change not covered...` | Decision file missing or `change:` field doesn't match exactly | Check the error message's exact change string; ensure your decision file's `change:` field matches it verbatim |
| `[validate-compat-files] ERROR: Filename regex mismatch`       | Decision file name is wrong format                             | Use `YYYYMMDDHHMMSS-<slug>.yaml` format (UTC timestamp, no separators, kebab-case slug)                        |
| `[validate-compat-files] ERROR: YAML parsing failed`           | Decision file has invalid YAML syntax                          | Check indentation, quotes, special characters (use `yamllint api-compatibility/<filename>.yaml`)               |
| `[validate-compat-files] ERROR: Stale change string`           | Decision file references a change oasdiff didn't detect        | Check oasdiff output; ensure the `change:` field exactly matches what was found                                |

## Reference: decision file schema

All decision files must have:

```yaml
generation: <positive integer>
forces_reload: <true or false>
change: "<exact oasdiff change ID> <HTTP method> <path>"
reason: "<non-empty explanation for audit trail>"
```

- **`generation`**: assigned by `new_compat_decision.py`; auto-increments; on `forces_reload: true` files, must be globally unique (CI enforces this).
- **`forces_reload`**: human's judgement call — does a stale tab **need** to force-reload, or is the background update sufficient?
- **`change`**: copied verbatim from oasdiff output or CI log; no typos or rewording.
- **`reason`**: compliance artefact — explains the reasoning, not just the outcome.

Once merged to `main`, the `generation`, `forces_reload`, and `change` fields become immutable (for audit trail integrity). The `reason` field may be edited later via another PR if needed.
