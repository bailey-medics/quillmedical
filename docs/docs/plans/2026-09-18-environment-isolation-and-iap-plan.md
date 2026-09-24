<!-- cspell:words cloudaudit Factivity -->
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
      below waits on that. Still open on 2026-09-23: both
      `quill-backend-app` and `quill-frontend-app` have ingress `all`, and
      the backend's `*.run.app` URL answers `/api/health` with `200`.

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

- [x] **Decide whether Phase D is worth building at all**, now its size
      is known. What it buys is closing the `*.run.app` bypass while
      keeping the deploy's check on a revision before that revision
      serves anybody. What it costs is a wildcard certificate, wildcard
      DNS, new Terraform in `infra/modules/load-balancer/main.tf`, and a
      URL map rule in the resource that has already taken the API down
      once. **Settled on 2026-09-22: not built.** The experiment below
      showed a Cloud Run job with `ALL_TRAFFIC` egress reaches a
      closed-ingress service, so the smoke test moves inside the VPC and
      no wildcard certificate is needed. This box was left unticked when
      that was recorded, and read on 2026-09-23 as a decision still
      owed.

      Worth weighing against the bypass itself, which has been open for
      months and is a rate-limit bypass rather than an authentication
      one: `*.run.app` reaches the same service with the same auth, it
      just skips Cloud Armor.

- [x] **Tested on 2026-09-22, and it works.** A Cloud Run job with
      `ALL_TRAFFIC` egress reaches a service whose ingress is closed.

      The experiment, on the live app environment and reversed within
      minutes: set `vpc-egress=all-traffic` on `quill-admin-app`, run the
      `smoke-test` action against the backend's own `*.run.app` URL, and
      confirm it passes. Then set the backend to
      `internal-and-cloud-load-balancing`, check the same URL returns 404
      from the internet while `app.quill-medical.com` still returns 200,
      and run the job again. It passed both times.

      So the smoke test can move inside the VPC, the ingress can close,
      and none of the wildcard certificate work below is needed. Both
      settings were restored: the backend is back to `ingress=all` and
      the job to `private-ranges-only`, verified by reading them back.

- [x] **The claim this plan was built on was wrong, and is now
      disproved by experiment rather than by documentation.** The note above says
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

- [x] **Still to do, and this is where it gets real.** Set
      `vpc_egress = "ALL_TRAFFIC"` on the admin job, point
      `deploy-tagged.sh` at the job rather than `curl`, and try the
      ingress setting again. None of that is worth doing until somebody
      has confirmed by hand that a job with `ALL_TRAFFIC` can actually
      reach a revision behind a closed ingress. The documentation says it
      should; this plan has already been wrong once about exactly that.

      The first two done on 2026-09-23: `infra/main.tf` sets the admin
      job's egress, and `deploy.yml` passes `SMOKE_TEST_JOB`,
      `SMOKE_TEST_PROJECT` and `SMOKE_TEST_REGION` to the backend deploy.
      `terraform plan` showed that one change and nothing else. The
      ingress is the step below, deliberately a separate pull request:
      it must merge only after one backend deploy has passed through the
      job, or a failure there is the #880 breakage again.

      **Safe to merge in either order against the ingress as it is.**
      `terraform.yml` and `deploy.yml` both run on the same push to
      `main`, so the deploy can reach the job before the apply has
      changed its egress. With ingress still `all` the job reaches the
      revision over the public internet regardless, so the smoke test
      passes either way.

- [x] **Not needed.** Adding a second serverless NEG with a URL mask,
      and the wildcard certificate it would require, is superseded by the
      VPC test above. Kept as a record of what the expensive path would
      have been.

- [x] **Not needed**, for the same reason. The note below stands as a
      warning for anyone who does touch the URL map: that
      resource already carries a comment recording that a dynamic block
      mistake once planned `/api/*` to null and took the API down. The
      new rule goes in the same `concat` list as the existing ones, never
      as a static rule beside the dynamic block.

- [x] **Not needed.** There is no tagged route.
      It exposes a revision by name at the public hostname, so it should
      match the health path only, and a request for any other path
      through that prefix should not reach the service.

- [x] **(Claude)** Point `run_smoke_test` in `deploy-tagged.sh` at the
      admin job rather than `curl`. Not at a load balancer route: the
      VPC test on 2026-09-22 showed a job reaches a closed-ingress
      service directly, so the route this step first imagined is not
      needed.

      Behind `SMOKE_TEST_JOB`, which nothing sets yet. Unset, the
      function curls exactly as before, so every environment keeps its
      current behaviour and merging this changes no deploy. Set, it
      executes the job with `--wait` and the job's exit code is the
      result, the same shape `run-migrations.sh` already uses.

      Two things still have to be true before the ingress can close, and
      neither is done here: the admin job needs
      `vpc_egress = "ALL_TRAFFIC"`, and the workflow has to pass
      `SMOKE_TEST_JOB`, `SMOKE_TEST_PROJECT` and `SMOKE_TEST_REGION` for
      the environment being closed. Both are deliberate: turning this on
      changes the step that stops a bad revision reaching anybody, and it
      should be one watched deploy rather than a side effect of this
      merge.

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

- [x] Announce that the deploy logs everyone out once. The old
      `.quill-medical.com` cookies stop matching the host-only ones, so
      existing sessions end. Ship it at a quiet time. Moot: host-only
      cookies are live (`COOKIE_DOMAIN` is unset on `quill-backend-app`,
      checked 2026-09-23) and there were no real users to log out.

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

- [x] Confirm the widening is a no-op before merging, by reading the plan
      output on the pull request. Overtaken: the widening merged, the
      `teaching` workspace applied cleanly for days afterwards, and the
      workspace was destroyed on 2026-09-23 with the conditions narrowed
      back to `app` in #992. `terraform.yml` posts a plan for the
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

- [x] **(Mark)** Review the roles above, and decide whether `editor`
      should stay. Decided on 2026-09-23: it goes, as the last step of
      Batch 9's least-privilege work, which carries the detail. It subsumes `run.admin` and `secretmanager.admin`
      entirely and grants much besides, so the three together say less
      than they appear to. It was copied rather than chosen, because the
      first apply builds around thirty resources and a missing permission
      fails it partway with things half-created. Worth narrowing once a
      successful apply has shown what is genuinely used. Only the app
      project is left to narrow, since teaching was destroyed on
      2026-09-23.

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

- [x] **(Mark)** Create a Slack notification channel in the new project
      through the console's OAuth flow, then set
      `slack_channel_display_name` in the app tfvars. Until then the new
      environment has email, SMS and PagerDuty alerting but no Slack.
      Done on 2026-09-23 as `quill-medical-cicd`, applied in #1000 and
      proven by a test alert that reached the channel.

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

- [x] **(Mark)** Re-run the teaching pipeline against the new project so
      the content buckets refill from `eoeeta-teaching` and
      `respiratory-teaching`. Done on 2026-09-22.
      `quill-images-app/modules/` holds both banks and
      `quill-teaching-videos-processed-app` holds the transcoded video. The content is version-controlled and the
      pipeline syncs it on every push to main, so nothing is copied
      between buckets by hand.

- [x] **(Mark)** Run the migrations against the new Cloud SQL instance and
      seed it. There are no real users, so this is a schema creation and a
      seed rather than a dump and restore. Done on 2026-09-22: the app
      backend answers `/api/health`, two organisations exist, and a
      module was uploaded, transcoded and played back.

- [x] **(Mark)** Confirm that is still true before relying on it. If
      anyone has registered on the live environment, this becomes a data
      migration and the cutover needs a maintenance window. Confirmed:
      teaching's database was destroyed on 2026-09-23 with its backups,
      on the explicit instruction that nothing in it was wanted.

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

