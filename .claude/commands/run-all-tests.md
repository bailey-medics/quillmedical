---
description: Run all non-main CI/CD checks locally
allowed-tools: Bash(./scripts/run-ci-checks.sh)
disable-model-invocation: true
---

# Run all non-main CI/CD checks locally

Run the script `./scripts/run-ci-checks.sh` to execute every check from the non-main GitHub Actions workflow.

This covers:

## Fast tier (every push)

- **Python**: pre-commit styling, pytest unit tests
- **TypeScript**: ESLint, Prettier, Stylelint, typecheck, unit tests, Storybook build
- **Documentation**: TypeDoc + MkDocs build

## Heavy tier (non-draft PRs)

- **Storybook interaction tests**: Playwright-based component tests
- **Security**: Semgrep SAST scan
- **E2E**: Full Playwright end-to-end tests against the Docker Compose stack

The E2E tests require the dev Docker stack to be running (`just st` or `just st`). The script runs `cd frontend && npx playwright test` for E2E.

If any check fails, report which checks failed and the relevant error output. Do not attempt to fix failures automatically — just report the results.
