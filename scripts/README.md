# Scripts for Local CI/CD Testing

This directory contains scripts to help debug CI/CD failures before pushing to GitHub.

## Quick Reference

| Script                          | Purpose                         | Speed  | Accuracy |
| ------------------------------- | ------------------------------- | ------ | -------- |
| `run-ci-checks.sh`              | Mimics CI checks natively       | Fast   | ~90%     |
| `run-github-actions-locally.sh` | Runs actual workflows in Docker | Slower | ~99%     |

## Option 1: Native CI Checks (Faster)

### run-ci-checks.sh

Runs CI checks natively on your machine without Docker. Faster but may have slight environment differences from GitHub Actions runners.

**Prerequisites:**

- Python 3.13+
- Node.js 22+
- Yarn 4.10.3
- Poetry (automatically installed if missing)

**Usage:**

```bash
# Run all checks
./scripts/run-ci-checks.sh

# Run specific check category
./scripts/run-ci-checks.sh python
./scripts/run-ci-checks.sh typescript

# Run individual check
./scripts/run-ci-checks.sh eslint
./scripts/run-ci-checks.sh python-unit
./scripts/run-ci-checks.sh typecheck
```

**Available checks:**

- `all` - All checks (default)
- `python` - All Python checks
- `python-styling` - Python pre-commit hooks
- `python-unit` - Python unit tests
- `typescript` - All TypeScript checks
- `eslint` - ESLint
- `prettier` - Prettier
- `stylelint` - Stylelint
- `typecheck` - TypeScript type checking
- `unit-tests` - Frontend unit tests
- `storybook-build` - Storybook build
- `storybook-tests` - Storybook tests
- `semgrep` - Security scan
- `docs` - Documentation build

## Option 2: GitHub Actions in Docker (Most Accurate)

### run-github-actions-locally.sh

Uses **[act](https://github.com/nektos/act)** to run the exact GitHub Actions workflows in Docker containers. This is the most accurate way to test, matching the CI environment almost exactly.

**Prerequisites:**

- Docker Desktop running
- `act` (installed via `brew install act`)

**Usage:**

```bash
# Run entire non-main workflow
./scripts/run-github-actions-locally.sh non-main

# Run specific job from non-main workflow
./scripts/run-github-actions-locally.sh non-main python-styling
./scripts/run-github-actions-locally.sh non-main ts-unit

# Run main workflow
./scripts/run-github-actions-locally.sh main
```

**Available jobs:**

- `python-styling` - Python pre-commit checks
- `python-unit` - Python unit tests
- `ts-eslint` - ESLint
- `ts-prettier` - Prettier
- `ts-stylelint` - Stylelint
- `ts-typecheck` - TypeScript type checking
- `ts-unit` - Frontend unit tests
- `ts-storybook-build` - Storybook build
- `ts-storybook-test` - Storybook tests
- `semgrep` - Semgrep security scan
- `docs` - Documentation build

**Notes:**

- First run downloads container images (~2GB) - may be slow
- Subsequent runs use cached images
- Secrets defined in GitHub aren't available locally
- Uses `ubuntu-latest` container by default

## When to Use Which?

### Use `run-ci-checks.sh` when:

- Quick iteration on fixes
- Running checks frequently during development
- You need results in <1 minute

### Use `run-github-actions-locally.sh` when:

- Final verification before pushing
- Debugging environment-specific issues
- CI passes locally but fails in GitHub
- Need exact parity with CI environment

## Installation

Both scripts are already in the repository and executable. For the Docker-based approach:

```bash
# Install act (macOS)
brew install act

# Ensure Docker Desktop is running
open /Applications/Docker.app

# Test act installation
act --version
```

## Troubleshooting

### Docker not running

```
Error: Docker is not running
```

**Solution:** Start Docker Desktop

### Port conflicts

If you have services running on ports used by tests:

```bash
just stop  # Stop development stack first
```

### Out of disk space

Docker images can take up space. Clean up with:

```bash
docker system prune -a
```

### act secrets

If a workflow uses secrets, create `.secrets` file:

```bash
echo "SLACK_WEBHOOK_URL=http://localhost" > .secrets
act -s .secrets push
```

## Examples

### Debug failing TypeScript tests

```bash
# Quick check
./scripts/run-ci-checks.sh unit-tests

# Exact CI environment check
./scripts/run-github-actions-locally.sh non-main ts-unit
```

### Verify all checks before pushing

```bash
# Fast native check
./scripts/run-ci-checks.sh

# Then verify specific failing checks in Docker
./scripts/run-github-actions-locally.sh non-main python-styling
```

### Test documentation build

```bash
# Quick docs build
./scripts/run-ci-checks.sh docs

# Exact CI docs build
./scripts/run-github-actions-locally.sh non-main docs
```

## See Also

- [GitHub Actions workflows](../.github/workflows/)
- [act documentation](https://github.com/nektos/act)
- Project Justfile for other development commands
