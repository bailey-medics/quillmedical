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

- [x] Read the spreadsheet with a script kept outside the repository, not
      committed: the import is a one-off, and the repository is content.
      The script lists each row's two images and its answer, and stops
      on any row with a missing image, an answer other than `adenoma`
      or `serrated`, or a duplicate pair. Report those rows to Mark
      rather than guessing.
      The file holds 299 numbered rows, each image stored inside its
      cell (Excel's rich value images, read from `xl/richData/` with the
      standard library). Found: 17 unnumbered rows of stray image copies
      at the foot; no answer on #61 and #65; "Hyperplastic" on #270 and
      "Normal" on #297; the same image as both pictures on #282; #187 an
      exact copy of #186; and images shared between #22 and #23, #79 and
      #80 (with different answers), and #117 and #118.

- [x] Remove the bad rows, Mark's decision on 17 October: all 12
      numbered rows above, both rows of each shared pair since which
      image is wrong cannot be told, and the 17 stray rows. That leaves
      287 pairs, 235 adenoma and 52 serrated. Written to
      `local/... CLEANED.xlsx` beside the untouched original, each kept
      row identical to its original, and the serial numbers turned from
      formulas into fixed values so they keep their original numbers.
      Mark then edited this copy by hand in Excel. Sent back to EoEETA
      for sign-off; the bank is built from whatever they return.

