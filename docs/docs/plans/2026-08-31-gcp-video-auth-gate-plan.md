# GCP video auth gate plan

The learning centre currently plays video by embedding YouTube. That was the
right call for a prototype — Phase 1a of the
[Learning Section](2026-05-15-learning-section-plan.md) plan shipped
`<VideoPlayer>` with `react-player` and no backend video infrastructure at all —
but it is not where the product can stay. EoEETA lectures are recorded in
clinical settings, they are commercially licensed to the academy rather than to
the public, and "unlisted on YouTube" is a URL away from being listed. The
learning centre needs its own video, held in a private bucket, released only to
a learner the backend has already authenticated and authorised.

This plan supersedes
[**Section 8**](2026-05-15-learning-section-plan.md#8-video-hosting-infrastructure-terraform)
of the Learning Section plan, which is the existing Phase 3 for this work and
has not been started. It supersedes rather than extends it because Section 8
contains a technical error that changes the whole shape of the build. Section 8
says to put Cloud CDN in front of the processed bucket _and_ mint 8-hour GCS v4
signed URLs from the backend, on the basis that "Cloud CDN handles signed URL
validation correctly". Those are two different, mutually exclusive mechanisms:

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
  URL _prefix_, so one grant covers the poster frame, both renditions and the
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
  and the mitigation is contractual rather than technical. **[confirmed
  2026-09-09]** The EoEETA licence does not mention DRM, so this is our choice to
  make rather than a term to comply with.

- **One new database table, for media links** — **[revised 2026-09-09, replacing
  "No new database tables"]** Learning content is still compiled from MDX per
  request rather than persisted, and the access decision reads
  `QuestionBankOrgStatus`, which already exists. But media uploaded through the
  admin UI is not in the content repository, so the link between an MDX reference
  and an uploaded file has nowhere to be derived from and must be stored. That is
  one table — see **Media uploads** below — and one Alembic migration. Resume
  position is item 18 of the parent plan and stays there.

- **Media is uploaded through the admin UI, not the content repository** —
  **[added 2026-09-09]** Content reaches GCS today by `gsutil rsync` from the
  content repo's deploy workflow (`.github/scripts/teaching-pipeline/`
  `sync-to-gcs.sh`), with `lfs: true` on the checkout so image bytes rather than
  Git LFS pointers reach the bucket. That path is right for a 40 KB endoscopy
  still and wrong for a 900 MB lecture: LFS bandwidth is billed, clones become
  punishing for authors, and GitHub caps a single LFS object at 2 GB. Video
  therefore goes to a private source bucket through a resumable upload from the
  admin UI, which also survives the dropped connection that would defeat a git
  push. The cost is that video and the MDX referencing it live in two places; the
  media-link model below is what keeps them consistent.

- **Media belongs to the module, and modules are per organisation** — **[added
  2026-09-09]** Two organisations running near-identical modules each upload
  their own copy. Storage is cheap; a shared authorisation boundary is not. This
  keeps the prefix `{org_id}/{module_id}/` literally true — everything a cookie
  grants is genuinely beneath it — so the "one grant covers one module" property
  the whole design rests on survives unchanged. It also means an organisation's
  content can be removed wholesale by dropping its prefix, which matters at
  offboarding. Organisation-scoped assets with links into modules would
  deduplicate the bytes and cost exactly this property; rejected on that basis.

- **Blocked until the teaching refactor lands** — Every phase below is on hold
  until the in-flight rework of `backend/app/features/teaching/` is finished and
  the work is explicitly released. See the sequencing section below.

## Sequencing

Quill was built quickly as a proof of concept, with coding plans written
alongside LLMs and executed with little oversight of the resulting code. A
line-by-line human review of the whole repository is under way, and
`backend/app/features/teaching/` was reworked by hand as part of it.

**Status: unblocked, revised 2026-09-09.** The rework this plan was waiting on
has landed. The tooling consolidation moved the content validator into
`features/teaching/tooling/`, the bucket now mirrors the repository layout, and
per-organisation active-version pointers shipped. Nothing is holding the phases
below.

That rework also changed things this plan depended on. The revisions are marked
**[revised 2026-09-09]** where they appear; the two that alter the design rather
than a line number are summarised here. Revision 2 adds a phase — **Phase 2a**,
closing an access gap on the existing learning content endpoints, which this plan
now fixes rather than merely records.

### What changed on 2026-09-09, in one place

The plan was audited against the codebase and revised in a single session. Read
this list first; the detail is marked **[revised 2026-09-09]** where it sits.

- **Unblocked.** The teaching rework this plan waited on has landed.
- **Liveness is per organisation** via `QuestionBankOrgStatus`, not a module-level
  status column. Revision 1.
- **The learning content endpoints are ungated** and this plan now fixes them.
  New **Phase 2a**. Verified still open against `origin/main` on 2026-09-09 —
  both endpoints unchanged, both still without a database session. Revision 2.
- **Media is uploaded through the admin UI**, not committed to the content
  repository, because Git LFS is the wrong carrier for a 900 MB lecture. New
  **Media uploads** section.
- **The MDX reference is a key, not a filename** — `<Video ref="lecture-01" />`
  — and the link between key and uploaded file is stored in a new table. This
  reverses the old "no new database tables" decision.
- **Media belongs to the module**, per organisation. Two organisations with
  similar modules hold separate copies, which keeps the cookie prefix honest.
- **Phase 5 is rewritten** as a card on the module's own admin page, replacing a
  standalone upload page.
- **An incomplete module is not served to learners at all**, continuously —
  stronger than the old "block going live" check.
- **No cookie consent banner is needed**, but the cookie policy page is a
  placeholder and should be finished.
- **The EoEETA licence does not mention DRM**, so the no-DRM decision stands on
  its own merits.
- **The other teaching plans barely collide with this one** — the single real
  conflict is Phase 5 sharing `AdminBankDetailPage.tsx` with the tooling plan's
  admin UI item. New **Working alongside the other teaching plans** section.
- **Phase 0 is a Terraform spike behind a pull request**, not a `gcloud`
  exercise. Its old wording invited hand-made resources on a Terraform-managed
  load balancer. Rewritten, with the one finding already proven recorded under
  **Phase 0 findings**.

**This plan lags the codebase, and expects to.** It was written on 2026-08-31 and
revised on 2026-09-09, with roughly 288 commits in between; teaching work
continues in parallel worktrees while this sits unstarted. Assume some of what
follows has been overtaken by the time it is picked up — Phase 2a most likely of
all, since that gap is in scope elsewhere. Treat every line number as a hint
rather than a fact, and read the code before writing against it. Where a phase is
especially likely to be affected, it says so in its own header.

### Working alongside the other teaching plans

**[added 2026-09-09]** Two other plans touch the same feature and were audited
against `origin/main` at the same time as this one, to find where they actually
collide rather than where they look like they might.

- **[Platform role](2026-09-09-platform-role-plan.md) — almost no overlap.**
  Its blast radius is `system_permissions`, and the teaching router mentions
  that once, in a query filter at `router.py:1806`, nowhere near anything this
  plan writes. Teaching's admin routes already gate on
  `manage_teaching_content` via `_DEP_MANAGE` (`router.py:1474`) — the
  competency-plus-place shape that plan is driving everything else towards.
  Teaching arrived there first, so it is the destination rather than the work.
  The one live coupling is the frontend guard, handled on the Phase 5 item
  itself.

