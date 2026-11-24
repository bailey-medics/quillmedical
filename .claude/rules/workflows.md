---
paths:
  - ".github/workflows/**"
  - ".github/scripts/**"
---

# Quill's additions to the workflows rule

These add to the shared `workflows.md` rule in Mark's mark-house-style
repository, which covers values pasted into `run:`, permissions, pinning,
short inline shell and secrets for reusable workflows. Read the two
together.

## Where workflow scripts live

- **A workflow's scripts go under `.github/scripts/<workflow-name>/`**,
  called as `run: bash .github/scripts/<workflow-name>/<descriptive-name>.sh`.
- **zizmor runs** as the `zizmor` pre-commit hook and in CI. `just cw`
  runs it over every workflow by hand.

## Quill's shell scripts

The shared `shell.md` rule sets how every script and bats test is
written. Quill adds:

- **Log through `shared/logging.sh`.** Source it straight after
  `set -euo pipefail`, as
  `source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "<script-name>"`,
  and use its `log()` for standard output and `error()` for standard
  error, in red, instead of a raw `echo`. It is a library, only ever
  sourced, so it has no `main()`.
- **Add a shared helper to `shared/` only** when more than one script
  will use it.
- **Every script under `.github/scripts/` has a `<name>.bats` beside it.**
- **Run the suite with `just test-shell-scripts` (alias `ts`).** It runs
  `.github/scripts/ci/run-shell-tests.sh` inside a Linux image built on
  the pinned Python (`.github/Dockerfile`): GNU bash and coreutils as on
  the runner, the pinned bats version, and every target
  (`.github/scripts`, `.claude/hooks` and `scripts/tests`). The same
  script runs in CI, and fails on bats warnings as well as on failures.
- **The `gsutil` stub in `teaching-pipeline/sync-to-gcs.bats`** is the
  pattern for stubbing an outside command.
