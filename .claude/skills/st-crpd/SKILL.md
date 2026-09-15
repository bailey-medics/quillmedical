---
name: st-crpd
description: Commit, rebase, push and describe one stacked branch
argument-hint: "[ready]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git fetch:*), Bash(git push:*), Bash(just stack-log:*), Bash(just stack-log-long:*), Bash(just stack-files:*), Bash(git switch:*), Bash(just stack-add:*), Bash(just stack-new:*), Bash(just stack-sync:*), Bash(just stack-rebase:*), Bash(just stack-submit:*), Bash(just stack-move:*), Bash(gh stack view:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr edit:*), Bash(gh pr ready:*), Bash(python3 scripts/stack-status.py:*)
disallowed-tools: Bash(gh pr merge:*), Bash(gh stack merge:*), Bash(git rebase:*), mcp__github__merge_pull_request, mcp__github__enable_pr_auto_merge
disable-model-invocation: true
---

# Commit, rebase, push and describe one stacked branch

The single act that finishes one unit of a stack. `/crp` does this for a
branch cut from `main`; this does it for a branch whose base is the branch
below it.

**One call, one branch, one pull request.** The uncommitted work becomes a
new branch stacked on the current one, with a single commit, and that branch
gets its own pull request. Call it again after the next piece of work and it
stacks another on top.

It is deliberately one act rather than four, because on a stack the four are
not separable: adding a branch leaves anything above it sitting on an older
parent, so committing without rebasing pushes a stack that is already
inconsistent.

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

1. **Find out whether there is a stack yet.**

   ```bash
   just stack-log
   ```

   - **In a stack with at least one unmerged branch** — the ordinary case.
     Step 2 uses `just stack-add`, which stacks the new branch on the one
     checked out.
   - **In a stack where every branch is merged** — the stack is spent, and
     the next unit belongs to a new one. See "Starting again after a stack
     has merged" below; the work is carried to `main` first, and step 2
     then uses `just stack-new`.
   - **"No stack on this branch", and on `main`** — this is the first unit.
     Step 2 uses `just stack-new` instead, which starts the stack. Everything
     else is the same.
   - **"No stack on this branch", on some other branch** — stop and say so.
     Committing here would put the work on a branch that is not part of any
     stack, and `/crp` is the command for that.

   The merged case is easy to miss, because `stack-log` still draws the
   stack — every branch simply carries `merged`. Read the marks, not the
   shape: stacking onto a merged branch bases the new unit on history that
   is already in `main`, and its pull request then carries the old stack's
   merge commits.

2. **Stop if the stack spans worktrees.** `just stack-log` names any branch
   checked out elsewhere. A stack lives in one worktree; `gh stack rebase`
   would skip those branches and still report success. Report it and stop
   rather than working around it.

## Starting again after a stack has merged

Only when step 1 found every branch in the stack marked `merged`. The
branch checked out is then behind `main` by at least the merge commits of
the stack's own pull requests, and the working tree holds the next unit.

```bash
just stack-sync
git switch main
```

`stack-sync` reconciles the merged stack with GitHub and fast-forwards
`main`; `git switch main` carries the uncommitted work across, which git
does cleanly because the merged branch and `main` no longer differ in the
files being changed. Then carry on at step 1 of "Steps" and use
`just stack-new`, exactly as for a first unit.

Two things to check rather than assume:

- **The working tree survived the switch.** `git status --short` should
  still list the same files. If git refused the switch because the changes
  conflict with `main`, stop and report it — that means the unit overlaps
  something merged while it was being built, and a human should look.
- **`main` is actually current.** `git rev-list --left-right --count
  HEAD...origin/main` should report `ahead=0 behind=0`. Starting a stack
  on a stale `main` produces a pull request carrying commits that are
  already merged.

## Steps

1. **Stop if there is nothing to commit.**

   ```bash
   git status --short
   ```

   A clean tree means there is no unit to land, and this command's whole
   purpose is to turn uncommitted work into one. Say so and stop. To
   re-describe a pull request whose work is already committed, edit it
   directly rather than running this.

2. **Put the work on its own new branch.**

   ```bash
   just stack-add <name> "<message>"
   ```

   …or, when step 1 said this is the first unit of a new stack — on `main`,
   or on `main` having just carried the work off a merged stack:

   ```bash
   just stack-new <name> "<message>"
   ```

   One call, one new branch, one commit, one pull request. That is the
   point: each unit of work gets a pull request of its own rather than
   accumulating commits on a branch someone has to disentangle later.

   Both stage everything and commit it. `stack-add` stacks the branch on
   top of the one currently checked out, so the new unit depends on the one
   below it exactly as the stack describes; `stack-new` starts a fresh
   stack from `main` instead. The name and message are chosen the same way
   either way.

   **Choose both the name and the message yourself**, from what actually
   changed — do not ask for them. This command is called unattended, and
   stopping to ask would defeat that.

   - **The name** describes the unit, not the session: `pr-description-join`,
     not `fixes` or `part-2`. Lower case, hyphenated, no `feature/` prefix —
     `stack-add` adds it. Keep it short enough to read in a stack diagram.
   - **The message** is conventional-commit style, matching the branch's own
     history: `fix(tooling): stack-log-long could not read pull requests`.
     Describe what the change does, not what you did.
   - **Read the diff before naming either.** `git diff --stat` and the diff
     itself; the name and message should come from the code, not from what
     the conversation was about.

   **Do not assess whether the work is one unit.** Whatever is uncommitted
   becomes one branch and one pull request, however many concerns it spans.
   Deciding when a unit is finished is the caller's job — running this
   command *is* that decision — and stopping to second-guess it would turn
   a one-word command into a negotiation, and break an unattended run at
   the moment it most needs to keep going.

   So: no asking, no splitting, no suggesting the work be split. Read the
   diff only to name the branch and write the message. Where the work spans
   two concerns, name it for the larger and let the description carry both.

