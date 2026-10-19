# Upload safety plan

Two things are uploaded to Quill: teaching videos, and passport evidence
(a scan of a certificate, a photo of a logbook page). A video is rewritten
by FFmpeg in an isolated Cloud Run job and the original is deleted, so a
learner is served a file Quill wrote. Evidence is different: the bytes a
holder uploads are the bytes an assessor is later shown, unchanged, and a
PDF can carry JavaScript, launch actions and embedded files. The upload
route already checks the file's first bytes against its declared type
(`_looks_like` in `backend/app/features/passport/router.py`), but it does
not look any further in.

This plan closes the gaps that matter, cheapest first: refuse PDFs with
active content and serve evidence sandboxed; re-encode images so nothing
hidden in them, and no EXIF location data, is stored; and have the
transcode job confirm a file is a video before encoding it. Antivirus
scanning is designed but deliberately not started, for reasons given under
Decisions.

## Phase 1: PDFs with active content are refused, and evidence is served sandboxed

- [x] Add `pdf_active_content(data: bytes) -> str | None` in a new
      `backend/app/features/passport/evidence.py`, returning the first
      offending token or None. It scans the bytes for the PDF name
      tokens that make a document do something rather than show
      something: `/JavaScript`, `/JS`, `/OpenAction`, `/AA`, `/Launch`,
      `/EmbeddedFile`, `/RichMedia` and `/XFA`. It also refuses
      `/Encrypt`: an encrypted PDF cannot be rendered into the passport
      export, and refusing it at upload tells the holder now rather than
      at export time. A byte scan rather than a PDF parser: the five
      evidence formats are checked by a short table for the same reason,
      and a parser would be a supply-chain surface for one allow-list.
      The scan's limit is stated in the docstring: a token inside a
      compressed object stream (`/ObjStm`) is invisible to it, which is
      why Phase 1's sandbox header, not this scan, is the control that
      holds. The scan catches the ordinary case and gives the holder a
      clear reason.

- [x] Call it from `upload_evidence`, after `_looks_like` and before
      `blobs.put`, answering 400 with "That PDF contains active content
      (`/JavaScript`), which evidence may not" naming the token. The
      refusal is logged with the token and no filename, since a filename
      may carry a patient identifier.

- [x] Test it in `backend/app/features/passport/evidence_test.py`: a
      minimal PDF passes; one with each token is refused and the message
      names the token; a token appearing inside a text string of a
      legitimate document is still refused (accepted as a false positive,
      because a certificate never needs the word `/Launch` in its text);
      a longer name that merely starts the same way, such as
      `/AAPL:Keywords` written by macOS, is not a match; and a JPEG is
      never scanned, since the tokens are PDF names.

- [x] Add `Content-Security-Policy: sandbox` and
      `Cross-Origin-Resource-Policy: same-origin` to the response from
      `get_certificate_attachment`, the one route that serves evidence
      bytes back. `sandbox` makes the document an opaque origin, so a
      PDF the scan missed cannot reach the app's cookies or API even when
      the browser's viewer runs its script.

- [ ] Check in a real browser, against the dev stack, that a certificate
      page still shows a PDF and an image inline under the new headers.
      Chrome, Firefox and Safari all document rendering under `sandbox`,
      but a header that blanked the certificate page would be worse than
      the risk, so this is confirmed by eye before the pull request
      merges. Not done in the unattended run that built the step: the dev
      stack lives in the main checkout and the run had no browser.

