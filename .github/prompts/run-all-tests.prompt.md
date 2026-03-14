---
agent: "agent"
name: run-all-tests
description: Run all non-main CI/CD checks locally
---

# Run all non-main CI/CD checks locally

Run the script `./scripts/run-ci-checks.sh` to execute every check from the non-main GitHub Actions workflow.

This covers:

- **Python**: pre-commit styling, pytest unit tests
- **TypeScript**: ESLint, Prettier, Stylelint, typecheck, unit tests, Storybook build, Storybook tests
- **Security**: Semgrep SAST scan

If any check fails, report which checks failed and the relevant error output. Do not attempt to fix failures automatically — just report the results.
