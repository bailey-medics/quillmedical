---
paths:
  - ".github/workflows/**"
  - ".github/scripts/**"
---

# GitHub Actions workflow and script conventions

## Workflows calling shell scripts

- Inline shell in workflow YAML files should be kept to a minimum — extract into a `.sh` file under `.github/scripts/<workflow-name>/` once the code has any branching (`if/else`), loops, or meaningful logic. A few sequential commands with no branching are fine inline.
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

main() {
  local arg_name="${1:-}"

  if [ -z "$arg_name" ]; then
    error "No branch name provided. Usage: <script-name>.sh <arg-name>"
    exit 1
  fi

  log "Doing the thing with ${arg_name}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
```

- `set -euo pipefail` is required on all scripts — exit on error, treat unset variables as errors, and propagate pipe failures
- Use `source "$(dirname "$0")/../shared/logging.sh" "<script-name>"` for all log and error output — do not use raw `echo` for user-facing messages
- Error messages go to standard error (handled automatically by the `error()` helper)

### `main()` and the source guard

Put the script's work in a `main()` function and call it behind a source guard. This is bash's equivalent of Python's `if __name__ == "__main__"`.

- **Why the guard.** Sourcing a file runs it top to bottom. With a bare `main "$@"` at the end, a `.bats` file that does `source "${BATS_TEST_DIRNAME}/<script>.sh"` to test one function in isolation would execute the whole script on load — and with *bats'* arguments, not the script's. The guard makes sourcing define the functions and stop there.
- **Apply it even when the script's own tests run it end-to-end** (`run bash "$SCRIPT"`). It costs nothing there and keeps the finer-grained testing style available later.
- **Validate required arguments at the top of `main()`**, before any work, taking them as `local` positional parameters rather than reassigning to bare uppercase globals.
- **Declare every variable `local`**, including loop variables, so nothing leaks into the calling shell when the script is sourced.
- **Split `local` from a command substitution** — `local x=$(cmd)` swallows the exit status of `cmd`, so a failure slips past `set -e`. Write `local x` then `x=$(cmd)` on the next line.
- **Libraries are exempt.** `shared/logging.sh` is only ever sourced and has no `main()`.

## Shared helpers

- `shared/logging.sh` — provides `log()` (standard output) and `error()` (standard error, red) functions
- Source it as the first thing after `set -euo pipefail`
- Add new shared helpers to `shared/` only if they will be used by more than one script
