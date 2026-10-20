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

- [ ] After merge, check the `terraform.yml` run applied, then confirm
      with `gcloud storage buckets describe
      gs://quill-teaching-videos-source-app --format="value(cors_config)"`
      that `Range` is listed. `app` is the only environment under
      `infra/environments/`, so this is the only bucket.

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

- [ ] Request a Screen Wake Lock (`navigator.wakeLock.request("screen")`)
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
      browser without the API.

- [ ] Leave the leaving-the-page warning as it is. `AdminBankDetailPage`
      already blocks in-app navigation with `useBlocker` and a full page
      load with `beforeunload` while `uploading` is true, so that part of
      the original request already exists.

## Phase 4: Say what went wrong, once

- [ ] Add a connection-lost case to `describeUploadFailure`, or a
      sibling for errors with no status, worded: "The connection was lost
      during the upload. Keep this tab open and the computer awake, then
      try again." Use it where `sendToSession` and the chunk loop now
      reject with a bare "Upload failed", and where `startResumableUpload`
      rejects with "Could not start upload". Add a session-gone message for
      404 or 410 from the session URL: "The upload took too long and
      Google closed it. Try again."

- [ ] Stop the card-level "Something went wrong" alert repeating an
      upload's failure. In the `upload` callback, set `uploadErrors[key]`
      only, not `setError`, so the row that failed is the one that says so.
      `error` stays for loading, deleting and captions, which have no row
      of their own. Update `ModuleMediaCard.stories.tsx`: the failed-upload
      story shows the new wording on the row only, and a new story shows
      the "Connection lost, retrying" state under a part-filled bar.
      Update the matching tests in `ModuleMediaCard.test.tsx` and
      `use-module-media.test.ts`.

- [ ] Soften the row suffix "Nothing was saved - try again." in
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
