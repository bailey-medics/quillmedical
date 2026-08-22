# CI post-merge strategy: require rebase-before-merge

**Date:** 2026-08-21
**Status:** Planning
**Scope:** `.github/workflows/ci.yml` and branch protection rules
**Problem:** CI only runs on PRs (non-draft, targeting main). After merge, no tests re-run against the merge commit — silent integration bugs can slip through to deploy.

---

## Problem

### Current state

The CI workflow is configured to ignore pushes to main:

```yaml
on:
  push:
    branches-ignore:
      - main # ← Fast tier doesn't run on merge commits
  pull_request:
    types: [ready_for_review, synchronize]
    branches: [main] # ← Only on PRs, not after merge
```

**Result:** A PR passes all tests, gets merged, but no tests re-run on the merge commit. Hidden incompatibilities can reach deploy:

- New main commit (e.g., API change) lands after your PR was created
- Your PR's code silently conflicts with that change (no merge conflict — different files)
- PR tests pass against stale main
- Merge happens
- New integration + merge = untested combination
- Deploys before anyone notices

### Why we can't just "run tests after merge"

Running heavy E2E tests post-merge is expensive (15–20 min per merge). We could do it, but it's wasteful: if all tests passed in the PR (which ran minutes earlier on nearly identical code), running them again is just duplicating effort. **The real fix is to guarantee the PR tests run against the actual final merge state.**

### Why rebasing solves this

If a PR is **rebased onto main before merge**, the PR tests run against `main + your commits`. Any incompatibilities surface during that rebase + test run. The merge then has the guarantee: "this code was tested against the exact version of main it's merging into."

---

## Solution: Require rebase before merge

### Strategy

1. **GitHub branch protection rule:** Require branches to be up to date with main before merging
   - Automatically blocks the merge button if the PR is behind
   - Forces a rebase or merge-commit to catch up
   - We'll enforce **rebase** (not merge commit) via CODEOWNERS / developer docs

2. **Developer workflow:** Clear, repeatable process to avoid the "rebase-after-merge" trap
   - Key insight: Never rebase after a PR is merged
   - Once merged, delete the old branch
   - For follow-on work, create a fresh branch from updated main

3. **CI benefit:** All test combinations guaranteed
   - PR tests run on `main + your commits`
   - When merged, no new test run needed
   - Merge commit is atomic with already-tested code

---

## Part 1 — Problem deep-dive

### The rebase-after-merge trap (what we've hit twice)

A PR contains work on `feature/foo` that gets **merged to main**. Later, someone updates their local `feature/foo` and tries to rebase it:

```bash
git checkout feature/foo
git rebase main
# ↑ git sees "your commits are already on main" and strips them as duplicates
# Result: feature/foo history rewinds to main HEAD, all work vanishes
```

**This has happened twice in this repo.** Both times, the commits were safe in the reflog and we recovered them. But it's a footgun.

**Why it happens:** Git's rebase algorithm is designed for branches _not yet merged_. It removes commits that already exist on the target branch to avoid duplication. Once a branch is merged, rebasing it again looks like "apply your already-merged commits again" → git sees they're redundant and removes them.

### The fix: Never rebase after merge

Once a PR is merged:

1. ✅ **Delete** the local feature branch (`git branch -d feature/foo`)
2. ✅ **For follow-on work**, create a **new** branch from updated main
3. ❌ **Never** rebase the old branch again

### Developer education is critical

The safest CI strategy is only as good as developers understand when to rebase and when not to. This plan includes clear, enforced workflow docs.

---

## Part 2 — What we'll do

### 1. Update `.github/workflows/ci.yml` — allow main pushes (fast tier only)

