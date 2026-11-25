# Play videos before assessment plan

EoEETA has asked that a delegate cannot go straight to the MCQ (multiple
choice question) assessment in the `colonoscopy-optical-diagnosis` module
without first opening the three videos in its learning section. At the
start of the project EoEETA said it did not want progress tracking, so
nothing records video watching today: the only "progress" in the teaching
code is for uploads and processing, and `handleVideoProgress` in
`frontend/src/features/teaching/pages/SlideReader.tsx` is an empty
placeholder.

The outcome is a per-module setting, `playVideosBeforeAssessment` in
`module.yaml`. On a module that sets it, pressing play on a video records
that the delegate opened it. Once every video in the learning section has
been played, the "Start assessment" card unlocks, and the server refuses
to start an attempt until then. The unlock lasts until the delegate's
pass runs out, `renewalMonths` after passing (36 for EoEETA); after that
they must press play on each video again before renewing. Failing an
attempt changes nothing. EoEETA has no delegates yet, so nothing needs
back-filling.

## Open questions

- [x] **Does a video added later lock the MCQ again for somebody who had
      already unlocked it?** - Yes. The unlock is worked out each time
      from the plays on record, against the videos the module has now, so
      a new video locks it again until it is played. Nothing extra is
      stored, and a new video is new learning. Answered in `/g`,
      25 November 2026.

- [x] **Does the privacy policy need to say that video plays are
      recorded?** - Yes. Phase 1 adds them to the training records the
      policy lists, so it matches what is kept from the day recording
      starts. Answered in `/g`, 25 November 2026.

- [x] **How does the slide reader know whether to record a play?** - It
      does not need to. `SlideReader` only loads the slides, through
      `getModuleSlides`, and never the module's settings. So it posts
      every first press of play, and the route records it only for a
      module that sets `playVideosBeforeAssessment`, answering 204 either
      way. Settled from the code in `/g`, 25 November 2026.

- [x] **What does a refused start say?** - "Complete the learning
      section first", the same words as the grey note under the disabled
      button, so the delegate meets one message. Settled in `/g`,
      25 November 2026.

## Phase 1: Record video plays on modules that ask for it

Nothing is gated in this phase, and no module sets the new key yet, so it
is safe on `main` alone.

- [x] Add `playVideosBeforeAssessment: bool = False` to `ModuleYaml` in
      `backend/app/features/teaching/tooling/module_schema.py`, with a
      comment saying what it does. False by default, so every existing
      module carries on unchanged. The content validator reads the same
      model, so a teaching repository can only use the key once this is
      deployed.

- [x] Copy it onto `QuestionBankConfig` at sync, as
      `play_videos_before_assessment`, the way `renewal_months` is copied
      in `backend/app/features/teaching/sync.py` (the schedule dataclass
      near line 176 and the assignment near line 215). A job or route
      with no access to the content bucket can then read it. The column
      is `Boolean`, not null, with `server_default=false()`, so existing
      rows are valid at once. Migration with `just migrate`.

- [x] Add a `module_video_play` table in
      `backend/app/features/teaching/models.py`: `id`, `user_id` (foreign
      key to `users`), `question_bank_id`, `media_key` (the `ref` in
      `<Video ref="video-1" />`), and `played_at`, set by the server. One
      row per press of play, never updated or deleted, so there is a
      record of who played what and when, and the reset in Phase 2 is a
      date comparison rather than a deletion. Indexed on
      (`user_id`, `question_bank_id`). No `org_unit_id`: the play is the
      person's, whichever organisation they sit the module through. Same
      migration as the column above.

- [x] Add `POST /api/teaching/modules/{question_bank_id}/videos/{media_key}/plays`
      in `backend/app/features/teaching/router.py`, with
      `DEP_REQUIRE_CSRF` and the modules dependency the learner routes
      use. It refuses with a 404 for a module the caller may not open,
      through `resolve_visible_module`. On a module whose served config
      does not set `play_videos_before_assessment` it answers 204 and
      records nothing, without reading the content, so the browser can
      post every play without knowing the setting. On one that does, a
      `media_key` that `get_referenced_media_keys` in
      `backend/app/features/teaching/media.py` does not list is a 404,
      and anything else records one play and answers 204. The served
      config comes from `served_config` in `reminders.py`, made public
      for this rather than copied. The route makes an explicit
      authorisation decision, like every other, and is listed in
      `THEIRS` in `backend/tests/a_delegate_reaches_only_their_own_test.py`
      and in `MODULES_ROUTES` in
      `backend/tests/teaching_learner_gates_test.py`.

- [x] Add `videos_to_play(db, user_id, question_bank_id, config) ->
      list[str]` in a new `backend/app/features/teaching/video_plays.py`.
      It returns the `media_key`s the delegate still has to play, in
      order, and an empty list when the MCQ is unlocked. The rules:

      - **The setting is off** - empty list.
      - **Their latest pass at this module is still in date** - empty
        list. In date means `config.renewal_months` is null, or now is
        before `add_months(passed_at, renewal_months)` from
        `backend/app/features/teaching/reminders.py`. Reuse that function
        so the unlock and the renewal reminder always agree on the date.
      - **Otherwise** - every key from `get_referenced_media_keys` with no
        play after the cut-off. The cut-off is the moment their latest
        pass ran out, or the beginning of time if they never passed.

      A failed attempt is never looked at, so failing changes nothing.

