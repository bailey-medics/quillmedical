# Public pages: learning and assessment refocus plan

The public site at `quill-medical.com` still sells Quill as an electronic
patient record. The home page leads with FHIR R4, clinical messaging,
structured records, referrals and modular EPR deployment, and teaching is the
sixth of six feature cards. That is no longer what Quill is for. The product
people actually use is the learning and assessment platform, and its first
real customer is the East of England Endoscopy Training Academy (EoEETA).

This plan rewrites the public pages so that:

- **Learning and assessment is the product.** The home page, navigation and
  footer lead with it.
- **EoEETA is the showcase.** Its optical diagnosis module is the worked
  example on every page where an example helps, so the EoEETA team see their
  module presented well.
- **There is room to grow, lightly signalled.** One or two sentences say more
  modules are coming. No named future products, no dates and no promises.
- **Every claim is true today.** A register of claims, with evidence, sits at
  the end of this plan. Several claims on the current pages are not true and
  are removed.

The public pages live in `frontend/public_pages/src/pages/` and are built by
`frontend/public_pages/scripts/generate-pages.cjs`, which turns every `.tsx`
there into an HTML page. Navigation is in
`frontend/src/components/ribbon/publicNavLinks.ts` and the footer in
`frontend/src/components/footer/PublicFooter.tsx`. See
[Public pages separation](2026-03-19-public-pages.md) for how they deploy.

## Positioning

### One line

Online learning and assessment for clinicians, built by clinicians — with
assessments that are fair, secure, accessible and set to the standard the
specialty expects.

### The EoEETA headline

**"Optical diagnosis accreditation for every colonoscopist."** Chosen over
"national standards for colonoscopist sign-off of bowel polyps" because it is
short and names the real gap: accreditation today covers colonoscopists in
the bowel cancer screening programme, and this assessment extends it to
symptomatic colonoscopists.

It is the heading on the optical diagnosis page and the home page feature.
Where a plainer line is wanted beneath it, use "Call small polyps confidently
and correctly."

The EoEETA material the pages do not wait for — the standard to name, their
logo and images, a quote — is added afterwards, in Phase 5.

## Standout features to showcase

Only what is built and working. Each bullet is the marketing claim first,
then what backs it.

### Fair assessments

- **No two attempts are the same.** Questions are drawn at random from a
  larger pool and shuffled, and an attempt will not start unless the pool is
  big enough (`backend/app/features/teaching/router.py`, `min_pool_size`).
- **Timed, and the clock is enforced by the server.** The candidate sees a
  countdown, and answers after the limit are refused, not just discouraged.
- **Exam conditions in the browser.** Leaving the exam page is blocked, and
  closing or reloading the tab warns first. A candidate can still end early
  and submit what they have.
- **Scoring that fails safe.** An unknown or misconfigured scoring rule
  counts as a fail, never a pass.
- **Image-based questions.** Each optical diagnosis item shows the same polyp
  under white light and narrow band imaging side by side, as it is seen in
  the room.

### Results you can stand behind

- **Every result is tied to the exact question set used.** Question banks are
  version-locked: each attempt records the version it was sat against, and
  changing a live assessment needs a new version. An organisation moves to a
  new version only when an administrator chooses to.
- **Certificates on a pass.** A branded PDF certificate with a unique exam
  reference, downloadable straight away and emailed to both the candidate
  and the course coordinator.
- **A record for the coordinator.** Coordinators see every delegate's latest
  result, how many have passed and the first-time pass rate, for their own
  organisation only.

### Learning that sits beside the assessment

- **Slide-based learning modules.** Figures, callouts and video, read with
  buttons, arrow keys or a swipe on a phone.
- **Hosted, captioned video.** Videos are transcoded for smooth playback,
  captioned automatically, and served privately to signed-in learners on
  the module, not posted publicly.
- **Works on a phone.** Installable as an app, with light and dark modes.

### Safe and secure

- **Hosted in the UK.**
- **Security tested continuously.** An automated penetration test suite
  covering tampered logins, cross-site request forgery, access to other
  people's data, injection and rate limiting, plus weekly OWASP ZAP scans and
  static code scanning on every change.
- **Strong sign-in.** Argon2 password hashing, short-lived session cookies
  that scripts cannot read, and optional two-factor authentication with an
  authenticator app.

### Accessible by design

