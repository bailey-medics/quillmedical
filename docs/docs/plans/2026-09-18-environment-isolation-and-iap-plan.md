# Environment isolation and renaming plan

Teaching is the only environment running, and it has one open back door
that is not visible from the application. `COOKIE_DOMAIN` is set to
`.quill-medical.com`, so a cookie written by any subdomain is sent to
every other one. Only one environment is deployed, so nothing can abuse
that today; it becomes a live problem the moment a second one exists, so
the fix comes before the phases that build one. Separately, every Cloud
Run service defaults to
`INGRESS_TRAFFIC_ALL` with `allUsers` as invoker, so each service is
reachable directly on its own `*.run.app` URL. That URL is published in
Certificate Transparency logs the moment a certificate is issued, and
reaching it skips the load balancer entirely — which means Cloud Armor's
rate limit is bypassable in the live teaching environment today.

Two longer-running needs sit behind that. Clinical features will
eventually need an environment separate from teaching and passport work,
with a different release gate; and the `teaching.` hostname already
misdescribes what it serves, because the clinician passport lives in the
same project. A non-production environment, when there is one again,
will also need an access gate that does not depend on a fixed IP
address.

The clinical production environment was shut down when clinical work
stopped, and staging was shut down because it cost too much to keep idle.
Both may return, so the phases that depend on a second environment are
kept rather than deleted, and marked as waiting for one.

The names are the larger piece. A GCP project ID cannot be changed after
it is created, so renaming the environment `app` means building a new
project and moving into it. That is affordable now and will not be later:
there are no users, the teaching content rebuilds itself from its own
repositories, and the databases hold seed data. The same work after
launch needs a downtime window and a real data migration.

The phases below alternate between work that is code in this repository
and work that happens in the GCP and GitHub consoles. Each is headed
**Claude** or **Mark** accordingly, and ends by saying what the next batch
needs from it. A Claude batch is a run of `/st-follow-the-plan-document`
producing stacked branches; a Mark batch is console and command-line work
against live infrastructure, which Claude cannot do and should not
attempt.

The order matters. Batch 6's code must not merge before Batch 5 has cut
the DNS over, or the deploy smoke test starts hitting a hostname that is
not serving yet and every deploy goes red.

**Merging a Terraform change applies it.**
`.github/workflows/terraform.yml` runs on every push to `main` that
touches `infra/**`, against the live `teaching` workspace, with no human
step in between. So every Terraform change in this plan must plan as a
no-op for `teaching` until the `app` workspace exists and has been
applied. Widen a condition to accept both names, never swap one name for
the other: `var.environment` gates fifteen resources in `infra/main.tf`,
most of them through `count`, and a `count` that falls from one to zero
is a destroy. The old names come out in Batch 8, when the old project is
deliberately retired. Closing the ingress broke the deploy pipeline
because a step was written as though somebody would apply it by hand;
this is the same mistake with the Cloud SQL instance and the video
buckets on the other end of it.

## Batch 1 — Claude: the security fixes

These two phases are live today and depend on none of the naming
decisions. They are the only work here that is worth doing whether or not
the rename ever happens.

### Phase 1: Close the load balancer bypass

**Attempted and reverted on 2026-09-21.** Closing the ingress broke every
deploy, because the deploy checks a new revision at the address the
closed ingress rejects. The bypass is open again and stays open until
Phase D solves that. Do not re-apply the ingress setting before then: it
looks like a one-line change and takes the deploy pipeline down.

- [x] Set `ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"` on the
      backend and frontend Cloud Run services in `infra/main.tf`. The
      module already takes the variable (`infra/modules/cloud-run/variables.tf`),
      defaulting to `INGRESS_TRAFFIC_ALL`.

- [x] Leave `roles/run.invoker` granted to `allUsers` in
      `infra/modules/cloud-run/main.tf`. Once ingress is closed the load
      balancer still calls the service as an anonymous caller, so
      removing it would break the site rather than harden it. This turned
      out not to be what rejected the deploy's health check: the request
      never reached the service at all.

- [x] Confirmed the three Cloud Run *jobs* need no equivalent. Admin,
      transcode and caption use `modules/cloud-run-job`, which creates a
      `google_cloud_run_v2_job`, and a job has no ingress setting because
      it is not reachable over HTTP.

- [x] Reverted both services to the module default of
      `INGRESS_TRAFFIC_ALL`, with a comment in `infra/main.tf` saying why
      and pointing at Phase D.

- [ ] Re-apply the ingress setting, once Phase D has moved the deploy's
      health check onto a route the closed ingress accepts. Everything
      below waits on that.

- [ ] Verify the service's `*.run.app` URL then refuses the request, and
      that the public hostname still serves normally.

- [ ] Verify Cloud Armor then sees the traffic — the throttle rule at
      `infra/modules/load-balancer/main.tf` should be reachable on every
      request rather than skippable.

### Phase D: Let the deploy check a revision it cannot reach directly

Phase 1 cannot be finished until this is. What follows is what was learnt
on 2026-09-21, written down because none of it is visible from the code
and the next person to read Phase 1 will otherwise repeat it.

**What broke.** `.github/scripts/deploy/deploy-tagged.sh` releases each
new revision with `--no-traffic` and a traffic tag, then smoke-tests that
revision at its own tagged `*.run.app` URL, and only promotes it to
serve traffic once it answers 200. Closing the ingress rejects that
request before it reaches the service, so the smoke test got 404 five
times and the deploy stopped with traffic left on the previous revision.
The site stayed up throughout, which is the script working as designed.

**That design is worth keeping.** Checking a revision before it serves
anybody is the whole reason the script exists, and the alternative of
promoting first and checking afterwards means a bad revision reaches
users before anything notices.

**The 404 was the ingress, not permissions.** `roles/run.invoker` is
granted to `allUsers` and `/api/health` is public, so it is worth being
clear that no IAM change would have helped. Cloud Run rejected the
request at the ingress layer before any authorisation ran, which is why
it answered 404 rather than 403.

Two approaches were considered and ruled out. Both look reasonable and
neither works.

- [x] **A Cloud Run job running the smoke test from inside the project.**
      Rejected. The jobs in `infra/modules/cloud-run-job` set
      `egress = "PRIVATE_RANGES_ONLY"`, so traffic to a `*.run.app`
      address leaves over the public internet, as `infra/main.tf` already
      notes at the transcode job. The job would be rejected exactly as a
      GitHub-hosted runner is.

      **The next sentence used to say `egress = "ALL_TRAFFIC"` would not
      rescue it, and that was wrong.** It claimed
      `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` accepts load balancer
      traffic but not VPC traffic. Google's ingress documentation says
      that setting allows everything "Internal" allows, which includes
      same-project VPC networks, plus external load balancer traffic. So
      routing the job's egress through the VPC connector should work,
      and it is worth testing before anything larger is built. The
      correction is written up in the open steps below rather than only
      here, because this paragraph is the one that sent the plan towards
      a wildcard certificate.

- [x] **Smoke-testing the public hostname instead.** Rejected, and worse
      than doing nothing. The new revision carries no traffic at that
      point, so a request to `teaching.quill-medical.com` reaches the
      *old* revision and passes whatever the new one does. It would look
      like a working check while testing nothing.

**The approach that should work** is to route the tagged revision through
the load balancer, so the smoke test reaches it at the public hostname
and the ingress rule is satisfied. Google's serverless NEGs support this:
`--cloud-run-tag` is documented as "the named revision to provide
additional fine-grained traffic routing configuration", and it "may be
provided explicitly or in the URL mask", where a URL mask is "a template
of your URL schema" that parses service and tag from the request URL.
Explicitly is no use here, because the tag is `rev-<sha>` and changes
every deploy, so the URL mask is the part that matters.