- [x] Pin the headers in `backend/app/features/passport/router_test.py`
      beside the existing `nosniff` check, so a later refactor cannot
      drop one silently. (The plan first named
      `backend/tests/passport_api_contract_test.py`; the `nosniff` check
      turned out to live in the router's own test file.)

## Phase 2: Images are re-encoded at upload

- [x] Add `pillow` and `pillow-heif` to `backend/pyproject.toml`, pinned
      in the same style as the other dependencies, with a comment saying
      why: evidence images are decoded and written again so nothing
      hidden in the file is stored, and so EXIF is dropped. Both ship
      wheels that bundle their native libraries, so `backend/Dockerfile`
      gains no apt package. Rebuild the test image with `just utr`.
      Found on 2026-10-18: Pillow 12.3.0 was already in `poetry.lock` as
      a dependency of reportlab, so only `pillow-heif` 1.8.1 is new.

- [x] Add `sanitise_image(data: bytes, media_type: str) -> tuple[bytes,
      str]` to `evidence.py`, returning the bytes to store and their
      type. It opens the image with Pillow, with
      `Image.MAX_IMAGE_PIXELS` set explicitly to 50 million so a
      decompression bomb is refused rather than decoded, and saves a
      fresh file with no `exif`, `icc_profile` or XMP: a photograph
      taken on a phone carries the GPS position it was taken at, and for
      a clinician photographing a certificate at home that is their
      address. JPEG is saved with `quality="keep"`, which reuses the
      source's quantisation tables so a scan is not degraded; PNG is
      lossless and saved as PNG; WebP is saved as WebP at quality 90;
      HEIC is decoded through `pillow-heif` and saved as JPEG at quality
      90, because no browser but Safari displays HEIC and the assessor's
      page would otherwise show a broken image. The returned type is
      therefore `image/jpeg` for a HEIC upload. Animation is dropped
      (first frame only); evidence is a still.

      As built: `quality="keep"` cannot be used, because applying the
      EXIF orientation makes a copy that is no longer a `JpegImageFile`;
      the source's quantisation tables are read first and passed as
      `qtables=` instead, which is what `keep` does underneath. HEIC and
      WebP are saved at quality 95 rather than 90, since a scan is read
      for its small print. The pixel limit is enforced by making
      Pillow's own `DecompressionBombWarning` an error, which fires from
      the header before a pixel is decoded, rather than by a second
      check of the same numbers.

- [x] Call it from `upload_evidence` for the four image types, before
      hashing, so the hash the holder is handed is the hash of what Quill
      stores. See Decisions for why the stored bytes may differ from the
      uploaded ones. A file Pillow cannot decode, or one over the pixel
      limit, answers 400 "That image could not be read". The
      `media_type` passed to `blobs.put` is the returned one, so a HEIC
      upload is recorded as `image/jpeg` and `EvidenceUploadOut` says so;
      the certificate form then names it by that type, and the
      second `_looks_like` check when a certificate names its evidence
      passes against the JPEG bytes.

- [x] Test it in `evidence_test.py`: a JPEG written with EXIF GPS tags
      comes back without any EXIF; a PNG with a `tEXt` chunk comes back
      without it; a HEIC comes back as JPEG bytes with `image/jpeg`; an
      image over the pixel limit is refused; bytes that are not an image
      are refused; and the same input always produces the same output,
      since the blob store relies on a retried upload hashing the same.
      The HEIC fixture is a tiny file written by `pillow-heif` in the
      test itself rather than a binary checked in. The three router
      tests that uploaded a bare PNG header now upload a real two-pixel
      PNG, since a header with nothing behind it no longer decodes; that
      case became its own test of the refusal.

- [x] Update the comment on `ACCEPTED_EVIDENCE_TYPES` in
      `frontend/src/components/passport/evidenceFormat.ts` and the
      certificate uploader's copy, if any, to say a HEIC is stored as a
      JPEG, and check `PassportCertificatePage.test.tsx` still passes
      with an upload that answers `image/jpeg` for a `.heic` file.

## Phase 3: The transcode job confirms a file is a video before encoding it

- [x] Add `probe_container(path) -> tuple[str, bool]` to
      `backend/scripts/transcode_cli.py`, returning FFprobe's
      `format_name` and whether a video stream is present, in the shape
      of `has_audio_stream` in `caption_cli.py`. `transcode()` calls it
      straight after the download and fails with "Not a supported video
      (format: ...)" unless the format is one of `mov,mp4,m4a,3gp,3g2,mj2`
      or `matroska,webm` and a video stream exists. Today a non-video
      upload fails inside the 720p encode with FFmpeg's own message,
      which reads as a broken job rather than a wrong file; this makes
      the refusal deliberate and names the cause, and it stops FFmpeg
      from parsing a file that only claimed to be a video. The backend
      never sees these bytes in production, since the browser uploads
      straight to the source bucket on a resumable URL, so the job is the
      first place the file can be looked at. As built, FFprobe answers in
      JSON (`-of json`) rather than CSV, so the container and the stream
      types are read by name rather than by line order, and the function
      returns None where FFprobe cannot answer.

- [x] Test it in `backend/tests/transcode_cli_test.py` with
      `subprocess.run` patched, as the caption tests do: a `mov,mp4`
      format with a video stream proceeds; a `matroska,webm` one
      proceeds; `image2` is refused before any encode runs; a format with
      no video stream is refused; and a probe that fails lets the encode
      try, so FFmpeg's error is the one logged.

- [x] Check the first bytes in the local development upload route
      (`upload_media_content` in
      `backend/app/features/teaching/router.py`): `ftyp` at offset 4 for
      `video/mp4` and `video/quicktime`, the EBML header
      `1A 45 DF A3` for `video/webm`. The first chunk of the stream is
      enough. This route only exists on a developer's machine, so it is
      the smallest step here, but it keeps the two paths honest with each
      other: the production path refuses in the job, the local path
      refuses at the door. The check is `looks_like_video` in
      `media_uploads.py`, and the route's existing tests now send bytes
      that begin as an MP4 or a WebM does.

## Phase 4: Every upload is scanned for malware before it is served

Decided on 19 October 2026: built now rather than waiting for a
questionnaire. Quill will meet NHS requirements for the NHS tenants it
expects to have, and the Data Security and Protection Toolkit, DTAC and
Cyber Essentials all ask that files entering a system are scanned for
malware. "Yes, every upload, before anyone can open it, with the
definition date recorded" is the answer to have ready; the mechanism
below is what makes it true.

The shape follows the transcode and caption jobs: a Cloud Run Job built
from its own Dockerfile, started by the backend with the object to scan,
reporting back with a Google identity token. Nothing is served until the
report says clean, and a file the scanner names is deleted and its
upload marked, so the person who uploaded it can see why it went.

### Unit 1: the scan job

- [x] Add `backend/Dockerfile.scan`, from the same pinned Python base
      image as every other backend image, with Debian's `clamav`
      package (`clamscan` and `freshclam`) installed by apt. `freshclam`
      runs once at build, so the image carries a definition database
      from the day it was built; `deploy.yml` builds it on every backend
      deploy, so the definitions are never older than the last deploy.
      No new image to mirror: ClamAV comes from the Debian archive the
      base image already uses, which keeps to the rule of not adding a
      thing to monitor. Dependencies in `backend/requirements-scan.txt`,
      pinned exactly as `requirements-caption.txt` is: only
      `google-cloud-storage`, since the identity token comes from the
      metadata server through `app/features/teaching/job_identity.py`,
      which uses the standard library.

- [x] Add `backend/scripts/scan_cli.py`, in the shape of
      `caption_cli.py`: environment variables only. `SCAN_BUCKET` and
      `SCAN_OBJECT` name the object; `SCAN_CALLBACK_URL` and
      `SCAN_CALLBACK_AUDIENCE` say where to report. The job downloads
      the object to a temporary file, runs `freshclam` with a 60 second
      ceiling first (best effort: Cloud NAT gives the job a way out, as
      it gives the caption job its Whisper model, and a refresh that
      fails leaves the baked definitions in place), then runs
      `clamscan --no-summary --infected` over the file. Exit 0 is clean,
      1 is infected with the signature name on stdout, anything else is
      a scanner fault. It reports `{bucket, object, verdict,
      signature, definitions}` where `definitions` is the database
      version and date from `clamscan --version`, so the record can say
      not only that a file was scanned but with what. A scanner fault is
      reported as `verdict: "failed"` rather than left silent, so the
      upload shows as needing attention instead of waiting for ever.
      **The job never deletes anything**: it holds read access only, and
      the backend acts on the verdict.

- [x] Test it in `backend/tests/scan_cli_test.py`, with `subprocess.run`
      and the storage client patched as the caption tests do: the three
      exit codes map to the three verdicts; the signature is read from
      stdout; the definitions string is parsed from `clamscan --version`;
      a failed `freshclam` does not stop the scan; the report carries
      the object name and no local path; and a missing variable exits 1.

- [x] Build and push the image in `deploy.yml` beside the caption image,
      tagged `quill/scan`, and point `quill-scan-<env>` at it in the
      deploy job as the caption job is pointed. The job will not exist
      until Unit 4 applies, so the pointing step tolerates a missing job
      until then (`|| true` with a comment naming Unit 4, removed there).

### Unit 2: the backend records a scan

- [ ] Add an `upload_scan` table in `backend/app/models.py` and its
      migration: `bucket`, `object_key`, `requested_at`, `scanned_at`,
      `verdict` (`clean`, `infected` or `failed`, validated in code as
      `MEMBER_CAPACITIES` is rather than as a database enum),
      `signature` and `definitions`, unique on `(bucket, object_key)`.
      One table for both kinds of upload rather than columns on
      `module_media_link` and a field on the passport `Attachment`: the
      passport record is hashed, so a new field there would move every
      existing fingerprint, and one table means one callback, one
      recorder and one question, "is this object clean?", asked the same
      way by both. A row with `scanned_at` null is a scan requested and
      not yet answered.

- [ ] Add `backend/app/uploads/scan.py` with `request_scan(db, bucket,
      object_key)`, which writes the row and fires the job through
      `run_v2` exactly as `start_caption` does, reading `UPLOAD_SCAN_JOB`
      from settings; `scan_is_configured()`; `record_verdict(db, bucket,
      object_key, verdict, signature, definitions)`; and `verdict_for(db,
      bucket, object_key) -> ScanVerdict | None`. Where no job is
      configured (development, the CI stack) nothing is requested and
      `verdict_for` is never consulted, the same reading as the
      transcode gate: an absent job is development, not a fault.

- [ ] Add `POST /api/ci/uploads/scan-complete` in a new
      `backend/app/uploads/ci_router.py`, guarded by
      `require_job_identity` as the teaching callbacks are, and included
      from `main.py` under the API prefix. It records the verdict. On
      `infected` it deletes the object from the bucket itself, through
      the backend's own credentials, and logs the signature with the
      object key and nothing else. It is listed in
      `every_route_is_guarded_test.py` with the other job callbacks.

- [ ] Test the recorder and the route: a request writes a row and fires
      the job; a clean report fills it in; an infected report deletes
      the object and keeps the row; a failed report is recorded as
      failed; a report for an object nobody asked to scan is refused
      404; the identity checks are shared with the other callbacks
      through `ci_media_callback_refusals_test.py`.

### Unit 3: nothing is served until its scan says clean

- [ ] Teaching: `link_upload` in `media_uploads.py` requests a scan of
      the source object where a scan job is configured, and fires the
      transcode only where none is; the scan callback fires the
      transcode on `clean`, so the chain is upload, scan, transcode,
      caption. `describe_progress` says "Checking the upload for
      malware" while the scan is unanswered, "Upload refused: malware
      found (<signature>)" on `infected` as a final state, and "The
      malware check failed; upload again" on `failed`, within the first
      of the four stages so the bar's scale does not change. The
      transcode never runs on a file that was not scanned clean, so
      `is_servable` needs no new branch.

- [ ] Passport: `upload_evidence` requests a scan of the blob after
      `blobs.put` where a job is configured. `get_certificate_attachment`
      answers 409 "This file is still being checked" until the verdict
      is clean, and 410 "This file was removed: malware was found" on
      infected. `AttachmentOut` gains `scan_state` (`pending`, `clean`,
      `infected`, `failed`, or `clean` where no job is configured),
      additive, so the certificate page can say so rather than show a
      broken image. The export bundle and PDF include only attachments
      whose verdict is clean.

- [ ] Frontend: `PassportCertificatePage` shows a short notice in place
      of `Document` for an attachment whose `scan_state` is not `clean`,
      using `StateMessage`. The admin media card needs no change: its
      label comes from `describe_progress`.

- [ ] Tests: the teaching chain in `media_uploads_test.py` and
      `ci_media_test.py` (scan requested at link, transcode fired by the
      clean verdict, not fired on infected); the passport gate in
      `router_test.py` (409 before, 200 after clean, 410 after infected,
      `scan_state` on the certificate); and the certificate page's notice
      in `PassportCertificatePage.test.tsx`.

### Unit 4: the job exists in every environment

- [ ] Terraform: a `scan` identity in `local.runtime_workload_secrets`
      (no secrets), `roles/storage.objectViewer` on the passport bucket
      and, where the teaching product is on, the video source bucket;
      `module.cloud_run_scan_job` from `modules/cloud-run-job` with
      `vpc_egress = "ALL_TRAFFIC"`, 1 CPU, 2 GiB (ClamAV loads its
      database into memory, about 1.3 GiB), a 10 minute timeout, and
      `SCAN_CALLBACK_URL`/`SCAN_CALLBACK_AUDIENCE` as the caption job
      has; the backend's `jobsExecutorWithOverrides` grant extended to
      it; `UPLOAD_SCAN_JOB` in the backend's env and the scan account
      added to `TEACHING_JOB_CALLBACK_CALLERS`; a `scan_image` variable
      with the placeholder image in `terraform.tfvars`. The job is not
      gated on `is_teaching_product`: passport evidence is uploaded in
      every product.

- [ ] After the merge, check the Terraform run applied, then re-run
      `deploy.yml` so the backend revision carrying the new env takes
      traffic and the job is pointed at the real image (a Terraform
      revision gets no traffic on its own). Remove the `|| true` from
      Unit 1's pointing step in the same pull request as this unit.

- [ ] Prove it end to end in App production: upload a file containing
      the EICAR test string as passport evidence, see it refused with
      the signature named, and confirm the object is gone from the
      bucket; upload a real scan and see it served once the verdict
      arrives. Record the definitions date the report carried.

## Decisions

- **Antivirus last, and built ahead of being asked** - ClamAV is
  signature-based and catches known malware in files nobody on this
  platform executes, so it was first planned as deferred: the attacks
  that reach an assessor's browser are a PDF's own features, which
  Phases 1 and 2 address directly. On 19 October 2026 that was reversed:
  Quill will meet NHS requirements for the NHS tenants it expects, and
  the DSPT, DTAC and Cyber Essentials all ask for malware scanning of
  files entering the system. Built now, the answer is ready before the
  question. The cost is kept down by taking ClamAV from the Debian
  archive the base image already uses, so there is no new image to
  mirror and no new source to watch.

- **The backend deletes an infected file, not the job** - the job holds
  read access only, so a fault in the scanner cannot remove anything.
  The backend already holds write access to both buckets, and acting on
  the verdict in one place keeps the record and the bucket in step.

- **A scanner fault is a verdict, not silence** - `failed` is recorded
  and shown, so an upload the scanner could not read says so rather
  than waiting for a clean that never comes.

- **Never a third-party scanning service** - VirusTotal and its like
  would mean sending a holder's certificates, and whatever patient
  identifier a logbook page carries, to a company that publishes samples
  to other researchers. The scan, if it comes, runs inside the project.

- **The stored image is not byte-for-byte the uploaded one** - a blob is
  addressed by the SHA-256 of its bytes so a holder can check their
  record with nothing but a checksum tool. Re-encoding before hashing
  keeps that promise for what Quill holds and hands back in the export,
  which is the thing a holder would ever check; it breaks only a
  comparison against the original file still on their phone, which the
  passport has never offered. The alternative, storing the original and
  serving a sanitised copy, would keep the EXIF location data on disk
  for the lifetime of the record, which is the thing being removed.

- **A byte scan for PDF tokens, not a PDF parser** - it cannot see inside
  compressed object streams, and the plan says so where the scan is
  written. The sandbox header is what makes a missed token harmless. A
  parser would see more and would be a second dependency parsing hostile
  input in the API process, where the sandbox already covers the gap.

- **HEIC becomes JPEG** - the holder chose HEIC because their phone did;
  the assessor's browser almost certainly cannot show it. Converting at
  upload spares the serving route a conversion on every view and makes
  the stored type one every browser displays.