- [x] Crop every image to the endoscope's octagonal view, in the
      spreadsheet itself so EoEETA sign off the images that will be
      used. Two faults, one fix:
      327 of the 574 images carry a solid black border, 28 pixels down
      the right of #1's NBI image for one; and about 50 (#41, #81 to
      #100, #165 to #173, #180) carry the endoscope's information panel
      on the left, showing the procedure date and time and the scope's
      serial number. Name, ID and date of birth are blank, but date,
      time and scope serial together could be matched to a patient's
      record, so the panel must not reach the bank. Both sit outside
      the octagon, so cropping to it removes them and loses nothing of
      the picture. Written to a new `CLEANED v2` copy, with
      before-and-after contact sheets for Mark to check every image by
      eye: a dark lumen at the edge of the view is the case an
      automatic crop could cut into.
      Done on 17 October: 403 of 574 images cropped, into
      `local/... CLEANED v2.xlsx` with contact sheets in
      `local/contact-sheets-v2/`. A pixel counts as picture when it has
      some colour (channel spread of 4 or more) and is not near black;
      a row or column is kept from the first run of 24 in which a
      quarter of the pixels are picture. Brightness alone failed both
      ways: it kept grey caption text and a narrow column of panel
      icons, and a stricter colour test cut into dark lumen on #10 and
      #257. The crop also took off the site captions printed under
      some images ("Site 3. Mid transverse colon", #106 to #120, #185,
      #221 to #239), and a second form of panel on #180's NBI image
      reading "Issuing temporary patient ID". Every row, image
      placement and answer is unchanged from Mark's edited copy.
      Mark then spotted a thin dark edge left on #1's NBI image: the
      sources were enlarged before pasting, so the line between picture
      and black is a blur several pixels wide, and the crop stopped at
      the first line that was mostly picture. 162 images had 2 pixels
      or more of it. `CLEANED v3` trims each side while its edge line is
      under 60% as bright as the picture 12 to 20 pixels in, up to 10
      pixels a pass and three passes. Lumen at the edge is as dark
      further in, so it stays (#10, #13, #257 checked). Written as v3
      because Excel had v2 open.

- [x] Fix the faint edges and the squashed pair Mark listed on
      18 October. Thin right borders on #15, #41, #77, #226, #234, #236
      and #240 were fades of one to three pixels, too faint for the
      60% test, and tightening the test to 90% trimmed 289 images by
      its full limit because most pictures darken naturally towards
      their edges. So every image loses a flat three pixels from each
      side, about half a percent of the picture. #60 had been pasted
      squashed to about 1/1.6 of its height: both pictures were twice
      as wide as tall against about 1.2 for the rest of the bank, and
      the octagon's corner cuts and the "Near Focus" label agreed. Both
      are stretched back by 1.6. Rebuilt into `CLEANED v3`; Mark may
      also ask EoEETA for the original images of #60.

- [x] Convert the spreadsheet's images to JPEG, as `CLEANED v4`, so the
      copy EoEETA sign off holds the same images the bank will. Quality
      92 with no colour subsampling, so fine red vessels keep their
      colour. Each image is renamed `.jpeg`, the targets in
      `xl/richData/_rels/richValueRel.xml.rels` follow, and
      `[Content_Types].xml` declares the type. 249 MB to 54 MB. Against
      the v3 PNGs, all 574 images: median 45.5 dB PSNR, worst 36.3 dB
      (#93, from the panel group whose fine grain is hardest to
      compress), which at twice size shows no visible difference.

- [x] Delete `question_001` to `question_004` and write the bank afresh
      as `question_001` upwards, one folder per row in spreadsheet
      order: `wli.jpg`, `nbi.jpg` and a `question.yaml` holding
      `diagnosis:`, with the `images` keys in `assessment.yaml` changed
      to match. The images are already cropped by the steps above.
      Keep their size and save them as JPEG at quality 92, which the
      validator accepts (`ALLOWED_IMAGE_EXTENSIONS`). Measured on 40
      images: PNG median 345 KB, JPEG 54 KB, with a difference from
      the PNG of 43.6 dB PSNR, above the 40 dB at which a difference
      cannot be seen. Lossless WebP saves only a third. Scaling down,
      the first idea here, was dropped: the median image is already
      590 pixels wide, and while most were enlarged from smaller
      originals (shrinking to 75% and back changes them by a median of
      48.7 dB), some carry real detail (worst 29.6 dB), so shrinking
      would cost those. Two rows, #54 and #275, have an arrow drawn over
      the white light image as an Excel shape, not part of the picture;
      ask Mark whether to draw it into the image.
      Done on 18 October from `CLEANED v4`, on a branch
      `feature/colonoscopy-full-question-bank` built on #15's branch,
      since both change `assessment.yaml`. 287 folders in serial order,
      each `question.yaml` opening with a comment naming its serial in
      EoEETA's spreadsheet, so a question can be traced back to its
      row; serials skip where rows were removed, so `question_054` is
      serial 56. Every folder was compared byte for byte with its row's
      images and answer. `*.jpg -text` added to `.gitattributes` beside
      the PNG line. The arrows on #54 and #275 are not drawn in yet.

- [x] Check the images by eye on a sample, at least the first, last and
      every twentieth pair, against the spreadsheet: a swapped WLI and
      NBI image, or an answer on the wrong row, passes every automated
      check.
      Mark checked every image in the spreadsheet through three rounds
      of contact sheets, and the bank was then compared with the
      spreadsheet byte for byte, which is stronger than a sample.

- [x] Update `assessment/assessment.yaml` for a real bank: a
      `description` and intro page that no longer say "test assessment
      with 4 polyp image pairs", and EoEETA's figures as Mark gave them
      on 18 October: `items_per_attempt: 120` drawn at random from the
      bank, `time_limit_minutes: 60`, and `min_pool_size: 120` so the
      bank can never shrink below one attempt's worth. `randomise_order`
      stays on. Bump `version`, which the version lock requires when
      the bank changes.
      Version 10, one above #15's 9: the content validator passes
      against #15's branch, and fails against `main` (8 to 10) until #15
      merges, so #15 merges first. The intro page now gives the pass
      rules too. One validator warning stands: 82% of the bank is
      adenoma, over its 80% skew threshold, which is EoEETA's case mix
      rather than a fault.

- [x] Expect the pull request to be large: about 110 KB a pair as JPEG,
      so roughly 30 MB for 287 pairs. Plain git blobs, not LFS (see
      `.gitattributes`), which is fine at this size.

## Decisions

- **The placeholder slides are removed, not kept** - the Paris figure,
  the YouTube lecture and the patient-experience video were stand-ins
  while the slide viewer was built; leaving them between real videos
  would make delegates sit through material EoEETA did not choose.

- **The import script is not committed** - it runs once against one
  spreadsheet, and a script in the content repository would be one more
  thing to keep working for no second use.
