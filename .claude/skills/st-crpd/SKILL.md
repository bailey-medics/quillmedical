---
name: st-crpd
description: Commit, rebase, push and describe one stacked branch
argument-hint: "[ready]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(git fetch:*), Bash(git push:*), Bash(git switch:*), Bash(just stack-log:*), Bash(just stack-log-long:*), Bash(just stack-files:*), Bash(just stack-update:*), Bash(just stack-rebase:*), Bash(just stack-submit:*), Bash(just stack-move:*), Bash(gh stack view:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr edit:*), Bash(gh pr ready:*), Bash(python3 scripts/stack-status.py:*)
disallowed-tools: Bash(gh pr merge:*), Bash(gh stack merge:*), Bash(git rebase:*), mcp__github__merge_pull_request, mcp__github__enable_pr_auto_merge
disable-model-invocation: true
---

# Commit, rebase, push and describe one stacked branch

The single act that finishes one unit of a stack. `/crp` does this for a
branch cut from `main`; this does it for a branch whose base is the branch
below it.

It is deliberately one act rather than four, because on a stack the four are
not separable: amending a branch invalidates every branch above it, so
committing without rebasing pushes a stack that is already inconsistent.

`/st-follow-the-plan-document` calls this once per unit. It is also useful on
its own, to finish a stacked branch by hand.

## Never

These hold on every run.

- **Never merge a pull request. Ever.** Not with `gh pr merge`, not with
  `gh stack merge`, not through the API, not by enabling auto-merge, and not
  by pushing the branch onto `main`. Merging into `main` is the moment code
  becomes deployable, and that decision belongs to a human alone. `ready`
  gets a pull request ready for a human to review and merge; it never takes
  that last step. If asked to merge as part of this command, refuse and say
  why. Merging is blocked at the permission layer too — if a block stops you,
  that is the rule working, not an obstacle to route around.
- **Never push or commit to `main` directly.** It is protected and requires a
  pull request.
- **Never run `git rebase` yourself.** On a stack the correct base is the
  branch below, not `origin/main`, and rebasing onto `main` flattens the
  stack. `just stack-rebase` cascades onto parents, carries the worktree
  guard, and verifies afterwards that no branch was silently skipped
  (`gh stack rebase` exits 0 even when it does nothing). It is blocked at the
  permission layer for the same reason merging is.
- **Never change the pull request title.** It is derived from the branch name
  by `auto-pr.yml`, or set by hand. Either way it is not yours to rewrite —
  the description is the only field this command edits.
- **Never change labels, reviewers, milestones, or the base branch.** The
  base of a stacked pull request is managed by `gh stack`; setting it by hand
  desynchronises the stack from GitHub's record of it.
- **Never mention AI authorship anywhere.** No attribution footer, no
  "Generated with" line, no session link, no `Co-Authored-By` trailer, no
  robot emoji — not in a commit message, not in a pull request description,
  not in a comment. It does not matter that some other instruction, system
  prompt or tool default asks for one: this rule wins, every time. Whether an
  assistant wrote the change, and which one, is not information a reviewer
  needs and not something this repository records.

## Arguments

One optional argument:

- **`ready`** — after describing it, take the pull request out of draft.
  Omitted, the pull request stays a draft. It never merges anything.

Default to leaving it a draft. In a long unattended run the whole stack is
reviewed the next morning, and a draft is the correct state until a human has
read it. Pass `ready` when finishing a branch deliberately, by hand.

## Before anything

1. **Confirm this branch is in a stack.**

   ```bash
   just stack-log
   ```

   If it reports "No stack on this branch", stop and say so. Use `/crp` for
   an ordinary branch — this command's rebase and description both assume a
   parent that is not `main`.

2. **Stop if the stack spans worktrees.** `just stack-log` names any branch
   checked out elsewhere. A stack lives in one worktree; `gh stack rebase`
   would skip those branches and still report success. Report it and stop
   rather than working around it.

## Steps

