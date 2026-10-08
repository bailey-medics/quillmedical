---
name: update-docs-docs
description: Review and update documentation to match the codebase and write the documents it is missing, landing each docs folder and each new document as its own stacked pull request
argument-hint: "[folder or file under docs/docs, e.g. backend] (default: everything in scope)"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git switch:*), Bash(just stack-log:*), Bash(just stack-log-long:*), Bash(just stack-files:*), Bash(just stack-new:*), Bash(just stack-add:*), Bash(just stack-rebase:*), Bash(just stack-submit:*), Bash(just stack-sync:*), Bash(gh stack view:*), Bash(git fetch:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr edit:*), Bash(python3 scripts/stack-status.py:*)
disallowed-tools: Bash(gh pr merge:*), Bash(gh stack merge:*), Bash(git rebase:*), mcp__github__merge_pull_request, mcp__github__enable_pr_auto_merge
disable-model-invocation: true
---

# Review and update documentation to match the codebase

Area to review: `$ARGUMENTS`

That names a folder or file under `docs/docs/` (`backend`, `frontend/storybook`,
`getting-started.md`). If it is empty, review everything in scope.

There are two passes. The first checks the documents that exist against the
code, and lands the corrections one docs folder at a time, each on its own
stacked branch with its own draft pull request. The second reads the code
itself, works out which documents are missing, and writes and lands each
one the same way.

Like `/f`, this is built to run unattended. The human starts it and reads
the result on GitHub afterwards, as a chain of small pull requests.

## Before anything: check the run can land its work

Do this first, while the human is still at the keyboard. Each unit ends in
`/crpd`, and `/crpd` refuses some starting states, so finding that out after
an hour of checking wastes the run.

```bash
just stack-log
git status --short
```

Stop and say so, before any other work, when:

- **The working tree is dirty.** The human left something there, and
  `/crpd` would commit it with the first unit. Ask what to do with it.
- **The branch is not `main`, is not in a stack, and is not level with
  `origin/main`.** `/crpd` will not commit there. Level means
  `git fetch origin main`, then `git rev-list --left-right --count
  HEAD...origin/main` reporting `0 0`.
- **The stack spans worktrees.** `just stack-log` says so. A stack lives in
  one worktree.

A stack with unmerged branches is fine: the units stack on top of it. So is
`main`, or a stack that has fully merged: `/crpd` starts a new stack.

So is a branch outside any stack that is level with `origin/main`. `main`
can be checked out in one worktree only, so every other worktree parks on
a temporary branch at its tip. That branch holds nothing `main` does not,
and `just stack-new` starts a stack from it exactly as it would from
`main`.

Then say in one short message what is about to be reviewed and which state
the stack is in, and carry on.

## Scope

Everything under `docs/docs/` except:

- `plans/` and `learnings/` - records of what was decided and found at the
  time. They are meant to differ from today's code, so "correcting" one
  destroys the history it exists to keep.
- `code/`, `safety/` and `llm/` - kept up to date by other means, not by this
  skill.

If the area named is one of those, say so and stop rather than reviewing it.

## Units: one per parent folder

**A unit is one top-level folder under `docs/docs/`**: `backend`,
`frontend`, `infrastructure` and so on. Each unit becomes one branch and one
pull request.

- **The loose pages at the top of `docs/docs/`** (`index.md`,
  `getting-started.md`) are one unit together.
- **A named area is one unit**, however small: `backend/caddy` lands as a
  single pull request.
- **A folder with nothing to correct is not a unit.** It gets no branch and
  no pull request; it is named in the final report as checked and clean.
- **A folder too big to read in one sitting is split by its subfolders.**
  The measure is the one `/f` uses: twenty to thirty minutes of human
  reading per pull request.

## Pass one: check each document against the code

Work from each document to the code it describes. A document already says
which code matters: it names files, endpoints, commands, components, settings
and environment variables.

For each document:

1. Read it whole.
2. Pick out every claim the code can confirm or refute: paths, names of
   functions, classes, components and routes, `just` recipes, configuration
   keys, versions, and described behaviour.
3. Open the code and check each one. Check the files themselves; do not rely
   on `CLAUDE.md`, the rules or memory, which can be stale in the same way the
   document is.
