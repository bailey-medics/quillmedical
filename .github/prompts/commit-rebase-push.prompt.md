---
agent: "agent"
name: crp
description: Commit, rebase, and push code
---

# Commit, rebase, and push code

## Arguments

Up to two space-separated arguments may be given, in any order:

- A **repository** name — `eoeeta`, `resp` or `all`. Defaults to
  **quillmedical** when absent.
- The literal flag **`final`** — after committing and pushing, also rewrite the
  pull request description so it summarises the whole branch. See
  "Final: update the pull request description" below.

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
3. Check git status and confirm there are changes to commit.
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
8. Push to current branch (do not create a new branch).
9. If `final` was given, update the pull request description — see
   "Final: update the pull request description" below. Without `final`, stop
   after the push.

## Final: update the pull request description

Run this only when `final` was given, only after the push in step 8 succeeded,
and once per repository when the repository argument was `all`. Everything
below is scoped to a single repository: run `gh` from that repository's
directory, or pass `-R <owner>/<repo>`.

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

3. **Check you are not overwriting a human.** If the existing body holds prose
   that is neither the template's boilerplate comments nor a previously
   generated summary (identified by the `<!-- crp:pr-summary -->` marker),
   stop, show that body, and ask before replacing it. An empty body, the
   untouched template, or a body carrying the marker is safe to replace
   without asking.

4. **Write the body** using the headings from
   `.github/_pull_request_template.md`, filling every section:

   ```markdown
   ## What

   <one short paragraph, then bullets for the substantive changes>

   ## Why

   <the reason for the change>

   ## Safety considerations

   <Does this touch clinical data, patient records, authentication,
   authorisation (system permissions or CBAC), or database migrations? If so,
   say how it is handled. Write "N/A" only when none genuinely apply.>

   ## Testing

   <the tests added or changed, and the commands actually run>

   <!-- crp:pr-summary -->
   ```

   British English, sentence case for headings, no PHI and no secrets — the
   body is visible to everyone with repository access. Describe the change
   rather than praising it, and never claim tests pass that were not run.

5. **Apply it.** Write the body to a temporary file and pass that file, so
   backticks, quotes and newlines survive intact:

   ```bash
   gh pr edit <number> --body-file <path to that file>
   ```

   Leave the title, draft state, labels and reviewers alone.

6. **Report** the pull request URL and one line on what the description now
   says.

If at any step there's an error requiring human judgement, stop and report the issue.

Only commit and push code if it is run via this prompt in this file! Do not otherwise commit or push code without the user explicitly asking you to do so.
