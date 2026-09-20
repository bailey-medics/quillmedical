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
173 stories on every non-draft pull request. Test-runner 0.24 on Storybook
10 runs `addon-a11y` checks out of the box once the addon is registered;
no `test-runner.ts` hooks are needed.

- [ ] Register `@storybook/addon-a11y` in the `addons` array in
      `frontend/.storybook/main.ts`
- [ ] Add `parameters.a11y` to `frontend/.storybook/preview.tsx`:
      `test: "todo"` for the first run, `options.runOnly` set to
      `["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]`, and
      `config.rules` enabling `target-size` (axe ships it disabled)
- [ ] Run `just sbtci` locally and record the baseline: violations by rule
      id and by component, in a `## Baseline` bullet list at the foot of
      this plan
- [ ] Fix the baseline component by component, the highest-count rule
      first. Each fix is a normal PR with a story change and a unit test
      where the fix is behaviour rather than markup
- [ ] Switch `test: "todo"` to `test: "error"` once the baseline is clear,
      so violations fail the heavy tier
- [ ] Run the checks in dark mode as well as light: either a second
      `colorScheme` pass in the test-runner or a `Dark` story variant on
      every component with a coloured surface. Contrast failures in dark
      mode will not show in light
- [ ] Add a `docs/docs/frontend/accessibility/` section to the Storybook
      docs page describing how to read an axe failure in the a11y panel and
      where per-story rule overrides belong (`parameters.a11y.config.rules`,
      never a global disable)

## Phase 2: Lint at the keyboard

The pre-commit hook already runs ESLint on staged files. Adding
`eslint-plugin-jsx-a11y` catches the static half of the problems before
they reach a story: an `ActionIcon` without a label, an `img` without alt, a
click handler on a `div`, a positive `tabIndex`.

- [ ] Add `eslint-plugin-jsx-a11y` and extend
      `jsxA11y.flatConfigs.recommended` in `frontend/eslint.config.js`
- [ ] Run `yarn eslint` across `src/` and fix what it finds; the rough
      counts are nine `Image`/`img` uses without `alt` and seven
      `ActionIcon` uses without `aria-label`
- [ ] Make `alt` a required prop on `components/images/Image.tsx` and
      `aria-label` a required prop on `components/button/IconButton.tsx`,
      so the type checker enforces what the linter only warns about
- [ ] Add a `no-restricted-imports` pattern steering `ActionIcon` imports
      from `@mantine/core` towards `IconButton`, matching the existing
      `MantineProvider` restriction

## Phase 3: Fix the known gaps

Things the survey found that no tool will fix on its own.

- [ ] Set `focusRing: "auto"` and `respectReducedMotion: true` explicitly in
      `frontend/src/theme.ts`. Mantine defaults `focusRing` to `auto`
      already; `respectReducedMotion` defaults to `false`, which means the
      `prefers-reduced-motion` claim in the current docs page is untrue
- [ ] Add a skip link ("Skip to main content") as the first focusable
      element in `MainLayout`, `TeachingLayout` and `PublicLayout`,
      targeting the existing `main` landmark. Build it as a component in
      `components/navigation/` with a story and a test
- [ ] Walk every page with Tab and Shift+Tab and confirm no focused element
      disappears under the sticky ribbon (2.4.11). Fix with
      `scroll-padding-top` on the scroll container where it does
- [ ] Audit heading order: one `h1` per page, no skipped levels. There is
      one `order={1}` use and three `Title`s without an `order` in the
      frontend; pages composed from `BaseCard` headings are the likely
      offenders
- [ ] Loading and result states announce themselves: the eight existing
      `aria-live` and `role="status"` uses should cover the table
      skeletons, form submission, search results and the notification
      system. List the components that lack one and add it
- [ ] Target size sweep (2.5.8): table row actions, pagination controls,
      `SortHeader`, `CompetencyRow` buttons. Anything under 24px gets a
      larger hit area or spacing, not a bigger icon