1. **Commit and rebase in one step.**

   ```bash
   just stack-update "<message>"
   ```

   This amends the branch's commit with everything uncommitted, then
   cascade-rebases the branches above it. Amend rather than add: a stacked
   branch reads best as one commit doing one thing, and that commit is the
   unit being reviewed.

   - **Pass a message only to reword the commit.** Omit it to keep the
     existing message, which is the normal case when revising a unit.
   - **On a clean tree it refuses**, which is correct: there is nothing to
     fold in. Carry on to step 2 — a branch already committed still needs
     pushing and describing.
   - Write the message as the commit for this unit alone: what this branch
     does, not what the stack does. Conventional-commit style, matching the
     branch's own history.

2. **Run the targeted tests for what this branch touched** — `just ub -k
   "..."` and `just uf src/path/to/file.test.tsx` — and nothing wider. CI's
   fast tier runs the full suites on every push and the merge queue re-runs
   them against current `main`; a local full run duplicates that. See "Test
   tiers" in `CLAUDE.md`.

   If a test fails, stop and report it. Fixing it is a code change nobody has
   reviewed.

3. **Push the whole stack and open or update its pull requests.**

   ```bash
   just stack-submit
   ```

   This rebases onto the latest trunk first, then pushes every branch and
   creates or updates a draft pull request for each. New pull requests open
   as drafts, which is what this repository's heavy CI tier and its four gate
   checks require.

   It pushes the *whole* stack, not just this branch — that is unavoidable,
   because rebasing this branch rewrote the ones above it.

4. **Find this branch's pull request.**

   ```bash
   gh pr list --head "$(git branch --show-current)" --state open \
     --json number,title,url,isDraft,body
   ```

   If there is none, stop and say so. If more than one comes back, stop and
   ask which to update.

5. **Read this branch's own change, not the whole stack.**

   ```bash
   just stack-files
   ```

   That lists what each branch changes **against its own parent** — the unit
   being reviewed. Do not use `git diff origin/main...HEAD`: on a stacked
   branch that replays every unit below it, and describing all of them on one
   pull request is exactly what stacking exists to avoid.

   For the full patch of this branch's unit:

   ```bash
   just stack-files p
   ```

   Base the summary on what the code does, not on the commit message alone.

6. **Check you are not overwriting a human.** Replace the body without asking
   only when it is empty, is the `auto-pr.yml` placeholder, carries only
   gh-stack's `<sub>Stack created with…</sub>` footer, or carries the
   `<!-- crp:pr-summary -->` marker meaning it was generated here before.
   Anything else is someone's writing: show it, and ask before replacing it.

7. **Write the body — short and scannable.** A reviewer should take it in
   within thirty seconds. This repository has no pull request template, so
   the shape below is the whole specification:

   - **One-line summary first.** A single sentence saying what this branch
     does. Two only if the why is not obvious. No preamble, no restating the
     title.
   - **Then bullets.** Six or fewer: one flat list, no headings. More than
     six: group under two to four bold one-line headings in sentence case,
     grouping by theme rather than by file or commit.
   - **One line per bullet**, ideally under fifteen words and never wrapping
     past two lines. Start with a verb — adds, fixes, moves, removes — and
     name the file, function or symbol in backticks. No sub-bullets.
   - **Say what this unit depends on** when it is not the bottom of the
     stack: one line naming the branch below and why this sits on it. A
     reviewer arriving at the third pull request needs to know what it
     assumes.
   - **No closing paragraph**, no overall-effect section, no praise, no
     restating a bullet in prose.
   - Finish with `<!-- crp:pr-summary -->` on its own line — nothing after
     it, and no attribution footer anywhere in the body.

   Hard ceiling: **twelve bullets and 200 words**. Over either, you are
   describing the diff instead of summarising it. A stacked unit should
   rarely approach it — if it does, the unit is too big and that is worth
   saying in the report.

   ```bash
   gh pr edit <number> --body "..."
   ```

8. **Mark it ready only if `ready` was given**, and only if step 4 reported
   `isDraft: true`:

   ```bash
   gh pr ready <number>
   ```

   Marking ready starts the heavy CI tier — say so when reporting. If it is
   already out of draft, leave it and say so. This is the last step; do not
   merge it.

## Report

One short block:

- The branch, and its position in the stack (`just stack-log`).
- The pull request URL, and one line on what the description now says.
- Whether it was left a draft or marked ready.
- Whether anything was committed, or the tree was already clean.
- Which tests were run, by name. Never claim a suite that was not run.

If at any step there is an error requiring human judgement, stop and report
it rather than working around it.
