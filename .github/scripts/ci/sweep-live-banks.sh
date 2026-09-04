#!/usr/bin/env bash
# Validates every published teaching bank against the current tooling.
#
# Usage: sweep-live-banks.sh <bucket> [<output-file>]
#
# Content is validated when a content repository changes, and never when the
# tooling that judges it changes. So a tightening could ship and a live bank
# that no longer passes would keep being served until someone happened to
# push an unrelated change to that repository. This asks the question the
# other way round: which published banks would today's validator reject?
#
# Reads only. It downloads the bucket's modules/ prefix and runs the
# validator over it — no database, no sync, nothing written back. The bucket
# mirrors the content repository exactly, so the download is what the
# validator already expects.
#
# Version lock is skipped: it compares a branch against origin/main, which
# has no meaning for content already published.
#
# Exits 0 when every bank passes, 1 when any fails.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "sweep-live-banks"

main() {
  local bucket="${1:-}"
  local output="${2:-}"

  if [ -z "$bucket" ]; then
    error "No bucket provided. Usage: sweep-live-banks.sh <bucket> [<output-file>]"
    exit 1
  fi

  # The output file is optional — without one the report only goes to the
  # log. But if a path was given, check it can be written now rather than
  # after downloading the bucket and validating every bank.
  if [ -n "$output" ] && ! : > "$output" 2>/dev/null; then
    error "Cannot write the report to '${output}'"
    exit 1
  fi

  local work
  work="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${work}'" EXIT

  log "Downloading gs://${bucket}/modules/"

  if ! gcloud storage cp --recursive \
    "gs://${bucket}/modules" "${work}/" >/dev/null 2>&1; then
    error "Could not read gs://${bucket}/modules/"
    exit 1
  fi

  if [ ! -d "${work}/modules" ]; then
    error "No modules/ prefix in gs://${bucket}"
    exit 1
  fi

  local count
  count="$(find "${work}/modules" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  log "Validating ${count} published module(s)"

  # Run from backend/ so the package imports, and capture the report either
  # way: on failure it names the bank and the rule, which is the whole point
  # of running this before a tightening merges rather than after it deploys.
  local report
  local status=0
  report="$(cd backend && python -m app.features.teaching.tooling.cli \
    "${work}/modules" --skip-version-lock 2>&1)" || status=$?

  printf '%s\n' "$report"
  if [ -n "$output" ]; then
    printf '%s\n' "$report" > "$output"
  fi

  if [ "$status" -ne 0 ]; then
    error "Published content would fail today's validator"
    return 1
  fi

  log "Every published bank still passes"
}

# Only run when executed, not when sourced, so tests can load the
# functions above without the script running itself.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
