# GCP video auth gate plan

The learning centre currently plays video by embedding YouTube. That was the
right call for the first release — Phase 1a of the
[Learning Section](2026-05-15-learning-section-plan.md) plan shipped
`<VideoPlayer>` with `react-player` and no backend video infrastructure at all —
but it is not where the product can stay. EoEETA lectures are recorded in
clinical settings, they are commercially licensed to the academy rather than to
the public, and "unlisted on YouTube" is a URL away from being listed. The
learning centre needs its own video, held in a private bucket, released only to
a learner the backend has already authenticated and authorised.

This plan supersedes **Section 8** of the Learning Section plan, which is the
existing Phase 3 for this work and has not been started. It supersedes rather
than extends it because Section 8 contains a technical error that changes the
whole shape of the build. Section 8 says to put Cloud CDN in front of the
processed bucket *and* mint 8-hour GCS v4 signed URLs from the backend, on the
basis that "Cloud CDN handles signed URL validation correctly". Those are two
different, mutually exclusive mechanisms:

- **GCS v4 signed URLs** — what `backend/app/features/teaching/storage.py`
  already does for question images. The URL points at `storage.googleapis.com`,
  so the request never reaches our load balancer. Cloud CDN is not in the path,
  nothing is cached, and every byte of every replay is billed as GCS egress.
  Fine for a 40 KB endoscopy still; not fine for a 900 MB lecture.

- **Cloud CDN signed URLs and signed cookies** — a separate scheme keyed by
  `google_compute_backend_bucket_signed_url_key` on a backend bucket attached to
  our existing HTTPS load balancer, validated at the edge before any origin
  fetch.

Building Section 8 as written would produce a system that either has no CDN or
has a CDN nothing routes through. The intended outcome of this plan is a video
path where the access decision stays in FastAPI, next to the feature gate and
CBAC checks that already guard the rest of teaching, while the bytes are served
from the edge on the origin the app already runs on.

## Decisions

- **Cloud CDN signed cookies, not signed URLs** — A signed cookie is scoped to a
  URL *prefix*, so one grant covers the poster frame, both renditions and the
  WebVTT captions for a module without re-signing each asset, and it keeps
  working if we later move to segmented HLS where per-URL signing is untenable.
  It is also a materially better auth gate: the cookie is set `HttpOnly`, so page
  script cannot read it and it never appears in the DOM, in a copied link, in a
  `Referer` header, or in browser history — all of which a signed URL does.

- **Serve from the existing teaching load balancer at `/videos/*`** — The
  teaching environment already terminates `teaching.quill-medical.com` on a
  Global HTTPS LB with a URL map (`infra/modules/load-balancer/main.tf:120`) that
  routes `/api/*` to the backend Cloud Run service and everything else to the
  frontend. Adding a `/videos/*` path rule pointing at a new backend bucket means
  video is same-origin with the app, so the cookie the backend sets is sent on
  the media request automatically with no cross-site cookie handling, no CORS
  configuration, and no second certificate.

- **Thirty-minute cookie with silent refresh, not eight hours** — Section 8
  proposed 8 hours. A grant that long outlives logout, outlives an admin removing
  someone's teaching feature flag, and outlives the learner closing the laptop in
  a shared clinical office. Thirty minutes with a refresh at expiry minus five
  bounds the damage without the learner ever seeing a stall, and it makes
  revoking access meaningful: the next refresh call simply fails.

- **Progressive MP4 first, HLS deferred** — Two flat H.264 files (720p, 1080p)
  behind one prefix. Cloud CDN honours byte-range requests, so seeking works.
  Adaptive bitrate is a real improvement for learners on hospital wifi, but it is
  a separate problem from the auth gate and the cookie design above does not have
  to change to accommodate it later.

- **Ship serving before transcoding** — Phases 0–4 get a hand-encoded MP4 playing
  end to end for an authorised learner and rejecting an unauthorised one. The
  FFmpeg and Whisper Cloud Run jobs (Phase 6) are an authoring convenience layered
  on a working, tested access path, not a prerequisite for one. This is the
  ordering that lets the security-critical part be reviewed on its own.