- [x] Add video plays to the privacy policy, in
      `frontend/public_pages/src/pages/privacy-policy.tsx`. Two places
      list a sponsor's training records: section 2.2 ("your enrolments,
      your assessment attempts and answers, and your results and
      certificates") and the "What" bullet further down ("which modules
      you are enrolled in, when, and who enrolled you; each assessment
      attempt..."). Add "which learning videos you started, and when" to
      both, in the same plain style. It lands with the recording, so the
      policy never lags what is kept. The file's own rule makes any
      wording change a new version, so `VERSION` goes to 1.1 and
      `EFFECTIVE` to the day it was written; set it to the day it merges
      if that differs.

- [x] Tests, in `backend/app/features/teaching/video_plays_test.py` and
      beside the route: a play is recorded; a play on a module without
      the setting answers 204 and records nothing; both 404 refusals; a
      delegate with no plays has every key to play; playing all of them
      empties the list; a pass in date empties it; a pass that has run
      out needs plays made after it ran out, and plays from before do not
      count; a module with no `renewalMonths` stays unlocked after a
      pass; a failed attempt changes nothing. And in
      `module_schema_test.py`: the key defaults to false and is accepted
      when set.

## Phase 2: Refuse to start an attempt until the videos are played

- [x] In `start_assessment` in `backend/app/features/teaching/router.py`,
      after `bank_to_sit` and before an attempt is drawn, call
      `videos_to_play`. If it lists anything, raise a new
      `VideosNotPlayed` from `backend/app/features/teaching/errors.py`,
      403, "Complete the learning section first". An attempt
      already in progress is handed back as now, without the check, so
      nobody is locked out of an attempt they started. The greyed-out
      button in Phase 3 is only a guide; this is what enforces the rule.

- [x] Add `videos_to_play: list[str]` to `QuestionBankOut` in
      `backend/app/features/teaching/schemas.py`, filled in by
      `list_question_banks` (`GET /api/teaching/question-banks`), which
      the module page already reads, through a new `user_id` argument to
      `question_bank_rows` in `backend/app/features/teaching/listing.py`.
      It is an added field, so the `oasdiff` check sees no breaking
      change. The frontend's `QuestionBank` type in
      `frontend/src/features/teaching/types.ts` is written by hand, not
      generated, so Phase 3 adds the field there.

- [x] Tests, in `backend/tests/teaching_videos_before_assessment_test.py`,
      reusing the helpers of `teaching_starting_an_attempt_test.py`:
      starting is refused while a video is
      unplayed, and allowed once all are; an attempt in progress is
      handed back without the check; a module without the setting is
      never refused; `GET /api/teaching/question-banks` lists the keys
      still to play, and an empty list when unlocked.

## Phase 3: Record plays in the slide reader, and lock the assessment card

- [ ] Add an `onPlay` callback to `ActiveVideoPlayer` in
      `frontend/src/components/teaching/video-player/`, passed through to
      both players it can choose, `VideoPlayer` and `VideoPlayerV10`,
      and fired on the video's `play` event. Pass it from
      `SlideLayoutVideo` through `SlideViewer` to `SlideReader`.

- [ ] In `SlideReader`, post to the Phase 1 route through `api.ts` the
      first time play is pressed on each slide view. It posts on every
      module, because it does not load the module's settings; the route
      decides whether to record it. A failed post is ignored: the video
      keeps playing, and the delegate can press play again.

- [ ] On the module page, `TeachingModuleMain.tsx`, set `disabled` on the
      "Start assessment" `ActionCard` while `videos_to_play` is not
      empty, with `disabledReason` "Complete the learning section first".
      `ActionCard` already shows the reason in grey beneath a disabled
      button, so no new component is needed. Both places the card is
      built (with and without learning content) take the same rule.

- [ ] Tests: `ActionCard`'s disabled story already exists; add
      `TeachingModuleMain` tests for a locked and an unlocked card, and a
      `SlideReader` test that pressing play posts once per slide view and
      not again on a second press. An end-to-end test is left out:
      Playwright's stack has no transcoded video to play.

## Phase 4: Turn it on for EoEETA

**Merge only after** Phases 1 to 3 have merged and deployed to App
production, because the teaching repository's checks read the module
schema from Quill.

- [ ] In `bailey-medics/eoeeta-teaching`, add
      `playVideosBeforeAssessment: true` to
      `modules/colonoscopy-optical-diagnosis/module.yaml`, with a comment
      saying EoEETA asked for it, and the same in
      `eoeeta-teaching-testing`, so the test module behaves like the real
      one. Run `just validate-teaching`. One `/crpd eoeeta` and one
      `/crpd eoeeta-test`.

## Decisions

- **Pressing play counts as opening a video**, not loading its slide.
  Each video is on its own slide, so loading alone would be closer, but
  play is the clearest sign of intent and is what EoEETA agreed to.

- **A play can be faked** by somebody who sends the request without
  watching. That is accepted: EoEETA asked for a light "do not skip
  straight to the MCQ" gate, not proof of watching.

- **The unlock is worked out, never stored.** `videos_to_play` reads the
  plays and the latest pass each time, so there is no flag to fall out of
  step, and the renewal reset needs no job to clear anything.