- [x] Remove `branches-ignore: [main]` from the `push` trigger
- [x] Ensure fast-tier jobs run on main pushes (pre-commit, unit tests, Alembic drift check, shell checks, version consistency)
- [x] Keep heavy tier restricted to PRs (they're expensive; rebase-before-merge guarantees testing before merge)

**Rationale:** After merge, fast tier provides a sanity check (no new linting errors, no broken imports). Heavy tier already ran on the PR. This is cheap insurance, not duplication.

**Tier details:**

- **Fast tier** (fast-tier, every push): `python_checks: [pre-commit, unit]`, `alembic_drift_check`, `typescript_checks`, `shell_checks`, `version_consistency`
- **Heavy tier** (PR only): `heavy_storybook_tests`, `heavy_semgrep`, `heavy_e2e_images`, `heavy_e2e`

### 2. Configure GitHub branch protection rule — require up-to-date branches

In `infra/github/branch_rules.tf`:

```hcl
# Branch protection rule for 'main'
resource "github_branch_protection" "main" {
  repository_id            = github_repository.quillmedical.name
  pattern                  = "main"
  require_status_checks    = true
  require_branches_up_to_date_before_merge = true  # ← New

  required_status_checks = [
    "Python pre-commit",
    "Python unit tests",
    "Alembic autogenerate drift check",
    # ... existing checks
  ]

  dismiss_stale_reviews           = false
  require_code_owner_reviews      = false  # Adjust per policy
  require_conversation_resolution = true
}
```

**Effect:** If a PR is behind main when someone tries to merge, GitHub disables the merge button and shows: "This branch is behind the base branch. Update it to compare and merge."

### 3. Document the developer workflow — `backend.instructions.md` + community guide

Add to `.github/instructions/ci.instructions.md` (new, scoped to `.github/**`):

````markdown
## CI + Merge Strategy

### The rule: Rebase before merge, not after

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
````

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

### The "rebase-after-merge trap"

A merged feature branch should never be rebased again. If you try to `git rebase main` on a branch already on main, git will remove your commits as "already applied", and you lose your work (it's safe in the reflog, but it's a gotcha).

**Solution:** Always delete merged branches locally and create fresh ones for new work.

### Why this works

1. **All tests run in the PR context** — fast tier on every push (catch regressions), heavy tier on PRs (integration testing)
2. **No duplication post-merge** — the merge commit inherits the test status of the rebased PR
3. **Clean history** — rebases prevent merge-commit proliferation; history stays linear
4. **No rebase-after-merge surprise** — developers delete old branches, never encounter the trap

````

### 4. Add to repo docs (site/docs/cicd/ or similar)

Create `docs/docs/cicd/rebase-before-merge.md`:

- High-level explanation of the strategy
- Developer quick-start (when/how to rebase)
- Why we require rebase (testing guarantee)
- The rebase-after-merge trap and how we avoid it
- Troubleshooting (if you accidentally hit the trap)

### 5. Update PR template and community guidelines

In `.github/pull_request_template.md` or `CONTRIBUTING.md`:

> Before merging, ensure your branch is up to date with main:
> ```bash
> git fetch origin && git rebase origin/main
> ```
> Resolve conflicts if any, push, and let CI re-run. Once tests pass, you can merge.

---

## Part 3 — Rollout sequence

1. **Update CI workflow** to allow main pushes (10 min, low risk)
2. **Apply branch protection rule** via Terraform (5 min)
3. **Announce to team** — send a message explaining the new requirement + link to docs
4. **Update docs** with clear workflow guide
5. **Monitor first few merges** — ensure rebase happens, tests re-run, no gotchas

---

## Part 4 — Safety notes

### No history loss

- Rebase rewrites local history, not server history (use `--force-with-lease` to prevent accidents)
- The reflog keeps every commit, even if rebased
- Once merged, the commit exists on main permanently

### Conflict resolution

If rebase hits conflicts:
```bash
git rebase main
# Resolve conflicts in your editor
git add .
git rebase --continue
````

GitHub's conflict UI can also help for simple cases.

### Merge button behavior

Once the branch is rebased and up to date:

- GitHub enables the merge button
- Merge creates a merge commit (or is squashed, depending on repo settings)
- The merge is atomic: all your commits + the merge commit

---

## Part 5 — Expected outcomes

### What improves

✅ **Testing guarantee:** All code combinations tested before merge
✅ **No silent incompatibilities:** Rebase-before-merge forces detection
✅ **No duplicate test runs:** Heavy tier doesn't re-run post-merge
✅ **Clean history:** Rebases prevent merge-commit noise
✅ **Clear workflow:** Developers know when/how to rebase

### What stays the same

- PR review + approval flow
- Deploy workflow
- Test coverage (if anything, more thorough)
- CI job list (just running on different triggers)

### What developers need to know

1. Rebase before merge if your PR falls behind
2. Delete branches after they're merged
3. Create fresh branches for new work
4. Don't rebase merged branches

---

## Checklist

- [ ] Remove `branches-ignore: [main]` from `.github/workflows/ci.yml`
- [ ] Verify fast-tier jobs will run on main pushes
- [ ] Update `infra/github/branch_rules.tf` to require up-to-date branches
- [ ] Apply Terraform changes
- [ ] Create `.github/instructions/ci.instructions.md` with workflow guide
- [ ] Update `docs/docs/cicd/rebase-before-merge.md` with rationale + how-to
- [ ] Update `.github/pull_request_template.md` with rebase reminder
- [ ] Announce to team + point to docs
- [ ] Monitor first 2–3 merges for any issues
- [ ] Archive this plan once live

---

## Alternative approaches considered

### Option A: Run full CI after merge

- Pros: Catches all bugs
- Cons: Wasteful (15–20 min per merge), duplicates PR testing, no incentive to rebase before merge
- Status: ❌ Not chosen

### Option B: Rely on pre-commit only, no branch protection

- Pros: Simpler
- Cons: Doesn't catch integration bugs, developers can merge behind without testing
- Status: ❌ Not chosen

### Option C: This plan (require rebase)

- Pros: Tests run once in PR, no duplication, clean history, forces best practice
- Cons: Requires discipline from developers, rebase-after-merge is a gotcha
- Mitigation: Clear docs, branch protection rule, team training
- Status: ✅ Chosen