- **[Consolidate teaching
  tooling](2026-08-30-consolidate-teaching-tooling-plan.md) — one genuine
  collision, in Phase 5.** Its last open teaching item is an admin UI
  surfacing version numbers and a promote control on
  `AdminBankDetailPage.tsx`, and Phase 5 of this plan adds a media card to the
  foot of that same file. Same file, same region, both adding a card. See the
  ordering below. That plan also records hosted `<Video>` as an explicit
  follow-up scoped out of the consolidation, and names the four pieces that
  must land together — which is Phase 3 here, so the two agree on shape and
  nothing needs reconciling.

- **Both those branches are merged.** `feature/membership-and-reach-plan` and
  `feature/platform-role-plan-revisions` are empty against `origin/main`.
  Nothing is in flight but plan text, so "the other worktree" is not currently
  holding code this plan has to wait for.

#### Ordering that keeps the collisions apart

- **Phase 0 first, whatever else is happening.** It touches no application
  code and conflicts with nothing, and it is the item that can invalidate the
  design — everything after it is wasted effort until the private-bucket
  origin is proven.

- **Phase 2a next, as its own pull request.** Its value does not depend on
  video: it closes a live cross-organisation read on shipped endpoints. It is
  backend-only, touches neither `AdminBankDetailPage.tsx` nor
  `system_permissions`, and it creates the shared membership helper the
  platform role plan's admin batch will want. Landing it early means that work
  builds on it rather than beside it.

- **Phases 1–4 are mostly new files** — the Terraform module,
  `video_access.py`, `use-video-access.ts` — so they conflict with little. The
  edits to existing files are small and surgical: one URL map path rule, one
  config block, one route, and moving `Video` between two lists in
  `mdx_parser.py`.

- **Phase 5 waits for the tooling plan's admin UI item, or ships with it.**
  Take the second: one developer, one file, and the coordination cost of
  splitting the two cards exceeds the merge cost of writing them together. If
  they are split, the promote control goes first — it is a single item
  depending on no unanswered question, and its endpoint has been in use through
  the API for a while.

- **Phases 6 and 7 are unaffected** by any of the above.

### Revision 1: liveness is per organisation, and versions are promoted

When this plan was written a module was one thing with one status. It is now
`QuestionBankOrgStatus` (`backend/app/features/teaching/models.py:275`), which
carries `is_live` **per organisation** and an `active_version` pointer an org
admin advances deliberately. Two consequences:

- **"Reject modules not in `live` status" no longer describes anything.** There
  is no module-level status column to read. The Phase 2 handler resolves the
  caller's organisation, loads that org's `QuestionBankOrgStatus` row for the
  bank, and refuses when the row is missing or `is_live` is false.

- **The URL prefix carries no version segment, deliberately.** Learning content
  is not versioned in the bucket: `learning_prefix()` resolves to
  `modules/<id>/learning/` and `get_learning_content` downloads it without ever
  consulting `active_version`. Only assessment items are versioned, in the
  database. So one video per module is correct today, and
  `{base}/{org_id}/{module_id}/` is sound. **This is a live assumption, not a
  fact of the design** — the day learning content becomes versioned, the prefix
  gains a version segment and every cookie minted against the old shape stops
  matching. Anyone versioning learning content should read this paragraph first.

### Revision 2: the learning content endpoints are ungated, and get fixed here

**The rule.** A user may access learning materials only for the organisations
they belong to, whether directly or through a site. This is not new policy — it
is what the assessment routes already enforce — but the learning routes never
implemented it.

`get_learning_content` (`router.py:397`) takes `module_id` and `_DEP_USER` and
nothing else. It does not even take a database session, so it cannot check
membership as written. `list_learning_modules` (`router.py:477`) has the same
shape and will enumerate every module in the bucket. The only gate on either is
the router-level `requires_feature("teaching")`, so any authenticated user in a
teaching-enabled organisation can read any module's slides by guessing its ID,
including modules their organisation never licensed.

**Decision (2026-09-09): fix both endpoints as part of this plan**, rather than
shipping video behind three checks while the slides describing it stay open.
Phase 2a below covers it. It is a behaviour change to shipped endpoints, so it is
called out rather than folded in silently.

**It may already be done by the time this plan runs.** The same gap is in scope
for teaching work in a separate worktree, which is moving faster than this plan.
Phase 2a is therefore written to be verified before it is built — the header of
that phase says how. What this plan actually depends on is not the fix being made
here; it is that **one** membership helper serves both the content endpoints and
`video-access`, whoever writes it. Two independent copies of that query is the
failure this is guarding against, because they will drift and the looser one will
be the one nobody notices.

**How membership resolves.** `_get_user_org_ids(user, db)` (`router.py:112`)
already implements exactly the required rule: direct membership via
`organisation_staff_member`, unioned with indirect membership via
`site_member` joined through `organisation_site`. It raises 403 when a user
belongs to nothing. Reuse it; do not write a second resolver.

**Use the plural, not the singular.** `_get_user_org_id` (`router.py:146`)
returns `_get_user_org_ids(...)[0]`, and that list is built from a Python `set`,
so "first" is arbitrary and can differ between calls for a user in more than one
organisation. Every learner-facing route already uses the plural form with an
`IN` clause — see `router.py:222` and `router.py:336` — and treats a bank as
visible when **any** of the user's organisations has it live, taking the highest
version any of them promoted. Follow that same permissive union for learning
content and video. The singular helper is for admin routes acting within one
organisation and is the wrong tool here.

## Media uploads

**[added 2026-09-09]** How a lecture gets from someone's laptop into the bucket,
and how a slide finds it. Video is the only medium in scope now; the model is
written so assessment media can join it without a second implementation.

### The MDX reference is a key, not a filename

`<Video ref="lecture-01" />` names _which_ video belongs on this slide. It is not
a path and it is not the uploaded file's name. The admin uploads whatever file
they have — `EoEETA_Colonoscopy_FINAL_v3.mp4`, complete with its awkward name —
and links it to the key.

Separating the two is what makes the rest work:

- **Order stops mattering.** The file can be uploaded before the MDX exists, or
  the MDX merged before the file arrives.
- **Renames stop breaking things.** Changing the file's display name, or the key
  in the repository, does not orphan a working video, because the link is stored
  rather than inferred from a string match.
- **Re-pointing is not re-uploading.** Aiming a slide at a different video
  already in the module is a dropdown, not 900 MB over the wire again.

A filename match would have made the admin's job "produce a file with exactly
this name", so a typo in the MDX could only be fixed by a pull request even with
the correct file sitting in the bucket.

### Storage and naming

Objects are keyed by generated id, never by the uploaded filename:

```
processed-bucket/{org_id}/{module_id}/{asset_id}.mp4
```

Collisions become impossible, upload naming becomes irrelevant, and a filename
carrying a patient identifier never reaches a URL. The original filename is kept
as a column and shown in the admin UI so the uploader recognises their own file.

### The link table

