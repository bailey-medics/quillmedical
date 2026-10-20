# Google Cloud power outage in europe-west2

- **Began**: 2026-10-20 06:00 UTC
- **Recovered**: 2026-10-20 11:50 UTC
- **Environment**: App production
- **Cause owner**: Google Cloud
- **Status**: recovered

## Summary

A power event in Google's europe-west2-b zone cut new network connections
from Cloud Run to the core database, which runs in that zone, for nearly six
hours. Two scheduled actions and one deploy failed; nothing was lost, and
the app recovered without intervention once Google restored the zone.

## Impact

- **The exams action failed on all 68 runs** between 06:05 and 11:50 UTC.
  Its first run after recovery finished no exams, so none had run out of
  time in the meantime.
- **The daily teaching reminders failed at 07:00** and do not run again
  until 07:00 the next day. A reminder is recorded only once sent, so none
  is lost, but each is a day late unless run by hand.
- **Retention was not affected**: it ran at 03:30, before the outage.
- **The deploy of #2152 failed at its migration step**, leaving App
  production on the previous build. The merge had no migration, so this
  was harmless.
- **The live app would most likely have failed any request needing the
  database.** Nobody uses App production yet, so no user saw it.

## Timeline

- **06:00** - the last connection from Cloud Run reaches the database.
- **06:05** - the exams action fails for the first time, and on every run
  after.
- **06:08** - Google opens
  [its incident](https://status.cloud.google.com/incidents/Xs2XTHzAVC9YnafnPyzj).
- **06:32** - #2152 merges and the deploy starts.
- **06:44** - the migration times out and Slack reports the deploy failed.
- **07:00** - the daily teaching reminders fail.
- **07:13** - the first "scheduled action failed" alert in Slack, repeated
  about hourly afterwards.
- **08:04** - the "has not run for two hours" alert fires for the exams
  action.
- **About 10:40** - investigation starts. Expired `gcloud` credentials
  delay it until they are renewed.
- **About 10:55** - the database logs show no connection arriving at all; the
  network configuration and audit log show no change on our side. Google's
  status page shows the incident.
- **11:50** - the exams action succeeds again, and has on every run since.
- **11:58** - Google names the cause: a power event in europe-west2-b.

## Cause

A power event in Google's europe-west2-b zone. Google's status page listed
Cloud Run, Cloud SQL and VPC among more than thirty affected products.

The core database is a single-zone instance in europe-west2-b
(`enable_ha = false`), so there was no standby elsewhere to fail over to.
The database itself stayed up throughout; what failed was the network path
to it.

## Detection

Slack reported the failed deploy 44 minutes after the outage began, and the
first scheduled-action alert came about an hour after it. Both alerts were
accurate. Neither said the cause lay with Google, and nothing told us Google
had an incident open.

## What helped and what got in the way

- **Helped**: the scheduled-action alerts fired and their text said nothing
  was lost, which was true. Cloud SQL's connection logs proved quickly that
  traffic was not arriving, which pointed away from our code.
- **Got in the way**: `/api/health` reported the database "available" for
  the whole outage, because it does not open a new connection. Expired
  `gcloud` credentials stopped the investigation until renewed. The
  Network Management API, which runs connectivity tests, is not enabled. The
  alerts do not suggest checking Google's status page.

## Actions

- [ ] Re-run the failed deploy once Google closes the incident.
- [ ] Decide whether to "Force run" today's teaching reminders, or let
      them go out a day late at tomorrow's 07:00 run.
- [ ] Make `/api/health` test the database with a fresh connection and a
      short timeout, so an outage like this shows as one.
- [ ] Send Google Cloud's Personalized Service Health alerts for the
      project to the existing Slack channel, through Terraform, so a
      Google incident is announced beside our own alerts.
- [ ] Add "check Google's status page" to the documentation text of the
      scheduled-action and deploy alerts.
- [ ] Decide whether to enable Cloud SQL high availability (`enable_ha`)
      before the EoEETA go-live. The trigger recorded in the
      [GCP launch-ready plan](../plans/2026-03-16-gcp-launch-ready.md) is
      real patient data across several clinics, which teaching does not
      meet; this outage is the case for reconsidering it. It roughly doubles
      the database's cost.
- [ ] Decide whether to enable the Network Management API, for
      connectivity tests during the next network fault.
