#!/usr/bin/env bash
# Make the folder the end-to-end stack writes its emails to.
#
# compose.ci.yml mounts frontend/e2e/.mail/ into the backend at /e2e-mail,
# and EMAIL_CAPTURE_DIR has the backend write every dry-run email there as
# a JSON file. The Playwright fixture e2e/fixtures/mail.ts reads it to
# follow the link in an invite.
#
# The backend runs as its own unprivileged user, not as whoever runs the
# tests. A folder Docker made for the mount would belong to root, and one
# made by the runner would belong to the runner, and on a Linux host the
# backend could write to neither. So the folder is made here, before the
# stack starts, and left writable by anyone. It only ever holds throwaway
# accounts' email: the settings refuse EMAIL_CAPTURE_DIR outside testing.
#
# Emails from an earlier run are cleared, so a test never finds an old
# one. One the backend wrote may not be removable by the runner on Linux;
# that is fine, since every test sends to an address it has just made.
#
# Used by the heavy_e2e job in .github/workflows/ci.yml and by `just e2e`.
#
# Usage: prepare-e2e-mail.sh [folder]

set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "prepare-e2e-mail"

# Make the folder, empty it of earlier emails, and open it to every user.
#
# Args: <folder>
prepare_mail_folder() {
  local folder="$1"

  mkdir -p "$folder"
  find "$folder" -maxdepth 1 -name '*.json' -delete 2>/dev/null || true
  chmod 0777 "$folder"
  log "Ready at ${folder}"
}

main() {
  local root
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
  prepare_mail_folder "${1:-${root}/frontend/e2e/.mail}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
