# GitHub

This page documents the GitHub configuration, branch protection rules, and operational learnings for the `bailey-medics` organisation.

## Organisation

| Setting            | Value                 |
| ------------------ | --------------------- |
| Organisation       | `bailey-medics`       |
| Plan               | GitHub Enterprise     |
| Primary repository | `quillmedical`        |
| Data repository    | `quill-question-bank` |

The Enterprise plan is required for **metadata restrictions** (branch naming enforcement via repository rulesets). The Team plan only supports branch naming rules in "evaluate" mode.

## Repositories

### quillmedical

The main application repository containing backend, frontend, infrastructure, and documentation.

### Teaching content repos

Teaching question bank and learning content lives in per-organisation repos (e.g. `eoeeta-teaching`, `respiratory-teaching`). These are cloned into `teaching-repos/` by `just initial-install`.

### Shared teaching pipeline

The validator and the reusable workflow the content repos call live in this repository:
`backend/app/features/teaching/tooling/` and `.github/workflows/teaching-pipeline.yml`.
A content repo's `teaching.yml` delegates to the latter, so the same checks run at the
merge gate and at backend sync.

## Branch strategy

```mermaid
graph LR
    A["feature/*"] -->|PR| B[main]
    C["hotfix/*"] -->|PR| B
    B -->|deploy| D[App]
```

### Branch types

| Branch       | Purpose                           | Deploys to     |
| ------------ | --------------------------------- | -------------- |
| `feature/*`  | New features and non-urgent fixes | CI checks only |
| `hotfix/*`   | Urgent fixes                      | CI checks only |
| `copilot/*`  | AI-generated branches             | CI checks only |
| `renovate/*` | Automated dependency updates      | CI checks only |
| `main`       | Trunk – single protected branch   | App (auto)     |

### Rules

