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

- **Which renditions exist is recorded in the database, not discovered from the
  bucket** — **[decided 2026-09-13]** The alternative was a `list_blobs` call
  per module inside `get_learning_content`, following the
  `list_bank_images_in_gcs` precedent. Rejected: that puts a network round trip
  on the learner's hot read path to detect something that changes once in an
  asset's life, and it fails in the wrong direction — a listing that errors
  either 500s a lecture that was playing fine, or silently reports no
  renditions and drops the learner to the original upload, a quality regression
  nobody would notice. The link rows are already loaded for the module, so
  reading the state off them costs nothing and adds no failure mode. The
  trade is that the database can lie where an object is deleted by hand; that
  is a rare operational event with a visible symptom, and `ModuleMediaLink`
  already records that an upload happened without re-checking the object is
  still there. This is also the state the availability gate needs anyway — see
  the last item of Phase 6 — so recording it here builds it once rather than
  twice.

- **Source retention: the job deletes its own master, with a 7-day backstop** —
  **[decided 2026-09-13, replacing 90 days]** Once the renditions exist the
  master's only use is re-encoding, which is wanted within days of a video
  going up — a bad encode is noticed immediately, not on day 87. So the
  transcode job deletes its source once it has verified its outputs are
  readable, and the lifecycle rule drops to 7 days as a backstop for uploads
  whose job never ran or never cleaned up. Lifecycle rules are good at orphans
  and bad at routine cleanup: they can only see object age, never whether the
  database still links it to a live slide.

  The point is exposure rather than cost. Storage is cheap; what 90 days bought
  was a long window in which a never-transcoded upload could age silently
  toward an unrecoverable state. At 7 days that failure is loud and quick, and
  re-uploading is still merely annoying. Note the clock starts at **upload**,
  not at successful transcode — GCS cannot express "90 days after the job
  succeeded" — which is precisely why the job must do its own cleanup rather
  than leave it to the rule.

  Keeping masters for later re-encoding — HLS, say — is a different decision
  with a different answer: cold storage kept permanently, not a longer fuse. No
  realistic retention survives until a deferred format lands.

- **Drift between the database and the bucket is surfaced, not swept** —
  **[decided 2026-09-13]** A periodic reconciler was considered and rejected
  for now. The job's own failure mode already fails safe: it writes objects
  then records completion, so dying between the two leaves the row simply
  never saying "transcoded" — the module stays incomplete, the gate hides it,
  and the admin card names it. What a sweep would catch is a hand-deletion
  from the bucket, which is rare enough that the job would run green almost
  always and stop being read. Instead: **the job verifies its uploads are
  readable before recording completion**, closing the only window the system
  creates itself; and **a 404 under `/videos/*` is alerted on** from the load
  balancer's existing `httpRequest` logs, which is drift detected by the only
  party who cares, at the moment it matters. A weekly sweep is easy to add if
  those alerts ever fire with any regularity — and by then its purpose will be
  known rather than guessed.

  A re-transcode control on the admin card was considered as the remedy and
  dropped: delete-and-re-upload is already the sanctioned replacement flow from
  Phase 5, and past the retention window a re-transcode cannot work either,
  since it needs the same vanished source.

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
- [x] Tear down by **reverting the module in a second pull request**, so removal
      passes the same gate as creation and leaves no drift. **[done
      2026-09-10]** It took three applies — see **Tearing it down** below.
      `networkservices.googleapis.com` is deliberately left enabled.

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

### Tearing it down

**The teardown needed three applies.** Everything landed in the end, and the
teaching API stayed up throughout, but the ordering problem is worth recording
because **Phase 1 will hit it whenever a backend bucket is retired or
repointed**.

- **A wait is needed on the way out as well as the way in.** The creation-side
  fix — wait before the URL map references a new backend bucket — is only half
  the lesson. Coming out, the URL map rule must be removed _and the dereference
  allowed to propagate_ before the backend bucket can be deleted. Terraform's
  graph models neither wait.

- **The two failures were different, and both were ordering.** First
  `resourceNotReady` on the URL map update, with the signed-URL key deletion
  still settling. Then `resourceInUseByAnotherResource`, deleting a backend
  bucket the URL map had only just stopped referencing. Each apply made real
  progress, so re-running converged rather than looping.

- **The lesson for Phase 1**: put an explicit wait between removing a URL map
  reference and deleting what it pointed at, the mirror of the one on creation.
  A retirement that is left to Terraform's own ordering will fail the first time
  and succeed on a re-run, which is the kind of flakiness that gets attributed to
  GCP rather than fixed.

- **`/videospike/*` now returns 200, and that is correct.** With the path rule
  gone the prefix falls through to the URL map's default service — the frontend
  — which serves its index page for any unrecognised route. Not a leftover.

- **Deliberately left behind**: `networkservices.googleapis.com` stays enabled.
  `disable_on_destroy = false` was set so a revert could not switch off an API
  something else had come to depend on, and Phase 1 needs it anyway.

- **The `time` provider declaration is now removed**, in the same change as
  these findings. It had to stay while state still referenced the two
  `time_sleep` resources — removing it in the revert itself failed with
  `Missing required provider` — so a provider that only a doomed resource uses
  takes two changes to retire, not one. `infra/versions.tf` is back to its
  pre-spike shape.

## Phase 1: Terraform — buckets, backend bucket, CDN, signing key

New module at `infra/modules/teaching-video-pipeline/`, instantiated from
`infra/main.tf` with `count = var.environment == "teaching" ? 1 : 0`, matching
how `module "cloud_storage"` is gated at `infra/main.tf:367`.

- [x] `quill-teaching-videos-source-teaching` — raw uploads. Region
      `europe-west2`, uniform bucket-level access, public access prevention
      enforced, no versioning, lifecycle rule deleting objects after 90 days.
      **[revised 2026-09-13 — now 7 days]** Ninety was a placeholder picked
      before anything was known about how the master would be used. See
      **Source retention** under Decisions: the job deletes its own source on
      success, and the rule is only a backstop for uploads whose job never
      ran.
- [x] `quill-teaching-videos-processed-teaching` — transcoded renditions, poster
      frames and WebVTT. Same region and access settings, versioning enabled, no
      deletion lifecycle rule.
- [x] `google_compute_backend_bucket` over the processed bucket with
      `enable_cdn = true`, `cache_mode = "CACHE_ALL_STATIC"` and a 24-hour
      default TTL.
- [x] `google_compute_backend_bucket_signed_url_key` on that backend bucket, key
      material generated by `random_bytes` (16 bytes, base64url) and written to
      Secret Manager as `teaching-video-signing-key` via the existing
      `infra/modules/secrets/` pattern, so the backend and the LB share one key.
- [x] Grant the Cloud CDN fill service account `roles/storage.objectViewer` on
      the processed bucket, per Phase 0.
- [x] Grant the Cloud Run runtime service account
      (`<project-number>-compute@developer.gserviceaccount.com`)
      `roles/storage.objectAdmin` on the **source** bucket only — it needs to
      mint resumable upload URLs there. It needs no role at all on the processed
      bucket, because signing a CDN cookie is an HMAC over a secret, not a GCP
      API call. This is a genuine reduction in blast radius versus the v4
      signed-URL approach, which requires `objectViewer` plus
      `serviceAccountTokenCreator`.
- [x] **[split in two, 2026-09-10]** Add a `/videos/*` path rule to the
      `quill-paths` path matcher in
      `infra/modules/load-balancer/main.tf`, pointing at the new backend bucket.
      Plumb it through as an optional variable so `prod` and `staging`, which
      have no video buckets, render an unchanged URL map.
- [x] Add the new secret to the Cloud Run env mapping in `infra/main.tf:292`
      alongside `TEACHING_SYNC_TOKEN`.
- [x] **[added during the build]** Create the `teaching-video-signing-key`
      secret container in `module "secrets"`. The plan said to write the key
      "via the existing `infra/modules/secrets/` pattern", but that module
      deliberately creates _containers only_ — values are added by hand, never
      by Terraform. This key cannot follow that rule: the edge and the backend
      must hold the same bytes, so Terraform generates it and writes the
      version, as it already does for `jwt-secret` (`main.tf:212`). The
      container still goes in the module; only the version does not.
- [x] **[added during the build]** Wait 60s after creating the backend bucket
      before the URL map references it, per Phase 0's `resourceNotReady`.
      Re-adds the `time` provider that the Phase 0 revert removed.
- [x] **[found during the build]** Converting `/api/*` from a static
      `path_rule` to a `dynamic` block is itself a change Terraform cannot see
      through, separately from the Phase 0 lesson about the two forms
      coexisting. With the `/videos/*` entry added in the same change, the plan
      showed `paths = ["/api", "/api/*"] -> null` and the replacement only as
      `known after apply`, because the video rule's service is not known until
      the backend bucket exists. Whether that resolves harmlessly at apply time
      is untested and not worth testing on the live API. So the work is split:
      **this phase converts `/api/*` alone and must plan as no change**, and a
      follow-up adds `/videos/*` once that is proven. The
      `videos_backend_bucket_id` variable stays declared but is not passed, so the
      follow-up is a small diff. **Resolved**: the conversion alone planned as
      no URL map change at all, confirming the second entry was the cause and
      not the conversion. The rule was then added on its own.
