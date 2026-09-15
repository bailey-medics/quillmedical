# Teaching video storage

How a licensed lecture gets from an admin's laptop to a learner's player, and
what stops anyone else watching it.

Video is the only large binary this application stores. It is served from a
private Google Cloud Storage bucket behind Cloud CDN, and authorised by a
signed cookie rather than by the application streaming bytes itself.

## Why not simply serve it

A lecture is hundreds of megabytes and licensed per organisation. Two
constraints follow, and between them they rule out the obvious designs:

- **The application must not be in the data path.** Streaming through Cloud
  Run would pay for the transfer twice, hold a request open for the length of
  the lecture, and make seeking somebody else's problem.
- **A public URL is not acceptable.** Content is licensed to an organisation,
  so a link nobody can guess but which works forever is a leak waiting to be
  forwarded.

Signed cookies at the CDN edge satisfy both. The application decides _whether_
a learner may watch; the edge then serves the bytes without the request ever
reaching the application again.

## The path

```text
  admin's browser
        │  resumable upload, straight to GCS
        ▼
  quill-teaching-videos-source-teaching        (private, 7-day lifecycle)
        │
        │  Cloud Run job: video-transcode  (FFmpeg)
        ▼
  quill-teaching-videos-processed-teaching     (private, versioned)
        │      720p + 1080p mp4, poster jpg, WebVTT captions
        │
        │  Cloud Run job: video-caption    (Whisper)
        ▼
  Cloud CDN  ──  backend bucket  ──  /videos/*  on the app's own domain
        │
        │  request carries Cloud-CDN-Cookie
        ▼
  learner's player
```

Nothing in that chain is public. The load balancer reaches the processed
bucket through a dedicated fill service account; the browser reaches it only
through the CDN, and only with a valid cookie.

## Buckets

Both live in `europe-west2`, with uniform bucket-level access and public
access prevention enforced. Defined in
`infra/modules/teaching-video-pipeline/`.

- **Source** — `quill-teaching-videos-source-teaching`. Raw uploads. Not
  versioned: a replaced upload is simply a new upload. A CORS policy allows
  `POST`, `PUT` and `OPTIONS` from the app origin and exposes `Location`,
  which is what carries the resumable session URL back to the browser.

- **Processed** — `quill-teaching-videos-processed-teaching`. What learners
  are served. Versioned, because losing a transcode means re-running a job
  over a source that may already be gone.

### Why the source bucket empties itself

The transcode job deletes its own master once it has verified the renditions
are readable. The bucket's 7-day lifecycle rule is a backstop for uploads
whose job never ran, not the routine path.

Seven days rather than ninety, deliberately: a never-transcoded upload then
fails loudly within a week, while re-uploading is merely annoying. At ninety
days it would fail silently, long after anyone remembers the lecture, with the
master unrecoverable.

## Object keys

The load balancer does **not** strip the URL prefix. A request for
`/videos/{org_id}/{module_id}/{asset_id}-720p.mp4` fetches the bucket key
`{org_id}/{module_id}/{asset_id}-720p.mp4` — the path after `/videos/` is the
object key exactly.

Per uploaded asset, the jobs produce:

- `{asset_id}-720p.mp4` — the default. Chosen because hospital wifi is the
  common case.
- `{asset_id}-1080p.mp4` — offered through the player's quality switch.
- `{asset_id}-poster.jpg` — a frame shown before playback starts.
- `{asset_id}.vtt` — WebVTT captions, a WCAG 2.1 AA requirement.

All four are uploaded with `Cache-Control: public, max-age=86400`. "Public"
here describes cacheability at the edge, not reachability: the CDN still
refuses a request without a valid cookie.

Assets are named for a generated id, never for the uploader's filename or the
MDX reference key. Which renditions exist is recorded on the `ModuleMediaLink`
row — the player trusts that record rather than listing the bucket, so a
missing object shows up as a 404 alert rather than a silent failure.

## The signed cookie

Minted by `POST /api/teaching/modules/{module_id}/video-access`, implemented in
`backend/app/features/teaching/video_access.py`.

The policy Cloud CDN expects, HMAC-SHA1 over the string as written:

```text
URLPrefix=<base64url>:Expires=<unix>:KeyName=<name>:Signature=<base64url>
```

Three properties carry the design:

- **Scoped to a prefix, not a URL.** One grant covers everything beneath
  `{base}/{org_id}/{module_id}/`, so the player fetches renditions, poster and
  captions without a round trip per file. The trailing slash is what stops a
  cookie for `module-1` also covering `module-10`.

- **Signing is arithmetic.** An HMAC over a shared secret, so minting needs no
  GCS credentials and no API call. This is why the backend holds no IAM role
  at all on the video bucket.

- **Short-lived.** Thirty minutes by default
  (`TEACHING_VIDEO_COOKIE_TTL_MINUTES`). A grant outlives logout and outlives
  an admin revoking access, so the window is bounded and the frontend
  refreshes silently.

The cookie is set with `path=/videos/`, `Secure`, `HttpOnly`, `SameSite=Lax`
and no `Domain` attribute — host-only, so it cannot leak to a sibling
subdomain, and it is not sent on ordinary API or page requests.

HMAC-SHA1 is Cloud CDN's scheme, not a choice made here. SHA-1's collision
weakness does not apply to an HMAC construction, but it will be flagged in
review, so it is recorded as a platform constraint.

### What the endpoint refuses

The same gate as the learning content routes, so the two cannot drift apart.
A module that is not yours, not live, or does not exist all return 404 —
identically, so the endpoint cannot be used to enumerate what exists. An
unsafe `module_id` is refused before anything is signed, because the prefix
_is_ the authorisation boundary. The endpoint is rate-limited to 10 per
minute: an unlimited endpoint returning credentials is an oracle.

## The signing key

Generated by Terraform as `random_bytes`, converted to base64url (Cloud CDN's
encoding, which `random_bytes` does not produce directly), and then used
twice: installed on the CDN key as `teaching-video-key`, and written to Secret
Manager for the backend to read as `TEACHING_VIDEO_SIGNING_KEY`.

The same bytes on both sides is the whole requirement — the backend mints,
the edge verifies, and neither works if they differ.

## Local development

There is no bucket, no CDN, no signature and no cookie. `TEACHING_VIDEOS_BUCKET`
is unset, so `/video-access` returns a base URL of
`/api/teaching/videos/{module_id}` and sets no cookie; a local route streams
the file off disk from the module's `learning/` directory.

"No cookie was set" is the normal answer in development rather than an error,
so the frontend runs the same code path in both environments and nothing above
the endpoint learns which it got.

## Monitoring

A log-based metric counts 404s under `/videos/`, and an alert policy fires on
them. That specifically means the database says a rendition exists and the
bucket disagrees — a 403 is the cookie gate working normally and is not
counted.

It is an alert rather than a reconciliation sweep: the transcode job verifies
its own uploads before recording them, so the only way to reach this state is
a hand-deletion, and a check that never finds anything stops being read.

## Clinical documents

Not this. Clinical letters and patient documents are held in the three-database
architecture described under [Backend](../index.md); there is no object storage
layer for patient data, and teaching video contains none.
