---
name: st-follow-the-plan-document
description: Build a plan document as a stack, one branch per reviewable unit
argument-hint: "[path/to/plan.md]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(git fetch:*), Bash(git push:*), Bash(git switch:*), Bash(just stack-log:*), Bash(just stack-log-long:*), Bash(just stack-files:*), Bash(just stack-update:*), Bash(just stack-rebase:*), Bash(just stack-submit:*), Bash(just stack-move:*), Bash(just stack-help:*), Bash(gh stack view:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr edit:*), Bash(gh pr ready:*), Bash(python3 scripts/stack-status.py:*)
disallowed-tools: Bash(gh pr merge:*), Bash(gh stack merge:*), Bash(git rebase:*), mcp__github__merge_pull_request, mcp__github__enable_pr_auto_merge
disable-model-invocation: true
---

# Build using stacked branches

Works a plan document from top to bottom, landing each unit (unit quantity is
discussed below) on its own
stacked branch and its own draft pull request. Built to run unattended for a
long stretch, so that the next morning there is a chain of small pull
requests for a human to read rather than one large one.

The plan document is: `$ARGUMENTS`

## What is different from the standard `/follow-the-plan-document`

The old standard command gates every unit on a human reading the diff before anything is
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

One narrow exception: if a unit would do something truly **irreversible** — a
destructive migration, a change to who can log in — stop and ask before
committing it.

**That exception is about consequence, not about doubt.** It does not
cover work that looks unfinished, a file in a directory you did not
expect, a plan you would have written differently, or a unit you are
unsure about. Build those and land them; the pull request is where they
get questioned. Stopping on a hunch is how an unattended run becomes an
attended one. There is power in being able to build something
that is close to the right solution. So, when you are unsure about a decision,
undertake online research of current best practices and relevant guidelines before
making a decision. Write up this research in the plan document. Also, log these
decisions in the PR description, when you commit, rebase and push using `st-crpd`,
using the format stated in the latter mentioned agent.

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

Only use the `@`-mentioned plan document argument.

## Sizing a unit

**One unit is twenty to thirty minutes of human reading.** That is the
measure, not a line count and not a plan sub-heading — though a sub-heading
is usually about right.

- **Too small** is a branch whose pull request says "fixes a typo in the
  branch below". That belongs folded into the branch below with
  `just stack-update`, not stacked on top of it. This is the single most
  common way a stack becomes twice as long as it should be.
- **Too big** is a pull request whose description cannot be written inside
  `/st-crpd`'s three sections and 200-word ceiling, or which a reviewer
  cannot hold in their head at once. Needing a fourth section, or running
  past the ceiling to say what changed, means the unit is really two.
- **A unit must stand on its own.** Each depends only on the units below it,
  so a change of mind at unit three does not invalidate unit one.
  - **Units must be built to pass all tests.** But don't run all tests locally, only run tests relevant to the current unit locally, and rely on the CI to catch any regressions outside the scope of the current unit.

One constraint on ordering, from the plan:

- **The bottom unit must be safe to deploy on its own.** Merging to `main`
  deploys to teaching with no further gate. "Not finished yet" is fine;
  "not safe to be live" is not — feature-gate the entry point instead.

**Several migrations in one stack are fine**, as are several API changes.
Neither caps the size of a stack. Two things make that safe:

- **A broken migration chain cannot pass unnoticed.**
  `backend/scripts/check_migrations.py` runs in the pre-commit hook and
  requires exactly one base and one head, with no reused `down_revision` and
  no cycles. A restack that damages the chain fails the next commit, loudly
  and locally.
- **Breaking API changes have their own human gate.** The `oasdiff` check
  reports them on the pull request, where a human decides. That gate does
  not care how many branches the stack holds.

What still matters is that each unit's migration belongs to that unit. A
migration sitting on a branch whose code is two units higher is the thing
that makes a stack hard to read, not the number of migrations in it.

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

- A test still fails after a genuine attempt to fix it, or a unit cannot be
  built as the plan describes. **A failing test is not itself a reason to
  stop** — see below.
- The plan is unclear, or your approach has diverged from it. Reconcile with
  the human rather than improvising.
- A migration check fails — `check_migrations.py` reports a broken chain, a
  destructive operation without its marker, or an empty `downgrade()`. A
  second migration in the same stack is not itself a reason to stop.
- The stack spans worktrees (`just stack-log` says so). A stack lives in one
  worktree.
- You reach the end of the plan.

If you discover something important while building, add it to the plan
document. A plan is a living record.

### A failing test

Fix it. A test that fails because the unit changed the behaviour underneath
it is ordinary work, not a reason to end the run — stopping on the first red
test wastes the night this command exists to use.

Two attempts, then stop and report. If the same test is still red after two
real attempts, something is wrong that reading the plan again will not solve,
and a third guess is less useful than a human reading the failure.

**Fix the code, not the test.** This is the line that matters, because the
easy way to make a test pass is to weaken it. The change is there in the
diff, and a reviewer may well catch it — but it is the easiest thing to skim
past on a pull request where everything is green. So:

- **Change the test only when the unit deliberately changed what is
  correct.** Then the test is out of date and updating it *is* the fix. Say
  so in the pull request description, under `## LLM decisions`, naming the
  old behaviour and the new one.
- **Never weaken a test to get green.** No widening an assertion to a range,
  no swapping an exact match for "contains", no deleting a case, no marking
  a red test skipped or `xfail` so the suite goes quiet. If that is the only
  way to pass, stop — it is a genuine disagreement between the plan and the
  test suite, and a human's to settle.

  **That is not a ban on `xfail` and `skip`**, which this repository uses
  appropriately. `backend/tests/test_org_scoped_access_criteria.py` is the pattern:
  twelve cases written from a plan, marked `xfail(strict=True)` because the
  design they describe is not built yet. They run on every suite, and the
  moment one passes, pytest reports it as unexpectedly passing and fails the
  build. Cases that cannot even be set up with today's tables are `skip`
  with a reason naming what is missing.

  The difference is direction. Marking a test `xfail` to silence a failure
  hides it. Writing a test `xfail(strict=True)` for behaviour not yet built
  asserts the gap and makes CI tell you when it closes. The first is
  forbidden; the second is welcome, and belongs in the pull request
  description.
- **Never touch a test in another unit's territory.** A red test in code this
  unit did not change is a regression, not a stale test. Stop and report it.

## Report

At the end of a run, one block:

- The plan document, and which units were completed.
- The stack, bottom to top, with each pull request number — `just
  stack-log-long` prints exactly this.
- Anything that stopped the run, or anything left for a human to decide.
- Which tests were run, by name. Never claim a suite that was not run.

Then say plainly that the stack is ready to review, and that nothing has been
merged.