- [x] **Researched on 2026-09-22, and the answer is the expensive one.**
      A URL mask can capture a `<service>` from a path: Google's own
      example is `example.com/<service>`. The only documented example
      capturing a **tag** is a subdomain, `<tag>-<service>.preview.<domain>`,
      and no path form for a tag is documented anywhere in the serverless
      NEG guidance.

      So the cheap shape this step hoped for, a `/_rev/rev-abc123/…`
      path rule, is not supported. Routing a tagged revision through the
      load balancer needs a wildcard certificate for
      `*.app.quill-medical.com`, a DNS record to match, and a second NEG
      and backend service, to give the deploy one health check it can
      reach.

- [ ] **Decide whether Phase D is worth building at all**, now its size
      is known. What it buys is closing the `*.run.app` bypass while
      keeping the deploy's check on a revision before that revision
      serves anybody. What it costs is a wildcard certificate, wildcard
      DNS, new Terraform in `infra/modules/load-balancer/main.tf`, and a
      URL map rule in the resource that has already taken the API down
      once.

      Worth weighing against the bypass itself, which has been open for
      months and is a rate-limit bypass rather than an authentication
      one: `*.run.app` reaches the same service with the same auth, it
      just skips Cloud Armor.

- [ ] **Try the Cloud Run job again first. This plan rules it out on a
      claim that is wrong.** The note above says
      `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` accepts traffic from the
      load balancer and not from the VPC. Google's own ingress
      documentation says otherwise: that setting allows everything
      "Internal" allows, which includes same-project VPC networks, plus
      external load balancer traffic. So a caller inside the VPC can
      reach the service.

      What actually defeated the job was its egress, not the ingress
      rule. `infra/modules/cloud-run-job` sets
      `egress = "PRIVATE_RANGES_ONLY"`, so traffic to a `*.run.app`
      address leaves over the public internet and arrives as an external
      request. Setting `egress = "ALL_TRAFFIC"` on a job whose only
      purpose is the smoke test would route it through the VPC connector
      instead, and the ingress rule should then accept it.

      That is a variable on one module against a wildcard certificate,
      wildcard DNS, a second NEG and a URL map rule. Test it before
      building anything larger.

- [x] **(Claude)** Make the egress a per-job variable rather than
      flipping it for everything. `vpc_egress` on
      `infra/modules/cloud-run-job` defaults to `PRIVATE_RANGES_ONLY`, so
      nothing changes for the jobs that need it. The transcode job in
      particular calls back to the app's public domain and its own
      comment says the default is what makes that work, so flipping the
      module wholesale would have broken a callback nobody was thinking
      about.

- [x] **(Claude)** Add a `smoke-test` action to
      `backend/scripts/admin_cli.py`, which checks `SMOKE_URL` returns
      200 with the same retry shape as `smoke-test.sh`. The admin job is
      the right home: it already holds a VPC connector for Cloud SQL, so
      giving it `ALL_TRAFFIC` egress affects nothing public, and
      `run-migrations.sh` already shows how the deploy invokes it and
      reads the result.

- [ ] **Still to do, and this is where it gets real.** Set
      `vpc_egress = "ALL_TRAFFIC"` on the admin job, point
      `deploy-tagged.sh` at the job rather than `curl`, and try the
      ingress setting again. None of that is worth doing until somebody
      has confirmed by hand that a job with `ALL_TRAFFIC` can actually
      reach a revision behind a closed ingress. The documentation says it
      should; this plan has already been wrong once about exactly that.

- [ ] Add a second serverless NEG with the URL mask, and a backend
      service for it, in `infra/modules/load-balancer/main.tf`. Validate
      with a real `terraform plan` before touching the URL map.

- [ ] Add the routing rule to the URL map **last, and carefully**. That
      resource already carries a comment recording that a dynamic block
      mistake once planned `/api/*` to null and took the API down. The
      new rule goes in the same `concat` list as the existing ones, never
      as a static rule beside the dynamic block.

- [ ] Make sure the tagged route cannot be used to reach anything else.
      It exposes a revision by name at the public hostname, so it should
      match the health path only, and a request for any other path
      through that prefix should not reach the service.

- [ ] Point `run_smoke_test` in `deploy-tagged.sh` at the new route
      rather than the tagged `*.run.app` URL. The function is already
      isolated so tests can stub it, so this is a small change once the
      route exists.

- [ ] Only then re-apply Phase 1's ingress setting, and watch the first
      deploy.

### Phase 2: Host-only auth cookies

- [x] Remove `COOKIE_DOMAIN = ".${var.domain}"` from `infra/main.tf`.

- [x] Remove `COOKIE_DOMAIN: ".quill-medical.com"` from
      `compose.prod.cloud-run.yml`.

- [x] Confirm no code change is needed. `backend/app/config.py` already
      declares `COOKIE_DOMAIN: str | None = None`, documented as "None =
      current domain", and `backend/app/main.py` passes it straight
      through to every `set_cookie` and `delete_cookie` call.

- [ ] Announce that the deploy logs everyone out once. The old
      `.quill-medical.com` cookies stop matching the host-only ones, so
      existing sessions end. Ship it at a quiet time.

- [x] Check nothing depends on a session surviving a hop between
      `teaching.` and the apex. The landing page at
      `infra/modules/load-balancer/landing/index.html` is a static file
      with no script and no form, so nothing there reads a cookie.

- [x] Pin the behaviour with tests.
      `backend/tests/test_auth_cookies_are_host_only.py` asserts that no
      `Set-Cookie` header from login or logout carries a `Domain`, and
      that login sets all three cookies, so the first assertion cannot
      pass by setting none.

- [ ] Record the `__Host-` cookie prefix as a later hardening step. It
      requires host-only, `Secure` and `Path=/`, all of which this phase
      establishes, and it makes the browser enforce them.

**Hands over:** two stacked branches to review and merge. The Terraform
changes need `terraform apply` against the teaching project, which is
Batch 2.

## Batch 2 — Mark: apply the security fixes

**Terraform applies itself.** `.github/workflows/terraform.yml` runs on
every push to `main` that touches `infra/**`, so merging a Claude batch
that changes Terraform deploys it with no further step. This batch was
written assuming a manual apply, and that assumption was wrong: both
Batch 1 changes went live on merge. Every later batch touching `infra/`
behaves the same way, so read "hands over" as "merging this applies it".

- [x] The cookie change applied on merge and is live.

- [x] The ingress change applied on merge, broke the deploy, and was
      reverted. See Phase D.

- [ ] Verify the `*.run.app` URL now refuses the request and the public
      hostname still serves.

- [ ] Verify Cloud Armor sees the traffic, using the throttle rule at
      `infra/modules/load-balancer/main.tf`.

**Hands over:** a confirmed-working live environment, and a decision to
proceed with the rename.

## Batch 3 — Claude: the naming decisions and the new environment's code

Phase 3 is decisions only, written down so the code that follows has
something to be consistent with. Phase 4 is every code change the new
project needs, written before the project exists so that it is ready to
apply the moment it does.

### Phase 3: Settle the names

Naming only. The work that applies these names is Batches 3 to 7, which
move the environment into a new GCP project and rename it there — doing
it twice, once on the old project and once on the new, would rebuild the
certificate and move the DNS record for nothing.

- [x] Adopt `app.quill-medical.com` for teaching and passport — the
      product that is actually live — and `ehr.quill-medical.com` for
      clinical when it exists.