- All development happens on `feature/*`, `hotfix/*`, or `copilot/*` branches
- `main` requires a pull request – never push directly
- Branch names must match `^(feature|hotfix|copilot|renovate|gh-readonly-queue)/.+` (enforced at creation time; `gh-readonly-queue/*` is the merge queue's own prefix)
- Use `hotfix/*` only for urgent production fixes; `feature/*` for everything else

## Branch protection rulesets

Managed by Terraform in `infra/github/`. Four rulesets are defined: two for quillmedical in `branch_rules.tf`, and two organisation rulesets for the teaching content repos in `teaching_rulesets.tf`.

!!! warning "Manual apply required for GitHub rulesets"
The `infra/github/` Terraform is applied by a person, never by CI. Merging `.tf` changes to `main` does not automatically apply them. You must run it locally, from a checkout that is up to date with `main`:

    ```bash
    just terraform-github
    ```

    The GCP infrastructure Terraform (`infra/`) is applied automatically via the Terraform CI workflow.

### Ruleset 1 – Protected branches (quillmedical)

**Targets:** `main`

| Rule                          | Setting                                                |
| ----------------------------- | ------------------------------------------------------ |
| Pull request required         | Yes (0 approvals while solo; increase when team grows) |
| Dismiss stale reviews on push | Yes                                                    |
| Required status checks        | All 18 CI checks (strict – branch must be up-to-date)  |
| Force push                    | Blocked                                                |
| Branch deletion               | Blocked                                                |
| Bypass actors                 | None (applies to admins too)                           |

### Ruleset 2 – Branch naming (quillmedical)

**Targets:** All branches except `main` and the merge queue's own `gh-readonly-queue/*` branches

Pattern: `^(feature|hotfix|copilot|renovate|gh-readonly-queue)/.+` – branches that don't match are rejected at creation time.

### Ruleset 3 – Protected branches (teaching content repos)

**Targets:** `main`

Same PR and force-push rules as quillmedical. The required status checks are `pipeline / validate` and `pipeline / check-protection` (strict).

### Ruleset 4 – Branch naming (teaching content repos)

Same `^(feature|hotfix|copilot|renovate)/.+` pattern as quillmedical.

## Required status checks

All 18 checks must pass before a PR can merge to `main`. The strict policy also requires the branch to be up-to-date with `main`.

### Fast tier (every push)

| Check name                            | What it does                                                         |
| ------------------------------------- | -------------------------------------------------------------------- |
| `Python pre-commit`                   | Pre-commit hooks (ruff, black, mypy, bandit, cspell, YAML/TOML/JSON) |
| `Python unit`                         | pytest (excludes integration and e2e markers)                        |
| `typescript_checks (eslint)`          | ESLint on frontend source                                            |
| `typescript_checks (prettier)`        | Prettier formatting check                                            |
| `typescript_checks (stylelint)`       | CSS/SCSS linting                                                     |
| `typescript_checks (typecheck:all)`   | TypeScript strict mode compilation                                   |
| `typescript_checks (unit-test:run)`   | Vitest unit tests, in three legs                                     |
| `typescript_checks (storybook:build)` | Storybook static build succeeds                                      |
| `Alembic autogenerate drift check`    | Every model change has a migration                                   |

### Heavy tier (ready PRs only)

| Check name                             | What it does                                                 |
| -------------------------------------- | ------------------------------------------------------------ |
| `Storybook interaction tests`          | Storybook interaction tests (Playwright/Chromium), in 3 legs |
| `Semgrep (frontend SAST)`              | Static application security testing                          |
| `E2E (Playwright)`                     | Full-stack end-to-end tests                                  |
| `API breaking-change check`            | Finds a breaking API change (oasdiff)                        |
| `API breaking-change review gate`      | Waits for a human to approve a breaking API change           |
| `DB destructive migration check`       | Finds a newly added destructive migration                    |
| `DB destructive migration review gate` | Waits for a human to approve a destructive migration         |
| `DB migration immutability check`      | A merged migration was not rewritten, deleted or renamed     |
| `Competency catalogue check`           | No competency was deleted from the catalogue                 |

## Pre-commit hooks

Local pre-commit hooks run on every commit (configured in `.pre-commit-config.yaml`). These match what CI runs in the `Python pre-commit` check.

| Hook                    | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| **ruff**                | Python linting (rules: E, F, W, I, UP, B) with auto-fix      |
| **black**               | Python formatting (line-length 79)                           |
| **trailing-whitespace** | Remove trailing whitespace                                   |
| **end-of-file-fixer**   | Ensure files end with a newline                              |
| **check-yaml**          | Validate YAML syntax                                         |
| **check-toml**          | Validate TOML syntax                                         |
| **check-json**          | Validate JSON syntax                                         |
| **cspell**              | Spelling checker (custom dictionary in `cspell.config.json`) |
| **mypy**                | Python static type checking (strict mode)                    |
| **bandit**              | Python security linting                                      |

Frontend lint-staged hooks also run via Husky but only when frontend files are staged.

## Secrets

GitHub Actions secrets are configured per-environment. Never commit tokens or keys.

| Secret                           | Used by                                       |
| -------------------------------- | --------------------------------------------- |
| `GCP_APP_WIF_PROVIDER`           | Workload Identity Federation for app          |
| `GCP_APP_DEPLOY_SERVICE_ACCOUNT` | App deploy service account                    |
| `GCP_APP_PROJECT_ID`             | App GCP project ID                            |
| `GCP_PROD_WIF_PROVIDER`          | WIF for production _(not yet active)_         |
| `GCP_PROD_SERVICE_ACCOUNT`       | Production service account _(not yet active)_ |
| `GCP_PROD_PROJECT_ID`            | Production GCP project ID _(not yet active)_  |

Authentication to GCP uses **Workload Identity Federation** – no long-lived service account keys.

## Learnings

### GitHub Enterprise is required for branch naming enforcement

The Team plan supports repository rulesets but only evaluates metadata restrictions (branch naming patterns) in "evaluate" mode – violations are logged but not blocked. Upgrading to Enterprise enables "active" enforcement, which rejects non-conforming branch names at creation time.

### Terraform rulesets for GitHub are applied by hand

The `infra/github/` Terraform manages GitHub rulesets (branch protection, naming conventions). Its state is remote, beside the GCP state, but unlike the GCP Terraform (which has a CI-driven apply), GitHub ruleset changes must be applied manually after merging, with `just terraform-github`.

### All 11 status checks should be required

Initially only 5 "lean" checks were configured (Python styling, Python unit, eslint, typecheck, unit tests). This was expanded to all 11 checks including prettier, stylelint, storybook build, storybook tests, Semgrep, and E2E because in a healthcare application, bad UX can lead to patient harm – every check catches a different class of issue.

### Auto-PR creation on feature and hotfix push

The `auto-pr.yml` workflow automatically creates a draft PR to `main` when pushing to a `feature/*` or `hotfix/*` branch. The PR title is built from the branch name. This reduces friction and ensures every feature branch has a visible PR for review.

### DCB 0129 clinical safety compliance

The branch protection rules form part of the auditable change-control process required by DCB 0129. They ensure:

- All changes go through pull-request review, creating an approval record
- The naming convention keeps the commit graph traceable for hazard-log and incident-response audits
- Force pushes are blocked on protected branches to preserve history
- No bypass actors are configured, so rules apply to everyone including admins
