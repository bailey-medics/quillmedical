#!/usr/bin/env bash
# Scans a teaching content repository's modules for malware with ClamAV.
#
# Usage: scan-content.sh <modules-directory> <definitions-directory>
#
# Every file a teaching repository holds is served to learners from the
# teaching bucket, so it is scanned before it can get there, as every file
# uploaded through the app is. Run by the validate job, the required check
# on a content pull request, so the tree that reaches main is the tree
# that was scanned.
#
# Fails closed: a file ClamAV names fails the job, naming each one, and so
# does a scanner error, and so does a definitions directory with nothing
# in it, which would pass every file. ClamAV must already be installed;
# the workflow installs it, and fetches the definitions, from Quill's
# clamav-mirror image.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "scan-content"

main() {
  local modules_dir="${1:-}"
  local db_dir="${2:-}"
  local report
  local status

  if [ -z "$modules_dir" ]; then
    error "No modules directory provided. Usage: scan-content.sh <modules-directory> <definitions-directory>"
    exit 1
  fi

  if [ -z "$db_dir" ]; then
    error "No definitions directory provided. Usage: scan-content.sh <modules-directory> <definitions-directory>"
    exit 1
  fi

  if ! compgen -G "${db_dir}/*.c[vl]d" >/dev/null; then
    error "No definitions in ${db_dir}, so nothing can be scanned"
    exit 1
  fi

  if [ ! -d "$modules_dir" ]; then
    error "Modules directory not found: ${modules_dir}"
    exit 1
  fi

  log "Scanning ${modules_dir} for malware"

  # clamscan exits 0 for clean, 1 when it finds something, 2 on an error
  # of its own. `|| status=$?` keeps set -e from ending the script before
  # the code can be read.
  status=0
  report="$(clamscan --database="$db_dir" --recursive --infected --no-summary "$modules_dir")" || status=$?

  if [ "$status" -eq 0 ]; then
    log "No malware found"
    return 0
  fi

  if [ "$status" -eq 1 ]; then
    error "Malware found. Remove these files before the content can be published:"
    printf '%s\n' "$report" >&2
    exit 1
  fi

  error "The malware scan could not finish (clamscan exited ${status}), so nothing is published"
  printf '%s\n' "$report" >&2
  exit 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
