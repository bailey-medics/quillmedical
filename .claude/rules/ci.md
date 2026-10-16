---
paths:
  - ".github/**"
---

# CI + Merge Strategy

## The rule: use the merge queue, don't rebase-and-wait manually

Once a PR is approved and its own checks are green, add it to the merge
queue with the "Merge when ready" button. GitHub then builds a temporary
merge-group ref combining the PR with the current tip of `main`, re-runs the
required checks in `ci.yml` against that ref, and merges automatically once
green.

Nothing merges itself. Renovate PRs included: every group in `renovate.json`
sets `automerge: false`, so a human reviews each one and queues it by hand.

No manual rebase, no manual force-push, no waiting around to click merge
the moment CI goes green - the queue does the "test against latest main"
step that used to require rebasing by hand, and it does it for every queued
PR in turn without you babysitting each one.

**Batching is disabled** (`infra/github/branch_rules.tf`,
`merge_queue.max_entries_to_merge = 1`): PRs are tested and merged one at a
time, not grouped together. A PR that fails its queue re-check is dequeued
on its own - the next PR in the queue carries on unaffected.

**What doesn't re-run in the queue:** the two human-approval gates (API
breaking-change review, DB destructive migration review) are required on
the PR itself - a PR can't enter the queue without them already passing -
but they don't re-run against the merge-group ref. Their detection needs
real PR context a merge-group ref doesn't have, and re-asking for approval
on every queue entry would defeat the point of approving once. They report
`skipped` there instead (which counts as passing, same as everywhere else
in `gate-breaking.yml`). See that workflow's `merge_group` trigger comment
for the full reasoning and its one known scope limit: a breaking
interaction between two queued PRs, neither breaking alone, isn't caught by
these two checks specifically - the other required checks (unit tests,
E2E) still verify the combined functional behaviour of the merge-group ref.

## A stacked pull request: check the base before merging

A stacked pull request's base is the branch below it, and GitHub's merge
button merges into the base. Only the bottom of a stack has `main` as its
base. A pull request merged into the branch below is not on `main`, and
nothing carries it there: on 15 October 2026 #2023 and #2026 were merged
that way and their work sat on a branch until a separate pull request
carried it over.

- **Merge only a pull request whose base reads `main`.** The base is shown
  at the top of the pull request, "into `<branch>`".
- **If it reads a `feature/…` branch, do not merge it.** Merge the one
  below first, then run `just stack-sync`, which moves the next one onto
  `main`, and queue it then.
- **Run `just stack-sync` after any part of a stack merges**, before
  merging or building anything more on it.
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

## Changing anything the queue depends on

The queue is easy to break from a distance, and it fails quietly. Every
failure below reported only as "removed from the merge queue due to failing
Branch Protection rules", or a bare check count, with nothing in the Actions
tab explaining it. All three were hit for real when the queue was first
turned on.

**Every required check needs a `merge_group` trigger.** A check listed in
`required_status_checks` whose workflow doesn't fire on `merge_group` never
reports against the merge-group ref, so the entry waits until
`check_response_timeout_minutes` and is then dropped. There is no way to
mark a check "required on the PR but not in the queue" - GitHub uses one
list for both. So when you add a required check, add the trigger with it.

**Two runs that may cancel each other must be doing the same work.** A
cancelled required check reads as a *failure*, not as "did not run", so any
`cancel-in-progress` group holding two different kinds of run will block a
pull request that has nothing wrong with it. `ci.yml` keys its group by
`github.event_name` **and** `github.event.action` as well as `github.ref`,
and excludes `gh-readonly-queue/**` from its push trigger. This was arrived
at twice, from the same failure:

- **`push` versus `merge_group`.** Creating the queue branch fires a `push`
  event too, and with the group keyed on `github.ref` alone one killed the
  other. Fixed by adding `github.event_name`.
