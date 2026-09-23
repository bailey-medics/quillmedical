#!/usr/bin/env bash
# Fires every alert route once, by writing one line to the alert-route-test log.
#
# Four permanent alert policies in infra/modules/monitoring each watch that
# log and notify exactly one channel: Slack, SMS, email and PagerDuty. So one
# line produces four messages, and a missing one names the broken route. On
# 2026-09-23 two routes had broken silently while Google reported their
# alerts as raised; only a person could tell nothing arrived.
#
# Runs every fourth Thursday at 1:15pm UK time. Cron can express neither
# half of that, so the workflow fires every Thursday at two UTC times and
# this script decides whether this is the run to keep:
#
#   - Every fourth week, counted in whole weeks from ANCHOR_DATE. A fixed
#     anchor, not the ISO week number, so a 53-week year neither doubles nor
#     skips a run.
#   - The UTC time that is 1:15pm in London today: 12:15 in summer, 13:15 in
#     winter. Decided from the schedule that fired, not from the clock when
#     the run starts, because GitHub can start a scheduled run late and a
#     clock check would then skip both and miss the cycle.
#
# A manual run (FORCE=true) skips both checks, to test a route after a change.
#
# Usage: alert-route-test.sh
#
# Environment:
#   GCP_PROJECT   Project whose log the line goes to (required).
#   SCHEDULE      The cron expression that fired, from github.event.schedule.
#   FORCE         "true" to skip the schedule checks.
#   TODAY         Date to judge the four-week cycle by, YYYY-MM-DD. Defaults
#                 to today in London. Set by the tests.
#   LONDON_OFFSET London's UTC offset as +HHMM. Defaults to now. Set by the
#                 tests.
#
# Exit codes:
#   0  wrote the line, or correctly decided this run was not the one
#   1  a required variable is missing, or the write failed
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "alert-route-test"

# The first test run. Every fourth Thursday from here.
ANCHOR_DATE="2026-10-01"

# The log every test policy watches. Must match the filter in
# infra/modules/monitoring/main.tf.
LOG_NAME="alert-route-test"

# Whole weeks from ANCHOR_DATE to the given date. Negative before it.
weeks_since_anchor() {
  local today="$1"
  local anchor_seconds
  local today_seconds

  anchor_seconds="$(date -u -d "$ANCHOR_DATE" +%s)"
  today_seconds="$(date -u -d "$today" +%s)"

  echo $(((today_seconds - anchor_seconds) / 604800))
}

# Succeeds when the given date falls in a test week.
is_test_week() {
  local today="$1"
  local weeks

  weeks="$(weeks_since_anchor "$today")"

  [ "$weeks" -ge 0 ] && [ $((weeks % 4)) -eq 0 ]
}

# The UTC hour that is 1pm in London, given London's offset: 12 in summer
# (+0100), 13 in winter (+0000).
utc_hour_for_london_one_pm() {
  local offset="$1"

  if [ "$offset" = "+0100" ]; then
    echo 12
  else
    echo 13
  fi
}

# The hour field of a cron expression, "15 12 * * 4" giving 12.
cron_hour() {
  local schedule="$1"
  local hour

  read -r _ hour _ <<<"$schedule"

  echo "$hour"
}

main() {
  if [ -z "${GCP_PROJECT:-}" ]; then
    error "GCP_PROJECT is not set"
    exit 1
  fi

  if [ "${FORCE:-false}" != "true" ]; then
    local today
    local offset
    local wanted
    local fired

    today="${TODAY:-$(TZ=Europe/London date +%F)}"
    offset="${LONDON_OFFSET:-$(TZ=Europe/London date +%z)}"

    if ! is_test_week "$today"; then
      log "Not a test week (${today}), nothing to do"
      return 0
    fi

    if [ -z "${SCHEDULE:-}" ]; then
      error "SCHEDULE is not set, and this is not a forced run"
      exit 1
    fi

    wanted="$(utc_hour_for_london_one_pm "$offset")"
    fired="$(cron_hour "$SCHEDULE")"

    if [ "$fired" != "$wanted" ]; then
      log "The ${fired}:15 UTC run is not 1:15pm in London today, skipping"
      return 0
    fi
  fi

  log "Firing every alert route in ${GCP_PROJECT}"

  gcloud logging write "$LOG_NAME" \
    "Four-weekly alert route test. Expect Slack, SMS, email and a phone call." \
    --project="$GCP_PROJECT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
