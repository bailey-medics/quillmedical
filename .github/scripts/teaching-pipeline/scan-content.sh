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
# in it, which would pass every file. So does a file too large, or taking
# too long, to scan in full: by default ClamAV skips such a file and
# reports it clean, so the limits are raised to the app scanner's
# (backend/scripts/scan_cli.py) and a file past them is a failure. ClamAV must already be installed;
# the workflow installs it, and fetches the definitions, from Quill's
# clamav-mirror image.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "scan-content"

# How large a file ClamAV will scan and read, and how long it may take on
# one, in milliseconds. The same as the app's scanner, in
# backend/scripts/scan_cli.py: 2047 MiB is just under the 2 GiB ClamAV can
# scan at all, and 24 minutes is the time it allows. ClamAV's defaults,
# 25 MB, 100 MB and two minutes, would skip a large file as clean.
CLAMSCAN_LIMITS=(
  "--max-filesize=2047M"
  "--max-scansize=2047M"
  "--max-scantime=1440000"
)

# What ClamAV names a file it could not scan in full, given
# --alert-exceeds-max.
LIMITS_EXCEEDED="Heuristics.Limits.Exceeded"

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
  # --alert-exceeds-max reports a file past the limits rather than
  # skipping it as clean, and --alert-encrypted one ClamAV cannot open.
  report="$(clamscan --database="$db_dir" --recursive --infected --no-summary \
    "${CLAMSCAN_LIMITS[@]}" --alert-exceeds-max=yes --alert-encrypted=yes \
    "$modules_dir")" || status=$?

  if [ "$status" -eq 0 ]; then
    log "No malware found"
    return 0
  fi

  if [ "$status" -eq 1 ] && [[ "$report" == *"$LIMITS_EXCEEDED"* ]]; then
    error "These files are too large, or took too long, to scan in full, so they cannot be published:"
    printf '%s\n' "$report" >&2
    exit 1
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