- **`synchronize` versus `ready_for_review`.** Both are `pull_request`, so
  adding the event name did not separate them. A tool that pushes a branch
  and marks its pull request ready in one operation fires both in the same
  second - `gh stack submit` does, every time - and the two are not
  equivalent: the heavy tier is gated on `draft == false`, so the
  synchronize run skips it while the ready_for_review run carries it. The
  cheap run cancelled the expensive one and five required checks ended
  CANCELLED. Fixed by adding `github.event.action`, which is empty for
  `push` and `merge_group` and so leaves those keys untouched.

The general rule is the one at the top: if two runs would do different work,
they belong in different concurrency groups. `gate-breaking.yml` takes the
same principle further and has no workflow-level concurrency at all, because
nothing in it may ever be cancelled.

**The naming ruleset must permit the queue's own branches.** The queue builds
each entry on `gh-readonly-queue/main/pr-<n>-<sha>`. `branch_rules.tf` allows
that prefix in the `branch_name_pattern` regex - an fnmatch exclusion alone
was tried first and did not match.

### Breaking the deadlock

An active queue removes the ordinary merge button, so a fix to the rulesets
or workflows the queue depends on can't reach `main` - the queue is broken
by the very bug being fixed. Use `var.merge_queue_enabled` rather than
deleting configuration:

```bash
# add to infra/github/terraform.tfvars, DON'T commit it
merge_queue_enabled = false

just terraform-github        # queue off, ordinary merge button returns
# merge the PR normally

git checkout infra/github/terraform.tfvars
just terraform-github        # queue back on, fix now live on main
```

Terraform reads that file from disk, not from git, so no pull request is
needed to flip it and `main` never carries the queue switched off.

## Every PR opens as a draft, and that is load-bearing

`ci.yml`'s heavy tier and every job in `gate-breaking.yml` trigger on
`ready_for_review` and `synchronize`, never on `opened` - see that workflow's
trigger comment for why `opened` is excluded. The exclusion is only safe
because `auto-pr.yml` creates every PR with `gh pr create --draft`, so marking
one ready fires those checks a moment later.

Renovate opens its own PRs, and opened them non-draft, which broke that
invariant quietly. A Renovate PR with a single commit gets no `opened` run, no
`ready_for_review` (it was never a draft) and no `synchronize` (no second
commit), so four required contexts - `API breaking-change check`, `API
breaking-change review gate`, `DB destructive migration check` and `DB
destructive migration review gate` - were never reported at all. The PR sat on
"Expected - Waiting for status to be reported" with nothing in the Actions tab,
failing the same way as the queue faults above. Such PRs only ever came unstuck
by accident: someone clicked "Update branch", and the `synchronize` that
produced finally ran the gates.

`renovate.json` now sets `draftPR: true`, so Renovate follows the same
lifecycle as everything else. **Anything else that opens a PR must open it as a
draft too**, or have its trigger added to both workflows.

To unstick a PR already in this state, click "Update branch", or convert it to
a draft and mark it ready again.

## When you still need to rebase manually

The queue can't resolve real content conflicts for you.

```bash
git fetch origin
git checkout your-feature-branch
git rebase origin/main
# Fix any conflicts
git push origin your-feature-branch --force-with-lease
```

Only needed when GitHub reports an actual merge conflict - not just "behind
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

1. **All tests run in the PR context, and again in the queue** - fast tier on every push, heavy tier on non-draft PRs, and both tiers again against the merge-group ref before the actual merge - so a PR is always tested against current main without anyone force-pushing a rebase.
2. **History** - the queue merges with a merge commit, the same way this repo already merges. Note the graph is less linear than the old flow produced: rebasing a PR up to date before merging put its merge commit in a straight line, whereas the queue tests on a temporary ref instead of rebasing the branch, leaving real branch-and-merge diamonds. Switch `merge_method` in `infra/github/branch_rules.tf` to `REBASE` or `SQUASH` if linear history matters more than matching the current merge button.
3. **No rebase-after-merge surprise** - developers delete old branches, never encounter the trap.
4. **Failures don't block the queue** - batching is off, so one PR's failure only dequeues that PR; everything behind it keeps moving.
