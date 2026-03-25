# Automatic dependency updates

This document describes the automated dependency management setup for Quill Medical.
It is an auditable record for DCB 0129 clinical safety purposes.

## Overview

Two complementary tools work together:

| Tool           | Role                                               |
| -------------- | -------------------------------------------------- |
| **Dependabot** | Vulnerability _alerts_ only — no automated PRs     |
| **Renovate**   | Automated version-bump PRs on a Wednesday schedule |

Renovate is preferred for PRs because it supports Yarn 4, Poetry, pre-commit hooks, and Terraform — ecosystems that Dependabot does not handle uniformly. Dependabot is retained for its native GitHub vulnerability alert integration, which surfaces CVEs in the GitHub Security tab.

## Dependabot alerts

Configured in `.github/dependabot.yml`.

Dependabot monitors the following ecosystems for known vulnerabilities:

| Ecosystem               | Directory   | Branch targets          |
| ----------------------- | ----------- | ----------------------- |
| pip (Python / Poetry)   | `/backend`  | `main`, `clinical-live` |
| npm (TypeScript / Yarn) | `/frontend` | `main`, `clinical-live` |
| Docker                  | `/`         | `main`, `clinical-live` |
| Terraform               | `/infra`    | `main`, `clinical-live` |
| GitHub Actions          | `/`         | `main`, `clinical-live` |

Both `main` (development) and `clinical-live` (production) are monitored so that vulnerability alerts cover what is in development _and_ what is currently deployed to patients.

`open-pull-requests-limit: 0` is set for all ecosystems — Dependabot raises alerts only; Renovate creates the fix PRs.

## Renovate

Configured in `renovate.json` in the repository root.

### Schedule

Routine updates run **every Wednesday** (`Europe/London` timezone) with a **3-day stability window** — a new version must be at least 3 days old before Renovate proposes it.

### Grouping

| Group                           | Behaviour                              |
| ------------------------------- | -------------------------------------- |
| All non-major npm + pip updates | Single weekly PR                       |
| `@types/*` packages             | Grouped PR, automerge on CI pass       |
| devDependencies (minor/patch)   | Grouped PR, automerge on CI pass       |
| GitHub Actions                  | Grouped PR, automerge on CI pass       |
| pre-commit hooks                | Grouped PR, automerge on CI pass       |
| Terraform providers             | Separate PR per provider, no automerge |

### Labels

All Renovate PRs receive the `dependencies` label. Vulnerability alert PRs also receive `security`. See tiering below for additional labels.

## Dependency tiering

### Tier 1 — Clinical

Packages: **fhirclient** (HAPI FHIR), **httpx** (EHRbase via direct HTTP)

- **No automerge under any circumstances.**
- PRs labelled `tier-1-clinical`.
- Vulnerability alerts bypass the Wednesday schedule and fire immediately.
- Vulnerability alert PRs target `clinical-live` directly with branch prefix `hotfix/sec-`, labelled `security` + `hotfix`.

### Tier 2 — Infrastructure

Packages: FastAPI, SQLAlchemy, Uvicorn, Pydantic, Alembic, GCP SDKs, Mantine, React, React Router

- **No automerge**; code review required.
- Major version bumps labelled `major-version-bump`.
- Vulnerability alerts bypass schedule and fire immediately.
- Vulnerability alert PRs target `clinical-live` as a hotfix branch.

### Tier 3 — Tooling

Packages: eslint, `@types/*`, pytest, devDependencies, GitHub Actions, pre-commit hooks

- **Automerge on CI pass permitted** for routine updates.
- Vulnerability alerts still bypass the Wednesday schedule and fire immediately, but **target `main`** — tooling vulnerabilities do not require a hotfix release to `clinical-live`.

## Severity-based response policy

| Severity        | Tier             | Action                                                                                       |
| --------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| Critical / High | Tier 1 or Tier 2 | Hotfix branch off `clinical-live` within 24–48 hrs. Safety assessment required before merge. |
| Medium          | Tier 2           | Next available working day. Include in next release if imminent.                             |
| Low             | Any              | Pick up in next scheduled Wednesday Renovate run. No hotfix required.                        |
| Any severity    | Tier 3           | Pick up in next scheduled Wednesday Renovate run. No hotfix required.                        |

## Hotfix back-merge

When a hotfix is merged into `clinical-live`, `main` must be updated to include the fix so it is not lost when the next release is cut.

The workflow `.github/workflows/hotfix-backmerge.yml` handles this automatically:

1. Triggered on any push to `clinical-live` where the commit message references a `hotfix/*` branch.
2. Runs a conflict-detection dry-run merge.
3. Creates a PR merging `clinical-live` → `main`, labelled `hotfix` + `back-merge`, assigned to the repo owner.
4. If merge conflicts are detected, the PR is opened as a **draft** with a comment explaining that manual resolution is required.
5. **No automerge** — a human must review and approve.

## Notifications

Renovate does not send emails directly. To ensure `info@quill-medical.com` receives GitHub notifications for `security` and `major-version-bump` labelled PRs:

### Required manual GitHub repository settings

After committing these files, the following settings must be configured manually:

1. **Enable Dependabot vulnerability alerts**
   - Repository → _Settings_ → _Security & analysis_ → enable **Dependabot alerts** and **Dependabot security updates** (leave security updates off — Renovate handles fix PRs).

2. **Enable the GitHub Security tab**
   - Repository → _Settings_ → _Security & analysis_ → enable **Secret scanning** and **Code scanning** if applicable.

3. **Branch protection rules**
   - `main`: require PR reviews (≥ 1), require status checks to pass, disallow direct push.
   - `clinical-live`: require PR reviews (≥ 2), require status checks to pass, disallow direct push, restrict who can push.

4. **Notification routing for `info@quill-medical.com`**
   - The GitHub account associated with `info@quill-medical.com` should **Watch** this repository (_All activity_ or _Custom — Security alerts_).
   - Alternatively, set up a [GitHub notification email routing rule](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications#filtering-email-notifications) in _Settings_ → _Notifications_ → _Custom routing_.

5. **Renovate GitHub App installation**
   - Install the [Renovate GitHub App](https://github.com/apps/renovate) on the `bailey-medics` organisation and grant it access to this repository.

6. **Labels**
   - Create the following labels in the repository if they do not already exist: `dependencies`, `security`, `hotfix`, `back-merge`, `tier-1-clinical`, `major-version-bump`.
