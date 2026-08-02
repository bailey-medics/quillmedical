#!/usr/bin/env bash
set -euo pipefail

BRANCH="${1}"

# Determine label from branch prefix
if [[ "$BRANCH" == feature/* ]]; then
  LABEL="Feature"
elif [[ "$BRANCH" == hotfix/* ]]; then
  LABEL="Hotfix"
else
  echo "No label for branch prefix"
  exit 0
fi

# Find open PR for this branch
PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number')
if [ -z "$PR_NUMBER" ]; then
  echo "No open PR found for $BRANCH"
  exit 0
fi

# Create label if it doesn't exist (ignore errors if it already exists)
gh label create "$LABEL" --color "0e8a16" --description "Auto-labelled from branch prefix" 2>/dev/null || true

gh pr edit "$PR_NUMBER" --add-label "$LABEL"
echo "Added label '$LABEL' to PR #$PR_NUMBER"
