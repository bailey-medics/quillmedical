#!/usr/bin/env bash
# Fails the build if this PR removes a competency from the shared catalogue,
# or brings a retired one back. Retiring is the only change allowed.
#
# Usage: check-competencies-not-deleted.sh [<main-ref>]
#
# Fails directly rather than routing to a gate: there is no legitimate case to
# approve, in the same way there is none for rewriting a merged migration.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-competencies-not-deleted"

CATALOGUE="shared/competencies.yaml"

# Every competency in one revision of the catalogue, as "<id><TAB>active" or
# "<id><TAB>retired", sorted.
#
# Deliberately awk rather than a YAML parser: this runs before any Python
# environment exists, and the file's shape is fixed by the Pydantic model that
# reads it. An entry is retired when a `retired_on:` line follows its `- id:`
# before the next one begins.
entries_at_ref() {
  local ref="$1"

  git show "${ref}:${CATALOGUE}" 2>/dev/null \
    | awk '
        /^[[:space:]]*-[[:space:]]+id:/ {
          if (id != "") print id "\t" state
          id = $0
          sub(/^[[:space:]]*-[[:space:]]+id:[[:space:]]*/, "", id)
          gsub(/\042|\047/, "", id)
          sub(/[[:space:]]*$/, "", id)
          state = "active"
          next
        }
        /^[[:space:]]*retired_on:/ { if (id != "") state = "retired" }
        END { if (id != "") print id "\t" state }
      ' \
    | sort
}

# Just the ids, for the deletion comparison.
ids_at_ref() {
  local ref="$1"

  entries_at_ref "${ref}" | cut -f1
}

# Ids present on the base ref and absent from this branch.
deleted_ids() {
  local base_ref="$1"

  comm -23 \
    <(ids_at_ref "${base_ref}") \
    <(ids_at_ref "HEAD")
}

# Ids that were retired on the base ref and are current again on this branch.
#
# Retirement is one way. Bringing one back quietly makes a competency
# available for granting again, which is a change to who may do what made by
# editing a configuration file - the thing this check exists to prevent. A
# competency that should be available again is a new entry with a new id, so
# the record of what the old one meant stays intact.
revived_ids() {
  local base_ref="$1"

  comm -12 \
    <(entries_at_ref "${base_ref}" | awk -F'\t' '$2 == "retired" { print $1 }') \
    <(entries_at_ref "HEAD" | awk -F'\t' '$2 == "active" { print $1 }')
}

main() {
  local main_ref="${1:-origin/main}"

  if ! git show "${main_ref}:${CATALOGUE}" >/dev/null 2>&1; then
    log "No ${CATALOGUE} on ${main_ref}; nothing to compare against."
    return 0
  fi

  local revived_list
  revived_list="$(revived_ids "${main_ref}")"

  if [ -n "${revived_list}" ]; then
    error "This PR makes retired competencies current again in ${CATALOGUE}:"

    local competency
    while IFS= read -r competency; do
      [ -n "${competency}" ] && error "  ${competency}"
    done <<< "${revived_list}"

    error ""
    error "Retirement is one way. Removing a 'retired_on:' line makes the"
    error "competency available for granting again, which is a change to who"
    error "may do what, made by editing a configuration file."
    error ""
    error "If it should be available again, add a NEW entry with a new id, so"
    error "the record of what the old one meant stays intact."
    exit 1
  fi

  local deleted
  deleted="$(deleted_ids "${main_ref}")"

  if [ -z "${deleted}" ]; then
    log "No competency was removed from or revived in ${CATALOGUE}."
    return 0
  fi

  error "This PR removes competencies from ${CATALOGUE}:"

  local id

  while IFS= read -r id; do
    [ -n "${id}" ] && error "  ${id}"
  done <<< "${deleted}"

  error ""
  error "Competencies are retired, never deleted. Deleting one revokes"
  error "nothing - everyone who holds it keeps the access, it just stops"
  error "being describable - and it destroys the vocabulary the audit trail"
  error "needs to say what someone was authorised to do."
  error ""
  error "Add 'retired_on: YYYY-MM-DD' to the entry instead. Retired"
  error "competencies stay readable and are refused at write boundaries, so"
  error "no new ones can be granted."
  error ""
  exit 1
}

# Only run when executed directly, so bats can source the pure functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
