#!/usr/bin/env bash
# Make the key pair the end-to-end tests stand in for the video jobs with.
#
# The jobs report a finished transcode or caption with a Google-signed
# identity token, which nothing in the test stack can get. So, there only,
# the backend checks the token against a public key made here, set by
# TEACHING_JOB_CALLBACK_TEST_KEY_FILE in compose.ci.yml, and
# e2e/fixtures/mediaJobs.ts signs its reports with the private half.
# Everything else about the token is checked as Google's are.
#
# A new pair every run, never committed: a private key in the repository,
# even a test one, is what the secret scan exists to stop. The settings
# refuse the test key anywhere but BACKEND_ENV=testing.
#
# Readable by every user, because the backend reads the public half as its
# own user. Both halves are throwaway, and the folder is gitignored.
#
# Used by the heavy_e2e job in .github/workflows/ci.yml, by
# guide-screenshots.yml and by `just e2e`.
#
# Usage: prepare-e2e-job-key.sh [folder]
#
# cspell:words genpkey pkeyopt keygen pubout

set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "prepare-e2e-job-key"

# Make a fresh RSA key pair in a folder, as private.pem and public.pem.
#
# Args: <folder>
make_job_key() {
  local folder="$1"

  mkdir -p "$folder"
  rm -f "$folder/private.pem" "$folder/public.pem"

  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out "$folder/private.pem" 2>/dev/null
  openssl pkey -in "$folder/private.pem" -pubout -out "$folder/public.pem"

  chmod 0755 "$folder"
  chmod 0644 "$folder/private.pem" "$folder/public.pem"
  log "Ready at ${folder}"
}

main() {
  local root

  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
  make_job_key "${1:-${root}/frontend/e2e/.job-key}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
