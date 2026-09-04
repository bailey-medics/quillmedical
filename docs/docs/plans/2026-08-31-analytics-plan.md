# Analytics plan

Quill has no analytics of any kind. There is no web analytics on the public
site, no page-view counts in the app, and no error reporting — the
`ErrorBoundary` component catches unhandled React errors and writes them to
`console.error`, where nobody will ever see them. So three ordinary questions
have no answer today.

Those three questions are the entire scope of this plan:

1. **Where are things going wrong?**
2. **How many people visit the public site?**
3. **How many people visit each page of the authenticated app?**

That is deliberately much narrower than "analytics" usually means. There are no
funnels here, no retention curves, no cohort analysis, no session replay, no
experimentation. An earlier draft of this plan designed for all of that; it has
been cut back to the three questions above, and the section on what is
deliberately not being built records what was dropped and what would justify
revisiting it.

The scope is small but the constraints are not, which is why this is a plan
rather than a ticket. Analytics touches the Content Security Policy, the cookie
and privacy policies, the data protection impact assessment, the sub-processor
list, and — once clinical data lands — the NHS Data Security and Protection
Toolkit and Digital Technology Assessment Criteria assurance record. The
governing instruction is to build as though patient data could arrive tomorrow.
The UK legal position also changed materially this year: the Data (Use and
Access) Act 2025 amendments to the Privacy and Electronic Communications
Regulations came into force on 5 February 2026, creating a statistical purposes
exception that removes the cookie banner for qualifying first-party analytics,
while raising the penalties under those regulations to UK GDPR levels. Advice
written before 2026 is out of date on both halves of that.

The answer to all three questions is the same shape: **first-party, inside the
Google Cloud project Quill already runs, with no third-party analytics
processor anywhere.** Terms are spelled out on first use, and the abbreviations
that recur are collected in the glossary at the foot of this document.

## How each question gets answered

- **Where are things going wrong** — two halves. Server-side errors are
  already logged as structured JSON but nothing alerts on them, so that half is
  a threshold and a dashboard over data Quill already holds. Client-side, the
  existing `ErrorBoundary` and a global handler post sanitised reports to
  Quill's own backend, which logs them the same way; Cloud Error Reporting
  groups them and the existing channels in `infra/modules/monitoring` shout
  about them. No new service either way, and the client-side catching is
  already written.

- **Public site visitor numbers** — the load balancer already logs every
  request, and the public site is logged by a different mechanism from the
  app. `infra/modules/load-balancer/main.tf` sets `log_config { enable = true }`
  on the two backend _services_, but the marketing site is served by
  `google_compute_backend_bucket.landing`, which has no such block. It does not
  need one: logging for backend buckets on an external Application Load
  Balancer is switched on automatically and cannot be disabled. Either way the
  logs are already flowing, so this question needs no application code at all —
  it is a querying and dashboard problem, not a collection problem.

- **App page views** — this is the only one needing new client code. The app
  is a single-page application using `createBrowserRouter`, so navigating
  between pages never reaches the server; load-balancer logs see the initial
  document load and subsequent API calls, but not the twelve pages a user moved
  through. A small ping on route change is unavoidable. It sends a **page name
  from a fixed allow-list**, never a URL.

## Where the answers get looked at

Collecting the data is half the job; the other half is where somebody sees it.
These split by purpose, and the split is a rule rather than a preference.

- **Everything is looked at outside the app, in one place.** If Quill is down,
  an in-app dashboard is down with it, so anything consulted while something is
  broken cannot live there. Rather than splitting incident views out and
  keeping usage views in, all four things — uptime, error rates, public-site
  visits and app page views — go onto a **single Cloud Monitoring dashboard**.
  It is already in the project, it costs nothing, it needs no build, and it
  means one bookmark rather than a habit of checking three places.

- **All three questions become log-based metrics.** Every input is already, or
  becomes, a structured log line: load-balancer request logs, backend errors,
  client error reports, page-view pings. A log-based counter metric over each
  turns them into something Cloud Monitoring can chart next to uptime, with no
  second tool in the loop. Page name is a metric label; at 63 routes that is 63
  time series against a 30,000 ceiling, so cardinality is a non-issue.

- **The long history lives in the metric, not the archive.** Wanting to keep
  usage data for as long as possible and wanting to hold client IP addresses
  are separable, and separating them is what makes long retention easy. The
  log-based metric carries a **`page` label**, so per-page visit counts are
  retained by Cloud Monitoring for years with no IP address and nothing else
  personal in them. Nothing has to be deleted, because nothing sensitive was
  stored.

  So the raw BigQuery table is not the long archive; it is a short
  investigation window, defaulting to 30 days. What it holds is one row per
  **public marketing site** request: timestamp, method and URL, response status
  and size, user agent, referrer, latency, protocol, and client IP. Nothing
  from the authenticated app reaches it, and no cookie, session or account
  identifier appears in a load-balancer log. The IP is the only element making
  a row personal data, and it earns its 30 days by being useful for abuse and
  incident investigation — not for counting visitors.

  What that trades away is per-referrer history beyond 30 days, since referrer
  is not a metric label — an unbounded set of referring hosts would be a
  cardinality problem where a bounded set of pages is not. If referrer trends
  ever matter, the escalation is a scheduled BigQuery query rolling an
  IP-stripped copy into a long-lived table before the raw partitions expire.
  Worth building then; not worth building now.

  Note also that expiry is set as **partition** expiry rather than table
  expiry. The sink appends to one partitioned table, so a table expiration
  would delete the whole thing — recent data included — on the anniversary of
  its creation, instead of rolling old days off the back.

- **When a "wake up" alarm is bought, it lives outside Google Cloud.** An
  alarm hosted inside the system it watches shares that system's failure modes.
  Voice paging is the one part of this plan that costs real money, so it is
  deferred rather than built cheaply in-house — see the escalation tiers.

## What the constraints rule out

- **No third-party analytics processor, on any surface.** Including the public
  site, where the health-data risk is nil but the sub-processor declaration is
  not. Zero vendors means no data-residency claim to evidence, no annual
  contract review, and no vendor configuration that must stay correct to remain
  safe.

- **No Google Analytics.** It fails the statistical purposes exception three
  ways: Google is a joint controller rather than a processor; the data feeds
  Google's advertising systems, machine-learning models and benchmarking
  products, breaking the sole-purpose test; and the `_ga` cookie assigns a
  persistent client identifier, so the data is not aggregate-only.

- **No raw URLs, ever, from the authenticated app.** Behavioural data can
  reveal health status without containing a single clinical field: a URL path,
  a feature name, or the timing of actions can each disclose that a person has
  or is being treated for a condition. This is why page views are reported as
  allow-listed names rather than paths, and it is the single most important
  control in this plan.

  This constraint binds the **archive** as much as the client, and the first
  implementation got it wrong. The BigQuery sink was written with an unscoped
  `resource.type="http_load_balancer"` filter, which archives every request the
  load balancer sees — including the authenticated app, whose paths carry
  identifiers directly: `/api/patients/{patient_id}/letters`,
  `/api/users/{user_id}`. That would have stored exactly the URLs this rule
  forbids, alongside client IP addresses, for the whole retention window, using
  the pipeline built to honour the rule. The sink filter is now scoped to the
  landing domain, matching the metric. Any future sink must be scoped the same
  way: **route what you meant to keep, never a resource type.**

- **No error text passed through unsanitised.** An error message is exactly as
  capable of carrying patient data as an analytics event, and rather more
  likely to, since it may quote whatever the code was handling when it failed.

- **No session replay.** The highest-value and highest-risk feature in the
  category, and outside the scope of all three questions anyway.

## The regulatory position, briefly

- **The Privacy and Electronic Communications Regulations are the UK's cookie
  law**, and they govern storing or reading anything on a user's device,
  whether or not it is personal data. UK GDPR asks a different question: is
  personal data being processed? Both need answering, but they are not the same
  question.

- **This plan does not engage those regulations at all.** Load-balancer logs
  and a server-side ping involve no storage on or access to the user's device.
  That is a stronger position than qualifying for the new statistical purposes
  exception, because there is no qualification argument to defend at audit.

- **Quill still needs a cookie policy, but not a consent banner.** The session
  and cross-site request forgery cookies it already sets are strictly necessary
  under Regulation 6(4) — essential to deliver a service the user explicitly
  requested — an exemption that long predates the 2025 Act. Strictly necessary
  means **tell, not ask**: users must still be clearly informed, which is why
  the stub cookie policy is a blocking prerequisite even though no banner is.

