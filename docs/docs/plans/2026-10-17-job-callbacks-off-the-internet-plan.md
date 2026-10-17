# Job callbacks off the internet plan

The transcode and caption jobs report back to the backend at
`/api/ci/teaching/*-complete` over the public app domain, presenting a
shared secret. Both jobs run with `PRIVATE_RANGES_ONLY` egress, so the
report leaves Google's network, crosses the internet and comes back in
through the load balancer; and because the load balancer forwards all
of `/api/*`, the three callback routes are reachable from anywhere,
guarded by one long-lived token copied into three handlers. Google's
own guidance for Cloud Run calling Cloud Run is the opposite on both
counts: route the caller through the VPC so the request never leaves
Google's network, and authenticate with the caller's service account
identity rather than a secret.

The outcome is that a job's report travels inside the VPC to the
backend's internal address, carries a short-lived Google-signed
identity token that names the job that sent it, and the `/api/ci/`
prefix is refused at the edge once nothing outside GCP calls it. The
shared secret, its Secret Manager entry and both job mounts go.

## Phase 1: Route the reports through the VPC

- [x] Set `vpc_egress = "ALL_TRAFFIC"` on `module "cloud_run_transcode_job"`
      and `module "cloud_run_caption_job"` in `infra/main.tf`, as
      `module "cloud_run_admin_job"` already has for the deploy's smoke
      test. The backend's ingress is `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`,
      which admits same-project VPC traffic, and Google's ingress guide
      says a caller without VPC egress "goes out to the Internet first,
      so Google Cloud does not know the origin of the request". The
      subnet already has `private_ip_google_access = true`
      (`infra/modules/networking/main.tf`), so the jobs' Cloud Storage
      reads and writes ride Private Google Access rather than the NAT,
      and the NAT the admin job already uses covers anything else.
      Sources:
      [restrict ingress](https://docs.cloud.google.com/run/docs/securing/ingress),
      [private networking](https://docs.cloud.google.com/run/docs/securing/private-networking).

- [x] Point `TRANSCODE_CALLBACK_URL` and `CAPTION_CALLBACK_URL` at
      `module.cloud_run_backend.service_url` instead of
      `https://${var.app_domain}`, keeping the paths. Rewrite the comment
      on each, which currently explains the public domain by the
      `PRIVATE_RANGES_ONLY` egress this phase removes, and the matching
      paragraph in `infra/modules/cloud-run-job/variables.tf`, which
      gives the transcode and caption jobs as the example of needing
      `PRIVATE_RANGES_ONLY`.

- [ ] Run one transcode in App production after the apply, and confirm
      `transcoded_at` is set. An internal-ingress service answers a
      request that arrived from the internet with 404, not 401, so a
      404 in the job's log means the egress change did not take and the
      report is still leaving directly. Then one caption job, which
      proves the 720p read through Private Google Access as well as the
      report.

## Phase 2: The backend accepts the job's identity, alongside the token

- [x] Add `require_job_identity` to `backend/app/deps.py`. It reads the
      `Authorization` bearer, calls
      `google.oauth2.id_token.verify_oauth2_token` with
      `settings.TEACHING_JOB_CALLBACK_AUDIENCE`, and checks the token's
      `email` claim is in `settings.TEACHING_JOB_CALLBACK_CALLERS` and
      `email_verified` is true. Any failure is 401; nothing configured
      is 503, as the token check answers today. `google-auth` is already
      a dependency, used by `features/teaching/storage.py`, so nothing
      new is installed. The verifier fetches Google's signing
      certificates over the internet on each call, which the backend's
      `PRIVATE_RANGES_ONLY` egress allows; `google-auth` does not cache
      them, and a report lands a few times an hour at most, so that is
      left as it is. Google's service-to-service guide is the pattern:
      [authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

- [x] For the transition only, let the three callback routes accept
      either credential: a Google token that verifies, or the existing
      shared token. The jobs cannot switch at the same moment as the
      backend, since the backend deploys from `deploy.yml` and each job
      picks up its image from the same run but starts only when next
      asked to encode; and a job already running when the backend
      changes still holds the old token. Done inside
      `require_job_identity` itself, which the three routes now take as
      a dependency in place of the check each had copied: the shared
      token is tried first, then the identity. So the guard is already
      the one place, and Phase 4 removes the shared branch from it. One
      visible change: a guard that is a dependency answers before the
      body is read, so a caller with no token gets 401 where it used to
      get 422 for a malformed body. The 503 now reads "Job callback not
      configured", since the token is no longer the only thing it could
      be missing.

- [x] Add the two settings to `backend/app/config.py`, beside
      `TEACHING_TRANSCODE_CALLBACK_TOKEN`: `TEACHING_JOB_CALLBACK_AUDIENCE`,
      the backend's own `run.app` URL, and `TEACHING_JOB_CALLBACK_CALLERS`,
      the service account emails allowed to report, separated by
      commas. Both unset in development, where the routes answer 503
      and nothing calls them, which is the arrangement the token has
      now. The callers list is parsed with `parse_address_list`, as
      `FEEDBACK_NOTIFY_EMAIL` is, and a list that is set but malformed
      or empty fails at startup, so a slip stops the deploy rather than
      refusing every report in silence.

- [x] Set them on the backend in `infra/main.tf`. The audience cannot be
      `module.cloud_run_backend.service_url`, which would make the
      module read its own output; Cloud Run URLs are deterministic, so
      it is built as
      `https://quill-backend-${var.environment}-${data.google_project.project.number}.${var.region}.run.app`,
      and the Phase 1 trial has already shown what `service_url` is, so
      the two can be compared in the plan output. The callers are
      `google_service_account.runtime["transcode"].email` and
      `google_service_account.runtime["caption"].email`, from
      `infra/runtime-identities.tf`.

- [x] Test the dependency in `backend/app/deps_job_identity_test.py`,
      beside `deps_csrf_test.py`, patching the verifier: a verified
      token from a listed caller passes and is named; a token from an
      unlisted caller, an unverified email, a verifier that raises
      (Google refusing the token, or being unreachable), a missing
      header and a non-bearer header each give 401; nothing configured,
      or only one of the two identity settings, gives 503; the shared
      token passes without Google being consulted. The three routes'
      tests in `backend/tests/ci_media_callback_refusals_test.py` gain a
      case each for a listed and an unlisted identity, and keep their
      shared-token cases until Phase 4. `backend/app/config_test.py`
      covers the callers list parsing and its startup refusals.

## Phase 3: The jobs present their identity

- [ ] In `backend/scripts/transcode_cli.py` and `caption_cli.py`, mint
      the token from the metadata server rather than read it from the
      environment: a GET to
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=<TRANSCODE_CALLBACK_AUDIENCE>`
      with the `Metadata-Flavor: Google` header, which is what the
      Google auth libraries do underneath and keeps the job images free
      of a new dependency. The audience comes from a new
      `TRANSCODE_CALLBACK_AUDIENCE` / `CAPTION_CALLBACK_AUDIENCE` env var,
      set in `infra/main.tf` to the same value the backend checks.
      Unconfigured stays a logged skip, as it is now; a metadata server
      that cannot be reached is logged and skipped the same way, since
      the report must never fail the job. The poster report derives its
      address from the transcode one as before and uses the same token.

- [ ] Update `backend/tests/transcode_cli_test.py` and
      `caption_cli_test.py`: the `urlopen` mocks now see two calls, the
      metadata fetch and the report, and assert the report carries the
      minted token. Drop `TRANSCODE_CALLBACK_TOKEN` and
      `CAPTION_CALLBACK_TOKEN` from the fixtures.

- [ ] Remove `TRANSCODE_CALLBACK_TOKEN` and `CAPTION_CALLBACK_TOKEN` from
      `transcode_secret_env_vars` and `caption_secret_env_vars` in
      `infra/runtime-identities.tf`, which also drops both identities'
      `secretAccessor` grants on `teaching-transcode-callback-token`.

- [ ] Run a transcode and a caption job in App production and confirm
      both reports land. The backend still holds the shared token at
      this point, so a job on the old image keeps working meanwhile.

## Phase 4: Remove the shared secret

- [ ] Remove the shared-token branch from the three routes, leaving
      `require_job_identity` as their one guard. Delete
      `TEACHING_TRANSCODE_CALLBACK_TOKEN` from `backend/app/config.py`,
      from `backend_secret_env_vars` in `infra/runtime-identities.tf`,
      and the `random_password.transcode_callback_token` and its secret
      version in `infra/main.tf`. The three handlers' docstrings, which
      describe the shared token, are rewritten to describe the identity
      check.

- [ ] Teach `backend/tests/every_route_is_guarded_test.py` the new
      guard: a `SERVICE_CALLER` set holding
      `app.deps.require_job_identity`, counted as settling who the
      caller is, and the three callback routes taken out of `PUBLIC`.
      The test then sees the check in the dependency tree rather than
      trusting a reason string, which is what Phase 5 of the sync plan
      asked for.

## Phase 5: Refuse `/api/ci/` at the edge

- [ ] Add a Cloud Armor rule to `google_compute_security_policy.waf` in
      `infra/modules/load-balancer/main.tf`: `deny(404)` where
      `request.path.startsWith('/api/ci/')`, at a priority ahead of the
      throttle. 404 rather than 403, matching what the app's own guards
      answer, so the prefix is not advertised. The backend's `run.app`
      URL is already closed to the internet by its ingress setting, so
      after this the three routes are reachable only from inside the
      VPC.

      This lands only after Phase 4 of
      `2026-10-16-teaching-sync-without-a-github-secret-plan.md` has
      removed `POST /api/ci/teaching/sync`, which the teaching
      pipeline calls from GitHub over the public domain until then.

- [ ] Confirm from outside: `curl -i https://app.quill-medical.com/api/ci/teaching/transcode-complete`
      answers 404 from Cloud Armor, and a transcode run afterwards still
      records.

## Decisions

- **Fix the transport, keep the callback** - the other pattern in use
  is no callback at all: the job writes its result to Pub/Sub or the
  database and the backend consumes it. Google has no first-class
  "job finished" event yet, and the report here already carries the
  verified output names the backend needs, so the shape stays and only
  how it travels and proves itself changes.

- **The audience is the backend's `run.app` URL** - the backend grants
  `allUsers` the invoker role, so Cloud Run does not enforce the token
  itself and the app's own check is the one that matters. The audience
  is still the service URL, as Google's guide gives, so that if the
  invoker grant is ever narrowed the same tokens keep working.

- **A connector still, not Direct VPC egress** - Google's newer Direct
  VPC egress needs no connector and has higher throughput, which would
  suit video. Every workload here is on the connector, and swapping the
  jobs alone would leave two arrangements to understand; it is a
  separate change for all of them together, if the encode times ever
  warrant it.

- **Expand then contract, over three deploys** - the backend could
  switch to identity tokens in one step if the jobs were updated and
  re-run in the same breath, but a job started before the deploy would
  report with a token the backend no longer accepts and leave its
  module hidden. Accepting both for one deploy costs a few lines and
  removes the window.