- [x] **(Mark)** Exercised the new environment by hand on 2026-09-22 and
      it works: signed in, both question banks visible, a video uploaded,
      transcoded and played back. That is the whole product path through
      a project that was empty the day before.

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

- [x] **(Mark)** Delete the `GCP_TEACHING_*` secrets, once nothing reads
      them. Done on 2026-09-23, after #992 removed the last reference.

      **They existed twice over.** Three at repository level, and three
      more inside a GitHub environment also called `teaching`, which
      `deploy.yml` named through `environment: ${{ matrix.environment
      }}`. Deleting the repository secrets leaves the environment ones
      in place and invisible to `gh secret list` without `--env`, so the
      environment was deleted as well and took its copies with it.

      `GCP_TEACHING_GCS_BUCKET` looks like a fourth and is not: it is
      read by `teaching-pipeline.yml`, which runs as a `workflow_call`
      from the content repositories and inherits their secrets, not this
      repository's.

      One reference survived #992: the `workflow_dispatch` choice list in
      `terraform.yml` still offered `teaching` as an environment to
      apply. A matrix leg and a dispatch option are separate lists in the
      same file, and grepping for the matrix pattern does not find the
      other.

- [x] **(Mark)** Delete the `teaching.quill-medical.com` A record, once
      nothing names it. Done on 2026-09-23. It had pointed at
      `136.110.221.126`, the load balancer destroyed earlier that day.
      The apex, `app` and `www` all still resolve to `34.49.99.83`.

      **The zone is not in the project you would expect.**
      `quill-medical-zone` lives in `quill-medical-production`, not in
      `quill-medical-app` or `quill-medical-teaching`, and no Terraform
      manages it: `infra/modules/dns` exists but `infra/main.tf` never
      instantiates it. Removing the record is a `gcloud dns
      record-sets` call against that third project, naming the zone and
      the `A` type.

      Nothing else in the zone is affected. The apex and
      `app.quill-medical.com` both point at `34.49.99.83`, and the
      Proton mail, DKIM, DMARC and Resend entries are unrelated to this
      migration.

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

### Moving the public marketing site

The app environment could not take the apex until now, because
`landing_domain` was deliberately null there: two certificates competing
for the same name would leave both pending.

- [x] **(Claude)** Set `landing_domain = "quill-medical.com"` in the app
      tfvars, and add the apex to `monitored_hostnames`. Applying this
      creates `quill-medical-app-landing` and puts the apex and `www` on
      `quill-cert-v5-app` alongside `app.quill-medical.com`.

- [x] **(Claude)** Point `.github/workflows/public-site.yml` at the app
      project. It named `GCP_TEACHING_*` in three places, and
      `deploy-to-gcs.sh` derives the bucket as `<project>-landing`, so
      the secret is what chooses the target.

- [x] **(Claude)** Fix the certificate so it can be replaced at all. The
      apply that added `quill-medical.com` to the app environment failed
      on 2026-09-22 with `Error 409: The resource
      'quill-cert-v5-app' already exists`. A managed certificate's domain
      list cannot be edited, so Terraform replaces the resource, and
      `create_before_destroy` builds the new one while the old is still
      there. With a fixed name that collides every time. An earlier
      hotfix bumped `v4` to `v5` by hand for the same reason.

      The name now carries an eight-character hash of the domain list, so
      a domain change produces a new name and the two can exist side by
      side for the minutes it takes to validate. Both environments' names
      change, so both certificates are replaced: teaching's serves the
      live marketing site, and that is safe because the HTTPS proxy keeps
      serving the old certificate until the new one is attached.

- [x] **Reverted on 2026-09-22.** `landing_domain` is null again on the
      app environment, and the apex is out of `monitored_hostnames`. The
      steps below are reordered accordingly: the DNS moves before the
      domain joins the certificate, not after.

- [x] **(Claude)** Run the public site workflow, so
      `gs://quill-medical-app-landing` holds the site. Done on
      2026-09-22: 81 objects.

- [x] **(Claude)** Restore `landing_domain` and the apex in
      `monitored_hostnames`, so the certificate requests all three
      domains.

- [x] **(Claude)** Move the DNS for `quill-medical.com` to
      `34.49.99.83`. Done at 20:00 UTC on 2026-09-22. One record, not
      two: `www.quill-medical.com` is a CNAME to the apex and follows it.

- [x] **(Claude)** Replace the poisoned certificates by hand.
      `quill-cert-app-6bc99c16` and `quill-cert-app-ad3cda62` both held
      `FAILED_NOT_VISIBLE`, which never retries, so neither could
      validate however correct the DNS became.
      `quill-cert-app-retry1` was created with the same three domains and
      attached to `quill-https-proxy-app`.

- [x] **(Claude)** Watch `quill-cert-app-retry1` reach `ACTIVE`, then
      check the apex, `www` and `app.quill-medical.com` all serve.
      `ACTIVE` on all three domains about 14 minutes after creation, and
      all three served `200` shortly after. The served certificate lists
      all three names and expires 21 December 2026.

      It served about a minute after going `ACTIVE`, not instantly;
      see the learning on that below.

- [x] **(Claude)** Re-check the failed deploy for commit `3f2f9998`.
      The deploy itself was fine — build passed, teaching deployed, and
      the app backend reached revision `quill-backend-app-00039-wuj`,
      which answered `200` directly on its `run.app` URL. Only the final
      smoke test failed, curling `https://app.quill-medical.com/api/health`
      and getting `000` five times, because no certificate was serving
      yet. Re-run the deploy now that the hostname resolves and serves.

      **`000` from the smoke test is not a deploy failure.** It is curl
      failing to establish TLS at all, so it says nothing about whether
      the revision is healthy. Check the service directly on its
      `run.app` URL before treating a red deploy as a broken build.

- [x] **(Claude)** Reconcile Terraform with the app certificate.
      `quill-cert-app-6bc99c16` exists and is `ACTIVE` on all three
      domains, but it is not in Terraform's state, so the apply on
      2026-09-22 failed with `Error 409: The resource
      'quill-cert-app-6bc99c16' already exists`. An `import` block at the
      foot of `infra/main.tf` adopts it.

      **Importing rather than recreating is the point.** The certificate
      is already validated and serving; recreating it would mean another
      fifteen to sixty minutes of downtime on a site that is currently
      up. The block is guarded with `for_each` on
      `var.environment == "app"` because the `load_balancer` module is
      shared — teaching's certificate is already in state, and an
      unguarded block would try to import the app id over the top of it.

      Validated with `terraform validate` under 1.15.8 in Docker, the
      version CI uses. The local binary is 1.15.0 and `versions.tf`
      requires `>= 1.15.2`, so it cannot plan this config at all.

- [x] **(Mark)** Remove the apex from teaching's `lb_domains` once the
      app certificate is active, so the old project stops claiming a
      hostname it no longer serves. Overtaken by the teardown on
      2026-09-23: the load balancer, its certificate and the tfvars file
      naming the apex are all gone, so there is nothing left to claim it.

### Retiring the project

- [x] **(Claude)** Put the images bucket's IAM into Terraform, so the two
      grants made by hand on 2026-09-22 survive a rebuild.
      `infra/modules/cloud-storage` now grants the backend
      `objectViewer` and the content pipeline `objectAdmin`, following
      the pattern `modules/teaching-video-pipeline` already used.

      **Expect four additions in the plan, and no changes.** All four
      bindings already exist in both projects, verified with
      `get-iam-policy`, but `google_storage_bucket_iam_member` is not in
      state, so Terraform proposes creating them. That is adoption
      rather than drift: the resource is additive and creating a binding
      that exists is idempotent. Anything proposing a *deletion* means a
      member was spelled wrong and should not be applied.

      The writer is named per environment rather than derived, because
      the content pipeline still authenticates as the teaching project's
      account while writing to the app project's bucket. Both tfvars name
      `github-actions@quill-medical-teaching` today; the app one changes
      when those secrets move.

