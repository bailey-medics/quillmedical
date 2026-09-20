#!/usr/bin/env bash
# Reports when the TypeScript major-version hold can be lifted.
#
# renovate.json holds major TypeScript upgrades behind Dependency Dashboard
# approval, because typescript-eslint refuses to load against the TS 7 API:
# it throws at import time and declares a peer range that stops short of 7.
# The eslint job therefore fails before it lints a single file.
#
# A hold like that has no natural end. Nothing in Renovate watches for the
# day it stops being necessary, and a note in a config file reminds nobody —
# the Python 3.13.x pin beside it said "Revisit Q3 2026" while the Dockerfiles
# had already moved to 3.14. So this checks the one fact that decides it:
# whether typescript-eslint's own declared peer range has come to allow the
# held TypeScript major.
#
# Prints its finding on standard output, and writes it to GITHUB_OUTPUT as
# `liftable` when running inside GitHub Actions.
#
# A liftable hold is a finding, not a broken job, so it does not fail the
# step. The workflow keys its issue off the `liftable` output instead. Only
# being unable to read the peer range is a failure.
#
# Usage: check-typescript-hold.sh
#
# Environment:
#   HELD_MAJOR     TypeScript major the hold is keeping out. Default 7.
#   PEER_RANGE     Peer range to inspect instead of asking npm. Used by the
#                  tests, and by hand to rehearse a range that has not
#                  shipped yet.
#   GITHUB_OUTPUT  Destination for `liftable`, when set by the runner.
#
# Exit codes:
#   0  ran successfully, whether or not the hold can be lifted
#   1  could not read typescript-eslint's peer range
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-typescript-hold"

# Delimiter for the heredoc form of GITHUB_OUTPUT, the only way to pass a
# value containing newlines between steps. A report containing this line on
# its own would let it inject arbitrary step outputs, so main refuses that.
readonly OUTPUT_DELIMITER="TYPESCRIPT_HOLD_EOF"

# Asks npm what typescript-eslint declares as its `typescript` peer range.
#
# The peer range is the authority here, not the runtime error message: it is
# what the package promises to work against, and npm and yarn both warn
# against violating it. Today it reads ">=4.8.4 <6.1.0".
fetch_peer_range() {
  npm view typescript-eslint peerDependencies.typescript 2>/dev/null
}

# Prints every explicit upper bound in a range, one per line, without the
# "<" and any surrounding space.
#
#   ">=4.8.4 <6.1.0"            -> 6.1.0
#   ">=4.8.4 <6.1.0 || <8.0.0"  -> 6.1.0
#                                  8.0.0
#
# "<=" is deliberately not matched. It is not a form typescript-eslint uses,
# and treating "<=7.0.0" as "<7.0.0" would under-report rather than
# over-report — the wrong way round for something whose job is to remind.
upper_bounds() {
  grep -oE '<[[:space:]]*[0-9]+(\.[0-9]+){0,2}' <<<"$1" |
    sed -E 's/^<[[:space:]]*//' || true
}

# True when dotted version $1 is strictly lower than dotted version $2.
#
# Missing components count as zero, so "6" and "6.0.0" compare equal. A
# pre-release suffix is dropped, so 7.0.0-rc compares as 7.0.0: close enough
# for deciding whether a major is in range, and it keeps the comparison from
# choking on a range that quotes one.
version_lt() {
  local left="$1"
  local right="$2"
  local -a left_parts right_parts
  local index l r

  IFS=. read -r -a left_parts <<<"${left%%-*}"
  IFS=. read -r -a right_parts <<<"${right%%-*}"

  for index in 0 1 2; do
    l="${left_parts[index]:-0}"
    r="${right_parts[index]:-0}"

    # A non-numeric component means the range was not the shape we thought.
    # Treat it as "not lower" so the caller falls through to the unparseable
    # path rather than quietly deciding the hold is liftable.
    [[ "$l" =~ ^[0-9]+$ ]] || return 1
    [[ "$r" =~ ^[0-9]+$ ]] || return 1

    if ((10#$l < 10#$r)); then return 0; fi
    if ((10#$l > 10#$r)); then return 1; fi
  done

  return 1
}

# Prints the most permissive of the upper bounds it is given.
#
# A range joined with "||" can carry several. The highest one is what decides
# whether a version is allowed anywhere in the range.
highest_bound() {
  local highest=""
  local bound

  while read -r bound; do
    [ -n "$bound" ] || continue
    if [ -z "$highest" ] || version_lt "$highest" "$bound"; then
      highest="$bound"
    fi
  done

  echo "$highest"
}

# Decides what to say about a peer range, or says nothing at all.
#
# Prints a report when the held major is allowed, or when the range is a
# shape this cannot read. Silence means the hold is still needed.
#
# Takes the range as an argument and returns its result on standard output,
# so the caller reads as a plain assignment.
hold_report() {
  local range="$1"
  local major="$2"
  local bounds
  local highest

  bounds="$(upper_bounds "$range")"
  highest="$(echo "$bounds" | highest_bound)"

  if [ -z "$highest" ]; then
    # No explicit upper bound. ">=4.8.4" really is open-ended, but "^6.0.0"
    # caps the major without ever writing "<", and reading that as
    # open-ended would raise a false alarm every month. Say so instead.
    #
    # Matched as globs rather than a regex: [[ =~ ]] strips the backslash
    # from an unquoted [\^~] first, leaving the negated class [^~], which
    # matches nearly everything and sent ">=4.8.4" down this branch.
    if [[ "$range" == *"^"* || "$range" == *"~"* ]]; then
      echo "Could not read typescript-eslint's peer range: \`${range}\`"
      echo "It caps the major without an explicit upper bound, so this check"
      echo "cannot decide. Check by hand whether TypeScript ${major} is allowed."
      return 0
    fi

    echo "typescript-eslint's peer range is \`${range}\`, which sets no upper"
    echo "bound, so TypeScript ${major} is allowed."
    return 0
  fi

  if version_lt "${major}.0.0" "$highest"; then
    echo "typescript-eslint now allows TypeScript ${major}."
    echo "Its peer range is \`${range}\`."
    return 0
  fi

  return 0
}

main() {
  local major="${HELD_MAJOR:-7}"
  local range

  if [ -n "${PEER_RANGE:-}" ]; then
    range="$PEER_RANGE"
  elif ! range="$(fetch_peer_range)" || [ -z "$range" ]; then
    error "Could not read typescript-eslint's typescript peer range from npm"
    return 1
  fi

  local report
  report="$(hold_report "$range" "$major")"

  if [ -z "$report" ]; then
    log "TypeScript ${major} is still outside typescript-eslint's peer range (${range}). Hold stands."
  else
    echo "$report"
  fi

  publish_step_output "$report"
}

# Hands the report to the workflow as the `liftable` step output, so the
# issue job can fire on it. Does nothing outside Actions, which is what keeps
# the script runnable by hand.
publish_step_output() {
  local report="$1"

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    return 0
  fi

  if grep -qxF "$OUTPUT_DELIMITER" <<<"$report"; then
    error "Report contains the output delimiter on a line of its own; refusing to write it."
    return 1
  fi

  {
    echo "liftable<<${OUTPUT_DELIMITER}"
    if [ -n "$report" ]; then
      echo "$report"
    fi
    echo "$OUTPUT_DELIMITER"
  } >>"$GITHUB_OUTPUT"
}

# Only run when executed, so the tests can source this file.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
