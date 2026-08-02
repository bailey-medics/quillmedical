#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1}"

# Skip if a PR already exists for this branch
EXISTING=$(gh pr list --head "$BRANCH" --state open --json number --jq length)
if [ "$EXISTING" != "0" ]; then
  echo "PR already exists for $BRANCH, skipping"
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

# Use PR template as the initial body
BODY=$(cat .github/pull_request_template.md 2>/dev/null || echo "Auto-created from branch push")

# Create the PR; exit gracefully if one was created by a concurrent run
if ! gh pr create \
  --title "$TITLE" \
  --body "$BODY" \
  --base main \
  --head "$BRANCH" 2>&1; then
  # Check again — if a PR now exists, a parallel run created it
  RECHECK=$(gh pr list --head "$BRANCH" --state open --json number --jq length)
  if [ "$RECHECK" != "0" ]; then
    echo "PR was created by a concurrent run, skipping"
  else
    echo "Failed to create PR and no existing PR found"
    exit 1
  fi
fi