- [x] Name the environment `app` too, not just the hostname. The
      Terraform workspace, `var.environment` and the directory
      `infra/environments/teaching/` all carry `teaching` today, and
      `var.environment` is interpolated into around thirty resource names.

- [x] Name environments after their regulatory class and audience, not
      their current feature list. `teaching.` has already outgrown itself
      once by acquiring the clinician passport.

- [x] Leave the teaching feature named `teaching` throughout — the content
      repositories, `teaching-pipeline.yml`, the video pipeline module and
      the three secrets. They are about teaching. Only the environment is
      renamed, and renaming both would leave nothing to distinguish the
      deployment from the feature it serves.

- [x] Note that the subdomain says EHR while the application still says
      EPR — the nav link in
      `frontend/src/components/ribbon/publicNavLinks.ts`, the two landing
      page buttons and the marketing copy. Nothing user-facing depends on
      it, because the clinical product is not live and every one of those
      links is disabled, so the mismatch costs nothing today. Renaming
      them is separate work, out of scope here.

### Phase 4: The new environment's Terraform

- [x] Add `infra/environments/app/terraform.tfvars`, copied from the
      teaching one, with `project_id = "quill-medical-app"` and
      `environment = "app"`. Leave `lb_domains` on a temporary hostname;
      the cutover is Batch 5.

- [x] Widen the fifteen `var.environment == "teaching"` conditions in
      `infra/main.tf` to accept either name, using
      `contains(["teaching", "app"], var.environment)`. They gate the
      teaching video pipeline, the teaching buckets, the sync token
      secret and `CLINICAL_SERVICES_ENABLED`.

- [x] Do not swap `"teaching"` for `"app"` in those conditions. Most are
      `count = ... ? 1 : 0`, so against the live `teaching` workspace the
      swapped condition is false, the count falls to zero, and Terraform
      destroys the resource. That list includes the Cloud SQL instance at
      `infra/main.tf:224` and the video pipeline buckets, some of which
      carry `force_destroy`, so they go even when they hold objects.

- [ ] Confirm the widening is a no-op before merging, by reading the plan
      output on the pull request. `terraform.yml` posts a plan for the
      `teaching` workspace, and it should show no changes at all. A plan
      proposing to destroy anything means a condition was swapped rather
      than widened.

- [x] Add `app` to the validation condition in `infra/variables.tf`, which
      allows only `prod`, `staging` and `teaching` today. Keep `teaching`
      accepted until the old project goes in Batch 8.

- [x] Keep the three secret names as they are —
      `teaching-video-signing-key`, `teaching-sync-token` and
      `teaching-transcode-callback-token`. They are teaching feature
      secrets rather than environment labels, and renaming them means
      touching `infra/main.tf`, the transcode job, the caption job and the
      pipeline workflow for no gain.

- [x] Check the CORS origin on the video buckets follows `var.app_domain`.
      The module takes `app_origin` from it, so it tracks the hostname
      automatically. `app_domain` is `app.quill-medical.com` in the new
      tfvars, so uploads there will be allowed from that origin and no
      other.

- [x] Widened through one `local` rather than fifteen inline `contains`
      calls. `local.is_teaching_product` in `infra/main.tf` names the idea
      once, and Batch 8's narrowing becomes a one-line edit to the list
      above it rather than fifteen edits that have to agree.

- [x] Verified the widening is a no-op for `teaching` by evaluating the
      local directly: `teaching` and `app` are both true, `prod` and
      `staging` both false. The live workspace therefore sees no change.
      The plan posted on this pull request should confirm it.

- [x] Gave the new environment `app.quill-medical.com` and nothing else,
      rather than copying teaching's hostnames. Two projects claiming
      `teaching.quill-medical.com` and the apex would leave the new
      project's Google-managed certificate pending for ever, because
      certificates validate by DNS and the DNS still points at the old
      project. `landing_domain` is null there for the same reason.

**Hands over:** branches that describe the new environment but do not
build it. They apply to the live `teaching` workspace on merge, as every
Terraform change here does, and plan as no-ops there because the
conditions were widened rather than swapped. Nothing new is created until
Batch 4 makes the project and the `app` workspace.

## Batch 4 — Claude and Mark: build the project

Console and command-line work against live infrastructure, with
`gcloud` as `mark@quill-medical.com`. Claude runs the steps marked
**(Claude)** and reports each result; the ones marked **(Mark)** need a
human at the console.

What the existing project looks like, read on 2026-09-21 and recorded
here because the next environment will want the same list:

- **There is a Google Cloud organisation**, `quill-medical.com`, id
  `826360329716`. `quill-medical-teaching` sits directly under it, with
  project number `113172935409`. This also answers the open question in
  Phase B: `google_iap_brand` can create Internal brands, because that
  needs an organisation and there is one.

- **One billing account**, `01E8B4-2EFA4B-61EF08`, open.

- **One organisation policy is set on the project**,
  `constraints/iam.allowedPolicyMemberDomains`, with `allValues: ALLOW`.
  That is domain-restricted sharing turned off, which is what lets
  `allUsers` hold `roles/run.invoker` on the Cloud Run services.

- **Forty APIs are enabled**, though most come on by default with any
  project. The ones this stack genuinely needs are `run`, `sqladmin`,
  `compute`, `vpcaccess`, `secretmanager`, `artifactregistry`,
  `servicenetworking`, `monitoring`, `logging`, `dns`, `storage`,
  `iamcredentials` and `orgpolicy`.

- **The Workload Identity pool is `github-pool`**, with one provider,
  `github-provider`, mapping `google.subject` to `assertion.sub` and
  `attribute.repository` to `assertion.repository`. Its attribute
  condition names four repositories explicitly:
  `bailey-medics/quillmedical`, `bailey-medics/quill-question-bank`,
  `bailey-medics/respiratory-teaching` and
  `bailey-medics/eoeeta-teaching`. The service account it impersonates is
  `github-actions@quill-medical-teaching.iam.gserviceaccount.com`.

### Steps

- [x] **(Claude)** Create `quill-medical-app` under the organisation, with
      a display name a human reads rather than the bare id. Done on
      2026-09-21: display name "Quill App", project number
      `45814277366`, active, parented on the organisation.

- [x] **(Claude)** Link it to billing account `01E8B4-2EFA4B-61EF08`.
      Nothing else works until billing is on: API enablement fails, and
      the failure does not obviously say why. Done, `billingEnabled: true`.

- [x] **(Claude)** Enable the APIs listed above. Do this before the
      Terraform apply rather than discovering them one failure at a time.
      Done: fifteen named explicitly, 38 enabled in total once Google's
      own defaults are counted.

- [x] **(Claude)** Set `constraints/iam.allowedPolicyMemberDomains` to
      `allValues: ALLOW` on the new project, matching teaching. Without
      it the `allUsers` invoker binding is refused and the site returns
      403 from behind the load balancer. Done.

- [x] **(Claude)** Create the Workload Identity pool, provider and CI
      service account in the new project. Done: pool `github-pool` and
      provider `github-provider` under project `45814277366`, with the
      same attribute mapping as teaching and the same issuer.

- [x] **(Claude)** Narrow the attribute condition to
      `assertion.repository == 'bailey-medics/quillmedical'`, rather than
      copying teaching's list of four. The other three are teaching
      content repositories that sync to buckets in the old project, and
      nothing in the new one needs them yet. Adding a repository later is
      one command; noticing an unnecessary one is nobody's job.

- [x] **(Claude)** Bind
      `github-actions@quill-medical-app.iam.gserviceaccount.com` to that
      principal set with `roles/iam.workloadIdentityUser`, so only a
      token from that repository can impersonate it.

