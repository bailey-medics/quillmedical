# Monitoring and alerting

## What this is

The app environment runs a three-tier escalation in Google Cloud Monitoring, defined in
`infra/modules/monitoring/`. Each tier fires the same underlying conditions -
uptime checks, the 5xx alert, the Cloud SQL disk alert, the Cloud Run startup
alert - but only the uptime failure escalates through all three tiers. The
others notify once, to tier one's channels.

| Tier | Delay | Channels                     |
| ---- | ----- | ----------------------------- |
| 1    | 5 min | Slack + email                 |
| 2    | 15 min | SMS                           |
| 3    | 30 min | Phone call, via PagerDuty     |

Each tier adds a route the previous one did not, rather than repeating a
channel already used. Tier one keeps two channels because they are the cheap,
ignorable ones - most failures resolve inside five minutes - and because
Google documents Slack as sharing a delivery service with webhooks and its
own mobile app, so email is Slack's independent path, not a duplicate of it.

Full reasoning, including what was tried and rejected, is in
[`docs/docs/plans/2026-08-31-analytics-plan.md`](../plans/2026-08-31-analytics-plan.md).

## Which channels Terraform manages

Email, SMS and PagerDuty are ordinary Terraform resources - created, updated
and destroyed by `terraform apply` like anything else. **Slack is not.** It is
looked up by a data source, not created, because it cannot be created
correctly by Terraform at all:

- Terraform can create a `webhook_token_auth` channel pointed at a Slack
  incoming webhook. That was tried first. It does not work: a Slack incoming
  webhook expects a request body shaped like `{"text": "..."}`, and Cloud
  Monitoring sends its own alert JSON instead. The channel is created
  successfully, reports as enabled, and silently delivers nothing.
- The channel type that actually posts a readable message is `slack`, and it
  needs an `auth_token` obtained through Slack's OAuth consent screen. There
  is no Terraform resource, gcloud command, or API call that produces this
  token - only the Cloud console's "Add new" flow can. Google's own channel
  descriptor marks the field obfuscated on read, so even hand-importing it
  into Terraform state would show a masked value and re-drift on every plan.

So the channel is created once, by hand, in the console, and Terraform reads
it back by `display_name` and `type = "slack"` - see
`data.google_monitoring_notification_channel.slack` in
`infra/modules/monitoring/main.tf`.

## Adding or replacing the Slack channel

1. Open **Cloud console → Monitoring → Alerting → Edit notification
   channels**.
2. Find the **Slack** section and click **Add new**.
3. Authorise the Google Cloud Monitoring app against the Slack workspace, if
   not already authorised. This is a one-time OAuth consent per workspace.
4. Pick the channel to post into. Note its **exact name** - this becomes the
   channel's display name in Cloud Monitoring, and Terraform will look it up
   by that name.
5. Save. The channel now appears in **Alerting → Notification channels** with
   type Slack.
6. Set `slack_channel_display_name` in the environment's `terraform.tfvars`
   to that exact name (see `infra/environments/app/terraform.tfvars`).
   It is not a secret - it is a channel name - so it goes in `tfvars`
   directly, unlike the PagerDuty key or the escalation phone number, which
   come from Secret Manager.
7. Merge the change. The `Terraform` GitHub Actions workflow applies it, so
   tier one's `notification_channels` picks up the new data source.

**Nothing about the channel's lifecycle is managed by Terraform.** If it is
deleted or renamed in the console, the data source returns nothing on the
next apply, tier one silently loses its Slack rung, and `terraform plan` will
not say so. The four-weekly alert route test
(`.github/workflows/alert-route-test.yml`) is the only check, and it relies on
a person noticing the missing Slack message; if the channel matters, treat renaming
or deleting it in Slack or the console as something to update
`terraform.tfvars` for at the same time.

## Verifying delivery

Configuration existing is not the same as delivery working - this project has
found that distinction the hard way more than once. To prove a channel
actually reaches you:

1. Create a temporary uptime check against a path that will fail (e.g.
   `/api/health` on a host with no API), and a temporary alert policy on it
   pointed at only the channel being tested.
2. Wait for the condition to fire.
3. Confirm delivery, then delete both temporary resources.

Do this by hand, outside Terraform - the resources should exist for minutes,
and a forgotten temporary resource in state is how orphaned config gets left
behind.

## Google Cloud incidents

`Google Cloud incident (app)` is an alert policy on Personalized Service
Health: Google writes a log entry for every incident touching a product the
project uses, and for each update to it, and the policy posts it to tier
one's channels, Slack and email. It exists because on 20 October 2026 the
only sign in Slack of an incident in europe-west2 was our own alerts firing
hourly, each looking like a fault of ours.

The post carries the incident's title, products, locations, start time and
a `State:` line. The alert watcher below reads the policy's documentation subject, which is
what Google's Slack post shows as its title, and that line, so keep both as
they are in `infra/modules/monitoring/main.tf`.

## The alert watcher

A daemon on the home box reads `#quill-medical-cicd` and, when an alert or a
failed deploy is posted there, types `/alert <file>` into the Claude Code
session in worktree 5. The `/alert` skill investigates, explains the cause
in the alert's thread, and opens a pull request ready for review when the
fault is ours. A person reviews and merges it, or closes it. The design is
the watcher phase of the
[remote dev machine plan](../plans/2026-10-19-remote-dev-machine-plan.md),
and the program is in `scripts/alert-watcher/`.

- **Which posts it acts on**: every post by an app that is not on its ignore
  list: success posts opening with ✅, the four-weekly alert route test, the
  retention decision, and the closing post of a known alert. A Cloud
  Monitoring post never names its policy; its bold title is the policy's
  documentation `subject`, so that is what
  `scripts/alert-watcher/src/messages.ts` lists, and a policy added to
  `main.tf` fails the watcher's tests until its subject is listed there.
- **Its log**: `journalctl --user -u quill-alert-watcher` on the box. It
  records fingerprints and outcomes, never alert text.
- **Its state**: `~/.local/state/quill-alert-watcher/`, holding the busy flag,
  the alert files and the ledger of what it has handled.
- **Installing it again**: `just alert-watcher-install` from worktree 5.

### Checking it after a change

Run both of these after any change to the daemon, the skill or an alert
policy, and before trusting the watcher for the first time.

1. **A planted fault.** Merge a route with a fault only an operator can
   reach, behind `DEP_REQUIRE_OPERATOR`, and call it once it is deployed, so
   "Backend error:" fires. It must be on `main`, not only on a deployed
   branch, because the skill writes a test that has to fail on `main`. Open
   the app first, so the 15-minute login cookie is fresh, or the call is
   refused with a 401 and nothing fires. Within a minute the thread should
   say "Looking into this now". Within the hour it should say "Found the
   cause:", and then "Pull request ready for review:" with a link to a pull
   request whose new test fails on `main` and passes on its branch. Then
   remove the route; that is a removed API path, so it needs a decision file
   in `api-compatibility/` and the breaking-change approval. The first
   rehearsal, on 28 October 2026, used `/api/operator/rehearsal/average`,
   which divided by the count of the numbers it was given.
2. **The four-weekly alert route test.** Let `alert-route-test.yml` run, or
   start it by hand. Its posts in Slack must get no reply from the watcher,
   and the journal an `ignored` line: it is a test of the routes, not a
   fault.

If either goes wrong because a post was read wrongly, set
`ALERT_WATCHER_RECORD_EVENTS=1` in `~/.config/quill-alert-watcher/env`,
restart the service, and repeat. The raw events land in `events/` in the
state folder, to check against `messages.ts`. Turn it off afterwards, since
those files hold alert text.
