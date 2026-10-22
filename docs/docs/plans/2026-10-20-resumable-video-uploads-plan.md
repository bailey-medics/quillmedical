# Resumable video uploads plan

On 20 October 2026 an administrator uploaded a large video to
`colonoscopy-optical-diagnosis` in App production, and it failed when the
laptop went to sleep. The backend issued the signed address at 13:27 UTC
and logged no errors. The `link` call never came, and the source bucket
held no object, so the bytes stopped partway to Google Cloud Storage. The
cause is in `frontend/src/features/teaching/use-module-media.ts`: the
upload opens a GCS resumable session but sends the whole file as one
`PUT`. Any break in that one request, whether sleep, a Wi-Fi drop or a
proxy closing a long connection, loses the whole upload. The admin then
saw "Something went wrong / Upload failed" on the card, with the same
message again on the row, and nothing to say why or what to do.

Afterwards, a large upload survives an interruption. The file goes in
chunks, a failed chunk is retried from the point GCS confirms, the page
keeps the computer awake while it uploads, and when an upload does fail
the message says the connection was lost and what to do. Speed is out of
scope: the bytes go straight from the browser to `europe-west2`, so the
admin's upload bandwidth sets the pace, and chunking will not change that.

## Phase 1: Let the browser read the upload offset

- [x] Add `Range` to the source bucket's CORS `response_header` in
      `infra/modules/teaching-video-pipeline/main.tf`, beside `Location`.
      After each chunk, and when the browser asks after a failure how much
      arrived, GCS answers `308` with a `Range: bytes=0-N` header. The
      browser hides any header the CORS policy does not expose, so without
      this the client cannot tell where to resume from. Update the comment
      above the block too. It already says "PUT sends the chunks", which is
      only true once Phase 2 lands. This goes first because Terraform
      applies on merge, and Phase 2 needs the header in place before it
      reaches production.

- [x] After merge, check the `terraform.yml` run applied, then confirm
      with `gcloud storage buckets describe
      gs://quill-teaching-videos-source-app --format="value(cors_config)"`
      that `Range` is listed. `app` is the only environment under
      `infra/environments/`, so this is the only bucket.
      Done on 20 October 2026: the whole stack was enqueued at once and
      every pull request landed on `main`, `terraform.yml` applied at
      16:04 UTC, and the bucket lists `Range`.

## Phase 2: Send the file in chunks and resume after a failure

- [x] Replace the single `sendToSession` `PUT` for GCS URLs in
      `use-module-media.ts` with a chunk loop. Each chunk is a
      `file.slice()` sent with `Content-Range: bytes start-end/total`. The
      chunk size is 16 MiB: GCS requires a multiple of 256 KiB, and 16 MiB
      is big enough to keep per-request overhead small while a lost chunk
      costs little. The final chunk returns 200 or 201. Every earlier one
      returns 308, and the next start is the `Range` header's end plus one.
      Do not assume the whole chunk arrived. The local development route,
      a relative URL, keeps the single `PUT` it has now, because it does
      not speak the resumable protocol.