- [x] **(Claude)** Grant the new service account the six roles
      `github-actions@quill-medical-teaching` holds: `editor`,
      `iam.serviceAccountAdmin`, `iam.serviceAccountUser`,
      `logging.configWriter`, `run.admin` and `secretmanager.admin`.

- [ ] **(Mark)** Review the roles above, and decide whether `editor`
      should stay. It subsumes `run.admin` and `secretmanager.admin`
      entirely and grants much besides, so the three together say less
      than they appear to. It was copied rather than chosen, because the
      first apply builds around thirty resources and a missing permission
      fails it partway with things half-created. Worth narrowing once a
      successful apply has shown what is genuinely used, on both
      projects.

- [x] **(Claude)** Make CI able to apply the new environment at all.
      `.github/workflows/terraform.yml` selected the `teaching` workspace
      and read teaching's tfvars in both the plan and apply jobs, with
      both hardcoded, so merging Batch 3 changed nothing for the new
      project and nothing ever would have. Both jobs are now a matrix
      over `teaching` and `app`, reading each environment's secrets by
      name. The workspace itself needs no separate step: the jobs already
      run `terraform workspace select -or-create`.

- [x] **(Claude)** Create three GitHub secrets, following the naming the
      repository already uses for `GCP_TEACHING_*`, `GCP_STAGING_*` and
      `GCP_PROD_*`:

      - `GCP_APP_PROJECT_ID` = `quill-medical-app`
      - `GCP_APP_SERVICE_ACCOUNT` =
        `github-actions@quill-medical-app.iam.gserviceaccount.com`
      - `GCP_APP_WIF_PROVIDER` =
        `projects/45814277366/locations/global/workloadIdentityPools/github-pool/providers/github-provider`

- [x] **(Claude)** Set each of those at both repository scope and `app`
      environment scope, because that is what `teaching` does. Its three
      exist in both places, and an environment-scoped secret overrides a
      repository one for jobs running in that environment, so matching
      only one scope would have left the two environments behaving
      differently for no visible reason.

- [x] **(Claude)** Create a GitHub Environment named `app`, with the same
      protection as `teaching`: a custom branch policy allowing
      deployments from `main` only, no required reviewers and no wait
      timer. The apply job declares
      `environment: ${{ matrix.environment }}`, and a job naming an
      environment that does not exist fails before it runs a step.

- [x] **(Claude)** Prepare the things the Terraform expects to find
      already there, before the first apply: grant the new service
      account `roles/storage.objectAdmin` on the state bucket, create the
      `teaching-sync-token` secret and the `quill-admin-app` job for the
      two import blocks, and add versions to `pagerduty-service-key` and
      `alert-sms-number`.

- [ ] **(Mark)** Create a Slack notification channel in the new project
      through the console's OAuth flow, then set
      `slack_channel_display_name` in the app tfvars. Until then the new
      environment has email, SMS and PagerDuty alerting but no Slack.

- [x] **(Claude and Mark)** Apply Batch 3's Terraform to the new
      workspace. Done on 2026-09-21, on the fifth attempt: 16 added, 0
      changed, 1 destroyed, the destroy being a half-built backend
      service replaced after an earlier failed apply. The environment now
      has `quill-backend-app` and `quill-frontend-app`, `quill-core-app`
      on Postgres 18, the admin, caption and transcode jobs, the VPC, the
      buckets and a load balancer on `34.49.99.83`.

- [x] **(Claude)** Put a value in every secret Terraform created. The
      apply creates nine secret containers and no versions, so anything
      reading one fails until a value is added: the backend would not
      start without `resend-api-key` and `teaching-sync-token`, and the
      alerting channels read `pagerduty-service-key` and
      `alert-sms-number`. `teaching-sync-token` was generated fresh for
      this project rather than copied.

- [x] **(Claude)** Create the three secrets in the new project. Done as
      part of the apply above: Terraform creates the containers, and the
      video signing key is generated fresh for this project rather than
      copied, so the old one dies with the old project.

- [ ] **(Mark)** Re-run the teaching pipeline against the new project so
      the content buckets refill from `eoeeta-teaching` and
      `respiratory-teaching`. The content is version-controlled and the
      pipeline syncs it on every push to main, so nothing is copied
      between buckets by hand.

- [ ] **(Mark)** Run the migrations against the new Cloud SQL instance and
      seed it. There are no real users, so this is a schema creation and a
      seed rather than a dump and restore.

- [ ] **(Mark)** Confirm that is still true before relying on it. If
      anyone has registered on the live environment, this becomes a data
      migration and the cutover needs a maintenance window.

- [x] **Leave the clinician passport files behind.** The passport bucket
      is not gated on the environment, so Terraform creates an empty one
      in the new project, and what is in the old one is test data.
      Revisit this if a real passport is uploaded before the move.

### What was learnt building it

Moved to "What was learnt" at the foot of this plan, because the list
outgrew this batch: the certificate, the paths filter and the DNS zone
were all found later, in Batches 5 and 6.

## Batch 5 — Claude and Mark: cut the hostname over

The DNS zone is **`quill-medical-zone` in the `quill-medical-production`
project**, not in teaching. Its nameservers, `ns-cloud-c*`, are what
`quill-medical.com` actually delegates to. There is a second zone named
`quill-medical` in `quill-medical-staging` for the same domain, on
`ns-cloud-b*` nameservers, which nothing delegates to and which serves
nothing: editing that one changes no answers anybody receives.

That the live zone sits in a shut-down project is worth knowing. A
shut-down project is recoverable, but deleting it would take DNS for the
whole domain with it.

- [x] **(Claude)** Release `app.quill-medical.com` from
      `infra/environments/prod/terraform.tfvars`, which claimed it.
      Production is the clinical environment, so it now claims
      `ehr.quill-medical.com`, the name Phase 3 settled for clinical.
      That hostname does not resolve and nothing serves it: the value sits
      in a tfvars file for a project that is shut down, and whoever
      restores it creates the record then.
      Production is shut down so nothing clashed today, but two projects
      naming one hostname would have collided on restore.

- [x] **(Claude)** Set `lb_domains`, `app_domain` and
      `monitored_hostnames` in the new environment's tfvars. Done in
      Batch 3: the canonical host is first in `lb_domains`, because
      `FRONTEND_URL` takes `lb_domains[0]` and feeds password-reset
      emails.

- [x] **(Claude)** Serve one hostname per project rather than putting
      both on one certificate. The plan originally said to serve both
      during the change; that applies to moving a hostname *within* one
      load balancer. Here each project has its own certificate, so
      `teaching.` stays on the old one and `app.` goes on the new one,
      and neither validation can block the other.

- [x] **(Claude)** Create the DNS A record for the new hostname in
      `quill-medical-zone`, pointing `app.quill-medical.com` at
      `34.49.99.83`. The `infra/modules/dns` module is not wired into
      `infra/main.tf`, so DNS is not under Terraform.

- [x] **(Claude)** Wait for `quill-cert-v5-app` to leave `PROVISIONING`.
      It went `ACTIVE` on 2026-09-21, covering `app.quill-medical.com`.
      The note below records why it could not start sooner.
      A Google-managed certificate cannot validate until the DNS record
      exists, so it sat pending from the apply until the record above was
      created, and takes fifteen to sixty minutes from that point. Until
      it is `ACTIVE`, the hostname resolves and the browser shows a
      certificate warning.

