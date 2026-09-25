# Accessibility

Quill aims to meet WCAG 2.2 at level AA. This page says what has been built
and checked towards that, and what has not. It is written to be true on the
day it was last changed, so it claims only what the code, the tests or the
[testing log](accessibility/testing-log.md) show. The work is tracked in the
[accessibility plan](../plans/2026-09-20-accessibility-plan.md).

## Design foundations

- **Typeface** — Atkinson Hyperlegible Next, designed by the Braille
  Institute for low-vision readers, with letters that are hard to confuse
  (`I`, `l` and `1`; `O` and `0`).
- **Text size** — body text is fixed at 19px on every screen, the size the
  NHS and GOV.UK design systems use. It does not shrink on small screens.
- **Contrast** — every text colour in the theme meets WCAG AA, 4.5:1, on
  the surfaces it is used on, in both light and dark mode. The unit tests
  in `frontend/src/theme.test.ts` fail if a colour change breaks that. The
  colours are listed on the [design system](design-system/index.md) page.
- **Colour is never the only signal** — status colours were chosen so that
  people with red-green colour blindness can tell them apart, and every
  status also carries an icon or text.
- **Dark mode** — a full dark theme, checked for contrast as strictly as
  the light one.
- **Reduced motion** — animations stop when the operating system asks for
  reduced motion.
- **Structure** — each page has one level 1 heading and a `main` landmark,
  and the document declares `lang="en"`.
- **Keyboard** — every page in a layout starts with a "Skip to main
  content" link, and focus is visible when it arrives by keyboard. The
  navigation and the login form have been walked from the keyboard alone
  in automated tests; the rest of the interface is built from Mantine
  components designed for keyboard use, which people have not yet
  checked page by page.
- **Status messages** — loading, search results and form outcomes are
  announced to screen readers through live regions, without moving focus.
- **Sessions** — the sign-in session renews itself silently for seven
  days, so nobody is timed out part-way through a task.

## What is checked automatically

These run in continuous integration and block a change from merging.

- **Every component story in Storybook** is checked by
  [axe-core](https://github.com/dequelabs/axe-core) against WCAG 2.0, 2.1
  and 2.2 A and AA, in light and in dark mode. See the
  [Storybook page](storybook/index.md#accessibility-testing) for how the
  checks run and how to read a failure.
- **Whole pages** are scanned by axe in the end-to-end tests, in both
  colour schemes: the login page, the teaching dashboard and the settings
  pages.
- **Keyboard-only journeys** in the end-to-end tests log in with
  two-factor authentication, use the skip link and reach Settings
  through the navigation, using only the keyboard.
- **Lint rules** (`eslint-plugin-jsx-a11y`) catch missing alt text,
  unlabelled controls and click handlers on elements a keyboard cannot
  reach, before code is committed. Icon-only buttons and images cannot
  be written without an accessible name.

Automated checks find roughly half of accessibility problems. They cannot
tell whether alt text is meaningful, whether a screen reader's
announcements make sense, or whether a journey can actually be completed.

## What has been tested by people

Nothing yet. Four journeys are scripted for testing with screen readers,
the keyboard and zoom ([test journeys](accessibility/journeys.md)): logging
in, finding a patient, completing a teaching lecture, and signing off a
passport competency. None has been run with a screen reader so far; the
[testing log](accessibility/testing-log.md) lists each run as it happens,
and the ones not yet done.

## Known gaps

- No screen reader, zoom or magnifier testing has been done yet.
- On a page with nothing focusable, Safari cannot scroll the content from
  the keyboard until the skip link has been used. Chrome and Firefox can.
- No accessibility statement has been published yet. It will be, at
  `/accessibility` on the public site, in the format the Public Sector
  Bodies Accessibility Regulations 2018 set out, and will say "partially
  compliant" until the testing above is done.

## Reporting a problem

Use **Feedback** in the side navigation to report an accessibility
problem. A dedicated contact for people who cannot log in will be given
in the accessibility statement.
