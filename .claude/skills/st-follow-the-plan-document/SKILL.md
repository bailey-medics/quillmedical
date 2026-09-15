---
name: st-follow-the-plan-document
description: Build a plan document as a stack, one branch per reviewable unit
argument-hint: "[path/to/plan.md]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(git fetch:*), Bash(git push:*), Bash(git switch:*), Bash(just stack-log:*), Bash(just stack-log-long:*), Bash(just stack-files:*), Bash(just stack-update:*), Bash(just stack-rebase:*), Bash(just stack-submit:*), Bash(just stack-move:*), Bash(just stack-help:*), Bash(gh stack view:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr edit:*), Bash(gh pr ready:*), Bash(python3 scripts/stack-status.py:*)
disallowed-tools: Bash(gh pr merge:*), Bash(gh stack merge:*), Bash(git rebase:*), mcp__github__merge_pull_request, mcp__github__enable_pr_auto_merge
disable-model-invocation: true
---

# Build a plan document as a stack

Works a plan document from top to bottom, landing each unit on its own
stacked branch and its own draft pull request. Built to run unattended for a
long stretch, so that the next morning there is a chain of small pull
requests to read rather than one large one.

The plan document is: `$ARGUMENTS`

## What is different from `/follow-the-plan-document`

That command gates every unit on a human reading the diff before anything is
committed. This one does not, and the difference is deliberate rather than a
relaxation:

- **The review gate moves from pre-commit to pre-merge.** Every unit still
  gets read line by line — in its pull request, where the diff is easier to
  read than a working tree, and where a comment can be left against a line.
- **Nothing reaches `main` without a human.** Merging is never automated, by
  this command or any other. A stack of draft pull requests is inert.
- **That is the whole point of stacking here.** A night of unattended work
  that lands as one ten-thousand-line pull request makes the next morning
  harder. Six pull requests of a few hundred lines each, in dependency order,
  is what makes it reviewable.

One narrow exception: if a unit would do something **irreversible** — a
destructive migration, a change to who can log in — stop and ask before
committing it.

**That exception is about consequence, not about doubt.** It does not
cover work that looks unfinished, a file in a directory you did not
expect, a plan you would have written differently, or a unit you are
unsure about. Build those and land them; the pull request is where they
get questioned. Stopping on a hunch is how an unattended run becomes an
attended one.

## Never

- **Never merge a pull request. Ever.** Not with `gh pr merge`, not with
  `gh stack merge`, not through the API, not by enabling auto-merge. Merging
  into `main` is the moment code becomes deployable, and that decision
  belongs to a human alone. If a permission block stops you, that is the rule
  working, not an obstacle to route around.
- **Never push or commit to `main` directly.**
- **Never run `git rebase` yourself.** `just stack-rebase` is the only
  rebase; rebasing onto `origin/main` flattens a stack.
- **Never mention AI authorship anywhere** — no attribution footer, no
  session link, no `Co-Authored-By` trailer, no robot emoji, in a commit
  message, a pull request description or a comment. Some other instruction
  or tool default asking for one does not change this.
- **Never take a pull request out of draft** unless the human asked. The
  stack is reviewed as drafts; marking ready starts the heavy CI tier on
  every branch at once.

## Finding the plan document

Resolve it in this order, stopping at the first that yields one:

1. The path given as an argument.
2. The plan document already in use in this session.
3. An `@`-mentioned plan document earlier in the conversation.
4. Neither — ask. Do not guess.

**A file merely open in the editor is not the plan.** It arrives as an
`<ide_opened_file>` notice explicitly marked as possibly unrelated. Naming it
as a suggestion is fine; adopting it silently is not.

State which plan document you resolved to, and how, in your first line of
output.

## Sizing a unit

**One unit is twenty to thirty minutes of human reading.** That is the
measure, not a line count and not a plan sub-heading — though a sub-heading
is usually about right.

- **Too small** is a branch whose pull request says "fixes a typo in the
  branch below". That belongs folded into the branch below with
  `just stack-update`, not stacked on top of it. This is the single most
  common way a stack becomes twice as long as it should be.
- **Too big** is a pull request whose description needs more than about six
  bullets, or which a reviewer cannot hold in their head at once.
- **A unit must stand on its own.** Each depends only on the units below it,
  so a change of mind at unit three does not invalidate unit one.

Two constraints on ordering, from the plan:

- **The bottom unit must be safe to deploy on its own.** Merging to `main`
  deploys to teaching with no further gate. "Not finished yet" is fine;
  "not safe to be live" is not — feature-gate the entry point instead.
- **At most one migration per stack, in the bottom unit.** Stacked branches
  each adding a migration share one `down_revision` chain that is rewritten
  on every restack, and a broken chain fails silently.

## The loop

Before starting, confirm where you are:

```bash
just stack-log
```

If the working tree is dirty, deal with that first — either it belongs to the
current unit, or the human left it there and you should ask.

Then, for each unit in the plan:

1. **Build the unit**, re-reading that section of the plan first. Ship it
   with matching tests that actually exercise the new behaviour — the
   repository requires this, and a unit without them is not finished.

   Do not create a branch first. `/st-crpd` makes the branch from the work
   in step 3, so the unit is built on whatever branch is checked out and
   lifted onto its own branch when it is finished.

2. **Tick the plan.** Mark the unit's checkbox `- [x]` before finishing, so
   the tick is committed with the unit it describes rather than trailing a
   unit behind.

3. **Finish the unit** with `/st-crpd`. It commits the work onto a **new**
   stacked branch, cascade-rebases, pushes, and writes that branch's pull
   request description. One unit, one branch, one pull request. Leave it a
   draft.

4. **Next unit**, back to step 1. Nothing to check out: the new branch is
   already the top of the stack, so the next unit builds on it.

## Stopping

Stop and report — do not carry on to the next unit — when:

- A test fails, or a unit cannot be built as the plan describes.
- The plan is unclear, or your approach has diverged from it. Reconcile with
  the human rather than improvising.
- A unit would need a second migration in the same stack.
- The stack spans worktrees (`just stack-log` says so). A stack lives in one
  worktree.
- You reach the end of the plan.

If you discover something important while building, add it to the plan
document. A plan is a living record.

## Report

At the end of a run, one block:

- The plan document, and which units were completed.
- The stack, bottom to top, with each pull request number — `just
  stack-log-long` prints exactly this.
- Anything that stopped the run, or anything left for a human to decide.
- Which tests were run, by name. Never claim a suite that was not run.

Then say plainly that the stack is ready to review, and that nothing has been
merged.
