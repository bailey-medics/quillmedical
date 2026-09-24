# Accessibility plan

Quill's design foundations are deliberately accessible, but nothing checks
that they still are.

The theme uses Atkinson Hyperlegible, a typeface the Braille Institute
designed for low vision. Body text is fixed at 19px, the size the NHS and
GOV.UK design systems settle on. Status colours were chosen so that
colour-blind users can tell error from success, and every status also carries
an icon so the colour is never the only signal. The three layouts render a
`main` landmark, the document declares `lang="en"`, and thirty component
files carry `aria-label`s. These are choices most codebases never make.

What is missing is verification. `@storybook/addon-a11y` is in
`package.json` but is not registered in `.storybook/main.ts`, so it has never
run a check. There is no `jsx-a11y` lint rule, no axe scan in the end-to-end
suite, no record of testing with a screen reader, and no accessibility
statement. Meanwhile `docs/docs/frontend/accessibility.md` describes text
size and interface density settings, a session timeout warning, a phone line,
an <accessibility@quillmedical.com> inbox and ADA compliance — none of which
exist. That page is the opposite of what an NHS buyer now asks for: the
revised DTAC wants evidence that accessibility was _designed in_, and
explicitly warns against accessibility that is merely _asserted_.

The intended outcome is WCAG 2.2 AA conformance that CI measures on every
pull request, a truthful accessibility statement in the format the law
prescribes, and the evidence a DTAC assessor will ask to see, all built so
that a sole developer can keep them green without a specialist.

## Standards this plan targets

- **WCAG 2.2 Level AA** — the technical standard. It is the only document
  here with testable success criteria; everything else points at it. WCAG
  2.2 was published in October 2023 and adds nine criteria over 2.1 (six at
  A/AA), and removes 4.1.1 Parsing. Conforming to 2.2 implies conforming to
  2.1, so there is no reason to target the older version.

- **Public Sector Bodies (Websites and Mobile Applications) Accessibility
  Regulations 2018** — the law. It requires WCAG AA (monitored as 2.2 since
  October 2024) and a published accessibility statement in a mandated
  format. It binds NHS bodies, and they remain legally responsible for
  software they buy, so it reaches Quill through procurement. GDS is the
  monitoring body and samples sites each year.

- **DTAC, revised 6 April 2026** — the NHS supplier assessment every buyer
  requires. Section D1 (usability and accessibility) is no longer scored,
  only reviewed comparatively, but it now names WCAG 2.2 AA, requires a
  user journey map, and requires the supplier to show it has considered the
  Accessible Information Standard. Sections C1–C4 cover clinical safety,
  data protection, technical security and interoperability; C1 is already
  served by the hazard log under `docs/docs/safety/`.

- **NHS service standard, point 5** — "make sure everyone can use the
  service". Assessment criteria rather than test criteria: WCAG 2.2 AA,
  works with common assistive technologies, a GOV.UK-format statement, and
  people with access needs included in user research. The NHS accessibility
  checklist breaks WCAG 2.2 down by criterion with severity, affected users
  and who is responsible; it is the natural template for a conformance
  record.

- **Accessible Information Standard (DAPB1605)** — a provider obligation to
  identify, record, flag, share, meet and review patients' communication
  needs. For a software supplier it means the product can store those needs
  as coded data and surface them. Quill has no live patient records yet, so
  this plan scopes it as a design consideration to document now and a data
  model change to make when FHIR demographics go live.

Not in scope: **DDaT** is the civil service capability framework for
digital job roles, not a product standard. **DCB0129** is the clinical risk
standard, already handled in the hazard log; it is not an accessibility
standard.

## What WCAG 2.2 adds, and how each new criterion lands on Quill

- **2.4.11 Focus not obscured (AA)** — a focused element must not be fully
  hidden behind sticky content. Quill has a sticky top ribbon and a side
  navigation drawer; the risk is a focused control scrolling under the
  ribbon. Checked by keyboard walk-through, not by axe.

- **2.5.7 Dragging movements (AA)** — anything draggable needs a click or
  tap alternative. A search of the frontend found no drag-and-drop, so this
  passes by absence. Worth a lint-time note so it stays that way.

- **2.5.8 Target size (AA)** — interactive targets at least 24×24 CSS
  pixels or spaced apart. Mantine's default `ActionIcon` is 28px and inputs
  are larger, so the exposure is compact table row actions and pagination.
  axe has a `target-size` rule for this but ships it disabled; phase 1 turns
  it on.

- **3.2.6 Consistent help (A)** — if help is offered, it sits in the same
  place on every page. Quill currently offers none in-app, which passes;
  when a help link or feedback route is added for the statement it must go
  into the ribbon or footer on every layout.

- **3.3.7 Redundant entry (A)** — do not ask for the same information twice
  in one session. The multi-step form and registration flow are the places
  to check that earlier answers are carried forward.