- [x] Decide how long to keep `quill-medical-teaching` as a rollback.
      Settled on 2026-09-22: no rollback value, so there is no waiting
      period. It stays running only until nothing authenticates against
      it, which the steps below arrange, and is then shut down.

      This does not make the order below optional. The reason to keep it
      alive is no longer rollback, it is that five workflows still
      authenticate as its service account, and one of them builds every
      image this repository deploys.

- [x] Move the apex off the teaching load balancer first. Done on
      2026-09-22: `quill-medical.com` and `www.quill-medical.com` resolve
      to `34.49.99.83`, the app load balancer, not teaching's
      `136.110.221.126`. Destroying teaching no longer takes the
      marketing site's TLS with it.

      Teaching's tfvars still carries `landing_domain =
      "quill-medical.com"` and `quill-cert-teaching-852eaebb` still lists
      the apex and `www` beside `teaching.quill-medical.com`. Harmless
      while DNS points elsewhere, but drop `landing_domain` from
      `infra/environments/teaching/terraform.tfvars` before the destroy
      so Terraform is not holding a claim on a hostname it does not
      serve.

      Why this came first: teaching's certificate covers the apex and
      `www` alongside `teaching.quill-medical.com`, so destroying that
      environment would have taken the public marketing site's TLS with
      it had the apex not moved. This is also why dropping `teaching.`
      from `lb_domains` was left out of Batch 6.

- [x] Move image build and push off `quill-medical-teaching`. Done in
      #974. The build job and the production promotion job now
      authenticate as the app project. The push tags to teaching's
      registry stay, because each environment's deploy pulls from its own
      registry and teaching is still deploying.

      **This needed an IAM grant that no Terraform manages.**
      `github-actions@quill-medical-app` held only
      `roles/artifactregistry.reader` on teaching's `quill` repository,
      so authenticating as app and pushing teaching's tags would have
      failed. `roles/artifactregistry.writer` was granted by hand on
      2026-09-23 and goes when the project does.

      **The deploy that merged this proved nothing.** #974 changed only a
      workflow and a plan document, so `dorny/paths-filter` set
      `services` to empty and the build job was skipped. The run went
      green without ever exercising the change. The first real test is
      the next pull request that touches `backend/` or `frontend/`.

- [x] Repoint the two workflows that can be repointed from this
      repository. Done in #980. `stale-incidents.yml` authenticates as
      the app project and reads `GCP_APP_PROJECT_ID`, so the stale
      incident warning watches the project that is live.
      `ci.yml`'s published bank sweep reads `quill-images-app`, and its
      environment variable was renamed from `TEACHING_BUCKET` to
      `IMAGES_BUCKET` to match.

- [x] Move the content pipeline's secrets, in the content repositories.
      Done on 2026-09-23, and `content_ci_service_account` followed in
      #984. Still unproven by a real publish: neither content repository
      has a `workflow_dispatch`, so the first content change pushed to
      either is the test. `teaching-pipeline.yml` cannot be fixed
      from this repository: it is a `workflow_call` with
      `secrets: inherit`, so `GCP_SERVICE_ACCOUNT`,
      `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_TEACHING_GCS_BUCKET` come
      from `eoeeta-teaching` and `respiratory-teaching`.

      **The blocker was workload identity, not the secrets.** Teaching's
      provider accepts four repositories; the app project's accepted only
      `bailey-medics/quillmedical`, so pointing the content repositories
      at the app project would have been refused at authentication,
      before any bucket was touched. Neither project's workload identity
      is in Terraform, so all of this is `gcloud` work:

      ```bash
      gcloud iam workload-identity-pools providers describe github-provider \
        --workload-identity-pool=github-pool --location=global \
        --project=quill-medical-teaching --format="value(attributeCondition)"
      ```

      **A new account rather than a copy of teaching's.** The content
      pipeline authenticates as `github-actions@quill-medical-teaching`,
      which holds `roles/editor` on the whole project. The sync script
      does one thing, `rsync --delete` of `question_bank_content/modules`
      into a single bucket, so it was given its own account scoped to
      that bucket. Retiring teaching is the moment to drop a permission
      that was always wider than the job, rather than carry it across.

      Done so far:

      ```bash
      gcloud iam service-accounts create content-sync \
        --project=quill-medical-app --display-name="Content sync" \
        --description="Publishes teaching question banks to quill-images-app from the content repositories. Scoped to that bucket only."

      gcloud iam workload-identity-pools providers update-oidc github-provider \
        --workload-identity-pool=github-pool --location=global \
        --project=quill-medical-app \
        --attribute-condition="assertion.repository == 'bailey-medics/quillmedical' || assertion.repository == 'bailey-medics/eoeeta-teaching' || assertion.repository == 'bailey-medics/respiratory-teaching'"

      gcloud storage buckets add-iam-policy-binding gs://quill-images-app \
        --member="serviceAccount:content-sync@quill-medical-app.iam.gserviceaccount.com" \
        --role="roles/storage.objectAdmin" --project=quill-medical-app
      ```

      The impersonation bindings, run by Mark on 2026-09-23 because the
      harness refuses IAM grants:

      ```bash
      for R in eoeeta-teaching respiratory-teaching; do
        gcloud iam service-accounts add-iam-policy-binding \
          content-sync@quill-medical-app.iam.gserviceaccount.com \
          --project=quill-medical-app --role="roles/iam.workloadIdentityUser" \
          --member="principalSet://iam.googleapis.com/projects/45814277366/locations/global/workloadIdentityPools/github-pool/attribute.repository/bailey-medics/${R}"
      done
      ```

      All six secrets were then set, three in each content repository,
      at 07:47 on 2026-09-23:

      ```bash
      gh secret set GCP_SERVICE_ACCOUNT --repo bailey-medics/eoeeta-teaching \
        --body "content-sync@quill-medical-app.iam.gserviceaccount.com"
      gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER --repo bailey-medics/eoeeta-teaching \
        --body "projects/45814277366/locations/global/workloadIdentityPools/github-pool/providers/github-provider"
      gh secret set GCP_TEACHING_GCS_BUCKET --repo bailey-medics/eoeeta-teaching \
        --body "quill-images-app"
      ```

      …and the same three against
      `bailey-medics/respiratory-teaching`. `gh secret set` prints
      nothing on success, so the check is the `updatedAt` timestamp in
      `gh secret list`, not the absence of an error.

      **This is now live and unverified.** The next content publish from
      either repository authenticates as `content-sync` and writes to
      `quill-images-app`. If workload identity is wrong the publish
      fails at the authentication step, which is loud and harmless; the
      previous secrets are gone, so rolling back means setting them
      again by hand.

      Only after a content publish has been seen to land in
      `quill-images-app`, change `content_ci_service_account` in
      `infra/environments/app/terraform.tfvars` to the new account. It
      still names the teaching account because that is the identity
      writing to the bucket today, and moving it early removes the grant
      the pipeline is using. That is a code change, so it goes in a pull
      request rather than by hand.

      **The sweep risk turned out not to bite.** Both buckets hold the
      same 33 objects and 3.95MiB, and `quill-images-app` is the newer
      of the two (2026-09-22 against 2026-09-11 in
      `quill-images-teaching`), so `GCP_TEACHING_GCS_BUCKET` was already
      pointing at the app bucket before any of this. The sweep in
      `ci.yml` has been reading current content all along.

      **Nothing here can be triggered from this repository.**
      `eoeeta-teaching`'s workflow fires on `push` and `pull_request`
      only, with no `workflow_dispatch`, so proving the new identity
      needs a real content change in one of the two repositories.

- [x] Run a full deploy with `quill-medical-teaching` still alive but
      unused, and confirm it passes. Done at 06:30 on 2026-09-23, run
      35827064925 for #979: `Build frontend` and `Build backend` both
      passed on the app project's identity, pushing to both registries,
      and both environments deployed.

      **It was easy to miss that this had happened.** The build job is
      skipped whenever a merge touches no `backend/` or `frontend/`
      source, so the two deploys either side of it reported green
      without exercising the change at all. Read the build job's own
      conclusion, not the run's. This is the step that makes the
      teardown safe rather than brave: anything that still depends on the
      old project surfaces here, while the project is still there to
      answer. Skipping it means finding out after the shutdown, when the
      evidence is gone.

- [x] Destroy the teaching workspace with Terraform rather than deleting
      the project in the console, so the state is emptied rather than
      orphaned. Done on 2026-09-23. 92 of 95 resources destroyed,
      including `quill-core-teaching` and its backups.
      `teaching.quill-medical.com` stopped answering; the app and the
      marketing site served `200` throughout.

      **Skipped the `landing_domain` step above deliberately.** Dropping
      it from teaching's tfvars is the operation this plan already
      records as impossible, because the URL map still references the
      backend bucket. Destroying the whole workspace removes both in one
      pass, so the ordering problem does not arise.

      **A destroy of a real environment does not complete in one pass.**
      Three resources refused, and each stranded everything beneath it:

      - `quill-teaching-videos-processed-teaching` held a transcoded
        MP4 and the bucket has no `force_destroy`
      - the BigQuery dataset `quill_analytics_teaching` still held its
        `requests` table
      - the SQL user `quill` could not be dropped, because 59 objects
        in `quill_core` depend on the role

      Emptying the bucket and dropping the dataset cleared the first
      two. For the third, the user was removed from state rather than
      from the database: it lives inside the instance being destroyed,
      so the instance takes it, and untangling 59 object dependencies
      would have been work in service of nothing.

      ```bash
      gcloud storage rm -r "gs://quill-teaching-videos-processed-teaching/**"
      bq rm -r -f --dataset quill-medical-teaching:quill_analytics_teaching
      terraform state rm 'module.cloud_sql_core.google_sql_user.user'
      ```

- [x] Remove the last three networking resources: the VPC, its global
      address, and the service networking connection between them.
      Terraform refuses the connection with `Producer services (e.g.
      CloudSQL, Cloud Memstore, etc.) are still using this connection`,
      and nothing is: `gcloud sql instances list` returns nothing and
      the Redis API is not enabled on the project.

      Google holds the peering open for a while after a Cloud SQL
      instance is deleted, so this is a wait rather than a fault. Two
      passes over about ten minutes both refused. Shutting the project
      down removes all three anyway, so this step is optional and the
      shutdown below is the simpler route.

- [x] Remove `teaching` from the validation in `infra/variables.tf`, so
      the only environments the configuration accepts are `prod`,
      `staging` and `app`.

- [x] Narrow the widened conditions in `infra/main.tf` back to `app`
      alone. This is the contract half of the expand-contract Batch 3
      started, and it was safe only once the workspace was gone: the
      conditions are mostly `count`, so doing it while the old project
      ran would have read as an instruction to destroy the Cloud SQL
      instance and the video and content buckets.

      The list is one local used sixteen times, so narrowing it is a
      one-line change rather than sixteen edits. It stays a list rather
      than becoming a bare comparison, because a second project running
      this product is what the migration just did and may do again.

- [x] Remove `infra/environments/teaching/`.

- [x] Take `teaching` out of the three workflow matrices, in
      `terraform.yml` twice and `deploy.yml` once. **The tfvars file and
      the matrices have to move together**: a matrix leg naming an
      environment whose `terraform.tfvars` has been deleted fails on a
      missing file, and it fails on every run rather than once.

- [x] Stop pushing images to teaching's Artifact Registry. Eight tag
      lines in `deploy.yml`, four images in two forms each, pointed at a
      registry inside the project being shut down. The
      `roles/artifactregistry.writer` grant made on 2026-09-23 so the app
      account could write there is now unnecessary and goes with the
      project.

- [x] Shut the old project down rather than deleting it outright. Done
      on 2026-09-23: `quill-medical-teaching` shows `DELETE_REQUESTED`,
      and Google deletes it permanently thirty days later. A
      shut-down project is recoverable for thirty days; a deleted one is
      not, and nothing is gained by being final on the same day.

      Ready as of 2026-09-23. `gcloud projects delete
      quill-medical-teaching` is the shutdown: despite the verb, it marks
      the project for deletion and holds it for thirty days, during which
      `gcloud projects undelete` restores it.

      **Checked first: the Terraform state bucket is not in it.**
      `quill-medical-terraform-state` holds the state for every
      environment, `app` included, and shutting down the project that
      owned it would take all of them. It lives in
      `quill-medical-production`, alongside `quill-medical-zone`. The
      teaching project holds no buckets and no Cloud Run services or
      Compute instances; the three orphaned networking resources above
      are all that is left, and the shutdown takes them.

      **No lien blocks it.** Private service access, the peering behind
      those networking resources, can leave a lien that makes project
      deletion fail. The Resource Manager API showed none on 2026-09-23.
      `gcloud resource-manager liens` needs the `alpha` component, which
      is not installed here, so the check was a direct `GET` on
      `cloudresourcemanager.googleapis.com/v3/liens` with the project
      number as the parent.

      **There is no faster route to a full delete.** Google keeps a
      shut-down project for thirty days and then deletes it permanently
      on its own, and offers no way to skip the wait. Billing stops at
      shutdown, and the project id `quill-medical-teaching` can never be
      reused, even after the permanent deletion.

## Batch 9 — Claude and Mark: least privilege for the CI accounts

One service account, `github-actions@quill-medical-app`, does three jobs
with three very different needs, and holds `roles/editor` for all of them.
This batch splits it by job and narrows each to what that job uses. It
comes before Batch 11 because it can start now; Batch 11 waits on a second
environment.

**Taking `editor` away on its own achieves almost nothing.** The account
also holds `resourcemanager.projectIamAdmin`, which lets it grant itself
any role, owner included, and Terraform needs that role because it
manages IAM bindings. So the account is owner-equivalent whatever else is
removed. The gain comes from not handing that token to jobs that do not
need it, which is why the steps are ordered by how often each job runs
and how little it needs, with the `editor` swap last.

**The evidence, from the Admin Activity audit log on 2026-09-23.** Over
the project's life the account has written to thirteen services: Cloud
Run (159 calls), IAM (155), Compute (69), Monitoring (29), Secret Manager
(20), Storage (18), Logging (18), BigQuery (12), Service Networking (9),
Resource Manager (3), Cloud SQL (2), Artifact Registry (2) and Serverless
VPC Access (1). Admin Activity records configuration changes only, so
image pushes to Artifact Registry do not appear in it; the deploy
account's push permission comes from reading the workflow instead.

```bash
gcloud logging read \
  'protoPayload.authenticationInfo.principalEmail="github-actions@quill-medical-app.iam.gserviceaccount.com" AND logName:"cloudaudit.googleapis.com%2Factivity"' \
  --project=quill-medical-app --freshness=10d --limit=5000 \
  --format="value(protoPayload.serviceName)" | sort | uniq -c | sort -rn
