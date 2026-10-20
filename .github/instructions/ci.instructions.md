---
applyTo: ".github/**"
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

## A stacked pull request: enqueue the stack, or check the base

A stacked pull request's base is the branch below it. Only the bottom of a
stack has `main` as its base. There are two ways to land a stack, and they
behave differently.

- **Enqueueing the stack lands every pull request on `main`.** GitHub's
  stacked pull requests add the whole stack to the merge queue in order,
  and the queue merges them onto `main` one after the other. If one is
  ejected, every pull request above it comes out too. This needs the stack
  registered on GitHub, which `just stack-submit` does ("Stack created on
  GitHub"), and every pull request out of draft. See GitHub's
  [merging stacked pull requests](https://docs.github.com/en/enterprise-cloud@latest/pull-requests/how-tos/merge-and-close-pull-requests/merging-stacked-pull-requests).
- **A pull request's own merge button merges into its base**, whatever the
  stack around it. A pull request merged that way into the branch below is
  not on `main`, and nothing carries it there: on 15 October 2026 #2023
  and #2026 were merged that way and their work sat on a branch until a
  separate pull request carried it over.

So, merging one pull request at a time:

- **Merge only a pull request whose base reads `main`.** The base is shown
  at the top of the pull request, "into `<branch>`".
- **If it reads a `feature/…` branch, do not merge it on its own.** Merge
  the one below first, then run `just stack-sync`, which moves the next
  one onto `main`, and queue it then.
- **Run `just stack-sync` after any part of a stack merges**, before
  merging or building anything more on it. Once the whole stack has
  merged, `just stack-fresh` moves the checkout to `main` instead.
- **A stacked pull request GitHub has closed is not lost.** When the
  branch beneath it is deleted after a merge, GitHub can close the pull
  request above rather than move it to `main`. Its branch and commits are
  still there; `just stack-sync` brings it onto `main` and
  `just stack-submit` opens a fresh pull request for it.

`merged-outside-main.yml` raises the alarm in Slack when a merge lands
somewhere other than `main`. Nothing refuses such a merge. Refusing it
with linear history on feature branches was tried on 16 October 2026 and
blocks every push of a branch cut from `main`; see
`var.block_merges_into_feature_branches` in `infra/github/branch_rules.tf`.

## The "rebase-after-merge trap"

A merged feature branch should never be rebased again. If you try to `git rebase main` on a branch already on main, git will remove your commits as "already applied", and you lose your work (it's safe in the reflog, but it's a gotcha).

**Solution:** Always delete merged branches locally and create fresh ones for new work.

## Why this works

1. **All tests run in the PR context** - fast tier on every push (catch regressions), heavy tier on non-draft PRs (integration testing)
2. **No CI on `main`** - branch protection requires the PR to be rebased onto (up to date with) main and all checks green before the merge button unlocks, so the merge commit is already fully tested and no post-merge run is needed
3. **Clean history** - rebases prevent merge-commit proliferation; history stays linear
4. **No rebase-after-merge surprise** - developers delete old branches, never encounter the trap
