---
description: Commit, rebase, and push code
argument-hint: "[repo: tooling|eoeeta|resp|all]"
model: haiku
---

# Commit, rebase, and push code

## Target repository

The user may specify a repo name after the command (e.g. `/crp eoeeta`). Use this mapping:

| Argument | Repository path |
|----------|----------------|
| *(none)* | `/Users/markbailey/github/quillmedical` |
| `tooling` | `/Users/markbailey/github/quillmedical/teaching-tooling` |
| `eoeeta` | `/Users/markbailey/github/quillmedical/teaching-repos/eoeeta-teaching` |
| `resp` | `/Users/markbailey/github/quillmedical/teaching-repos/respiratory-teaching` |
| `all` | *all of the above repos* |

The argument supplied to this command is: `$ARGUMENTS`

If it is empty, default to **quillmedical**.

## Steps

1. Check you are not on main. If you are, ask the user to create a new branch and re-run the command. Do not commit directly to main.
2. Only operate on the resolved target repository (see above).
3. Check git status and confirm there are changes to commit.
4. Review the changes and create a clear, descriptive commit message following conventional commit format (e.g., "feat:", "fix:", "refactor:").
5. Stage and commit the changes.
6. If pre-commit hooks fail:
   - For auto-fixable issues (formatting, linting): apply fixes and re-commit.
   - For complex issues: report what needs manual attention.
7. Fetch the latest `main` (`git fetch origin main`) before checking whether
   the branch is behind — a stale local `main` ref will falsely report the
   branch as up to date. Rebase onto `origin/main` if behind, resolve any
   conflicts, and ensure tests pass. Force push if the rebase rewrites history.
8. Push to current branch (do not create a new branch).

If at any step there's an error requiring human judgement, stop and report the issue.

Only commit and push code if it is run via this prompt in this file! Do not otherwise commit or push code without the user explicitly asking you to do so.
