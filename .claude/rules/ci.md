---
paths:
  - ".github/**"
---

# CI + Merge Strategy

## The rule: Rebase before merge, not after

**When to rebase:**

- Your PR is behind main (update button appears on GitHub)
- You want your PR to test against the latest main
- **Before** the PR is merged

**How to rebase before merge:**

```bash
git fetch origin
git checkout your-feature-branch
git rebase origin/main
# Fix any conflicts
git push origin your-feature-branch --force-with-lease
```

Then the PR tests re-run against the rebased code. Once the PR passes, merge it normally.

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

1. **All tests run in the PR context** — fast tier on every push (catch regressions), heavy tier on non-draft PRs (integration testing)
2. **No CI on `main`** — branch protection requires the PR to be rebased onto (up to date with) main and all checks green before the merge button unlocks, so the merge commit is already fully tested and no post-merge run is needed
3. **Clean history** — rebases prevent merge-commit proliferation; history stays linear
4. **No rebase-after-merge surprise** — developers delete old branches, never encounter the trap
