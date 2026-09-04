# Monitoring and alerting

## What this is

Teaching runs a three-tier escalation in Google Cloud Monitoring, defined in
`infra/modules/monitoring/`. Each tier fires the same underlying conditions —
uptime checks, the 5xx alert, the Cloud SQL disk alert, the Cloud Run startup
alert — but only the uptime failure escalates through all three tiers. The
others notify once, to tier one's channels.

| Tier | Delay | Channels                     |
| ---- | ----- | ----------------------------- |
| 1    | 5 min | Slack + email                 |
| 2    | 15 min | SMS                           |
| 3    | 30 min | Phone call, via PagerDuty     |

Each tier adds a route the previous one did not, rather than repeating a
channel already used. Tier one keeps two channels because they are the cheap,
ignorable ones — most failures resolve inside five minutes — and because
Google documents Slack as sharing a delivery service with webhooks and its
own mobile app, so email is Slack's independent path, not a duplicate of it.

Full reasoning, including what was tried and rejected, is in
[`docs/docs/plans/2026-08-31-analytics-plan.md`](../plans/2026-08-31-analytics-plan.md).

## Which channels Terraform manages

Email, SMS and PagerDuty are ordinary Terraform resources — created, updated
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
  token — only the Cloud console's "Add new" flow can. Google's own channel
  descriptor marks the field obfuscated on read, so even hand-importing it
  into Terraform state would show a masked value and re-drift on every plan.

So the channel is created once, by hand, in the console, and Terraform reads
it back by `display_name` and `type = "slack"` — see
`data.google_monitoring_notification_channel.slack` in
`infra/modules/monitoring/main.tf`.

## Adding or replacing the Slack channel

1. Open **Cloud console → Monitoring → Alerting → Edit notification
   channels**.
2. Find the **Slack** section and click **Add new**.
3. Authorise the Google Cloud Monitoring app against the Slack workspace, if
   not already authorised. This is a one-time OAuth consent per workspace.
4. Pick the channel to post into. Note its **exact name** — this becomes the
   channel's display name in Cloud Monitoring, and Terraform will look it up
   by that name.
5. Save. The channel now appears in **Alerting → Notification channels** with
   type Slack.
6. Set `slack_channel_display_name` in the environment's `terraform.tfvars`
   to that exact name (see `infra/environments/teaching/terraform.tfvars`).
   It is not a secret — it is a channel name — so it goes in `tfvars`
   directly, unlike the PagerDuty key or the escalation phone number, which
   come from Secret Manager.
7. Run `just tf` (or let the `Terraform` GitHub Actions workflow apply it) so
   tier one's `notification_channels` picks up the new data source.

**Nothing about the channel's lifecycle is managed by Terraform.** If it is
deleted or renamed in the console, the data source returns nothing on the
next apply, tier one silently loses its Slack rung, and `terraform plan` will
not say so — the `count` on the data source just becomes `0`. There is
currently no automated check for this; if the channel matters, treat renaming
or deleting it in Slack or the console as something to update
`terraform.tfvars` for at the same time.

## Verifying delivery

Configuration existing is not the same as delivery working — this project has
found that distinction the hard way more than once. To prove a channel
actually reaches you:

1. Create a temporary uptime check against a path that will fail (e.g.
   `/api/health` on a host with no API), and a temporary alert policy on it
   pointed at only the channel being tested.
2. Wait for the condition to fire.
3. Confirm delivery, then delete both temporary resources.

Do this by hand, outside Terraform — the resources should exist for minutes,
and a forgotten temporary resource in state is how orphaned config gets left
behind.
