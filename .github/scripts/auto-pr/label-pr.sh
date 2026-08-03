#!/usr/bin/env bash
# Adds a label to the open pull request for the given branch.
#
# Usage: label-pr.sh <branch-name>
#
# Creates the label on GitHub if it does not already exist.
# Skips if no open pull request is found for the branch.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "label-pr"

if [ -z "${1:-}" ]; then
  error "No branch name provided. Usage: label-pr.sh <branch-name>"
  exit 1
fi

BRANCH="${1}"

# Determine label from branch prefix
if [[ "$BRANCH" == feature/* ]]; then
  LABEL="Feature"
elif [[ "$BRANCH" == hotfix/* ]]; then
  LABEL="Hotfix"
else
  log "No label defined for branch prefix, skipping"
  exit 0
fi

# Find open pull request for this branch
PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number')
if [ -z "$PR_NUMBER" ]; then
  log "No open pull request found for $BRANCH, skipping"
  exit 0
fi

# Create label if it does not already exist
gh label create "$LABEL" --color "0e8a16" --description "Auto-labelled from branch prefix" 2>/dev/null || true

gh pr edit "$PR_NUMBER" --add-label "$LABEL"
log "Added label '$LABEL' to pull request #$PR_NUMBER"