4. Sort each claim: it matches, it contradicts the code, it describes
   something the code does not have, or it cannot be settled.

## Pass two: read the code and find what is missing

This pass starts from the code, not the documents. Its question is: what
would a person or a model new to this area need written down to understand
the code or the reasoning behind it, that nothing gives them today?

The codebase is well over a thousand source files, so survey it area by area
rather than line by line:

- `backend/app/` - each package and each large module
- `frontend/src/` - pages, domains, `lib/`, `auth/`, and the component groups
- `shared/` - the YAML that both sides are generated from
- `infra/`, `.github/workflows/`, the compose files and the `Justfile`

When an area was named, survey only the code that area documents (`backend`
means `backend/`, `infrastructure` means `infra/` and the compose files).

For each area, read enough to understand it: the entry points, the module
docstrings, the largest files, and how it connects to its neighbours. Then
look for what already covers it, in `docs/docs/` (including `plans/`, `code/`
and `safety/`, which are out of scope to edit but still count as cover),
`CLAUDE.md` and `.claude/rules/`.

A document is worth writing when the code alone leaves a reader stuck:

- **Reasoning.** Why it is built this way and not the obvious other way. Code
  shows what was chosen, never what was rejected.
- **A flow that crosses files.** A request, a login, a sync, a deploy: no
  single file shows the whole path.
- **A rule kept by convention.** An invariant the code relies on and nothing
  enforces, so the next change can break it without a test failing.
- **A domain concept.** A clinical, regulatory or organisational idea the
  names assume the reader already has.
- **Setup or operation.** What somebody has to do, in order, that no file
  spells out.

Do not write a document for code that explains itself, for a reference the
generated pages in `code/` already give (API routes, Storybook), or to repeat
what `CLAUDE.md` or a rule already says. One page per module is not the aim;
a short list of documents somebody would actually open is. Keep to the
strongest handful: every one is a pull request a human has to read, and a
page somebody has to keep true afterwards.

Where the reasoning is not in the code, look in the comments, the plans and
`git log` for it. Never make up a reason: a confident wrong "why" is worse
than a gap. What that means for a document depends on what it is for:

- **The document is mainly about how something works.** Write it, and where
  a reason is not recorded anywhere, say so in the document in one plain
  sentence instead of guessing.
- **The document is mainly about why**, and the why is not recorded. Do not
  write it. It goes in the final report as a document that needs the user's
  account first.

## Rules

- **Code is the canonical truth.** Where a document contradicts the code, fix
  the document.
- **A feature the code does not have stays as written.** It may be a future
  feature. A rename is not this case: if the thing exists under another name
  or path, the document is wrong and gets fixed. If it is unclear whether
  something was removed or is still planned, leave it and record the
  question.
- **Make the smallest edit that makes the document true.** Keep the author's
  wording, structure and tone. Do not restyle, reorder or tighten prose that
  is already correct.
- **A new document says only what the code, the comments, the plans or
  `git log` support.** Name the files it was written from, so a reader can
  check it and the next run of this skill can.
- **Never edit code.** A fault found in the code is reported, not fixed.
- **A fault outside the area named is reported, not fixed.** A run on
  `backend/caddy` that finds the same error in another folder's page
  leaves that page alone, and names it in the final report with the
  correction it would make. The pull requests of a run on one area should
  hold that area and nothing else.
- **Do not stop to ask during the run.** A question goes into the pull
  request description of the unit it belongs to, and into the final report.
  The human is not there to answer, and a run that waits is a run that
  did nothing.

## Never

- **Never merge a pull request. Ever.** Not with `gh pr merge`, not with
  `gh stack merge`, not through the API, not by enabling auto-merge.
- **Never take a pull request out of draft.** The stack is reviewed as
  drafts; marking ready starts the heavy CI tier on every branch at once.
- **Never commit except through `/crpd`**, and never run `git rebase`.
- **Never push or commit to `main` directly.**
- **Never mention AI authorship anywhere**, in a commit message, a pull
  request description or a comment.

## Gathering the findings

For a single file or a small folder, do the checking directly.

For anything wider, gather the findings with subagents before the first
unit is landed, launched together:

- **Pass one**: one per unit.
- **Pass two**: one per code area in the list above.