- **HMAC-SHA1 is Cloud CDN's scheme, not our choice** — Cloud CDN signed cookies
  are specified as base64url-encoded HMAC-SHA1. SHA-1 collision resistance is
  irrelevant to an HMAC construction and HMAC-SHA1 has no practical break, but it
  will be flagged in security review, so it is recorded here as a constraint
  imposed by the platform rather than a decision we made.

- **The YouTube path stays** — `youtube_id` keeps working alongside the new
  `video_src`. Some content is legitimately public, and forcing a migration of
  every existing slide before any GCS video can ship would gate this work behind
  a content project.

- **No DRM** — Unchanged from the parent plan. The cookie is the access boundary.
  A determined learner with developer tools can retain a copy; that is accepted,
  and the mitigation is contractual rather than technical.

- **No new database tables** — Learning content is compiled from MDX per request
  rather than persisted (`backend/app/features/teaching/mdx_parser.py` feeds
  `LearningContentOut` directly), and video status for the admin page is read by
  listing GCS. So no Alembic migration is required for any phase here. Resume
  position is item 18 of the parent plan and stays there.

## Phase 0: Spike — private bucket behind a backend bucket

The one unknown that could invalidate the design. The existing backend bucket in
this repo fronts the *landing site*, which is granted `allUsers` read at
`infra/modules/load-balancer/main.tf:175`. A backend bucket historically required
a public bucket, which would defeat the entire purpose here. Google now supports
private-bucket origins for backend buckets via a Cloud CDN fill service account,
but this must be proven in our project before Terraform is written around it.

- [ ] Create a throwaway private bucket in `quill-medical-teaching` with uniform
      bucket-level access and public access prevention enforced. Upload one small
      MP4.
- [ ] Attach it as a `google_compute_backend_bucket` with `enable_cdn = true`,
      wired to a spare path on the existing URL map.
- [ ] Grant `roles/storage.objectViewer` to
      `service-<project-number>@cloud-cdn-fill.iam.gserviceaccount.com` on that
      bucket, and confirm an unauthenticated request through the LB returns the
      object while a direct `storage.googleapis.com` request returns 403.
- [ ] Add a signed-URL key to the backend bucket and confirm that an unsigned
      request through the LB now returns 403, and a correctly signed cookie
      returns 200.
- [ ] Confirm a `Range:` request through the LB returns 206 with the right bytes
      — seeking depends on it.
- [ ] Record the outcome in this file under a `### Phase 0 findings` heading. If
      the fill service account grant does not work in our project, stop and
      re-plan: the fallback is a Cloud Run range-proxy in front of the bucket,
      which is a materially different and more expensive design.
- [ ] Tear down every throwaway resource created above.

## Phase 1: Terraform — buckets, backend bucket, CDN, signing key

New module at `infra/modules/teaching-video-pipeline/`, instantiated from
`infra/main.tf` with `count = var.environment == "teaching" ? 1 : 0`, matching
how `module "cloud_storage"` is gated at `infra/main.tf:331`.

- [ ] `quill-teaching-videos-source-teaching` — raw uploads. Region
      `europe-west2`, uniform bucket-level access, public access prevention
      enforced, no versioning, lifecycle rule deleting objects after 90 days.
- [ ] `quill-teaching-videos-processed-teaching` — transcoded renditions, poster
      frames and WebVTT. Same region and access settings, versioning enabled, no
      deletion lifecycle rule.
- [ ] `google_compute_backend_bucket` over the processed bucket with
      `enable_cdn = true`, `cache_mode = "CACHE_ALL_STATIC"` and a 24-hour
      default TTL.
- [ ] `google_compute_backend_bucket_signed_url_key` on that backend bucket, key
      material generated by `random_bytes` (16 bytes, base64url) and written to
      Secret Manager as `teaching-video-signing-key` via the existing
      `infra/modules/secrets/` pattern, so the backend and the LB share one key.
- [ ] Grant the Cloud CDN fill service account `roles/storage.objectViewer` on
      the processed bucket, per Phase 0.
- [ ] Grant the Cloud Run runtime service account
      (`<project-number>-compute@developer.gserviceaccount.com`)
      `roles/storage.objectAdmin` on the **source** bucket only — it needs to
      mint resumable upload URLs there. It needs no role at all on the processed
      bucket, because signing a CDN cookie is an HMAC over a secret, not a GCP
      API call. This is a genuine reduction in blast radius versus the v4
      signed-URL approach, which requires `objectViewer` plus
      `serviceAccountTokenCreator`.