- [x] **Decided on 2026-09-22: no redirect.**
      `teaching.quill-medical.com` stops working when the old project is
      shut down in Batch 8, and nothing replaces it.

      The redirect was never one change. It needed
      `teaching.quill-medical.com` added to `lb_domains` on the app
      environment, replacing `quill-cert-v5-app` and waiting on both
      domains to validate; the DNS A record moved from
      `136.110.221.126` to `34.49.99.83`, which has to happen before
      validation can succeed and leaves a certificate error in between;
      and a URL map rule that `infra/modules/load-balancer` does not
      have, since it only redirects HTTP to HTTPS.

      Against that, nothing points at the hostname any more. The public
      pages, the ribbon navigation, the landing page, the ZAP scan and
      the teaching content pipeline have all moved to
      `app.quill-medical.com`, and Quill has no users holding bookmarks.
      A redirect would have been new Terraform, in the file that has
      already taken the API down once, serving nobody.

- [x] **(Claude)** Confirm the new environment serves the real
      application. On 2026-09-21 `app.quill-medical.com` returned
      `<title>Quill Medical</title>`, both services ran images built from
      this repository rather than `gcr.io/cloudrun/hello`, and
      `/api/health` reported `core_db.available: true`. The status is
      `degraded` because FHIR and EHRbase are off by configuration, the
      same as teaching. The deploy that did it touched only workflow
      files and shell scripts, so the paths filter said the frontend had
      not changed; the placeholder check forced it anyway, which is what
      it was written for.

- [ ] **(Mark)** Exercise the new environment yourself before going further: sign in,
      load a question bank, play a video, upload one. There are no users
      whose traffic would prove it works, so the check has to be
      deliberate. Everything up to here is reversible by leaving DNS
      alone; after Batch 8 it is not.

- [x] **(Claude)** Make `deploy.yml` deploy the application to both
      environments. Terraform builds infrastructure and nothing else, so
      a successful apply left both Cloud Run services running
      `gcr.io/cloudrun/hello` and `app.quill-medical.com` serving Google's
      "Congratulations" page over a valid certificate. The deploy
      workflow named `GCP_TEACHING_*` in about a dozen places, exactly as
      `terraform.yml` had.

- [x] **(Claude)** Push every image to both projects' Artifact Registry
      rather than pulling cross-project. `docker/build-push-action` takes
      several tags, so the image is still built once. Each project then
      holds its own copy, and retiring teaching in Batch 8 cannot leave
      the app environment unable to pull what it is running.

**Hands over:** `app.quill-medical.com` serving the real application,
verified by hand. `teaching.quill-medical.com` keeps serving from the old
project until Batch 8 retires it, and is then simply gone. Batch 6 must
not merge before this.

## Batch 6 — Claude: move everything off the old hostname

Retiring `teaching.quill-medical.com` is a list with an end, and this is
it. Nobody is stranded if it breaks, Quill has no users, so this is about
not breaking our own wiring.

**The order below is by what each item depends on**, not by where it sits
in the codebase. Some of it can be done while the new environment is
still being proven, and some of it must not be, because until the app
environment is serving the real application `teaching.` is still the
environment that works.

### Safe before the app environment is proven

Nothing here changes which environment anything tests or deploys to, so
none of it can break a deploy.

- [x] Move the application links: the three public pages
      (`index.tsx`, `pricing.tsx`, `clinical-teaching.tsx`), the ribbon
      navigation in `frontend/src/components/ribbon/publicNavLinks.ts`,
      and the landing page in
      `infra/modules/load-balancer/landing/index.html`. These are links a
      visitor follows, and `app.quill-medical.com` serves today.

- [x] Fix the production smoke test in `deploy.yml`, which checks
      `https://app.quill-medical.com/api/health`. That hostname now
      belongs to the teaching and passport environment, so the
      `promote-to-production` job would report a healthy production
      having tested a different project entirely. Production is
      `ehr.quill-medical.com`, which does not resolve yet. Failing on a
      hostname that does not exist is the safer of the two wrong answers,
      and whoever restores production has to create the record anyway.
      The job is gated behind `ENABLE_PRODUCTION_DEPLOY`, so this is
      latent rather than live, which is exactly why a false pass would
      have survived to bite whoever re-enables it.

- [x] Update the monitoring dashboard prose in
      `infra/modules/monitoring/main.tf` and the domain tables in
      `docs/docs/infrastructure/gcp.md`. The prose now interpolates
      `var.app_domain` rather than naming a hostname, so each environment
      describes itself and this cannot go stale again. The tables were
      wrong beyond the hostname: staging was listed as active, and
      production still claimed `app.`.

- [x] Leave `frontend/src/lib/error-reporting/sanitise.test.ts` alone.
      It uses `teaching.quill-medical.com` as sample data for URL
      redaction, not as a link, so the hostname is arbitrary and changing
      it would say something the test does not mean.

### Only once the app environment serves the real application

Each of these points a check or a deploy at the new environment, so doing
them early aims CI at something that is not ready.

- [x] Move the ZAP scan target in `.github/workflows/zap-scan.yml` to
      `app.quill-medical.com`, now that the app environment serves the
      real application.

- [x] **(Claude)** Point the teaching content pipeline at the new
      environment. Three secrets, not one, and they live in the content
      repositories `eoeeta-teaching` and `respiratory-teaching` rather
      than in `quillmedical`, because `teaching-pipeline.yml` is a
      reusable workflow those repositories call:

      - `BACKEND_SYNC_URL` to `https://app.quill-medical.com`, so the
        sync lands in the new project's database rather than the old
        one's.
      - `GCP_TEACHING_GCS_BUCKET` to `quill-images-app`. The backend
        reads `quill-images-<environment>`, set from
        `module.cloud_storage` in `infra/main.tf`, so leaving this
        pointed at `quill-images-teaching` would upload content the new
        backend never looks at.
      - `BACKEND_SYNC_TOKEN` to the new project's `teaching-sync-token`.
        This one is easy to miss: the token was deliberately generated
        fresh for the new project rather than copied, so changing only
        the URL authenticates against the new backend with the old
        project's token and gets a 401.

- [x] **(Claude)** Confirm all three changed in both repositories rather
      than assuming one call covered it. `gh secret list --repo` shows
      the update timestamps.

- [x] Decided **not** to drop `teaching.quill-medical.com` from
      `lb_domains` and `monitored_hostnames` here. **Moved to Batch 8**,
      because it is not safe
      here: `quill-cert-v5-teaching` covers `teaching.quill-medical.com`,
      `quill-medical.com` and `www.quill-medical.com` on one certificate.
      Changing `lb_domains` replaces that certificate, and a
      Google-managed certificate only goes active once every domain on it
      validates, so removing the teaching hostname would put the public
      marketing site at risk of a TLS failure for up to an hour. It costs
      nothing to leave the hostname served until the project is retired,
      and at that point the certificate goes with it.

### After the old project is retired

- [x] Decided **not** to rename `GCP_TEACHING_PROJECT_ID`,
      `GCP_TEACHING_WIF_PROVIDER` and `GCP_TEACHING_SERVICE_ACCOUNT`
      here.
      The `GCP_APP_*` secrets already exist and are what the app
      environment uses; what is left is deleting the teaching ones once
      nothing reads them, which is Batch 8 rather than here. Doing it
      sooner breaks every workflow at once, because the matrix in
      `deploy.yml` and `terraform.yml` still names `teaching`.

**Hands over:** branches to review and merge. The secret changes are
Mark's, because Claude cannot write repository secrets.

## Batch 7 — the secrets and the old DNS record

Most of this batch was done earlier than planned, because each piece
turned out to block something in Batch 4 or 5 rather than following them.
What is left is the deletions, which genuinely have to wait.

- [x] **(Claude)** Create `GCP_APP_PROJECT_ID`, `GCP_APP_WIF_PROVIDER`
      and `GCP_APP_SERVICE_ACCOUNT`, pointing at the new project. Done in
      Batch 4: `terraform.yml` could not apply the new environment at all
      until they existed, so this came before building the project rather
      than after.

