# Finalise EoEETA teaching plan

The `eoeeta-teaching` repository still carries the content it was built
with while the teaching feature was being developed. The module and the
assessment describe themselves as "a small test question bank for local
development and CI", the bank holds four image pairs, an attempt is three
items in five minutes, and the slides after "Before you begin" are
placeholders: a Paris classification figure, a borrowed YouTube lecture
and a patient-experience video. None of that is what EoEETA delegates
should see at go-live.

The outcome is a module ready for delegates: slides built round the three
videos by Dr Gareth Corbett and Dr Richard Tighe, a closing slide that
sums up and explains the assessment, and a bank of over 200 real image
pairs from EoEETA's spreadsheet replacing the four test ones. The work is
in `bailey-medics/eoeeta-teaching`, one pull request per phase, except
Phase 1, which also touches the other two teaching repositories; nothing
in this repository changes.

## Phase 1: Remove the unread `randomise_selection` key

- [x] Delete `randomise_selection: true` from the `assessment.yaml` of
      every teaching repository that still has it:
      `eoeeta-teaching` (colonoscopy-optical-diagnosis, version 8 to 9),
      `eoeeta-teaching-testing` (colonoscopy-optical-diagnosis-test, 9 to
      10) and `respiratory-teaching` (chest-xray-interpretation-test, 4
      to 5). Nothing reads it (Phase 11 of the documentation review
      follow-ups plan). All three modules are live, and the version lock
      fails any change to a live assessment without a version bump, so
      each pull request bumps `version` by one. One branch,
      `feature/remove-randomise-selection`, in each repository:
      eoeeta-teaching#15, eoeeta-teaching-testing#7 and
      respiratory-teaching#10.

## Phase 2: Rebuild the slides round the three videos

- [x] Keep slides 1 and 2 of
      `modules/colonoscopy-optical-diagnosis/learning/content.mdx` as
      they are: the `#` title slide and "Before you begin" with its
      quiet-computer callout. Each `#` or `##` heading starts a slide
      (`backend/app/features/teaching/mdx_parser.py`), so slide 3 begins
      at the next heading.

- [x] Delete everything from "What this module covers" to the end, and
      the now unused `learning/images/paris-classification.png`. The
      placeholder slides go rather than being kept between the videos:
      the videos teach the material, and Mark will supply the wording of
      the slides before each one.

- [x] Add six slides, alternating an introduction slide and its video
      slide, three times. Each introduction is a `##` slide of two or
      three sentences: who presents (Dr Gareth Corbett or Dr Richard
      Tighe, consultant endoscopists) and what the video covers. Each
      video is its own `##` slide holding only `<Video ref="..." />`,
      since the validator refuses a slide carrying two media tags and a
      video shares its slide badly with text. The refs are `video-1`,
      `video-2` and `video-3`: they are stable keys, and the topic of
      each video was not known when this was built, so a topic name
      could have been wrong for good, where a number cannot. The files
      are uploaded and linked in the app, per organisation, through
      `ModuleMediaLink`, and can be renamed or replaced without touching
      the MDX. `duration` is optional and left out until the files are
      in hand. The first build assumed the presenters alternated
      Corbett, Tighe, Corbett; they do not.

- [x] Correct the slides for both presenters appearing in every video,
      as Mark confirmed on 17 October. Each introduction slide names Dr
      Gareth Corbett and Dr Richard Tighe together, and the slide titles
      number the videos ("First video", "Video 1 of 3") rather than
      naming one presenter. Folded into eoeeta-teaching#16 rather than a
      new pull request, since that one is still a draft and the
      correction is to its own text.

- [x] Write the introduction text as a first draft. It is replaced in
      Phase 3 by Mark's captions, so it only needs to be accurate, not
      final.

- [x] Add one final `##` slide, "What you have learnt and what comes
      next", replacing the old `# Summary` section title and "Next
      steps" pair. It sums up the three videos in a few bullets, then
      explains the assessment: pressing Finish returns to the module
      page, where the assessment starts; it is timed; for each pair of
      white light and narrow band images choose one of four answers;
      the pass needs at least 70% of answers high confidence and at
      least 85% of those correct; a pass emails a certificate; and take
      it on a computer in a quiet place. The slide leaves out the
      number of questions and the time limit, saying instead that both
      are shown before the assessment starts: the intro page reads them
      from `assessment.yaml`, so the slide cannot fall out of step when
      Phase 4 sets them.

- [x] Replace the `description` in `module.yaml`, which still says "A
      small test question bank for local development and CI", with one
      describing the module to a delegate.
      Landed as eoeeta-teaching#16.

- [ ] After merge, upload the three video files in the app and link
      each to its ref. This is the one step done in the app rather than
      the repository; until it is done the video slides show their
      empty state.

## Phase 3: Replace the introduction text with Mark's captions

- [ ] When Mark hands over the captions, replace the draft text on the
      three introduction slides with them, keeping British English and
      no em or en dashes. Nothing else on the slides changes.

## Phase 4: Load the full question bank from EoEETA's spreadsheet

- [ ] Read the spreadsheet with a script kept outside the repository, not
      committed: the import is a one-off, and the repository is content.
      The script lists each row's two images and its answer, and stops
      on any row with a missing image, an answer other than `adenoma`
      or `serrated`, or a duplicate pair. Report those rows to Mark
      rather than guessing.

- [ ] Delete `question_001` to `question_004` and write the bank afresh
      as `question_001` upwards, one folder per row in spreadsheet
      order: `wli.png`, `nbi.png` and a `question.yaml` holding
      `diagnosis:`. Convert to PNG where the source is not one, and crop
      any white border, as was done by hand for the first four in
      eoeeta-teaching#12.

- [ ] Check the images by eye on a sample, at least the first, last and
      every twentieth pair, against the spreadsheet: a swapped WLI and
      NBI image, or an answer on the wrong row, passes every automated
      check.

- [ ] Update `assessment/assessment.yaml` for a real bank: a
      `description` and intro page that no longer say "test assessment
      with 4 polyp image pairs", `items_per_attempt`,
      `time_limit_minutes` and `min_pool_size` set to EoEETA's figures.
      Bump `version`, which the version lock requires when the bank
      changes.

- [ ] Expect the pull request to be large: about 120 KB a pair, so
      roughly 25 MB for 200 pairs. The PNGs are plain git blobs, not
      LFS (see `.gitattributes`), which is fine at this size.

## Decisions

- **The placeholder slides are removed, not kept** - the Paris figure,
  the YouTube lecture and the patient-experience video were stand-ins
  while the slide viewer was built; leaving them between real videos
  would make delegates sit through material EoEETA did not choose.

- **The import script is not committed** - it runs once against one
  spreadsheet, and a script in the content repository would be one more
  thing to keep working for no second use.