- [x] `terraform plan` against `teaching` and confirm the diff touches nothing
      outside the new module, the URL map and the Cloud Run env block. Confirm
      `plan` for `prod` and `staging` is empty. **[done 2026-09-10]** Read on
      PR #589 (10 to add, 1 to change) and PR #594 (the URL map gaining
      `/videos/*` and nothing else). The conversion above was proven by
      splitting it out: on its own it planned as no URL map change at all,
      which is what confirmed the second entry rather than the conversion was
      the cause.
- [x] **[found during the build, fixed separately]** `teaching-sync-token` is
      referenced in the Cloud Run env mapping but is created nowhere in
      Terraform — it was made by hand on 2026-05-24 and has never been managed,
      so one live secret has no declared owner. Bringing it in needs an
      `import` block rather than a plain create: the secret already exists with
      an enabled version, and adding it to `module "secrets"` alone would fail
      the apply with "already exists". Only the container is imported; the
      value stays where it is, per that module's convention.

## Phase 2: Backend — cookie minting and the access decision

New module `backend/app/features/teaching/video_access.py`, deliberately separate
from `storage.py` so the security-critical signing code can be reviewed and
tested on its own.

- [x] Add to `backend/app/config.py`, in the existing `--- Teaching / GCS ---`
      block: `TEACHING_VIDEOS_BUCKET`, `TEACHING_VIDEOS_SOURCE_BUCKET`,
      `TEACHING_VIDEO_BASE_URL` (e.g. `https://teaching.quill-medical.com/videos`),
      `TEACHING_VIDEO_SIGNING_KEY_NAME`, `TEACHING_VIDEO_SIGNING_KEY`
      (`SecretStr`), and `TEACHING_VIDEO_COOKIE_TTL_MINUTES` defaulting to 30.
- [x] Implement `sign_cookie(url_prefix: str, expires_at: datetime) -> str`
      producing Cloud CDN's exact format: the string
      `URLPrefix=<base64url(prefix)>:Expires=<unix>:KeyName=<name>`, then the same
      string with `:Signature=<base64url(HMAC-SHA1(key, string))>` appended. Use
      `hmac`/`hashlib` from the standard library and `base64.urlsafe_b64encode`.
      No third-party dependency.
- [x] Implement `build_url_prefix(org_id, module_id) -> str` returning
      `{TEACHING_VIDEO_BASE_URL}/{org_id}/{module_id}/`. **[revised 2026-09-09]**
      Validate `module_id` against the existing `_SAFE_BANK_ID` pattern in
      `storage.py` (`^[a-zA-Z0-9_-]+$`) and raise on anything else. `org_id` is an
      integer primary key on `organisations`, not a slug — take it as `int` and
      reject anything non-positive, rather than reusing `_SAFE_BANK_ID`, which
      would accept `-1` and `0`. The prefix is the entire authorisation boundary,
      so a traversal here grants a learner every module in the bucket.
- [x] Add `POST /api/teaching/modules/{module_id}/video-access` to
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
- [x] In the handler **[revised 2026-09-09 — see Revisions 1 and 2]**: call
      `resolve_visible_module(user, db, module_id)` from Phase 2a. It resolves the
      user's organisations via direct **and** site membership, checks
      `QuestionBankOrgStatus` for those organisations, and returns the
      organisation id that makes the module visible or raises 404. There is no
      module-level `status` column to check — liveness is per organisation, and
      **every refusal is a 404**, so the endpoint never confirms the existence of
      another organisation's modules. Mint the cookie for that module's prefix
      only, using the organisation id the helper returned.
- [x] Do not re-implement the membership query here. One helper serves both this
      endpoint and the content endpoints, which is the whole point of Phase 2a —
      the video gate and the content gate must not be able to drift apart.
- [x] Ignore `active_version` when minting. Learning content is unversioned in
      the bucket, so there is one video per module and the pointer is not part of
      this decision. If that ever changes, Revision 1 says what breaks.
- [x] Set the response cookie `Cloud-CDN-Cookie` with `Secure`, `HttpOnly`,
      `SameSite=Lax`, `Path=/videos/`, host-only (no `Domain` attribute), and
      `max_age` matching the signature expiry. Return
      `{"base_url": ..., "expires_at": ...}` as JSON so the frontend can build
      asset URLs and schedule its refresh.
- [x] Log the grant at INFO — `user_id`, `org_id`, `module_id`, expiry — and
      nothing else. No filenames, no PHI, and never the cookie value or key.
- [x] **[added 2026-09-09] No cookie consent banner, but the cookie policy needs
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
      **[done 2026-09-11]** The placeholder is replaced with all four cookies,
      grouped by purpose rather than listed as an inventory, with lifetimes
      read from the code rather than assumed. Kept as its own page rather than
      folded into the privacy policy a lawyer is drafting: the cookie list
      changes whenever a cookie ships, and a lawyer-owned document should not
      need editing for that. The page is worth showing them anyway, so the two
      documents can link and they can confirm the strictly-necessary
      characterisation.
- [x] Rate-limit the endpoint so it cannot be driven as a cookie-minting oracle.
      **[revised 2026-09-09]** The existing pattern is SlowAPI: `from
      app.rate_limit import limiter`, then `@limiter.limit("10/minute")` on the
      route, as at `main.py:708` and `main.py:898`. It keys on the client address
      and needs `request: Request` in the signature. No teaching route is
      currently rate-limited, so this is the first — check the decorator ordering
      against the `main.py` examples, which put `@limiter.limit` below the route
      decorator.
- [x] Add a `LocalVideoBackend` fallback for development: when
      `TEACHING_VIDEOS_BUCKET` is unset, return a `/api/teaching/videos` base URL
      and set no cookie. Note the base URL is **not** `/static/videos` — there is
      no static mount in this app. The `LocalStorageBackend("/static")` fallback
      at `storage.py:139` is dead: dev sets `TEACHING_IMAGES_BASE_URL` to
      `/api/teaching/images` in `compose.dev.yml`, and the files are served by a
      conditional FastAPI route (`main.py:5820`), not by a static mount. Video
      follows that route convention, which also inherits the dev Caddy `/api/*`
      proxy rule for free.
- [x] Mount the matching conditional dev route. **[revised 2026-09-09]** Copy
      `_serve_learning_image` (`main.py:5901`) exactly — it is the closest
      template and already does everything needed: same `if` guard, same
      `".." in part or "/" in part` component check, same extension allow-list,
      same `resolve_module_dir` call, same `FileResponse` with a guessed media
      type. Register it as `/api/teaching/videos/{module_id}/{filename}` to match
      that route's shape, and widen the allow-list to `.mp4`, `.jpg`, `.webp` and
      `.vtt`. Starlette's `FileResponse` honours `Range`, so seeking works
      locally without extra work.
- [x] Serve from the module's `learning/` directory, so a test video lives at
      `teaching-repos/<repo>/modules/<module_id>/learning/lecture-01.mp4`,
      alongside the `content.mdx` whose `<Video ref="lecture-01" />`
      references it. Note `_serve_learning_image` resolves to
      `module_dir / "learning" / "images" / filename` — video sits one level up,
      directly in `learning/`, because that is where the author writes it.
      `teaching-repos/` is a gitignored bind mount (`compose.dev.yml:28`), so test
      media never enters the repository — which also means a developer with no
      content repo cloned sees the module simply not resolve, not a crash.
- [x] Keep the frontend blind to the difference: it consumes `base_url` from the
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

- [x] Write `resolve_visible_module(user, db, module_id) -> int` in
      `video_access.py`, or beside `_get_user_org_ids` if it reads better there.
      It calls `_get_user_org_ids(user, db)`, looks up `QuestionBankOrgStatus`
      rows for those organisations and this `module_id`, and returns the
      organisation id that makes it visible. Raise 404 — never 403 — when no row
      matches or none is `is_live`, so "not yours" and "not live" and "does not
      exist" are indistinguishable from outside. Follow the permissive union at
      `router.py:336`: visible if **any** of the user's organisations has it live.
- [x] Add `view_teaching_cases` and a database session to `get_learning_content`
      (`router.py:397`), and call the helper before any bucket or filesystem
      read. Today it takes no `db` at all, so this changes its signature.
- [x] Gate `list_learning_modules` (`router.py:477`) the same way, but filter
      rather than raise: return only modules visible to the user's organisations.
      An empty list is the correct answer for a user with no live modules, not an
      error.
- [x] Audit the sibling learning routes in the same pass — anything reading
      `has_learning_content`, module cover images or learning images by
      `module_id` has the same exposure and the same fix. `router.py:268` and
      `router.py:382` are the starting points.
- [x] Have Phase 2's `video-access` endpoint call this same helper, so the video
      gate and the content gate cannot drift apart. This is the reason the helper
      is written here rather than inline.
- [x] Tests: a user whose organisation has the module live gets slides; a user in
      a different organisation gets 404; a user whose organisation has the module
      but not live gets 404; a user reaching the organisation only through a site
      gets slides, which is the case `_get_user_org_ids` exists to serve; a user
      in two organisations where only one has it live gets slides. That last one
      is why the plural helper is mandatory.
