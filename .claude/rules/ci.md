---
paths:
  - ".github/**"
---

# CI + Merge Strategy

## The rule: use the merge queue, don't rebase-and-wait manually

Once a PR is approved and its own checks are green, add it to the merge
queue (the "Merge when ready" button, or Renovate's `platformAutomerge` for
PRs configured to automerge). GitHub then builds a temporary merge-group ref
combining the PR with the current tip of `main`, re-runs the required checks
in `ci.yml` against that ref, and merges automatically once green.

No manual rebase, no manual force-push, no waiting around to click merge
the moment CI goes green — the queue does the "test against latest main"
step that used to require rebasing by hand, and it does it for every queued
PR in turn without you babysitting each one.

**Batching is disabled** (`infra/github/branch_rules.tf`,
`merge_queue.max_entries_to_merge = 1`): PRs are tested and merged one at a
time, not grouped together. A PR that fails its queue re-check is dequeued
on its own — the next PR in the queue carries on unaffected.

**What doesn't re-run in the queue:** the two human-approval gates (API
breaking-change review, DB destructive migration review) are required on
the PR itself — a PR can't enter the queue without them already passing —
but they don't re-run against the merge-group ref. Their detection needs
real PR context a merge-group ref doesn't have, and re-asking for approval
on every queue entry would defeat the point of approving once. They report
`skipped` there instead (which counts as passing, same as everywhere else
in `gate-breaking.yml`). See that workflow's `merge_group` trigger comment
for the full reasoning and its one known scope limit: a breaking
interaction between two queued PRs, neither breaking alone, isn't caught by
these two checks specifically — the other required checks (unit tests,
E2E) still verify the combined functional behaviour of the merge-group ref.

## When you still need to rebase manually

The queue can't resolve real content conflicts for you.

```bash
git fetch origin
git checkout your-feature-branch
git rebase origin/main
# Fix any conflicts
git push origin your-feature-branch --force-with-lease
```

Only needed when GitHub reports an actual merge conflict — not just "behind
main," which the queue handles for you.

**When NOT to rebase:**

- After your PR is merged to main
- When checking out an old merged feature branch

**After merge, delete the branch:**

```bash
git branch -d your-feature-branch
```

**For follow-on work, create a fresh branch from main:**

```bash
git checkout main
git pull origin main
git checkout -b new-feature-branch
```

## The "rebase-after-merge trap"

A merged feature branch should never be rebased again. If you try to `git rebase main` on a branch already on main, git will remove your commits as "already applied", and you lose your work (it's safe in the reflog, but it's a gotcha).

**Solution:** Always delete merged branches locally and create fresh ones for new work.

## Why this works

1. **All tests run in the PR context, and again in the queue** — fast tier on every push, heavy tier on non-draft PRs, and both tiers again against the merge-group ref before the actual merge — so a PR is always tested against current main without anyone force-pushing a rebase.
2. **History** — the queue merges with a merge commit, the same way this repo already merges. Note the graph is less linear than the old flow produced: rebasing a PR up to date before merging put its merge commit in a straight line, whereas the queue tests on a temporary ref instead of rebasing the branch, leaving real branch-and-merge diamonds. Switch `merge_method` in `infra/github/branch_rules.tf` to `REBASE` or `SQUASH` if linear history matters more than matching the current merge button.
3. **No rebase-after-merge surprise** — developers delete old branches, never encounter the trap.
4. **Failures don't block the queue** — batching is off, so one PR's failure only dequeues that PR; everything behind it keeps moving.
