#!/usr/bin/env bash
# Emails the yearly accessibility statement review reminder, through
# Amazon SES in London.
#
# SES is the email service the app sends through. The access key is the
# app's own, which can send from eu-west-2 and do nothing else. The
# workflow reads it from GCP Secret Manager at run time, not from GitHub,
# because GitHub only needs it for this one send. It went through Resend
# until Resend was retired: see
# docs/docs/plans/2026-10-06-amazon-ses-email-plan.md.
#
# Usage: send-reminder.sh <recipient> <sender> <reviewed> <due-by>
#
#   recipient  Who is reminded.
#   sender     The From address, on a domain SES has verified.
#   reviewed   When the statement was last reviewed, e.g. "25 September 2026".
#   due-by     When the next review is due, e.g. "25 September 2027".
#
# Environment:
#   AWS_ACCESS_KEY_ID      The access key, read by the AWS command line
#   AWS_SECRET_ACCESS_KEY  tool. Kept out of the arguments, where they
#                          would show in the process list.
#   DRY_RUN                "true" prints the request instead of sending it.

set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "send-reminder"

STATEMENT_URL="https://quill-medical.com/accessibility-statement"

# Where SES is used. Everything in SES is per region, and a send from
# another one would be email data outside the UK.
SES_REGION="eu-west-2"

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

This reminder is sent every Monday until the date is moved, by the accessibility-review workflow.
TEXT
}

# Print the request, in the shape `aws sesv2 send-email` takes.
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
    '{
      FromEmailAddress: $from,
      Destination: {ToAddresses: [$to]},
      Content: {Simple: {Subject: {Data: $subject}, Body: {Text: {Data: $text}}}}
    }'
}

main() {
  local recipient="${1:-}"
  local sender="${2:-}"
  local reviewed="${3:-}"
  local due_by="${4:-}"
  local request

  if [ -z "$recipient" ] || [ -z "$sender" ] || [ -z "$reviewed" ] || [ -z "$due_by" ]; then
    error "Usage: send-reminder.sh <recipient> <sender> <reviewed> <due-by>"
    return 1
  fi
  if [ "${DRY_RUN:-false}" != "true" ] &&
    { [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; }; then
    error "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not both set"
    return 1
  fi

  request="$(payload "$recipient" "$sender" "$reviewed" "$due_by")"

  if [ "${DRY_RUN:-false}" = "true" ]; then
    log "dry run, not sending:"
    echo "$request"
    return 0
  fi

  # The tool's own output is the message id, which nobody needs. Its
  # error says why SES refused, and never holds the key.
  if ! aws sesv2 send-email \
    --region "$SES_REGION" \
    --cli-input-json "$request" \
    --no-cli-pager >/dev/null; then
    error "SES refused the email"
    return 1
  fi

  log "reminder sent to $recipient"
}

# Only run when executed, so the tests can source this file.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
