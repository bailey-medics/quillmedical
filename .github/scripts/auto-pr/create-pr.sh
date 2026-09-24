#!/usr/bin/env bash
# Creates a GitHub pull request for the given branch.
#
# Usage: create-pr.sh <branch-name>
#
# Idempotent. When a pull request already exists it is left alone, except that
# an empty description is filled in with the placeholder — a tool that opened
# the pull request ahead of this workflow leaves one behind. A branch whose
# pull request has merged or closed gets no new one, and a new pull request
# waits AUTO_PR_WAIT_SECONDS (default 60) first, so a stacked branch is left
# to gh-stack.
# Handles the race condition where two workflow runs trigger simultaneously.
set -euo pipefail

# Sourced via BASH_SOURCE rather than $0 so the path still resolves when a
# test sources this file: under bats, $0 is bats itself.
# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "create-pr"

# The placeholder body. This repository has no pull request template; the real
# description is written when the branch is finished (see /crp final).
placeholder_body() {
  cat <<'EOF'
**Placeholder for the PR description**

You can autogenerate a PR description covering the whole PR if you are using
VSCode Copilot or Claude Code. Run the below in the chat:

```
/crp final
```
EOF
}

# Title from branch name, e.g. feature/add-login → "Feature: Add login".
title_for_branch() {
  local branch="$1"
  local prefix
  local remainder
  local type

  prefix=$(echo "$branch" | cut -d'/' -f1)
  remainder=$(echo "$branch" | cut -d'/' -f2- | tr '-' ' ')

  case "$prefix" in
    feature) type="Feature" ;;
    hotfix)  type="Hotfix" ;;
    *)       type="$prefix" ;;
  esac

  # `${remainder^}` would be shorter, but it is bash 4 syntax and macOS ships
  # bash 3.2 — see docs/docs/plans/2026-09-02-bats-ubuntu-parity-plan.md.
  printf '%s: %s%s\n' \
    "$type" \
    "$(printf '%s' "${remainder:0:1}" | tr '[:lower:]' '[:upper:]')" \
    "${remainder:1}"
}

# The prose a reader would actually see in a pull request body.
#
# A tool's own footer does not count as a description. gh-stack writes its
# stack links as a single <sub>…</sub> line, so that element is removed whole
# — dropping only its tags would leave "GitHub Stacks CLI" behind and make an
# otherwise empty body look written. HTML comments and any remaining tags go
# too, then all whitespace: what survives is real text or nothing.
visible_prose() {
  printf '%s' "$1" \
    | sed -e 's|<sub>.*</sub>||g' -e 's/<!--.*-->//g' -e 's/<[^>]*>//g' \
    | tr -d '[:space:]'
}

# Fill in the placeholder on a pull request that has no description of its own.
#
# `gh stack submit` pushes the branch and opens the pull request itself,
# seconds ahead of this workflow, so a stacked pull request arrives carrying
# only gh-stack's footer. A description someone wrote is never overwritten.
describe_existing() {
  local branch="$1"
  local number
  local current
  local new_body

  number=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number')
  current=$(gh pr view "$number" --json body --jq '.body')

  if [ -n "$(visible_prose "$current")" ]; then
    log "Pull request #${number} already exists for ${branch} with a description, skipping"
    return 0
  fi

  log "Pull request #${number} exists for ${branch} with no description, filling in the placeholder"

  # The footer is kept below the placeholder: it is what links the pull
  # request to its stack.
  if [ -n "$current" ]; then
    new_body="$(placeholder_body)"$'\n\n'"${current}"
  else
    new_body="$(placeholder_body)"
  fi

  gh pr edit "$number" --body "$new_body"
}

# How long to wait before opening a pull request, in seconds. See main().
AUTO_PR_WAIT_SECONDS="${AUTO_PR_WAIT_SECONDS:-60}"

# The number of open pull requests for the branch.
open_count() {
  gh pr list --head "$1" --state open --json number --jq length
}

# The number of pull requests for the branch that have merged or closed.
finished_count() {
  gh pr list --head "$1" --state all --json state \
    --jq '[.[] | select(.state != "OPEN")] | length'
}

main() {
  local branch="${1:-}"
  local existing
  local recheck

  if [ -z "$branch" ]; then
    error "No branch name provided. Usage: create-pr.sh <branch-name>"
    exit 1
  fi

  existing=$(open_count "$branch")
  if [ "$existing" != "0" ]; then
    describe_existing "$branch"
    exit 0
  fi

  # A branch whose pull request has already merged or closed is finished.
  # A push to it is not new work: it is what merging a stacked pull request
  # into a base that had itself already merged looks like, and a pull
  # request opened for it would carry the stack's commits to main in one
  # lump, past the order they were meant to deploy in.
  if [ "$(finished_count "$branch")" != "0" ]; then
    log "A pull request for ${branch} has already merged or closed, skipping"
    exit 0
  fi

  # `gh stack submit` pushes a branch and then opens its pull request against
  # the branch below, a few seconds later. Opened first, a pull request here
  # would be against main, and gh-stack cannot re-point a pull request it
  # did not open. So wait, and leave the branch to gh-stack if it answered.
  if [ "$AUTO_PR_WAIT_SECONDS" -gt 0 ]; then
    log "Waiting ${AUTO_PR_WAIT_SECONDS}s in case a stack opens the pull request"
    sleep "$AUTO_PR_WAIT_SECONDS"
  fi
  existing=$(open_count "$branch")
  if [ "$existing" != "0" ]; then
    describe_existing "$branch"
    exit 0
  fi

  # Create the pull request as a draft; exit gracefully if one was created by
  # a concurrent run. Draft holds back the heavy CI tier until marked ready.
  if ! gh pr create \
    --title "$(title_for_branch "$branch")" \
    --body "$(placeholder_body)" \
    --base main \
    --head "$branch" \
    --draft 2>&1; then
    # Check again — if a pull request now exists, a parallel run created it
    recheck=$(open_count "$branch")
    if [ "$recheck" != "0" ]; then
      log "Pull request was created by a concurrent run, skipping"
    else
      error "Failed to create pull request and no existing pull request found"
      exit 1
    fi
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
