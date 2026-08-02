---
applyTo: ".github/workflows/**, .github/scripts/**"
---

# GitHub Actions workflow and script conventions

## Workflows calling shell scripts

- Inline shell in workflow YAML files should be kept to a minimum — extract anything beyond a single command into a `.sh` file under `.github/scripts/<workflow-name>/`
- Script names must be descriptive and reflect what the script does (e.g. `create-pr.sh`, `label-pr.sh`)
- Call scripts with an explicit interpreter: `run: bash .github/scripts/<workflow-name>/<descriptive-name>.sh`
- Pass GitHub context values as positional arguments (e.g. `"${{ github.ref_name }}"`) — do not rely on environment variables being implicitly available inside scripts

## Shell script structure

Every script must have a header comment block immediately after the shebang line, in this order:

```bash
#!/usr/bin/env bash
# One-line description of what the script does.
#
# Usage: script-name.sh <arg-name>
#
# Any important behavioural notes (e.g. idempotency, skips, race condition handling).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "<script-name>"
```

- `set -euo pipefail` is required on all scripts — exit on error, treat unset variables as errors, and propagate pipe failures
- Use `source "$(dirname "$0")/../shared/logging.sh" "<script-name>"` for all log and error output — do not use raw `echo` for user-facing messages
- Validate required arguments at the top of every script before doing any work, immediately after sourcing the logging helper:
  ```bash
  if [ -z "${1:-}" ]; then
    error "No branch name provided. Usage: <script-name>.sh <arg-name>"
    exit 1
  fi
  ```
- Error messages go to standard error (handled automatically by the `error()` helper)

## Shared helpers

- `shared/logging.sh` — provides `log()` (standard output) and `error()` (standard error, red) functions
- Source it as the first thing after `set -euo pipefail`
- Add new shared helpers to `shared/` only if they will be used by more than one script