- [ ] Redundant entry check (3.3.7): confirm the multi-step form and
      registration carry earlier answers forward and that nothing asks for
      an email or name twice
- [ ] Session timeout: the access cookie lives fifteen minutes and refresh
      is silent, so there is no timeout prompt and 2.2.1 Timing Adjustable
      passes by design. Note this in the conformance record rather than
      building the warning the docs page currently promises

## Phase 4: Scan whole pages in the end-to-end suite

Components can each pass and still compose into a page with two `h1`s, a
missing landmark, or a focus order that jumps. `just e2e` already brings up
the CI stack and drives real pages; an axe scan per journey is a few lines
on top.

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
- [ ] Add a keyboard-only journey test for the two highest-risk flows:
      login with 2FA, and opening a teaching lecture from the list. These
      use Playwright's `keyboard.press("Tab")` and assert on
      `document.activeElement`, not on axe

## Phase 5: Test with people and assistive technology

Automation is done at this point and everything after it is judgement.
GOV.UK's matrix for public beta is JAWS, NVDA, VoiceOver on iOS, TalkBack,
a screen magnifier and Dragon. For one developer on a Mac the realistic
first pass is below; JAWS and Dragon are licensed and can wait for a
commissioned audit.

- [ ] Write four journey scripts in
      `docs/docs/frontend/accessibility/journeys.md`: log in with 2FA,
      find and open a patient, open and complete a teaching lecture, sign
      off a passport competency. Each is a numbered list of steps with the
      expected announcement or focus position at each
- [ ] Run each journey with VoiceOver and Safari on macOS, and with
      VoiceOver on iOS. Record pass, fail or partial per step
- [ ] Run each journey with NVDA and Firefox in a Windows virtual machine
- [ ] Run each journey at 200% browser zoom and at 400% (WCAG 1.4.10
      Reflow requires no horizontal scroll at 320px equivalent)
- [ ] Run each journey with TalkBack on Android if a device is available;
      otherwise record it as untested in the statement
- [ ] Keep the results in
      `docs/docs/frontend/accessibility/testing-log.md`, one entry per run
      with date, tool, browser, journey and findings. This log is the
      evidence DTAC D1 asks for and the "preparation" section of the
      statement cites
- [ ] Recruit at least two people with access needs (a screen reader user
      and someone with a motor impairment or cognitive difference) to walk
      the teaching journey before the passport launches. Sole-developer
      note: an hour each over video is enough; record consent and findings
      in the log, no names

## Phase 6: Statement and evidence pack

The accessibility statement has a legally mandated structure. It is
published on the public site, not inside the app, because it must be
readable by someone who cannot yet log in.

- [ ] Replace `docs/docs/frontend/accessibility.md` with a page that says
      only what is true: the design foundations, the checks that run in
      CI, the testing log, and the statement's location. Remove the ADA,
      Section 508, text size, density, phone line, timeout warning and
      mailbox claims
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
- [ ] Choose the feedback route the statement names. A monitored email
      address is the minimum; it must actually be read
- [ ] Build the DTAC D1 evidence pack in
      `docs/docs/frontend/accessibility/dtac-d1.md`: the user journey map
      (the four journeys from phase 5 with the roles that walk them), the
      WCAG 2.2 AA conformance record listing every A and AA criterion with
      pass, fail, not applicable, and how it was tested (use the NHS
      accessibility checklist's criterion list as the skeleton), and the
      testing log
- [ ] Write the Accessible Information Standard note the revised DTAC
      requires: what Quill will record (the four AIS data subsets as
      SNOMED CT codes on the FHIR `Patient`), how a recorded need will be
      flagged in the patient banner, and that it is designed but not built
      because there are no live patient records. Add the data model work
      as a checklist item in the clinical launch plan rather than here
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

- **Components first, pages second** — 173 stories cover 53 components,
  and pages are composed from them. Fixing a component fixes every page
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