- [ ] Add a `/videos/*` path rule to the `quill-paths` path matcher in
      `infra/modules/load-balancer/main.tf`, pointing at the new backend bucket.
      Plumb it through as an optional variable so `prod` and `staging`, which
      have no video buckets, render an unchanged URL map.
- [ ] Add the new secret to the Cloud Run env mapping in `infra/main.tf:256`
      alongside `TEACHING_SYNC_TOKEN`.
- [ ] `terraform plan` against `teaching` and confirm the diff touches nothing
      outside the new module, the URL map and the Cloud Run env block. Confirm
      `plan` for `prod` and `staging` is empty.

## Phase 2: Backend — cookie minting and the access decision

New module `backend/app/features/teaching/video_access.py`, deliberately separate
from `storage.py` so the security-critical signing code can be reviewed and
tested on its own.

- [ ] Add to `backend/app/config.py`, in the existing `--- Teaching / GCS ---`
      block: `TEACHING_VIDEOS_BUCKET`, `TEACHING_VIDEOS_SOURCE_BUCKET`,
      `TEACHING_VIDEO_BASE_URL` (e.g. `https://teaching.quill-medical.com/videos`),
      `TEACHING_VIDEO_SIGNING_KEY_NAME`, `TEACHING_VIDEO_SIGNING_KEY`
      (`SecretStr`), and `TEACHING_VIDEO_COOKIE_TTL_MINUTES` defaulting to 30.
- [ ] Implement `sign_cookie(url_prefix: str, expires_at: datetime) -> str`
      producing Cloud CDN's exact format: the string
      `URLPrefix=<base64url(prefix)>:Expires=<unix>:KeyName=<name>`, then the same
      string with `:Signature=<base64url(HMAC-SHA1(key, string))>` appended. Use
      `hmac`/`hashlib` from the standard library and `base64.urlsafe_b64encode`.
      No third-party dependency.
- [ ] Implement `build_url_prefix(org_id, module_id) -> str` returning
      `{TEACHING_VIDEO_BASE_URL}/{org_id}/{module_id}/`. Validate both segments
      against the existing `_SAFE_BANK_ID` pattern in `storage.py` and raise on
      anything else — the prefix is the entire authorisation boundary, so a
      traversal here grants a learner every module in the bucket.
