# GitHub Actions degraded

- **Began**: 2026-10-19, about 15:37 UTC
- **Recovered**: 2026-10-19, about 16:05 UTC
- **Environment**: CI, and the deploy to App production
- **Cause owner**: GitHub
- **Status**: closed

## Summary

GitHub Actions stopped reporting run states correctly, so a deploy that had
already reached App production showed as stuck and held every later deploy
behind it. Nothing was lost; about half an hour went on working round a run
that needed no fixing.

## Impact

- **No effect on App production.** The deploy of #2130 updated the backend
  on Cloud Run at 15:35 to 15:36, as intended.
- **Deploys were blocked for about half an hour.** GitHub showed the
  deploy run as `waiting`, holding the `deploy` concurrency group, so a
  second deploy queued behind it.
- **CI results arrived late.** Runs started during the incident reported
  their result up to 25 minutes after finishing.
- **Wasted work**: a workaround pull request (#2139) opened and closed
  unmerged, and a redundant deploy dispatched and cancelled.

## Timeline

All times 19 October 2026, UTC.

- **15:21** - #2130 merges and its deploy starts.
- **15:35 to 15:36** - the deploy updates the backend service on Cloud Run,
  as Google's audit log shows; GitHub records the deploy job finishing at
  15:37.
- **About 15:37** - GitHub still shows the run as `waiting`. The API
  contradicts itself: it refuses to cancel the run as "not in progress"
  while still listing it as waiting.
- **15:44** - a second deploy is dispatched, and queues behind the first
  in the `deploy` concurrency group.
- **15:45 to 15:50** - cancel, force-cancel, rejecting the pending
  deployment, deleting the run and setting its deployment status to error
  are all tried, and all refused.
- **15:49** - GitHub opens
  [its incident](https://www.githubstatus.com/incidents/8tzbpcnl75jp):
  degraded availability for Actions, Pages and Webhooks.
- **15:54** - #2139 opens, renaming the deploy concurrency group so new
  deploys could get past the stuck run.
- **15:56** - GitHub's status page is checked, and the stuck run is put
  down to their incident.
- **About 16:05** - the stuck run clears to `completed success`.
- **16:07** - the deployed change is confirmed from outside.
- **16:08** - #2139 is closed unmerged.
- **16:18** - the redundant deploy is cancelled.
- **16:30** - GitHub reports recovery, with status updates still delayed.
- **16:47** - one more timeout reaching `api.github.com`.
- **16:56** - GitHub marks the incident resolved.

## Cause

An incident at GitHub degrading Actions, Pages and Webhooks. Runs went on
working, but their reported states lagged behind or contradicted each
other.

## Detection

The stuck run was noticed about 12 minutes before GitHub declared its
incident. GitHub's status page was not checked until 19 minutes after the
run first stuck, by which time a workaround had been built for it.

## What helped and what got in the way

- **Helped**: the deploy concurrency group did its job, holding later
  deploys rather than letting two race. The stuck run recovered on its own
  once GitHub did. Checking from outside confirmed the change was live.
- **Got in the way**: GitHub's report of the run was believed over the
  system itself. Cloud Run would have shown at once that the deploy had
  landed at 15:36, and the status page that the fault was GitHub's. Both
  checks came after the workaround, not before it.

## Actions

- [x] Check the supplier's status page, and the real system, before working
      round a stuck run. Now a standing step in the incidents rule
      (`.claude/rules/incidents.md`, "While it is happening").
- [x] Rename the deploy concurrency group to escape a stuck run. Decided
      against: the run cleared on its own once GitHub recovered, and #2139
      was closed unmerged. Kept here as the known way out if a run stays
      stuck after an incident is resolved.
