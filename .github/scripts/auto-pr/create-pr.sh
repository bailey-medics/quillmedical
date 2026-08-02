#!/usr/bin/env bash
# Creates a GitHub pull request for the given branch.
#
# Usage: create-pr.sh <branch-name>
#
# Skips if a pull request already exists.
# Handles the race condition where two workflow runs trigger simultaneously.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "create-pr"

# Check that required single argument is provided
if [ -z "${1:-}" ]; then
  error "No branch name provided. Usage: create-pr.sh <branch-name>"
  exit 1
fi

BRANCH="${1}"

# Skip if a pull request already exists for this branch
EXISTING=$(gh pr list --head "$BRANCH" --state open --json number --jq length)
if [ "$EXISTING" != "0" ]; then
  log "Pull request already exists for $BRANCH, skipping"
  exit 0
fi

# Derive title from branch name (e.g. feature/add-login → "Feature: Add login")
PREFIX=$(echo "$BRANCH" | cut -d'/' -f1)
REMAINDER=$(echo "$BRANCH" | cut -d'/' -f2- | tr '-' ' ')
case "$PREFIX" in
  feature) TYPE="Feature" ;;
  hotfix)  TYPE="Hotfix" ;;
  *)       TYPE="$PREFIX" ;;
esac
TITLE="${TYPE}: ${REMAINDER^}"

# Use pull request template as the initial body
BODY=$(cat .github/pull_request_template.md 2>/dev/null || echo "Auto-created from branch push")

# Create the pull request; exit gracefully if one was created by a concurrent run
if ! gh pr create \
  --title "$TITLE" \
  --body "$BODY" \
  --base main \
  --head "$BRANCH" 2>&1; then
  # Check again — if a pull request now exists, a parallel run created it
  RECHECK=$(gh pr list --head "$BRANCH" --state open --json number --jq length)
  if [ "$RECHECK" != "0" ]; then
    log "Pull request was created by a concurrent run, skipping"
  else
    error "Failed to create pull request and no existing pull request found"
    exit 1
  fi
fi
