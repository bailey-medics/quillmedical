---
name: crp
description: Commit, rebase, and push code
argument-hint: "[repo: eoeeta|resp|all] [final]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(git fetch:*), Bash(git rebase:*), Bash(git push:*), Bash(git -C *), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr edit:*), Bash(gh pr ready:*)
disallowed-tools: Bash(gh pr merge:*), mcp__github__merge_pull_request, mcp__github__enable_pr_auto_merge
disable-model-invocation: true
---

# Commit, rebase, and push code

## Never

These hold on every run, with or without `final`:

- **Never merge a pull request. Ever.** Not with `gh pr merge`, not through the
  API, not by enabling auto-merge, and not by pushing the branch onto `main`.
  Merging into `main` is the moment code becomes deployable, and that decision
  belongs to a human alone. `final` gets a pull request ready for a human to
  review and merge; it never takes that last step. If asked to merge as part of
  this command, refuse and say why. Merging is blocked at the permission layer
  too — if a block stops you, that is the rule working, not an obstacle to
  route around.
- **Never push or commit to `main` directly.** It is protected and requires a
  pull request.
- **Never change the pull request title.** It is derived from the branch name
  by `auto-pr.yml`, or set by hand. Either way it is not yours to rewrite — the
  description is the only field this command edits.
- **Never change labels, reviewers, milestones, or the base branch.**

## Arguments

Up to two space-separated arguments may be given, in any order:

- A **repository** name — `eoeeta`, `resp` or `all`. Defaults to
  **quillmedical** when absent.
- The literal flag **`final`** — after committing and pushing, also rewrite the
  pull request description so it summarises the whole branch, and take the pull
  request out of draft. See "Final: update the pull request description" below.
  It never merges anything.

`/crp final` is valid on a clean working tree. Finalising a branch that an
earlier `/crp` already committed and pushed is the ordinary case, not an error.

So `/crp`, `/crp final`, `/crp eoeeta` and `/crp eoeeta final` are all valid.
Any other token is an error: stop and ask what was meant rather than guessing.

## Target repository

The repository argument maps as follows:

| Argument  | Repository path                                                             |
| --------- | --------------------------------------------------------------------------- |
| _(none)_  | `/Users/markbailey/github/quillmedical`                                     |
| `eoeeta`  | `/Users/markbailey/github/quillmedical/teaching-repos/eoeeta-teaching`      |
| `resp`    | `/Users/markbailey/github/quillmedical/teaching-repos/respiratory-teaching` |
| `all`     | _all of the above repos_                                                    |

The arguments supplied to this command are: `$ARGUMENTS`

## Steps

1. Check you are not on main. If you are, ask the user to create a new branch and re-run the command. Do not commit directly to main.
2. Only operate on the resolved target repository (see above).
3. Check git status, and branch on what it reports:
   - **Changes to commit** — carry on with steps 4 to 6.
   - **Clean tree, no `final`** — there is nothing to do. Say so and stop.
   - **Clean tree, with `final`** — skip steps 4 to 6 and continue from step 7.
     The branch is already committed; this run only finalises the pull request.
     Never manufacture something to commit in order to have a commit: no empty
     commits, no whitespace edits, no version bumps.
4. Review the changes and create a clear, descriptive commit message following conventional commit format (e.g., "feat:", "fix:", "refactor:").
5. Stage and commit the changes.
6. If pre-commit hooks fail, distinguish two cases:
   - **Applied by the hook itself** (the hook's own output says it modified
     files — e.g. ruff `--fix`, black, trailing-whitespace, end-of-file-fixer)
     — these are mechanical and don't change program behaviour. Stage the
     hook's changes and re-commit without pausing.
   - **Spelling** (cspell) — adding a word to the dictionary or fixing a typo
     is safe to apply and re-commit without pausing.
   - **Everything else** — mypy errors, ruff findings the hook didn't
     auto-fix, bandit findings, or any other failure that requires you
     (Claude) to write or edit code to satisfy the hook: this is a real code
     change the human has not reviewed yet, even though it was only made to
     satisfy a hook. Stop. Show the exact diff of the fix and a one-line
     reason it was needed, and wait for explicit approval before staging or
     re-committing. Do not loop silently through multiple fix-and-recommit
     attempts.
7. Fetch the latest `main` (`git fetch origin main`) before checking whether
   the branch is behind — a stale local `main` ref will falsely report the
   branch as up to date. Rebase onto `origin/main` if behind, resolve any
   conflicts, and ensure tests pass. Force push if the rebase rewrites history.