- [x] Check the frontend handles a 404 from these endpoints as "not available to
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

- [x] Add `VIDEO_PATTERN` beside `YOUTUBE_PATTERN` and `FIGURE_PATTERN`
      (`mdx_parser.py:40`), matching `<Video ref="lecture-01" />` with optional
      `duration`. **[revised 2026-09-09]** The prop is `ref`, a stable key, not
      `src`, a filename — see **Media uploads**. There is no `poster` prop
      either: the poster is another asset of the same reference, produced by
      Phase 6's transcode job, so the author names one thing and gets the whole
      set. The existing patterns are `re.fullmatch`ed in `_check_component`, so a
      tag carrying props the extractor cannot read fails validation rather than
      being silently dropped — the new pattern must be written to the same
      standard.
- [x] Add `_extract_video()`, modelled directly on `_extract_youtube()` at
      `mdx_parser.py:99`, returning the remaining body plus the parsed fields.
- [x] Extend `ParsedSlide` (`mdx_parser.py:54`) with `video_ref`, reusing the
      existing `duration_seconds`. Set `layout = "video-slide"` when either
      `youtube_id` or `video_ref` is present. The poster and captions are not
      parser concerns — they are resolved from the link at request time.
- [x] Move `Video` out of `NOT_YET_SUPPORTED` and into `KNOWN_COMPONENTS`, and
      add its prop checks to `_check_component` (`mdx_parser.py:161`) alongside
      the `YouTube` and `Figure` cases — `ref` required, `duration` optional.
- [x] Reject slides carrying both `<YouTube>` and `<Video>`. **[revised
      2026-09-09]** The plan previously worried this would be "the first `raise`
      in a module that discards malformed content silently". That is no longer
      the situation: `validate_mdx()` (`mdx_parser.py:210`) now returns a list of
      human-readable error strings and is wired into the content validator
      (`tooling/validate.py:998`) and the merge gate. Add the both-tags check
      there, as another error string. No new error convention, and no `raise`.
- [x] Add the resolved media fields to `LearningSlideOut` in
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
      **[done 2026-09-10, with one deferral]** `video_src` is exposed and
      optional, so the change is additive. Only `video_src` landed —
      poster and captions wait for Phase 6, which is what produces them.
      Resolution is currently the development filename convention
      (`<ref>.mp4`) rather than a link lookup, because the media-link
      table does not exist yet. The indirection is what makes that
      swappable: when the table lands, only `_resolve_video_filename`
      changes, and the MDX, the API shape and the player all stay put.
- [x] Extend validation so a module referencing a `video_src` that does not exist
      in the processed bucket cannot be promoted. **[revised 2026-09-09]** The
      helper this was waiting on has landed: `tooling/validate.py` now validates
      content whose images live in GCS rather than on disk, and runs at both the
      merge gate and sync. Extend that, rather than the
      [Image on GCP Check](2026-06-14-image-on-gcp-check-plan.md) plan's Phase 2,
      which this superseded. `_validate_image_bytes` (`tooling/validate.py:230`)
      is the closest existing shape.
      **[closed differently, 2026-09-12]** The item as written cannot be built,
      and the reason is that the model changed underneath it. "Does this video
      exist" has no answer the merge gate can reach: uploads live in
      `ModuleMediaLink`, the validator has no database (its imports are `sys`,
      `pathlib`, `pydantic`, `yaml` and two local schemas), and completeness is
      **per organisation** — the same module is complete for one trust and not
      another, while the validator sees only content. The content repository
      holds no videos at all, which was the point of moving media out: a
      `<Video ref>` names a key an admin uploads against later, so at merge time
      there is legitimately nothing to check against.
      What the merge gate *can* know is whether the ref is usable as a key, and
      that turned out to be a real gap: `VIDEO_PATTERN` accepted `ref="[^"]+"`,
      so `ref="my lecture"` or `ref="../secret"` passed validation and produced a
      key nothing could ever be attached to. The module would then sit
      permanently incomplete and — since the availability gate hides it — simply
      vanish for learners, with the cause three steps away. `SAFE_MEDIA_KEY` in
      `mdx_parser.py` now holds refs to the same shape as `storage._SAFE_BANK_ID`,
      and the error names the offending key.
      Duplicate refs across slides are deliberately **not** an error:
      `get_referenced_media_keys` de-duplicates, so two slides sharing a key is
      one upload serving both, which is supported rather than a mistake.
      The original intent is already met at runtime by the availability gate,
      which hides an incomplete module from learners continuously rather than
      only at promotion, and by the admin card, which names what is missing.
      **It would also have been the wrong thing to build.** Content must sync to
      the bucket whether or not its videos are there yet: an author writes the
      slides, and each organisation uploads its own copy of the lecture
      afterwards, possibly days later and at different times. Blocking promotion
      would invert that order and demand the video exist before the content that
      references it. The three layers are deliberately independent — sync always
      runs, the gate hides an incomplete module from learners, and the card shows
      an admin what is missing.

## Phase 4: Frontend — GCS playback

- [x] Add the resolved media fields to the `ApiSlide` interface and
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
- [x] New hook `frontend/src/features/teaching/use-video-access.ts`: calls
      `POST /teaching/modules/{id}/video-access` through the `api` client (never
      raw `fetch`), holds `base_url` and `expires_at` in state, and schedules a
      silent re-fetch at expiry minus five minutes while the learner is still on
      a video slide. Clears its timer on unmount.
- [x] Extend `VideoPlayer.tsx` — the `signedUrl` prop is already stubbed and
      documented as "V2 — not yet implemented". Rename it to `src` for accuracy
      (it is now a plain CDN URL, authorised by cookie, not a signed URL), keep
      `youtubeId` working, and add `posterUrl` and `captionsUrl`.
- [x] Spike whether `react-player` can carry a `<track>` element for WebVTT
      captions. **[revised 2026-09-09]** Still genuinely open — `package.json`
      pins `react-player: ^3.4.0`, so this is unchanged since the plan was
      written and no newer major has settled it. If it cannot, render a native
      `<video>` for the GCS path and keep `react-player` for YouTube only —
      captions are a WCAG 2.1 AA (Web Content Accessibility Guidelines)
      requirement for the learning centre and are not negotiable. Record the
      outcome here; this is the point at which the parent plan says to evaluate
      Plyr.
      **[answered 2026-09-11] It can.** `ReactPlayerProps` extends
      `VideoElementProps`, which extends React's
      `DetailedHTMLProps<VideoHTMLAttributes<HTMLVideoElement>>` — so
      children are typed, and v3 forwards them to the underlying video
      element. Verified by compiling a `<track>` child, not by reading
      the inheritance chain alone. No native `<video>` fallback is
      needed and Plyr does not need evaluating. A track is added only
      for hosted video, since YouTube carries its own captions.
- [x] Wire `SlideLayoutVideo.tsx` to pass either `youtubeId` or the composed
      `src`, and show a loading state while the access call is in flight rather
      than a blank player.