- **Consent banners have not gone away generally.** The 2025 Act carved out
  narrow low-risk categories; advertising and profiling cookies still require
  opt-in consent, and the Information Commissioner's Office has said that is
  where its enforcement attention sits. Nothing here should be read as a
  general finding that UK sites no longer need banners.

- **Every third-party processor is a permanent assurance liability.** The Data
  Security and Protection Toolkit is now aligned to the National Cyber Security
  Centre's Cyber Assessment Framework — outcome-based, evidencing that controls
  work — reaching large suppliers in 2025-26 and all organisations by 2026-27.
  Each sub-processor adds a declaration, an impact-assessment section, a
  residency claim, a retention policy and an annual review. For three counting
  questions, that price is not worth paying.

## Codebase fit

- **The error boundary already exists and already catches.**
  `frontend/src/components/error-boundary/ErrorBoundary.tsx` implements
  `componentDidCatch` and currently calls `console.error`. Question 1 is
  largely a matter of giving it a destination.

- **The load balancer already logs.**
  `infra/modules/load-balancer/main.tf` enables request logging on both the
  frontend and backend services at `var.log_sample_rate`. The data for question
  2 is already being produced and paid for.

- **Structured logging is already in place.** `backend/app/logging_config.py`
  emits JSON with a `RequestContextFilter` carrying `request_id` and `user_id`,
  and Cloud Run forwards it to Cloud Logging, which parses it natively. Both
  new log streams ride this existing pipeline rather than introducing one.

- **Rate limiting already exists.** `slowapi` is configured in
  `backend/app/main.py` with a `@limiter.limit(...)` decorator pattern to
  follow on the new ingest endpoints, both of which accept unauthenticated or
  cheaply-authenticated writes and must be limited.

- **The Content Security Policy never changes.** `caddy/prod/Caddyfile` sets
  `script-src 'self'` and `connect-src 'self'`. Everything here is same-origin,
  so the policy stays exactly as strict as it is today. A third-party vendor
  would have required either weakening it or standing up a proxy.

- **The client must not use raw `fetch`.** Per the project conventions, both
  the error report and the page-view ping post through
  `frontend/src/lib/api.ts`.

- **One injection point each.** `frontend/src/RootLayout.tsx` wraps the 63
  routes defined in `main.tsx` and is where the route-change hook and the
  route-to-name map belong.

## What this costs

- **Cloud Logging** — $0.50 per gibibyte ingested, with 50 gibibytes free each
  month. Quill is nowhere near that, and the load-balancer logs are already
  being ingested.
- **Log sink export to BigQuery** — free; the sink itself carries no charge.
- **BigQuery** — 10 GB of storage and 1 tebibyte of query processing free per
  month, then $0.02 per gigabyte per month. These rows are tiny.
- **Uptime checks** — $0.30 per 1,000 executions, with 1 million free each
  month. Executions multiply by frequency, by target and by region, so moving
  from a 300-second to a 60-second period is a fivefold increase: two hostnames
  checked every minute from all regions comes to roughly 518,000 executions a
  month, about half the free allowance. A third hostname still fits; a fourth
  would tip over, and the lever if that happens is to pin `selected_regions`
  rather than to slow the checks back down.
- **Log-based metrics** — user-defined ones are chargeable custom metrics, but
  at the handful of series described here the cost is immaterial.
- **Cloud Error Reporting** — included with the operations suite; the reports
  arrive as structured log entries under the same free tier.

**Realistic running cost: £0 per month**, on infrastructure already
provisioned, inside a boundary already covered by existing terms.

For honesty: the rejected third-party options were also £0 at this volume.
Money was never the differentiator. What this route costs instead is the
engineering time below — modest, and mostly mechanical — and the analytical
depth described in the final section. For three counting questions, that is a
good trade.

## Phase 1: where things are going wrong

The first question asked, and the cheapest to answer, because the catching is
already built.

"Going wrong" has two halves, and the server half matters more. A React crash
inconveniences one user in one tab; a backend throwing errors reaches every
clinician mid-task. Today neither is visible. `infra/modules/monitoring` alerts
on exactly two things — an uptime check against `/api/health`, and Cloud Run
container startup failure — so a backend that starts cleanly and answers the
health check with a 200 while failing every real endpoint **triggers no alert
at all**. The server half needs no new collection, since those errors are
already logged as structured JSON with a `request_id`; it needs a threshold and
somewhere to look.

Server side, already collected:

- [x] Add an alert policy on the backend 5xx rate to
      `infra/modules/monitoring/main.tf`, firing through the existing email and
      Slack notification channels — threshold is `var.server_error_threshold`,
      counting 5xx responses in a five-minute window rather than a per-second
      rate, which is easier to reason about at low traffic
- [x] Add a dashboard for error rate by service, so a spike can be attributed
      rather than just noticed
- [ ] Confirm the 5xx alert fires on a deliberately broken endpoint, rather
      than assuming the filter is right. Half-proven without breaking
      anything: querying the alert's own filter over thirty days returned ten
      real 5xx responses on `quill-backend-teaching` across two revisions, so
      the filter demonstrably matches real errors. What remains unproven is
      the threshold and the delivery — none of those ten was dense enough to
      cross "more than five in five minutes"
- [x] Grant the CI service account `roles/logging.configWriter` on
      `quill-medical-teaching`. The first apply failed with
      `logging.sinks.create denied`: creating a log sink is not covered by the
      roles the deploy account holds, and it cannot grant itself the role, so
      this is a one-off manual step before the sink can be created

See **What building this taught us** near the end of the document for the
findings from the first apply and from testing the alerting, all of which
came from this phase.

Client side, new work. **This is the next thing to build**, along with Phase 3.
Both were held back while the teaching branch was being actively edited; that
work has moved into a design phase rather than a code one, so the collision
risk has gone.

Keep the new backend routes out of `backend/app/main.py`. That file is the one
genuinely hot spot — sixteen of the last eighty commits touched it — and the
teaching feature already set the precedent by living in
`backend/app/features/teaching/router.py`. A `backend/app/analytics/router.py`
included in one line reduces the merge surface from a block of routes to a
single import. Everything else these two phases touch —
`ErrorBoundary.tsx`, `RootLayout.tsx`, `Settings.tsx` — was touched once in the
last eighty commits, and nowhere near `frontend/src/pages/admin/teaching/`.

Client side, new work:

- [ ] Extend `componentDidCatch` in
      `frontend/src/components/error-boundary/ErrorBoundary.tsx` to report the
      error as well as logging it
- [ ] Add a global handler for unhandled promise rejections and errors thrown
      outside React's tree, which the boundary cannot see
- [ ] Sanitise before sending: strip URLs, query strings, form values and any
      user-entered text, keeping the error type, the message, the component
      stack and the release version
- [ ] Add a backend ingest endpoint accepting sanitised reports, rate-limited
      via the existing `slowapi` `@limiter.limit` pattern, and available to
      unauthenticated pages as well as signed-in ones
- [ ] Emit reports through the existing JSON logging pipeline in a shape Cloud
      Error Reporting recognises, so grouping works
- [ ] Alert on new and spiking error groups through the existing notification
      channels in `infra/modules/monitoring`
- [ ] Tests: sanitiser unit tests proving patient-shaped strings never survive
      it (`just uf`), and backend endpoint tests including the rate limit
      (`just ub`)
- [ ] Storybook story and test for any fallback UI change, per the component
      rules

### Escalation

A single dramatic channel is worse than tiers: either it fires for things that
would have resolved themselves and gets ignored, or it is set late enough to be
useless. Thirty minutes is a reasonable threshold for a phone call and far too
long for a first signal in a clinical product, so the severity climbs with the
duration. Google Cloud supports `email`, `slack` and `sms` notification
channels natively; it has no voice channel at all, which is why the last rung
would have to sit elsewhere.

Voice was assumed to be where the cost caveat finally bit — a phone call on no
provider at any free tier. **That was wrong, and it was tested on 2 September.**
PagerDuty's free plan does place the call: the phone rang within seconds of a
test incident, read out the incident detail, and accepted a keypress to
acknowledge, which registered in the web interface immediately. So all three
tiers can ship, and tier three costs nothing.

That matters more than convenience. Google's own documentation
says SMS is "not a fully reliable notification channel type", and that Slack,
PagerDuty, webhooks and the Cloud mobile app all share a single internal
delivery service and therefore a single point of failure. Email or Pub/Sub is
the only recommended redundant path. Taken together, **Google Cloud cannot
provide a dependable wake-up alarm on its own** — not merely a less pleasant
one. An external pager is therefore the fix for a real gap rather than a
comfort, and since it turns out to cost nothing, there is no longer a reason to
wait for clinical users before having one.

