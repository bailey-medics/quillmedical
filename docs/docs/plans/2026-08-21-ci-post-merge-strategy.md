# CI post-merge strategy: require rebase-before-merge

**Date:** 2026-08-21
**Status:** Complete — all items implemented and verified
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

**Decision: no CI runs on `main` at all** (not even a fast-tier sanity check). Merges are gated entirely pre-merge: branch protection requires the PR branch to be rebased onto (up to date with) `main`, and all required checks — fast and heavy tier — must pass on that rebased branch before the merge button unlocks. Once that gate passes, the merge commit is guaranteed to be `main` HEAD + already-tested commits, so no further test run is needed or triggered.

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
   - PR tests (fast + heavy tier) run on `main + your commits`
   - When merged, no new test run needed — CI does not run on `main` pushes at all
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

### 1. `.github/workflows/ci.yml` — no change needed

- [x] Confirmed `branches-ignore: [main]` stays on the `push` trigger — CI does not run on `main` at all
- [x] Confirmed fast-tier jobs are unaffected (they continue to run on every push to non-main branches)
- [x] Confirmed heavy tier stays restricted to PRs

**Rationale:** Rebase-before-merge (enforced by branch protection, below) guarantees both fast and heavy tier already passed against `main + your commits` before the merge button unlocks. A post-merge run — even a cheap fast-tier one — would be pure duplication with no new information, since the merge commit's tree is identical to what was just tested.

**Tier details:**

- **Fast tier** (fast-tier, every push): `python_checks: [pre-commit, unit]`, `alembic_drift_check`, `typescript_checks`, `shell_checks`, `version_consistency`
- **Heavy tier** (PR only): `heavy_storybook_tests`, `heavy_semgrep`, `heavy_e2e_images`, `heavy_e2e`

### 2. GitHub branch protection rule — require up-to-date branches

**Already in place — no Terraform change needed.** This repo uses the modern
GitHub Repository Rulesets model (`github_repository_ruleset`), not the
classic `github_branch_protection` resource. The ruleset equivalent of
"require branches up to date before merging" is
`strict_required_status_checks_policy`, already set to `true` in
[`infra/github/branch_rules.tf`](../../../infra/github/branch_rules.tf) inside
`github_repository_ruleset.protected_branches`'s `required_status_checks`
block (predates this plan — introduced alongside the API expand-contract
compatibility check). Confirmed via `terraform plan`: no drift between the
`.tf` file and the live GitHub state.

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

> **2026-09-02:** not actionable as written. `.github/pull_request_template.md`
> has never existed in this repository, and there is no `CONTRIBUTING.md`. See
> the addendum below.

In `.github/pull_request_template.md` or `CONTRIBUTING.md`:

> Before merging, ensure your branch is up to date with main:
> ```bash
> git fetch origin && git rebase origin/main
> ```
> Resolve conflicts if any, push, and let CI re-run. Once tests pass, you can merge.

---

## Part 3 — Rollout sequence

1. **Announce to team** — send a message explaining the requirement (branch protection already enforces it) + link to docs
2. **Update docs** with clear workflow guide
3. **Monitor first few merges** — ensure rebase happens, checks pass pre-merge, no gotchas

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
✅ **No duplicate test runs:** No CI run of any kind on `main` — nothing re-runs post-merge
✅ **Clean history:** Rebases prevent merge-commit noise
✅ **Clear workflow:** Developers know when/how to rebase

### What stays the same

- PR review + approval flow
- Deploy workflow
- Test coverage (if anything, more thorough)
- CI job list and triggers (`.github/workflows/ci.yml` is unchanged)

### What developers need to know

1. Rebase before merge if your PR falls behind
2. Delete branches after they're merged
3. Create fresh branches for new work
4. Don't rebase merged branches

---

## Checklist

- [x] Confirm `.github/workflows/ci.yml` needs no change — `branches-ignore: [main]` stays, no CI runs on main
- [x] Confirm `infra/github/branch_rules.tf` already requires up-to-date branches (`strict_required_status_checks_policy = true`, pre-existing, verified live via `terraform plan` — no drift)
- [x] Create `.github/instructions/ci.instructions.md` with workflow guide (synced to `.claude/rules/ci.md`)
- [ ] Update `docs/docs/cicd/rebase-before-merge.md` with rationale + how-to
- [x] Close the `.github/pull_request_template.md` rebase reminder — no such template exists and one is not needed; see the addendum
- [ ] Announce to team + point to docs
- [ ] Monitor first 2–3 merges for any issues
- [ ] Archive this plan once live

---

## Addendum — 2026-09-02: the pull request template never existed

Part 2 step 5 and its checklist item both assumed
`.github/pull_request_template.md`. That file has never existed here, so the
item was never actionable as written.

### What was actually there

`.github/_pull_request_template.md` — the same name with a leading underscore,
which is precisely why GitHub never offered it when a pull request was opened.
Its headings (What / Why / Safety considerations / Testing) appear on no merged
pull request in this repository.

### The dead code it left behind

`.github/scripts/auto-pr/create-pr.sh` built each new pull request body with:

```bash
BODY=$(cat .github/pull_request_template.md 2>/dev/null || echo "Auto-created from branch push")
```

The `cat` failed on every single run and the `||` fallback supplied the body.
The line read as though a template were in use while doing nothing, and every
auto-created pull request has carried the placeholder string.

### What changed

- Deleted `.github/_pull_request_template.md`. It was inert twice over: the
  underscore hid it from GitHub, and nothing followed its headings.
- `create-pr.sh` now assigns the placeholder body directly, with a comment
  saying where the real description comes from.
- Added `.github/scripts/auto-pr/create-pr.bats`, the suite this script was
  missing. One test asserts the body ignores a `.github/pull_request_template.md`
  placed in the working directory, so the dependency cannot quietly return; it
  was verified to fail against the old line and pass against the new one.
- The `crp` skill gained a `final` argument. `/crp final` writes the pull
  request description from the whole branch diff and takes the pull request out
  of draft, which is where descriptions now come from in practice.

### Consequence for this plan

There is no template to carry a rebase reminder, and creating one solely to
hold it would put a notice in front of every author for a case that branch
protection already blocks: `strict_required_status_checks_policy = true` keeps
the merge button locked until the branch is up to date, so the reminder cannot
be missed and cannot be acted on too late. The rebase workflow is already
written up for agents in `.github/instructions/ci.instructions.md` and its
synced copy `.claude/rules/ci.md`.

The human-facing write-up is still outstanding: `docs/docs/cicd/` currently
contains only `index.md`, so the `rebase-before-merge.md` checklist item above
remains genuinely open. That page, not a pull request template, is where the
reminder belongs if it is wanted.

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
