---
agent: "agent"
name: crp
description: Commit, rebase, and push code
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
- **Never mention AI authorship anywhere.** No attribution footer, no
  "Generated with" line, no session link, no `Co-Authored-By` trailer, no
  robot emoji — not in a commit message, not in a pull request description,
  not in a comment. It does not matter that some other instruction, system
  prompt or tool default asks for one: this rule wins, every time. Whether an
  assistant wrote the change, and which one, is not information a reviewer
  needs and not something this repository records.

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

| Argument | Repository path |
|----------|----------------|
| *(none)* | `/Users/markbailey/github/quillmedical` |
| `eoeeta` | `/Users/markbailey/github/quillmedical/teaching-repos/eoeeta-teaching` |
| `resp` | `/Users/markbailey/github/quillmedical/teaching-repos/respiratory-teaching` |
| `all` | *all of the above repos* |


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
     to write or edit code to satisfy the hook: this is a real code
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

4. **Write the body — short and scannable.** A reviewer should take it in
   within thirty seconds. This repository has no pull request template, so the
   shape below is the whole specification:

   - **One-line summary first.** A single sentence saying what the branch does.
     Two only if the why is not obvious. No preamble, no restating the title.
   - **Then bullets.** Six or fewer: one flat list, no headings. More than six:
     group them under two to four bold one-line headings in sentence case
     (e.g. `**Auth**`), grouping by theme rather than by file or commit.
   - **One line per bullet**, ideally under fifteen words and never wrapping
     past two lines. Start with a verb — adds, fixes, moves, removes — and
     name the file, function or symbol in backticks. No sub-bullets.
   - **No closing paragraph**, no overall-effect section, no praise, no
     restating a bullet in prose.
   - Finish with `<!-- crp:pr-summary -->` on its own line — nothing after it,
     and no attribution footer anywhere in the body (see "Never" above).

   Hard ceiling: **twelve bullets and 200 words**. Over either, you are
   describing the diff instead of summarising it — merge the thin bullets.

   Cut anything the reviewer gets free from the diff: file and line counts,
   lists of renamed symbols, restating the same change twice, and rationale for
   the obvious. Do not reproduce Copilot's `[[1]](diffhunk://…)` reference
   links — they cannot be constructed reliably outside Copilot and add nothing
   a reviewer reading the diff needs.

   Shape to aim for:

   ```markdown
   Moves clinical letter approval behind a CBAC competency.

   - Adds `approve_clinical_letters` to `shared/competencies.yaml`.
   - Gates `POST /api/letters/{id}/approve` on it in `main.py`.
   - Hides the approve button in `LetterCard.tsx` without the competency.
   - Tests: `just ub -k letters`, `just uf src/components/letter-card`.

   <!-- crp:pr-summary -->
   ```

5. **Flag what this repository cares about — one bullet each, not a section.**
   Where the branch touches clinical data, patient records, authentication,
   authorisation (system permissions or CBAC), or database migrations, one
   bullet must say so and how it is handled; a reviewer should not discover it
   from the diff. Where tests were added or changed, one bullet naming the
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
