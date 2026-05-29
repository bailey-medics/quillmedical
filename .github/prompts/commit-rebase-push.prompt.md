---
agent: "agent"
name: crp
description: Commit, rebase, and push code
---

# Commit, rebase, and push code

## Target repository

The user may specify a repo name after the command (e.g. `/crp eoeeta-teaching`). Use this mapping:

| Argument | Repository path |
|----------|----------------|
| *(none or "quillmedical")* | `/Users/markbailey/github/quillmedical` |
| `tooling` | `/Users/markbailey/github/quillmedical/teaching-tooling` |
| `eoeeta` | `/Users/markbailey/github/quillmedical/teaching-repos/eoeeta-teaching` |
| `resp` | `/Users/markbailey/github/quillmedical/teaching-repos/respiratory-teaching` |
| `all` | *all of the above repos* |

If no argument is given, default to **quillmedical**.

## Steps

1. Only operate on the resolved target repository (see above)
2. Check git status and confirm there are changes to commit
3. Review the changes and create a clear, descriptive commit message following conventional commit format (e.g., "feat:", "fix:", "refactor:")
4. Stage and commit the changes
5. If pre-commit hooks fail:
   - For auto-fixable issues (formatting, linting): apply fixes and re-commit
   - For complex issues: report what needs manual attention
6. Rebase if the branch is behind main, resolve any conflicts, and ensure tests pass. Force push if the rebase rewrites history.
7. Push to current branch

If at any step there's an error requiring human judgement, stop and report the issue.

Only commit and push code if it is run via this prompt in this file! Do not otherwise commit or push code without the user explicitly asking you to do so.
