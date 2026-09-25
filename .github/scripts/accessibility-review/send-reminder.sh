#!/usr/bin/env bash
# Emails the yearly accessibility statement review reminder, through Resend.
#
# Resend is the email service the app already sends through. Its API key is
# read from GCP Secret Manager by the workflow at run time, not stored in
# GitHub, because GitHub only needs it for this one send.
#
# Usage: send-reminder.sh <recipient> <sender> <reviewed> <due-by>
#
#   recipient  Who is reminded.
#   sender     The From address, on a domain Resend verifies.
#   reviewed   When the statement was last reviewed, e.g. "25 September 2026".
#   due-by     When the next review is due, e.g. "25 September 2027".
#
# Environment:
#   RESEND_API_KEY  Resend API key. Kept out of the arguments, where it would
#                   show in the process list.
#   DRY_RUN         "true" prints the request instead of sending it.

set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "send-reminder"

STATEMENT_URL="https://quill-medical.com/accessibility-statement"

# Print the email's plain-text body.
body() {
  local reviewed="$1"
  local due_by="$2"

  cat <<TEXT
The accessibility statement is due its yearly review by ${due_by}. It was last reviewed on ${reviewed}.

The Public Sector Bodies Accessibility Regulations 2018 require the statement to be reviewed at least once a year, and NHS organisations that buy Quill are bound by them.

The statement: ${STATEMENT_URL}

To review it:

1. Read the statement against the testing log (docs/docs/frontend/accessibility/testing-log.md). Is everything it says still true?
2. Update the known issues: remove anything fixed, and add anything the testing log or users have found since.
3. Check the compliance status. Only move beyond "partially compliant" if testing by people supports it.
4. Check that info@quill-medical.com, the contact the statement gives, is still read.
5. Move the REVIEWED date in frontend/public_pages/src/pages/accessibility-statement.tsx to today, and deploy the public site. That stops these reminders.

This reminder is sent every Monday in September and October until the date is moved, by the accessibility-review workflow.
TEXT
}

# Print the Resend API request body.
payload() {
  local recipient="$1"
  local sender="$2"
  local reviewed="$3"
  local due_by="$4"
  local text

  text="$(body "$reviewed" "$due_by")"

  jq -n \
    --arg from "$sender" \
    --arg to "$recipient" \
    --arg subject "Accessibility statement review due by ${due_by}" \
    --arg text "$text" \
    '{from: $from, to: [$to], subject: $subject, text: $text}'
}

main() {
  local recipient="${1:-}"
  local sender="${2:-}"
  local reviewed="${3:-}"
  local due_by="${4:-}"
  local request
  local status

  if [ -z "$recipient" ] || [ -z "$sender" ] || [ -z "$reviewed" ] || [ -z "$due_by" ]; then
    error "Usage: send-reminder.sh <recipient> <sender> <reviewed> <due-by>"
    return 1
  fi
  if [ "${DRY_RUN:-false}" != "true" ] && [ -z "${RESEND_API_KEY:-}" ]; then
    error "RESEND_API_KEY is not set"
    return 1
  fi

  request="$(payload "$recipient" "$sender" "$reviewed" "$due_by")"

  if [ "${DRY_RUN:-false}" = "true" ]; then
    log "dry run, not sending:"
    echo "$request"
    return 0
  fi

  status="$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    -H "Content-Type: application/json" \
    --data "$request")"
  if [ "$status" != "200" ]; then
    error "Resend refused the email: HTTP $status"
    return 1
  fi

  log "reminder sent to $recipient"
}

# Only run when executed, so the tests can source this file.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