- [x] Tier one, 5 minutes — Slack and email. **Both confirmed delivering on
      4 September**, by a temporary uptime check and a policy pointed at
      exactly tier one's two channels. Email was the control, having already
      delivered real alerts; Slack was the one that had never sent anything.
      Both arrived.

      For most of this work tier one was **email alone**, and this document
      said "Slack and email" throughout regardless. Checked against the live
      API on 3 September: the policy notified one channel.
      `var.slack_webhook_url` had never been set for teaching, so the Slack
      resource sat at `count = 0` and had never existed. The secret was in
      GitHub and `slack-notify.yml` used it for CI messages, but the Terraform
      workflow never passed it — same secret, two consumers, one of them
      unwired.

      That mattered beyond the missing ping. The argument for putting email on
      both tiers was that Google documents Slack as sharing a delivery service
      with webhooks and its mobile app, so email is the redundant path. With
      no Slack channel at all, tier one had no redundancy: a single channel,
      and the slowest one to notice.
- [x] Add `documentation` to all six alert policies. Google fixes the layout
      of each channel — the Slack card, the email template — but the
      `documentation` block is included in every channel used here, and
      supports `$${...}` variable substitution and a subset of Markdown.

      Each alert now says what happened, what it does not mean, and where to
      look. The uptime ones distinguish the two monitored hosts, which fail
      for entirely different reasons: the app is Cloud Run behind the load
      balancer probed at `/api/health`, while the public site is static files
      in a bucket probed at `/`. The phone-call alert repeats the
      acknowledge-not-resolve rule, which is the thing most likely to be
      forgotten at 3am.

      Note the escaping: Terraform reads `${...}` as its own interpolation, so
      the content uses `$${...}` to pass a literal through to Google. Verified
      by rendering rather than assumed — get it wrong and the notification
      shows the variable name instead of the value.
- [x] Establish that **the phone call cannot be customised**. PagerDuty's
      documentation says a voice notification speaks the incident count, the
      service name and the incident title, and nothing else — not
      `custom_details`. Google's documentation says a custom `subject`
      "appears in the notification's subject line" but does not say which
      channels use it, and explicitly does not confirm behaviour for
      third-party systems.

      Tested on 4 September by firing an alert whose `subject`, `content` and
      condition display name each carried unmistakable and unrelated text
      about skiing, routed to PagerDuty alone. **None of it reached the
      call.** Google composes its own title for the PagerDuty payload and
      ignores what the policy sets.

      So the documentation added to `uptime_critical` — including the
      acknowledge-do-not-resolve rule — is visible when the incident is opened
      in PagerDuty, and is not spoken. Anything that must be heard at 3am has
      to come from the call's own wording, which is Google's to decide.
      Changing it would need a PagerDuty Event Orchestration rule rewriting
      the title from the payload: more machinery than a one-person rota
      warrants, but the route if it ever matters.
- [x] Note that adding Slack to tier one also added it to three other
      policies. `server_errors`, `sql_disk` and `cloud_run_startup` all use
      `local.notification_channels`, tier one's channel set, so the apply on
      4 September changed six resources rather than the two expected. Those
      three were email-only before and now post to Slack as well, which is an
      improvement — email alone was the weakest single channel — but it means
      5xx spikes and disk warnings land in `#quill-medical-cicd` alongside
      CI/CD messages.
**Decided on 3 September: each tier adds a route the previous one did not.**
Tier one Slack and email, tier two SMS, tier three the phone call.

Tier one is the only tier with two channels, because they are the cheap,
ignorable ones and Google documents Slack as sharing a delivery service with
webhooks and its mobile app, so email is its independent path. Tier two adds a
text and tier three a call on another provider, so neither repeats a channel
already used.

- [x] Decide what to do about Slack, rather than wiring the secret and hoping.
      The existing resource was `type = "webhook_token_auth"` pointed at an
      incoming webhook URL. Slack incoming webhooks expect a body shaped like
      `{"text": "..."}` — which is exactly what `slack-notify.yml` posts —
      while Cloud Monitoring sends its own alert JSON. Passing the secret
      through would have created a channel that appears configured, reports
      as enabled, and silently delivers nothing: the same failure this plan
      keeps finding. `todo.md` already carried the answer, "replace the
      `webhook_token_auth` Slack channel with the native integration".

      **Done on 3 September.** The native `slack` channel was created by hand
      in the console — `auth_token` comes from Slack's OAuth consent screen,
      and Google's own descriptor marks it obfuscated on read, so there was
      never a path to managing it in Terraform. It is now looked up by a
      `google_monitoring_notification_channel` data source, filtered on
      `display_name` and `type = "slack"`, rather than created. The old
      resource and `var.slack_webhook_url` are removed; the new
      `var.slack_channel_display_name` is plain text in `terraform.tfvars`,
      not a secret, since it is only a channel name. Full walkthrough at
      [`docs/docs/infrastructure/monitoring.md`](../infrastructure/monitoring.md).

      Worth a look, not a blocker: the channel reuses `#quill-medical-cicd`,
      the same channel `slack-notify.yml` already posts CI/CD messages to,
      rather than a channel dedicated to alerts. Fine functionally — the two
      kinds of message will sit side by side — but worth a deliberate choice
      later if that turns out to be noisy.
- [x] Tier two, 15 minutes — **SMS only**. The `uptime_escalation` policy
      notified SMS *and* email; the email is dropped.

      Email was added there for redundancy, because Google documents SMS as
      "not a fully reliable notification channel type". That reasoning held
      while tier one was email alone. Once tier one delivers Slack and email,
      a second email at fifteen minutes repeats a channel already used and
      tells you nothing new. Each tier should add a channel rather than
      restate one.

      The trade is explicit: if SMS silently fails, tier two delivers nothing.
      The backstop is tier three fifteen minutes later, on a different
      provider entirely.
- [x] Supply the number from a secret rather than `terraform.tfvars`: this
      repository is public, and a committed number would be published
      permanently in git history. Originally a GitHub organisation secret
      relayed through `TF_VAR_alert_sms_number`; now read from Secret Manager
      directly, since no workflow ever used the value — see the decision on
      where the alerting secrets live.
- [x] Mark `alert_sms_number` sensitive in both variable definitions. The plan
      job posts its output as a pull request comment on a public repository,
      so without this the number would render there in plain text. Verified
      experimentally rather than assumed: an unmarked variable prints the
      value inside a map attribute, a sensitive one renders
      `(sensitive value)`.
- [x] Verify the SMS number by code in the Cloud console — Terraform can
      create the channel but cannot verify it, so it delivers nothing until
      this is done by hand. Done on 1 September; the channel reports
      `VERIFIED` and delivered on its first real firing the same evening

Note that the number will still be recorded in Terraform state, which lives in
`gs://quill-medical-terraform-state`. That bucket has no `allUsers` or
`allAuthenticatedUsers` binding, so it is private to the project — but it is a
deliberate exception to the rule stated in `modules/secrets/main.tf` that
secret values never enter Terraform state. The only way to avoid it entirely
would be to create the channel by hand, which would make it unmanaged.

**For teaching specifically, this is already enough — buy nothing.** Teaching
holds no patient data and supports no clinical decision; an outage means a
learner cannot sit an assessment for a while. That warrants finding out
promptly during waking hours, which Slack and email already do, and it does not
warrant being woken at 03:00. SMS is worth verifying because it is free and
occasionally useful, not because teaching needs it. The unreliability of
Google's notification channels is a real problem for a clinical service and an
acceptable one here. Revisit the whole escalation when clinical users arrive —
not before.

- [x] Do not let tier two rest on SMS alone — it is paired with email.
      Google documents Slack, PagerDuty, webhooks and the Cloud mobile app as
      sharing **one internal delivery service and therefore one point of
      failure**, naming email or Pub/Sub as the redundant path. So tier one's
      Slack rung is not independent cover, and mobile app push would not have
      been either
- [ ] Optionally add the Cloud mobile app channel by hand from the Google
      Cloud app — it cannot be created through Terraform or the channels API,
      and it shares Slack's failure domain, so it adds a device rather than
      genuine redundancy