```

Service accounts and role grants are made by Mark: the harness refuses
IAM grants, and did so throughout Batch 8. Workflow and Terraform changes
are Claude's, each in its own pull request.

### Phase 1: A deploy account

The deploy runs on every merge to `main`, so it is the job that uses the
token most. Its needs are small and can be read off the workflow: every
`gcloud` call in `deploy.yml` and `.github/scripts/deploy/` is `run
services describe`, `run services update`, `run services
update-traffic`, `run jobs update`, `run jobs execute`, or `auth
configure-docker` followed by a Docker push.

- [ ] **(Mark)** Create `github-deploy@quill-medical-app` with
      `roles/run.developer` on the project, `roles/artifactregistry.writer`
      on the `quill` repository only, and `roles/iam.serviceAccountUser`
      on the runtime service accounts only, not on the project. A Cloud
      Run deploy must act as the service's runtime identity, and granting
      that per account rather than project-wide stops the deploy acting
      as anything else, the Terraform account included.

- [ ] **(Mark)** Grant it `roles/iam.workloadIdentityUser` for
      `bailey-medics/quillmedical`, and add a `GCP_APP_DEPLOY_SERVICE_ACCOUNT`
      secret to the `app` GitHub environment.

- [ ] **(Claude)** Point the build and deploy jobs in `deploy.yml` at the
      new secret. The build job pushes images, so it moves too.

- [ ] Merge a change that touches `backend/` or `frontend/`, so the
      build job actually runs, and watch the deploy pass. A workflow-only
      change skips the build and proves nothing, which is how #974 went
      green without being tested.

### Phase 2: A read-only account for pull-request plans

`terraform.yml` runs `terraform plan` on every pull request with the
same owner-equivalent token as the apply on `main`. A plan changes
nothing, so it does not need it.

- [ ] **(Mark)** Create `github-plan@quill-medical-app` with
      `roles/viewer` and `roles/iam.securityReviewer` on the project, the
      second because `roles/viewer` cannot read every IAM policy and
      Terraform refreshes each `*_iam_member` it manages.

- [ ] **(Mark)** Grant it `roles/secretmanager.secretAccessor`. A plan
      refreshes the `google_secret_manager_secret_version` resources and
      reads the `alert_sms_number` and `pagerduty_service_key` data
      sources, all of which return secret payloads. That makes this
      account less read-only than its name; it is still unable to change
      anything.

- [ ] **(Claude)** Decide how the plan takes the state lock. `terraform
      plan` writes a lock object to the state bucket, so a strictly
      read-only account fails there. Either run PR plans with
      `-lock=false`, accepting that two concurrent plans are harmless
      because neither writes state, or grant the account object create
      and delete on the lock file alone. The first is simpler and the
      recommendation; write the reasoning into the workflow comment.

- [ ] **(Claude)** Point the `plan` job in `terraform.yml` at the new
      account through a `GCP_APP_PLAN_SERVICE_ACCOUNT` secret.

### Phase 3: Lock the apply account to `main`

The workload identity provider accepts any run from the three trusted
repositories, on any branch. So a workflow edited on a feature branch
can obtain the apply account's token today. Only Mark can push, so the
risk is small, but it is the gap this batch exists for.

- [ ] **(Mark)** Add an attribute mapping that joins repository and ref,
      `attribute.repo_ref = assertion.repository + '@' + assertion.ref`,
      on `github-provider` in `quill-medical-app`. The two cannot be
      bound separately: the content repositories also push to their own
      `main`, so a binding on `attribute.ref/refs/heads/main` alone would
      let `eoeeta-teaching` and `respiratory-teaching` take the apply
      token.

- [ ] **(Mark)** Replace the apply account's `workloadIdentityUser`
      binding on `attribute.repository/bailey-medics/quillmedical` with one
      on `attribute.repo_ref/bailey-medics/quillmedical@refs/heads/main`.
      A `workflow_dispatch` run from `main` still carries that ref, so
      manual applies keep working. Do the same for the deploy account from
      Phase 1, which also only ever runs on `main`.

- [ ] Prove it both ways. A `workflow_dispatch` apply from `main` must
      authenticate; the same workflow dispatched from a feature branch
      must be refused at the authentication step.

### Phase 4: Narrow the state bucket

- [ ] **(Mark)** Remove the dangling
      `github-actions@quill-medical-teaching` binding on
      `quill-medical-terraform-state`. The account was deleted with its
      project, and after thirty days the binding shows as
      `deleted:serviceAccount:…` rather than disappearing.

- [ ] **(Mark)** Scope each environment's account to its own state file
      with an IAM condition on the object name, for example
      `resource.name.startsWith("projects/_/buckets/quill-medical-terraform-state/objects/terraform/state/app.tfstate")`
      for the app account. Today every CI account, production and staging
      included, holds `roles/storage.objectAdmin` on the whole bucket, so
      each can read every other environment's state, and state holds
      secrets in plain text: `random_password.jwt_secret` and the Cloud
      SQL password among them. The lock file sits beside the state and
      needs the same prefix.

### Phase 5: Replace `editor` on the apply account

Last, because it is the smallest gain once Phase 3 has locked the token
to `main`, and the riskiest: a permission missed here fails an apply
partway, with some resources changed and others not.

- [x] Look at the 155 IAM writes before choosing roles. That is a lot
      for a project three days old, and IAM is where a missed permission
      is most likely. Group them by `protoPayload.methodName` to see
      whether they are Terraform setting bindings on each apply or the
      one-off setup.

      Done on 2026-09-23, and they are neither. All but one are
      `iam.serviceAccounts.actAs` on
      `45814277366-compute@developer.gserviceaccount.com`, the default
      Compute Engine account: one per deploy, because updating a Cloud
      Run service or job means acting as its runtime identity. The
      remaining one is the `SetIAMPolicy` behind
      `google_service_account_iam_member.cloudrun_token_creator`. So the
      apply account needs `roles/iam.serviceAccountUser` on that one
      account, not project-wide, and nothing about IAM churn stands in
      the way of narrowing it.

      ```bash
      gcloud logging read \
        'protoPayload.authenticationInfo.principalEmail="github-actions@quill-medical-app.iam.gserviceaccount.com" AND protoPayload.serviceName="iam.googleapis.com" AND logName:"cloudaudit.googleapis.com%2Factivity"' \
        --project=quill-medical-app --freshness=10d --limit=500 \
        --format="value(protoPayload.methodName,protoPayload.resourceName)"
      ```

- [ ] **(Mark)** Add a specific role for each service in the audit log,
      alongside `editor`: `roles/cloudsql.admin`, `roles/storage.admin`,
      `roles/compute.loadBalancerAdmin`, `roles/compute.securityAdmin`,
      `roles/monitoring.editor`, `roles/bigquery.admin`,
      `roles/artifactregistry.admin` and `roles/vpcaccess.admin`, beside
      the `run.admin`, `compute.networkAdmin`, `secretmanager.admin`,
      `logging.configWriter`, `servicenetworking.networksAdmin` and three
      IAM roles it already holds.

- [ ] **(Mark)** Remove `editor`, then run `terraform plan` at once. A
      plan exercises every read permission without changing anything, so
      a missing read fails there safely. A missing write only shows at
      the next apply, so make the next infrastructure change a small one.

### Phase 6: Give each workload its own runtime identity

Found while checking the IAM writes above. Every workload in the app
project runs as the default Compute Engine account: `quill-backend-app`
and `quill-frontend-app` name it, and the three jobs name no account and
fall back to it. That account holds `roles/secretmanager.secretAccessor`
on the whole project, through `google_project_iam_member.cloudrun_secret_accessor`.

So the frontend, which serves static files and needs no secret at all,
can read the Cloud SQL password and the JWT signing key, and so can the
caption job. It is not the `roles/editor` a default account has in an
older project, because the organisation policy stops that automatic
grant, but it is the same problem one layer down: a compromise of the
least important workload reaches the most important secrets.

Split expand-then-contract, because switching the identity a live service
runs as breaks it on apply if a single permission is missed. The inventory,
taken from the code on 2026-09-23: the backend reads its thirteen secrets,
reads the question bank bucket, manages the passports bucket, writes the
video uploads bucket and starts the transcode and caption jobs; the admin
job reads the Cloud SQL password and JWT key; transcode reads uploads and
writes renditions; caption reads and writes renditions; both jobs read the
callback token; the frontend reads nothing. The backend's only Google APIs
are Cloud Storage and Cloud Run jobs.

- [x] **(Claude)** Create an account per workload, `run-backend`,
      `run-frontend`, `run-admin`, `run-transcode` and `run-caption`, and
      grant each exactly the inventory above, in
      `infra/runtime-identities.tf`. Nothing runs as them yet, so it
      changes nothing that serves traffic: `terraform plan` showed 24
      additions and no change or destruction.

      Each workload's secret list now lives once, in `locals`, read both
      by the module that mounts the secrets and by the grants, so a
      secret added to a workload cannot be forgotten in its grants. Moving
      the backend's list there produced no diff, which is the check that
      nothing was copied wrongly. Secret grants go through
      `module.secrets.secret_ids`, so naming a secret the module does not
      create fails the plan rather than the apply.

- [x] **(Claude)** Point each service and job at its account, with
      `service_account` on the Cloud Run services and a new variable on
      `modules/cloud-run-job`. The default account keeps its grants
      meanwhile, so a missed permission shows as a failed revision while
      the old one keeps serving, not an outage. Merge only after the step
      above has applied.

      Built on 2026-09-23. `terraform plan` showed the five workloads
      updated in place with `service_account` the only attribute
      changing, and nothing destroyed.

      **No `actAs` needed for the backend to start the jobs.** Checked
      against Google's Cloud Run IAM reference rather than assumed:
      executing a job needs `run.jobs.run`, or `run.jobs.runWithOverrides`
      for overrides, both in `roles/run.jobsExecutorWithOverrides`;
      `iam.serviceAccounts.actAs` on the runtime identity is a deployment
      permission, needed to create or update a job, not to run one
      (https://docs.cloud.google.com/run/docs/reference/iam/roles).

      After it applies, exercise each workload once before the next step:
      sync the question banks, which proves `run-backend` reads the images
      bucket; upload a video, which proves the source bucket write, the
      job invocation and both jobs' bucket access; and let one deploy run
      its migrations and smoke test through `run-admin`. The frontend is
      proven by the site loading. A failure here is recoverable while the
      default account still holds its grants, which is why removing them
      is a separate step.

      **Applied on 2026-09-23, after one failed attempt.** #1026 and #1027
      were merged in the same second, so a single apply created the grants
      and immediately switched the workloads onto them. Google refused four
      of the five switches with `Permission denied on secret ... for
      Revision service account run-admin`: the grant existed, but IAM had
      not propagated in the seconds between. The frontend, needing no
      secret, switched; the backend's new revision was refused and the old
      one kept serving, so nothing went down. Re-running the same apply a
      few minutes later succeeded.

      Rather than add a `time_sleep` between grants and workloads, which
      would put a `depends_on` on every Cloud Run module and defer their
      data sources to apply time, the lesson is procedural: **merge a grant
      and the change that relies on it one at a time**, letting the first
      apply before the second merges. The recovery is a re-run.

      Proven since: `run-frontend` serves the site; `run-backend` answers
      `/api/health` on revision `00036`, so it read its secrets at start;
      `run-admin` ran the smoke-test action successfully. Still to prove,
      by Mark: a question bank sync (`run-backend` reading the images
      bucket) and a video upload (the source bucket write, the job
      invocation, and `run-transcode` and `run-caption` on the video
      buckets).

- [ ] **(Claude)** Remove the default account's grants: the project-wide
      `secretAccessor`, its bucket bindings, the job invokers and
      `cloudrun_token_creator`, once the step above has run live.

      **The token creator is not unused, as this step first claimed.**
      `backend/app/features/teaching/storage.py` calls
      `generate_signed_url` in four places; the search that concluded
      otherwise had its output cut to ten lines, before those matches. So
      after the switch, `/api/teaching/question-banks` returned 500 on
      2026-09-24 with `Error calling the IAM signBytes API`. `run-backend`
      now holds `roles/iam.serviceAccountTokenCreator` on itself, first by
      hand and then in `infra/runtime-identities.tf`. The default
      account's copy can go with the rest; only the video CDN signing is
      HMAC, not the images.

      **A second gap from the same inventory:** the backend also reads and
      writes caption files in `quill-teaching-videos-processed-app`, when
      an admin reviews captions. `run-backend` had no grant there, so a
      caption read returned 403. It now holds `roles/storage.objectAdmin`
      on that bucket, again by hand and then in Terraform.

      **The check that should have come first:** after both fixes, every
      grant the default account holds was compared with the five new
      accounts, bucket by bucket, at project level and on the account
      itself. Each now has a match. Do that comparison before switching
      identities next time, not after a user finds the 500. This is the step
      where the frontend actually stops being able to read the secrets.

- [ ] **(Mark)** Narrow the deploy account from Phase 1 to
      `roles/iam.serviceAccountUser` on the five runtime accounts rather
      than on the default Compute Engine one, once they exist.

## Batch 9a — Claude and Mark: unblock the Terraform apply

Every apply on `main` failed from 2026-09-24. Version 8 of the google
provider changed the default `load_balancing_scheme` from `EXTERNAL` (the
classic Application Load Balancer) to `EXTERNAL_MANAGED` (the global one).
Our load balancer never set the attribute, so each plan tried to move it
across, and Google refused: "Cannot change the load balancing scheme until
the migration state is set to TEST_ALL_TRAFFIC". A failed apply blocks every
other infrastructure change, so fixing it comes before anything else here.

- [x] Pin `load_balancing_scheme` to what is live, in
      `infra/modules/load-balancer/main.tf`. The backend services and the
      HTTPS forwarding rule are `EXTERNAL`. The HTTP forwarding rule is
      already `EXTERNAL_MANAGED`, because the provider recreated it under the
      new default before the others failed. It only redirects to HTTPS and
      has no backend, so it stays as it is: pinning it back would replace the
      rule for nothing. The plan after this should show no changes to the
      load balancer.
- [ ] **(Mark)** Confirm the next apply on `main` succeeds.
- [ ] Migrate the whole load balancer to `EXTERNAL_MANAGED` through Google's
      staged migration, as a piece of work of its own. Each backend service
      moves through `external_managed_migration_state` `PREPARE`, then
      `TEST_BY_PERCENTAGE`, then `TEST_ALL_TRAFFIC`, before its scheme can be
      switched. Worth doing: classic is the older product, and new Cloud
      Armor and routing features land on the global load balancer first.
      Not urgent: classic is still supported, and nothing we use needs the
      newer one.

## Batch 10 — Claude and Mark: test every alert route every four weeks

An alert route can break without anything noticing, and on 2026-09-23 two
of the four had: the SMS number was unverified and the PagerDuty free trial
had lapsed. Google reported both alerts as raised. Only a person holding
the phone could tell they never arrived. This batch makes that check
routine, so a broken route is found on a quiet Thursday rather than during
an outage.

**Every fourth Thursday at 1:15pm UK time**, starting 2026-10-01. The
window was set by Mark as 1pm to 2pm; 1:15pm leaves 45 minutes for
GitHub starting a scheduled run late, which it does at busy times.

- [x] **(Claude)** Add four permanent alert policies to
      `infra/modules/monitoring`, one per route: Slack, SMS, email and
      PagerDuty. Each is a `conditionMatchedLog` condition on a single
      log, `alert-route-test`, and notifies exactly one channel, so a
      missing message names the broken route.

      **Permanent, not made fresh each time.** A newly created alert
      policy is not live for a few minutes, and a trigger written before
      then is lost; that cost two failed attempts on 2026-09-23. A policy
      that already exists fires on the first line.

      Title them `Four-weekly alert test: <route>`, with documentation
      reading "Scheduled test. No action needed. You should receive four:
      Slack, SMS, email and a phone call; tell Mark if any is missing."
      Set `autoClose` to 30 minutes, which also resolves the PagerDuty
      incident, so nobody has to.

- [x] **(Claude)** Add `.github/workflows/alert-route-test.yml` and
      `.github/scripts/monitoring/alert-route-test.sh`, with a `.bats`
      beside it following `stale-incidents.sh`. The script writes one line
      to `alert-route-test` with `gcloud logging write`, and all four
      policies fire from it.

      **Two guards, because cron can express neither.**

      - *Every fourth week.* Cron has no "every four weeks". The workflow
        runs every Thursday, and the script carries on only when the whole
        weeks since 2026-10-01 divide by four. Counting from a fixed date
        rather than the ISO week number avoids a double or skipped run
        across a 53-week year.
      - *1:15pm UK all year.* GitHub schedules in UTC, and 1pm to 2pm UK
        is 12:00 to 13:00 UTC in summer but 13:00 to 14:00 UTC in winter,
        so no single time stays in the window. The workflow is scheduled
        at both `15 12 * * 4` and `15 13 * * 4`, and the script carries on
        only when `TZ=Europe/London date +%H` reads `13`. Exactly one of
        the two passes, whichever the season.

      A `workflow_dispatch` run skips both guards, so a route can be
      tested by hand after a change.

      **Built on 2026-09-23, with the time check changed.** The script
      decides by *which schedule fired*, from `github.event.schedule`,
      against London's current UTC offset, not by the clock when it
      starts. GitHub can start a scheduled run late; a clock check at the
      start would then see 14:xx on the one run that should have fired,
      skip it along with its partner, and miss the cycle entirely. This
      way a late run still fires, only late.

      The four policies are one `for_each` over the channels the module
      actually creates, keyed by static names so the keys are known at
      plan time. `terraform plan` showed exactly four created. The
      script's negative tests were proved able to fail by breaking both
      guards and watching five go red.

      **Interim identity.** The workflow authenticates as the app
      project's existing CI account until the narrow one below exists,
      so the first scheduled run on 2026-10-01 works whether or not
      that step is done by then.

- [ ] **(Mark)** Give the workflow an identity holding
      `roles/logging.logWriter` and nothing else. It is the narrowest job
      any CI account does, and a natural first user of the Batch 9 split:
      either its own service account, or the deploy account from Batch 9
      Phase 1 with that one role added.

- [ ] **(Mark)** Check the PagerDuty plan allows twelve or thirteen phone
      calls a year. The free plan limits phone and SMS notifications, and
      its trial lapsing is what broke the route on 2026-09-23.

- [ ] **(Mark)** Decide about 2026-12-24. The fourth run falls on
      Christmas Eve. Either accept it, or add a skip list of dates to the
      script, which is a few lines and easier than moving the anchor.

- [ ] Watch the first run on 2026-10-01 and confirm all four arrive. A
      missing one is the finding, not a failure of the test.

## Batch 11 — waiting: a second environment

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

      **Not done as of 2026-09-23.** All six names resolve to GoDaddy's
      parking addresses, `15.197.148.33` and `3.33.130.190`, and answer
      HTTPS with a `200` parking page and no redirect.

      **GoDaddy plays two different roles here, which is easy to
      confuse.** For `quill-medical.com` it is only the registrar: the
      name's nameservers are delegated to Google Cloud DNS
      (`ns-cloud-c*.googledomains.com`, zone `quill-medical-zone` in
      `quill-medical-production`), so GoDaddy forwards nothing and the
      traffic goes straight to our load balancer. The six new names are
      different: they still use GoDaddy's own nameservers
      (`ns*.domaincontrol.com`), which is why they show GoDaddy's parking
      page, and why GoDaddy's forwarding feature can serve the redirect
      without any record of ours. Set a permanent (301) forward to
      `https://quill-medical.com` on each of the five, in GoDaddy.

      **Deferred by Mark on 2026-09-23.** Not being done yet.

