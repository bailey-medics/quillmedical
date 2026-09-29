# Accessibility testing log

One entry per test run, newest first: the date, the tool and browser,
which [journey](journeys.md), and what was found. This log is the
evidence the NHS DTAC's accessibility section (D1) asks for, and the
"how we tested" part of the accessibility statement cites it.

- Record a failure even when it is fixed the same day, with the fix.
- Record a journey as untested, with the reason, rather than leaving it
  out.
- People with access needs who test the service are recorded by the
  access need, never by name, with their consent noted.

## Entry format

- **Date** – the day of the run.
- **Tester** – who ran it, or "automated".
- **Tool** – screen reader, keyboard only, zoom level or test suite.
- **Browser and device**
- **Journey** – which of the four, or a named page.
- **Result** – pass, fail or partial, per step where it is not a pass.
- **Findings** – what failed, and the pull request that fixed it.

## Runs

### 24 September 2026 – automated keyboard journeys

- **Tester** – automated, `frontend/e2e/tests/keyboard.spec.ts`
- **Tool** – Playwright, keyboard only (Tab, typing, Enter)
- **Browser and device** – Chromium, desktop, 1280 × 720
- **Journey** – 1 (log in with two-factor authentication), and reaching
  Settings through the side navigation
- **Result** – pass, after the fixes below
- **Findings** – the side navigation was not reachable from the keyboard
  at all; the closed navigation drawer left invisible tab stops and a
  modal dialog in the page; the authenticator code field appeared
  without focus. All fixed in #1091.

### 24 September 2026 – automated focus walk

- **Tester** – automated, a Playwright script over the layout stories
- **Tool** – keyboard only, sixty Tab presses per story
- **Browser and device** – Chromium, desktop 1280px and mobile 390px
- **Journey** – every layout and teaching-layout story
- **Result** – pass: no focused element hidden behind the sticky ribbon
  (WCAG 2.4.11)
- **Findings** – twenty-five routes had no level 1 heading. Fixed in
  #1087.

### Not yet run

- **Journeys 1 to 4 with VoiceOver** – Safari on macOS, and on iOS.
- **Journeys 1 to 4 with NVDA** – Firefox on Windows.
- **Journeys 1 to 4 with TalkBack** – Chrome on Android.
- **Journeys 1 to 4 at 200% and 400% zoom.**
- **Journey 3 with people with access needs** – a screen reader user and
  someone with a motor impairment or cognitive difference.
- **JAWS and Dragon** – deferred to a commissioned audit.
- **Journeys 1 to 4 on a phone, by touch** – the
  [touch target sizes plan](../../plans/2026-09-28-touch-target-sizes-plan.md)
  enlarged the navigation drawer, the top ribbon's buttons and every form
  field below 640px, which all four journeys pass through. The VoiceOver
  and TalkBack runs above should be done on a phone as well as a desktop,
  so that they cover these sizes, and checked for the 44px minimum of
  WCAG 2.5.5.