- [x] Tier three — a phone call, through PagerDuty, on the free plan. Live
      in teaching since 3 September, proven end to end.

      **An earlier claim in this plan was wrong and is now settled by test.**
      It said no free tier anywhere provides voice. That holds for Better
      Stack, whose free plan is email and Slack only, with phone and SMS from
      $29 per responder per month. It was wrong for PagerDuty. The "explicitly
      no voice" came from third-party comparison sites — the same mistake that
      produced the wrong Better Stack claim. Vendor pages only, and where a
      vendor page is ambiguous, test it.

      **Confirmed on 2 September**, end to end on the free plan: the phone
      rang within seconds of a test incident, read out the incident detail,
      and took a keypress to acknowledge, which appeared in the web interface
      at once. Acknowledging from the handset matters operationally — it means
      a 3am page can be silenced and triaged without opening a laptop.

      1. **Done.** Add the number under **My Profile → Contact Information →
         Voice → Add Phone Number**, then a high-urgency rule at **0 minutes**
         under **My Profile → Notification Rules**. Save PagerDuty's vCard to your
         contacts while there: calls come from varying numbers by country, and
         an unrecognised number is one a phone will happily screen — a
         "configured but does not reach a human" failure of exactly the kind
         this whole exercise keeps finding.
      2. **Done.** Create a service so an incident can exist. PagerDuty has
         **no test notification button**, so the only way to make the phone ring is a
         real incident, and an incident needs a service to belong to.

         Give it an **Events API v1** integration, not v2 and not the
         "Google Cloud Monitoring" tile. Google's own notification-channel
         documentation is explicit: add an Events API v1 integration and paste
         its key into the channel's **Service Key** field. The native
         `pagerduty` channel speaks the v1 event format, so a v2 routing key
         is the wrong shape. PagerDuty's own Google Cloud guide contains no
         setup steps at all — it defers to Google's — so Google's is the
         authority here. A service can hold several integrations, so adding
         v1 alongside anything already there is fine.

         Events API v1 was still offered in the picker on 2 September, despite
         being legacy. If it ever disappears, the fallback is a webhook
         channel posting to Events API v2 — more work, and its own decision.
      3. **Done — it rang.** Trigger an incident by hand from **Incidents →
         New Incident** against that service, at **high** urgency. Resolve it
         afterwards, so it cannot sit open and suppress the next one.
      4. Store the Events API v1 integration key in Secret Manager as
         `pagerduty-service-key`, read by a data source. Google calls the
         field the service key, confirmed against the `pagerduty` notification
         channel descriptor, whose only label is `service_key`. It went to a
         GitHub organisation secret first; moving it is recorded in the
         decision on where the alerting secrets live.

         Redaction was verified rather than assumed, the same way the phone
         number was: two identical resources planned side by side, one fed by
         a sensitive variable and one not, rendering `(sensitive value)` and
         the plain value respectively. This is a credential on a public
         repository, so the plan comment must never carry it.
         It is a credential, so it must never reach a plan comment on this
         public repository — the same trap the SMS number was kept out of.
      5. Add a `google_monitoring_notification_channel` of type `pagerduty`.
         Google Cloud supports that type natively, so no webhook is needed.
      6. **Decided: PagerDuty gets tier three only.** It receives one thing —
         a major outage, sustained — and Google Cloud keeps tiers one and two,
         the Slack, email and SMS rungs, exactly as they are.

         The alternative was to let PagerDuty own the whole ladder, doing
         push, then SMS, then voice on its own schedule, which is what the
         product is for and would have collapsed the Google Cloud policies
         instead of extending them. It was rejected deliberately: PagerDuty is
         a new third party with no track record here, and routing every
         notification through it would make an untested dependency the single
         path to being told anything at all. Giving it one narrow job means a
         failure on its side costs the phone call and nothing else — Slack,
         email and SMS carry on regardless.

         Revisit after a few months of both running. If PagerDuty proves
         reliable, collapsing the tiers into it becomes an easy, reversible
         change; if it does not, nothing important was resting on it.
      7. **Done on 3 September, and again after the secret moved.** Test the
         call end to end from a real Cloud Monitoring alert, not just a
         hand-triggered PagerDuty incident. A
         temporary uptime check reproducing the original fault opened an
         incident against a temporary policy pointed at the real PagerDuty
         channel; the phone rang and the keypress acknowledgement registered.
         Both temporary resources were deleted in the same sitting.

         The temporary policy used a sixty-second duration rather than the
         thirty minutes tier three uses, so what this proves is the join
         between Cloud Monitoring and PagerDuty — the only part that had never
         run. The duration and the filter are the same shapes already proven
         by tiers one and two. Re-test after any change to the channel, the
         key or the policy.

         That rule earned itself the same day. Moving the service key from a
         GitHub organisation secret into Secret Manager changed nothing a
         `terraform plan` could show — the value was byte-identical, so the
         apply reported no change to the channel at all — but it did change
         where the value came from at apply time. Re-tested rather than
         assumed, and the phone rang.

         Also learned: a condition `duration` of `0s` barely helps. Roughly
         three and a half minutes elapsed either way, because the floor is not
         the policy but the uptime check beneath it — it runs every sixty
         seconds, and the aggregation window needs enough failing samples
         before the condition can be true at all. Tuning the duration below
         that buys nothing.

      **On answering the call.** Press acknowledge, then let the incident
      resolve itself. Google Cloud drives these incidents: when the uptime
      condition clears, Cloud Monitoring sends a resolve event and PagerDuty
      closes automatically, so the two stay in step. Resolving by keypress
      while Google still holds the condition open desynchronises them and
      asserts the outage is over when it is not — the same class of error as a
      monitoring system confidently reporting a state that is not true.
      Escalating is a no-op with a single responder; there is nobody to hand
      to. PagerDuty's documentation writes the keypad digits as placeholders
      and does not document manual escalation, so the recording read out
      during the call is the authority on which number does what.

      - [ ] **A call slept through currently has no follow-up.** PagerDuty's
        escalation timeout defaults to thirty minutes and its documentation
        recommends at least two rules, which a lone responder cannot satisfy
        in the intended way. Google Cloud has already waited thirty minutes
        before ringing, so an unanswered call could mean an hour before
        anything happens again — or nothing at all, if the policy has a single
        rule. The solo-operator pattern is to **re-notify rather than
        escalate**: shorten the timeout, the minimum being one minute for a
        single target, and add a second rule pointing back at yourself so the
        timeout has somewhere to go. Neither is in Terraform; both are
        PagerDuty-side settings.

      Watch the cap: 100 phone and SMS notifications a month, combined. Ample
      at this volume, unless something flaps — which is exactly when it would
      be needed. Note also that PagerDuty becomes the first third-party
      processor this work adds, having deliberately kept the count at zero, so
      it belongs on the DSPT and DTAC record even though it only ever sees
      alert metadata.
- [ ] Do **not** build the phone call from Twilio and a Cloud Function to save
      the subscription. It is by far the cheapest option — roughly £1 a month
      for a number plus pennies a call — but it would put the pager inside the
      Google Cloud project it exists to page about, with no tests and nobody to
      notice when it silently stops working. An untested pager is worse than no
      pager, because it is trusted
- [ ] **Nothing detects a total Google Cloud outage.** Every link before the
      phone call runs inside Google Cloud: Cloud Monitoring runs the uptime
      checks, evaluates the conditions, and sends the notification. PagerDuty
      covers only the last hop, so if Google never fires the alert there is
      nothing to deliver. The service being down and everything being fine
      look identical from here — silence either way.

      This is the logical completion of the decision that the alarm should
      live outside Google Cloud. The escalation is now robust against Google's
      *notification channels* failing; it is not robust against Google's
      *monitoring* failing.

      Two shapes of fix, and the second is better:

      - **An external check.** Something outside Google Cloud polls the site
        and raises the alarm when it cannot reach it. Straightforward, but it
        is another vendor and another thing that must itself keep working.
      - **A dead man's switch.** Something inside Google Cloud tells an
        outside service "still alive" on a schedule, and the outside service
        alerts when the heartbeat stops. Silence becomes the signal, which is
        exactly what a total outage produces. It also catches a case an
        external poller misses: the site up but the alerting broken.

      Candidates, both free and both already to hand:

      - **Better Stack's free plan includes 10 heartbeats**, with email and
        Slack notification. Independent of Google Cloud, but no voice.
      - **A GitHub Actions scheduled workflow** is outside Google Cloud, free
        on this public repository, and could poll the site or watch for a
        missing heartbeat, then post to PagerDuty's Events API for a call.
        The catch is that scheduled workflows can run very late under load,
        so it is a backstop rather than fast detection.

      Open questions, to settle before building anything:

      - Does any free tier let an external monitor reach PagerDuty, or is a
        webhook a paid feature? The answer decides whether this can ring a
        phone or only send email.
      - What detection latency is acceptable? A dead man's switch trades
        promptness for certainty, and a heartbeat interval has to be chosen.
      - Is voice warranted at all here? For teaching, email and Slack are
        proportionate. For a clinical service they are not, which makes this
        another thing that changes when patient data appears.

      Do not start until the PagerDuty tier is applied and tested end to end;
      this builds on it.
