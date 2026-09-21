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

## Batch 1 — Claude: the security fixes

These two phases are live today and depend on none of the naming
decisions. They are the only work here that is worth doing whether or not
the rename ever happens.

### Phase 1: Close the load balancer bypass

- [x] Set `ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"` on the
      backend and frontend Cloud Run services in `infra/main.tf`. The
      module already takes the variable (`infra/modules/cloud-run/variables.tf`),
      defaulting to `INGRESS_TRAFFIC_ALL`; nothing overrides it today.

- [x] Leave `roles/run.invoker` granted to `allUsers` in
      `infra/modules/cloud-run/main.tf`. Once ingress is closed the load
      balancer still calls the service as an anonymous caller, so
      removing it would break the site rather than harden it.

- [ ] Apply to teaching, which is the only environment deployed and the
      one currently exposed. This step is Batch 2.

- [x] Confirmed the three Cloud Run *jobs* need no equivalent. Admin,
      transcode and caption use `modules/cloud-run-job`, which creates a
      `google_cloud_run_v2_job`, and a job has no ingress setting because
      it is not reachable over HTTP.

- [ ] Verify the service's `*.run.app` URL now refuses the request, and
      that the public hostname still serves normally.

- [ ] Verify Cloud Armor now sees the traffic — the throttle rule at
      `infra/modules/load-balancer/main.tf` should be reachable on every
      request rather than skippable.

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

- [ ] Apply Batch 1's Terraform to the teaching project, ingress first,
      then the cookie change at a quiet moment.

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

- [ ] Adopt `app.quill-medical.com` for teaching and passport — the
      product that is actually live — and `ehr.quill-medical.com` for
      clinical when it exists.

- [ ] Name the environment `app` too, not just the hostname. The
      Terraform workspace, `var.environment` and the directory
      `infra/environments/teaching/` all carry `teaching` today, and
      `var.environment` is interpolated into around thirty resource names.

- [ ] Name environments after their regulatory class and audience, not
      their current feature list. `teaching.` has already outgrown itself
      once by acquiring the clinician passport.

- [ ] Leave the teaching feature named `teaching` throughout — the content
      repositories, `teaching-pipeline.yml`, the video pipeline module and
      the three secrets. They are about teaching. Only the environment is
      renamed, and renaming both would leave nothing to distinguish the
      deployment from the feature it serves.

- [ ] Note that the subdomain says EHR while the application still says
      EPR — the nav link in
      `frontend/src/components/ribbon/publicNavLinks.ts`, the two landing
      page buttons and the marketing copy. Nothing user-facing depends on
      it, because the clinical product is not live and every one of those
      links is disabled, so the mismatch costs nothing today. Renaming
      them is separate work, out of scope here.

### Phase 4: The new environment's Terraform

- [ ] Add `infra/environments/app/terraform.tfvars`, copied from the
      teaching one, with `project_id = "quill-medical-app"` and
      `environment = "app"`. Leave `lb_domains` on a temporary hostname;
      the cutover is Batch 5.

- [ ] Rewrite the eleven `var.environment == "teaching"` conditions in
      `infra/main.tf` to test for `app`. They gate the teaching video
      pipeline, the teaching buckets, the sync token secret and
      `CLINICAL_SERVICES_ENABLED`.

- [ ] Add `app` to the validation condition in `infra/variables.tf`, which
      allows only `prod`, `staging` and `teaching` today. Keep `teaching`
      accepted until the old project goes in Batch 8.

- [ ] Keep the three secret names as they are —
      `teaching-video-signing-key`, `teaching-sync-token` and
      `teaching-transcode-callback-token`. They are teaching feature
      secrets rather than environment labels, and renaming them means
      touching `infra/main.tf`, the transcode job, the caption job and the
      pipeline workflow for no gain.

- [ ] Check the CORS origin on the video buckets follows `var.app_domain`.
      The module takes `app_origin` from it, so it tracks the hostname
      automatically, but the upload goes cross-origin to
      `storage.googleapis.com` and a wrong value fails only at upload
      time.