One table, one migration. Roughly: organisation id, module id, the MDX key, the
asset id, the original filename, the content type, the byte size, who uploaded it
and when. Unique on (organisation, module, key) — one video per reference.

It is **per organisation**, which follows from media belonging to the module. The
same MDX resolves to org A's upload for A's learners and B's for B's. So "is this
module complete" has no global answer, only a per-organisation one — the same
shape `QuestionBankOrgStatus` already established for liveness.

### When the MDX changes underneath a link

- **A key is added** — an unlinked reference. The admin card lists it as needing
  an upload; the module is incomplete until it has one.
- **A key is removed** — drop the link, keep the asset, and show it in the card
  as unattached. Never delete an uploaded file because a pull request stopped
  referring to it: that is someone's 900 MB, and the reference may return.
- **A key is renamed** — indistinguishable from one removed and one added, so the
  link breaks and the admin re-links. Guessing at intent here would be worse than
  the small annoyance of re-linking.

### One function, three callers

"Which media does this module reference, and which of those are present?" is
asked in three places and must be answered by one function, or the answers will
drift:

- the **admin card**, which lists what is missing and offers an upload
- the **learner gate**, which makes an incomplete module unavailable
- the **merge gate**, which warns when a pull request references media nothing
  has uploaded

`tooling/validate.py` already solves the same shape for images: `ImageInventory`
(`validate.py:82`) is a "what actually exists" map supplied when content lives in
GCS and images are therefore not on disk. Build the media equivalent on that
pattern rather than inventing a parallel one.

**Unverified.** Whether the validator can list the source bucket at merge time is
a credentials question nobody has checked. The admin card and the learner gate
work regardless; the merge gate is a later addition if it turns out the
permissions are not there.

## Phase 0: Spike — private bucket behind a backend bucket

The one unknown that could invalidate the design. The existing backend bucket in
this repo fronts the _landing site_, which is granted `allUsers` read at
`infra/modules/load-balancer/main.tf:178`. A backend bucket historically required
a public bucket, which would defeat the entire purpose here. Google now supports
private-bucket origins for backend buckets via a Cloud CDN fill service account,
but this must be proven in our project before Terraform is written around it.