- **3.3.8 Accessible authentication (AA)** — no cognitive function test
  without an alternative or a mechanism. Passwords are fine because browsers
  and password managers autofill. A TOTP code is fine only if it can be
  pasted; `LoginForm.tsx` renders it as a plain `TextInput` with
  `autoComplete="one-time-code"` and no paste handler, so it complies. No
  CAPTCHA anywhere. Verified, nothing to do.

The remaining three new criteria (2.4.12, 2.4.13, 3.3.9) are AAA and out of
scope.

## What automation can and cannot see

axe-core, which both `addon-a11y` and `@axe-core/playwright` wrap,
catches around half of WCAG issues: missing labels and alt text, broken
ARIA, colour contrast, heading and landmark structure, form field naming,
target size. It cannot judge whether alt text is _meaningful_, whether
focus order makes sense, whether a screen reader announces a loading state,
whether keyboard focus is obscured, or whether the journey is
understandable. Those need a person with a keyboard and a screen reader,
which is phase 5. The plan puts automation first because it is the part
that keeps working after the person has moved on.

## Phase 1: Turn on the component checks

The Storybook heavy tier already runs `@storybook/test-runner` against all
656 stories, in 176 story files, on every non-draft pull request.
Test-runner 0.24 on Storybook 10 runs `addon-a11y` checks out of the box
once the addon is registered; no `test-runner.ts` hooks are needed.

- [x] Register `@storybook/addon-a11y` in the `addons` array in
      `frontend/.storybook/main.ts`
- [x] Add `parameters.a11y` to `frontend/.storybook/preview.tsx`:
      `test: "todo"` for the first run, `options.runOnly` set to
      `["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]`, and
      `config.rules` enabling `target-size` (axe ships it disabled)
- [x] Run `just sbtci` locally and record the baseline: violations by rule
      id and by component, in a `## Baseline` bullet list at the foot of
      this plan. Two findings from doing it. First, a Storybook dev server
      started before the addon was registered does not load it, and the
      test-runner then fails every story with `ReferenceError: Cannot
access 'StorybookTestRunnerError' before initialization` rather than
      with a readable message; restart Storybook after changing
      `main.ts`. Second, the test-runner's failure message shows only the
      first violating element per story, which is too little to count
      from, so the baseline was taken with a throwaway Playwright script
      that runs axe-core 4.13 with the same tags and rules against every
      story in both colour schemes and records every node
