# Reduce Renovate-triggered CI reruns plan

Every commit landing on `main` was causing a batch of unrelated open
Renovate PRs to rerun their CI. Confirmed root cause by correlating repo
history:

- `renovate.json` already sets `rebaseWhen: "conflicted"` (not the more
  aggressive `"auto"`/`"behind-base-branch"`).
- Two Renovate PRs merged into `main` at `2026-08-26T13:36:12Z` and
  `13:39:14Z` (`pydantic-settings`, `cryptography` security fixes) — both
  touch `poetry.lock`.
- Within that same window, a batch of **unrelated** open Renovate PRs
  (#286, #289, #307, #326, #334, #335, #337, ...) were all force-pushed by
  Renovate (single-commit branches, `committedDate` bumped in place, no new
  commits added).
- [`ci.yml`](../../../.github/workflows/ci.yml) triggers on `pull_request:
  types: [ready_for_review, synchronize]` — Renovate's force-push fires
  `synchronize`, which reruns CI for every one of those PRs.

So the mechanism is: merging any Renovate PR changes the lockfile → every
other open Renovate PR now conflicts with `main` on that lockfile →
`rebaseWhen: "conflicted"` legitimately triggers a Renovate rebase/force-push
on all of them → CI reruns for PRs that had nothing to do with the merged
change. It's working as configured, but more eagerly than desired — the
intent is for reruns to happen only when a human explicitly updates a PR via
GitHub's "Update branch" button.

No workflow uses `pull_request_target`, and there is no bot/Terraform
automation that force-updates PR branches — Renovate itself is the sole
source of the automatic rebases. Branch protection
([`infra/github/branch_rules.tf`](../../../infra/github/branch_rules.tf))
already sets `strict_required_status_checks_policy = true`, so an
out-of-date PR is already blocked from merging regardless of this change —
switching off auto-rebase doesn't affect mergeability semantics, only who
triggers the rebase.

## Phase 1: Stop Renovate from auto-rebasing

- [ ] Change `rebaseWhen` in [`renovate.json`](../../../renovate.json) from
      `"conflicted"` to `"never"`. Renovate will then never auto-rebase or
      force-push an open PR for any reason — updating a stale/conflicted PR
      becomes an entirely manual action via GitHub's "Update branch" button.

  ```diff
  -  "rebaseWhen": "conflicted",
  +  "rebaseWhen": "never",
  ```

- [ ] Flag the automerge trade-off before merging: Tier 3 packages in
      `renovate.json` have `automerge: true` (devDependencies minor/patch,
      `@types/*`, GitHub Actions, pre-commit hooks). With `rebaseWhen:
      "never"`, if one of those PRs falls behind/conflicts with `main`,
      Renovate will **not** self-heal it — it will sit unmergeable until
      someone clicks "Update branch". Confirmed acceptable — the whole point
      is manual control over when a PR gets rebased.

## Verification

- No code/CI to run for this change — it's a Renovate bot config value.
- After merging, confirm on the next `main` push that already-open Renovate
  PRs' "Checks" tabs do **not** get new workflow runs, and that clicking
  GitHub's "Update branch" on a stale PR still correctly rebases and reruns
  CI as before.
- Optionally watch the Renovate dependency-dashboard issue/logs after the
  next Renovate run to confirm it no longer force-pushes conflicted PRs
  automatically.