- [x] Do not add them to our load balancer's managed certificate.
      Holds as of 2026-09-23: `quill-cert-app-6bc99c16` lists only
      `app.quill-medical.com`, `quill-medical.com` and
      `www.quill-medical.com`. Serving
      the redirect ourselves would mean five more domains on
      `quill-medical.com`'s certificate, and a Google-managed certificate
      only goes active once every domain on it validates, so a name that
      fails to validate would take TLS down for the real site.

- [ ] Do not forward `quill-medical.dev`. It is the one name here that
      may be served for real later, and a redirect would have to be undone
      first.

- [ ] Set auto-renew and registrar lock on all six, with a company card
      and a shared billing address.

      Partly visible from outside. `quill-medical.me` already shows
      `clientTransferProhibited`, which is the registrar lock, and expires
      2027-09-21. `whois` returned nothing for `.net` and `.dev`, so their
      lock state has to be read in the GoDaddy dashboard, and auto-renew
      is never visible in `whois` at all. Domains are lost to lapsed renewals
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

- **Three bucket permissions existed only as manual grants on the old
  project, and nothing in Terraform creates them.** Each was invisible
  until something broke, and each broke differently:

  - `github-actions@quill-medical-teaching` needed
    `roles/storage.objectAdmin` on `gs://quill-images-app`. Without it
    the content pipeline fails loudly, a 403 on `storage.objects.list`
    while running `rsync`.
  - The backend's own service account,
    `45814277366-compute@developer.gserviceaccount.com`, needed
    `roles/storage.objectViewer` on the same bucket. Without it the
    pipeline succeeds, the files are in the bucket, and the sync returns
    `200 {"synced": [], "message": "No banks found"}`, because
    `list_banks_in_gcs` lists an empty bucket and cannot tell "nothing
    there" from "cannot see". That one cost an hour.
  - `github-actions@quill-medical-app` needed
    `roles/storage.objectAdmin` on
    `gs://quill-medical-terraform-state`, which is in its own project,
    or `terraform init` fails with a 403 that reads like a missing
    bucket.

  The video buckets, by contrast, were created correctly by Terraform,
  CDN service account and CORS origin included. The difference is that
  `modules/cloud-storage` creates the images bucket but grants nothing
  on it, while `modules/teaching-video-pipeline` does both. Worth
  closing, so the next environment does not need the same three
  discoveries.