**[rewritten 2026-09-09] The spike is Terraform behind a pull request, not
`gcloud` by hand.** The earlier wording ("create a throwaway bucket", "attach
it", "tear down every throwaway resource") read as a console-and-CLI exercise,
and following it literally is a mistake this plan should not invite:

- **It bypasses the review gate.** `.github/workflows/terraform.yml` runs
  `terraform plan` on every pull request touching `infra/**` and posts the
  output as a comment, then applies on merge to `main`. A hand-made resource
  reaches GCP without that plan ever being seen.
- **It creates drift by construction.** `quill-url-map-teaching` is
  Terraform-managed with remote state in `gs://quill-medical-terraform-state`.
  Hand-editing a resource Terraform owns leaves the next `apply` to fight it.
- **Tear-down stops being enforceable.** "Remove what you made" is a promise
  when the resources are hand-made and a `terraform apply` when they are not.

So the spike is written as a real module, gated off by default, and both its
creation and its removal go through a pull request. The probes are the only part
run by hand, and they are read-only `curl` calls against what was applied.

### Building it

- [x] New module at `infra/modules/teaching-video-spike/`, instantiated from
      `infra/main.tf` gated on **both** `var.environment == "teaching"` and a new
      `var.enable_video_spike` defaulting to `false`, so the spike is inert until
      deliberately switched on and cannot be left running by inattention.
- [x] Private bucket: `europe-west2`, uniform bucket-level access, public access
      prevention **enforced**, `force_destroy = true` so the revert can actually
      remove it.
- [x] `google_compute_backend_bucket` over it with `enable_cdn = true` and
      `cache_mode = "CACHE_ALL_STATIC"`.
- [x] `google_storage_bucket_iam_member` granting `roles/storage.objectViewer`
      to `service-<project-number>@cloud-cdn-fill.iam.gserviceaccount.com`. This
      is the line the whole spike exists to test.
- [x] `google_compute_backend_bucket_signed_url_key` on the backend bucket, key
      material from `random_bytes`, so the unsigned-versus-signed probe has
      something to check.
- [x] A `/videospike/*` path rule on the existing `quill-paths` matcher, plumbed
      through `infra/modules/load-balancer/` as an optional variable so `prod` and
      `staging` render an unchanged URL map. An obscure path no real traffic hits.
- [x] Output the bucket name, the signing key name and the key material (marked
      `sensitive`) so the probes can be run without reading state by hand.
      In practice the key was read from state, because module outputs are not
      surfaced at the root module — a root-level output would be needed to make
      `terraform output` work as intended here.
- [x] **[added during the build]** Enable `networkservices.googleapis.com` and
      wait for the fill service agent before granting; wait again before the URL
      map references the backend bucket. Neither was foreseen — both came out of
      the first failed apply.

### Getting it applied

- [x] Open the pull request and **read the posted plan before approving it**.
      Confirm it creates only the resources above and modifies only the URL map,
      and that the URL map diff is an addition rather than a replacement.
- [x] A human merges it. Merging is what applies it — see the repository rule.
- [x] Upload one small object to the bucket. A real MP4 is not needed: a file
      whose every 16-byte block encodes its own offset lets a `Range` response be
      checked for returning the **right bytes** rather than merely a 206. Set
      `Content-Type: video/mp4` and `Cache-Control: public, max-age=86400`, the
      latter because Phase 6 depends on the CDN actually caching.

### The probes

Read-only, run by hand against what was applied. Record each result.

- [x] Unauthenticated `https://storage.googleapis.com/<bucket>/<object>` returns
      **403**. **[confirmed 2026-09-09]**
- [x] A request through the LB returns the object, proving the fill service
      account grant works. **This is the item the phase exists for**, and it
      passed. Note the request must be _signed_, since attaching the key makes
      the edge reject unsigned ones — the plan's original wording said
      "unauthenticated", which is only true before the key exists.
- [x] With the signing key attached, an unsigned request through the LB returns
      **403** and a correctly signed cookie returns **200**. A cookie signed with
      the wrong key also returns 403.
- [x] A `Range:` request through the LB returns **206**, and the returned bytes
      carry the offset markers expected for that range — seeking depends on it.

### Closing it out

- [x] Record the outcome under `### Phase 0 findings` below. If the fill service
      account grant does not work, stop and re-plan: the fallback is a Cloud Run
      range-proxy in front of the bucket, a materially different and more
      expensive design.
- [ ] Tear down by **reverting the module in a second pull request**, so removal
      passes the same gate as creation and leaves no drift. Confirm the follow-up
      plan is empty.

### Phase 0 findings

**Run 2026-09-09. The apply failed, and that failure is the finding.** Four of
the five resources were created; the IAM grant and the URL map update both
errored, so the probes never ran. Nothing about the design is disproven — the
spike stopped one step earlier than expected, on something the plan did not
anticipate needing.

- **Public access prevention is available and works.** A bucket in
  `quill-medical-teaching` with uniform bucket-level access and public access
  prevention `enforced` returns **403** to an unauthenticated
  `storage.googleapis.com` request.

- **The Cloud CDN fill service account does not exist in this project.** The
  grant failed with `Service account
  service-113172935409@cloud-cdn-fill.iam.gserviceaccount.com does not exist`.
  It is a Google-managed service agent, created when the service that owns it is
  first enabled, and `networkservices.googleapis.com` is **not** among this
  project's enabled services — only `compute.googleapis.com` is. So this is
  very likely a missing API rather than a capability we lack, and the next
  attempt should enable that service (and add it to Terraform) before granting.
  **Not yet confirmed** — this is the reading of the error, not a tested fix.

- **A backend bucket cannot be attached to a URL map before it is ready.** The
  URL map update failed with `The resource '...backendBuckets/
  quill-video-spike-teaching' is not ready, resourceNotReady`, even though
  Terraform reported the backend bucket created 30 seconds earlier. Backend
  buckets take time to become referenceable, and Terraform's dependency graph
  does not model that wait. A re-run is the simplest fix; an explicit
  `time_sleep` between creation and reference is the deterministic one.

- **The failure was safe, by luck as much as design.** The URL map update
  errored before applying, so `/api/*` kept routing and
  `teaching.quill-medical.com` stayed up throughout — verified by request during
  the failed apply. Had it succeeded it would have **taken the API down**: the
  static `path_rule` and the `dynamic "path_rule"` block cannot coexist in one
  `path_matcher`, and the plan showed the `/api/*` rule going to `null`. That
  bug is real and must be fixed before the next attempt, whatever else changes.

- **Left behind by the partial apply**, and still present: the bucket, the
  backend bucket, its signed-URL key and the `random_bytes`. They are in state,
  so the revert removes them; nothing needs hand-deleting.

- **The load balancer half remains unproven.** Whether Cloud CDN can serve a
  private bucket through the LB — the question the whole phase exists to answer
  — is still open.

**Fixes applied for the second attempt**, all three in one change:

- **The `path_rule` bug** — both rules now render from one `dynamic` block over
  a concatenated list, so `/api/*` is always present and the spike entry is
  appended only when its variable is set.
- **`networkservices.googleapis.com` is enabled** by the spike module, with a
  60-second wait before the grant so the service agent has time to appear. This
  is the repository's only `google_project_service`; APIs are otherwise enabled
  by hand, and that inconsistency wants settling if the spike graduates into
  Phase 1.
- **A 60-second wait between the backend bucket and the URL map**, consumed
  through the output the URL map reads, so `resourceNotReady` cannot recur.

Both waits are guesses at how long a Google-managed resource takes to settle. If
either error returns, the wait is too short rather than the approach wrong.

### Phase 0 result: the design works

**Second apply, 2026-09-09. All four probes pass. The design in this plan is
sound and Phase 1 can be written against it.** Every fix held: the API enabling
made the service agent appear, both waits were long enough, and the URL map
gained `/videospike/*` while keeping `/api/*` — confirmed on the live map, not
just in the plan output.

- **Cloud CDN serves a private bucket. This was the open question.** With public
  access prevention `enforced`, an unauthenticated `storage.googleapis.com`
  request returns **403**, while a correctly signed request through the load
  balancer returns **200** and the full object. The fill service account grant
  is what bridges them, and it works in this project. No Cloud Run range-proxy
  fallback is needed.

- **The signed-cookie gate holds.** Unsigned through the LB: **403**. A cookie
  signed with the wrong key: **403**. Correctly signed: **200**. So the edge is
  genuinely validating the HMAC rather than merely checking a cookie is present,
  which is the property the auth gate depends on.

- **Our cookie format is right.** `sign_cookie` as specified in Phase 2 —
  base64url HMAC-SHA1 over
  `URLPrefix=<b64url>:Expires=<unix>:KeyName=<name>` — was accepted first
  time by the edge. Phase 2 can be implemented against this format with
  confidence.

- **Range requests work.** `Range: bytes=1024-1039` returns **206** with
  `content-range: bytes 1024-1039/1048576` and the payload `000000000001024` —
  the correct bytes for that offset, not merely a 206. Seeking will work.

- **The backend bucket does not strip the URL path prefix.** A request to
  `/videospike/spike.mp4` asks the bucket for the object key
  `videospike/spike.mp4`, not `spike.mp4`, and returns `NoSuchKey` otherwise.
  **This matters for Phase 1**: the LB path and the object prefix must agree, so
  serving `/videos/{org_id}/{module_id}/…` means storing objects under that same
  `{org_id}/{module_id}/…` key — which the plan already specifies. Worth knowing
  that it is a requirement rather than a convention, since a mismatch presents as
  a 404 on a file that is plainly in the bucket.

## Phase 1: Terraform — buckets, backend bucket, CDN, signing key

New module at `infra/modules/teaching-video-pipeline/`, instantiated from
`infra/main.tf` with `count = var.environment == "teaching" ? 1 : 0`, matching
how `module "cloud_storage"` is gated at `infra/main.tf:367`.

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
- [ ] Add the new secret to the Cloud Run env mapping in `infra/main.tf:292`
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
      `{TEACHING_VIDEO_BASE_URL}/{org_id}/{module_id}/`. **[revised 2026-09-09]**
      Validate `module_id` against the existing `_SAFE_BANK_ID` pattern in
      `storage.py` (`^[a-zA-Z0-9_-]+$`) and raise on anything else. `org_id` is an
      integer primary key on `organisations`, not a slug — take it as `int` and
      reject anything non-positive, rather than reusing `_SAFE_BANK_ID`, which
      would accept `-1` and `0`. The prefix is the entire authorisation boundary,
      so a traversal here grants a learner every module in the bucket.
- [ ] Add `POST /api/teaching/modules/{module_id}/video-access` to
      `backend/app/features/teaching/router.py`. It inherits the router's
      `requires_feature("teaching")` gate, and additionally requires the
      `view_teaching_cases` competency via `has_competency` and the authenticated
      user from `_DEP_USER`. **[revised 2026-09-09]** On CSRF: the project rule
      says mutating endpoints validate it, but no route in `teaching/router.py`
      does — its ten existing POSTs and PUTs all omit `DEP_REQUIRE_CSRF`
      (`main.py:704`). Adding it here is correct and this endpoint should carry
      it, but it makes this the first CSRF-protected route in the router, so the
      frontend `api` client must be sending `X-CSRF-Token` on the call. Confirm
      that before assuming the 403s are a signing bug.
- [ ] In the handler **[revised 2026-09-09 — see Revisions 1 and 2]**: call
      `resolve_visible_module(user, db, module_id)` from Phase 2a. It resolves the
      user's organisations via direct **and** site membership, checks
      `QuestionBankOrgStatus` for those organisations, and returns the
      organisation id that makes the module visible or raises 404. There is no
      module-level `status` column to check — liveness is per organisation, and
      **every refusal is a 404**, so the endpoint never confirms the existence of
      another organisation's modules. Mint the cookie for that module's prefix
      only, using the organisation id the helper returned.
- [ ] Do not re-implement the membership query here. One helper serves both this
      endpoint and the content endpoints, which is the whole point of Phase 2a —
      the video gate and the content gate must not be able to drift apart.
- [ ] Ignore `active_version` when minting. Learning content is unversioned in
      the bucket, so there is one video per module and the pointer is not part of
      this decision. If that ever changes, Revision 1 says what breaks.
- [ ] Set the response cookie `Cloud-CDN-Cookie` with `Secure`, `HttpOnly`,
      `SameSite=Lax`, `Path=/videos/`, host-only (no `Domain` attribute), and
      `max_age` matching the signature expiry. Return
      `{"base_url": ..., "expires_at": ...}` as JSON so the frontend can build
      asset URLs and schedule its refresh.
- [ ] Log the grant at INFO — `user_id`, `org_id`, `module_id`, expiry — and
      nothing else. No filenames, no PHI, and never the cookie value or key.
- [ ] **[added 2026-09-09] No cookie consent banner, but the cookie policy needs
      finishing.** Under UK PECR, consent is not required for a cookie strictly
      necessary to deliver a service the user explicitly requested. A cookie that
      exists solely to release a lecture to a learner who clicked play is squarely
      that, and is the same category as the three cookies already set at
      `main.py:512` — `access_token`, the refresh token and the CSRF token.
      Offering a reject button would be dishonest, since refusing it means no
      video. Transparency is still owed, and
      `frontend/public_pages/src/pages/cookie-policy.tsx` is currently a
      placeholder saying the policy is "being finalised". List all four cookies
      there with purpose and lifetime. This is worth doing regardless of this
      plan — it is a published promise on the marketing site that has not been
      kept — but shipping a fourth cookie is the point at which it stops being
      deferrable. Note the current analytics is log-derived from load balancer
      `httpRequest` records and sets nothing on a device, which is why no banner
      has been needed so far; a client-side analytics tag would change that.
- [ ] Rate-limit the endpoint so it cannot be driven as a cookie-minting oracle.
      **[revised 2026-09-09]** The existing pattern is SlowAPI: `from
      app.rate_limit import limiter`, then `@limiter.limit("10/minute")` on the
      route, as at `main.py:708` and `main.py:898`. It keys on the client address
      and needs `request: Request` in the signature. No teaching route is
      currently rate-limited, so this is the first — check the decorator ordering
      against the `main.py` examples, which put `@limiter.limit` below the route
      decorator.
- [ ] Add a `LocalVideoBackend` fallback for development: when
      `TEACHING_VIDEOS_BUCKET` is unset, return a `/api/teaching/videos` base URL
      and set no cookie. Note the base URL is **not** `/static/videos` — there is
      no static mount in this app. The `LocalStorageBackend("/static")` fallback
      at `storage.py:139` is dead: dev sets `TEACHING_IMAGES_BASE_URL` to
      `/api/teaching/images` in `compose.dev.yml`, and the files are served by a
      conditional FastAPI route (`main.py:5820`), not by a static mount. Video
      follows that route convention, which also inherits the dev Caddy `/api/*`
      proxy rule for free.
- [ ] Mount the matching conditional dev route. **[revised 2026-09-09]** Copy
      `_serve_learning_image` (`main.py:5901`) exactly — it is the closest
      template and already does everything needed: same `if` guard, same
      `".." in part or "/" in part` component check, same extension allow-list,
      same `resolve_module_dir` call, same `FileResponse` with a guessed media
      type. Register it as `/api/teaching/videos/{module_id}/{filename}` to match
      that route's shape, and widen the allow-list to `.mp4`, `.jpg`, `.webp` and
      `.vtt`. Starlette's `FileResponse` honours `Range`, so seeking works
      locally without extra work.
- [ ] Serve from the module's `learning/` directory, so a test video lives at
      `teaching-repos/<repo>/modules/<module_id>/learning/lecture-01.mp4`,
      alongside the `content.mdx` whose `<Video ref="lecture-01" />`
      references it. Note `_serve_learning_image` resolves to
      `module_dir / "learning" / "images" / filename` — video sits one level up,
      directly in `learning/`, because that is where the author writes it.
      `teaching-repos/` is a gitignored bind mount (`compose.dev.yml:28`), so test
      media never enters the repository — which also means a developer with no
      content repo cloned sees the module simply not resolve, not a crash.
- [ ] Keep the frontend blind to the difference: it consumes `base_url` from the
      endpoint response and never branches on environment. "No cookie was set" is
      the normal dev response, not an error, so the same code path runs
      everywhere.

## Phase 2a: Close the learning content gate

**[added 2026-09-09]** Per Revision 2. This lands before Phase 4, so the frontend
is never written against endpoints whose contract is about to change. It is a
behaviour change to two shipped endpoints: a user who today reads a module their
organisation does not have will get a 404 afterwards. That is the intended
correction, not a regression.

> **Checked on 2026-09-09 against `origin/main`: still needed, and unchanged.**
> The hedge below anticipated this being fixed first in the parallel teaching
> worktree. It was not. Both endpoints are exactly as described — the line
> numbers are still exact, and both still take only `user: User = _DEP_USER`
> with no database session, so neither can check membership as written. Build
> this phase.
>
> **Re-check anyway if time has passed since 2026-09-09**, because the reason
> the hedge existed has not gone away — the same gap remains in scope for
> teaching work on a faster clock than this plan. Read `get_learning_content`
> and `list_learning_modules` on current `main` first. Three outcomes, and only
> the last needs thought:
>
> - **Already fixed, same shape** — tick these items off and move on. Phase 2's
>   only requirement is that `video-access` calls whatever helper exists rather
>   than growing its own copy of the query.
> - **Partly fixed** — close the remainder. The audit item below is the one most
>   likely to be left over, since it is easy to fix the two obvious endpoints and
>   miss their siblings.
> - **Fixed differently** — take the shape that landed, and change Phase 2 to
>   match it. The requirement that matters is one shared helper across the video
>   gate and the content gate, not the particular name or signature written
>   below. If the other branch resolved organisations differently, that is the
>   version to follow; do not reintroduce this one alongside it.

- [ ] Write `resolve_visible_module(user, db, module_id) -> int` in
      `video_access.py`, or beside `_get_user_org_ids` if it reads better there.
      It calls `_get_user_org_ids(user, db)`, looks up `QuestionBankOrgStatus`
      rows for those organisations and this `module_id`, and returns the
      organisation id that makes it visible. Raise 404 — never 403 — when no row
      matches or none is `is_live`, so "not yours" and "not live" and "does not
      exist" are indistinguishable from outside. Follow the permissive union at
      `router.py:336`: visible if **any** of the user's organisations has it live.
- [ ] Add `view_teaching_cases` and a database session to `get_learning_content`
      (`router.py:397`), and call the helper before any bucket or filesystem
      read. Today it takes no `db` at all, so this changes its signature.
- [ ] Gate `list_learning_modules` (`router.py:477`) the same way, but filter
      rather than raise: return only modules visible to the user's organisations.
      An empty list is the correct answer for a user with no live modules, not an
      error.
- [ ] Audit the sibling learning routes in the same pass — anything reading
      `has_learning_content`, module cover images or learning images by
      `module_id` has the same exposure and the same fix. `router.py:268` and
      `router.py:382` are the starting points.
- [ ] Have Phase 2's `video-access` endpoint call this same helper, so the video
      gate and the content gate cannot drift apart. This is the reason the helper
      is written here rather than inline.
- [ ] Tests: a user whose organisation has the module live gets slides; a user in
      a different organisation gets 404; a user whose organisation has the module
      but not live gets 404; a user reaching the organisation only through a site
      gets slides, which is the case `_get_user_org_ids` exists to serve; a user
      in two organisations where only one has it live gets slides. That last one
      is why the plural helper is mandatory.
- [ ] Check the frontend handles a 404 from these endpoints as "not available to
      you" rather than a crash or an empty page, and that the learning module
      list copes with an empty array.

## Phase 3: Content model — `<Video ref>` through the pipeline

**[revised 2026-09-09]** `mdx_parser.py` understands `<Callout>`, `<YouTube>` and
`<Figure>`, and it already knows about `<Video>` — as a name it explicitly
refuses. `NOT_YET_SUPPORTED` at `mdx_parser.py:29` carries a single entry for
`Video` whose message says hosted video is not implemented and to use `<YouTube>`
until it lands, with a note that the extractor, `ParsedSlide` and the frontend
must all land together before the name moves. This phase is that landing. The
work is to move `Video` from `NOT_YET_SUPPORTED` into `KNOWN_COMPONENTS`, not to
introduce an unknown component.

- [ ] Add `VIDEO_PATTERN` beside `YOUTUBE_PATTERN` and `FIGURE_PATTERN`
      (`mdx_parser.py:40`), matching `<Video ref="lecture-01" />` with optional
      `duration`. **[revised 2026-09-09]** The prop is `ref`, a stable key, not
      `src`, a filename — see **Media uploads**. There is no `poster` prop
      either: the poster is another asset of the same reference, produced by
      Phase 6's transcode job, so the author names one thing and gets the whole
      set. The existing patterns are `re.fullmatch`ed in `_check_component`, so a
      tag carrying props the extractor cannot read fails validation rather than
      being silently dropped — the new pattern must be written to the same
      standard.
- [ ] Add `_extract_video()`, modelled directly on `_extract_youtube()` at
      `mdx_parser.py:99`, returning the remaining body plus the parsed fields.
- [ ] Extend `ParsedSlide` (`mdx_parser.py:54`) with `video_ref`, reusing the
      existing `duration_seconds`. Set `layout = "video-slide"` when either
      `youtube_id` or `video_ref` is present. The poster and captions are not
      parser concerns — they are resolved from the link at request time.
- [ ] Move `Video` out of `NOT_YET_SUPPORTED` and into `KNOWN_COMPONENTS`, and
      add its prop checks to `_check_component` (`mdx_parser.py:161`) alongside
      the `YouTube` and `Figure` cases — `ref` required, `duration` optional.
- [ ] Reject slides carrying both `<YouTube>` and `<Video>`. **[revised
      2026-09-09]** The plan previously worried this would be "the first `raise`
      in a module that discards malformed content silently". That is no longer
      the situation: `validate_mdx()` (`mdx_parser.py:210`) now returns a list of
      human-readable error strings and is wired into the content validator
      (`tooling/validate.py:998`) and the merge gate. Add the both-tags check
      there, as another error string. No new error convention, and no `raise`.
- [ ] Add the resolved media fields to `LearningSlideOut` in
      `backend/app/features/teaching/schemas.py:44`, as optional, so the API
      change is additive per the backend rules. **[revised 2026-09-09]** The
      endpoint returns what the player needs — the asset's filename under the
      module prefix, its poster and its captions — resolved from the link, not
      the raw `ref`. The frontend should never see a key it has to resolve
      itself. Note the
      existing naming split: `ParsedSlide` calls the figure fields `figure_*`
      while `LearningSlideOut` exposes them as `image_*`. Follow that convention
      rather than breaking it — `video_*` on both sides, since there is no
      pre-existing alias to preserve, but do not let the inconsistency surprise
      you when mapping between the two.
- [ ] Extend validation so a module referencing a `video_src` that does not exist
      in the processed bucket cannot be promoted. **[revised 2026-09-09]** The
      helper this was waiting on has landed: `tooling/validate.py` now validates
      content whose images live in GCS rather than on disk, and runs at both the
      merge gate and sync. Extend that, rather than the
      [Image on GCP Check](2026-06-14-image-on-gcp-check-plan.md) plan's Phase 2,
      which this superseded. `_validate_image_bytes` (`tooling/validate.py:230`)
      is the closest existing shape.

## Phase 4: Frontend — GCS playback

- [ ] Add the resolved media fields to the `ApiSlide` interface and
      `CompiledSlide` type, and map them in `toCompiledSlide`. **[revised
      2026-09-09]** These carry resolved filenames from the link, not the MDX
      `ref` — the frontend composes URLs from `base_url` plus what the API gave
      it, and never resolves a key.
      **[revised 2026-09-09]** These live in two different files: `CompiledSlide`
      is exported from `frontend/src/features/teaching/types.ts:288`, but
      `ApiSlide` is a private interface inside
      `frontend/src/features/teaching/learning-data.ts:38`, with the mapping at
      `toCompiledSlide` (`learning-data.ts:54`). The plan previously placed both
      in `types.ts`.
- [ ] New hook `frontend/src/features/teaching/use-video-access.ts`: calls
      `POST /teaching/modules/{id}/video-access` through the `api` client (never
      raw `fetch`), holds `base_url` and `expires_at` in state, and schedules a
      silent re-fetch at expiry minus five minutes while the learner is still on
      a video slide. Clears its timer on unmount.
- [ ] Extend `VideoPlayer.tsx` — the `signedUrl` prop is already stubbed and
      documented as "V2 — not yet implemented". Rename it to `src` for accuracy
      (it is now a plain CDN URL, authorised by cookie, not a signed URL), keep
      `youtubeId` working, and add `posterUrl` and `captionsUrl`.
- [ ] Spike whether `react-player` can carry a `<track>` element for WebVTT
      captions. **[revised 2026-09-09]** Still genuinely open — `package.json`
      pins `react-player: ^3.4.0`, so this is unchanged since the plan was
      written and no newer major has settled it. If it cannot, render a native
      `<video>` for the GCS path and keep `react-player` for YouTube only —
      captions are a WCAG 2.1 AA (Web Content Accessibility Guidelines)
      requirement for the learning centre and are not negotiable. Record the
      outcome here; this is the point at which the parent plan says to evaluate
      Plyr.
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

**[rewritten 2026-09-09]** The earlier version of this phase put a standalone
`/admin/teaching/videos` page behind a module `<Select>`. That is replaced by a
card on the module's own admin detail page, where the admin already is and the
module is unambiguous — no dropdown to pick the wrong module from.

### The card

It goes at the foot of `AdminBankDetailPage.tsx`
(`frontend/src/pages/admin/teaching/`), below the existing cards, following the
"Email templates" card at line 143 which is likewise rendered only when the
content calls for it.

- [ ] Render the card **only when the module's content references media**. A
      module of pure text never shows it. Whether media is needed is derived from
      the MDX references, never from a flag: a boolean an author sets is a second
      source of truth that can disagree with the content, and needs maintaining
      by hand in a file nobody reopens.
- [ ] One row per MDX reference, showing the key, and either the linked file —
      original filename, size, when it was uploaded — or that nothing is linked
      yet.
- [ ] Also list uploaded assets with no matching key, as unattached. This is what
      a renamed or removed reference leaves behind, and without a row they are
      invisible bytes nobody can reach or remove.
- [ ] Upload per row via Mantine `<Dropzone>` with per-file progress, straight to
      the resumable URL. A lecture is large enough that a progress bar is not
      decoration.
- [ ] Delete, then upload again, is the flow for replacing a file. No separate
      replace action. Deleting cannot leave a learner with a broken slide,
      because an incomplete module is not served at all — the availability gate
      below is what makes plain delete safe here.
- [ ] Where the module is live for one or more organisations, say so in the
      delete confirmation, naming them: "this will make the module unavailable to
      learners in `<organisation>` until a replacement is uploaded." A warning, not
      a block. The admin cannot otherwise see that consequence from this page.
- [ ] No route guard of its own. **[revised 2026-09-09]** The card needs one,
      but it already has one: the whole `/admin` subtree sits under a single
      `<RequirePermission level="admin">` wrapper at
      `frontend/src/main.tsx:280`, and `AdminBankDetailPage` is inside it.
      Adding a second guard on the card would be redundant now and actively
      wrong later — the platform role plan (`2026-09-09-platform-role-plan.md`)
      deletes `RequirePermission` entirely, and a card that inherits the subtree
      guard needs no edit when it goes, while one declaring its own does. If
      that plan has landed by the time this is built, confirm what replaced the
      subtree wrapper and inherit that instead; do not reintroduce a per-card
      guard.
- [ ] Storybook stories and tests per the components rule: all linked, some
      missing, unattached assets present, upload in progress, delete
      confirmation with and without live organisations.

### The endpoints

- [ ] `POST /api/admin/teaching/modules/{module_id}/media/upload-url` —
      admin/superadmin. Returns a GCS resumable upload URL for
      `source-bucket/{org_id}/{module_id}/{asset_id}`, the asset id generated
      server-side. The uploaded filename never reaches the object path, so it
      needs no `_SAFE_BANK_ID` validation — but keep an extension and
      content-type allow-list, and record the original name as data. This is the
      one place the backend needs real GCS write credentials, and it writes only
      to the source bucket.
- [ ] `GET /api/admin/teaching/modules/{module_id}/media` — the card's data.
      Returns every MDX reference with its link if any, plus unattached assets.
      Built on the shared "which media, and which present" function from
      **Media uploads**, not a second query.
- [ ] `POST .../media/{key}/link` and `DELETE .../media/{key}/link` — attach an
      uploaded asset to a reference, and detach it. Detaching keeps the asset.
- [ ] `DELETE .../media/{asset_id}` — remove an uploaded asset and its link.
      This is the destructive one: confirm in the UI, log it with actor and
      module, and refuse when the caller's organisation does not own the asset.

### Availability gate

- [ ] **A module with any unlinked media reference is not served to learners**,
      continuously — not only at the moment it goes live. The earlier version
      blocked the `draft` → `live` transition, which misses the case where a
      module goes live complete and a video is deleted afterwards.
- [ ] Compute it beside `has_learning_content`, which is already resolved per
      module at `router.py:310` and `router.py:382`.
- [ ] **Hide** incomplete modules from the learner's module list rather than
      showing them disabled. A learner who can see a module they cannot open
      raises a support question the admin cannot answer from the learner's side.
- [ ] Direct access to `/modules/{id}/learning` for an incomplete module returns
      404, matching every other refusal in Phase 2a so the shape stays uniform.
- [ ] The gate is **per organisation**, because the links are. The same module
      can be complete for one organisation and not another, and therefore visible
      to one organisation's learners and hidden from another's.
- [ ] Surface incompleteness where an admin will actually see it — the admin
      module list marking "unavailable — 1 media file missing", and ideally the
      deploy notification. A typo in an MDX reference otherwise makes a module
      silently unavailable to everyone, permanently, with the only trace on a
      card nobody has opened. The gate fails safe; it must not fail invisibly.

## Phase 6: Transcoding and captions

Only after Phases 0–5 are shipped and a hand-encoded MP4 plays end to end.

- [ ] Cloud Run job `video-transcode` — FFmpeg image, 4 CPU, 4 GB, 60-minute
      timeout. Reads from source, writes 720p and 1080p H.264 plus a poster frame
      to the processed bucket under `{org_id}/{module_id}/`, named from the asset
      id. Built on the existing `infra/modules/cloud-run-job/` module.
      **[revised 2026-09-09]** The job is what produces the poster, which is why
      the MDX has no `poster` prop — the author names one reference and gets the
      rendition set. Until this phase lands, a hand-encoded MP4 and a
      hand-made poster are uploaded as the same asset's files.
- [ ] Cloud Run job `video-caption` — Whisper-large, 4 CPU, 10 GB, 60-minute
      timeout. Writes WebVTT beside the renditions.
- [ ] Set `Cache-Control: public, max-age=86400` on every object both jobs write,
      so Cloud CDN actually caches them. Objects written without it will be
      revalidated on every request and the CDN buys us nothing.
- [ ] Trigger both on upload, not from the content repo's deploy workflow.
      **[revised 2026-09-09]** The original wording predates the decision that
      media is uploaded through the admin UI rather than committed to the content
      repository: the deploy workflow never sees a video, so it cannot be the
      trigger. Fire from the upload completing instead, and reflect progress in
      the admin card — a reference whose asset is uploaded but not yet transcoded
      is not yet complete, and the module stays unavailable until it is.
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

## Local development

Video files never enter this repository. They live in the gitignored
`teaching-repos/` bind mount alongside the rest of a module's content, and the
backend serves them straight off disk with no bucket, no signature and no cookie.

**[revised 2026-09-09]** In production media is uploaded through the admin UI and
found through a link row, not by filename — see **Media uploads**. Dev keeps the
filename convention below because there is no upload UI to drive and no bucket to
upload to: a file named for its reference key is the simplest thing that lets a
developer see a slide play. The `LocalVideoBackend` resolves a `ref` to
`<ref>.mp4` on disk, and that resolution is the _only_ place the two models
differ. Everything above it — the parser, the API shape, the player — is
identical, so nothing downstream learns the local convention.

### Where the files go

A module's video assets sit in its `learning/` directory, next to the
`content.mdx` that references them:

```
teaching-repos/
└── <content-repo>/
    └── modules/
        └── <module-id>/
            ├── module.yaml
            ├── assessment/
            └── learning/
                ├── content.mdx          <Video ref="lecture-01" />
                ├── images/              existing: <Figure src="..."> assets
                ├── lecture-01.mp4
                ├── lecture-01.jpg       poster frame
                └── lecture-01.vtt       captions
```

Video sits directly in `learning/`, one level above the existing `images/`
subdirectory that `_serve_learning_image` reads from (`main.py:5901`). The
filenames match the `ref` keys in `content.mdx` — `lecture-01.mp4` for
`<Video ref="lecture-01" />` — which is a dev convenience, not the production
model. Keep the two apart so the extension
allow-lists stay separate — an image route that will serve `.mp4` is a route
that will serve whatever the next allow-list edit forgets about.

- **`src` is a bare filename, never a path** — it resolves against the module's
  own `learning/` directory. The dev route and the GCS prefix builder both take
  the module as their root, so the same `content.mdx` works in both.
- **`teaching-repos/` is a bind mount** — declared at `compose.dev.yml:28` and
  gitignored at `.gitignore:25`. A developer with no content repo cloned has no
  `teaching-repos/` directory at all, which is the normal starting state.
- **Resolution uses `resolve_module_dir()`** — the existing helper at
  `storage.py:236`, which finds `<repo>/modules/<module-id>/` by looking for
  `module.yaml`. Do not add a second resolution path for video.

### Making a test video

A real lecture is a poor development fixture — it makes the container mount slow
and there is no reason to hold licensed content on a laptop. A short synthetic
clip exercises every code path the real file does, including range requests and
seeking:

```bash
# 60s test pattern — testsrc draws its own frame counter and timer,
# so a seek landing in the wrong place is immediately visible
ffmpeg -f lavfi -i testsrc=size=1280x720:rate=30 -t 60 \
       -c:v libx264 -pix_fmt yuv420p -movflags +faststart lecture-01.mp4

# Poster frame from the clip
ffmpeg -i lecture-01.mp4 -ss 5 -vframes 1 lecture-01.jpg
```

`-movflags +faststart` puts the MP4 index at the front of the file. Without it
playback stalls until the whole file has downloaded, which looks exactly like a
broken range-request implementation and will waste an afternoon.

Captions need no tooling — a `.vtt` is plain text:

```
WEBVTT

00:00:04.000 --> 00:00:08.500
Test caption, first cue.
```

### What local development does not prove

The dev path is browser → Caddy → FastAPI → a file on disk. There is no CDN, no
load balancer, no signature and no cookie. Playback working on `localhost`
proves the parser, the content model and the player; it proves nothing about the
authorisation gate. See the note under **Testing** below.

## Testing

Backend tests run in Docker via `just ub`, frontend via `just uf`, per the
project testing rules.

**What local development does not cover.** Dev exercises the player, the content
model and the parser, and nothing else. There is no CDN, no load balancer, no
signature and no cookie on `localhost` — the dev path is browser → Caddy →
FastAPI → a file on disk. That means the entire mechanism this plan exists to
build is untested until it runs in the teaching environment. A fully green
`just ub` and `just uf` says the plumbing is right; it says nothing about whether
the gate holds. Treat the manual teaching-environment checks at the foot of this
section as required sign-off for Phases 1 and 2, not as an optional extra, and do
not close either phase on unit tests alone.

- **Cookie signing** — Sign with a fixed key, fixed prefix and fixed expiry, and
  assert the exact output string against a value computed independently. This is
  the test that catches a subtle base64 or field-order mistake, which would
  otherwise present as a 403 at the edge with no diagnostics.

- **Membership resolution** **[added 2026-09-09]** — The Phase 2a helper is
  tested on its own, because both gates depend on it. A user in an organisation
  directly; a user in an organisation only through a site; a user in two
  organisations where one has the module live and the other does not; a user in
  none, which is the 403 case `_get_user_org_ids` already raises. Assert the
  permissive union explicitly — one live organisation is enough.

- **The learning content gate** **[added 2026-09-09]** — `get_learning_content`
  and `list_learning_modules` refuse a module belonging to another organisation
  with 404, refuse a module that exists but is not live with the same 404, and
  serve one reached through site membership. The list endpoint returns an empty
  array rather than an error when nothing is visible.

- **The access decision** **[revised 2026-09-09]** — A learner without the
  teaching feature is refused. A learner without `view_teaching_cases` is
  refused. A learner from another organisation gets 404, not 403. A module whose
  `QuestionBankOrgStatus` row is missing for the caller's organisation is
  refused; so is one where `is_live` is false — and both return 404, not 403, so
  the two are indistinguishable from outside. A module live for organisation A
  and not for organisation B grants a cookie to A's learner and refuses B's: this
  is the per-organisation case that did not exist when the plan was written, and
  it is the one worth a dedicated test. A `module_id` containing `../`, a null
  byte, or a URL-encoded separator is rejected before any signing happens, and a
  non-positive `org_id` is rejected by type before it reaches the prefix builder.

- **Prefix scoping** — The cookie minted for module A does not validate for
  module B's prefix. Assert this on the constructed prefix directly; it is the
  property the whole design rests on.

- **Expiry** — The cookie's `max_age` and the signature's `Expires` agree, and
  both match `TEACHING_VIDEO_COOKIE_TTL_MINUTES`.

- **Parser** **[revised 2026-09-09]** — `<Video ref="...">` extracted with and
  without `duration`; a tag carrying props the extractor cannot read fails
  validation rather than being silently dropped; a slide with both `<YouTube>`
  and `<Video>` is rejected by `validate_mdx`; a slide with neither keeps its
  existing layout.

- **Media links** **[added 2026-09-09]** — Uploading attaches an asset to a
  reference; deleting removes asset and link together; detaching keeps the asset
  and shows it unattached. A key removed from the MDX orphans its link without
  deleting the file. A key renamed presents as one removal and one addition. Two
  organisations with the same module id and the same reference key resolve to
  their own uploads and never to each other's — this is the test that the
  per-organisation link model actually holds.

- **Availability gate** **[added 2026-09-09]** — A module with an unlinked
  reference is absent from the learner's module list and 404s on direct access. A
  module complete for organisation A and incomplete for B is served to A's
  learners and hidden from B's. Deleting an asset from a complete, live module
  makes it unavailable immediately, without waiting for any liveness transition —
  this is the case the old "block going live" check missed.

- **Admin card** — Renders only when the module references media; lists missing
  references, linked files and unattached assets; the delete confirmation names
  the organisations that will lose access.

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
  progress settles the org model differently. **[revised 2026-09-09 — largely
  answered]** The org model has since settled: `QuestionBankOrgStatus` makes
  liveness and version promotion per-organisation, so the platform now behaves
  as multi-org for teaching content whatever the marketing position is. Keeping
  `org_id` in the prefix is the right call. What remains open is narrower: the
  bucket stores one unversioned copy per module at `modules/<id>/learning/`, so
  two organisations on different `active_version` values share a video. Fine
  while learning content is unversioned; a real problem the day it is not.

- **[added and answered 2026-09-09] Whether the content endpoint gets the same
  gate** — **Answered: yes, in this plan.** See Revision 2 and Phase 2a. The rule
  is that a user accesses learning materials only for the organisations they
  belong to, directly or through a site, and both `get_learning_content` and
  `list_learning_modules` are brought under it before Phase 4 writes any frontend
  against them.

- **[added and answered 2026-09-09] Whether the licence requires DRM** —
  **Answered: it does not.** The EoEETA licence is silent on DRM, so nothing
  external obliges technical protection and the **No DRM** decision stands on its
  own merits. Recorded here rather than deleted because "the licence does not
  require it" is the reason, and a future reviewer asking why there is no DRM
  deserves the answer without re-opening the question.
