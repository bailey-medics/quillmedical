#!/usr/bin/env bash
# Checks every Terraform version in the repository is the one in
# .terraform-version.
#
# Usage: check-terraform-version.sh [host]
#
# Run from the repository root, by the pre-commit hook "Terraform
# versions match .terraform-version" and by the recipes that run
# Terraform. With `host` it checks the `terraform` on the PATH and
# nothing else.
#
# `.terraform-version` is the one place the version is written. The
# workflows read it when they install Terraform. The `required_version`
# floors in infra/ cannot read it: Terraform checks that line before
# anything else, so it must be written out. So this refuses a floor that
# is not ">= " and the pinned version, and a workflow that pins a version
# of its own.
#
# On the PATH it accepts the pinned version or a newer patch release of
# it. An older one is refused by the floors anyway. A newer minor one is
# refused here, because it could write the shared state in a form CI's
# Terraform has not met.
set -euo pipefail

readonly PIN_FILE=".terraform-version"
readonly INFRA_DIR="infra"
readonly WORKFLOWS_DIR=".github/workflows"
readonly WORKFLOW_READS_PIN="steps.terraform-version.outputs.version"

# Prints the first two parts of a version: 1.15 from 1.15.8.
minor_of() {
  local version="$1"

  cut -d. -f1,2 <<<"$version"
}

# True when the first version is the same as the second or newer.
at_least() {
  local found="$1"
  local wanted="$2"
  local lowest

  lowest="$(printf '%s\n%s\n' "$found" "$wanted" | sort -V | head -n 1)"

  [ "$lowest" = "$wanted" ]
}

# Prints each `required_version` in infra/ as `file:line:value`, one to
# a line. Provider downloads under .terraform/ are not ours, so are skipped.
required_versions() {
  { grep -rn --include='*.tf' --exclude-dir=.terraform \
      -E '^[[:space:]]*required_version[[:space:]]*=' "$INFRA_DIR" || true; } \
    | sed -E 's/^([^:]+:[0-9]+):[[:space:]]*required_version[[:space:]]*=[[:space:]]*"([^"]*)".*/\1:\2/'
}

# Prints each `terraform_version:` line in the workflows that does not
# read .terraform-version, as `file:line:text`.
workflow_pins() {
  { grep -rn -E '^[[:space:]]*terraform_version:' "$WORKFLOWS_DIR" || true; } \
    | { grep -v -F "$WORKFLOW_READS_PIN" || true; }
}

# Prints the version of the `terraform` first on the PATH, or nothing
# when there is none. Its own function so the tests can stand in for it.
host_terraform() {
  terraform version 2>/dev/null \
    | sed -n -E 's/^Terraform v([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' \
    | head -n 1 \
    || true
}

# Refuses when the `terraform` on the PATH is not the pinned version or a
# newer patch release of it.
check_host_terraform() {
  local pinned="$1"
  local found=""

  found="$(host_terraform)"

  if [ -z "$found" ]; then
    echo "There is no terraform on the PATH." >&2
    echo "Install Terraform ${pinned}, which is what this repository is pinned to (${PIN_FILE})." >&2
    return 1
  fi

  if [ "$(minor_of "$found")" = "$(minor_of "$pinned")" ] && at_least "$found" "$pinned"; then
    return 0
  fi

  echo "terraform on this machine is Terraform ${found} ($(command -v terraform))." >&2
  echo "This repository is pinned to ${pinned} (${PIN_FILE}), which is what CI runs." >&2
  echo "Install Terraform ${pinned}: https://developer.hashicorp.com/terraform/install" >&2

  return 1
}

# Refuses any `required_version` that is not ">= " and the pinned version,
# and an infra/ with none at all.
check_floors() {
  local pinned="$1"
  local wanted=">= ${pinned}"
  local found_any=""
  local entry
  local place
  local value

  while IFS= read -r entry; do
    found_any="yes"
    place="${entry%:*}"
    value="${entry##*:}"

    if [ "$value" != "$wanted" ]; then
      echo "${place} says required_version = \"${value}\"." >&2
      echo "This repository is pinned to ${pinned} (${PIN_FILE})." >&2
      echo "Change it to: required_version = \"${wanted}\"" >&2
      return 1
    fi
  done < <(required_versions)

  if [ -z "$found_any" ]; then
    echo "No required_version was found in ${INFRA_DIR}/. Run this from the repository root." >&2
    return 1
  fi
}

# Refuses a workflow that pins a Terraform version of its own.
check_workflows() {
  local pinned="$1"
  local entry

  entry="$(workflow_pins | head -n 1)"

  if [ -n "$entry" ]; then
    echo "$(cut -d: -f1,2 <<<"$entry") pins a Terraform version of its own." >&2
    echo "Read it from ${PIN_FILE} instead (${pinned} today), as the other Terraform steps do:" >&2
    echo "  terraform_version: \${{ ${WORKFLOW_READS_PIN} }}" >&2
    return 1
  fi
}

main() {
  local scope="${1:-}"
  local pinned=""

  if [ -n "$scope" ] && [ "$scope" != "host" ]; then
    echo "Unknown argument: ${scope}. Usage: check-terraform-version.sh [host]" >&2
    exit 1
  fi

  if [ ! -f "$PIN_FILE" ]; then
    echo "${PIN_FILE} is not here, so there is no pinned Terraform to check against. Run this from the repository root." >&2
    exit 1
  fi

  pinned="$(tr -d '[:space:]' < "$PIN_FILE")"

  if [[ ! "$pinned" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "${PIN_FILE} holds \"${pinned}\", which is not a version such as 1.15.8." >&2
    exit 1
  fi

  if [ "$scope" = "host" ]; then
    check_host_terraform "$pinned" || exit 1
    return 0
  fi

  check_floors "$pinned" || exit 1
  check_workflows "$pinned" || exit 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