Each starts with none of this context, so give it its folder or area, the
method for its pass and the rules above. Subagents check and report; they do
not edit, write or commit.

Ask each pass one subagent to return, per finding:

- the document and line
- what the document says
- what the code says, with the file that shows it
- the proposed correction
- how sure it is

Ask each pass two subagent to return, per candidate:

- the path it would have under `docs/docs/`
- what it would cover, in two or three lines
- who it helps, and what they cannot work out from the code today
- the code it would be written from
- whether the reasoning was found, and where
- what it found that already covers the area

## The loop: land one unit at a time

The findings are in hand. Now, for each unit, in the order the folders
appear under `docs/docs/`:

1. **Confirm each reported contradiction** by opening the code behind it. A
   subagent's mistake arrives sounding as certain as its findings, and a
   wrong "correction" makes a true document false. Drop anything that does
   not hold.

2. **Apply the corrections** for this unit, and only this unit. Nothing
   from another folder goes into the working tree, because `/crpd` commits
   everything it finds there.

3. **If nothing changed, move on.** No branch, no pull request.

4. **Finish the unit with `/crpd`.** It puts the work on a new stacked
   branch, pushes, and writes the draft pull request. Give its description
   what a reviewer on GitHub needs and cannot get from the diff:

   - under `## LLM decisions`, anything left as written because the code
     does not have it yet, and any question that could not be settled
   - for each correction that is not obvious, the file that shows what the
     code does

5. **Next unit**, back to step 1. The new branch is already the top of the
   stack, so the next unit builds on it.

## When the merge queue fills during the run

A long run can still be building its later units when a human reads the
early ones and queues them to merge. `just stack-submit` rebases the whole
stack before it pushes, and it cannot rebase past a queued pull request;
pushing one also takes it out of the queue.

So before each push, look:

```bash
gh stack view --json
```

- **No branch has `isQueued: true`** - push as usual.
- **Any branch has** - do not push. `/crpd` commits the unit onto its
  branch and stops there, as its own step 5 sets out. Carry on to the next
  unit: it stacks on the unpushed one.
- **Look again before the next unit's push.** Once nothing is queued, bring
  the stack up to date with `just stack-sync` if a branch has merged, and
  push. That one push carries every unit held back, and each of their pull
  requests then needs its description written, not only the newest.
- **Still queued at the end of the run** - do not wait. Name the units
  that are committed and not pushed in the final report, so the human can
  run `just stack-submit` once the queue has drained.

## Then the new documents, one unit each

These come after every correction unit, so they sit at the top of the
stack. A human who does not want one can close its pull request without
disturbing a correction beneath it.

First settle the list. Check each candidate: confirm nothing already covers
it, and merge candidates from different subagents that describe the same
thing. Order what is left most useful first, so the documents most likely
to be declined end up highest in the stack, where closing them is easiest.

Then, for each document:

1. **Write it from the code**, opening the files yourself. A subagent's
   summary is a pointer to where to look, not a source. Match the style and
   depth of the documents beside it.

2. **Add it to `nav` in `docs/mkdocs.yml`**, in the section its folder
   already has.

3. **Finish the unit with `/crpd`.** One document, one branch, one pull
   request. Its description says who the document is for, which files it
   was written from, and under `## LLM decisions` where each piece of
   reasoning came from and anything the document says is not recorded.

## Stopping

Stop the run and report, without starting the next unit, only when `/crpd`
stops for a mechanical reason: a hook failure it cannot fix, a rebase
conflict, the stack turning out to span worktrees. Doubt about a correction
or a document is not a reason to stop. Leave the correction out, or leave
the uncertain part of the document out, and record the question.

## Report

At the end, one block:

- The stack, bottom to top, with each pull request number. `just
  stack-log-long` prints exactly this.
- The folders checked and found clean.
- Anything unresolved, as a numbered list of questions, each with a
  recommendation and the pull request it belongs to.
- Anything that stopped the run.
- Any unit committed and not pushed because the merge queue was in use.
- Any fault found in a document outside the area named, with the
  correction it needs.
- Any fault found in the code itself, which this skill does not fix.
- Documents not written because their reasoning is not recorded anywhere,
  each with what the user would need to supply.

Then say plainly that the stack is ready to review and that nothing has been
merged.