- [x] Change the uptime check `period` in `infra/modules/monitoring/main.tf`
      from `300s` to `60s`, so detection lags by at most a minute rather than
      five. The comment marking 300s as the free tier is out of date: at two
      hostnames this stays comfortably inside the 1 million free executions a
      month, as costed above
- [x] Test every rung that exists end to end — done unintentionally and more
      thoroughly than a staged break would have managed. On 1 September a real
      uptime failure fired tier two at 19:29, delivering both SMS and email,
      and both tiers sent recovery notifications when it cleared. Re-test
      after any change to the channels, and include the phone call once it is
      bought.
- [x] Check daily for incidents stuck open. Cloud Monitoring notifies once per
      incident and will not open a second while the first is running, so a
      condition that never clears disables its own policy silently. A uptime
      check pointed at a path that did not exist held an incident open for
      **124 days**, during which every console view showed a correctly
      configured alert that could not have reported a real outage. No break
      test finds this — the alert looks right and simply never fires again.
      `.github/workflows/stale-incidents.yml` runs daily at 08:00 UTC and
      notifies Slack only when something is stuck; a daily all-clear would be
      exactly the routine notification people learn to ignore.
- [x] Prove the stale-incident check works end to end. **Done on 2
      September**, by the procedure below. A temporary uptime check
      reproducing the original fault opened a real incident; the workflow was
      dispatched with `stale_hours` at `0`; the check found it through the
      live API and the notify job posted to Slack, where the message arrived
      naming the policy and the host. Both temporary resources were deleted in
      the same sitting and the uptime check, alert policy and incident lists
      confirmed back to normal.

      That covers every link: real incident, live `projects.alerts` read,
      Workload Identity authentication on the runner, the threshold decision,
      the step output, the notify job's `if` condition, and delivery to a
      human. The same run also proved the negative case, since the notify job
      is correctly skipped when nothing is stale.

      Re-run it after any change to the script, the workflow or the Slack
      channel — the procedure is below and takes about ten minutes.

      Recreate the original fault rather than invent an artificial one, so
      the test proves the exact scenario that went unnoticed. The threshold is
      the only thing that would otherwise make this a day-long wait, so
      `workflow_dispatch` takes a `stale_hours` input:

      1. Create a temporary uptime check against `quill-medical.com` at
         `/api/health` — the original mistake. The public site is static pages
         from a bucket, so it returns 404 and the check fails immediately.
      2. Create a temporary alerting policy on that check, with **no
         notification channels** so it opens an incident and tells nobody.
         The existing policies filter on the specific check identifiers
         Terraform manages, so a new check on its own raises nothing.
      3. Wait a few minutes for the incident to open.
      4. Dispatch the workflow with `stale_hours` set to `0`, so the fresh
         incident counts as stale.
      5. Expect the run to list it and Slack to receive the message.
      6. Delete both temporary resources; the incident closes on its own.

      Create them by hand rather than in Terraform: they should exist for
      minutes, and a temporary resource left in state is how orphans are made.
      Delete them in the same sitting, and confirm afterwards that the uptime
      check list is back to the two managed ones.
- [ ] Fold the result into the incident response plan and runbook items already
      open in `todo.md`, and replace the `webhook_token_auth` Slack channel
      with the native integration while in there

## Phase 2: how many people visit the public site

No application code. This is infrastructure and a dashboard.

- [x] ~~Enable Log Analytics on the log bucket~~ — dropped. The BigQuery
      archive below already provides SQL over the same logs, and enabling
      analytics on the `_Default` bucket through Terraform is known to be
      unreliable (`_Required` is locked outright, and
      `google_logging_project_bucket_config` has open issues with the
      underscore-prefixed names). Not worth a manual console step for a
      capability already covered
- [x] Check `var.log_sample_rate` on the frontend backend service — it defaults
      to `1.0`, so nothing is sampled and the counts need no correction factor
- [x] Truncate or drop the client IP address at ingest — **not possible, so
      handled by retention instead.** Cloud Logging sinks route entries, they do
      not redact fields, and `httpRequest.remoteIp` cannot be omitted from
      load-balancer logs at source. Keeping IP addresses for a year to count
      visits to a marketing site would be disproportionate, so the raw archive
      expires at 90 days and the long-run trend comes from the log-based
      metric, which stores no IP at all
- [x] Add a log-based counter metric over the load-balancer request logs,
      excluding bot and uptime-check traffic at the filter rather than in the
      chart — `google_logging_metric.public_site_visits` in the new analytics
      module, scoped to the landing domain so app traffic is not double-counted
- [x] Add visits over time to the single Cloud Monitoring dashboard, beside
      uptime and error rate
- [x] Expand the dashboard beyond those three panels: request latency at the
      95th percentile, 4xx charted separately from 5xx, Cloud SQL connections
      and disk utilisation, and Cloud Run instance count. Each earns its place
      by changing a decision. CPU, memory, billable instance time and network
      bytes were deliberately left off — the standard menu, answering nothing
      actionable at this scale, and Cloud Run's built-in dashboards already
      carry them for when digging is needed.
- [x] Alert on Cloud SQL disk above 80% sustained for 30 minutes.

      **Corrected on 4 September.** This was justified here as "the failure
      that gives days of warning and still takes the service down if nobody
      looks". That is wrong for this instance: `disk_autoresize` is enabled in
      `modules/cloud-sql/main.tf` with no upper limit, so the disk grows on
      its own rather than filling and stopping writes. The alert is still
      worth having, but for a different reason — sustained growth means
      something is expanding faster than expected, and disk that has grown
      does not shrink again, so it becomes a standing cost. The alert
      documentation says this, rather than implying an outage is imminent.
- [x] Add an `app_page_loads` metric counting successful non-API requests to
      the app host — usage of the application, available without touching
      application code. **It counts page loads, not people.** Nothing
      identifies a visitor, deliberately, so it cannot separate two visits by
      one person from one visit by two. Phase 3's per-session random
      identifier is what turns this into sessions, and it needs the
      application code in Phase 3.
- [x] Set `app_domain` explicitly in the environment tfvars rather than
      deriving it from `monitored_hostnames[0]`, so reordering that list
      cannot silently point the app metrics at the marketing site.
- [x] Add an `infra/modules/analytics` Terraform module with a BigQuery dataset
      and a log sink, as the archive that allows new questions of old data —
      metrics cannot be re-sliced after the fact, and 30 days of log bucket
      retention is too short to see a trend
- [x] Set and apply an expiration matching the retention decision —
      `var.retention_days`, defaulting to 30 and applied as **partition**
      expiry, not table expiry, so old days roll off instead of the whole table
      vanishing on its anniversary. The long per-page history lives in the
      metric's `page` label instead, with no IP in it, so retention and privacy
      stopped competing

## Phase 3: which pages get used in the app

The only phase needing new client code, and the one carrying the real risk.
**Next, alongside Phase 1's client half** — see the note there on keeping new
routes out of `main.py`.

- [ ] Add a route-to-name allow-list mapping each of the 63 routes to a stable
      page name, so no URL or document title ever leaves the browser
- [ ] Add a route-change hook in `RootLayout.tsx` that posts the page name
      through `lib/api.ts`
- [ ] Add a backend endpoint that rejects any name not in the allow-list and
      logs accepted ones through the analytics logger, rate-limited as above
- [ ] Identify page views by a per-session random identifier rather than the
      user ID, so the counts are of sessions rather than of identified people —
      cheaper to justify, and sufficient for the question being asked
- [ ] Add a hard guard that no-ops the ping on routes behind `RequireClinical`,
      with tests proving it
- [ ] Add an opt-out toggle in `Settings.tsx`, honoured before any ping is
      sent, with `.stories.tsx` and `.test.tsx` per the component rules
- [ ] Add a log-based counter metric over the accepted pings, labelled by page
      name, and chart page views per page on the same Cloud Monitoring
      dashboard as everything else
- [ ] Tests: allow-list rejection, clinical-route guard, opt-out honoured

## Phase 4: self-host the Cormorant Garamond typeface

Not analytics, but found while writing the privacy policy and squarely a
privacy fix, so it belongs here rather than in a backlog nobody reads.

The public site and Storybook both load Cormorant Garamond from
`fonts.googleapis.com`, with a preconnect to `fonts.gstatic.com`. Every visitor
therefore has their IP address sent to Google before a single word renders. It
is the **only** third-party transfer on an otherwise self-contained marketing
site, it happens before any opportunity to consent, and it is the kind of thing
that has drawn enforcement attention elsewhere in Europe.