**Hands over:** branches that describe the new environment but do not
build it. Nothing here takes effect until Batch 4 creates the project and
applies them.

## Batch 4 — Mark: build the project

Everything in this batch is console and command-line work against live
infrastructure. Claude has no credentials for it and should not attempt
it.

- [ ] Create `quill-medical-app` and set its display name to something a
      human reads, rather than leaving it matching the ID.

- [ ] Copy the organisation policies from `quill-medical-teaching`. The
      policy file and the command are recorded at
      `docs/docs/infrastructure/gcp.md`.

- [ ] Enable the same APIs the teaching project has. Terraform will fail
      on the first apply otherwise, one service at a time, which is slow
      to work through.

- [ ] Create a new Workload Identity Federation pool and provider, and a
      service account for CI. This must not be shared with the old
      project: two environments authenticating through one provider is how
      a deploy reaches the wrong place.

- [ ] Create the Terraform workspace `app`. State is separated by
      workspace under `gs://quill-medical-terraform-state/terraform/state/`,
      so the new environment starts with empty state and needs no state
      surgery.

- [ ] Apply Batch 3's Terraform, and let it build the environment from
      nothing. Around thirty resources take their names from
      `var.environment`, so they come out named `app` without any being
      renamed by hand.

- [ ] Create the three secrets in the new project. Generate a fresh video
      signing key rather than copying the old one: it signs cookies for a
      specific origin, nothing has been issued against the new project,
      and a fresh key means the old one dies with the old project.

- [ ] Re-run the teaching pipeline against the new project so the content
      buckets refill from `eoeeta-teaching` and `respiratory-teaching`.
      The content is version-controlled and the pipeline syncs it on every
      push to main, so nothing is copied between buckets by hand.

- [ ] Run the migrations against the new Cloud SQL instance and seed it.
      There are no real users, so this is a schema creation and a seed
      rather than a dump and restore.

- [ ] Confirm that is still true before relying on it. If anyone has
      registered on the live environment, this becomes a data migration
      and the cutover needs a maintenance window.

- [ ] Leave the clinician passport files behind. The passport bucket is
      not gated on the environment, so Terraform creates an empty one in
      the new project, and what is in the old one is test data. Revisit
      this if a real passport is uploaded before the move.

**Hands over:** a working environment on a temporary hostname, ready for
the DNS cutover.

## Batch 5 — Mark: cut the hostname over

The tfvars edits here are small enough to make alongside the apply rather
than as a separate branch; splitting them out would mean a branch that
cannot be verified until you apply it anyway.

- [ ] Release `app.quill-medical.com` from
      `infra/environments/prod/terraform.tfvars`, which claims it today.
      Production is shut down so nothing clashes now, but it would on
      restore.

- [ ] Set `lb_domains`, `app_domain` and `monitored_hostnames` in the new
      environment's tfvars. Put the canonical host first in `lb_domains` —
      `FRONTEND_URL` takes `lb_domains[0]` and feeds password-reset
      emails.

- [ ] Serve both hostnames during the change rather than cutting over.
      Changing `managed.domains` on the certificate forces a replacement,
      and a Google-managed certificate only goes active once every domain
      on it validates — so a straight swap can break TLS on the existing
      hostname for up to an hour.

- [ ] Create the DNS A record for the new hostname in the
      `quill-medical-zone` by hand. The `infra/modules/dns` module is not
      wired into `infra/main.tf`, so DNS is not under Terraform.

- [ ] Point `teaching.quill-medical.com` at the new project as a redirect,
      rather than leaving it served by the old one. It has to move before
      the old project is shut down in Batch 8, or the redirect dies with
      it.

- [ ] Exercise the new environment yourself before going further: sign in,
      load a question bank, play a video, upload one. There are no users
      whose traffic would prove it works, so the check has to be
      deliberate. Everything up to here is reversible by leaving DNS
      alone; after Batch 8 it is not.

**Hands over:** `app.quill-medical.com` serving, `teaching.` redirecting
to it, and both verified by hand. Batch 6 must not merge before this.

