#!/usr/bin/env bash
# Scans the commits a branch adds for secrets, after proving the scan works.
#
# Usage: run-gitleaks.sh <base-ref>
#
# <base-ref> is what the branch is measured against, such as origin/main.
# Every commit reachable from HEAD and not from it is scanned. Needs the
# full history, so the job checks out with fetch-depth: 0.
#
# The pre-commit hook scans what is staged, on the machine that commits.
# A commit made where the hook is not installed, or pushed with
# --no-verify, never meets it. This is the same scan run where every
# commit has to pass.
#
# It proves itself first. gitleaks exits 0 when it finds nothing, and it
# finds nothing when it has no rules: for a long time .gitleaks.toml gave
# it none and every scan passed. So before the real scan this writes a
# made-up key into a scratch folder and checks gitleaks reports it. If it
# does not, the job fails without scanning: a scan that cannot find a
# planted key has not shown that the commits are clean.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-gitleaks"

readonly CONFIG=".gitleaks.toml"

# Writes a file holding a made-up AWS access key into a folder.
#
# Made here and not kept in the repository, where the scan would find it.
# The shape is what the rule looks for: its four-letter prefix and sixteen
# characters from A-Z and 2-7. Fixed and not random, so a failure can be reproduced, and
# built from two halves so this script does not hold the key itself.
plant_canary() {
  local folder="$1"
  # cspell:disable-next-line
  local prefix="AKIA"
  local body="Q7ZXN2MHR5TB3WLK"

  printf 'aws_access_key_id = "%s%s"\n' "$prefix" "$body" > "${folder}/settings.ini"
}

# Checks gitleaks reports the planted key, with the rules this
# repository gives it.
prove_the_rules_fire() {
  local scratch=""
  scratch="$(mktemp -d)"

  plant_canary "$scratch"

  local exit_code=0
  gitleaks dir --config "$CONFIG" --redact --no-banner "$scratch" >/dev/null 2>&1 || exit_code=$?

  rm -rf "$scratch"

  if [ "$exit_code" -eq 0 ]; then
    error "gitleaks did not report a planted key, so its rules are not firing. Check ${CONFIG} still has '[extend] useDefault = true'. Nothing was scanned"
    return 1
  fi

  log "gitleaks reported the planted key, so its rules are firing"
}

# Scans every commit on this branch that the base does not have.
scan_commits() {
  local base_ref="$1"
  local count=""
  count="$(git rev-list --count "${base_ref}..HEAD")"

  log "Scanning ${count} commit(s) not on ${base_ref}"

  if ! gitleaks git --config "$CONFIG" --redact --no-banner --log-opts="${base_ref}..HEAD" .; then
    error "gitleaks found something that looks like a secret in these commits. If it is real, treat it as leaked: rotate it, then remove it from the commit. If it is not, add a narrow entry to ${CONFIG} saying what it is"
    return 1
  fi

  log "No secrets found in ${count} commit(s)"
}

main() {
  local base_ref="${1:-}"

  if [ -z "$base_ref" ]; then
    error "No base ref given. Usage: run-gitleaks.sh <base-ref>"
    exit 1
  fi

  if [ ! -f "$CONFIG" ]; then
    error "${CONFIG} is not there, so gitleaks has no rules to scan with"
    exit 1
  fi

  if ! git rev-parse --verify --quiet "${base_ref}^{commit}" >/dev/null; then
    error "${base_ref} is not a commit this checkout has. The job needs fetch-depth: 0"
    exit 1
  fi

  prove_the_rules_fire
  scan_commits "$base_ref"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
