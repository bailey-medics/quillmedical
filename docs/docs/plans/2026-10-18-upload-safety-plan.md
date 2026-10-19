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

- [x] Add an `upload_scan` table (built in
      `backend/app/features/uploads/models.py`, beside the feature's own
      code rather than in `app/models.py`) and its
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

- [x] Add `backend/app/features/uploads/scan.py` with `request_scan(db, bucket,
      object_key)`, which writes the row and fires the job through
      `run_v2` exactly as `start_caption` does, reading `UPLOAD_SCAN_JOB`
      from settings; `scan_is_configured()`; `record_verdict(db, bucket,
      object_key, verdict, signature, definitions)`; and `verdict_for(db,
      bucket, object_key) -> ScanVerdict | None`. Where no job is
      configured (development, the CI stack) nothing is requested and
      `verdict_for` is never consulted, the same reading as the
      transcode gate: an absent job is development, not a fault.

- [x] Add `POST /api/ci/uploads/scan-complete` in a new
      `backend/app/features/uploads/ci_router.py`, guarded by
      `require_job_identity` as the teaching callbacks are, and included
      from `main.py` under the API prefix. It records the verdict. On
      `infected` it deletes the object from the bucket itself, through
      the backend's own credentials, and logs the signature with the
      object key and nothing else. It is listed in
      `every_route_is_guarded_test.py` with the other job callbacks.

- [x] Test the recorder and the route: a request writes a row and fires
      the job; a clean report fills it in; an infected report deletes
      the object and keeps the row; a failed report is recorded as
      failed; a report for an object nobody asked to scan is refused
      404; the identity checks are shared with the other callbacks
      through `ci_media_callback_refusals_test.py`. As built, the
      refusals are pinned in `tests/ci_scan_complete_test.py` itself: the
      media refusals file asserts the media routes' own 404 wording, and
      the guard's branches are already covered in
      `app/deps_job_identity_test.py`. The route-guard test needed no
      entry, since it recognises `require_job_identity` on its own.

### Unit 3: nothing is served until its scan says clean

- [x] Teaching: `link_upload` in `media_uploads.py` requests a scan of
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

- [x] Passport: `upload_evidence` requests a scan of the blob after
      `blobs.put` where a job is configured. `get_certificate_attachment`
      answers 409 "This file is still being checked" until the verdict
      is clean, and 410 "This file was removed: malware was found" on
      infected. `AttachmentOut` gains `scan_state` (`pending`, `clean`,
      `infected`, `failed`, or `clean` where no job is configured),
      additive, so the certificate page can say so rather than show a
      broken image. The export bundle and PDF include only attachments
      whose verdict is clean. (As built: the PDF export never embedded
      attachments, so only the bundle needed the filter; and where a
      scan job is configured, a file with no scan row is treated as
      pending rather than served, so nothing is handed out on the
      strength of having been uploaded. No real users yet, so no
      pre-scanning evidence is hidden by that.)

- [x] Frontend: `PassportCertificatePage` shows a short notice in place
      of `Document` for an attachment whose `scan_state` is not `clean`,
      using `StateMessage`. The admin media card needs no change: its
      label comes from `describe_progress`.

- [x] Tests: the teaching chain in `media_uploads_test.py` and
      `ci_media_test.py` (scan requested at link, transcode fired by the
      clean verdict, not fired on infected); the passport gate in
      `router_test.py` (409 before, 200 after clean, 410 after infected,
      `scan_state` on the certificate); and the certificate page's notice
      in `PassportCertificatePage.test.tsx`.

### Unit 4: the job exists in every environment

- [x] Terraform: a `scan` identity in `local.runtime_workload_secrets`
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
      every product. As built, `TEACHING_JOB_CALLBACK_AUDIENCE` and
      `TEACHING_JOB_CALLBACK_CALLERS` moved out of the teaching-only
      block to the unconditional one, since the scan job reports in
      every product; the video jobs' accounts are concatenated in where
      the teaching product is on. The local Terraform (1.15.0) is older
      than `versions.tf` requires, so the change was checked by
      `terraform fmt` here and by the plan CI posts on the pull request.

