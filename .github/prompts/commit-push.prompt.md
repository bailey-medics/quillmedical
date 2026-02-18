---
agent: "agent"
name: commit-push
description: Commit and push code
---

# Commit and push code

1. Only do the below for `non-main` branches
2. Check git status and confirm there are changes to commit
3. Review the changes and create a clear, descriptive commit message following conventional commit format (e.g., "feat:", "fix:", "refactor:")
4. Stage and commit the changes
5. If pre-commit hooks fail:
   - For auto-fixable issues (formatting, linting): apply fixes and re-commit
   - For complex issues: report what needs manual attention
6. Push to current branch

If at any step there's an error requiring human judgement, stop and report the issue.

Only commit and push code if it is run via this prompt in this file! Do not otherwise commit or push code without the user explicitly asking you to do so.
