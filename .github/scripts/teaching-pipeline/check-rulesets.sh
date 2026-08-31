#!/usr/bin/env bash
# Fails if a teaching content repository has no branch protection rulesets.
#
# Usage: check-rulesets.sh <owner/repo>
#
# Catches a content repo that was onboarded without being added to the
# Terraform in quillmedical/infra/github/, which would otherwise leave its
# main branch unprotected with no obvious signal.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "check-rulesets"

main() {
  local repo="${1:-}"

  if [ -z "$repo" ]; then
    error "No repository provided. Usage: check-rulesets.sh <owner/repo>"
    exit 1
  fi

  local rulesets
  rulesets=$(gh api "repos/${repo}/rulesets" --jq 'length')

  if [ "$rulesets" -eq 0 ]; then
    error "No branch protection rulesets found on ${repo}."
    error "Add this repo to teaching_repos in quillmedical/infra/github/"
    exit 1
  fi

  log "Found ${rulesets} active ruleset(s)"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