3. **Bring the branches above back into line.**

   ```bash
   just stack-rebase
   ```

   Adding a branch mid-stack leaves any branch that was above it sitting on
   an older parent. `stack-rebase` cascades onto parents, carries the
   worktree guard, and verifies afterwards that no branch was silently
   skipped. Skip it only when the new branch is the top of the stack, which
   is the usual case — running it then is harmless.

4. **Run the targeted tests for what this branch touched** — `just ub -k
   "..."` and `just uf src/path/to/file.test.tsx` — and nothing wider. CI's
   fast tier runs the full suites on every push and the merge queue re-runs
   them against current `main`; a local full run duplicates that. See "Test
   tiers" in `CLAUDE.md`.

   If a test fails, stop and report it. Fixing it is a code change nobody has
   reviewed.

5. **Push the whole stack and open or update its pull requests.**

   ```bash
   just stack-submit
   ```

   This rebases onto the latest trunk first, then pushes every branch and
   creates or updates a draft pull request for each. New pull requests open
   as drafts, which is what this repository's heavy CI tier and its four gate
   checks require.

   It pushes the *whole* stack, not just this branch — that is unavoidable,
   because rebasing this branch rewrote the ones above it.

6. **Find this branch's pull request.**

   ```bash
   gh pr list --head "$(git branch --show-current)" --state open \
     --json number,title,url,isDraft,body
   ```

   If there is none, stop and say so. If more than one comes back, stop and
   ask which to update.

7. **Read this branch's own change, not the whole stack.**

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

   Read the patch, not just the file list: the decisions and risks step 9
   asks for are visible only in the change itself.

8. **Check you are not overwriting a human.** Replace the body without asking
   only when it is empty, is the `auto-pr.yml` placeholder, carries only
   gh-stack's `<sub>Stack created with…</sub>` footer, or carries the
   `<!-- crp:pr-summary -->` marker meaning it was generated here before.
   Anything else is someone's writing: show it, and ask before replacing it.

9. **Write the body.** The reader reads every line of the diff, so never
   describe the diff. Write only what reading the code cannot tell them:
   what you chose, what might be risky, and what is different now.

   Three sections, in this order, each a level-two heading. **No summary
   line above them** — the pull request title already says what the branch
   does, and repeating it is the first thing the reader has to skip:

   ```markdown
   ## LLM decisions

   - **Bold sentence carrying the whole point.** Then a sentence or two of
     plainer detail, which the reader may skip.

   ## Risks

   - **None found.** …or one bullet per risk.

   ## What has changed

   - **Bold sentence naming the change.** Then the detail.
   ```

   **Every bullet leads with a bold sentence that stands alone.** The
   reader should be able to read only the bold text and have the whole
   pull request. What follows the bold is expansion for anyone who wants
   it, never the point itself.

   **Write for a sixteen-year-old.** Short words, short sentences, no
   jargon. Say what someone using the thing would see, not what the code
   does: "shows a dot while tests run" rather than "returns a pending
   mark". Use no word that exists only in the diff — a function name, a
   constant, an enum value. Those belong in code comments.

   Each section:

   - **`## LLM decisions`** — the choices you made that a human might have
     made differently. This is where a clinician's expertise is the
     strongest lever: a wrong decision here means the whole pull request
     needs a closer read, so it comes first. Include **departures from the
     plan** — say so plainly, leading with "Departed from the plan:" — and
     **assumptions**, where the plan was silent and you picked a reading.
     Following the plan is not a decision. Omit the section when there
     genuinely were none.

   - **`## Risks`** — security, data leaks, patient safety, anything that
     could go wrong beyond the code being incorrect. **Always present**,
     even as "**None found.**", because an omitted section cannot be told
     apart from one nobody thought about. Say "none found", never "none":
     it is what you noticed, not a guarantee, and your judgement of risk
     is not well calibrated.

   - **`## What has changed`** — what is different now, in terms of what a
     user of the thing would see. Not a file list and not a commit list:
     the diff already carries those, and repeating them is the most common
     way this section becomes noise.

   Finish with `<!-- crp:pr-summary -->` on its own line — nothing after
   it, and no attribution footer anywhere in the body.

   Hard ceiling: **200 words**. A description that long usually means the
   "What has changed" section has drifted into describing the diff.

   ```bash
   gh pr edit <number> --body "..."
   ```

10. **Mark it ready only if `ready` was given**, and only if step 6 reported
   `isDraft: true`:

   ```bash
   gh pr ready <number>
   ```

   Marking ready starts the heavy CI tier — say so when reporting. If it is
   already out of draft, leave it and say so. This is the last step; do not
   merge it.

## Report

One short block:

- The branch created, and its position in the stack (`just stack-log`).
- The pull request URL, and one line on what the description now says.
- Whether it was left a draft or marked ready.
- The commit message used, since the name and message were chosen for you.
- **Any decision or risk written into the description**, repeated here in
  one line each. After an unattended run the terminal is read before the
  pull requests are, and a decision nobody sees is a decision nobody
  checked.
- Which tests were run, by name. Never claim a suite that was not run.

If at any step there is an error requiring human judgement, stop and report
it rather than working around it.
