# API security headers plan

In production, responses from the API carry no security headers. The
application's pages get a full set from Caddy (`caddy/prod/Caddyfile`), but
the load balancer sends `/api/*` straight to the backend Cloud Run service,
so those responses never pass through Caddy, and neither the backend nor the
load balancer adds any. A request to the live site on 2 October 2026 confirmed
it: `https://app.quill-medical.com/` returned the full set and
`https://app.quill-medical.com/api/health` returned none. `/videos/*` is in
the same position by reading the Terraform, though it was not checked live
because it needs a signed URL.

The risk is modest and worth closing. Most API responses are JSON, which a
browser will not run, but the API also serves files: passport evidence, PDFs,
exports. The outcome wanted is that every response leaving the load balancer
carries the headers, including from endpoints not yet written, and that a
check fails if they ever go missing again.

## Phase 1: Headers on API responses

- [x] Add `custom_response_headers` to
      `google_compute_backend_service.backend` in
      `infra/modules/load-balancer/main.tf`. The landing site's backend
      bucket in the same file already does this and is the pattern to copy.
      The headers:

    - **`X-Content-Type-Options: nosniff`** – the one that matters most.
      It stops a browser guessing a file's type, which is how an uploaded
      file gets treated as a web page. Only one route sets it today, the
      inline evidence response in
      `backend/app/features/passport/router.py`.

    - **`X-Frame-Options: SAMEORIGIN`** – not `DENY`, which this plan
      first asked for. It said nothing in `frontend/src` frames an API
      response, and that was wrong: the search looked for an `iframe` tag
      and missed `<Box component="iframe">` in
      `frontend/src/components/documents/Document.tsx`, which the
      certificate page uses to show a PDF from
      `/api/passport/…/attachments/…`. The load balancer applies one set
      of headers to the whole backend service and overwrites a header the
      backend sent, so that route cannot be given an exception. Same-origin
      framing keeps the page working and still stops another site framing
      an API response.

    - **`Content-Security-Policy: default-src 'none'; frame-ancestors 'self'`**
      – an API-only policy, far tighter than the application's, because an
      API response should load nothing at all. `frame-ancestors 'self'`
      rather than `'none'` for the reason above. The API serves no HTML in
      production (`/api/docs` and `/api/redoc` exist only in dev), so
      `default-src 'none'` has no page of its own to break.

    - **`Strict-Transport-Security: max-age=63072000; includeSubDomains`**
      – the same value Caddy already sends for this hostname, so it makes
      no new promise. No `preload`, for the reason given in the Caddyfile.

    - **`Referrer-Policy: strict-origin-when-cross-origin`** – to match
      the application.

- [x] Before merging, check that the strict policy does not stop a browser
      showing the files the API serves inline. The routes to try are the
      passport evidence, PDF, markdown and zip responses in
      `backend/app/features/passport/router.py` and the PDF in
      `backend/app/features/teaching/router.py`. If a built-in PDF viewer
      refuses to render under `default-src 'none'`, loosen the policy for
      what the viewer needs and record what was needed here.

    - **Only the evidence route is at risk** – it is the one response a
      browser renders in place. The markdown, PDF and zip exports and the
      teaching PDF are all sent as `attachment`, and the frontend fetches
      them and saves them from a blob, so a policy on the response never
      reaches a viewer. An evidence image goes into an `img`, which
      neither header touches.

    - **Checked in Chrome 154 and Firefox 154 on 2 October 2026**, against
      a stand-in server sending a page with Caddy's headers and a framed
      PDF with the headers under test, since nothing local has a load
      balancer. With `DENY` and `frame-ancestors 'none'` both browsers
      refused to draw the frame. With `SAMEORIGIN` and
      `default-src 'none'; frame-ancestors 'self'` both drew the PDF:
      Firefox in a screenshot, Chrome by its viewer reporting the
      document loaded with one page and no policy violation logged.
      Nothing more needed loosening.

    - **Older reports say otherwise, and no longer hold.** Chromium issue
      40328564 and several write-ups from 2020 describe Chrome's viewer
      failing under a strict `style-src` or `object-src` on the PDF's own
      response, and Mozilla bug 1582115 the same for Firefox until
      version 77. The check above is why `style-src 'unsafe-inline'` was
      not added.

    - **Confirmed on the live site on 2 October 2026**, after the apply:
      a PDF attached to a passport certificate still shows.

    - **Safari was not tried by itself**, on a Mac or an iPhone. It
      could not be driven unattended. If it ever refuses, the policy is
      loosened here, for every API response, because the load balancer
      cannot vary it by route.

