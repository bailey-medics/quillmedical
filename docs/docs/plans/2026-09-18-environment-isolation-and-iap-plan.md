# Environment isolation and IAP plan

Every deployed environment currently shares one cookie jar and one open
back door, and neither is visible from the application. `COOKIE_DOMAIN`
is set to `.quill-medical.com`, so a cookie written by any subdomain is
sent to every other one — staging can set a session cookie that
production will accept. Separately, every Cloud Run service defaults to
`INGRESS_TRAFFIC_ALL` with `allUsers` as invoker, so each service is
reachable directly on its own `*.run.app` URL. That URL is published in
Certificate Transparency logs the moment a certificate is issued, and
reaching it skips the load balancer entirely — which means Cloud Armor's
rate limit is bypassable in the live teaching environment today.

Two longer-running needs sit behind those. Clinical features will
eventually need an environment separate from teaching and passport work,
with a different release gate; and the `teaching.` hostname already
misdescribes what it serves, because the clinician passport lives in the
same project. Non-production environments also need an access gate that
does not depend on a fixed IP address.

This plan closes the two security gaps first, because they apply to the
live environment and do not depend on any of the naming decisions. It
then settles the environment names, and finally puts Identity-Aware
Proxy in front of non-production.

## Phase 1: Close the load balancer bypass

- [ ] Set `ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"` on the
      backend and frontend Cloud Run services in `infra/main.tf`. The
      module already takes the variable (`infra/modules/cloud-run/variables.tf`),
      defaulting to `INGRESS_TRAFFIC_ALL`; nothing overrides it today.

- [ ] Leave `roles/run.invoker` granted to `allUsers` in
      `infra/modules/cloud-run/main.tf`. Once ingress is closed the load
      balancer still calls the service as an anonymous caller, so
      removing it would break the site rather than harden it.

- [ ] Apply to teaching first, then staging. Teaching is the live
      environment and the one currently exposed.

- [ ] Verify the service's `*.run.app` URL now refuses the request, and
      that the public hostname still serves normally.

- [ ] Verify Cloud Armor now sees the traffic — the throttle rule at
      `infra/modules/load-balancer/main.tf` should be reachable on every
      request rather than skippable.

## Phase 2: Host-only auth cookies

- [ ] Remove `COOKIE_DOMAIN = ".${var.domain}"` from `infra/main.tf`.

- [ ] Remove `COOKIE_DOMAIN: ".quill-medical.com"` from
      `compose.prod.cloud-run.yml`.

- [ ] Confirm no code change is needed. `backend/app/config.py` already
      declares `COOKIE_DOMAIN: str | None = None`, documented as "None =
      current domain", and `backend/app/main.py` passes it straight
      through to every `set_cookie` and `delete_cookie` call.

- [ ] Announce that the deploy logs everyone out once. The old
      `.quill-medical.com` cookies stop matching the host-only ones, so
      existing sessions end. Ship it at a quiet time.

- [ ] Check nothing depends on a session surviving a hop between
      `teaching.` and the apex — the landing site is static and should
      not, but confirm rather than assume.

- [ ] Record the `__Host-` cookie prefix as a later hardening step. It
      requires host-only, `Secure` and `Path=/`, all of which this phase
      establishes, and it makes the browser enforce them.

## Phase 3: Settle the environment names

- [ ] Adopt `app.quill-medical.com` for teaching and passport — the
      product that is actually live — and `epr.quill-medical.com` for
      clinical when it exists. The public navigation already calls the
      clinical product "EPR" in `frontend/src/components/ribbon/publicNavLinks.ts`.

- [ ] Name environments after their regulatory class and audience, not
      their current feature list. `teaching.` has already outgrown itself
      once by acquiring the clinician passport.

- [ ] Release `app.quill-medical.com` from `infra/environments/prod/terraform.tfvars`,
      which claims it today. Production is hibernated so nothing clashes
      now, but it would on restore.

- [ ] Update `lb_domains`, `app_domain` and `monitored_hostnames` in
      `infra/environments/teaching/terraform.tfvars`. Put the new
      canonical host first in `lb_domains` — `FRONTEND_URL` takes
      `lb_domains[0]` and feeds password-reset emails.

- [ ] Serve both hostnames during the change rather than cutting over.
      Changing `managed.domains` on the certificate forces a replacement,
      and a Google-managed certificate only goes active once every domain
      on it validates — so a straight swap can break TLS on the existing
      hostname for up to an hour.

- [ ] Create the DNS A record for the new hostname in the
      `quill-medical-zone` by hand. The `infra/modules/dns` module is not
      wired into `infra/main.tf`, so DNS is not under Terraform.

- [ ] Keep `teaching.quill-medical.com` as a redirect rather than
      retiring it. It appears on three public marketing pages and is
      likely in bookmarks and trust documentation.

- [ ] Update the hostname in the deploy smoke test, the ZAP scan target,
      the public pages buttons, the ribbon navigation, the landing page
      in `infra/modules/load-balancer/landing/index.html`, the monitoring
      dashboard prose, and the domain tables in
      `docs/docs/infrastructure/gcp.md`.

## Phase 4: Take the health path off the gate

- [ ] Set `app_domain` in the staging tfvars. It is unset today, so the
      uptime check probes `/` rather than `/api/health` — and `/` cannot
      be exempted from an access gate without undoing the gate.

- [ ] Route `/api/health` to its own backend service in the URL map,
      pointing at the same serverless NEG but with no IAP. That keeps
      both the deploy smoke test and Cloud Monitoring's probers working
      without either needing a token.

- [ ] Confirm the exemption is genuinely narrow. It must match the health
      path only, not a prefix that would expose the rest of the API.

## Phase 5: Identity-Aware Proxy on non-production

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
      Phase 4 the check sits at nought per cent forever — the same
      permanently-open false incident already documented in
      `infra/modules/monitoring/main.tf`.

- [ ] Document the session-expiry behaviour for whoever uses staging.
      When an IAP session lapses mid-visit, an API call receives a
      redirect towards Google sign-in rather than a clean 401, so the
      401-refresh path in `frontend/src/lib/api.ts` never fires and the
      failure looks like a parse error. A reload clears it.

## Phase 6: Second registrable domain

- [ ] Register a `.dev` domain for non-production, for brand protection
      as much as for isolation. It is cheap insurance against a lookalike
      sign-in page on a name that reads as ours.

- [ ] Set auto-renew, registrar lock, a company card and a shared billing
      address. Domains are lost to lapsed renewals far more often than to
      anyone taking them deliberately.

- [ ] Treat the isolation benefit as secondary. Host-only cookies from
      Phase 2 already close the shared-jar problem; what a separate
      registrable domain adds is that `SameSite` treats the environments
      as genuinely cross-site.

## Decisions

- **Ingress and cookies come before naming and IAP** — they apply to the
  live environment, they are small, and they do not depend on any
  decision still open. The bypass in particular makes every other access
  control conditional, so it is not worth building a gate above it.

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

- **The `.dev` domain is bought for brand protection, not for staging** —
  the isolation argument alone did not justify it once host-only cookies
  were on the table. The risk of somebody else holding a name that looks
  like ours does justify it, at roughly a tenner a year.