- **Read the response before theorising about the cause.** The sync
  returning "No banks found" was diagnosed twice from the code, wrongly
  both times, the second guess being that no organisation existed. One
  authenticated `curl` to the endpoint printed the real message and
  settled it. The endpoint is reachable and the token is in Secret
  Manager, so this was always one command away.

- **Adding a domain to a certificate takes the hostname down, if that
  domain cannot validate yet.** Setting `landing_domain` on the app
  environment put `quill-medical.com` and `www` on
  `quill-cert-app-6bc99c16` alongside `app.quill-medical.com`.
  `create_before_destroy` created it, attached it to the HTTPS proxy and
  destroyed the certificate that was serving `app.`. The new one cannot
  serve anything until every domain on it validates, and the two new ones
  cannot validate while their DNS still points at the teaching project.
  So `app.quill-medical.com` had a certificate it could not use and no
  fallback, and went down on 2026-09-22.

  This plan said the opposite: that `app.quill-medical.com` would keep
  working on the existing certificate until the new one validated. That
  is true of the certificate, which is replaced rather than edited, and
  false of the proxy, which is pointed at the new one immediately.

  The order first written here as the fix was also wrong: it said to move
  the apex DNS before adding the domain to the certificate, and that the
  apex would be served on teaching's certificate in the gap. A
  certificate is attached to a proxy, not to a hostname. Moving the DNS
  sends traffic to the app project's proxy, whose certificate does not
  carry the apex, so the handshake fails. Tested with `curl --resolve`
  before it was attempted: `http=000`.

  There is no order with no gap, because validation resolves the domain
  and the certificate cannot cover a name whose DNS points elsewhere.
  What makes it survivable is that validation runs over HTTP on port 80,
  so the sequence is: name the domains, move the DNS, wait. The apex has
  no HTTPS in between.