- [x] **(Claude)** Scope them to this repository rather than leaving them
      organisation-visible, as the secrets rule in `CLAUDE.md` requires.
      Set at both repository and `app` environment scope, matching what
      `GCP_TEACHING_*` does.

- [x] **(Claude)** Point the teaching content pipeline at the new
      environment. Done in Batch 6, and it was three secrets rather than
      the one named here; see that batch for which and why.

- [ ] **(Mark)** Delete the `GCP_TEACHING_*` secrets, once nothing reads
      them. Not yet: the matrix in `deploy.yml` and `terraform.yml` still
      names `teaching`, and the build job authenticates as teaching's
      service account to push images to both registries. These go in
      Batch 8 with the environment itself.

- [ ] **(Mark)** Delete the `teaching.quill-medical.com` A record, once
      nothing names it. Also Batch 8: the hostname still serves, and the
      certificate that covers it also covers the apex.

**Hands over:** nothing outstanding that blocks Batch 8.

## Batch 8 — Mark: retire the old project

`teaching.quill-medical.com` is not redirected anywhere, by decision in
Batch 5. When this batch runs the hostname stops resolving and that is
the intended end state, so there is no redirect to keep working and
nothing to check afterwards except that nothing else broke.

The apex is the part to be careful about. `quill-cert-v5-teaching`
carries `quill-medical.com` and `www.quill-medical.com` alongside the
teaching hostname, and the public marketing site is served from this load
balancer. Move the apex before destroying anything, or the site loses TLS
with it.

- [ ] Leave `quill-medical-teaching` running until the new environment has
      been exercised for long enough to trust. It costs money, and that is
      the price of a reversible cutover — though with staging already shut
      down on cost, decide deliberately how long that is worth paying for
      rather than leaving it indefinitely.

- [ ] Move the apex off the teaching load balancer first. Check where
      `quill-medical.com` and `www.quill-medical.com` point before
      destroying anything: `quill-cert-v5-teaching` covers them alongside
      `teaching.quill-medical.com`, so destroying that environment takes
      the public marketing site's TLS with it unless the apex has been
      moved somewhere else. This is why dropping `teaching.` from
      `lb_domains` was left out of Batch 6.

- [ ] Destroy the teaching workspace with Terraform rather than deleting
      the project in the console, so the state is emptied rather than
      orphaned.

- [ ] Delete the workspace afterwards, and remove `teaching` from the
      validation condition in `infra/variables.tf`.

- [ ] Narrow the fifteen widened conditions in `infra/main.tf` back to
      `app` alone. This is the contract half of the expand-contract
      Batch 3 started, and it is safe only now: the `teaching` workspace
      is gone, so there is no live environment for the conditions to turn
      off. Doing it any earlier destroys the resources it names.

- [ ] Remove `infra/environments/teaching/`.

- [ ] Shut the old project down rather than deleting it outright. A
      shut-down project is recoverable for thirty days; a deleted one is
      not, and nothing is gained by being final on the same day.

## Batch 9 — waiting: a second environment

Phases A and B wait on a non-production environment existing, and are kept
rather than deleted because the reasoning was expensive to work out and
costs nothing to store. Phase C no longer waits: the domains were
registered on 2026-09-20.

### Phase A: Take the health path off the gate

Waiting on a non-production environment existing. Nothing here is worth
doing until something needs gating, because the health exemption exists
only to keep probes working through a gate.

- [ ] Set `app_domain` in that environment's tfvars. Staging's was unset,
      so the uptime check probed `/` rather than `/api/health` — and `/`
      cannot be exempted from an access gate without undoing the gate.

- [ ] Route `/api/health` to its own backend service in the URL map,
      pointing at the same serverless NEG but with no IAP. That keeps
      both the deploy smoke test and Cloud Monitoring's probers working
      without either needing a token.

- [ ] Confirm the exemption is genuinely narrow. It must match the health
      path only, not a prefix that would expose the rest of the API.

### Phase B: Identity-Aware Proxy on non-production

Waiting on a non-production environment existing. Staging was shut down
on cost, so there is currently nothing to gate: teaching is the live
product and must stay reachable without a sign-in wall.

- [ ] Find out whether the projects sit inside a Google Cloud
      organisation. This decides the whole shape of the setup:
      `google_iap_brand` can only create Internal brands through the API,
      which needs an organisation. Without one, the OAuth consent screen
      is a one-off manual step in the console.

- [ ] Check what the pinned provider supports. `infra/versions.tf` pins
      `hashicorp/google ~> 5.5`, where the `iap` block on
      `google_compute_backend_service` needs an explicit
      `oauth2_client_id` and `oauth2_client_secret`. The simpler
      Google-managed client form came later, so either create the client
      or bump the provider.

- [ ] Add an `enable_iap` variable to the load-balancer module,
      defaulting to `false`, so only non-production environments turn it
      on.

- [ ] Attach the `iap` block to **both** `google_compute_backend_service.backend`
      and `.frontend`. Gating only one leaves either the API or the
      application open.

- [ ] Grant `roles/iap.httpsResourceAccessor` to a Google Group rather
      than to named people, so access changes are a Workspace edit rather
      than a Terraform apply.

- [ ] Decide what happens to uptime checks for gated environments.
      Cloud Monitoring's probers cannot authenticate to IAP, so without
      Phase A the check sits at nought per cent forever — the same
      permanently-open false incident already documented in
      `infra/modules/monitoring/main.tf`.

- [ ] Document the session-expiry behaviour for whoever uses the gated
      environment.
      When an IAP session lapses mid-visit, an API call receives a
      redirect towards Google sign-in rather than a clean 401, so the
      401-refresh path in `frontend/src/lib/api.ts` never fires and the
      failure looks like a parse error. A reload clears it.

### Phase C: Second registrable domain

Registered on 2026-09-20, ahead of the rest of this batch. Brand
protection does not depend on a second environment existing, and the
lookalike names were cheap enough that waiting saved nothing.

- [x] Register `quill-medical.dev`, for five years. It is the one that
      matters: `.dev` is on the HSTS preload list, so a browser will only
      ever load it over HTTPS and a lookalike sign-in page on it cannot be
      served over plain HTTP. Identity-Aware Proxy does not help here,
      because it gates who reaches our environments and cannot touch a
      domain somebody else owns.

- [x] Register the defensive names alongside it: `quill-medical.net`,
      `.me`, `.xyz`, `.store` and `.online`. These are held to stop
      somebody else using them, not to be served. Around £18 for the first
      year, with `.net` and `.me` the only two worth much at renewal.

- [ ] Forward the five defensive names to `https://quill-medical.com` at
      the registrar, using its own HTTP forwarding rather than DNS records
      of ours. The registrar supplies the certificate, so this costs
      nothing and adds no infrastructure. A typo then lands on the real
      site instead of nowhere.

- [ ] Do not add them to our load balancer's managed certificate. Serving
      the redirect ourselves would mean five more domains on
      `quill-medical.com`'s certificate, and a Google-managed certificate
      only goes active once every domain on it validates, so a name that
      fails to validate would take TLS down for the real site.

- [ ] Do not forward `quill-medical.dev`. It is the one name here that
      may be served for real later, and a redirect would have to be undone
      first.

- [ ] Set auto-renew and registrar lock on all six, with a company card
      and a shared billing address. Domains are lost to lapsed renewals
      far more often than to anyone taking them deliberately. `.dev` is
      paid to 2031, so the first real renewal risk is `.net` and `.me` in
      September 2027.

