# Stacked branches

A stack is a chain of branches, each built on the one below, each with its
own small pull request. It lets a large change be reviewed as a series of
units without waiting for each to merge before starting the next.

This repository drives stacks through `gh stack` and a set of `just
stack-*` recipes. Each recipe explains itself in its own comments. What no
file shows is the order they are used in, or the traps between them, which
is what this page is for.

It was written from the `Justfile`, `scripts/stack-status.py`,
`scripts/stack-forget-merged.py`, the trigger comments in
`.github/workflows/ci.yml` and `.github/workflows/gate-breaking.yml`,
`.github/scripts/ci/find-prior-approval.sh` and
`.claude/skills/crpd/SKILL.md`. The decision to stack at all is in the
[stacked branches plan](../plans/2026-09-14-stacked-branches-plan.md).

## The rules

- **One commit for each branch.** That commit is the unit being reviewed.
  A change to a unit is folded into its commit, never added as a second.
  The comment on `stack-update` records why: a branch that collected "fix:
  typo" on top of its real change is how a two-unit stack became four
  branches on the first real run.
- **Every pull request opens as a draft.** The heavy CI tier and the four
  approval gate checks start when a pull request is marked ready or pushed
  to, never when it is opened. One created ready never gets them.
- **A stack lives in one worktree.** `gh stack` keeps its record inside
  that worktree's git folder, where the other checkouts cannot see it.
- **Use the recipes, not `git commit` or `git rebase`.** A commit made by
  hand lands the code and leaves the branch out of the stack's record, so
  `stack-submit` pushes nothing. It looks like success.

## The life of a stack

```text
stack-new ─▶ stack-add ─▶ stack-add ─▶ stack-submit ─▶ review
                                            ▲              │
                             stack-update ──┘              ▼
                                                      stack-ready
                                                           │
                              merge from the bottom ◀──────┘
                                       │
                          stack-sync, or stack-fresh once all have merged
```

1. **Start it.** `just stack-new <name> "<message>"` makes the bottom
   branch from the tip of `main` and commits everything in the working
   tree onto it.
2. **Add to it.** After the next piece of work, `just stack-add <name>
   "<message>"` makes a new branch on top of the one checked out and
   commits onto that.
3. **Push it.** `just stack-submit` rebases the whole stack onto the
   latest `main`, pushes every branch, and opens or updates a draft pull
   request for each. It always rebases first, because `main` moves while a
   stack is being revised.
4. **Revise a unit.** Check its branch out with `just stack-move`, make the
   change, and run `just stack-update`. That amends the branch's one
   commit, then rebases every branch above it, because amending rewrites
   the commit they sit on. Then `stack-submit` again.
5. **Mark it ready.** `just stack-ready` takes every open pull request in
   the stack out of draft, bottom first. This starts the heavy CI tier on
   every branch at once, so do not run `just e2e` or the Storybook tests
   locally alongside it.
6. **Merge from the bottom.** A person merges the bottom pull request,
   through the merge queue. Only the bottom one targets `main`.
7. **Tidy up.** `just stack-sync` drops the branches that have merged and
   points the rest at their new base. When every branch has merged,
   `just stack-fresh` moves the checkout to the tip of `main`, carrying
   any uncommitted work across, ready for `stack-new`.

Three recipes only look: `stack-log` draws the stack from the local
record, `stack-log-long` adds each pull request's state, and `stack-files`
lists what each branch changes against its own parent.

## How a stack meets CI

A stacked pull request's base is the branch below it, not `main`. Two
workflows had to learn that:

- **`ci.yml`** runs its heavy tier for pull requests targeting `main` or
  `feature/**`. With `main` alone, marking a stacked pull request ready
  ran nothing heavy.
- **`gate-breaking.yml`** does the same for the approval gates. With `main`
  alone its four required checks sat at "Expected" on every branch but the
  bottom.

An approval given once is not asked for again as the stack is rebased.
`find-prior-approval.sh` looks for an earlier run where a person approved
a change with the same fingerprint. The fingerprint is taken from the pull
request's own change, so it survives a rebase and changes with any edit.
The [stacked gate approvals plan](../plans/2026-09-25-stacked-gate-approvals-plan.md)
has the detail.

## Traps

### The marks in `stack-log` can be stale

`stack-log` reads the local record, which learns of a merge only when
something syncs. A pull request merged on GitHub since then still draws as
open. `stack-add` therefore asks GitHub before stacking, and refuses a
branch whose pull request has merged.

That check goes by branch name, and a name is sometimes reused. So a
merged pull request alone does not make a branch spent: one that also has
an open pull request is left alone. `scripts/stack-branch-merged.sh` holds
the rule, and its tests record the case that prompted it, an earlier pull
request merged from a name that a later one reused.

### Merging anything but the bottom of the stack

A stacked pull request's base is the branch below it, and a merge goes
into the base. Only the bottom of a stack points at `main`. Merge one
higher up and it shows as "Merged", but its work has landed in a feature
branch and `main` has not seen it. On 11 October 2026 fourteen pull
requests of one stack went that way, eight of them within seven seconds.

**Only ever merge the bottom.** After it lands, `just stack-sync` points
the next branch at `main`, and that one is merged next. A quick check
before merging anything in a stack: the pull request should say it merges
"into `main`".

Nothing stops it today. The merge queue and the required checks cover
`main` alone. `.github/workflows/merged-outside-main.yml` posts to Slack
when it happens. It goes by whether the merged commit is on `main`, not
by the base branch: a stack that goes through the merge queue together
lands on `main` whole, with each pull request above the bottom still
naming the branch beneath it as its base. And `infra/github` can block it with
`block_merges_into_feature_branches`, which is off until it has been
tried.

If it happens, nothing is lost. The work is in the branch it landed in:
open one pull request from that branch into `main`.

### A queued pull request must not be pushed

`stack-submit` rebases and pushes every branch. A pull request that is in
the merge queue is dropped from it when its branch is force-pushed, and a
person has to queue it again. `gh stack view --json` marks a queued one
with `isQueued: true`.

While anything in the stack is queued, do not run `stack-submit`. Push
only the new top branch, by name, and open its pull request against the
branch below. Once the queue has drained, `stack-sync` and then
`stack-submit` bring the rest up to date.

### A rebase that replays `main`

The record stores the commit `main` sat at when the stack was started, and
nothing refreshes it as the lower branches merge. Once it is stale, a
rebase treats everything merged since as work of yours and replays it,
conflicting in files the stack never touched.

`just stack-refresh` is the repair. It rebuilds the record against today's
`main` without touching a commit. `stack-sync` does not fix this: the
comment on `stack-refresh` records it being tested and leaving the record
as stale as before.

### A rebase that says it worked

`gh stack rebase` exits 0 even when it skipped a branch, which it does for
a branch checked out in another worktree. `stack-rebase` checks the result
afterwards, and `_stack-guard` refuses a stack that spans worktrees before
any of it starts.

### A hook stops `stack-add` part-way

A pre-commit hook that fails leaves the new branch created and checked
out, with nothing committed and no entry in the record.

- **`stack-new`** can simply be run again with the same name and message.
- **`stack-add`** cannot: it now finds itself on a branch in no stack.
  Switch back to the branch below, delete the empty branch with
  `git branch -d`, and run it again.

Never finish the job with `git commit`.

## Not recorded

The stacked branches plan opens by recommending against stacking and
reverses that in a later section. The recipes named in its workflow
section have since been renamed, so read it for the reasoning and this
page for the commands.