- **`FAILED_NOT_VISIBLE` is not always permanent — do not write a
  certificate off.** A domain shows `FAILED_NOT_VISIBLE` while Google
  cannot reach it, and the natural reading is that the certificate is
  dead and needs replacing. That was recorded here as fact on
  2026-09-22 and it was wrong. `quill-cert-app-6bc99c16` showed the apex
  as `FAILED_NOT_VISIBLE` at 18:07, because DNS still pointed at
  teaching; once the apex moved to `34.49.99.83` at 20:00 it validated
  on its own and went `ACTIVE` on all three domains. Google does retry.

  The cost of believing otherwise was a hand-made `quill-cert-app-retry1`
  and an afternoon of drift, none of which was needed. Treat the status
  as "not yet", check the DNS actually resolves to the load balancer
  serving it, and wait. `quill-cert-app-ad3cda62` is the one that stayed
  stuck, and it only ever covered `app.quill-medical.com`.

  The order that still avoids the whole problem: move the DNS first,
  then create the certificate, so validation has something to find.

- **A certificate reaching `ACTIVE` does not mean the site serves yet.**
  For a few minutes afterwards the load balancer accepted the TCP
  connection on 443 and closed it mid-handshake, sending no certificate
  at all: `curl` reported `000`, `openssl` reported "no peer certificate
  available". Every part of the chain was already correct. It was the
  edge catching up and cleared within a minute. Confirm the chain once,
  then wait — and compare against a known-good host on the same machine
  (`teaching.quill-medical.com` answered `200` throughout) to rule out a
  local network or TLS problem rather than re-reading the config.