Accessibility is one of the site's main themes, not a line under security.
An exam is only fair if every candidate can read it, and NHS buyers now ask
for evidence that accessibility was designed in rather than asserted — which
is what these foundations, and the checks that keep them in place, are.
Everything below is on `main` as of the accessibility pull requests merged
on 24 and 25 September 2026 (#1058 to #1094), and is listed on the in-repo
[accessibility page](../frontend/accessibility.md).

- **Working towards WCAG 2.2 AA, with much of the work done.** The
  headline, in words close to: "Accessibility matters to us. We are working
  towards WCAG 2.2 AA, and a lot of that work is already built in:
  automated accessibility checks run on every change, and a change that
  fails them cannot be released. Testing with screen readers and with
  people who use assistive technology is still to come." It says plainly
  that the work is under way and not finished — see "What must not be
  claimed".
- **A typeface designed for low vision.** Atkinson Hyperlegible Next,
  designed by the Braille Institute so similar letters and numbers cannot
  be mistaken for each other.
- **Text at the size the NHS uses.** Body text is fixed at 19px, the size
  the NHS and GOV.UK design systems settle on.
- **Strong contrast in light and dark mode.** Every text colour is tested
  for the WCAG contrast ratio against the surfaces it sits on, and a colour
  change that breaks it fails the build. Keep this to contrast; it is not a
  claim about WCAG as a whole.
- **Colour is never the only signal.** Status colours are chosen to be told
  apart by colour-blind users, and every status also carries an icon.
- **Works from the keyboard.** A "Skip to main content" link on every page,
  focus that is always visible, and navigation reachable by Tab alone.
- **Screen reader announcements.** Loading, search results and form
  outcomes are announced without moving focus, and every page has its own
  title.
- **Respects reduced motion.** Animations stop when the device asks for
  less motion.
- **Captions on every hosted video.**
- **Keyboard and touch.** Learning slides move with arrow keys, buttons or a
  swipe.
- **Light and dark modes**, for glare, migraine and night shifts.

### Built by clinicians

- The existing "built by clinicians for clinicians" message stays. It is
  true, and it is the reason the rest of the list exists.

## What must not be claimed

These appear on the current pages or are tempting to say, and are not true
today.

- **"DCB 0129 certification"** — on the home page and About page. Hazard logs
  exist as drafts awaiting a Clinical Safety Officer; nothing is certified,
  and they cover the patient record, not teaching. Remove.
- **Anything that reads as WCAG 2.2 AA compliance.** Not "meets",
  "conforms to" or "compliant with", and not wording that implies it, such
  as "checked against WCAG 2.2 AA" on its own. Only part of the assessment
  is done: the automated phases of the
  [Accessibility](2026-09-20-accessibility-plan.md) plan are merged, but
  automated checks find only about half of accessibility problems, and the
  manual testing — screen readers, zoom, people with access needs — has not
  been done. Every accessibility claim sits next to "working towards", and
  any accessibility statement says "partially compliant".
- **"Detailed explanations accompany every answer"** — on
  `clinical-teaching.tsx`. There is no explanation field anywhere. Remove.
- **A gastroenterology question bank, MRCP preparation, curriculum mapping**
  — on `clinical-teaching.tsx`. None exists. Remove.
- **"Free to use, sign up, pick a specialty"** — there is no open sign-up;
  learners join through their organisation's registration link. Remove.
- **Progress tracking.** The learning dashboard's progress is a placeholder.
  Do not mention it.
- **Public certificate verification.** Teaching certificates carry a
  reference but there is no page to check one. Do not claim they can be
  verified.
- **Usage numbers, pass rates, customer counts.** Nobody is using production
  yet.
- **Disaster recovery or backups beyond what is built.** Data restore is not
  yet rehearsed; see [Disaster Recovery](2026-09-17-disaster-recovery-plan.md).
- **"Every access decision is logged"** — on `competency-access.tsx`. Not
  carried over to the clinical records page.
- **The patient record as a finished product.** It is in development and
  nobody uses it in production. The clinical records page says so.
- **Pass criteria or pass marks, for any module.** Not published, even in
  outline. Publishing them invites candidates to game the confidence split,
  and it would tie EoEETA to a public number they may want to change.
- **Figures on screening coverage or cost savings.** The "15% of
  procedures" and "about £30 per polyp" figures in the planning notes of
  [Teaching Module](2026-03-18-teaching-project.md) are not quoted. Describe
  the gap in words only.
- **EoEETA's name, logo, images or words without their written
  permission.** See Phases 4 and 5.
- **Named future products.** "More modules are on the way" is the most the
  site says about the future.

## Page structure

### Navigation and footer

- Top ribbon: `Learning`, `Assessments`, `For educators`, `EPR`,
  `Contact`. Pricing moves to the footer, as there is no price to show, and
  so does About (see Phase 3). `EPR` was added after the navigation unit
  landed: it links `/clinical-records`, so the clinical record is findable
  from the ribbon after the learning and assessment pages.
- Footer "Features" group becomes "Platform": Learning, Assessments,
  For educators, Accessibility, Security, Clinical records. "Company" and "Legal" stay.
- Clinical records is in the footer and the ribbon, as `EPR`, but not on
  the home page, so it is findable without competing with learning and
  assessment.
- The `NavIconName` union in `publicNavLinks.ts` grows to cover the new
  links; any new Tabler icon is registered in `appIcons.ts` first.

### Pages

- **Home (`index.tsx`)** — rewritten; detailed below.
- **Optical diagnosis (`optical-diagnosis.tsx`)** — new. The EoEETA
  showcase: the problem (accreditation covers only screening lists), the
  module (white light and NBI pairs, confidence as part of the answer), the
  learning content, the certificate, and who
  it is for. Content to be agreed with EoEETA.
- **Assessments (`assessments.tsx`)** — new. The "Fair assessments" and
  "Results you can stand behind" sections above.
- **Learning (`learning.tsx`)** — new. Slide modules, captioned video, works
  on a phone.
- **For educators (`for-educators.tsx`)** — new. Version locking, the
  coordinator's results view, certificates emailed to the coordinator. Ends
  with "Talk to us about your module" and a contact button.
- **Accessibility (`accessibility.tsx`)** — new. The "Accessible by
  design" section above, with its reasoning: fair exams need readable exams.
  The accessibility plan's phase 6 publishes the legally formatted
  statement at the same `/accessibility` address, so this page is built to
  take it: the showcase first, then the statement beneath it when it is
  written, saying "partially compliant". Until then the page links the
  Feedback route for reporting a problem.
- **Security and safety (`security.tsx`)** — new. The "Safe and secure"
  section above, written for an information governance reader.
- **Clinical records (`clinical-records.tsx`)** — new, one page replacing
  the five EPR pages. Folds their best material into short sections:
  demographics on FHIR R4 and clinical documents on OpenEHR, so the data
  stays portable; threaded clinical messaging; competency-based access that
  reflects what a clinician is qualified and authorised to do, and where;
  modules switched on per organisation. Framed as in development, ending
  with "Interested in early access? Talk to us". Carries none of the claims
  under "What must not be claimed".
- **About (`about.tsx`)** — rewritten around learning and assessment; drop
  the DCB 0129 claim. One sentence can say the same team is building a
  clinical record, linking to `/clinical-records`.
- **Pricing (`pricing.tsx`)** — rewritten: pricing is per organisation, talk
  to us. Drop "App coming soon".
- **Careers (`careers.tsx`)** — drop the FHIR and OpenEHR line.
- **Contact, legal pages, company information** — unchanged.
- **Removed**: `clinical-messaging.tsx`, `structured-records.tsx`,
  `modular-deployment.tsx`, `competency-access.tsx` and
  `external-referrals.tsx` (merged into `clinical-records.tsx`),
  `features.tsx` (a three-bullet stub) and `clinical-teaching.tsx` (replaced
  by the learning and assessment pages).

### Home page sections

1. **Hero** — title along the lines of "Clinical learning and assessment,
   done properly", one short paragraph, `Log in` and `Talk to us` buttons.
   The three info cards become: "UK hosted / your data stays in the UK", "Traceable
   / every result tied to the exact questions sat", "Accessible / designed for low vision". Built
   by clinicians already has its own section below.
2. **Featured: EoEETA optical diagnosis** — the EoEETA headline, two
   sentences, a white light and NBI image pair (with EoEETA's permission)
   and a link to `/optical-diagnosis`.
3. **Built by clinicians** — the existing section, lightly edited.
4. **Feature grid** — six `PublicFeatureCard`s: fair assessments, certificates,
   learning modules with captioned video, accessibility, for educators,
   security.
5. **What's next** — one sentence: more modules and specialties are being
   built with clinical teams, and to get in touch to build one together.

## Phase 1: Remove what is untrue or off-focus

Can ship on its own, before any new page, because it only removes.

- [x] Remove the DCB 0129 info card from `index.tsx` and the DCB 0129
      sentence from `about.tsx`. The card's slot on the home page takes
      "Version-locked", one of the three cards planned under "Home page
      sections", rather than leaving a gap in the three-column row
- [x] Change "UK / EU, GCP European region" to "UK hosted"
      wherever it appears — the home page card and the About page
- [x] Add `clinical-records.tsx`, merging the five EPR pages as described
      under "Pages". It lands in this phase so the EPR material is never
      offline between deleting the old pages and adding the new one. Only
      its first heading is a level 1 heading; the section headings use
      `PublicTitle size="md"`, so the page has the single `h1` the
      accessibility work asks for. Referrals are left out: nothing in the
      code shows them built, and the page describes only what exists
- [x] Delete the five EPR pages and `features.tsx` listed under "Removed".
      Found while doing it: `vite.config.ts` listed every page by hand in
      `rollupOptions.input`, so a page added without also editing that list
      would build locally in dev and then be missing from the deployed
      site. The list is now built from `src/pages/`, the same listing
      `generate-pages.cjs` uses, and `docs/docs/frontend/public-pages.md`
      no longer tells people to edit it. The deploy mirror-deletes, so the
      removed pages' HTML leaves the bucket on the next deploy
- [x] Replace their footer links in `PublicFooter.tsx` with one
      "Clinical records" link, and remove the EPR cards from the home page
      feature grid. The home page section that held them becomes a short
      interim "What we build" with two cards, teaching and clinical
      records, until Phase 2 rewrites the home page. The footer's strap
      line, which described patient-clinic messaging, now describes
      learning and assessment
- [x] Update `PublicFooter` stories and tests for the new link set. The
      stories needed no change; the tests now check the two links' targets
      and that none of the five retired pages is linked

## Phase 2: New and rewritten pages

Written now, without waiting for anything from EoEETA. The pages describe
their module in words and leave out what only EoEETA can give — the logo,
the polyp images, a quote and the name of a standard. Those are left out
cleanly rather than shown as placeholders, and added in Phase 5.

The pages are built before the home page is rewritten, because the new
home page links to every one of them and each unit has to be safe to
deploy on its own. Reordered from the first draft, which put the home
page first.

- [x] Set a real `<title>` and meta description per page. `titleFor` in
      `generate-pages.cjs` made titles up from the file name
      ("Optical Diagnosis", in title case) and every page shared one
      description, "clinician-first digital notes". Titles and
      descriptions now live in `frontend/public_pages/page-meta.json`,
      one entry per page, and the generator stops the build if a page has
      none. Titles follow the "Page – Quill Medical" pattern the app's
      `useDocumentTitle` uses. `generate-pages.test.ts` checks every page
      has an entry, no entry is left for a deleted page, and descriptions
      fit a search result (160 characters). Moved to the front of the
      phase because the new pages need it
- [x] Add `optical-diagnosis.tsx`. Taking part is through EoEETA, so the
      page ends with "Log in" rather than a sign-up button: there is no
      open registration. "Bowel cancer screening programme" is written out
      rather than as an acronym, and no standard is named
- [x] Add `assessments.tsx`
- [x] Add `learning.tsx`
- [x] Build every page from existing public components (`PublicTitle`,
      `PublicBodyText`, `PublicFeatureCard`, `PublicInfoCard`,
      `PublicButton`, the public backgrounds). The image-pair and logo
      components Phase 5 may need are not built yet. Six Tabler icons are
      registered in `appIcons.ts` for the feature cards, and the new pages
      import from there rather than from `@tabler/icons-react` directly,
      as that file requires. Each page has one level 1 heading; section
      headings use `PublicTitle size="md"`
- [x] Add `for-educators.tsx`. It carries the one mention of the future
      the plan allows, "More modules are on the way", beside its contact
      button
- [x] Add `accessibility.tsx`, using the wording under "Accessible by
      design". Problems are reported through Feedback in the app or the
      footer's `info@quill-medical.com` address; the legally formatted
      statement is the accessibility plan's to write
- [x] Add `security.tsx`. The penetration tests are described as running
      on every change because `test_security_pentest.py` is part of the
      backend unit suite CI runs on every push, as well as its own monthly
      workflow
- [x] Rewrite `index.tsx` as described under "Home page sections". The
      interim "What we build" section from Phase 1 is gone, and with it the
      home page's link to clinical records, which the plan keeps to the
      footer and About page. The hero keeps the Quill logo above the title
- [x] Replace `clinical-teaching.tsx` — delete it once the pages above exist.
      Its footer link now points at `/learning` until Phase 3 lays the
      footer out in full
- [x] Rewrite `about.tsx`, `pricing.tsx` and the FHIR line in `careers.tsx`.
      About drops "clinically validated", which nothing records, and links
      `/clinical-records` in one sentence. Pricing is one short section:
      agreed per organisation, with a contact button
- [x] Sentence case and British English throughout, and cspell clean. The
      exclamation marks on the old home page titles went with them

## Phase 3: Navigation

- [x] Update `publicNavLinks.ts` with the new links and icons. Departed
      from the first draft: About moved to the footer beside Pricing. The
      ribbon shows its links from the `sm` breakpoint (640px) up, and the
      estimate at the time was that five links would wrap onto a second
      line on a tablet held upright. The icons are `learning`
      (`IconPresentation`), `assessments` (`IconCertificate`) and
      `educators` (`IconChartBar`), added to `PublicNavIcon`
- [x] Add `EPR` to the ribbon, linking `/clinical-records`, with the
      existing `database` icon. Asked for after the navigation unit landed.
      Measured this time, in the production build with Playwright: with
      four links the row fitted from about 750px up; with five at the old
      spacing it was 9px too wide at 768px, an iPad held upright. The
      logo margin is now `lg` and the link gap `md`, and the row fits from
      768px up. Between 640px and about 750px it wraps to two rows, as it
      did with four links; the ribbon is still usable there, just taller
- [x] Update `PublicTopRibbon` stories and tests, including the mobile drawer.
      The ribbon and drawer read `publicNavLinks`, so their existing tests
      cover the new links; one new test pins the order, product pages
      first. The `PublicNavIcon` story and test list the three new icons
- [x] Update the footer groups as described under "Navigation and footer".
      Company gains Pricing. The footer test checks every Platform link and
      About and Pricing by their targets

## Phase 4: Check and ship

- [x] Build the public pages and click through every page and link locally,
      at desktop and phone widths. Done with a Playwright script over the
      production build at 1280, 768 and 390 pixels wide, checking for one
      `h1` and no horizontal scroll on every page, with screenshots of the
      home, optical diagnosis and accessibility pages. Three findings, all
      fixed here:
      - **The home page's info cards overflowed at tablet width.** Their
        large serif headings did not fit three columns at 768px:
        "Accessible" ran out of its card. The row now stays one column up
        to Mantine's `lg` breakpoint, and "Version-locked" became
        "Traceable", which fits on one line
      - **The footer's links were hidden on phones** (`display: none`
        below `sm`), and the mobile drawer carries only the main links, so
        About, Pricing, Accessibility, Security and the legal pages could
        not be reached from a phone at all. The groups now show, centred
      - **Six untouched pages had several `h1`s**: contact, company
        information and the three legal pages, where every section heading
        used `PublicTitle` at its default level 1 size. Their section
        headings are now level 2
- [x] Re-read every page against "What must not be claimed". A search of
      the page sources for each banned claim finds none
- [x] Check every public page with an axe browser scan and by keyboard
      alone, and fix what they find. A site that makes accessibility a main
      theme cannot fail its own check; the public pages share components
      with the app, so fixes here help both. axe, with the WCAG tags from
      `src/lib/accessibility/axeConfig.ts`, found one fault, on every page
      at desktop and tablet width: "Log in" in the ribbon was dark blue on
      navy, 2.5:1. Its CSS module set amber, but Mantine's own Anchor rule,
      which the theme points at the dark-blue link token, won on
      stylesheet order in the production build, the same trap the theme
      notes for `TextLink`. `.login` now sets `--mantine-color-anchor`
      on the element itself, which wins whatever the order. After the
      fixes axe reports nothing on any page at any of the three widths.
      A Tab walk of the home page reaches the skip link, logo, the four
      ribbon links, "Log in" and the hero buttons in order, each with a
      visible focus outline. The scan was a one-off script, not a test in
      CI; see "Later"
- [ ] Send EoEETA the preview link and ask for their written OK to be named
      on the site, kept by email. This is the one thing the deploy waits
      for, because the pages name them; if they would rather not be named,
      swap in "a regional endoscopy training academy" and deploy
- [ ] Deploy to the GCS bucket

## Phase 5: Add EoEETA's material as it arrives

Each step is its own small update to the live site, done whenever EoEETA
provides it. None blocks another.

- [ ] Name the national standard the assessment follows, if EoEETA confirms
      one and how they want it named. No standards body (BSG, JAG, BCSP,
      NICE, ESGE, ASGE PIVI) is named anywhere in the repository, so the site
      names none until then. The pass criteria stay off the site either way
- [ ] Add their logo, with written permission
- [ ] Add one white light and NBI image pair, chosen and cleared with
      EoEETA, to the home page feature and `optical-diagnosis.tsx`. If this
      needs a new component, propose it for review first, with its
      `.stories.tsx` and `.test.tsx`
- [ ] Add a short quote from EoEETA's lead, with their name and role. A
      clinician vouching for the module is the strongest thing the site can
      carry, and nothing Quill writes about itself can stand in for it

## Later

Out of scope for this plan, and recorded only so the structure leaves room
for them:

- More modules and specialties, each able to get its own showcase page in the
  shape of `optical-diagnosis.tsx`
- Quill's own teaching modules and other Quill products, added to the home
  page feature grid and navigation when they are ready to be public
- An axe scan of every public page in CI. The Phase 4 scan was a script
  run once; the site has no Playwright suite of its own, and the e2e stack
  serves the app, not the public pages. A small Playwright config that
  builds `public_pages` and serves `dist/public_pages` would let the
  existing `e2e/fixtures/axe.ts` fixture scan every page on every change
- Claims that become true as other plans land: a Clinical Safety
  Officer's sign-off, certificate verification, learner progress tracking

## Claims register

Evidence behind every claim the new pages make. Re-check this list whenever
the pages change.

- **Random selection and order** — `random.sample` / `random.shuffle` in
  `backend/app/features/teaching/router.py`; `randomise_selection`,
  `randomise_order`, `min_pool_size` in each `assessment.yaml`
- **Server-enforced time limit** — "Time limit exceeded" check in
  `router.py`; countdown in `frontend/src/components/teaching/assessment-timer`
- **Exam lockdown** — `useBlocker` and `beforeunload` in
  `frontend/src/features/teaching/pages/AssessmentAttempt.tsx`; early close
  in `components/teaching/exam-close-button`
- **Fail-safe scoring** — `backend/app/features/teaching/scoring.py`
- **Version locking** — `bank_version` on attempts and the per-organisation
  active version in `backend/app/features/teaching/models.py`; CI rule in
  `tooling/check_version_lock.py`
- **Certificates, reference and email** —
  `backend/app/features/teaching/certificate.py`, `router.py`,
  `backend/app/email_send.py`
- **Coordinator results view** —
  `frontend/src/pages/admin/teaching/AdminAllDelegatesPage.tsx`
- **Slide reader** — `backend/app/features/teaching/mdx_parser.py`,
  `frontend/src/features/teaching/pages/SlideReader.tsx`
- **Private, transcoded, captioned video** —
  [GCP Video Auth Gate](2026-08-31-gcp-video-auth-gate-plan.md);
  `video_access.py`, `transcode.py`, `backend/Dockerfile.caption`
- **UK hosting** — Google Cloud `europe-west2`; `infra/environments/*/terraform.tfvars`
- **Security testing** — `backend/tests/test_security_pentest.py`,
  `.github/workflows/security-pentest.yml`, `zap-scan.yml`; Semgrep in CI
- **Sign-in security** — `backend/app/security.py`; TOTP at
  `/settings/totp`
- **Accessibility** — `docs/docs/frontend/accessibility.md` lists each
  foundation and check with its evidence; contrast in
  `frontend/src/theme.test.ts`; component checks via Storybook's axe
  addon (`frontend/.storybook/a11y-dark-mode.ts`); page scans in
  `frontend/e2e/fixtures/axe.ts`; keyboard journeys in
  `frontend/e2e/tests/keyboard.spec.ts`; page titles in
  `frontend/src/lib/accessibility/useDocumentTitle.ts`