It is also an odd exception rather than a considered choice: the application
already self-hosts its other typeface through `@fontsource-variable/atkinson-hyperlegible-next`.
The same pattern applies here.

**The claim that "the CSS family name does not change, so no component needs
touching" was wrong**, and would have shipped a silent regression. Fontsource's
variable packages register the family with a `Variable` suffix — the package
declares `'Cormorant Garamond Variable'`, while the three consumers asked for
`'Cormorant Garamond'`. Nothing errors: the browser simply falls through to the
next name in the stack, so the site renders in Georgia and looks merely
slightly off. The existing `theme.ts` already had the answer in plain sight,
naming `'Atkinson Hyperlegible Next Variable'`. Caught by grepping the built
CSS for what was declared against what was requested, not by reading the code.

Worth knowing while doing this: the strict Content Security Policy in
`caddy/prod/Caddyfile` — `style-src 'self' 'unsafe-inline'`, `font-src 'self'`
— would already forbid this. It does not bite only because the marketing site
is served straight from the GCS bucket through the load balancer and never
passes through Caddy. So the public site currently has **no** Content Security
Policy at all. Self-hosting the font removes the last thing that would prevent
applying one, which is worth a follow-up of its own.

- [x] Add `@fontsource-variable/cormorant-garamond` (5.3.0; 283 kB, no
      dependencies, OFL-1.1) to the frontend workspace
- [x] Import it in `public_pages/src/global-styles.ts` and
      `.storybook/preview.tsx`, beside the existing Atkinson import. The
      application itself does not need it — nothing under `src/pages` uses the
      `Public*` components.
- [x] Remove the Google Fonts `<link>` and both `preconnect` hints from
      `frontend/public_pages/templates/page.html`
- [x] Remove the same block from `frontend/.storybook/preview-head.html`. That
      file contained nothing else, so it is deleted rather than left empty.
- [x] Point the three consumers at the family the package actually declares.
      They needed changing after all — see above.
- [x] Check the italic faces specifically. **Two entry points, not one.** The
      package's default export carries only the upright faces; italics live in
      `wght-italic.css` and must be imported separately. Importing just the
      default would have rendered italics as a synthesised oblique — close
      enough to pass a glance, and wrong. Confirmed by the build emitting ten
      `.woff2` files, `-italic` and `-normal` across every subset.
- [x] Verify no request to `fonts.googleapis.com` or `fonts.gstatic.com`
      remains. Checked by grepping the built output of both the public pages
      and Storybook: zero references in either. Then checked visually with
      `just pub`, which rendered **identical** to the live site — the proof
      that the family name resolved and the italics are real rather than
      synthesised, since either fault would have been obvious at display
      size.
      Verified green with `yarn typecheck:all`, `yarn workspace public-pages
      build`, `yarn unit-test:run` (184 files, 1723 tests) and
      `yarn storybook:build`.
- [ ] Follow-up, separately: consider serving the marketing site with a Content
      Security Policy now that nothing third-party is loaded

## Prerequisites

Blocking, before any of this ships:

- [ ] Cookie policy — **being written by a lawyer**. Drafts were written from
      the code and then reverted; the published pages remain the original
      stubs. The facts the policy has to state are settled and are recorded
      below, so drafting them again is not the task — commissioning and
      publishing the reviewed version is.
- [ ] Privacy policy — **being written by a lawyer**, same position. It will
      need updating again when client error reporting and page-view counting
      actually ship, since both add processing the current text cannot
      describe.
- [ ] Self-host the Cormorant Garamond typeface — see the phase below. Fixing
      it is better than disclosing it, and it removes a question the lawyer
      would otherwise have to answer.

### Facts the policies need to state

Established from the code, for whoever drafts them:

- **The public site sets no cookies at all.** No analytics, no advertising, no
  consent banner needed. Its only third-party request is the Google Fonts one
  above.
- **The application sets exactly three cookies**, all strictly necessary under
  PECR Regulation 6(4), so none needs consent but all need describing:
  `access_token` (15 minutes, HttpOnly, SameSite=Lax, path `/`);
  `refresh_token` (7 days, HttpOnly, SameSite=Lax, scoped to
  `/api/auth/refresh`); and `XSRF-TOKEN` (matches the access token, and is
  deliberately **not** HttpOnly because the client must read it back).
- **Load-balancer request logs** record method, URL, status, size, user agent,
  referrer, latency, protocol and client IP. Public-site rows are archived for
  30 days; the long-run per-page counts live in a log-based metric holding no
  IP.
- **No third-party analytics processor** is used on any surface.
- **Hosting** is Google Cloud Platform, European region.
- [ ] Data protection impact assessment covering both, recording that no
      third-party processor is involved and that the electronic communications
      regulations do not engage
- [ ] Retention period set for the analytics dataset, folded into the
      outstanding UK GDPR data-retention decision in `todo.md`

## Decision: where the alerting secrets live

This work introduced three secrets — the escalation phone number, the PagerDuty
service key, and the Slack webhook — and routed all three through GitHub
organisation secrets into `TF_VAR_*`. That was the wrong default, and
inconsistent with `modules/secrets`, which already keeps application secrets in
GCP Secret Manager with values set outside Terraform.

**The rule, now also in the project instructions:** a secret GitHub Actions
genuinely *consumes* belongs in GitHub; a secret it only *relays* belongs at
the destination. The test is whether anything in the workflow opens the
envelope or merely carries it.

Applying it:

      **The move takes two applies, not one.** A `google_secret_manager_secret_version`
      data source cannot read a version that does not exist yet, so a single
      apply cannot both create an empty container and read from it. The
      sequence mirrors the expand-contract pattern the backend rules already
      use:

- [x] **Expand.** Add `pagerduty-service-key` and `alert-sms-number` to the
      `module "secrets"` list, so Terraform creates the empty containers. Safe
      on its own: nothing reads them yet and the `TF_VAR_*` wiring still
      supplies the values.
- [x] **Populate by hand**, per the convention in `modules/secrets/main.tf`
      that values are never set through Terraform. Both stored and verified by
      byte count: the key at 32, the number at 13.

      Two traps, both hit on the way. `--data-file=-` reads standard input,
      so the command must already be **running** before the value is pasted —
      pasting first appends it to the flag, and gcloud goes looking for a file
      by that name. And Ctrl-D only signals end-of-input at the start of an
      empty line, so after pasting it must be pressed twice. Neither is
      obvious, because the command sits silently with no prompt. This avoids
      both:

      ```bash
      read -rs KEY && printf '%s' "$KEY" \
        | gcloud secrets versions add <name> --project <project> --data-file=- \
        && unset KEY
      ```

      `read -rs` does not echo, `printf '%s'` strips the newline that would
      otherwise be stored as part of the value, and nothing reaches shell
      history. Check with `... versions access latest | wc -c`: a byte too
      many means a newline crept in, and would fail at delivery rather than at
      configuration.
- [x] **Contract.** Switch to `google_secret_manager_secret_version` data
      sources, drop both `TF_VAR_*` lines from `terraform.yml`, and remove the
      now-unused root variables. Redaction verified from the provider schema
      rather than assumed: `secret_data` carries `sensitive=True`, so the
      values are hidden at source, before any marking of our own applies.
- [x] Delete `PAGERDUTY_SERVICE_KEY` and `ALERT_SMS_NUMBER` from the GitHub
      organisation only once an apply has succeeded reading from Secret
      Manager. Removing them first would break the apply that is meant to
      replace them. **Done on 3 September**: the apply read both data sources
      cleanly, and both secrets are gone from the organisation, which now
      holds only `SLACK_WEBHOOK_URL`. A live credential and a personal number
      are no longer readable by five repositories, two of them public.

      One surprise in that apply, worth knowing before reading a future plan:
      it reported **1 changed**, not the expected 0. Nothing to do with the
      secrets, which resolved byte-identically. It was
      `google_monitoring_dashboard.quill` — Google's API normalises the
      dashboard JSON it stores, adding an `etag`, quoting `columns` as the string
      `"2"` and filling in `targetAxis`, and Terraform rewrites it back to the
      literal in the code every time.
- [ ] Settle the dashboard's permanent drift. `google_monitoring_dashboard.quill`
      appears in every plan without anything having changed: Google normalises
      the JSON it stores — adding an `etag`, quoting `columns` as the string
      `"2"`, filling in `targetAxis` — and Terraform rewrites it back to the
      literal in the code. Harmless in itself, but it erodes the one signal
      that makes a plan worth reading, which is whether it looks clean. Either
      write the JSON in the shape the API returns, or `ignore_changes` the
      fields it rewrites.

      The three Cloud Run `client = "gcloud" -> null` drifts that used to
      accompany it did **not** appear in the 4 September plan, so that half
      seems to have settled on its own. Worth confirming over a few more
      applies before assuming it is gone.