- **Setting `landing_domain` back to null cannot be applied.** Terraform
  reads it as "delete the backend bucket and its uptime check", and
  attempts both before removing the things that point at them. Google
  refuses, twice, with `The backend_bucket 'quill-landing-app' is already
  being used by urlMaps/quill-url-map-app` and `please ensure all
  associated Alert Policies are deleted`.

  Re-running does not help, because nothing about the plan changes
  between attempts. The URL map is a single resource whose `dynamic`
  blocks both hold the reference and are being removed in the same apply,
  so Terraform has no ordering available to it.

  Two ways out, and the second is why this plan went forward rather than
  back on 2026-09-22. Either remove the URL map's apex host rule and its
  `landing` path matcher in their own apply, then delete the bucket in a
  second one, which means editing the file that has already taken the API
  down once. Or stop reverting: restore `landing_domain`, at which point
  Terraform wants to delete nothing and the errors disappear.

  The practical lesson is narrower than it sounds. Adding a domain to
  this environment is easy to undo on paper and not in practice, so
  `landing_domain` is worth treating as a one-way door and setting only
  when the DNS is ready to follow.

- **A doubled dollar means Google substitutes it, not Terraform.** The
  alert template in `infra/modules/monitoring/main.tf` uses
  `$${resource.label.host}`, and the doubling is what lets that reach
  Google untouched so Google can fill it in when the alert fires. When
  the prose was changed to name the environment's own hostname, it was
  written `$${var.app_domain}` by copying the line above it. Terraform
  then left it alone and Google could not resolve it, so the first alert
  to fire read "Unrecognized variable: var.app_domain" where the hostname
  should have been. A Terraform variable takes one dollar; only Google's
  own placeholders take two.

  Nothing catches this: the policy applies cleanly, and the mistake is
  visible only in an alert somebody receives. That first alert was a
  false alarm from the certificate swap, so the bug arrived with a
  message that was itself wrong.

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

- **None of the CI service account's nine roles is in Terraform.** They
  were all granted by hand, the six copied from teaching plus the three
  added when the first apply failed:
  `resourcemanager.projectIamAdmin`, `servicenetworking.networksAdmin`
  and `compute.networkAdmin`. So a project rebuilt from this repository
  would have a CI account that cannot deploy, and the list of what it
  needs exists only in a `get-iam-policy` output and in this plan.

  Putting them in Terraform is not the same job as the bucket grants,
  and it is worth being clear why before somebody tries it. The bucket
  bindings grant the *backend* access to something. These grant the
  account that *runs Terraform* its own permissions, so Terraform would
  be managing the credential it authenticates with. A wrong edit removes
  the permission needed to make the next edit, and the only way back is
  an owner fixing it by hand.

  That is survivable here, because Mark holds `roles/owner` and can
  always repair it, but it means the change wants a deliberate sitting
  rather than being folded into other work. The safer shape is to
  declare the roles Terraform can prove are needed, leave
  `resourcemanager.projectIamAdmin` out of Terraform's own management so
  the account cannot revoke its own ability to grant, and apply it once
  against a project that is not serving anything.

**Hands over:** a working environment on a temporary hostname, ready for
the DNS cutover.

- **The console has no test button for a Slack notification channel,
  so test it with a throwaway log-match alert.** Create an alert policy
  whose only condition is `conditionMatchedLog` on a unique line, and
  whose only channel is the Slack one; write that line with `gcloud
  logging write`; watch for it; delete the policy. Done on 2026-09-23 and
  the message reached `#quill-medical-cicd`.

  **A new policy is not live for a few minutes.** Two lines written 8
  seconds and 2 minutes after creation raised nothing; a third, four and
  a half minutes after, raised an alert 72 seconds later. The
  `v3/projects/<id>/alerts` endpoint shows whether an alert was raised at
  all, which separates "the policy never fired" from "Slack did not
  deliver". Only the first is worth waiting on.

  **All four routes were proven the same way on 2026-09-23**, one
  throwaway policy per channel so each message could be told apart:
  Slack to `#quill-medical-cicd`, SMS to the verified number, email to
  `info@quill-medical.com`, and PagerDuty, which phoned. Each policy was
  created, left five minutes, triggered once and deleted after the
  message was confirmed.

  **While an alert is open, a second matching line does not raise
  another.** It folds into the open one, so re-triggering a policy that
  has already fired sends nothing new. A re-test needs the policy deleted,
  which closes its alert, and a fresh one made.

  **PagerDuty failing looks the same as Google failing, from Google's
  side.** The first PagerDuty test was raised and never rang, because the
  PagerDuty free trial had lapsed and the account had to be cut back to a
  single escalation policy. Google reported the alert raised either way;
  only the phone could tell the difference.

- **Terraform and the deploy both owned the backend's traffic, and
  that let an untested revision go live.** `modules/cloud-run` pinned
  traffic to 100% of the latest revision, and `deploy-tagged.sh` promoted
  with `--to-latest`. On 2026-09-23 a Terraform apply modified
  `quill-backend-app` between 20:58:02 and 20:58:34, while the #1017
  deploy was between tagging revision `00036` at 20:57:48 and looking the
  tag up at 20:58:30. The apply rewrote traffic, the tag vanished, and the
  deploy failed with `Could not resolve a tagged URL`. Worse, `00036` went
  live through Terraform's "latest" rule without the smoke test ever
  running against it. It happened to be healthy.

  Fixed on 2026-09-24 so that only the smoke-tested deploy can route
  traffic. `traffic` joins `ignore_changes` in `modules/cloud-run`, so
  Terraform sets it once at creation and never again; `terraform plan`
  showed no change from that. And `deploy-tagged.sh` promotes the tested
  revision by name, `--to-revisions=<revision>=100`, removing its tag in
  the same call, and waits for that revision, not the newest, to carry the
  traffic. A revision Terraform creates by changing the template now gets
  nothing until the next deploy builds from that template and tests it.
  The cost is that a Terraform-only change to a service goes live at the
  next backend deploy rather than at apply, which is the right way round.

  The immediate trigger was a re-run of a failed apply started by hand
  while a deploy was running, so the procedural lesson stands beside the
  fix: check `deploy.yml` is idle before re-running `terraform.yml`.

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