- [ ] Decide what `quill-medical.dev` is actually for before using it for
      anything. Registering it was brand protection; serving a
      non-production environment from it is a separate decision that
      belongs with Phase B, because the environment has to exist first.

- [ ] Treat the isolation benefit as secondary. Host-only cookies from
      Phase 2 already close the shared-jar problem; what a separate
      registrable domain adds is that `SameSite` treats the environments
      as genuinely cross-site.

## What was learnt

Findings from building this, in the order they were found. Each one cost
time here and is written down so the next environment does not pay for it
again. None of it is visible from the code.

- **The four setup steps took about six minutes**, nearly all of it
  waiting for API enablement. Everything else returned immediately.

- **Enable the APIs in one command, not fifteen.** `gcloud services
  enable` accepts a list and enables them concurrently. It ran well past
  two minutes, so expect to wait rather than assuming it has hung, and
  poll `gcloud services list --enabled` rather than watching the command.

- **A new project starts with about 22 APIs already on.** Google enables
  a default set, which is why the count goes to 38 rather than to
  fifteen. The count alone tells you nothing; compare the list against
  what you asked for.

- **Billing must be linked before enabling anything.** An unlinked
  project refuses API enablement with an error that does not mention
  billing, which is a slow thing to diagnose.

- **`gcloud projects create` takes `--name` for the display name**, and
  it is the only chance to set it conveniently. `--organization` takes
  the numeric id, not the domain.

- **The organisation policy is set per project, not inherited usefully.**
  `constraints/iam.allowedPolicyMemberDomains` had to be set again on the
  new project with `allValues: ALLOW`. Without it, granting
  `roles/run.invoker` to `allUsers` is refused, and the symptom is the
  load balancer getting 403 from a service that looks correctly
  deployed.

- **A new Workload Identity pool is not readable the moment it is
  created.** `create` returned success and the next `describe` answered
  `NOT_FOUND`. It settled within ten seconds. Poll rather than treating
  the first failure as real, and do not create the provider until the
  describe answers, because the provider needs the pool to exist.

- **The pool, the provider and the binding are three separate things**,
  and only the third decides who may act. The provider says which
  repository may present a token; the `roles/iam.workloadIdentityUser`
  binding on the service account says which principal set may impersonate
  it. Creating the first two and forgetting the third produces
  authentication that succeeds and then cannot do anything, which reads
  as a permissions problem rather than a missing binding.

- **The Terraform describes a built environment, not an empty one.** Five
  things in it assume a project somebody has already prepared by hand, and
  copying teaching's tfvars copied those assumptions along with the
  values. The first apply against an empty project fails on them one
  after another:

  - Two `import` blocks, for `teaching-sync-token` and the
    `quill-admin-<env>` Cloud Run job. Both adopted resources that
    predated Terraform in the teaching project, and an import of
    something that does not exist is an error rather than a no-op. Fixed
    by creating both by hand in the new project so the import finds them:
    the secret container with no version, the job on
    `gcr.io/cloudrun/hello:latest`.

  - Two secret *versions* read through
    `google_secret_manager_secret_version`, `pagerduty-service-key` and
    `alert-sms-number`. Terraform creates secret containers but never
    versions, by the convention in `modules/secrets`, so the value has to
    be put there first. Both were copied across from teaching, since it
    is the same PagerDuty service and the same phone number.

  - A Slack notification channel, looked up by display name. This is the
    one that cannot be scripted at all: the channel's `auth_token` comes
    from Slack's OAuth consent screen and only the console flow produces
    it. The new environment starts with
    `slack_channel_display_name = ""`, which switches the data source
    off, and gains Slack alerting when somebody runs that flow.