- [x] Leave `SLACK_WEBHOOK_URL` in GitHub. `slack-notify.yml` posts to it
      directly, so GitHub is the client rather than a courier, and the content
      repositories reach that workflow through `secrets: inherit`. Duplicating
      it into Secret Manager would create a second copy to rotate, which is
      worse than the problem.
- [x] **Leave `SLACK_WEBHOOK_URL` at `ALL` visibility.** Considered narrowing
      it: only three repositories use it — `quillmedical`, and `teaching.yml`
      in `eoeeta-teaching` and `respiratory-teaching` — while
      `bailey-medics.github.io` and `VPR` reference Slack nowhere and are both
      public.

      Decided against, on impact rather than exposure. An incoming webhook can
      only post to one channel: it cannot read messages, reach other channels,
      exfiltrate anything, or act as a user. A leak means unwanted messages,
      and rotating the webhook ends it immediately. That is a different
      category from the PagerDuty key, which can raise incidents and ring a
      phone at 3am, or a personal number, which cannot be rotated at all.

      Worth knowing rather than worth acting on: a webhook could post
      convincing fake alerts, or a fake all-clear, into the very channel used
      for alerting. Negligible for one operator who knows the system;
      reconsider if the channel is ever read by people who would act on it
      without checking.
- [x] ~~Narrow the visibility of the two relayed secrets to `quillmedical`.~~
      **Overtaken and closed.** The concern was that all three organisation
      secrets were visible to every repository, including
      `respiratory-teaching`, `bailey-medics.github.io` and `VPR`, none of
      which have anything to do with monitoring and some of which are public.
      Narrowing became unnecessary for two of them: `PAGERDUTY_SERVICE_KEY`
      and `ALERT_SMS_NUMBER` were deleted from the organisation outright once
      Terraform read them from Secret Manager instead. `SLACK_WEBHOOK_URL`
      remains at `ALL` by a deliberate decision recorded above — an incoming
      webhook can only post to one channel, so a leak is noise rather than
      access, and rotating it ends the matter.

**What migrating does not fix.** The value still lands in Terraform state,
because a notification channel resource needs the literal value. The
application secrets avoid this only because Cloud Run references them by name
and resolves at runtime — a genuinely different situation, not a double
standard. The gain here is removing a second custodian, and getting IAM
scoping, versioning and audit logging.

## What building this taught us

Findings from actually building and testing this, rather than from planning it.
Each cost time to learn and would be cheap to relearn the hard way, so they are
recorded here rather than left in commit messages.

**A green `terraform plan` proves less than it appears to.** Plan checks
syntax, provider schema and state. It does not check IAM for resources that do
not yet exist, and it does not evaluate the API's semantic rules. The first
apply of a new resource type is the real test, and this plan leaned on a green
plan as though it were validation until two failures at apply time said
otherwise:

- `notification_rate_limit` is legal only on **log-based** alerting policies.
  It was copied from `cloud_run_startup`, which matches log entries, onto
  `server_errors`, which is a metric threshold. Google rejected it at create
  time: "only log-based alert policies may specify a notification rate limit".
- The deploy service account could create metrics, dashboards and BigQuery
  datasets, but not log sinks. **`roles/editor` does not include
  `logging.sinks.create`** — a genuine trap, since editor covers so much that
  it is easy to assume it covers everything. The account cannot grant itself
  the missing role, so it needed a one-off manual `roles/logging.configWriter`.

**An alerting policy with a permanently-open incident is a disabled alerting
policy.** Cloud Monitoring notifies once per incident and will not open a
second while the first is running. A condition that never clears therefore
silences its own policy, indefinitely, with no symptom anywhere in the console.
An uptime check probing `/api/health` against the public site — which is static
files from a bucket and has no API — held an incident open for **124 days**.
Throughout, that host was not merely misconfigured but **unmonitored**: a real
outage would have raised nothing, because the incident was already open. No
deliberate break test finds this; the alert looks correct and simply never
fires again. Hence the daily check in
`.github/workflows/stale-incidents.yml`.

**Not all monitored hosts are alike.** The same uptime check configuration was
applied to every hostname, but only the app has an API to health-check. Probe
paths belong per host.

**Reality tested the alerting better than a staged break would have.** The
question asked was how to test alerting without breaking a working app. Before
anything was staged, a real uptime failure fired tier two, delivered SMS and
email, and both tiers sent recovery notifications when it cleared. A deliberate
break would have confirmed only that alerts fire; it would never have revealed
an alert that had been dead for four months. Where a live check is impossible,
querying an alert's own filter over historical data is a decent
non-destructive substitute — the 5xx filter was confirmed that way, against ten
real errors, without breaking anything.

**A check that has never failed proves nothing.** Three variations of the same
mistake appeared in two days:

- A `grep` written to find grouped shell declarations could not match the most
  common form of them, so its empty output was read as "clean".
- The stale-incident tests passed on fixtures at 2 and 30 hours against a
  24-hour threshold, so the boundary between them was never exercised — and
  the boundary was where the off-by-one lived.
- The first live run of that detector reported `1 open` and listed nothing,
  because whole-hour truncation made a fresh incident `0` and the guard used
  `-le`. Only real data exposed it.

Before trusting a check, make it fail on purpose once.

**Terraform state is not a secret store, and a public repository is
unforgiving.** The escalation phone number reaches Terraform through a secret
and is marked `sensitive`, because plan output is posted as a comment on a
public pull request. Marking it sensitive was verified rather than assumed, by
planning two identical resources side by side and confirming one rendered as
`(sensitive value)`. Note the number still lands in state in a private bucket:
a deliberate exception to the rule in `modules/secrets/main.tf` that secret
values never enter state, and the only alternative was creating the channel by
hand and leaving it unmanaged.

**Route what you meant to keep, never a resource type.** The BigQuery sink was
first written to capture `resource.type="http_load_balancer"`, which would have
archived authenticated app traffic — including paths carrying patient and user
identifiers — alongside client IP addresses, for the whole retention window.
The pipeline built to honour the "no raw URLs" rule would have broken it. Sinks
are now scoped to the host they are meant to cover.

**A change of custody shows up in no plan.** Moving the PagerDuty key from a
GitHub secret into Secret Manager altered nothing `terraform plan` could
display — the value was byte-identical, so the apply reported no change to the
notification channel at all — but it changed where the value came from at apply
time. A green plan said nothing useful about whether the phone would still
ring. Only ringing it did. Any change to *where* a value comes from needs the
same end-to-end test as a change to the value itself.

**Prefer vendor pricing pages to comparison sites.** Two claims in this
document about which alerting tiers include voice were wrong, both taken from
third-party comparisons and both contradicted by the vendors' own pages.

## Decisions

- **Scope is three questions, not a product analytics capability** — errors,
  public visits, app page views. Everything outside that is explicitly not
  being built, so the instrumentation stays small enough to audit by reading it.
  The test applied was "what decision would this data change?", and anything
  without an answer was dropped. Marketing analytics is the clearest example:
  it earns its keep when there is a budget to reallocate, and there is not one
  yet. Nothing is foreclosed by waiting, since load-balancer logs retain
  referrer and user-agent regardless of whether a dashboard reads them.

- **One dashboard, outside the app, for all four things** — the thing you
  consult while something is broken cannot live inside the thing that broke, so
  incident views must be external. Rather than splitting usage views back into
  the app, everything goes on one Cloud Monitoring dashboard: a single bookmark
  beats a habit of checking several places, and it removes an entire build.
  It is also why the phone-call rung sits outside Google Cloud altogether.

- **Log-based metrics as the dashboard source, BigQuery as a short archive** —
  metrics chart cheaply next to uptime with no second tool, but they are
  aggregates fixed at definition time and cannot be re-sliced later. The raw
  sink is the insurance against a question nobody has thought of yet. It is
  kept short rather than long because load-balancer logs carry client IP
  addresses and Cloud Logging sinks cannot redact fields: the metric holds the
  long trend without personal data, the archive holds recent detail and
  expires.

- **Escalate by tiers rather than one dramatic alert** — a channel that fires
  for self-resolving blips gets muted, and a channel set late enough to avoid
  that is too late to be useful. Severity climbs with duration instead: Slack,
  then SMS and push, then a call.

- **Defer the phone call until clinical users exist** — it is the only part of
  this plan that is not free, on any provider at any tier, and buying an
  on-call subscription to page one person about a teaching product is the
  "expensive, so wait for circumstances to change" case. Building it from
  Twilio instead would be cheap and wrong: it would put the pager inside the
  project it pages about, untested, and a pager nobody tests is worse than
  none, because it gets trusted.

