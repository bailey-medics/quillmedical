#!/usr/bin/env bash
# Is the accessibility statement due its yearly review?
#
# The Public Sector Bodies Accessibility Regulations 2018 require the
# statement to be reviewed at least once a year and to say when it last was.
# The date lives in the statement itself, as `const REVIEWED = "…"` in
# accessibility-statement.tsx, so moving it after a review is what stops the
# reminders: there is no issue to close and nothing else to remember.
#
# Due when the last review is 11 months old or more, giving a month's notice
# before the year runs out.
#
# Usage: statement-review.sh [force]
#
#   force  "true" reports the review due whatever the date, for a manual
#          test run of the reminder. Defaults to "false".
#
# Environment:
#   STATEMENT_FILE  Path to the statement page. Defaults to the real one.
#   TODAY           YYYY-MM-DD to treat as today. Defaults to the real date;
#                   set by the tests.
#   GITHUB_OUTPUT   Where due, reviewed and due_by are written.

set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "statement-review"

DEFAULT_STATEMENT="frontend/public_pages/src/pages/accessibility-statement.tsx"

# Print the REVIEWED date from the statement, e.g. "25 September 2026".
read_reviewed() {
  local file="$1"

  sed -n 's/^const REVIEWED = "\(.*\)";$/\1/p' "$file" | head -n 1
}

# Print "due reviewed_iso due_by_text" for a reviewed date and today.
assess() {
  local reviewed="$1"
  local today="$2"

  python3 - "$reviewed" "$today" <<'PY'
import calendar
import sys
from datetime import date, datetime

reviewed = datetime.strptime(sys.argv[1], "%d %B %Y").date()
today = date.fromisoformat(sys.argv[2])


def add_months(d, months):
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


due = today >= add_months(reviewed, 11)
due_by = add_months(reviewed, 12)
print("true" if due else "false", reviewed.isoformat(),
      f"{due_by.day} {due_by.strftime('%B %Y')}")
PY
}

main() {
  local force="${1:-false}"
  local file="${STATEMENT_FILE:-$DEFAULT_STATEMENT}"
  local reviewed
  local today
  local due
  local iso
  local due_by_day
  local due_by_month
  local due_by_year
  local due_by

  if [ ! -f "$file" ]; then
    error "statement not found at $file"
    return 1
  fi

  reviewed="$(read_reviewed "$file")"
  if [ -z "$reviewed" ]; then
    error "no 'const REVIEWED = \"…\";' line in $file"
    return 1
  fi

  today="${TODAY:-$(date -u +%Y-%m-%d)}"
  read -r due iso due_by_day due_by_month due_by_year < <(assess "$reviewed" "$today")
  due_by="$due_by_day $due_by_month $due_by_year"

  if [ "$force" = "true" ]; then
    log "forced: reporting the review as due"
    due="true"
  fi

  log "last reviewed $reviewed ($iso); due by $due_by; due now: $due"

  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
      echo "due=$due"
      echo "reviewed=$reviewed"
      echo "due_by=$due_by"
    } >>"$GITHUB_OUTPUT"
  fi
}

# Only run when executed, so the tests can source this file.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