- **The Terraform state bucket is in its own project**, and access to it
  is granted per service account. `github-actions@quill-medical-teaching`,
  `-staging` and `-production` each hold `roles/storage.objectAdmin` on
  `gs://quill-medical-terraform-state`, granted individually. A new
  environment's service account needs the same binding or `terraform
  init` fails with a 403 on `storage.objects.list`, which reads like a
  missing bucket rather than a missing grant.

- **A workflow change cannot trigger its own workflow here.** Merging the
  matrix change ran nothing, because `terraform.yml` triggers on
  `infra/**` and the change was to the workflow file and the plan. The
  new environment therefore stayed empty, and the only signal was the
  absence of a run, which is easy to read as "it is still starting". The
  workflow now also takes `workflow_dispatch`, so it can be started by
  hand from the Actions tab, choosing `all`, `teaching` or `app`.

- **`actionlint` is installed locally and worth running before pushing a
  workflow change.** The first attempt at the dispatch input used an
  empty string as a choice option, meaning "every environment", and
  `actionlint` rejects that: "string should not be empty". CI caught it,
  but `actionlint .github/workflows/terraform.yml` would have caught it
  in a second. A named `all` option is clearer than a blank one anyway.

- **CI decides which environments exist, not the tfvars.** Adding
  `infra/environments/app/terraform.tfvars` and merging it did nothing:
  `terraform.yml` named the `teaching` workspace and teaching's tfvars in
  four places, all hardcoded. A new environment is not real until the
  workflow knows about it, and the failure mode is silence rather than an
  error, because the workflow keeps succeeding against the old
  environment.

- **A matrix beats a second job.** The plan and apply jobs now loop over
  the environment list, so retiring `teaching` in Batch 8 is one edit
  rather than deleting a duplicated pair of jobs and hoping nothing else
  referenced them. The applies run with `max-parallel: 1`, because both
  environments share one state bucket.

- **A GitHub Environment is a separate thing from a GitHub secret**, and
  both are needed. The apply job names an environment, and a job naming
  one that does not exist fails before its first step, which reads as a
  workflow syntax problem rather than missing configuration.

- **Read the environment you are copying before creating its twin.**
  `teaching` restricts deployments to `main` through a custom branch
  policy. Creating `app` with the defaults would have produced an
  environment that looks equivalent in the workflow and accepts a deploy
  from any branch.

- **The same secret can exist at two scopes, and teaching uses both.**
  `GCP_TEACHING_*` are set at repository level and again on the
  `teaching` environment, where the environment copy wins for jobs
  running there. Setting only the repository copy for `app` would work
  until somebody added an environment-scoped override to one environment
  and not the other.

- **`gh api` needs `--input -` for boolean fields.** `-f` sends every
  value as a string, and the environments endpoint rejects `"false"`
  where it wants `false`, with a message that names the type rather than
  the cause.

- **The teaching certificate is not only teaching's.**
  `quill-cert-v5-teaching` carries `teaching.quill-medical.com`,
  `quill-medical.com` and `www.quill-medical.com`, because the apex
  marketing site is served from the same load balancer. Anything that
  edits `lb_domains` on that environment therefore risks the public site,
  not just the hostname being retired. Read a certificate's domain list
  before changing the variable that builds it.

- **The paths filter answers a repository question, not an environment
  one.** `dorny/paths-filter` in the prepare job decides whether the
  frontend changed *in this commit*, which is the right question for an
  environment that is already current and the wrong one for an
  environment that has never had a frontend at all. The first deploy to
  the app project touched only workflow files, so it deployed the backend,
  skipped the frontend, and reported success while the hostname served
  Google's placeholder over a valid certificate. The deploy job now asks
  each service what image it is running and forces a deploy for anything
  still on `gcr.io/cloudrun/hello`, which is self-healing rather than
  special-cased to one environment. The logic lives in
  `.github/scripts/deploy/find-placeholder-services.sh` with its own
  `.bats` tests, following the convention the other deploy scripts set:
  a `run:` block of any size is checked by neither shellcheck nor a
  test, and this one decides whether a deploy happens.

- **A successful `terraform apply` is not a working environment.**
  Terraform builds infrastructure; `deploy.yml` builds and ships the
  application. Every image variable starts as `gcr.io/cloudrun/hello`
  because a Cloud Run service cannot be created without naming an image,
  and CI replaces it on the first deploy. So the new environment answered
  on its hostname, with a valid certificate, serving Google's placeholder
  page, and everything looked healthy in the console.

- **The build job authenticates as one project and pushes to both.**
  Teaching's CI service account was granted
  `roles/artifactregistry.writer` on the app project's repository, which
  is simpler than authenticating twice in one job. That grant is
  teaching's to lose in Batch 8, so the images must already be in the app
  project by then, which is why both are pushed rather than one pulled.

- **The DNS zone is in the production project, which is shut down.** Two
  managed zones exist for `quill-medical.com`, one in
  `quill-medical-production` and one in `quill-medical-staging`, and only
  the production one is delegated to. Check the nameservers against `dig
  +short NS quill-medical.com` before editing a zone, because writing to
  the wrong one succeeds and changes nothing.

- **A managed certificate cannot validate before its DNS record exists.**
  `quill-cert-v5-app` was created by the apply and sat in `PROVISIONING`
  with nothing wrong, because validation resolves the domain and the
  record was not written until later. Creating the record starts the
  clock rather than the apply doing so.

- **Terraform creates secret containers and never versions**, by the
  convention in `modules/secrets`, so a fresh environment has nine empty
  secrets and several resources that cannot start without them. The
  backend service fails to create at all while `resend-api-key` or
  `teaching-sync-token` is empty, and the message names the secret path
  rather than saying the value is missing. Fill every secret before the
  apply rather than discovering them one failed apply at a time.

- **`roles/editor` does not include changing a project's IAM policy.**
  The apply failed on "Policy update access denied" creating the Cloud
  Run secret-accessor binding, despite the service account holding
  editor. It needed `roles/resourcemanager.projectIamAdmin`, plus
  `roles/servicenetworking.networksAdmin` and
  `roles/compute.networkAdmin` for the VPC peering that private Cloud SQL
  requires. The teaching service account never needed these because that
  project was built before Terraform managed it.

- **Cloud SQL with private networking takes ten to fifteen minutes** on a
  first create, because the VPC peering has to be established before
  provisioning starts. Everything downstream waits on it, so an apply
  that looks stuck at twelve minutes is usually working.

- **A secret version added while an apply is running is a race.** Cloud
  Run resolves `versions/latest` when a container starts, not when
  Terraform runs, so a service created sixteen seconds before a new
  version was added kept the old one. Forcing a new revision picks it up;
  the label used to force it has to be removed afterwards, because
  `modules/cloud-run` only ignores image drift and would otherwise plan
  the label away.

- **`roles/editor` on the CI service account is worth questioning.** It
  was copied from teaching, where it sits beside `run.admin` and
  `secretmanager.admin` and makes both redundant. Nothing here needed it
  to be that broad; it was kept only so the first apply would not fail
  partway on a missing permission.

**Hands over:** a working environment on a temporary hostname, ready for
the DNS cutover.

## Decisions

- **Ingress and cookies come before naming and IAP** — the bypass is live
  on the only deployed environment, and the bypass in particular makes
  every other access control conditional, so it is not worth building a
  gate above it. The cookie fix was as small as expected. The ingress one
  was not: it took the deploy pipeline down and is now blocked behind
  Phase D.

- **Terraform changes expand before they contract** — every condition that
  names an environment accepts both `teaching` and `app` from Batch 3
  until Batch 8, rather than being swapped from one to the other. The
  reason is that merging applies, so a swapped condition is evaluated
  against the live workspace, where it reads as an instruction to destroy
  whatever it gated. This is the pattern `.claude/rules/backend.md`
  already requires for breaking API changes, applied to infrastructure for
  the same reason: the old and the new have to be true at once while
  something is still using the old.

- **The deploy keeps checking a revision before it serves traffic** — the
  cheapest way to close the ingress would be to drop that check, promote
  each revision straight to traffic and test the public hostname
  afterwards. That trades a real safety property for a configuration
  convenience: a bad revision would reach users before anything noticed.
  Phase D moves the check instead of removing it.

- **A new project rather than a rename** — a GCP project ID is immutable
  after creation, so there is no rename to do. The choice is between a new
  project and living with the old name.

- **Now rather than later** — the cost of the move is almost entirely in
  data, and there is none worth moving. After launch the same work needs a
  downtime window and a real migration.

- **The environment is renamed as well as the project** — a new project
  with `environment = "teaching"` inside it would fix the name a developer
  sees in the console and keep the one they see in the code. The
  environment name is the more confusing of the two, because it is
  interpolated into resource names and gates clinical services.

- **The teaching feature keeps its own name** — the content repositories,
  the pipeline workflow, the video pipeline module and the three secrets
  stay `teaching`, because they are about teaching. Renaming both the
  environment and the feature would leave nothing to distinguish the
  deployment from what it happens to serve.

- **A fresh video signing key rather than a copy** — nothing has been
  signed against the new project, so there is no continuity to preserve,
  and a key that never leaves its own project is one fewer secret in two
  places.

- **The old project is shut down, not deleted** — shutting down is
  recoverable for thirty days and costs nothing once the resources are
  destroyed. Deleting on the same day buys nothing and forecloses the one
  cheap recovery route.

- **The phases needing a second environment are kept, not deleted** —
  staging was shut down on cost and may come back, and production was shut
  down when clinical work stopped. The reasoning in Phases A and B was
  expensive to work out and cheap to store, so it is marked as waiting
  rather than thrown away and rediscovered later.

- **`app.` goes to the non-clinical product, not to clinical** — the
  documentation currently reserves it for the clinical application, but
  that application is hibernated and may be years away, while teaching
  and passport are live. Naming the live product `app.` avoids renaming
  it twice. The cost is that `app.` reads as generic if clinical later
  becomes the flagship.

- **Both hostnames are served rather than cut over** — a single-domain
  swap rebuilds the managed certificate and can break TLS on the existing
  hostname while the new one validates. Serving both removes the
  window entirely and keeps old links working.

- **IAP rather than an IP allowlist** — an allowlist assumes a stable
  source address, which residential broadband does not give, and it locks
  you out from anywhere else. IAP gates on identity instead, needs no
  CIDR upkeep, and produces an access log that is a better artefact for a
  clinical safety assessment than a firewall rule.

- **A health path exempted from IAP, rather than tokens in CI** — minting
  an OIDC token for the smoke test would work, but Cloud Monitoring's
  uptime checks cannot authenticate at all. One ungated health route
  solves both, and a route that returns only liveness is not worth
  protecting.

- **The `.dev` domain is brand protection, not isolation** — the isolation
  argument did not justify it once host-only cookies were on the table, and
  Identity-Aware Proxy covers the access side. What was left is the risk of
  somebody else holding a name that looks like ours, and that was settled
  by registering it on 2026-09-20 rather than waiting for launch.

- **The defensive names forward at the registrar, not through our load
  balancer** — `quill-medical.net`, `.me`, `.xyz`, `.store` and `.online`
  are held so that nobody else holds them, and forwarding them to the real
  site means a typo lands somewhere correct. Doing it at the registrar
  keeps them off our managed certificate: that certificate only goes active
  once every domain on it validates, so a defensive name that failed to
  validate would take TLS down for `quill-medical.com` itself.

- **`quill-medical.dev` is not forwarded** — it is the one name that may be
  served for real later, most likely a non-production environment under
  Phase B, and a redirect set up now would only have to be undone.