- [x] Run the checks in dark mode as well as light: either a second
      `colorScheme` pass in the test-runner or a `Dark` story variant on
      every component with a coloured surface. Contrast failures in dark
      mode will not show in light. Moved up from after the fixes: the
      baseline shows 327 dark-only contrast nodes, so the dark pass has to
      be running before the fixes, or they cannot be seen to work.
      Built as a second pass in the test-runner, in
      `frontend/.storybook/a11y-dark-mode.ts`: after each story's normal
      visit it sets the `colorScheme` global to dark, waits for the
      story to re-render (which re-runs the addon's axe check), reads the
      a11y result off the `STORY_FINISHED` event, and treats it under the
      story's own `parameters.a11y.test`. Stories that pin their own
      scheme are skipped, having already been checked in it. It cannot
      live in `.storybook/test-runner.ts`, the documented place for
      hooks: Storybook 10 loads that file through a TypeScript loader it
      installs with `module.register()`, and Jest 30.5 refuses that call
      inside a test environment, so any config file there fails every
      suite. It is added through an ejected
      `frontend/test-runner-jest.config.js` as a `setupFilesAfterEnv`
      entry instead, and sets the `__sbPostVisit` global the runner
      calls. A `Dark` variant of every story was rejected as 656 more
      stories to keep in step by hand
- [x] Fix the baseline component by component, the highest-count rule
      first. Each fix is a normal PR with a story change and a unit test
      where the fix is behaviour rather than markup. The baseline showed
      that contrast failures cluster on a few theme tokens, so the
      contrast work goes token by token rather than component by
      component: fixing a token fixes every component that uses it
  - [x] Muted text. `--mantine-color-dimmed` is set in `theme.ts` for
        both schemes: `gray.7` `#495057` in light (8.2:1 on white, 6.9:1
        on `gray.2`) and `primary.1` `#93b4d9` in dark (6.3:1 on the
        input navy, more on the body and card). Mantine's own dark
        dimmed is `dark-2`, which this theme repurposes as a surface
        colour, so dimmed text in dark mode was near-invisible. The
        components that hard-coded `gray.5` or `gray.6` for text
        (`FieldDescription`, `ErrorState`, `NotFoundLayout`,
        `ModuleMediaCard`, the input description override and the story
        `VariantRow` labels) now use `dimmed`. `gray.5` and `gray.6`
        stay for icons and borders, where WCAG 1.4.11 asks only 3:1.
        `src/lib/colour-contrast/` computes WCAG ratios so `theme.test.ts`
        holds the token to AA on every surface it sits on. `gray.7` over
        a lighter grey was chosen because it is already in the scale as
        "strong muted text"; GOV.UK's secondary text, `#505a5f`, is a
        near neighbour
  - [x] Status fills. The status fills in `statusColourValues` that
        take white text move to the first Mantine shade that clears
        4.5:1: teal.9, cyan.9, pink.7, blue.8 and red.9; violet.6
        already passed. Hue is unchanged, so the colour-blind separation
        the palette was chosen for still holds. Darkening a fill broke
        the places that used it as a word on the page in dark mode, so a
        second, scheme-aware set of tokens, `--<status>-text-color` from
        `statusTextColourValues`, now serves text: a darker shade in
        light mode, which also clears 4.5:1 on `gray.2`, and Mantine's
        shade 3 in dark. `statusColours` gains an `fg` beside `bg`, and
        the text call sites (`StatusStrip`, `UpdatingBanner`,
        `ModuleMediaCard`, `SyncResultsPanel`, `MarkdownView` links) use
        it. Three fills that bypassed the tokens were fixed where they
        stood: `ButtonPairRed` used Mantine's `red`, which this theme's
        `primaryShade` of 5 makes `red.5`; `AssessmentTimer` put white
        text on the yellow warning fill; the triage payment badge used
        `gray`. `theme.test.ts` now holds every fill and text token to
        AA on every surface
  - [x] Dark-mode navy accents and the error colour on dark inputs.
        Links get `--link-color` and `--link-hover-color` tokens,
        `primary.4` and `primary.8` in light as before, `primary.1` and
        `primary.0` in dark, where `primary.4` was 2.3:1 on the card
        navy and the old hover darkened to near-invisible. `TextLink`
        and the `FilterModal` reset link use them. `--error-color` was
        failing in light mode too, which the baseline had understated:
        `#f55142` is 3.4:1 on white. It becomes `#c4320a` in light
        (5.5:1, the same orange-red hue, kept for colour-blind users)
        and `#ff8a65` in dark (5.8:1 on the input navy). The dark chat
        bubble moves from `primary.4` to `primary.5`, the disabled
        `MultiSelectField` no longer fades its pills below AA, and
        `EmptyState` uses `dimmed` rather than the input placeholder
        grey, because an empty-state hint is content a reader needs.
        After this, dark mode has no contrast failures in any story
  - [x] ARIA: progress bar names, `FilterSelect`'s `aria-expanded`,
        scrollable regions, `ProfilePic` alt text and the `DateField`
        clear button. `TeachingProgressBar` takes a required `label`
        and writes its own ARIA, because Mantine's `withAria` offers no
        name and always speaks the raw percentage ("10.5%"); it now
        says "3 of 10" where it shows a count. `FilterSelect`'s popover
        wraps the button alone, so `aria-expanded` lands on the button
        instead of a `div`. The `Messaging` thread's scroll viewport is
        a focusable, named `role="log"`. `ProfilePic` gives a photo the
        person's name as `alt`, and `DateField` names its clear button.
        A new finding on the way: youtube-video-element builds its
        iframe with no title and no way to pass one, so `VideoPlayer`
        titles it through the element's shadow root (`titleFrames`).
        The layouts' `main` is not fixed here; see the phase 3 step on
        the scroll container
  - [x] Reference stories that show colours rather than use them. None
        needed an override in the end: `Colours.stories.tsx` passed once
        the status and muted tokens it renders were fixed. What was left
        was of two other kinds. Stories on a navy backdrop
        (`PublicButton`, `PublicNavIcon`, `PublicBodyText`,
        `BurgerButton`) had variant labels in the light-mode `dimmed`
        grey, unreadable on navy once that grey was darkened; they now
        share `NAVY_BACKDROP` from `src/stories/backdrops.ts`, which
        swaps in the dark-mode `dimmed`. And every Mantine modal's close
        button had no name, which the baseline missed because the
        throwaway scanner checked `#storybook-root` and modals render in
        a portal outside it; the addon checks the whole document and
        found it on the first `error` run. `theme.ts` now names it
        "Close dialog" for every modal, not "Close", because several
        modals end on a text button called "Close"
- [x] Switch `test: "todo"` to `test: "error"` once the baseline is clear,
      so violations fail the heavy tier. A full `test-storybook` run in
      `error` mode passed, light and dark (624 passed, 3 skipped), until
      #1071 merged to `main` mid-stack and made the current nav link brand
      amber `secondary.5`, 2.66:1 on white, failing 18 nav stories. Light
      mode now uses `secondary.7` `#886223`, still amber and 5.5:1 on
      white; dark mode keeps `secondary.5`, which passes on navy
- [x] Add a `docs/docs/frontend/accessibility/` section to the Storybook
      docs page describing how to read an axe failure in the a11y panel and
      where per-story rule overrides belong (`parameters.a11y.config.rules`,
      never a global disable). Written as the "Accessibility Testing"
      section of `docs/docs/frontend/storybook/index.md`, replacing a
      paragraph that said the addon was not yet configured; the
      `docs/docs/frontend/accessibility/` directory is left for the
      phase 5 and 6 evidence it names

## Phase 2: Lint at the keyboard

The pre-commit hook already runs ESLint on staged files. Adding
`eslint-plugin-jsx-a11y` catches the static half of the problems before
they reach a story: an `ActionIcon` without a label, an `img` without alt, a
click handler on a `div`, a positive `tabIndex`.

- [x] Add `eslint-plugin-jsx-a11y` and extend
      `jsxA11y.flatConfigs.recommended` in `frontend/eslint.config.js`.
      6.10.2 declares ESLint up to 9 as its peer and this repo is on
      ESLint 10; Yarn warns, and the rules run correctly
- [x] Run `yarn eslint` across `src/` and fix what it finds; the rough
      counts are nine `Image`/`img` uses without `alt` and seven
      `ActionIcon` uses without `aria-label`. It found far fewer, because
      jsx-a11y only sees native elements: an `<Image>` or `<ActionIcon>`
      without a label is invisible to it, which is what the next step's
      required props are for. The real findings were one `img` whose
      `alt` arrived through a spread (`Image.tsx`, now explicit), and
      four clickable `div`s. The message thread cards in `MessagesList`
      and the patient details in `TopRibbon` became `UnstyledButton`s so
      the keyboard reaches them; double-click on the ribbon, which opens
      the record, stays a mouse shortcut beside the side-nav link. The
      other two, in `AppTooltip` and `MarkdownView`, are event plumbing
      rather than controls (a delegated handler for real links, and a
      tap that must not reach a parent), and carry a disable comment
      saying so
- [x] Make `alt` a required prop on `components/images/Image.tsx` and
      `aria-label` a required prop on `components/button/IconButton.tsx`,
      so the type checker enforces what the linter only warns about.
      `Image` already required `alt`; `IconButton` now requires
      `aria-label`, and every existing caller already passed one. The
      linter is also told to treat `<Image>`, ours and Mantine's, as an
      `img` (`settings.jsx-a11y.components`), so `alt-text` covers the
      five Mantine `Image` uses too; all had alt text
- [x] Add a `no-restricted-imports` pattern steering `ActionIcon` imports
      from `@mantine/core` towards `IconButton`, matching the existing
      `MantineProvider` restriction. Six icon-button wrappers already use
      `ActionIcon` at their own sizes (`BurgerButton`, `SearchButton`,
      `EllipsisMenu`, `FilterSelect`, `InboxButton`, `SearchFields`),
      each labelled; they are exempted by name rather than rebuilt on
      `IconButton`'s fixed 42px, which would change how they look

## Phase 3: Fix the known gaps

Things the survey found that no tool will fix on its own.

- [x] Set `focusRing: "auto"` and `respectReducedMotion: true` explicitly in
      `frontend/src/theme.ts`. Mantine defaults `focusRing` to `auto`
      already; `respectReducedMotion` defaults to `false`, which means the
      `prefers-reduced-motion` claim in the current docs page is untrue. Both set, with a theme test pinning each
- [x] Add a skip link ("Skip to main content") as the first focusable
      element in `MainLayout`, `TeachingLayout` and `PublicLayout`,
      targeting the existing `main` landmark. Build it as a component in
      `components/navigation/` with a story and a test. `SkipLink` and
      `SkipLinkTarget` in `components/navigation/skip-link/`: an
      `Anchor` hidden off-screen until focused, then pinned top left in
      the brand navy above the ribbon; activating it moves focus rather
      than only changing the hash, which the router would treat as
      navigation
- [x] Decide how a keyboard scrolls `main`. All three layouts make
      `main`, not the window, the scroll container, so a page with nothing
      focusable in it (a long slide, a long read) cannot be scrolled from
      the keyboard in Safari; axe reports `scrollable-region-focusable`
      on the long-read layout stories, which are `!test` and so not in
      the CI run. Chrome (since 130) and Firefox make such a scroller
      focusable themselves, and `tabIndex={-1}` on `main`, tried in
      phase 1, switches that off. The candidates are `tabIndex={0}`
      with a visible focus style, or letting the document scroll
      instead of `main`. Settle it with the skip link above, which also
      needs a focus target in `main`. Decided with the skip
      link: its target, `SkipLinkTarget`, is a `tabIndex={-1}` wrapper
      _inside_ `main`, not `main` itself. Once focus is inside a scroll
      container the arrow keys, Page Down and Space scroll it, so the
      skip link is a keyboard route into `main` in every browser, and
      `main` keeps no tabindex, so Chrome's and Firefox's own focusable
      scrollers still work. Checked in Chromium with Playwright: Tab,
      Enter, Page Down scrolls the long-read story's `main` by 1,118px.
      Safari is not checked here (WebKit is not installed); the phase 5
      VoiceOver and Safari run covers it. axe still reports
      `scrollable-region-focusable` on the three `!test` long-read
      stories, because it does not count a `tabIndex={-1}` element as a
      way in; making `main` a tab stop would silence it at the cost of
      an extra, invisible-feeling stop on every page, which is worse
- [x] Walk every page with Tab and Shift+Tab and confirm no focused element
      disappears under the sticky ribbon (2.4.11). Fix with
      `scroll-padding-top` on the scroll container where it does. Walked with
      Playwright over every layout and teaching-layout story at 1280px
      and 390px, sixty Tab presses each, checking each focused element
      against the ribbon's box: nothing was covered. The layouts make this
      pass by construction, since the ribbon sits above `main` rather
      than over it and `main` scrolls on its own, so there was no
      `scroll-padding-top` to add. The skip link is the one thing drawn
      over the ribbon, deliberately. Phase 5's manual keyboard runs
      re-check it on real pages
- [x] Audit heading order: one `h1` per page, no skipped levels. There is
      one `order={1}` use and three `Title`s without an `order` in the
      frontend; pages composed from `BaseCard` headings are the likely
      offenders. Twenty-five routes had no `h1`: most led
      with a `Heading`, which is always an h2, and a few had no heading
      at all. `Heading` gains `level={1}`, which changes the element and
      keeps the h2 size, and the pages and page-only components whose
      first heading is the page title now use it (the patient lists,
      notes and letters, the login, password and verify forms, the
      teaching results and history pages, `NotFoundLayout`,
      `LetterView`). Pages whose content already names them to a sighted
      reader (a patient's record, a message thread, a slide, an
      assessment question, the patient list) get
      `<PageHeader visuallyHidden />`, an h1 for screen readers only.
      The layouts' own stories still show no h1 where they render demo
      content without one; the phase 4 page scans check real routes
- [x] Loading and result states announce themselves: the eight existing
      `aria-live` and `role="status"` uses should cover the table
      skeletons, form submission, search results and the notification
      system. List the components that lack one and add it. The survey
      found live regions already on `FormStatus` (which also carries the
      page-level flash messages), `StatusStrip`, `UpdatingBanner` and
      `ErrorState`, and none on anything that loads. A new `LiveStatus`
      component, a visually hidden polite `role="status"` that stays
      mounted and changes its text, now says "Loading" while `DataTable`,
      `DataTableWithResults`, `PatientsList` and `MainLayout` show
      skeletons, and `DataTableControlled` says "3 results" once a search
      or filter narrows it. Staying mounted matters: most screen readers
      announce a change to a live region they already know, and many
      ignore one that arrives already filled. The table wraps its view
      so the region survives the switch between loading, empty and
      loaded. One fix the other way: `Callout` had `role="alert"`, which
      made a screen reader interrupt with every teaching callout as the
      slide rendered; it is now `role="note"`. Not covered: the page-level
      Mantine `Loader` spinners in `PatientMessages` and
      `PatientMessageThread`, which have no text; they are short waits
      and are left for the phase 5 screen reader run to judge
- [x] Target size sweep (2.5.8): table row actions, pagination controls,
      `SortHeader`, `CompetencyRow` buttons. Anything under 24px gets a
      larger hit area or spacing, not a bigger icon. axe's `target-size` rule,
      on in every story since phase 1, found nothing, and a Playwright
      pass measured every button, link, checkbox, radio and switch in
      every story. The four components named here were all 24px or more.
      Two targets were under 24px: the remove button on a filter pill
      (21px tall) and the filter panel's Reset link (23px), both in
      `FilterModal`, now given a 1.5rem minimum height. Radios and
      switches measure 16–20px but their labels are part of the target,
      and the video player's time readout is media-chrome's own control
- [x] Redundant entry check (3.3.7): confirm the multi-step form and
      registration carry earlier answers forward and that nothing asks for
      an email or name twice. Both multi-step forms
      (`NewPatientPage` and `UserInfoUpdatePage`) hold their answers in
      page state above `MultiStepForm`, so a step that unmounts comes back
      filled in, and the final step shows the answers for confirmation
      rather than asking again; a `MultiStepForm` test now pins going
      back to an earlier step. Registration's "Confirm password" is the
      criterion's own named exception (re-entry for security), and no
      form asks for an email or name twice
- [x] Session timeout: the access cookie lives fifteen minutes and refresh
      is silent, so there is no timeout prompt and 2.2.1 Timing Adjustable
      passes by design. Note this in the conformance record rather than
      building the warning the docs page currently promises

## Phase 4: Scan whole pages in the end-to-end suite

Components can each pass and still compose into a page with two `h1`s, a
missing landmark, or a focus order that jumps. `just e2e` already brings up
the CI stack and drives real pages; an axe scan per journey is a few lines
on top.. Confirmed in the code: the access cookie
is fifteen minutes, `api.ts` refreshes it silently on a 401, and
the refresh token lasts `REFRESH_TTL_DAYS` (seven days), which is
beyond WCAG 2.2.1's twenty-hour exception. This goes into the
phase 6 conformance record as a pass by design

- [ ] Add `@axe-core/playwright` and a `frontend/e2e/fixtures/axe.ts`
      fixture that builds one `AxeBuilder` with the same tags as phase 1,
      so the WCAG baseline lives in one place
- [ ] Scan the pages each existing spec visits (`login`, `navigation`,
      `settings`, `teaching`, `auth-guard`) after their main assertions,
      in both colour schemes
- [ ] Assert on a fingerprint of `{ ruleId, selector }` pairs rather than
      the full violations array, per the Playwright guidance, so an
      unrelated markup change does not break the scan
- [ ] Attach the full axe report to the test via `testInfo.attach` so a
      failure in CI is diagnosable from the artefact
- [x] Add a keyboard-only journey test for the two highest-risk flows:
      login with 2FA, and opening a teaching lecture from the list. These
      use Playwright's `keyboard.press("Tab")` and assert on
      `document.activeElement`, not on axe. In
      `e2e/tests/keyboard.spec.ts`. Login with 2FA needed a user to log
      in as: `seed_ci.py` now seeds `twofactor`, with RFC 4226's published
      test key as its TOTP secret, and `e2e/fixtures/totp.ts` derives the
      current code from it. Departed from the plan for the second
      journey: CI seeds no teaching modules, so there is no lecture to
      open. It is replaced by two journeys over what CI does have: the
      skip link landing inside `main`, and reaching Settings through the
      side navigation by Tab alone. Opening a lecture stays in phase 5's
      manual scripts until CI seeds a module. These journeys found three
      faults that no automated check had, all fixed here: - **The side navigation could not be reached from the keyboard at
      all.** Mantine's `NavLink` renders an `<a>`, and every nav item
      navigated in an `onClick` with no `href`, which leaves an `<a>`
      that is not focusable. Items with a destination are now router
      `Link`s (`NestedNavLink`, and Home and Messages in
      `SideNavContent`), and `theme.ts` makes every other `NavLink` a
      `button` (Feedback, Logout, the slide list, Exit lesson). - **The closed navigation drawer stayed in the page**, only slid
      off-screen, as an `aria-modal` dialog. With its items now
      focusable they would have been invisible tab stops, and an
      always-present modal tells a screen reader to ignore everything
      else. `NavigationDrawer` is now `inert` while closed, modal only
      while open, and named "Navigation". - **The authenticator code field appeared without focus** after the
      server asked for a second factor. `LoginForm` now moves focus to
      it. The login page itself has no skip link because it has no
      layout and so nothing to skip

## Phase 5: Test with people and assistive technology

Automation is done at this point and everything after it is judgement.
GOV.UK's matrix for public beta is JAWS, NVDA, VoiceOver on iOS, TalkBack,
a screen magnifier and Dragon. For one developer on a Mac the realistic
first pass is below; JAWS and Dragon are licensed and can wait for a
commissioned audit.

- [x] Write four journey scripts in
      `docs/docs/frontend/accessibility/journeys.md`: log in with 2FA,
      find and open a patient, open and complete a teaching lecture, sign
      off a passport competency. Each is a numbered list of steps with the
      expected announcement or focus position at each. Written, each with who walks it (for
      the phase 6 journey map), and with a zoom and a wrong-input step
      where the journey has one
- [x] Keep the results in
      `docs/docs/frontend/accessibility/testing-log.md`, one entry per run
      with date, tool, browser, journey and findings. This log is the
      evidence DTAC D1 asks for and the "preparation" section of the
      statement cites. Created, with its entry format and the two
      automated runs so far (the keyboard journeys and the focus walk) as
      its first entries, and a "not yet run" list naming every manual run
      below, so the gap is on the record rather than implied. Both pages
      are in the MkDocs navigation under Frontend, Accessibility. Moved up from after the runs, because the log is
      created before the first run, not after
- [ ] Run each journey with VoiceOver and Safari on macOS, and with
      VoiceOver on iOS. Record pass, fail or partial per step
- [ ] Run each journey with NVDA and Firefox in a Windows virtual machine
- [ ] Run each journey at 200% browser zoom and at 400% (WCAG 1.4.10
      Reflow requires no horizontal scroll at 320px equivalent)
- [ ] Run each journey with TalkBack on Android if a device is available;
      otherwise record it as untested in the statement
- [ ] Recruit at least two people with access needs (a screen reader user
      and someone with a motor impairment or cognitive difference) to walk
      the teaching journey before the passport launches. Sole-developer
      note: an hour each over video is enough; record consent and findings
      in the log, no names

## Phase 6: Statement and evidence pack

The accessibility statement has a legally mandated structure. It is
published on the public site, not inside the app, because it must be
readable by someone who cannot yet log in.

- [x] Replace `docs/docs/frontend/accessibility.md` with a page that says
      only what is true: the design foundations, the checks that run in
      CI, the testing log, and the statement's location. Remove the ADA,
      Section 508, text size, density, phone line, timeout warning and
      mailbox claims
      The runs below need a person with the device and the screen reader,
      and cannot be automated or done by an unattended build. They stay open
      until someone does them and logs the result.. Rewritten
      from 615 lines to one short page: the design foundations, the checks
      that run in CI, "nothing yet" for testing by people, the known gaps,
      and where the statement will go. Every claim on it is backed by the
      code, a test or the testing log, and it says so where people have
      not checked something yet
- [x] Give every page its own document title (WCAG 2.4.2 Page titled).
      Found while going through the criteria for the conformance record
      below: every route kept `index.html`'s "Quill Medical", so a screen
      reader announced the same title on every page, and every tab and
      history entry read the same. `useDocumentTitle` in
      `src/lib/accessibility/` sets "Page – Quill Medical", the GOV.UK
      pattern, and `PageHeader` and `Heading level={1}` call it, so a
      page's h1 is also its title; phase 3 gave every page exactly one.
      An e2e test checks the teaching dashboard's title
- [x] Build the DTAC D1 evidence pack in
      `docs/docs/frontend/accessibility/dtac-d1.md`: the user journey map
      (the four journeys from phase 5 with the roles that walk them), the
      WCAG 2.2 AA conformance record listing every A and AA criterion with
      pass, fail, not applicable, and how it was tested (use the NHS
      accessibility checklist's criterion list as the skeleton), and the
      testing log. In
      `docs/docs/frontend/accessibility/dtac-d1.md`, in the MkDocs
      navigation. The record lists all fifty-five A and AA criteria (4.1.1
      Parsing omitted, as WCAG 2.2 removed it) with one of six statuses:
      pass, pass by design, partial, fail, not applicable or not yet
      assessed, each with its evidence. Honestly counted, most are partial
      or not yet assessed, because they need the phase 5 runs; none is
      marked fail today, but two were until this plan's own work
      (keyboard access to the navigation, #1091, and page titles, #1094)
- [x] Write the Accessible Information Standard note the revised DTAC
      requires: what Quill will record (the four AIS data subsets as
      SNOMED CT codes on the FHIR `Patient`), how a recorded need will be
      flagged in the patient banner, and that it is designed but not built
      because there are no live patient records. Add the data model work
      as a checklist item in the clinical launch plan rather than here. A section of
      `dtac-d1.md`: the four data subsets as SNOMED CT entries on the FHIR
      `Patient`, a text-and-icon marker in the patient banner that is
      announced to screen readers, and the reasoning for deferring. There
      is no clinical launch plan yet, so the data model work went on the
      project to-do list instead, beside the language preference
      question the internationalisation plan raises
- [ ] Choose the feedback route the statement names. A monitored email
      address is the minimum; it must actually be read. Moved ahead of the statement, which has
      to name it, and the evidence pack and AIS note moved ahead of both,
      because they need neither. This is a decision for a person: the
      address has to be one somebody reads
- [ ] Write the statement in the GOV.UK model format, in order: commitment
      referencing the 2018 regulations; scope (the app and the public
      site, by URL); compliance status, which will be **partially
      compliant** until phase 5 is done and must stay honest after it;
      non-accessible content under the three mandated headings
      (non-compliance, disproportionate burden, out of scope); preparation
      date, evaluation method and last review date; a feedback route; the
      EHRC and EASS enforcement paragraph
- [ ] Publish it at `/accessibility` on the public site
      (`frontend/public_pages/`) and link it from the public footer and
      from the app's ribbon or settings, so 3.2.6 Consistent help is met
      in the same change
- [ ] Set an annual review date for the statement and add it to the
      stale-incidents or a similar scheduled workflow so it cannot be
      forgotten

## Phase 7: Keep it green

- [ ] Add to `.claude/rules/components.md`: every component story must pass
      the a11y check; `IconButton` and `Image` are the only way to render
      an icon button or image; per-story rule overrides need a comment
      saying why
- [ ] Add "re-run the phase 5 journeys" to the checklist of any plan that
      changes a layout, the ribbon, navigation, or the login flow
- [ ] Confirm Renovate is tracking `axe-core` transitively through
      `@storybook/addon-a11y` and `@axe-core/playwright` so rule updates
      arrive on their own
- [ ] Revisit the statement's compliance status whenever the testing log
      gains a failing entry that is not fixed within the sprint; a
      statement that claims more than the log shows is the worst outcome

## Decisions

- **WCAG 2.2 AA, not 2.1** — the revised DTAC and GDS monitoring both
  name 2.2, 2.2 conformance implies 2.1, and the delta is six A/AA
  criteria of which one (accessible authentication) already passes and one
  (dragging) passes by absence.

- **Blocking in the heavy tier, not the fast tier** — the Storybook test
  job already runs only on non-draft PRs and the merge queue, so adding
  axe there costs no extra CI minutes on every push. It blocks a merge,
  which is the point, without slowing the inner loop.

- **`todo` before `error`** — flipping straight to `error` would block
  every open PR on a backlog nobody has seen. One `todo` run produces the
  baseline; the switch to `error` is a one-line change once it is clear.

- **Components first, pages second** — 656 stories in 176 files cover the
  components, and pages are composed from them. Fixing a component fixes every page
  that uses it. The page-level scan then only has to catch composition
  faults, which are fewer and easier to reason about.

- **Keep `@storybook/test-runner`, do not add the Vitest addon** — the
  test-runner has native a11y support on Storybook 9 and later and is what
  CI already runs. Switching runners is a separate piece of work with its
  own risks and no accessibility benefit.

- **The statement says "partially compliant" until the log says otherwise**
  — the regulations require the statement to be true, and GDS monitoring
  checks it against the site. An honest partial statement with a dated
  plan is a stronger DTAC answer than a full-compliance claim that a
  screen reader disproves in a minute.

- **AIS is documented, not built, in this plan** — the standard's
  recording and flagging obligations only bite when there are patient
  records to attach needs to. Designing the SNOMED fields now and
  building them with the FHIR demographics work avoids a retrofit.

- **No accessibility overlay or widget** — third-party overlays do not
  achieve conformance and are a known red flag to assessors. The fixes go
  in the components.

- **Sole-developer testing matrix** — VoiceOver on macOS and iOS and NVDA
  in a VM are free and cover the two dominant screen readers. JAWS and
  Dragon are deferred to a commissioned audit, and the statement says so.

## Sources

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and
  [What's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [Understanding 3.3.8 Accessible authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)
- [Accessibility requirements for public sector bodies](https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps)
  and the [model accessibility statement](https://www.gov.uk/guidance/model-accessibility-statement)
- [Testing with assistive technologies](https://www.gov.uk/service-manual/technology/testing-with-assistive-technologies)
- [What all NHS services need to do about accessibility](https://service-manual.nhs.uk/accessibility/what-all-nhs-services-need-to-do)
  and [NHS service standard point 5](https://service-manual.nhs.uk/standards-and-technology/service-standard-points/5-make-sure-everyone-can-use-the-service)
- [NHS accessibility checklist](https://nhsdigital.github.io/accessibility-checklist/)
- [Using the DTAC](https://digitalregulations.innovation.nhs.uk/regulations-and-guidance-for-developers/all-developers-guidance/using-the-digital-technology-assessment-criteria-dtac/)
  and a summary of the
  [April 2026 revision](https://www.burges-salmon.com/articles/102mnjh/new-nhs-digital-technology-assessment-criteria-what-health-tech-suppliers-need-t/)
- [Accessible Information Standard requirements (DAPB1605)](https://www.england.nhs.uk/long-read/accessible-information-standard-requirements-dapb1605/)
- [Storybook accessibility testing](https://storybook.js.org/docs/writing-tests/accessibility-testing)
  and [@storybook/test-runner](https://github.com/storybookjs/test-runner)
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [axe-core rule descriptions](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [Are Mantine components accessible?](https://help.mantine.dev/q/are-mantine-components-accessible)

## Baseline

Taken on 24 September 2026 against `main` at the merge of #1051, with
axe-core 4.13, the phase 1 tags and `target-size` enabled. 297 of 656
stories fail in light mode and 190 in dark. `target-size` found nothing:
Mantine's 28px `ActionIcon` and the app's 42px `IconButton` already clear
24px.

By rule, light then dark, as nodes (failing elements):

- **`color-contrast`** — 809 light, 327 dark, across 112 story files.
  Almost all of it comes from a few colour tokens rather than from
  individual components:
  - `#868e96` (Mantine `gray.6`, the `dimmed` text colour and the input
    description override in `dark-overrides.css`) on white: 525 nodes,
    3.32:1. `gray.5` `#adb5bd` adds nine more at 2.07:1.
  - White text on the status fills in `statusColourValues`: `success`
    teal 2.55:1 (101), `warning` cyan 2.78:1 (72), `alert` red 3.28:1
    (13), `info` blue 3.55:1 (11), `outstanding` pink 3.73:1 (2). The
    same fills used as text colours in `DataTableWithResults` fail on
    white too.
  - Dark mode's `dimmed` colour, `--mantine-color-dark-2` set to
    `#0a2f56`, on the navy card and body backgrounds: 48 nodes at 1.17
    to 1.29:1, which is effectively invisible.
  - Dark mode navy links and accents, `primary.4` `#245d8f` on
    `#042340` or `#001a36`: 27 nodes at 2.3 to 2.5:1.
  - `--error-color` `#f55142` on the dark input background `#0a2f56`:
    13 nodes at 3.95:1, and `#c9d1d9` on the `#245d8f` chat bubble at
    4.47:1.
  - Reference stories: `Colours.stories.tsx` renders its swatch hex
    codes in the swatch colour (67 nodes) and `VariantRow` labels use
    `dimmed`.
- **`aria-progressbar-name`** — 51 nodes in both schemes, all teaching:
  `ModuleMediaCard`, `TeachingProgressBar`, `QuestionView`,
  `TeachingLearningNav` and the complete-page stories render a Mantine
  `Progress` with no accessible name.
- **`aria-allowed-attr`** — 23 nodes in both schemes: `FilterSelect`,
  used by `TableControls`, `DataTableControlled` and `AllDelegates`,
  carries `aria-expanded` on an element whose role does not allow it.
- **`scrollable-region-focusable`** — 5 nodes in both schemes: the
  message thread in `Messaging`, and the `main` of the complete-layout
  long-read stories, scroll but cannot be reached by keyboard.
- **`image-alt`** — 4 nodes in both schemes, `ProfilePic` with a real
  picture renders an `img` with no `alt`.
- **`button-name`** — 1 node in both schemes, the clear button on a
  clearable `DateField`.