- [x] Handle the denial path visibly: if the access call fails, show an inline
      message ("This video is not available — your access may have expired. Try
      reloading the page.") rather than an empty box. Use the centralised page
      messages pattern.
- [x] **[found 2026-09-10, pre-existing]** Give `LearningDashboard` an error
      state. It calls `getModules()` with `.then().finally()` and no `.catch()`
      (`LearningDashboard.tsx:58`), and `api.get` throws — so any rejection
      leaves the page on skeletons forever with an unhandled rejection in the
      console. The sibling `TeachingDashboard` already handles this and has a
      test for it; copy that shape rather than inventing one. Nothing to do
      with video, and it predates Phase 2a — found while checking how the
      frontend copes with that phase's new 404. Recorded here because this is
      where the frontend error handling lives, and because Phase 4 adds a
      second failure path to the same page. A stuck skeleton is
      indistinguishable from a slow network to the learner looking at it.
- [x] Storybook stories for the new states — YouTube, GCS with captions, loading,
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

- [x] Render the card **only when the module's content references media**. A
      module of pure text never shows it. Whether media is needed is derived from
      the MDX references, never from a flag: a boolean an author sets is a second
      source of truth that can disagree with the content, and needs maintaining
      by hand in a file nobody reopens.
- [x] One row per MDX reference, showing the key, and either the linked file —
      original filename, size, when it was uploaded — or that nothing is linked
      yet.
- [x] Also list uploaded assets with no matching key, as unattached. This is what
      a renamed or removed reference leaves behind, and without a row they are
      invisible bytes nobody can reach or remove.
- [x] Upload per row via Mantine `<Dropzone>` with per-file progress, straight to
      the resumable URL. A lecture is large enough that a progress bar is not
      decoration.
- [x] Delete, then upload again, is the flow for replacing a file. No separate
      replace action. Deleting cannot leave a learner with a broken slide,
      because an incomplete module is not served at all — the availability gate
      below is what makes plain delete safe here.
- [x] Where the module is live for one or more organisations, say so in the
      delete confirmation, naming them: "this will make the module unavailable to
      learners in `<organisation>` until a replacement is uploaded." A warning, not
      a block. The admin cannot otherwise see that consequence from this page.
- [x] No route guard of its own. **[revised 2026-09-09]** The card needs one,
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
- [x] Storybook stories and tests per the components rule: all linked, some
      missing, unattached assets present, upload in progress, delete
      confirmation with and without live organisations.

### The endpoints

- [x] `POST /api/admin/teaching/modules/{module_id}/media/upload-url` —
      admin/superadmin. Returns a GCS resumable upload URL for
      `source-bucket/{org_id}/{module_id}/{asset_id}`, the asset id generated
      server-side. The uploaded filename never reaches the object path, so it
      needs no `_SAFE_BANK_ID` validation — but keep an extension and
      content-type allow-list, and record the original name as data. This is the
      one place the backend needs real GCS write credentials, and it writes only
      to the source bucket.
- [x] `GET /api/admin/teaching/modules/{module_id}/media` — the card's data.
      Returns every MDX reference with its link if any, plus unattached assets.
      Built on the shared "which media, and which present" function from
      **Media uploads**, not a second query.
      **[done 2026-09-11]** Which keys the MDX carries is now
      `get_referenced_media_keys` in `media.py`, beside the inventory it
      feeds. Content loads from GCS in the teaching environment and from
      disk in development, and both branches live in that one helper —
      the learner gate and the merge gate need the same answer, and a
      second copy of the branch would be the one that drifts. Keys are
      de-duplicated and kept in content order, so a key used on two
      slides is still one upload and the card's rows follow the content.
- [x] `POST .../media/{key}/link` and `DELETE .../media/{key}/link` — attach an
      uploaded asset to a reference, and detach it. Detaching keeps the asset.
      **[done 2026-09-11]** The file details travel in the link request
      rather than being read from the bucket, because the backend never
      sees the bytes: the upload goes straight to GCS on a resumable
      URL, and this call is what records what landed. That body is
      caller-controlled, so the content type is re-checked against the
      same allow-list the upload URL was minted against.
      Re-linking a key that already has an asset **replaces** the link
      rather than refusing it — one video per reference is what the
      unique constraint enforces, and re-pointing a slide is a dropdown
      in the card, not a reason to make the admin detach first. The
      displaced asset stays in the bucket and reappears as unattached.
      Detaching another organisation's link is a 404, not a 403, so a
      caller cannot learn whether they have one.
- [x] `DELETE .../media/{asset_id}` — remove an uploaded asset and its link.
      This is the destructive one: confirm in the UI, log it with actor and
      module, and refuse when the caller's organisation does not own the asset.

### Availability gate

- [x] **A module with any unlinked media reference is not served to learners**,
      continuously — not only at the moment it goes live. The earlier version
      blocked the `draft` → `live` transition, which misses the case where a
      module goes live complete and a video is deleted afterwards.
- [x] Compute it beside `has_learning_content`, which is already resolved per
      module at `router.py:310` and `router.py:382`.
- [x] **Hide** incomplete modules from the learner's module list rather than
      showing them disabled. A learner who can see a module they cannot open
      raises a support question the admin cannot answer from the learner's side.
- [x] Direct access to `/modules/{id}/learning` for an incomplete module returns
      404, matching every other refusal in Phase 2a so the shape stays uniform.
- [x] The gate is **per organisation**, because the links are. The same module
      can be complete for one organisation and not another, and therefore visible
      to one organisation's learners and hidden from another's.
- [x] Surface incompleteness where an admin will actually see it — the admin
      module list marking "unavailable — 1 media file missing", and ideally the
      deploy notification. A typo in an MDX reference otherwise makes a module
      silently unavailable to everyone, permanently, with the only trace on a
      card nobody has opened. The gate fails safe; it must not fail invisibly.

**[revised 2026-09-13] The gate hides the whole module, assessment included,
and it had to be applied to the entry points as well as the learning routes.**

The wording above says "the learner's module list", and that was read as the
_learning_ list alone. Both learner-facing entry points — the dashboard at
`/teaching` and the module page at `/teaching/{id}` — are served by
`list_question_banks` and `get_question_bank`, which computed `has_learning`
from content on disk and never consulted the media gate. So the learning routes
refused an incomplete module with a 404 while the card in front of them still
offered a way in, and clicking it landed on that 404 with nothing to explain it.

- **The whole module goes, not just its learning half.** The first fix reported
  `has_learning` as false, which removed the "Start learning" action and left
  the card and its assessment. Rejected on review: half a module is not a lesser
  version of it. The author intended a video the learner would never see, and
  the assessment may examine exactly the content that is missing.

- **`_module_is_servable` in `router.py` is the one helper**, used by both
  entry points — `list_question_banks` skips the bank, `get_question_bank`
  raises 404. Per organisation, like every other part of this gate.

- **The consequence is deliberate and sharp**: deleting a video takes the
  assessment away from a learner part-way through it, with no explanation on
  their side. The admin card is the only place the cause is visible, which is
  what makes the last item above matter more than it first appears.

## Phase 6: Transcoding and captions

Only after Phases 0–5 are shipped and a hand-encoded MP4 plays end to end.

**[found 2026-09-12] The gate above was not met, and for a reason worth
recording: four of the five video settings were never wired into Cloud Run.**
Terraform created the buckets, the CDN backend and the signing key in Phase 1,
and mapped `TEACHING_VIDEO_SIGNING_KEY` as a secret — but
`TEACHING_VIDEOS_SOURCE_BUCKET`, `TEACHING_VIDEOS_BUCKET`,
`TEACHING_VIDEO_SIGNING_KEY_NAME` and `TEACHING_VIDEO_BASE_URL` were not passed
to the service. The feature was therefore inert rather than broken: uploads
refuse with 503 for want of a bucket name, and `grant_video_access` falls
through to its local-development branch and mints no cookie at all.

Nothing caught it because every layer was tested in isolation — the cookie
signing has unit tests, the endpoints have router tests, the card has component
tests, and a video plays in Storybook off local disk. The join between them had
never been exercised, which is exactly what this phase's opening gate was there
to force.

`TEACHING_VIDEO_BASE_URL` is `https://${var.app_domain}/videos`, the app's own
host: `app_domain` is `teaching.quill-medical.com` in
`infra/environments/teaching/terraform.tfvars`, and the load balancer routes
`/videos/*` to the backend bucket on that same host, so the cookie stays
same-origin. The other three come from the pipeline module's existing outputs.

**[found 2026-09-12, second attempt] With the settings deployed, the upload
still failed — two further faults, either one sufficient on its own.** The
progress bar appeared for a second and the row reverted to a dropzone, because
the request failed and the `finally` cleared it.

The first is that the **source bucket had no CORS policy**. The browser uploads
straight to `storage.googleapis.com`, which is cross-origin from
`teaching.quill-medical.com`, so it sends a preflight — and a bucket with no
policy refuses it. Nothing reaches GCS and nothing reaches our logs, because the
request never touches the backend. The module now sets `cors` on the source
bucket, naming the app origin explicitly and exposing `Location`, which is what
carries the session URL back.

The second is that **the signed URL and the browser disagreed about the method**.
`create_resumable_upload_url` mints it for `POST` with `x-goog-resumable: start`
— that *begins* a resumable upload, and GCS answers with a session URL the bytes
then go to. The frontend sent a plain `PUT`. The v4 signature covers the method
and headers, so GCS rejects the mismatch. `putToBucket` now does both steps, and
falls back to a single `PUT` for the local development route, which is not a GCS
URL at all.

Both went unnoticed for the same reason as the missing settings: **the tests
stub the upload entirely.** The hook's tests asserted the order of calls — mint,
send, link — against a stub that accepted any request, and the backend's assert
a URL is minted rather than that anything can use it. The stub now models the
handshake, and reverting to a single `PUT` fails five of eleven tests.

**[2026-09-13] The gate is met.** A video was uploaded through the admin card,
played on a slide, and deleted, on a developer machine. Three more faults
surfaced getting there, and all three sat in the same place as the earlier ones
— a join no test crossed, each layer correct on its own.

- **The 10 MB request body cap applied to the upload route.** `main.py` capped
  every body at 10 MB, and rejected on `Content-Length` before a byte was read,
  so the chunked streaming write behind it never ran. The route now has its own
  2 GB ceiling, matched on method and path shape so the middleware needs no
  knowledge of the teaching feature. It cost nothing in the teaching
  environment, where the bytes go straight to GCS and never meet this
  middleware at all — which is exactly why local was the only place it showed.

- **Delete had the mirror of the upload bug.** `delete_media_asset` checked for
  a source bucket and raised 503 before touching anything, so on a machine with
  no bucket the row outlived every attempt to clear it and the card kept
  offering a button that could not work. It now removes the file from the
  module's `learning/` directory instead, keeping the row-first ordering and
  treating a missing file as success, as the bucket path already does.

- **The learner entry points were ungated.** See the revision under Phase 5's
  availability gate.

**What these three have in common is worth more than any of them.** Every fault
in this phase's three attempts has been a join: settings that were never passed,
a CORS policy nobody set, a method the two ends disagreed on, a middleware that
predated the route it blocked, a guard clause written for one branch of an
if/else. None was a mistake inside a layer, and none was catchable by a test of
one. The lesson the gate was written to force has now been demonstrated five
times, and it should be read as an argument for exercising the whole path
locally before the next phase, not as five unrelated bugs.

**Upload failures now name the fault**, rather than showing a status code. A
413 on a video is almost always the file, and "Upload failed (413)" left the
admin to guess between size, format and permissions. `describeUploadFailure`
covers size, type, permission, missing module and server fault; the 5xx case
says explicitly that it is not the file, so a server error does not send
someone re-exporting a lecture.

### Groundwork, surveyed 2026-09-13

**[added 2026-09-13]** What the repository already provides, established by
reading it rather than assuming. Anyone starting this phase cold can take these
as findings and skip the survey.

- **A new job image is one build step, not new machinery.**
  `backend/Dockerfile` is multi-stage and already ships an `admin` target for
  the existing Cloud Run job. `deploy.yml` builds it with a second
  `docker/build-push-action` step (`target: admin`, `if: matrix.service ==
  'backend'`), tagged `quill/admin:{sha}` and `:latest`. A `transcode` target
  follows exactly that shape. `just build-admin <env>` is the matching local
  recipe and is the template for `just build-transcode`.

- **Whisper probably wants its own Dockerfile.** FFmpeg is an `apt-get install`
  on the existing `base` layer. Whisper pulls torch and a multi-gigabyte model,
  which has no business in a layer the API image shares. Judge this when the
  caption job is built; the transcode job does not force the decision.

- **The jobs run as the default compute service account.**
  `infra/modules/cloud-run-job/` has **no** `service_account` variable — unlike
  `infra/modules/cloud-run/`, which does. So both jobs run as
  `{project_number}-compute@developer.gserviceaccount.com`, the same identity
  the backend uses. It already holds `objectAdmin` on the **source** bucket
  (`teaching-video-pipeline/main.tf`, `backend_source_writer`). The transcode
  job needs the same on **processed**, which is one more
  `google_storage_bucket_iam_member` in that module. Adding a service-account
  variable to the job module would be tidier and is not required.

- **`admin_cli.py` is the entrypoint pattern**: environment variables only, no
  arguments and no prompts, because a Cloud Run Job has no terminal. Copy its
  shape — a required-env reader that exits with a clear message on anything
  missing.

- **Terraform does not own the job's image.** `admin_image` is
  `gcr.io/cloudrun/hello:latest` in all three `terraform.tfvars`, and the job
  module sets `lifecycle { ignore_changes = [...containers[0].image] }`. The
  real image is pushed by CI and set by `gcloud run jobs execute --image` at
  call time (see `.github/scripts/deploy/run-migrations.sh`). Follow that: do
  not try to make Terraform track the transcode image.
  **[corrected 2026-09-15] There is no `gcloud run jobs execute --image`.**
  The conclusion above is right and the mechanism named is not. `run-migrations.sh`
  does it in two steps — `gcloud run jobs update --image`, then
  `gcloud run jobs execute` — because the image is a property of the job, not
  of an execution. The Python client agrees: `RunJobRequest.Overrides.ContainerOverride`
  carries `name`, `args`, `env` and `clear_args`, and no image field. So the
  backend cannot choose an image when it invokes, and the deploy sets it once
  per deploy instead.

- **Cloud Run Jobs cost only while running.** They are not services and do not
  idle. The bill is per video, once — replays are served from the CDN and cost
  nothing further. The real cost of this phase is build complexity, not
  runtime. Set each job's timeout deliberately, though: a hung job burns its
  full timeout before failing, and 60 minutes is a long time to wait to find
  out nothing happened.

- **No Eventarc and no Pub/Sub exist anywhere in `infra/`**, and the backend
  has `google-cloud-storage` but not `google-cloud-run`. Both trigger designs
  therefore cost something new — see the trigger item below.

### The object-key contract, which constrains everything here

**[added 2026-09-13] Read this before writing the transcode job.** Phase 0
proved the load balancer does not strip the URL prefix: a request for
`/videos/{org}/{module}/x.mp4` asks the bucket for the object key
`{org}/{module}/x.mp4`. The path and the key must agree, and a mismatch
presents as a 404 on a file that is plainly in the bucket.

**[corrected 2026-09-17] The paragraph above contradicts itself, and the
contradiction cost an afternoon.** If the prefix is _not_ stripped, then
`/videos/{org}/{module}/x.mp4` asks for the key `videos/{org}/{module}/x.mp4`
— with `videos/` included. The sentence states the rule correctly and then
writes down a key that breaks it.

The transcode job followed the key as written, so every rendition landed at
`{org}/{module}/…` while the CDN asked for `videos/{org}/{module}/…`. The
learner saw a black player with a disabled play button; the load balancer
logged a 404 against a file sitting plainly in the bucket, exactly as
predicted.

**Now resolved by stripping the prefix at the edge.** The `/videos/*` path
rule carries `routeAction.urlRewrite.pathPrefixRewrite = "/"`, so the key is
the path after `/videos/` and the object layout is unchanged. The signed
cookie is unaffected: its `URLPrefix` covers the request URL and Cloud CDN
checks it before the rewrite, so the module boundary is exactly where it was.

Chosen over moving the objects under `videos/`, which would have touched five
call sites in `storage.py`, both job CLIs, the cookie prefix and the source
bucket — for a property that reads more neatly and changes nothing.

- **Source** objects are `{org_id}/{module_id}/{asset_id}` with **no
  extension** — `storage.media_object_path()`.
- **Processed** objects must therefore live under the same
  `{org_id}/{module_id}/` prefix, because that is what the signed cookie's
  `URLPrefix` covers and what `base_url` addresses.
- The player composes its URL as `base_url` + the filename that
  `_resolve_video_filename()` returns, which today is `{asset_id}{suffix}`
  from the link's content type. `base_url` comes from `/video-access` and is
  `{TEACHING_VIDEO_BASE_URL}/{org_id}/{module_id}`.

### Decision: the player gets a quality switch

**[decided 2026-09-13]** Phase 6 produces two renditions, and the player as
shipped asks for exactly one file — `LearningSlideOut.video_src` is a single
optional string. Three options were weighed: emit only 720p and change nothing;
add both renditions to the API and let the learner choose; or defer quality
switching to a future HLS piece.

**Chosen: add both renditions to the API and give the learner a quality
control.** A single 720p file would be the smaller change, but it silently
caps quality for everyone to suit the worst connection, and the renditions are
being produced either way — storing a 1080p file nothing can reach is waste
with no upside. Adaptive HLS remains the eventual answer and stays deferred;
this is a manual switch, not an attempt to pre-empt it.

Consequences to hold on to:

- **The API change is additive**, so it is not a breaking change under the
  backend rules: `video_src` stays exactly as it is and keeps pointing at the
  default rendition. New optional fields carry the alternatives. Nothing about
  the existing contract moves, and a stale client keeps working.
- **720p is the default** — what `video_src` resolves to, and what plays
  without the learner touching anything. Hospital wifi is the common case.
- **The names must be deterministic**, because the API returns them and the
  cookie covers the prefix, not each file: `{asset_id}-720p.mp4`,
  `{asset_id}-1080p.mp4`, `{asset_id}-poster.jpg`, `{asset_id}.vtt`.
- **`_resolve_video_filename` is the single place resolution happens**, and it
  already has a local-development fallback to `<ref>.mp4`. Keep that property:
  a developer with a hand-dropped file must still get a playing video with no
  renditions present, so the alternatives have to be optional all the way
  through rather than assumed.

### The checklist

- [x] Cloud Run job `video-transcode` — FFmpeg image, 4 CPU, 4 GB, timeout set
      deliberately rather than left at 60 minutes. Reads from source, writes
      720p and 1080p H.264 plus a poster frame to the processed bucket under
      `{org_id}/{module_id}/`, named from the asset id per the contract above.
      Built on the existing `infra/modules/cloud-run-job/` module, as a
      `transcode` target in `backend/Dockerfile`.
      **[revised 2026-09-09]** The job is what produces the poster, which is why
      the MDX has no `poster` prop — the author names one reference and gets the
      rendition set. Until this phase lands, a hand-encoded MP4 and a
      hand-made poster are uploaded as the same asset's files.
- [x] Grant the compute service account `roles/storage.objectAdmin` on the
      **processed** bucket in `infra/modules/teaching-video-pipeline/`. It has
      this on source already; the transcode job cannot write its output without
      it.
- [x] `backend/scripts/transcode_cli.py`, modelled on `admin_cli.py` —
      environment-variable driven, no arguments. Takes the org, module and asset
      ids, downloads the source object, runs FFmpeg, uploads each output.
- [x] Record on `ModuleMediaLink` what the transcode produced, and have the job
      verify before it records. **[added 2026-09-13]** Which renditions exist is
      read from the link row, never discovered by listing the bucket — see the
      Decisions entry. Needs a migration, and needs the job to reach the
      database, which today it cannot: the CLI talks only to GCS. **Who writes
      this column depends on the trigger question below**, so settle that
      first: if the backend invokes the job it can record completion when the
      job returns and the CLI stays database-free; if Eventarc fires it, the job
      must write its own state.
- [x] Have the transcode job delete its source object once its outputs verify.
      **[added 2026-09-13]** The routine cleanup path, per the **Source
      retention** decision — the 7-day lifecycle rule is only a backstop for
      uploads whose job never ran. Delete after the verification above, never
      before: a source dropped on an unverified encode is unrecoverable.
- [x] Alert on 404s under `/videos/*` from the load balancer's `httpRequest`
      logs. **[added 2026-09-13]** The drift signal, per the Decisions entry:
      a learner requesting a rendition the database claims exists is the one
      symptom that matters, and it is currently invisible. One monitoring rule;
      `infra/modules/monitoring/` is where it belongs.
- [x] Expose the renditions additively in `LearningSlideOut`
      (`features/teaching/schemas.py`) and resolve them in
      `_resolve_video_filename`. `video_src` keeps pointing at 720p; the 1080p
      file, the poster and the captions are new optional fields. Absent files
      must resolve to `None`, not to a broken filename — which is what the link
      column above is for, rather than trusting the naming convention.
- [x] Quality switch in `VideoPlayer.tsx`, defaulting to 720p and offering 1080p
      only when the API returned one. Preserve the playback position across a
      switch — dropping the learner back to the start of a lecture to change
      quality is worse than not offering it. Stories and tests per the
      components rule.
      **[done 2026-09-14]** A Mantine `SegmentedControl`, shown only when the
      API returned a 1080p filename. The names are deterministic, so the
      player could derive one from the other — it deliberately does not, because
      a derived name for a file nobody wrote is a 404 with nothing to tell the
      learner.
      **The seek was verified in a browser, not only against the mock.**
      Switching mid-playback resumes from the same position, seamlessly. That
      mattered because the behaviour depends on a real `HTMLVideoElement`
      firing `canplay` after the source swaps, which no unit test can
      establish — the position is captured before the switch and restored on
      that event, then playback resumes.
      The control sits **below** the frame rather than over it: the browser
      draws its own controls in shadow DOM and decides where they go, so an
      overlay risks covering the play button at some viewport width.
      **A real gap closed on the way**: `posterUrl` and `captionsUrl` were
      props `VideoPlayer` had accepted since Phase 4 and nothing ever passed,
      so the poster and captions the backend returns reached nothing at all.
      `SlideLayoutVideo` now composes every rendition URL from the one grant —
      they all live under the prefix the signed cookie covers, so none needs a
      request of its own.
- [x] Cloud Run job `video-caption` — Whisper-large, 4 CPU, 10 GB, 60-minute
      timeout. Writes WebVTT beside the renditions.
      **[done 2026-09-15]** Built as `backend/Dockerfile.caption` with its
      own pinned `requirements-caption.txt`, which is the decision this
      plan deferred to "judge when the caption job is built". Whisper pulls
      torch; putting it in the shared lock file would inflate the API,
      admin and transcode images with a dependency tree none of them
      imports. The cost is a second dependency file outside `poetry.lock`
      and therefore outside Renovate's view, so it is pinned exactly.
      CPU-only torch via the PyTorch index, because a Cloud Run Job has no
      GPU and the default wheel carries gigabytes of CUDA for nothing.
      **It reads the processed bucket, not the source.** The transcode job
      deletes its master once the renditions verify, so by the time
      captions are wanted the original is usually gone — the 720p rendition
      is the input instead, and carries the same audio for a smaller
      download.
      The model is fetched on first run rather than baked in: a Cloud Run
      Job keeps no disk between executions, so baking it would add
      gigabytes to every push and save nothing on the second run.
- [x] Set `Cache-Control: public, max-age=86400` on every object both jobs write,
      so Cloud CDN actually caches them. Objects written without it will be
      revalidated on every request and the CDN buys us nothing.
      **[half done 2026-09-13]** The transcode job sets it on every output it
      writes, and a test asserts it rather than trusting the constant — this
      is exactly the kind of property that is invisible until a bill arrives.
      **[done 2026-09-15]** The caption job now sets the same constant on
      the WebVTT it writes, and its tests assert it the same way. Both
      halves of this item are covered.
- [x] Trigger both on upload, not from the content repo's deploy workflow.
      **[revised 2026-09-09]** The original wording predates the decision that
      media is uploaded through the admin UI rather than committed to the content
      repository: the deploy workflow never sees a video, so it cannot be the
      trigger. Fire from the upload completing instead, and reflect progress in
      the admin card — a reference whose asset is uploaded but not yet transcoded
      is not yet complete, and the module stays unavailable until it is.
      **[decided 2026-09-13: the backend invokes the job]** The alternative was
      Eventarc on a GCS object-finalise event, which is the more robust of the
      two — it survives an upload that completes without the link call ever
      being made — but it needs a new API enabled, a service agent and IAM,
      none of which this repository uses yet. The backend route is the smaller
      step and fits the existing shape: `link_module_media` already knows the
      moment the bytes landed, already holds credentials, and already has the
      organisation, module and asset ids the job needs. It costs
      `google-cloud-run` in `backend/pyproject.toml`.
      The consequence that matters is that **the backend, not the job, records
      completion** — so the transcode CLI stays database-free and keeps talking
      only to GCS, which is what it was built as. An upload whose link call
      never happens is the accepted gap; the 7-day lifecycle rule sweeps the
      orphaned source, and the module simply stays incomplete and hidden, which
      is the safe direction.
      **[done 2026-09-13, for the transcode job only]** `start_transcode` in
      `features/teaching/transcode.py`, called from `link_module_media` after
      the row is flushed. Ticked because the trigger mechanism is built and the
      decision is settled, but two things named in this item are not done:
      **nothing yet writes `transcoded_at`**, since the invocation is
      deliberately not awaited and no polling or callback exists, so every link
      currently keeps a null transcode state; and the caption job has no
      trigger because it has no job. Both belong to the items below.
- [x] **Let an admin correct the captions.** **[added 2026-09-15]** Whisper
      will get clinical terminology wrong — "caecum" as "seek 'em", drug names
      mangled, abbreviations wrongly expanded — and captions are a WCAG 2.1 AA
      requirement, so a learner relying on them is given the wrong word with
      nothing to signal it. Today nothing in the application reads or writes
      the `.vtt` after the job puts it in the bucket, so there is no way to fix
      one at all.
      **Decided 2026-09-15: a raw WebVTT textarea**, not a cue-by-cue editor.
      The whole file in one editable box on the admin card, saved back as it
      stands. Chosen over a per-cue editor with video sync because it is a
      fraction of the work and makes captions correctable now; the nicer tool
      can follow once there is a real lecture to try it against. The cost is
      that timestamps are edited by hand and a stray character breaks the file
      silently — so the save endpoint should reject a body that does not begin
      `WEBVTT`, which catches the common mistake without pretending to
      validate the format.
      Two endpoints beside the existing media ones in `router.py`, following
      `/admin/modules/{module_id}/media/{asset_id}/…` and gated by
      `_DEP_MANAGE`: one returning the current WebVTT as text, one replacing
      it. Both read and write the processed bucket, where the caption job put
      the file, and the replacement must carry the same `Cache-Control` the
      job sets or the CDN will serve the old text.
      The editor itself belongs on `ModuleMediaCard.tsx`, on the row whose
      asset has captions, so it sits where the admin already manages that
      media rather than on a page of its own. `AdminBankDetailPage.tsx` hosts
      the card and needs no change.
- [x] Captions are reviewed by the content author before a module goes `live` —
      Whisper output on clinical terminology needs a human pass. Surface review
      state on the admin video page.
      **[noted 2026-09-15]** This item asks only to _surface_ review state; it
      never said how a correction gets made, so completing it as written would
      leave an author able to see that captions are wrong and unable to do
      anything about it. The editing item above is what makes "reviewed" mean
      something, and wants building first.
      **[done 2026-09-15]** `captions_reviewed_at` on `ModuleMediaLink`, set by
      saving the captions rather than by a separate "mark as reviewed" button:
      someone who has edited the text has read it, whereas a button that only
      claims review is a box to tick without looking. The admin card shows the
      state per row, so an unreviewed track is visible without opening it.
- [x] Reconcile the availability gate with transcoding. `module_media_is_complete`
      currently treats a linked asset as complete, so a module becomes visible
      the moment the upload is linked and before any rendition exists — a
      learner would reach a slide whose video is not there yet. The gate has to
      account for "uploaded but not yet transcoded", which is a state the model
      does not currently have.
      **[noted 2026-09-14]** The state now exists — `transcoded_at` on
      `ModuleMediaLink` — but the gate does not read it, so the gap is real
      rather than theoretical. It is masked only because **nothing writes that
      column yet**: the backend fires the job and does not wait, and no polling
      or callback records completion. Every link therefore has a null
      timestamp, every module resolves through the fallback branch, and no
      learner can currently reach a missing rendition. The day completions
      start being recorded, the window opens — so this wants doing before the
      caption job rather than after it.

### The 404 alert named the load balancer by its Logging name

**[found 2026-09-15]** Three consecutive applies on `main` failed creating the
video 404 alert policy, with:

```
Field alert_policy.conditions[0].condition_threshold.filter had an invalid
value of "resource.type = "http_load_balancer" AND metric.type =
"logging.googleapis.com/user/quill/video_not_found_teaching"":
The resource name does not represent a known descriptor.
```

- **The resource type was wrong, not the metric.** The error says "the resource
  name", and it means it. A global external load balancer is
  `http_load_balancer` to Logging and `l7_lb_rule` to Monitoring. The metric's
  own log filter correctly uses the first; the alert filter is read by
  Monitoring and must use the second. Verified against the live descriptor,
  which lists `monitoredResourceTypes: [l7_lb_rule]`, and by querying the
  Monitoring API with each spelling — `l7_lb_rule` is accepted,
  `http_load_balancer` returns the identical error.

- **The message misleads, and cost a day.** It reads as though the metric is
  unknown to Monitoring, so the first fix was a 90-second `time_sleep` waiting
  for a descriptor that already existed. That wait has been removed along with
  the `depends_on` in `outputs.tf`; the `time` provider stays in `versions.tf`
  because `wait_for_backend_bucket` still uses it, so this takes one apply
  rather than the two the Phase 0 teardown needed.

- **The browser-error policy was a false precedent.** It says
  `cloud_run_revision` and works, which made the pattern look right. Its
  descriptor genuinely is `cloud_run_revision` — it was matching the
  descriptor all along, not naming a Logging type that happened to be accepted.

- **A log-based metric with no data still registers its descriptor.** The video
  metric has never matched an entry — no learner has requested a missing video
  — yet the descriptor exists. So "wait for data before alerting" is not a
  constraint, and was considered and rejected as an explanation here.

## Phase 7: Cutover

### The pipeline was never connected end to end

**[found 2026-09-15]** Every phase above completed, and an upload still
produced nothing. The parts were each built and tested; the joins between them
were nobody's phase, so three were missing. Found by checking live GCP rather
than reading the code, which looks complete.

- **The jobs ran a placeholder image.** `transcode_image` and `caption_image`
  are `gcr.io/cloudrun/hello:latest`, correctly — the job module sets
  `ignore_changes` on the image and CI owns it, as it does for `admin`. But
  nothing in `deploy.yml` ever pointed the transcode job at the image it
  builds, so the deployed job stayed the placeholder. Fixed: a
  `gcloud run jobs update --image` step, mirroring `run-migrations.sh`.

- **`TEACHING_TRANSCODE_JOB` was never set.** `start_transcode` reads it,
  finds nothing, logs "transcode not configured" and returns None. Every
  upload since the feature shipped has taken that path. Fixed: the variable is
  now set on the backend service from the job's fully-qualified name.

- **The backend had no permission to invoke the job.** The runtime service
  account holds `roles/secretmanager.secretAccessor` and nothing else — not
  the broad editor role a default Compute Engine account is often assumed to
  carry. `start_transcode` would have raised, been swallowed by its own
  try/except, and logged. Fixed: `roles/run.invoker` scoped to the transcode
  job alone.

  This one is worth dwelling on. Both other faults were quiet; this one would
  have stayed quiet **after** the others were fixed, and presented as
  "transcoding mysteriously does nothing". Nothing in the plan anticipated it,
  because the plan reasoned about the trigger design and not about whether the
  caller was allowed to pull the trigger.

- **Nothing recorded that the job had finished**, which was the fault under
  the other three. `start_transcode` fires and deliberately does not wait, so
  `transcoded_at` was written by nothing, anywhere — and that column is what
  the availability gate reads. Fixing the three faults above makes renditions
  appear in the bucket while the database still says they do not exist, so
  every video module would have stayed hidden regardless.

  **[decided 2026-09-15: the job reports back]** A callback, chosen over
  polling the bucket on read and over Eventarc. The job knows what it wrote
  and knows the moment it verified it; the alternatives either put a network
  round trip on a learner's hot path or need an API, a service agent and IAM
  this repository does not otherwise use.

  `POST /api/ci/teaching/transcode-complete`, beside the CI sync endpoint and
  authenticated the same way — a shared token Terraform generates and fills at
  both ends, as it does the video signing key, because two ends holding
  identical bytes is not a thing to have a human type twice.

  Three properties worth recording:

  - **It sits on the plain router, not `teaching_router`.** That router
    carries `requires_feature("teaching")`, which resolves a feature flag
    through the caller's organisation membership — and a Cloud Run Job has no
    user and no organisation. The passport's public router is apart for the
    same reason.
  - **The job reports filenames; the backend maps them to columns.** The
    suffix-to-column mapping stays in `RENDITION_FLAGS`, so a renamed column
    does not mean redeploying a job image. Names only, never paths: the
    prefix is rebuilt from the ids, so a report cannot name a path outside
    its own module.
  - **The callback can never fail the job.** By the time it runs the encode
    has succeeded, the outputs are verified and the source is about to be
    deleted. A failure is logged and the module stays hidden — visible in the
    admin card as "awaiting transcode", which is the safe direction.

- **Captions remain unwired**, deliberately, and are now unblocked: the
  completion report is the hook they hang off, since the caption job needs
  the 720p rendition and nothing previously knew when it existed. Still to
  do: a `TEACHING_CAPTION_JOB` setting, an invoker grant, a deploy step, and
  the call itself.

### The upload was blocked by our own Content Security Policy

**[found 2026-09-15]** The first real upload attempt failed with "Could not
start upload", and no upload has ever succeeded in production — zero `media
linked` entries in thirty days. The cause is not signing, CORS or IAM, all of
which were verified correct:

```
Refused to connect to 'https://storage.googleapis.com/...' because it
violates the following Content Security Policy directive:
"connect-src 'self'"
```

- **The browser never sent the request.** `connect-src 'self'` in
  `caddy/prod/Caddyfile` blocks XHR to any other origin, and the upload goes
  straight to GCS on a signed resumable URL by design — a `POST` to open the
  session, then a `PUT` of the bytes to the session URL GCS returns. Both are
  XHR, so both are `connect-src`.

- **It presents as a network error, not a refusal.** The blocked request fires
  the XHR `error` event with no status, so `startResumableUpload` reports
  "Could not start upload" and the real reason appears only in the browser
  console. That is why the server-side evidence all looked healthy: the
  backend minted the URL, logged it, returned 200, and nothing ever came back
  to it.

- **The policy already carried `storage.googleapis.com` under `img-src`**, for
  question-bank images. Whoever added that reached for the directive the
  images needed and had no reason to think about uploads, which did not exist
  yet.

- **Fixed in `caddy/prod/Caddyfile`, not in Terraform.** The load balancer's
  `custom_response_headers` also sets a CSP, and it was the tempting place to
  look — but it belongs to `google_compute_backend_bucket.landing`, the
  marketing site, which never passes through Caddy. Editing it would have
  changed nothing here. The application's header comes from the Caddy config
  baked into the frontend image.

- **Playback needs no change**: video is served from `/videos/*` on the app's
  own domain through the backend bucket, so it is same-origin.

- [ ] Migrate one real EoEETA lecture from YouTube to GCS end to end and confirm
      playback, seeking, captions, and the resume position from parent-plan
      item 18 all behave.
      **[noted 2026-09-15]** Resume position does not exist to confirm:
      `LearnerProgress` is a frontend type with no model, no column and no
      endpoint behind it. Parent-plan item 18 is correctly unchecked. Either
      build it first or drop it from this item's bar.
- [x] Document the video path in `docs/docs/teaching/index.md` and the storage
      architecture in `docs/docs/backend/files/index.md`.
      **[done 2026-09-15]** `backend/files/index.md` was a "Planned feature"
      page describing a three-layer MinIO architecture for clinical documents.
      MinIO appears nowhere in the codebase, the page mentioned video zero
      times, and nothing linked to it but this plan line. Replaced outright
      rather than appended to, on the instruction that the MinIO plan is old
      and can go — so the page is now the video storage architecture, and its
      mkdocs nav label changed from "Files" to "Teaching video".
      Written from the code and Terraform rather than from this plan, because
      the plan is stale in places the doc must not be: Section 8 of the
      Learning Section plan still says 90-day source retention and an
      unversioned processed bucket, and both are now the opposite.
      `teaching/index.md` gets a shorter "Video" section under its existing
      storage backends, saying why video does not use them, and links across.
- [x] Amend Section 8 of the Learning Section plan to point here, and tick items
      26–30 of its Phase 3 checklist as this plan's phases complete.
      **[done 2026-09-15]** Section 8 now opens with a superseding note
      pointing here and at the storage doc, and records the five things that
      changed in building it: signed cookies rather than signed URLs, 7-day
      source retention with the job deleting its own master, an unversioned
      source bucket, the backend invoking the jobs rather than GitHub Actions,
      and a 20-minute transcode timeout. The original sketch is kept beneath
      it, because the reasoning is only legible against what it replaced.
      **Only 26 and 29 could honestly be ticked**, and the rest was checked
      against live GCP rather than assumed. 27 and 28 are **not** done:
      `transcode_image` and `caption_image` in
      `infra/environments/teaching/terraform.tfvars` are both still
      `gcr.io/cloudrun/hello:latest`, so the deployed jobs are placeholders
      and the Cloud Run API reports **0 executions** for each. The CLIs and
      the image builds in `deploy.yml` exist; nothing has ever run through
      them. That gap between "the code is written" and "the pipeline works"
      is what the cutover item above will hit first.
      30 is not done either: the hosted path was added _alongside_ YouTube
      rather than swapping it — `react-player` is still imported and
      `youtubeId` is still a live branch in `VideoPlayer.tsx`.
      **[superseded 2026-09-17] 27 and 28 are now done.** The deploy points
      both jobs at the images CI builds, and a real lecture has been through
      the whole chain: transcode at 15:11, renditions written and the master
      deleted at 15:15, completion reported, the caption job fired from that
      report, and Whisper finished at 15:18. Both now report executions
      rather than zero. The paragraph above is kept because the gap it names
      was real and took four separate fixes to close — the placeholder
      images, the unset job names, the wrong invoker role, and an import
      that pulled the application config into a job holding no credentials.

### The cookie was sent wrapped in quote marks

**[found 2026-09-17]** Every video failed to play, with a black player and a
disabled play button, long after the object keys, the signing key, the IAM
grants and the path rewrite had each been checked and found correct.

The load balancer log named it once anyone looked at the right line:

```
17:26:51  403  signed_request_invalid_encoding  | Mozilla/5.0 (Macintosh…)
17:27:57  206  response_sent_by_backend         | Python-urllib  (a hand test)
```

- **Starlette quotes a cookie value it thinks needs quoting.** `set_cookie`
  goes through Python's `SimpleCookie`, which wraps any value containing
  characters outside its safe set in double quotes — and a Cloud CDN policy
  is almost entirely `:` and `=`:

  ```
  Cloud-CDN-Cookie="URLPrefix=…:Signature=…"; Path=/videos/
  ```

  The browser stores the quotes and returns them, so the edge sees a policy
  beginning with `"` and refuses it.

- **A hand-built test cookie always worked**, which is why this survived so
  long. Every check made from a terminal set the header directly and passed;
  only a browser reproduced it. The lesson generalises: a test that
  constructs the credential itself cannot detect a fault in how the
  credential is _written_.

- **Fixed by appending the `Set-Cookie` header directly** in
  `grant_video_access`, with a comment saying why it must not be tidied back
  to `set_cookie`. Two tests pin it: one asserts no quotes appear, the other
  asserts `set_cookie` _would_ quote it — so if Starlette ever changes, the
  guard rail tells the next reader they may simplify it rather than leaving
  them to wonder.

### A stale CDN cache made a correct fix look broken

**[found 2026-09-17]** Worth recording as a method failure rather than a
code one. After the path rewrite was applied, a probe object keyed
`videos/1/…` was still being served — apparently proving the rewrite inert.
On that reading the rewrite was declared a failure, an explanation was
constructed for why (`urlRewrite` supposedly working only in `route_rules`),
and a reversal to the rejected option was recommended. All of it was wrong.

- **The probe had been fetched and cached before the rewrite applied.** Cloud
  CDN served it from cache without asking the bucket, so the response
  described the world as it had been minutes earlier.

- **The test that settled it could not be confounded.** The same filename was
  placed at _both_ candidate keys with different contents; whichever came
  back named the key actually requested. A cached copy of one key cannot
  return the other's bytes. It returned the root-keyed content — the rewrite
  worked all along, and `invalidateCache` on `/videos/*` cleared the poisoned
  entries.

- **The general lesson**: behind a CDN, a single probe proves nothing about
  the present. Either invalidate first, or design the probe so that a stale
  answer is distinguishable from a fresh one.

### Progress is now shown, rather than absence asserted

**[done 2026-09-17]** The admin card said "No captions" from the moment a
file landed until Whisper finished — true, useless, and indistinguishable
from "no captions are coming". It sent someone re-uploading a video that was
processing perfectly, twice.

- **Two columns record when each job was invoked**, not merely when it
  finished: `transcode_started_at` and `caption_started_at`. Without them,
  "running" and "never started" are the same state, and the caption job sat
  unconfigured for two days looking exactly like one in flight.

- **The wording is derived server-side** in `media.describe_progress`, so the
  card cannot form a second opinion. Four stages — uploaded, video ready,
  captions written, captions checked — drive `TeachingProgressBar`, with a
  line beneath saying what is happening or that nothing is.

- **A job past its patience is called failed**, at 25 minutes for transcode
  and 70 for captions, both beyond the jobs' own timeouts. Deliberately
  generous: telling someone their upload failed when it was merely slow is
  the mistake this feature exists to prevent.

- **The card polls every ten seconds while work is outstanding** and stops
  when none is. A bar that cannot advance is no better than the line it
  replaced.

## Local development

Video files never enter this repository. They live in the gitignored
`teaching-repos/` bind mount alongside the rest of a module's content, and the
backend serves them straight off disk with no bucket, no signature and no cookie.

**[revised 2026-09-09]** In production media is uploaded through the admin UI and
found through a link row, not by filename — see **Media uploads**. Dev kept the
filename convention below because there was no upload UI to drive and no bucket
to upload to: a file named for its reference key was the simplest thing that let
a developer see a slide play.

**[superseded 2026-09-12] A developer can now upload through the admin card.**
The reasoning above stopped holding once the card existed: the one thing a
developer could not try was the thing they were building, and a stub is a poor
rehearsal for an upload path whose failures turned out to live in the joins.
`create_media_upload_url` returns a local URL when there is no bucket, and a
route behind it streams the body into the module's own `learning/` directory.
The frontend PUTs to whatever URL it is handed, so that is the whole difference
between the two environments — nothing above the endpoint learns which it got.
The receiving route refuses outright where a bucket exists, because writing a
request body into a bind mount is a development affordance rather than a thing
to leave running anywhere real.

Resolution is a **link lookup** now that `ModuleMediaLink` exists: an uploaded
asset is named for its generated id, never for the ref or the uploader's
filename. The `<ref>.mp4` convention survives only as a fallback, so a file
dropped on disk by hand before there was an upload path still plays. That
lookup remains the _only_ place the two models differ — everything above it, the
parser, the API shape and the player, is identical, so nothing downstream learns
which environment it is in.

**[added 2026-09-13] Delete works locally too**, and had to be written
separately: `delete_media_object` is a GCS call, so `_delete_local_media_object`
is its counterpart, removing `{asset_id}{suffix}` from the module's `learning/`
directory. The asset id is validated the same way on the way out as on the way
in, since it lands in a filename and a traversal would reach outside the module.
A missing file is not an error on either path — the link row is what the admin
acts on, and a file already gone must not leave a row that can never be cleared.

The upload also needs the request body cap lifted, which is a property of the
application rather than of this feature: see the 2026-09-13 note under Phase 6.

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

### A stale `node_modules` presents as this plan's own bugs

**[added 2026-09-14]** Worth writing down because it cost time twice in one
session, and both times it looked like something else.

Video work has added two frontend dependencies — `@videojs/react` for the v10
player evaluation, and `@mantine/dropzone` for the admin media card. A checkout
whose `node_modules` predates those commits has them in `package.json` and not
on disk, and the symptom is never "a package is missing":

- **`yarn typecheck:all` reports four errors that look structural** — two
  unresolved modules, an implicit `any` that follows from one of them, and
  `Unknown compiler option 'erasableSyntaxOnly'`, which reads as a TypeScript
  version mismatch in `tsconfig.app.json`. All four are the one cause, and all
  four vanish on `yarn install`. They were treated as an unavoidable baseline
  for a whole session before anyone checked.

- **Storybook fails to boot**, with Vite reporting `Failed to resolve import
  "@videojs/react/video/skin.css"` on repeat. The file genuinely is not at that
  path — it resolves through the package's `"./*.css"` export map — so looking
  for it on disk confirms the wrong conclusion.

`yarn install` from `frontend/` fixes both and leaves `yarn.lock` untouched.
Check it before investigating any frontend failure that names a module.

### Caddy's aborted-range warnings, deferred

**[added 2026-09-11, deliberately not done]** Playing video in development
fills the Caddy log with `aborting with incomplete response` warnings, each a
full structured JSON dump of the request. They are not errors: a video element
asks for a large byte range, buffers what it needs and closes the connection,
so `broken pipe` is the ordinary sound of streaming working.

Options, if the noise becomes worth acting on:

- **`log { level ERROR }` in `caddy/dev/Caddyfile`** — drops warnings while
  keeping real errors. The narrowest fix.
- **Add `format console`** — a compact one-line format for everything Caddy
  logs, not just this.
- **Leave it.** Phase 6's transcoding produces 720p renditions, so the files
  shrink and the browser aborts less; the noise may solve itself.

Two things to weigh first. The level change hides **all** warnings, upstream
timeouts and TLS problems included, so it trades noise now for possible silence
later. And in production an aborted response is a legitimate signal rather than
buffering, so any change belongs in the dev Caddyfile alone — neither
Caddyfile configures logging at all today, so both currently run at Caddy's
defaults.

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