- [x] Prove that `XMLHttpRequest` hands a `308` with no `Location` to the
      `load` handler rather than following it as a redirect. GCS sends no
      `Location` on these. The Fetch standard settles it: in HTTP-redirect
      fetch, a redirect status whose location URL is null is returned as
      the response, not followed, and `XMLHttpRequest` is defined on
      Fetch, so `load` sees status 308. The same research turned up a
      second point the code now handles: GCS leaves `Range` out entirely
      until it holds a byte, so a missing header means offset 0
      ([Google's resumable upload protocol](https://developers.google.com/gdata/docs/resumable_upload)).
      The check in a real browser moved to Phase 5, where a real upload
      exercises it anyway, because no browser can reach the new `Range`
      header until Phase 1 has applied. A unit test cannot prove browser
      behaviour. The `fetch` fallback, with progress per chunk rather than
      per byte, is not built: the standard says it is not needed, and it
      waits on Phase 5 showing otherwise.

- [x] On a network error or a 5xx, ask GCS how much it has (an empty `PUT`
      with `Content-Range: bytes */total`), then carry on from the
      confirmed offset. Retry up to 6 times with backoff (1, 2, 4, 8, 16,
      30 seconds), resetting the count after any chunk succeeds, so a long
      upload with several short blips still completes. A 4xx other than
      408 or 429 is not retried, because it will not change. A 404 or 410
      means the session is gone, and the upload fails with a message
      saying so. That message landed here rather than in Phase 4,
      because the failure kind is new in this phase. While offline (`navigator.onLine` false, or the
      `ConnectivityContext` saying so), wait for the `online` event before
      the next attempt instead of using up retries.

- [x] Keep progress true across retries: percent is the confirmed offset
      plus the current chunk's `loaded`, over the file size, so the bar
      never jumps back after a retry. Add a `retrying` state per key to
      `ModuleMediaState` so the row can say "Connection lost, retrying"
      under the bar instead of freezing it silently. As built, the bar is
      held at its highest value rather than recomputed: GCS may confirm
      fewer bytes than were sent, and a bar that dips during a retry reads
      as breaking. The row only shows `uploadRetrying` from Phase 4.

- [x] Tests in `use-module-media.test.ts`, extending the existing fake
      `XMLHttpRequest`: chunks carry the right `Content-Range`; the next
      chunk starts from the `Range` GCS confirmed, not from where the
      client thought it was; a network error triggers the status query
      and resumes; retries stop after the limit with the lost-connection
      message; a 403 is not retried; a 404 on the session fails with the
      session-gone message; the local relative URL still sends one `PUT`;
      progress never decreases across a retry. Use an injectable delay for
      the backoff, as `MEDIA_POLL_INTERVAL_MS` does for polling, rather
      than fake timers. As built, the chunk loop lives in its own module,
      `frontend/src/features/teaching/resumable-upload.ts`, with its tests
      beside it, and the hook's handling of retrying and of each failure
      kind is in `use-module-media-retrying.test.ts`, which replaces the
      chunk loop with a mock.

## Phase 3: Keep the computer awake while uploading

- [x] Request a Screen Wake Lock (`navigator.wakeLock.request("screen")`)
      when the first upload starts, and release it when none are left in
      flight. It lives in the page beside the existing `uploading` flag in
      `frontend/src/pages/admin/teaching/AdminBankDetailPage.tsx`, because
      that flag already counts uploads across every organisation's card.
      A lock is released when the tab is hidden, so request it again on
      `visibilitychange` back to visible while uploads continue. Where the
      API is missing or refuses (Firefox before 126, a background tab, low
      battery), carry on without it: Phase 2's resume is the safety net,
      and the lock only makes it needed less often. It does not survive
      closing the lid, and nothing in a web page can. Put the lock in a
      small hook, `useWakeLockWhile(active)`, in `frontend/src/lib/`, with
      its own test covering request, release, re-request on visible, and a
      browser without the API. As built, it is
      `frontend/src/lib/wake-lock/useWakeLockWhile.ts`. It also releases a
      lock the browser grants after the upload has already finished,
      since the request can still be out when that happens.

- [x] Leave the leaving-the-page warning as it is. `AdminBankDetailPage`
      already blocks in-app navigation with `useBlocker` and a full page
      load with `beforeunload` while `uploading` is true, so that part of
      the original request already exists.

## Phase 4: Say what went wrong, once

- [x] Add a connection-lost case to `describeUploadFailure`, or a
      sibling for errors with no status, worded: "The connection was lost
      during the upload. Keep this tab open and the computer awake, then
      try again." Use it where `sendToSession` and the chunk loop now
      reject with a bare "Upload failed", and where `startResumableUpload`
      rejects with "Could not start upload". Add a session-gone message for
      404 or 410 from the session URL: "The upload took too long and
      Google closed it. Try again." That one landed in Phase 2. As built,
      the bare "Upload session was not returned" also became a sentence a
      person can act on, and the fallback for an unlisted status now ends
      "Try again.", since the row no longer adds that itself.

- [x] Stop the card-level "Something went wrong" alert repeating an
      upload's failure. In the `upload` callback, set `uploadErrors[key]`
      only, not `setError`, so the row that failed is the one that says so.
      `error` stays for loading, deleting and captions, which have no row
      of their own. Update `ModuleMediaCard.stories.tsx`: the failed-upload
      story shows the new wording on the row only, and a new story shows
      the "Connection lost, retrying" state under a part-filled bar.
      Update the matching tests in `ModuleMediaCard.test.tsx` and
      `use-module-media.test.ts`. As built, the two stories that showed an
      upload failure through the card-level `error` now show a failed
      delete, and are renamed `DeleteFailed` and
      `DeleteFailedOnACompleteModule` to match.

- [x] Soften the row suffix "Nothing was saved - try again." in
      `ModuleMediaCard.tsx`. It is still true, since a failed session is
      never linked, but it now follows a message that already says what
      to do. Drop the suffix, and let each message carry its own advice.

## Phase 5: Try it for real

- [ ] In App production, on the `chest-xray-interpretation-test` module,
      first upload a video of 40 MB or so (three chunks) in Chrome and in Safari and check, in
      the network panel, that the chunk `PUT`s answer 308 with `Range` and
      the upload links. Then upload a video of at least 500 MB,
      turn Wi-Fi off partway for 30 seconds, and turn it back on. The bar
      should say it is retrying, then finish, and the row should show the
      linked video. Then repeat with the lid closed for a minute. The
      upload should pause, then resume when the Mac wakes, as long as the
      tab was left open.

## Phase 6: Videos of up to 3 GB

The first real videos for EoEETA are three lectures of about 27 minutes
each: two in 4K (2.1 GB and 2.8 GB) and one in 1080p (1.4 GB), recorded
as H.264 with 24-bit PCM audio and a timecode track. Phases 1 to 5 get
them into the source bucket. The jobs that run after the upload were
sized for 50 MB tests, and would fail on every one of them: each job
copies the whole file into its temporary folder before working on it,
and a Cloud Run job has no disk, so that folder is memory. Timed on the
Mac with the transcode's own FFmpeg settings at 4 threads, one minute of
the 4K file took 18 seconds for the 1080p rendition and 10 for the 720p,
so about 13 minutes for the whole lecture on the Mac, and two to three
times that on Cloud Run's 4 vCPUs, against a 20-minute ceiling.

- [x] Let the transcode and scan jobs read the source bucket as a folder,
      and give them room, in `infra/`. Cloud Run jobs can mount a Cloud
      Storage bucket through Cloud Storage FUSE, which reads an object
      by ranges through the storage API instead of copying it locally,
      costing about 1 MiB of memory per open file
      ([Cloud Storage volume mounts for jobs](https://docs.cloud.google.com/run/docs/configuring/jobs/cloud-storage-volume-mounts)).
      Add an optional `gcs_volumes` list to `modules/cloud-run-job`, each
      a bucket mounted read-only at a path. Mount the video source bucket
      at `/mnt/video-source` in the transcode job and in the scan job,
      and pass the path as `TEACHING_VIDEOS_SOURCE_MOUNT`. Read-only, so
      neither job gains a way to write through the mount; the transcode
      still deletes its source through the storage client, as now. The
      scan job is not gated on the teaching product, so its mount is
      added only where the video pipeline exists. Raise the transcode to
      8 vCPU, 8 GiB and a 90-minute timeout: the renditions still go to
      the temporary folder, about 1.3 GB for a 27-minute lecture, and 8
      vCPU roughly halves the encode. Raise the scan to 4 GiB, for
      ClamAV's 1.3 GB of definitions with room for the file's pages, and
      a 30-minute timeout. This lands first, on its own: nothing reads
      the mount yet, so it is safe to deploy alone.

- [x] Read the source from the mount, and encode both renditions in one
      pass, in `backend/scripts/transcode_cli.py`. Where
      `TEACHING_VIDEOS_SOURCE_MOUNT` is set and the object is there, use
      that path directly; otherwise download as now, which keeps local
      development and a job without the mount working. One FFmpeg run
      with a `split` filter writes both renditions, so the 4K source is
      decoded once rather than twice, the slowest part of the encode on a
      4K file. Each output still gets the same codec, bitrate, audio and
      `+faststart` settings as before. The poster is taken from the same
      path. Tests in `backend/scripts/transcode_cli_test.py` or the
      existing test module: the mount is used when present, the download
      when not, and the single FFmpeg call names both outputs with the
      settings each had. As built, the first audio stream is mapped
      explicitly (`0:a:0?`), since naming the video branches turns off
      FFmpeg's own stream choice, and the camera's timecode track is left
      out as it was before. Timed on the Mac, one minute of the 4K lecture
      took 22 seconds in one pass against 28 in two, about a fifth less.

- [x] Read the source from the mount, and scan large files properly, in
      `backend/scripts/scan_cli.py`. Where the bucket being scanned is
      the video source bucket and the mount holds the object, scan it in
      place; otherwise download, as passport evidence still is. Pass
      `--max-filesize=4000M --max-scansize=4000M`, just under ClamAV's
      ceiling of under 4 GB for both
      ([clamscan manual](https://manpages.ubuntu.com/manpages/bionic/man1/clamscan.1.html)).
      Left at the defaults, clamscan skips a large file and exits as if
      it were clean, which is how every lecture would have passed
      without being scanned. Add `--alert-exceeds-max=yes` too, and treat its
      `Heuristics.Limits.Exceeded` finding as `failed`, not `infected`:
      a file too big to scan has not been shown to be harmful, and
      `infected` would delete it. Raise `_SCAN_CEILING` to 25 minutes.
      Tests: the flags are passed, a limits finding reports `failed`, and
      the mount is used only for the video source bucket. As built, a key that would
      resolve outside the mount is not read through it, and is
      downloaded instead, since a job invoked by hand could be given any
      key.
      The first real lecture still failed, on 20 October: ClamAV has a
      third limit, `--max-scantime`, two minutes by default, and gave up
      on the 2.1 GB file at 2 minutes 15 seconds with
      `Heuristics.Limits.Exceeded.MaxScanTime`. It is now set a minute
      inside `_SCAN_CEILING`, 24 minutes, and that finding is reported as
      "took too long to scan" rather than "too large".

- [x] Refuse a video over 3 GB when the upload is asked for, and wait
      longer before calling a job stalled, in the backend and frontend.
      `create_media_upload_url` answers 413 for a `size_bytes` over
      `MAX_MEDIA_UPLOAD_BYTES`, 3 GiB, and 400 for one of zero or less.
      3 GiB clears the largest real lecture (2.65 GiB) and stays inside
      what ClamAV can scan. `useModuleMedia` checks `file.size` before
      asking, so the admin hears it before waiting for anything, and
      the 413 message names the limit. In `media.py`,
      `_TRANSCODE_PATIENCE` goes to 100 minutes and `_SCAN_PATIENCE` to
      40, each just past its job's new timeout, so the card does not
      call a slow job stalled. Tests: the route's 413 and 400, the hook
      refusing an oversized file without a request, and the stalled
      thresholds. As built, the link route still records whatever
      size it is told, as its existing test pins: the limit is applied
      once, when the upload address is asked for.

- [ ] In App production, upload all three lectures to the
      `chest-xray-interpretation-test` module, one at a time, and follow
      each through scan, transcode and captions: all three should finish
      and play at 720p and 1080p. Record how long each stage took here,
      against the timeouts above, and lower or raise them if the real
      times are far off.

## Phase 7: Captions in English, with the module's own words

<!-- cspell:ignore dweud conosby -->

The first lecture's captions came out on 21 October as mostly invented
Welsh. The caption job never told Whisper what language to expect, so it
guessed from the first 30 seconds, guessed Welsh, and kept to that for
the whole lecture, slipping into English only in places. It also fed
each line it wrote into the next, so once lost it repeated itself ("Mae'n
dweud yw'n dweud...") for minutes. Where it did write English, it
misheard the specialist words: "conosby" for colonoscopy, "caret of
cancer" for colorectal cancer. (The six minutes with no captions is a
gap in the video itself, which EoEETA are fixing.)

- [x] Tell Whisper the language, and stop it feeding each line into the
      next, in `backend/scripts/caption_cli.py`. `language` comes from
      `CAPTION_LANGUAGE`, English (`en`) where unset, so a module in
      another language can still be captioned later without a code
      change. `condition_on_previous_text=False` makes each 30-second
      window stand on its own, which is Whisper's own advice for long
      recordings that fall into repetition. Tests: the language and the
      setting reach `model.transcribe`.

- [x] Let a module list the words its captions should spell right, as
      `captionVocabulary` in its `module.yaml`, checked by
      `ModuleYaml` in `tooling/module_schema.py` so `validate-teaching`
      refuses a bad list. Whisper takes these as `initial_prompt`, text it
      treats as already heard, and reads only about the last 220 tokens of
      it, so the list is capped: at most 40 terms, each at most 40
      characters on one line, and 600 characters in all, which stays
      inside that limit. A module without the list is captioned as before.
      Tests: a good list, too many terms, a term too long, a term with a
      line break, and a list too long in all are each judged right.

- [x] Pass the list to the caption job when captions start, in
      `start_caption` (`backend/app/features/teaching/transcode.py`).
      The module's `module.yaml` is read the way the module listing reads
      it, from the content bucket or, in development, from disk, and its
      list goes to the job as `CAPTION_PROMPT`, written as "Glossary:
      colonoscopy, adenoma, ...". The job passes that to Whisper as
      `initial_prompt`. Reading the list never stops captions starting: a
      module with no list, a file that cannot be read, or a list of the
      wrong shape starts the job without a prompt and logs why. The
      backend applies the same caps as the schema, so a list that never
      went through `validate-teaching` cannot exceed what Whisper reads.
      Tests: the prompt is passed when there is a list, nothing is passed
      without one, and an unreadable `module.yaml` still starts the job.

- [ ] Add `captionVocabulary` to `colonoscopy-optical-diagnosis` in the
      EoEETA teaching repository, then run the caption job again for its
      first lecture by hand with `gcloud run jobs execute
      quill-caption-app`, passing `CAPTION_ORG_ID`, `CAPTION_MODULE_ID`,
      `CAPTION_ASSET_ID` and the `CAPTION_PROMPT` the backend would send.
      Read the result against the video before the captions are marked
      reviewed.

## Decisions

- **Resume within the tab, not across a reload** - GCS keeps a session for
  a week, so the session URL could be saved and an upload continued after
  the page reloads. That needs the admin to pick the same file again, a
  record of which session belongs to which row, and handling for a
  session that has since been linked or deleted. The navigation guard
  already makes a reload unlikely, so the cost is not worth it yet.

- **No parallel or composite uploads for speed** - Splitting the file
  across several connections and composing the parts in GCS could help a
  fast uplink a little, but it needs a backend compose step and changes
  how the scan and transcode jobs see the file. The failure was
  reliability, not speed, and the admin's uplink is the real limit.

- **A wake lock rather than telling admins to change their settings** -
  The page knows when an upload is running and can hold the computer
  awake for just that long. Asking every administrator to run a keep-awake tool
  or change their power settings would be forgotten.

- **The upload's size is declared, not enforced by storage** - GCS can
  hold a resumable upload to a declared length if the session is opened
  with `x-upload-content-length`, but that means signing a new header
  and sending it from the browser, which cannot be checked without a
  real upload, and an unattended change that broke every upload would
  cost more than it saves. A file larger than declared would only make
  its own jobs fail, so the cap is checked on the size the page reports.