- **Check health every minute, not every five** — five minutes of detection
  lag before the first tier even starts counting is too much for a clinical
  product, and at two hostnames the fivefold increase in executions still sits
  at about half the free monthly allowance.

- **Accept that counting is not retroactive** — the one real cost of this
  minimalism. A question asked in six months about a change made today can only
  be answered if the counting had already started. That argues for starting the
  counting now, which this plan does, rather than for collecting more kinds of
  it.

- **Assume patient data arrives tomorrow** — the governing instruction.
  Behavioural instrumentation creates the exposure before any clinical field is
  sent, so it has to be safe from the first event rather than retrofitted.

- **No third-party processor on any surface** — including the public site.
  Three counting questions do not justify a permanent assurance liability.

- **An allow-list of page names, not a URL** — the single most important
  control here. A URL from a clinical route can disclose a patient's condition;
  a fixed name cannot. It also removes the need for a general event catalogue,
  since the allow-list is the whole schema at this scope.

- **Count sessions, not identified people** — a per-session random identifier
  answers "which pages get used" without linking behaviour to a named clinical
  user. The cost is that returning-user questions become unanswerable, which is
  outside the three questions anyway.

- **Server-side and same-origin throughout** — no device storage means the
  electronic communications regulations never engage, and the Content Security
  Policy stays untouched.

- **Ordered by the questions as asked** — errors first. Phase 2 needs no
  application code and could land first as a warm-up if that suits the
  scheduling better; Phases 1 and 2 are independent of each other, and Phase 3
  depends on the sink built in Phase 2.

## Not building, and what would change that

Recorded so that a later "shouldn't we have analytics?" conversation starts
from the reasoning rather than from scratch:

- **Funnels, retention curves and cohort analysis.** Not asked for. When they
  are wanted, the data will already be in BigQuery and they become SQL
  queries — more work than clicking a product analytics interface, but not a
  rebuild.

- **An in-app analytics page for superadmins.** Drafted and then dropped. It
  would have used `@mantine/charts`, a nightly rollup into the core database
  and a new `view_platform_analytics` competency, and it remains a perfectly
  good idea — but it duplicates a dashboard that already exists for free, and
  splits the answers across two places for the sake of presentation. Revisit it
  when there is someone other than the operator who needs to see the numbers
  and should not be given a Google Cloud login: a customer, an investor, or a
  clinical lead. Until then it is a build with no reader.

- **A typed event catalogue in `shared/`.** The earlier draft proposed one
  mirroring `competencies.yaml`, generated into TypeScript and read by PyYAML.
  At three questions it is overbuilt: the page-name allow-list is the schema.
  If event tracking ever grows past roughly a dozen distinct events, revisit
  it — untyped, ungoverned event names rot fast, and the catalogue is the
  standard defence.

- **PostHog Cloud (EU).** The best tool on the merits, with a free tier Quill
  would not exceed, and it would have supplied error tracking and feature flags
  in the same box. Excluded because a processor holding behavioural data from a
  clinical surface is a standing declaration on the assurance record, and
  because its default capture behaviour carries health data unless several
  controls are each configured correctly and stay correct. Worth noting for any
  future revisit: its self-hosting is now hobby-only, so adoption would be on
  the cloud terms.

- **Plausible or Umami for the public site.** Cookie-free, EU-hosted, about
  £9–19 per month, one script tag. Held as the fallback for question 2 if the
  log-derived dashboard proves too coarse to guide decisions — reach for it
  then, not before.

- **GlitchTip or Sentry for error tracking.** Cloud Error Reporting is weaker
  at grouping and at source maps than a dedicated tool. If Phase 1 produces
  reports too noisy or too anonymous to act on, self-hosted GlitchTip is the
  strongest fallback — Sentry protocol, four containers rather than forty — but
  it is another stateful service to patch, so it is a second step and not a
  starting point.

- **Warehouse-native analytics (Mitzu, Kubit, Snowplow).** The direction of
  travel for organisations with data teams. This plan happens to land Quill's
  data where those tools expect to find it, so adopting one later would be a
  connection rather than a migration.

## Glossary

- **CAF** — Cyber Assessment Framework. The National Cyber Security Centre's
  outcome-based security framework, to which the NHS Data Security and
  Protection Toolkit is now aligned.

- **CSP** — Content Security Policy. A browser security header declaring which
  origins a page may load scripts from and send requests to. Quill's is set in
  `caddy/prod/Caddyfile`.

- **DPIA** — data protection impact assessment. The written risk assessment UK
  GDPR requires before starting higher-risk processing.

- **DSPT** — Data Security and Protection Toolkit. NHS England's annual
  self-assessment of an organisation's data security, now aligned to the CAF.

- **DTAC** — Digital Technology Assessment Criteria. The NHS baseline
  assessment of a digital health product's safety, security, interoperability
  and usability. The DSPT assesses the organisation; the DTAC assesses the
  product.

- **DUAA** — Data (Use and Access) Act 2025. The UK Act that amended UK GDPR
  and PECR. Royal Assent 19 June 2025; main provisions in force 5 February
  2026; penalty and complaints provisions from 19 June 2026. It created the new
  cookie consent exceptions and raised PECR penalties to UK GDPR levels.

- **GDPR** — General Data Protection Regulation. "UK GDPR" is the retained UK
  version. It governs the processing of personal data.

- **ICO** — Information Commissioner's Office. The UK data protection
  regulator, which issues the guidance and levies the fines.

- **NCSC** — National Cyber Security Centre. The UK government body that
  authors the CAF.

- **PECR** — Privacy and Electronic Communications (EC Directive) Regulations 2003. The UK's actual cookie law. It governs storing or reading anything on a
  user's device, whether or not that thing is personal data — a different
  question from UK GDPR's, which is about processing personal data.

- **PHI** — protected health information. Any data revealing a person's health
  status, including behavioural data that discloses it indirectly.

- **SPA** — single-page application. A web app that renders navigation in the
  browser rather than requesting a new document per page, which is why
  server-side logs cannot see page views in the authenticated app.

## Sources

Regulatory:

- [ICO — guidance on the use of storage and access technologies](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/about-this-guidance/)
- [ICO — what is special category data](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/)
- [Bird & Bird — current UK cookie laws, insights from the final ICO guidance](https://www.twobirds.com/en/insights/2026/current-uk-cookie-laws-insights-from-the-final-ico-guidance)
- [Data Protection Network — the DUAA and the five cookie exceptions](https://dpnetwork.org.uk/duaa-cookie-exceptions/)
- [Seresa — why GA4 does not qualify for the statistical purposes exception](https://seresa.io/blog/cookie-consent-tracking-data-loss/duaas-statistical-purposes-exception-doesnt-save-ga4)
- [NHS England — CAF-aligned DSPT guidance](https://digital.nhs.uk/cyber-and-data-security/guidance-and-resources/caf-aligned-dspt-guidance/audit-guides/strengthening-assurance-independent-assessment-summary-of-guides/cyber-assessment-framework-caf-aligned-data-security-and-protection-toolkit-dspt//)
- [EJN Labs — DSPT is now CAF-aligned, what NHS suppliers must do before 30 June 2026](https://ejnlabs.com/dspt-caf-aligned-nhs-suppliers/)

Cost:

- [Google Cloud — BigQuery pricing](https://cloud.google.com/bigquery/pricing)
- [MonitoringCost — GCP Cloud Operations suite pricing 2026](https://monitoringcost.com/gcp-monitoring-cost)
- [OneUptime — calculating and optimising Cloud Logging costs](https://oneuptime.com/blog/post/2026-02-17-how-to-calculate-and-optimize-cloud-logging-costs-by-analyzing-ingestion-volume/view)

Tooling, for the options not taken:

- [PostHog — privacy controls for session replay](https://posthog.com/docs/session-replay/privacy)
- [PostHog — self-hosting disclaimer](https://posthog.com/docs/self-host/open-source/disclaimer)
- [ProductQuant — PostHog PII and PHI exposure checklist](https://productquant.dev/blog/posthog-pii-phi-exposure-checklist/)
- [OpenPanel — self-hosted web analytics 2026](https://openpanel.dev/articles/self-hosted-web-analytics)
- [GlitchTip — hosted architecture](https://glitchtip.com/documentation/hosted-architecture/)
- [DanubeData — self-hosting Sentry or GlitchTip in 2026](https://danubedata.ro/blog/self-host-sentry-glitchtip-error-tracking-2026)