- [x] After the apply, request `https://app.quill-medical.com/api/health`
      and confirm each header is present once. Then request an evidence
      file and confirm `X-Content-Type-Options` is not sent twice, since
      that route sets it itself. Google's documentation says it will not
      be: "Headers added by the load balancer overwrite any existing
      headers that have the same name"
      (<https://cloud.google.com/load-balancing/docs/https/custom-headers>).
      Leave the header on the route either way, because the dev and E2E
      stacks have no load balancer to add it. Then open a certificate with
      a PDF attached and confirm it still shows. `infra/` changes apply
      through `terraform.yml` on merge, so check that run before checking
      the site.

    - **Done on 2 October 2026.** The apply succeeded, `/api/health`
      returns all five headers once each, and a certificate PDF still
      shows. The evidence response itself was not inspected for a doubled
      `X-Content-Type-Options`: that needs a logged-in session, and it
      rests on Google's documentation quoted above.

## Phase 2: Headers on video responses

- [x] Add `custom_response_headers` to
      `google_compute_backend_bucket.videos` in
      `infra/modules/teaching-video-pipeline/main.tf`:
      `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
      `Referrer-Policy: strict-origin-when-cross-origin` and the same
      `Strict-Transport-Security` value as phase 1. No
      `Content-Security-Policy`: these are media and caption files, and a
      policy on them does nothing. `DENY` is right here even though
      phase 1 had to use `SAMEORIGIN`: the player loads these files through
      a `video` element and its own requests, and nothing frames one.

- [x] After the apply, play a lecture on the live teaching site and confirm
      playback and captions still work. Then read the response headers of
      a video segment in the browser's network tab, on a response served
      from the CDN cache as well as a fresh one, since this bucket has
      `enable_cdn = true` and a cached response must carry them too.

    - **Done on 2 October 2026.** A lecture plays on the live site. An
      unsigned request to `/videos/*` is refused with a 403 that carries
      all four headers. Captions and a response served from the cache
      were not looked at separately.

## Phase 3: A check that fails when they go missing

This phase lands only after phases 1 and 2 are live. The deploy and the
Terraform apply both run on merge, so a check merged alongside the headers
could run before they exist and fail a healthy deploy.

- [x] Add `.github/scripts/deploy/check-security-headers.sh` with a
      `.bats` file beside it, following `.claude/rules/workflows.md`. It
      takes a URL and fails unless the response carries
      `X-Content-Type-Options`, `X-Frame-Options`,
      `Content-Security-Policy` and `Strict-Transport-Security`. This is
      the only place the headers can be tested: neither the dev stack nor
      the E2E stack has a load balancer.
      It checks the names and not the values, because `/` and
      `/api/health` are meant to differ: `DENY` against `SAMEORIGIN`, and
      two different policies. `Referrer-Policy` is left out as the list
      above has it; it is the least consequential of the five.

- [x] Call it from `deploy.yml` after the existing smoke test of
      `https://${HOSTNAME}/api/health`, once for `/` and once for
      `/api/health`. Checking `/` as well guards the Caddy headers, which
      nothing asserts today either.

- [x] Mark the "Security headers" item in `docs/docs/plans/todo.md` as
      done.

## Phase 4: Make the documents true

- [x] Update the security headers section of
      `docs/docs/cybersecurity/index.md` and the CSP section of
      `docs/docs/infrastructure/gcp.md` to say which layer sets the headers
      for which responses: Caddy for the application's pages, the load
      balancer for the API, the videos and the landing site.
      The CSP section of `gcp.md` also showed a policy older than the
      Caddyfile's, without `frame-src` and without Cloud Storage in
      `connect-src`; it now matches. In `cybersecurity/index.md` the new
      account is its own section under the table rather than a rewrite of
      the paragraph above it, because open pull request #1363 rewrites
      that paragraph and the table, and the two would collide.

- [x] Ask a human to review Hazard-0032
      (`docs/docs/safety/hazards/Hazard-0032.md`). It lists "Add API
      security headers" as a design control, and its status is still "Draft
      from LLM" with the residual risk "awaiting initial controls
      implementation". This plan puts that control in place; the hazard
      record is a human's to update.

    - **Updated on 2 October 2026, at the human's request.** The record
      now lists the headers as an existing control, with `SAMEORIGIN`
      where it had asked for `DENY`. It also corrects a claim in the
      draft: login does not expose roles to somebody who is not logged
      in. It returns a user's own roles, after a correct password. The
      scoring is still "TBC" and the status still says draft, because
      those are the Clinical Safety Officer's to set.

- [x] Stop calling the Cloud Armor policy a WAF. It holds one rule, a
      rate limit of 500 requests a minute per IP, and a default allow. It
      has no rules that look for attack patterns. Reword it as "Cloud Armor
      rate limiting" in the comments at the top of
      `infra/modules/load-balancer/main.tf` and `caddy/prod/Caddyfile`, and
      in `docs/docs/cybersecurity/index.md`,
      `docs/docs/infrastructure/gcp.md`,
      `docs/docs/frontend/public-pages.md` and
      `docs/docs/backend/caddy/index.md`.
      Rewording turned up a second false claim: `public-pages.md` listed
      Cloud Armor as protecting the landing site, and `gcp.md` said "on all
      load balancers". The policy is attached only to the backend and
      frontend services. Neither the landing bucket nor the videos bucket
      carries one, and both documents now say so. Whether those buckets
      should have a rate limit is not decided here.

## Decisions

- **The load balancer, not a backend middleware** – one setting covers
  every response the backend sends, including from endpoints written later,
  and it is the pattern the landing site already uses. The cost is that the
  headers exist only in production, so no unit or E2E test can see them.
  Phase 3 is the answer to that.

- **The frontend service is left alone** – Caddy already sets its headers
  and the E2E stack runs that same Caddyfile, so they are exercised before
  every merge. Setting them at the load balancer as well would send two
  copies of each.

- **Real WAF rules are deferred** – adding Google's preconfigured rule sets
  (SQL injection, cross-site scripting) to the Cloud Armor policy is a
  separate piece of work. They can block legitimate requests, so they need
  to run in preview mode first and be tuned. Phase 4 only stops the
  documents claiming rules that are not there.