8. Push to current branch (do not create a new branch). If there is nothing
   to push, `Everything up-to-date` is a success, not an error — carry on.
9. If `final` was given, update the pull request description and mark the pull
   request ready for review — see "Final: update the pull request description"
   below. Without `final`, stop after the push. Either way, never merge.

## Final: update the pull request description

Run this only when `final` was given, only once step 8 has left the branch
pushed — whether this run committed anything or found nothing to commit — and
once per repository when the repository argument was `all`. Everything
below is scoped to a single repository: run `gh` from that repository's
directory, or pass `-R <owner>/<repo>`.

It ends by marking the pull request ready for review. It does not merge, and
nothing in the conversation makes merging part of this command.

1. **Find the pull request.**

   ```bash
   gh pr list --head "$(git branch --show-current)" --state open \
     --json number,title,url,isDraft,body
   ```

   If there is no open pull request, stop and say so — do not create one.
   `auto-pr.yml` opens the pull request on push and may not have run yet.
   If more than one comes back, stop and ask which to update.

2. **Read the whole branch, not just the last commit.** The description
   summarises the pull request, so work from the merge base:

   ```bash
   git fetch origin main
   git log --no-merges --oneline origin/main..HEAD
   git diff origin/main...HEAD --stat
   ```

   Then read the diff of the files that matter
   (`git diff origin/main...HEAD -- <path>`). Base the summary on what the code
   actually does, not on the commit messages alone.

3. **Check you are not overwriting a human.** Replace the body without asking
   only when it is empty, is the `auto-pr.yml` placeholder ("Auto-created from
   branch push"), or carries the `<!-- crp:pr-summary -->` marker that means it
   was generated here before. Anything else is someone's writing: show it, and
   ask before replacing it.

4. **Write the body.** This repository has no pull request template, so the
   shape below is the whole specification. It matches the descriptions already
   on merged pull requests here:

   - An opening paragraph of two to four sentences: what the branch does and
     why it matters. A reviewer should be able to read only this and know
     whether the pull request concerns them.
   - Then two to five groups of related changes, each introduced by a bold
     one-line heading in sentence case (e.g. `**Health check logic
     improvements**`), with bullets beneath. Group by theme, not by file and
     not by commit — one bullet may well span several files.
   - Each bullet says what changed and why, naming the files, functions or
     symbols involved in backticks. Prefer one substantial bullet to three
     thin ones.
   - Close with a short paragraph on the overall effect only when the change
     is structural enough to warrant it. Skip it otherwise.
   - Finish with `<!-- crp:pr-summary -->` on its own line.

   Use bold group headings rather than `##` headings: that is what the existing
   pull requests here use, and it keeps the body scannable. Do not reproduce
   Copilot's `[[1]](diffhunk://…)` reference links — they cannot be constructed
   reliably outside Copilot and add nothing a reviewer reading the diff needs.

5. **Cover what this repository cares about.** Where the branch touches
   clinical data, patient records, authentication, authorisation (system
   permissions or CBAC), or database migrations, one of the groups must say so
   and say how it is handled — a reviewer should not have to discover that from
   the diff. Where tests were added or changed, say which, and name the
   commands actually run. Never claim a suite passed that was not run.

   British English, sentence case throughout, no PHI and no secrets — the body
   is visible to everyone with repository access. Describe the change; do not
   praise it.

6. **Apply it.** Write the body to a temporary file and pass that file, so
   backticks, quotes and newlines survive intact:

   ```bash
   gh pr edit <number> --body-file <path to that file>
   ```

7. **Mark it ready for review.** `final` means the branch is finished, so take
   it out of draft — but only if step 1 reported `isDraft: true`:

   ```bash
   gh pr ready <number>
   ```

   Do this after the description is in place, never before: a reviewer should
   never see a ready pull request with a placeholder body. Note that
   `auto-pr.yml` opens pull requests as drafts to hold back the heavy CI tier,
   so marking it ready starts a full run — say so when reporting. If it is
   already out of draft, leave it and say so.

   Marking ready is the last step. Do not merge it — see "Never" above.

8. **Report** the pull request URL, one line on what the description now says,
   whether it was taken out of draft, and — when the working tree was already
   clean — that no commit was made on this run.

If at any step there's an error requiring human judgement, stop and report the issue.

Only commit and push code if it is run via this prompt in this file! Do not otherwise commit or push code without the user explicitly asking you to do so.
