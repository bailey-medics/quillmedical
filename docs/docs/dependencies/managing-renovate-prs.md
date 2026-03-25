# Managing Renovate PRs

A practical guide for reviewing, merging, and troubleshooting the
dependency update PRs that Renovate creates each Wednesday.

For background on tiering and policies, see
[Automatic updates](automatic-updates.md).

## How Renovate PRs arrive

Renovate runs on a **Wednesday schedule** and opens PRs against `main`.
After every merge to `main` it also re-evaluates open PRs — rebasing
them or regenerating lock files as needed. This is normal and expected.

Vulnerability alert PRs bypass the schedule and appear immediately.
Tier 1 and Tier 2 alerts target `clinical-live` as `hotfix/sec-*`
branches; Tier 3 alerts target `main`.

## Triage workflow

### 1. Check CI status

Every Renovate PR runs through the same branch CI pipeline as feature
work. Start by filtering the PR list:

- **CI passing** → safe to review and merge
- **CI failing** → investigate before merging (see
  [Troubleshooting](#troubleshooting) below)

### 2. Identify the tier

| Label                                                    | Tier                    | Merge policy                                                      |
| -------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| `tier-1-clinical`                                        | Tier 1 — Clinical       | Never automerge. Safety review required.                          |
| _(no tier label)_ + infrastructure package               | Tier 2 — Infrastructure | No automerge. Code review required.                               |
| devDependency / `@types/*` / GitHub Actions / pre-commit | Tier 3 — Tooling        | Automerge on CI pass. Merge manually if automerge is not enabled. |
| `major-version-bump`                                     | Any tier                | Extra caution — check changelogs for breaking changes.            |

### 3. Review the diff

For minor and patch updates the diff is usually just `package.json`,
`yarn.lock`, `poetry.lock`, or `pyproject.toml`. For major updates:

- Read the upstream changelog (linked in the PR body by Renovate)
- Check for breaking changes, deprecated APIs, or new peer dependencies
- Look for migration guides

### 4. Merge order

When multiple Renovate PRs are open, merge in this order:

1. **Backend-only PRs** (Poetry / pytest / pre-commit) — no frontend
   lockfile interaction
2. **Tier 3 tooling** (eslint plugins, type definitions, devDeps) — low
   risk, quick wins
3. **Grouped minor/patch** (the weekly `npm-pip-weekly` PR) — broadest
   but lowest risk per package
4. **Infrastructure** (FastAPI, Mantine, React, Docker images) — review
   changelogs
5. **Major version bumps** — one at a time, verify locally if needed

After each merge, Renovate rebases the remaining PRs. Wait for CI to
re-run before merging the next one.

## Handling major version bumps

Major bumps (labelled `major-version-bump`) often require code changes.

1. Check out the Renovate branch locally:

   ```bash
   git fetch origin
   git checkout renovate/<branch-name>
   ```

2. Run the project and tests:

   ```bash
   cd frontend && yarn install && yarn typecheck:all && yarn unit-test:run
   cd ../backend && poetry install && poetry run pytest -q
   ```

3. Fix any breakages, commit to the Renovate branch, and push. CI will
   re-run on the PR.

4. If multiple major bumps are interdependent (e.g. Vite 8 +
   `@vitejs/plugin-react` v6 + `vite-tsconfig-paths` v6), merge them
   in dependency order or ask Renovate to group them by adding a
   `packageRules` entry in `renovate.json`.

## Hotfix PRs (vulnerability alerts)

Tier 1 and Tier 2 vulnerability alerts create `hotfix/sec-*` branches
targeting `clinical-live`.

1. Review the security advisory linked in the PR
2. Verify CI passes
3. Get the required approval (clinical-live requires 1 reviewer)
4. Merge to `clinical-live`
5. The hotfix back-merge workflow automatically creates a PR to bring
   the fix into `main`

## Troubleshooting

### `yarn install --immutable` fails

**Cause**: Renovate regenerated `yarn.lock` with a different Yarn
version than the project expects.

**Fix**: Ensure `"packageManager": "yarn@<version>"` is set in
`frontend/package.json`. This tells both Corepack and Renovate which
exact Yarn binary to use. After merging the fix to `main`, Renovate
rebases its branches and regenerates lock files correctly.

### Peer dependency warnings

Warnings like `YN0086: Some peer dependencies are incorrectly met` are
usually harmless unless they cause `--immutable` to fail. If they do,
add a `resolutions` entry to `frontend/package.json` to pin the
conflicting package.

### All frontend PRs fail CI simultaneously

This usually means something changed on `main` that breaks the lockfile
(e.g. a new dependency was added without committing `yarn.lock`). Fix
`main` first — Renovate will rebase automatically.

### Renovate recreates a closed PR

Renovate reopens or recreates PRs unless you tell it not to. To
permanently ignore an update, add a comment on the PR:

```text
@renovate ignore this dependency
```

Or to ignore just this major version:

```text
@renovate ignore this major version
```

## Slack notifications

When a Renovate PR fails CI, the Slack notification shows:

- **Title**: `Renovate TypeScript <task> checks failed` (instead of
  `Feature`)
- **Icon**: Renovate bot avatar (for legacy incoming webhooks)

This helps distinguish dependency failures from feature work at a glance.