- [ ] Add `POST /api/teaching/modules/{module_id}/video-access` to
      `backend/app/features/teaching/router.py`. It inherits the router's
      `requires_feature("teaching")` gate, and additionally requires the
      `view_teaching_cases` competency via `has_competency`, the authenticated
      user from `_DEP_USER`, and CSRF validation (it is a POST that sets a
      cookie, so it follows the project's mutating-endpoint convention).
- [ ] In the handler: resolve `module_id` against the user's organisation
      membership, 404 if the module does not exist *for this user* rather than
      403, so the endpoint does not confirm the existence of other orgs' modules.
      Reject modules not in `live` status. Then mint the cookie for that module's
      prefix only.
- [ ] Set the response cookie `Cloud-CDN-Cookie` with `Secure`, `HttpOnly`,
      `SameSite=Lax`, `Path=/videos/`, host-only (no `Domain` attribute), and
      `max_age` matching the signature expiry. Return
      `{"base_url": ..., "expires_at": ...}` as JSON so the frontend can build
      asset URLs and schedule its refresh.
- [ ] Log the grant at INFO — `user_id`, `org_id`, `module_id`, expiry — and
      nothing else. No filenames, no PHI, and never the cookie value or key.
- [ ] Rate-limit the endpoint per user using the existing pattern, so it cannot
      be driven as a cookie-minting oracle.
- [ ] Add a `LocalVideoBackend` fallback for development: when
      `TEACHING_VIDEOS_BUCKET` is unset, return a `/static/videos` base URL and
      set no cookie, mirroring how `get_storage_backend()` already degrades to
      `LocalStorageBackend`.

## Phase 3: Content model — `<Video src>` through the pipeline

`mdx_parser.py` understands `<YouTube id="..." />` and nothing else; there is no
path for a GCS-hosted video at all today.

- [ ] Add `_extract_video()` to `backend/app/features/teaching/mdx_parser.py`,
      modelled directly on the existing `_extract_youtube()` at line 65. Parse
      `<Video src="lecture-01.mp4" duration={1080} poster="lecture-01.jpg" />`,
      returning the remaining body plus the parsed fields.
- [ ] Extend the parser's slide dataclass with `video_src`, `video_poster` and
      reuse the existing `duration_seconds`. Set `layout = "video-slide"` when
      either `youtube_id` or `video_src` is present.
- [ ] Reject slides carrying both `<YouTube>` and `<Video>` — the parent plan
      specifies exactly one, and a slide with both has no defined behaviour.
      This is the first `raise` in a module that currently discards malformed
      content silently; align it with the validating mode described in the
      [Consolidate Teaching Tooling](2026-08-30-consolidate-teaching-tooling-plan.md)
      plan rather than inventing a second error convention.
- [ ] Add the matching fields to `LearningSlideOut` in
      `backend/app/features/teaching/schemas.py`, as optional, so the API change
      is additive per the backend rules.
- [ ] Extend sync-time validation so a module referencing a `video_src` that does
      not exist in the processed bucket cannot go `live`. This is the same class
      of check as the
      [Image on GCP Check](2026-06-14-image-on-gcp-check-plan.md) plan's Phase 2
      and should reuse whatever helper that lands, rather than growing a parallel
      one.

## Phase 4: Frontend — GCS playback

- [ ] Add `video_src`, `video_poster` to the `ApiSlide` interface and
      `CompiledSlide` type in `frontend/src/features/teaching/types.ts` and map
      them in `learning-data.ts`.
- [ ] New hook `frontend/src/features/teaching/use-video-access.ts`: calls
      `POST /teaching/modules/{id}/video-access` through the `api` client (never
      raw `fetch`), holds `base_url` and `expires_at` in state, and schedules a
      silent re-fetch at expiry minus five minutes while the learner is still on
      a video slide. Clears its timer on unmount.
- [ ] Extend `VideoPlayer.tsx` — the `signedUrl` prop is already stubbed and
      documented as "V2 — not yet implemented". Rename it to `src` for accuracy
      (it is now a plain CDN URL, authorised by cookie, not a signed URL), keep
      `youtubeId` working, and add `posterUrl` and `captionsUrl`.
- [ ] Spike whether `react-player` v3 can carry a `<track>` element for WebVTT
      captions. If it cannot, render a native `<video>` for the GCS path and keep
      `react-player` for YouTube only — captions are a WCAG 2.1 AA requirement
      for the learning centre and are not negotiable. Record the outcome here;
      this is the point at which the parent plan says to evaluate Plyr.
- [ ] Wire `SlideLayoutVideo.tsx` to pass either `youtubeId` or the composed
      `src`, and show a loading state while the access call is in flight rather
      than a blank player.
- [ ] Handle the denial path visibly: if the access call fails, show an inline
      message ("This video is not available — your access may have expired. Try
      reloading the page.") rather than an empty box. Use the centralised page
      messages pattern.
- [ ] Storybook stories for the new states — YouTube, GCS with captions, loading,
      access denied — and tests alongside them, per the components rule.

## Phase 5: Admin upload

- [ ] `POST /api/admin/teaching/videos/upload-url` — admin/superadmin only.
      Returns a GCS resumable upload URL scoped to
      `source-bucket/{org_id}/{module_id}/{filename}`, with the filename
      validated against `_SAFE_BANK_ID` and an extension allowlist. This is the
      one place the backend needs real GCS credentials, and it writes only to the
      source bucket.
- [ ] `GET /api/admin/teaching/videos?module_id=` — lists filenames referenced by
      the module's compiled MDX and, for each, whether a source object and a
      processed rendition exist. Derived by listing both buckets; no new table.
- [ ] `VideoUploadPage.tsx` at `/admin/teaching/videos`, behind
      `<RequirePermission level="admin">`. A module `<Select>` scopes the page to
      one module before any upload control appears, so a file cannot be dropped
      against the wrong module. Mantine `<Dropzone>` per row, with per-file
      progress.
- [ ] Block the `draft` → `live` transition while any referenced video is missing
      or unprocessed, surfacing which ones.

## Phase 6: Transcoding and captions

Only after Phases 0–5 are shipped and a hand-encoded MP4 plays end to end.

- [ ] Cloud Run job `video-transcode` — FFmpeg image, 4 CPU, 4 GB, 60-minute
      timeout. Reads from source, writes 720p and 1080p H.264 plus a poster frame
      to the processed bucket under `{org_id}/{module_id}/`. Built on the existing
      `infra/modules/cloud-run-job/` module.
- [ ] Cloud Run job `video-caption` — Whisper-large, 4 CPU, 10 GB, 60-minute
      timeout. Writes WebVTT beside the renditions.
- [ ] Set `Cache-Control: public, max-age=86400` on every object both jobs write,
      so Cloud CDN actually caches them. Objects written without it will be
      revalidated on every request and the CDN buys us nothing.
- [ ] Trigger both from the content repo's deploy workflow, after the GCS sync
      step and before the backend sync call.
- [ ] Captions are reviewed by the content author before a module goes `live` —
      Whisper output on clinical terminology needs a human pass. Surface review
      state on the admin video page.

## Phase 7: Cutover

- [ ] Migrate one real EoEETA lecture from YouTube to GCS end to end and confirm
      playback, seeking, captions, and the resume position from parent-plan
      item 18 all behave.
- [ ] Document the video path in `docs/docs/teaching/index.md` and the storage
      architecture in `docs/docs/backend/files/index.md`.
- [ ] Amend Section 8 of the Learning Section plan to point here, and tick items
      26–30 of its Phase 3 checklist as this plan's phases complete.
- [ ] Raise a hazard-log entry for unauthorised access to licensed teaching
      content, following the existing `docs/docs/safety/hazards/` format.

## Testing

Backend tests run in Docker via `just ub`, frontend via `just uf`, per the
project testing rules.

- **Cookie signing** — Sign with a fixed key, fixed prefix and fixed expiry, and
  assert the exact output string against a value computed independently. This is
  the test that catches a subtle base64 or field-order mistake, which would
  otherwise present as a 403 at the edge with no diagnostics.

- **The access decision** — A learner without the teaching feature is refused. A
  learner without `view_teaching_cases` is refused. A learner from another
  organisation gets 404, not 403. A `draft` module is refused. A `module_id`
  containing `../`, a null byte, or a URL-encoded separator is rejected before
  any signing happens.

- **Prefix scoping** — The cookie minted for module A does not validate for
  module B's prefix. Assert this on the constructed prefix directly; it is the
  property the whole design rests on.

- **Expiry** — The cookie's `max_age` and the signature's `Expires` agree, and
  both match `TEACHING_VIDEO_COOKIE_TTL_MINUTES`.

- **Parser** — `<Video>` extracted with and without optional props; a slide with
  both `<YouTube>` and `<Video>` raises; a slide with neither keeps its existing
  layout.

- **Frontend** — `use-video-access` refreshes before expiry and not after
  unmount; `VideoPlayer` renders the YouTube path, the GCS path, and the denied
  state; `SlideLayoutVideo` passes the right props for each.

- **Manual, in the teaching environment** — Playback through the LB with a valid
  cookie; 403 with the cookie deleted; 403 on a direct `storage.googleapis.com`
  URL; seeking works; a second learner cannot replay the first learner's URL
  without the cookie.

## Open questions

- **Cookie lifetime versus lecture length** — Thirty minutes with refresh assumes
  the learner keeps the tab active. A 90-minute lecture watched with the tab
  backgrounded will have its refresh timer throttled by the browser. Options are
  a longer TTL for video slides specifically, or refreshing on the player's
  `timeupdate` rather than on a timer. Decide during Phase 4 with a real
  measurement, not in advance.

- **Whether `org_id` belongs in the prefix before multi-org lands** — The parent
  plan scopes GCS paths by `org_id` but notes the platform is single-org until
  V2. Including it now costs nothing and avoids a bucket-wide migration later,
  so this plan assumes it is included; flagging it in case the sync work in
  progress settles the org model differently.
