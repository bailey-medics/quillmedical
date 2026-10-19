#!/usr/bin/env bash
# Turns the `replace` input of a terraform.yml dispatch into a `-replace=`
# argument for `terraform apply`, or refuses it.
#
# Usage: replace-argument.sh <resource-address>
#
# The address may be empty, which is the ordinary dispatch and adds nothing
# to the apply. Otherwise it must be one of the generated secrets below:
# `-replace` on a resource regenerates it, and for these that is how a
# Terraform-generated secret is rotated (docs/docs/infrastructure/gcp.md,
# "Rotating a secret"). Anything else is refused before Terraform runs, so
# the dispatch cannot be used to replace a database, a bucket or a service.
#
# The VAPID placeholder is deliberately absent. Its secret holds the real key
# as a later version, added by hand, and regenerating the placeholder would
# write another placeholder over it.
#
# Environment:
#   GITHUB_OUTPUT   Destination file for `argument=<-replace=... or empty>`
#                   (set by the runner).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "replace-argument"

# The generated secrets a dispatch may regenerate, one address per line. A
# database password's module also sets the new value on the database user in
# the same apply, which is why the address is the module's resource and not
# the Secret Manager version.
ALLOWED_ADDRESSES='random_password.jwt_secret
module.cloud_sql_core.random_password.db_password
module.cloud_sql_fhir[0].random_password.db_password
module.cloud_sql_ehrbase[0].random_password.db_password
module.teaching_video_pipeline[0].random_bytes.signing_key'

# Print the allow-list, one address per line.
allowed_addresses() {
  printf '%s\n' "$ALLOWED_ADDRESSES"
}

# Whether $1 is exactly one of the allowed addresses.
is_allowed() {
  local address="$1"

  allowed_addresses | grep -qxF -- "$address"
}

# Print the apply argument for $1: nothing for an empty address, `-replace=`
# and the address when it is allowed, and a failure naming the list when it
# is not. Pure, so the test can call it directly.
replace_argument() {
  local address="$1"

  if [ -z "$address" ]; then
    return 0
  fi

  if ! is_allowed "$address"; then
    error "Refusing to replace '${address}': not a generated secret."
    error "The addresses a dispatch may replace are:"
    allowed_addresses >&2
    return 1
  fi

  printf -- '-replace=%s' "$address"
}

main() {
  local address="${1:-}"
  local argument

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT not set (not running in GitHub Actions?)"
    exit 1
  fi

  # Checked explicitly rather than left to `set -e`: a refusal must stop the
  # job whether or not the caller runs with errexit, and bats does not.
  if ! argument="$(replace_argument "$address")"; then
    exit 1
  fi

  if [ -n "$argument" ]; then
    log "This apply regenerates ${address}"
  else
    log "No resource to replace; an ordinary apply"
  fi

  echo "argument=${argument}" >>"$GITHUB_OUTPUT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