## Batch 6 — Claude: move everything off the old hostname

Retiring `teaching.quill-medical.com` is a list with an end, and this is
it. Nobody is stranded if it breaks — Quill has no users — so this is
about not breaking our own wiring.

**Do not start this batch until Batch 5 is done.** The deploy smoke test
moves to `app.quill-medical.com` here, so if it merges first, it points at
a hostname that is not serving yet and every deploy fails.

- [ ] Move the CI references first: the ZAP scan target in
      `.github/workflows/zap-scan.yml` and the deploy smoke test in
      `.github/workflows/deploy.yml`. If the redirect dies before these
      move, the smoke test fails the deploy that would have fixed it.

- [ ] Rename `GCP_TEACHING_PROJECT_ID`, `GCP_TEACHING_WIF_PROVIDER` and
      `GCP_TEACHING_SERVICE_ACCOUNT` to their `GCP_APP_*` equivalents,
      pointing at the new project, and update `deploy.yml`, `ci.yml`,
      `terraform.yml` and `zap-scan.yml`. Leaving them named `TEACHING`
      recreates inside CI the two-names problem this plan exists to
      remove.

- [ ] Change the workspace and tfvars path in `terraform.yml`, which
      selects the `teaching` workspace and reads
      `environments/teaching/terraform.tfvars` in both the plan and apply
      jobs.

- [ ] Point `BACKEND_SYNC_URL` in the teaching pipeline at the new
      hostname, or the content sync succeeds against an environment that
      is about to be deleted.

- [ ] Scope the new secrets to this repository rather than leaving them
      organisation-visible, as the secrets rule in `CLAUDE.md` requires.

- [ ] Move the application links: the three public pages
      (`index.tsx`, `pricing.tsx`, `clinical-teaching.tsx`), the ribbon
      navigation in `frontend/src/components/ribbon/publicNavLinks.ts`,
      and the landing page in
      `infra/modules/load-balancer/landing/index.html`.

- [ ] Update the monitoring dashboard prose in
      `infra/modules/monitoring/main.tf` and the domain tables in
      `docs/docs/infrastructure/gcp.md`.

- [ ] Drop `teaching.quill-medical.com` from `lb_domains` and
      `monitored_hostnames`. The DNS A record is deleted by hand in
      Batch 7.

**Hands over:** branches to review and merge, then apply. The GitHub
secret renames are yours, because Claude cannot write repository secrets.

## Batch 7 — Mark: the secrets and the old DNS record

- [ ] Create `GCP_APP_PROJECT_ID`, `GCP_APP_WIF_PROVIDER` and
      `GCP_APP_SERVICE_ACCOUNT`, pointing at the new project, and delete
      the `GCP_TEACHING_*` originals once Batch 6's workflow changes have
      merged.

- [ ] Scope them to this repository rather than leaving them
      organisation-visible, as the secrets rule in `CLAUDE.md` requires.

- [ ] Point `BACKEND_SYNC_URL` in the teaching pipeline at the new
      hostname, or the content sync succeeds against an environment that
      is about to be deleted.

- [ ] Delete the `teaching.quill-medical.com` A record, once nothing
      names it.

**Hands over:** CI running entirely against the new project.

## Batch 8 — Mark: retire the old project

- [ ] Leave `quill-medical-teaching` running until the new environment has
      been exercised for long enough to trust. It costs money, and that is
      the price of a reversible cutover — though with staging already shut
      down on cost, decide deliberately how long that is worth paying for
      rather than leaving it indefinitely.

- [ ] Destroy the teaching workspace with Terraform rather than deleting
      the project in the console, so the state is emptied rather than
      orphaned.

- [ ] Delete the workspace afterwards, and remove `teaching` from the
      validation condition in `infra/variables.tf`.

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

## Decisions

- **Ingress and cookies come before naming and IAP** — the bypass is live
  on the only deployed environment, and both fixes are small and depend on
  no decision still open. The bypass in particular makes every other
  access control conditional, so it is not worth building a gate above it.

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
