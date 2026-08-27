---
name: crp
description: Commit, rebase, and push code
argument-hint: "[repo: tooling|eoeeta|resp|all]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git add:*), Bash(git commit:*), Bash(git fetch:*), Bash(git rebase:*), Bash(git push:*), Bash(git -C *)
disable-model-invocation: true
model: haiku
---

# Commit, rebase, and push code

## Target repository

The user may specify a repo name after the command (e.g. `/crp eoeeta`). Use this mapping:

| Argument  | Repository path                                                             |
| --------- | --------------------------------------------------------------------------- |
| _(none)_  | `/Users/markbailey/github/quillmedical`                                     |
| `tooling` | `/Users/markbailey/github/quillmedical/teaching-tooling`                    |
| `eoeeta`  | `/Users/markbailey/github/quillmedical/teaching-repos/eoeeta-teaching`      |
| `resp`    | `/Users/markbailey/github/quillmedical/teaching-repos/respiratory-teaching` |
| `all`     | _all of the above repos_                                                    |

The argument supplied to this command is: `$ARGUMENTS`

If it is empty, default to **quillmedical**.

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
8. Push to current branch (do not create a new branch).

If at any step there's an error requiring human judgement, stop and report the issue.

Only commit and push code if it is run via this prompt in this file! Do not otherwise commit or push code without the user explicitly asking you to do so.
