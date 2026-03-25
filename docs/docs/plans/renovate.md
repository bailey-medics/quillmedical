# Automatic package updates plan

I want to set up automated dependency management for this repository. The stack is:

- Python/FastAPI backend (Poetry for dependency management)
- TypeScript/React frontend (Yarn 4 for dependency management)
- Docker (Dockerfiles with pinned base images, Docker Compose services)
- Terraform infrastructure code (GCP providers)
- GitHub Actions (8 workflows with pinned action versions)
- Pre-commit hooks (ruff, black, bandit, cspell, mypy)
- Hosted on GitHub

## Task 0: Pin Docker images to specific versions

Before enabling automated monitoring, pin all `:latest` Docker images to explicit
versions so that builds are reproducible, auditable (DCB 0129), and Renovate can
propose version bumps. Update the following in `compose.dev.yml` and
`compose.prod.fhir-openehr.yml`:

- `hapiproject/hapi:latest` → `hapiproject/hapi:v8.8.0-1`
- `ehrbase/ehrbase:latest` → `ehrbase/ehrbase:2.30.0`

Check the actual latest stable versions at the time of implementation. The Dockerfiles
already pin base images with SHA digests (good practice) — this brings the Compose
services in line.

## Task 1: Enable Dependabot Alerts

Create a `.github/dependabot.yml` file that:

- Enables version monitoring for pip (Python/Poetry), npm (TypeScript/React via Yarn),
  docker (base images in Dockerfiles and Compose services), terraform, and
  github-actions (pinned action versions across 8 workflows)
- Does NOT enable Dependabot auto-update PRs (we are using Renovate for that)
- Targets both `main` (integration) and `clinical-live` (production) branches, so
  vulnerability alerts cover what's in development and what's deployed

## Task 2: Configure Renovate

Create a `renovate.json` in the repo root that:

- Extends `config:recommended`
- Sets timezone to `Europe/London`
- Schedules routine updates for every Wednesday
- Sets stabilityDays to 3
- Groups all non-major npm and pip (Poetry) updates into a single weekly PR
- Groups all TypeScript `@types/*` packages together, with automerge on CI pass
- Groups all devDependencies (minor/patch) together, with automerge on CI pass
- Groups GitHub Actions version bumps together, with automerge on CI pass
- Updates pre-commit hook versions (Renovate supports this; Dependabot does not)
- Handles Terraform provider updates separately, no automerge, requires manual review
- Sets automerge to false for all production dependency updates
- Adds a label `dependencies` to all Renovate PRs
- Adds a label `security` to all vulnerability alert PRs

## Task 3: Vulnerability Alert Branching Strategy

Configure vulnerability alerts in renovate.json so that:

- Vulnerability alerts bypass the Wednesday schedule and fire immediately at any time
- Vulnerability alert PRs target `clinical-live` directly (not `main`), using branchPrefix `hotfix/sec-`
- Vulnerability alert PRs are labelled with both `security` and `hotfix`
- Automerge is always false for vulnerability alert PRs regardless of tier

## Task 4: Dependency Tiering

Add a comment block at the top of renovate.json explaining the tiering strategy, and
implement it with packageRules:

Tier 1 — Clinical (fhirclient for HAPI FHIR, httpx for EHRbase via direct HTTP):

- No automerge under any circumstances
- Label PRs with `tier-1-clinical`
- Vulnerability alerts fire immediately, target `clinical-live` as a hotfix branch

Tier 2 — Infrastructure (FastAPI, SQLAlchemy, Uvicorn, Pydantic, Alembic, GCP SDKs, Mantine, React, React Router):

- No automerge, code review required
- Major version bumps labelled `major-version-bump`
- Vulnerability alerts fire immediately, target `clinical-live` as a hotfix branch

Tier 3 — Tooling (eslint, @types/\*, pytest, devDependencies, GitHub Actions,
pre-commit hooks):

- Automerge on CI pass permitted
- Vulnerability alerts still bypass schedule and fire immediately, but target `main`
  not `clinical-live` (tooling vulnerabilities do not require a hotfix release)

## Task 5: Severity-Based Response Policy

Add a JSON comment block to renovate.json documenting the following response tiering
policy for security alerts, so it is visible in the codebase as an auditable record:

- Critical/High in Tier 1 or Tier 2: hotfix branch off clinical-live within 24-48hrs,
  safety assessment required before merge
- Medium in Tier 2: next available working day, include in next release if imminent
- Low severity or any Tier 3: pick up in next scheduled Wednesday Renovate run,
  no hotfix required

## Task 6: Hotfix Back-Merge PR

After a hotfix is merged into `clinical-live`, `main` must be updated to include
the fix so it is not lost when the next release is cut. Create a GitHub Actions workflow
file at `.github/workflows/hotfix-backmerge.yml` that:

- Triggers on any push to `clinical-live` where the source branch matches `hotfix/*`
- Automatically creates a PR merging `clinical-live` → `main`
- PR title: "Back-merge: [hotfix branch name] → main"
- Labels the PR with `hotfix` and `back-merge`
- Assigns the PR to the repo owner
- PR body should explain this is an automated back-merge to keep `main` in sync
  after a hotfix was applied to `clinical-live`, and remind the reviewer to check
  for merge conflicts
- If there are merge conflicts, the PR is still created but marked as draft, and a
  comment is added explaining that manual conflict resolution is needed
- Do NOT automerge — a human must review and approve

## Task 7: Renovate Notifications

Configure Renovate to notify via GitHub for:

- Any vulnerability alert PRs raised outside the normal schedule
- Any major version bump PRs
  Note: Renovate does not send emails directly. After generating these files, explain
  what manual steps are needed to ensure info@quill-medical.com receives GitHub
  notifications for security and major-version-bump labelled PRs.

### Task 8: Docs

In `docs/docs/dependencies/automatic-updates.md`, write about what how we have setup for automated dependency checking. make sure to add an `index.md` file in the same folder with url to the new page

## Additional requirements

- All generated files should include a header comment explaining their purpose and
  referencing this tiering strategy, so they are self-documenting for DCB 0129
  clinical safety audit purposes
- Please list any manual GitHub repository settings I need to enable after these
  files are committed (e.g. Dependabot alerts, branch protection rules, notification
  routing)
