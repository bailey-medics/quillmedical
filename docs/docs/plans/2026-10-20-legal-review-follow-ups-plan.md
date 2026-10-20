# Legal review follow-ups plan

A review of the privacy policy and the terms of service against the code
and the law, on 20 October 2026, found that the system breaks a promise
the policy makes: that everything Google holds for Quill Medical is in
its London region. In App production that day the `_Default` log bucket,
holding request logs with IP addresses and the browser error reports,
was in `global`, and all fifteen database backups were in the `eu`
multi-region. It also found that one alert sends user and passport ids
to Slack and PagerDuty, two US companies the policy does not name.

This plan makes the system keep those promises before EoEETA goes live,
and settles the smaller wording points from the same review: the
consent history that goes with a deleted account, the promise of an
"accept" screen for new terms, "Quill Medical" rather than "Quill"
throughout both documents, and three legal questions cut back to one
note. The wording comes first because it is quick and
lands without a deploy; then the alert, the backups and the logs, each
its own pull request, in rising order of risk.

## Phase 1: Wording

- [x] **Say "Quill Medical" throughout both documents.** In
      `docs/docs/legal/privacy-policy.md` and
      `docs/docs/legal/terms-of-service.md`, replace every bare "Quill"
      (33 and 44 of them on 20 October 2026) with "Quill Medical".
      Leave alone what already reads "Quill Medical", the web addresses
      (`quill-medical.com`) and the email address. "Quill's" becomes
      "Quill Medical's", and the defined term in clause 1.3 of the terms
      becomes "Quill Medical". Reflow the lines it lengthens, and read
      each changed sentence once, since "the Quill Medical service" and
      "a Quill Medical account" can need an article the old word did
      not. Mark made the decision on 20 October 2026.

- [x] **Say what happens to the consent history when an account is
      deleted.** Section 3.6 keeps the record of each newsletter answer
      for six years after the last one, but emptying an account
      (`backend/app/users/emptying.py`) deletes those rows, typically
      two years after closure. The answer itself is not lost: it moved
      to the newsletter list when the account was closed, and stands
      there. So the wording changes, not the code. In section 3.6 and in
      section 7, the record of each answer is kept "for six years after
      the last one, or until your account is deleted, if that comes
      first", followed by one sentence saying that the current answer
      carries on, on the newsletter list. Decided on 20 October 2026:
      a history that cannot be tied to an address once the account is
      emptied is evidence of nothing, so keeping it longer would be
      keeping data for no purpose.

- [x] **Stop promising an "accept" screen the app does not have.**
      Clause 15.2 of the terms says that for a change that is not minor
      "we will ask you to accept the new version the next time you sign
      in", and nothing in the app shows such a screen or records who
      accepted which version. Reword it to what the service does: at
      least 30 days' notice by email or within the service; the right to
      close the account before the change takes effect, with a refund of
      any unused paid plan, as now; and "if you carry on using Quill
      Medical after that date, you accept the new version". Clause 15.3
      already keeps every version, dated, so the version somebody was
      under can be worked out from the date. Decided on 20 October
      2026: changing the words while version 1.0 is unpublished costs
      nothing, where a screen and an acceptance table would be built for
      a change nobody has planned. If a sponsor ever asks for recorded
      acceptance, it becomes its own plan.

- [x] **Note the change in `docs/docs/legal/index.md`**, under a dated
      paragraph like the others, still version 1.0 because neither
      document has been published.

## Phase 2: No identifiers in alerts

- [ ] **Log the route template with every request.** The request log
      line in `backend/app/main.py` (the middleware that writes
      `method`, `path`, `status`) gains a `route` field: the matched
      route's template, such as `/api/users/{user_id}/deactivate`, read
      from `request.scope.get("route")` after `call_next`, which FastAPI
      sets on the scope when a route matches. A request that matched no
      route logs `unmatched`. Test it beside the module, with one route
      that has a path parameter and one path that matches nothing.