- [x] After the merge, check the Terraform run applied, then re-run
      `deploy.yml` so the backend revision carrying the new env takes
      traffic and the job is pointed at the real image (a Terraform
      revision gets no traffic on its own). Remove the `|| true` from
      Unit 1's pointing step in the same pull request as this unit.

      Done on 19 October 2026. The deploy after the merge failed at the
      scan job step: `github-deploy` could not act as `run-scan`, the
      grant having been made by hand for the older accounts. Terraform
      now grants it for every runtime account (#2134). Then `deploy.yml`
      was run by hand: the serving revision carried `UPLOAD_SCAN_JOB` and
      accepted `run-scan`'s reports, and the job ran the real image.

- [ ] Prove it end to end in App production: upload a file containing
      the EICAR test string as passport evidence, see it refused with
      the signature named, and confirm the object is gone from the
      bucket; upload a real scan and see it served once the verdict
      arrives. Record the definitions date the report carried.

      The EICAR half is done, on 19 October 2026: `eicar-in-a-pdf.pdf`, a
      real PDF carrying the EICAR string in its content stream, was
      uploaded as passport evidence. The job reported `Eicar-Signature`
      about 35 seconds later, the backend recorded the verdict and the
      object was gone from `quill-passports-app`. Still to do: a real
      scan, seen to show once its verdict arrives, which is also the
      first sight of the Phase 6 drop area in App production.

### Unit 5: the image proves it detects EICAR

Added on 19 October 2026, after the question "do the tests ever offer
ClamAV an unsafe file?" The answer was no: the unit tests stand in for
the scanner, and only the manual step at the end of Unit 4 puts a real
test file through the real engine.

- [x] Add a build step to `backend/Dockerfile.scan`, after `freshclam`,
      that writes the EICAR test string (the harmless string every
      antivirus must detect, written at build time so no file in the
      repository trips a scanner) and runs `clamscan` over it. The build
      fails unless `clamscan` exits 1 and names an EICAR signature, so
      every image `deploy.yml` builds has proved that its engine runs
      and its baked definitions detect something. It does not replace
      the post-deploy EICAR upload in Unit 4, which proves the chain
      through the app; it is the check that runs without anyone.

## Phase 5: Nobody can add a way in that skips the scan

Decided on 19 October 2026, after the question "is there a test that
everything uploaded to a bucket is scanned?" There was not: a new upload
route with no scan would have passed every check. These make forgetting
fail CI, and close the one way files reached a bucket without being scanned.

- [x] Add `backend/tests/every_upload_is_scanned_test.py`, part one:
      walk every route with `served_routes(app)`, as
      `every_route_is_guarded_test.py` does, and find each one that
      takes a file in. A route takes a file in when a body parameter is
      an `UploadFile`, or when its endpoint reads the raw request body
      (`request.stream()`, `request.body()`), or when it hands out a
      URL a browser uploads to (`create_resumable_upload_url`). Each
      must be listed in `UPLOADS` with a reason starting `scanned:` or
      `exempt:`. The list fails in both directions, as `PUBLIC` does: a
      new route fails until it is listed, and a listed route that no
      longer takes a file fails until it is taken out. A floor on the
      count, and a deliberately planted unlisted route in a throwaway
      app, prove the walk can fail.

- [x] Part two of the same file: read the syntax tree of everything
      under `app/` (tests excluded) for calls that write to a bucket
      (`upload_from_string`, `upload_from_filename`, `upload_from_file`,
      `create_resumable_upload_url`, and the blob store's `put`). Each
      call site, named by module and enclosing function, must be listed
      in `BUCKET_WRITES` with a reason starting `scanned:` or
      `not an upload:`. That catches a file that arrives some other way
      than a route parameter, such as inside a JSON body, and a new
      bucket written to by code nobody thought of as an upload. Fails in
      both directions, with a floor and a planted fault, as part one.

- [x] Scan the teaching repositories' content before it reaches the
      teaching bucket. Add
      `.github/scripts/teaching-pipeline/scan-content.sh`, which runs
      `clamscan --recursive --infected` over the modules directory and
      fails the job on anything found, naming each file, and on a
      scanner error too, so it fails closed. Call it from the `validate`
      job of `teaching-pipeline.yml`, after installing ClamAV from the
      runner's Ubuntu archive and refreshing its definitions. In
      `validate` rather than `deploy`: `validate` is the required check
      a content pull request must pass, the tree that reaches `main` is
      byte-identical to the one it checked (the content ruleset enforces
      that, which is why `deploy` does not re-validate), and an author
      hears about it on the pull request rather than after merging. The
      images arrive through Git LFS, which `validate` already checks out,
      so it is the real bytes that are scanned. Tested with a `clamscan`
      stub in `scan-content.bats`, as `sync-to-gcs.bats` stubs `gsutil`.

      As built: the walks found five routes that take a file in (passport
      evidence and the teaching upload URL, scanned; the development-only
      upload route and the two mailing-list CSV routes, exempt) and five
      bucket writes (the evidence write and its caller, and the upload
      URL, scanned; the passport's git bundle and the caption editor's
      WebVTT text, not uploads). Both lists were proved able to fail by
      renaming an entry and watching the test go red. The validate job's
      timeout rose from ten minutes to fifteen for the ClamAV install.

## Phase 6: The uploader says what the scan found, and ClamAV is current

Found by the EICAR test in App production on 19 October 2026. The scan
caught the file and the backend deleted it within 35 seconds, but the
certificate form's drop area said "Attached: eicar-in-a-pdf.pdf"
throughout, and saving the certificate would have failed with "That
evidence is not stored against this passport", true but no help. The
job log also warned that ClamAV 1.4.3, from Debian's archive, is behind
the recommended 1.4.6.

- [x] Add `GET /api/passport/{passport_id}/evidence/{blob_digest}/scan`,
      answering `scan_state` (`pending`, `clean`, `infected`, `failed`)
      and, for `infected`, the signature named. Writer-only, like the
      upload it follows. Not a field on `EvidenceUploadOut`, as first
      planned: the frontend passes the upload's answer straight into the
      record it writes, and `AttachmentIn` refuses a field it does not
      know, so a new field there would have broken every upload from a
      tab still open on the old page. The uploader asks this route
      straight after the upload instead.

- [x] Refuse to save a record naming evidence the scan found malware in,
      with the reason: "eicar-in-a-pdf.pdf was removed: malware was
      found in it (Eicar-Signature). Upload a clean copy." And for a
      scan that failed: "... could not be checked for malware. Upload it
      again." Checked before the "is it stored?" check, since an
      infected file has already been deleted and that check would
      otherwise answer first with the unhelpful message.

- [x] `CertificateUploader` asks the new route every three seconds after
      an upload that comes back `pending`, saying "Scanning
      eicar-in-a-pdf.pdf…" with the drop area disabled. (First written
      as "Checking … for malware…", changed on 19 October 2026 as too
      alarming for someone uploading an ordinary certificate.)
      Clean: "Attached: …", and only then is the file handed to the form,
      so a file never scanned clean cannot be saved from this page. Found:
      a red "Malware found in eicar-in-a-pdf.pdf (Eicar-Signature). It
      has been deleted and is not attached." and the drop area back to
      empty. No verdict after two minutes: the file is handed to the
      form with "Attached: … Still scanning; it will be shown once it
      passes", so a slow scan does not stop somebody
      saving, and the save-time check above still stands behind it.
      Tests and stories for each state. As built, the line beneath the
      drop area is its own presentational component,
      `EvidenceScanStatus`, composed from `QuillSpinner`, `Icon` and
      `ErrorState`, so each state has a story; the uploader only works
      out which state to pass it.

- [x] Update ClamAV to 1.4.6, from Cisco Talos's own release packages
      rather than Debian's archive, which lags ClamAV's releases. The
      package is pinned by version and by SHA-256 for each architecture
      in `backend/Dockerfile.scan`, so a changed download fails the
      build. 1.4 rather than 1.5 because 1.4 is ClamAV's long-term
      support line: fewer upgrades to make, and a scanner is the place
      for the steady one. A Renovate custom manager watches the
      release, limited to 1.4, so a new patch opens a pull request
      rather than relying on someone reading the job log; that pull
      request has to update the two checksums by hand, and the build
      fails until it does. The EICAR build check from Unit 5 proves
      the new engine detects as the old one did.

      As built: the package installs under `/usr/local`, with the
      definitions in `/usr/local/share/clamav`, and `freshclam.conf` is
      written from the package's sample. Checked locally: the image
      reports `ClamAV 1.4.6`, the run-time refresh works as the
      unprivileged user, and both EICAR test files in `local/` are found.

## Phase 7: GitHub fetches ClamAV once a day, and the live job only scans

Decided on 19 October 2026. ClamAV's definitions server refuses an
address that asks too often, and four things asked it: the image build
on every deploy, the scan job on every upload (all from App production's
one Cloud NAT address), and the teaching content check on every push to
a content pull request (from GitHub's shared runner addresses). The rule
set for this phase: GitHub does setup and deploy, and the live app does
only the running. So there is no mirror job in GCP, and the scan job
stops fetching anything.

- [x] Add `.github/workflows/clamav-mirror.yml`, run daily, by hand, and
      on a change to the ClamAV pin. It downloads the pinned ClamAV
      packages (both architectures, each checked against its SHA-256),
      installs the amd64 one on the runner, runs `freshclam` once into a
      fresh directory, proves the result detects EICAR, and pushes the
      packages and definitions as one image,
      `ghcr.io/<owner>/clamav-mirror`, tagged with the ClamAV version and
      with the version and the date. This is now the only thing that
      asks ClamAV's servers for anything: once a day, from one job. The
      image is built `FROM scratch` and holds files, not a system; it
      is a way to keep them in GHCR beside the other mirrored images,
      private like them.

- [x] The version and the two checksums stay in `backend/Dockerfile.scan`,
      where Renovate already watches them, and the workflow reads them
      from there, so there is one pin and not two.

- [x] `backend/Dockerfile.scan` downloads nothing. The build is given
      the mirror's files in a `.clamav-mirror/` directory of the build
      context (gitignored), and the Dockerfile installs the package for
      its architecture from there, after checking it against the same
      pinned checksum, and copies the definitions in. The EICAR build
      check stays. `deploy.yml` fetches the mirror's files before it
      builds the scan image.

- [x] The same daily workflow redeploys the scan job: it builds the scan
      image on the day's definitions, pushes it to Artifact Registry, and
      points `quill-scan-<env>` at it, as `deploy.yml` does. Keeping the
      live job's definitions fresh is a deploy, so it is GitHub's. A
      failed run posts to `#cicd`, and the live job carries on with the
      definitions it has until the next run succeeds.

- [x] `scripts/scan_cli.py` stops running `freshclam`. The live job scans
      with the definitions in its image and records their version and
      date against each verdict, as before. No upload makes an outgoing
      call to ClamAV.

- [ ] The teaching content check (`validate` in
      `teaching-pipeline.yml`) installs ClamAV from the mirror's package
      and scans with the mirror's definitions, instead of installing
      Ubuntu's ClamAV and running `freshclam` on every push. The
      teaching repositories run that job, so `clamav-mirror` must be
      readable by them: in the package's settings on GitHub, "Manage
      Actions access", give `eoeeta-teaching`,
      `eoeeta-teaching-testing` and `respiratory-teaching` read access.
      Until that is done the content check fails, closed, at the step
      that fetches the mirror.

      Built; the access grant is still to do, by hand, after the first
      run of `clamav-mirror.yml` has created the package.

      As built across the phase: the mirror workflow also runs on a pull
      request that changes the pin, so the mirror holds a new version
      before that pull request's merge deploys it. The daily redeploy
      waits in the same concurrency group as `deploy.yml`, so the two
      never point the job at an image at the same moment. Building and
      testing this found that the EICAR checks matched "eicar" anywhere
      in `clamscan`'s line, which includes the test file's own name, so
      a scanner naming any other signature would have passed; both
      checks now match the signature after the colon, and the test file
      is called `sample`. Checked locally: the scan image builds from a
      mirror directory with no download, and with no network at all it
      reports ClamAV 1.4.6 and finds both EICAR test files.

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