- [ ] **Quote nothing that identifies anybody in the "Backend error
      logged" alert.** Its `label_extractors` in
      `infra/modules/monitoring/main.tf` quote the log message and the
      request path, so `/api/users/123/deactivate` and the text of a
      refused passport sign-off reach Slack and PagerDuty. Replace
      `message` and `request` with `logger`
      (`EXTRACT(jsonPayload.name)`), `request_id`
      (`EXTRACT(jsonPayload.request_id)`) and `route`
      (`EXTRACT(jsonPayload.route)`), keep `method`, `status` and
      `platform` (Cloud Run's own wording, which holds no user data),
      and update the documentation block above so it says to search the
      logs by request id. Rewrite the long comment over the extractors
      to give the new reason. No other alert policy quotes anything; the
      feedback notice in `backend/app/feedback/slack.py` already sends
      no identifiers.

- [ ] **Check it in App production.** After the deploy and the
      Terraform apply, write one test entry with `gcloud logging write`
      at severity `ERROR` against the backend's `cloud_run_revision`
      resource, and confirm that the Slack message shows the logger,
      the request id and no path. This is the alert's first test since
      it changed, so an empty label is worth catching here and not on
      a real fault.

## Phase 3: Database backups in London

- [ ] **Pin the backup location.** In
      `infra/modules/cloud-sql/main.tf`, `backup_configuration` gains
      `location = var.region`. Every instance the module makes takes it,
      so the FHIR and EHRbase databases do too when they are switched
      on. The point-in-time recovery logs need nothing: they are kept in
      Cloud Storage in the instance's own region.

- [ ] **Delete the EU backups once a London one exists.** After the
      apply, wait for the next automatic backup at 03:00 UTC, or take an
      on-demand one with `gcloud sql backups create`, and confirm with
      `gcloud sql backups list --instance quill-core-app` that it is in
      `europe-west2`. Then delete each backup listed in `eu` with
      `gcloud sql backups delete`. Left alone they would roll off within
      30 days, after go-live, holding the first real users' data
      outside London until then. Decided on 20 October 2026: a London
      backup taken minutes earlier covers the same ground.

## Phase 4: Logs in London

- [ ] **Make a London log bucket and send the logs to it.** A bucket's
      location cannot be changed, so add, in a new `infra/logging.tf`:
      a `google_logging_project_bucket_config` with `bucket_id =
      "quill-logs"`, `location = var.region` and `retention_days = 30`;
      and a `google_logging_project_sink` named `_Default`, brought
      under Terraform by an `import` block for
      `projects/${var.project_id}/sinks/_Default`, with its destination
      changed to the new bucket and its filter kept exactly as Google
      set it (everything except the six admin-activity, system-event
      and access-transparency audit logs). Give the sink
      `prevent_destroy`, since removing it from Terraform would delete
      Google's default route. The `_Required` bucket stays global,
      because Google allows nothing else, and holds only the audit trail
      of changes to the infrastructure. The old entries age out of the
      global `_Default` bucket within 30 days; nothing needs deleting.

- [ ] **Point the `Justfile`'s log reads at the new bucket.** The three
      `gcloud logging read` calls that read an admin job's output (in
      the migration-status recipe and the two that follow an admin
      action) gain `--bucket=quill-logs --location=europe-west2
      --view=_AllLogs`. Naming the bucket is certain where relying on
      the project-wide default is not.

- [ ] **Check the four things that read logs.** After the apply, in App
      production: run one admin job recipe and confirm its output
      prints; post one report to `/api/analytics/client-errors` and
      confirm it appears in Error Reporting, which has read a regional
      bucket fed by a sink in the same project since August 2024;
      repeat the test entry from Phase 2 and confirm the alert still
      fires; and confirm the analytics sink to BigQuery still writes,
      though it is a separate route and should not change. If Error
      Reporting does not see the report, record what it needs here
      before changing anything else.

- [ ] **Tick "Fix what the review found in the system"** in Phase 6 of
      the
      [Terms and privacy policy plan](2026-10-06-terms-and-privacy-policy-plan.md),
      the one step there that points here.

## Decisions

- **The wording changes and the consent code does not.** The
  alternative was to move each person's answer history to the
  newsletter list at closure, alongside the answer. That is a migration
  and a change to `emptying.py` to keep evidence that, once the account
  is emptied, no longer says whose it was.

- **The three legal questions wait for direct customers.** Whether a
  free sign-up or a free webinar supports the soft opt-in, whether the
  Online Safety Act reaches a direct consumer account, and the DMCC
  subscription rules expected from January 2027 all bite only when
  Part C of the terms opens to people with no sponsor, or when payments
  launch. Nobody is in that position, so they are one step in the Terms
  and privacy policy plan, to revisit then, rather than work now.
