# Touch target sizes plan

Many of Quill's controls are too small to tap reliably on a small phone.
They meet WCAG 2.2's level AA minimum of 24px, but not the 44px of success
criterion 2.5.5 (level AAA), which the NHS digital service manual and
Apple's guidance both ask for. The worst are about 28px: every close ✕, the
ellipsis "…" menu on table rows, and the `xs` buttons in tables and
messages. A clinician using a phone at the bedside hits the wrong control,
or has to tap twice. In clinical software, either one is a safety problem.

The goal is a tap area of at least 44px on phones. Desktop stays as it
is. Where a control is a Mantine component, the size is set once for the
whole app, in the theme or in `frontend/src/styles/touch-targets.css`, not
at every place it is used. So future uses get it without anyone having to
remember.

## Phase 1: Switches, buttons, icon buttons and the navigation drawer

- [x] **`SolidSwitch` defaults to `xl` on phones, with a 44px tap area**, in
      `frontend/src/components/form/SolidSwitch.tsx` (#1213, merged). The
      `xl` track is 36px tall. Padding of 4px above and below on the
      switch's `<label>` body makes the tap area 44px without drawing a
      bigger switch. `xl` was chosen over `lg` (30px) because it needs the
      least invisible padding, so what you see is what you tap. Above the
      `sm` breakpoint the default stays `md`, and a `size` passed in still
      wins.

- [x] **`md` buttons are 48px tall on phones**, in
      `frontend/src/styles/touch-targets.css` (#1214). The file resets
      `--button-height-md` on `.mantine-Button-root` below 40em. Mantine
      sets its size variables on the button class, not on `:root`, so the
      override has to target the button class too. It wins by loading after
      Mantine's stylesheet. Only the height changes, so the label, side
      padding and width stay the same. It is loaded from both `main.tsx`
      and `.storybook/preview.tsx`.

- [x] **`IconButton` is 48px with a 32px icon on phones**, in
      `frontend/src/components/button/IconButton.tsx` (#1215). `Icon`
      shrinks every size on phones, and its `md` icon becomes 20px, which
      looked lost in a bigger button. So `IconButton` asks for `lg` on
      phones, which is 32px there. That gives the same ratio of icon to
      button as the desktop 28px icon in a 42px button. The media query
      uses `getInitialValueInEffect: false`, as `Icon` does, so the first
      render is already the right size.

- [x] **Links in the navigation drawer are at least 48px tall**, in
      `frontend/src/components/drawers/NavigationDrawer.module.css`.
      Mantine's `NavLink` is about 38px (8px padding around a 22px icon),
      and the links sit flush with no gap. The rule applies inside the
      drawer rather than at a screen width, because tablets below 992px use
      the drawer too, and the desktop side navigation keeps its compact
      rows. It uses `min-height` rather than padding, so a label that
      wraps grows from 48px instead of stacking extra padding on top. It
      covers both `MainLayout` and `TeachingLayout`, and the drawer already
      scrolls when the list gets long.

## Phase 2: Every close button, once

- [x] **Make Mantine's `CloseButton` 44px on phones**, in
      `touch-targets.css`. `CloseButton` defaults to `md`, which is 28px.
      Mantine uses it inside `Modal` (6 modals, with `closeButtonProps`
      already set in `frontend/src/theme.ts:468`), `Drawer` and
      `Notification`. It is also used directly as the dismiss ✕ in
      `frontend/src/components/form/Form/FormStatus.tsx:163`. One rule on
      `.mantine-CloseButton-root` below 40em sets `--cb-size-md` to 44px,
      the same way the `md` button rule works. Only `md` is overridden: the
      clear ✕ inside a select or other input is Mantine's `sm` close button,
      and it has to fit the input's right section. The ✕ itself goes from
      20px to 24px by setting `--cb-icon-size`. Mantine's default is 70% of
      the button, which at 44px would be a heavy 31px. A test in
      `frontend/src/styles/touch-targets.test.tsx` checks that the modal
      close and the `FormStatus` dismiss still carry the class the rule
      selects, since jsdom cannot apply the media query itself.

- [ ] **Check the modal header on a phone**, left for the reviewer: it
      needs eyes on a narrow Storybook window, which an unattended run
      cannot give. A 44px close button makes the header taller than the
      title. Check that it does not push the title
      onto two lines on a 320px-wide screen.

## Phase 3: Inputs 44px tall on phones, and the controls inside them

- [x] **Make `md` text inputs 44px tall on phones**, in `touch-targets.css`,
      by setting `--input-height-md` on `.mantine-Input-wrapper` below 40em.
      Inputs are tap targets too, at 42px today, just short of the target.
      Doing this first matters: Mantine sets the width of an input's right
      section from the input's height, 2px narrower. The same rule sets
      `--input-right-section-width` to the full input height, so the right
      section becomes a 44px square and the two controls in the next steps
      have room to fill it. Every field component in
      `frontend/src/components/form/` uses `size="md"`, so they all change
      together.

- [x] **The close-search ✕ fills the right section of the search input**,
      in `frontend/src/components/search/SearchFields.tsx:86`. It was a raw
      `ActionIcon` at the default 28px with a 16px icon. `IconButton` did
      not fit, because its fixed 42px and 48px sizes do not match the
      section, so it stays an `ActionIcon` with a class in the new
      `SearchFields.module.css` that makes it fill the section on phones.
      The inline `height: 42` on the input root is removed, so the input
      can reach 44px.

- [x] **The password show/hide eye fills its right section**, by setting
      `--psi-button-size` on `.mantine-PasswordInput-visibilityToggle` in
      `touch-targets.css`. Mantine sized it at 28px for an `md` input. The
      variable is set on the button itself rather than on the input root,
      because Mantine writes the root's value in an inline style. The eye
      icon stays 22px. Tests in `frontend/src/styles/touch-targets.test.tsx`
      check that a `TextField` wrapper and the password toggle still carry
      the classes these rules select.

## Phase 4: The ribbon and page-header icon buttons

- [x] **Search, filter and hamburger are 44px on phones**, in
      `frontend/src/components/button/SearchButton.tsx`,
      `frontend/src/components/form/FilterSelect.tsx` and
      `frontend/src/components/button/BurgerButton.tsx`. All three were
      `ActionIcon size="lg"`, which is 34px, with fixed 30 to 32px icons
      drawn directly rather than through `Icon`. So the icons do not shrink
      on phones and are already big enough; only the button grows, to 44px
      below `theme.breakpoints.sm`. They use `useMediaQuery` with
      `getInitialValueInEffect: false`, as `IconButton` does, so the first
      render is already the right size. The ribbon already leaves room: its
      avatar placeholder is 48px, and the search button is hidden on narrow
      screens anyway. `FilterSelect`'s count badge is positioned from the
      right edge of its wrapper, so it moves out with the bigger button.

- [x] **The inbox envelope is 44px on phones**, already done by #1212
      ("Navigation: inbox button full size on phones") in another worktree.
      That kept `Icon`'s `mlg` step at 36px on phones instead of shrinking
      it to 28px, and with `InboxButton`'s 4px of padding that makes 44px.
      Nothing more to do here.

## Phase 5: The ellipsis menu on table rows

- [x] **`EllipsisMenu` is 44px with an `md` icon on phones**, in
      `frontend/src/components/ellipsis-menu/EllipsisMenu.tsx`. It was 30px
      with an `sm` icon, which drops to 16px on a phone. It is on every row
      of the tables that use it (4 places), so it is tapped often and sits
      close to other things. Desktop stays 30px with its 20px icon, because
      a 44px trigger would make every table row taller. On a phone the
      icon is `md`, which `Icon` draws at 20px there, so the three dots
      look the same size as on desktop. The `Menu.Item`s in the dropdown
      were about 36px, and a `touchItem` class in `EllipsisMenu.module.css`
      gives them a 44px `min-height` on phones.

## Phase 6: Compact buttons and the video quality toggle

- [x] **`xs` and `sm` buttons are 44px tall on phones**, in
      `touch-targets.css`, by setting `--button-height-xs` and
      `--button-height-sm` next to the `md` rule. They are used for the
      action buttons on messages (`frontend/src/components/messaging/Messaging.tsx:252`
      and `:346`) and the Deactivate and Activate buttons in the patient
      admin tables (`DeactivatePatientPage.tsx:246`,
      `ActivatePatientPage.tsx:263`). They keep their smaller text and
      padding, and stay 4px shorter than the 48px `md` button, so they
      still read as secondary. One rule also covers any compact button
      added later. The `compact-*` sizes are not covered, because nothing
      uses them.

- [x] **The video quality toggle is 44px tall on phones**, in
      `frontend/src/components/teaching/video-player/VideoPlayer.tsx:196`.
      It is a `SegmentedControl` set to `xs`, about 30px. A `qualityLabel`
      class on its labels gives them a 44px `min-height` below 40em in
      `VideoPlayer.module.css`, rather than changing `size`, so the text
      stays small under the video. Mantine measures the labels to place
      the sliding indicator, so the indicator grows with them.

## Phase 7: Table pagination

- [x] **Pagination arrows are 44px on phones**, in
      `frontend/src/components/tables/TablePagination.module.css`. The
      arrows used Mantine's default 32px control with a 30px icon forced by
      `.arrow svg`. `--pagination-control-size` is set on `.arrow` itself
      below 40em, because Mantine writes the pagination root's value in an
      inline style. The icons stay 30px.

- [x] **The page-size picker is at least 44px tall on phones**, in the
      `.pageSizeButton` rule in the same CSS module. It had only
      `0.25rem 0.5rem` of padding around the text.

## Phase 8: The rest, found by reading the code

These were first listed as "check on a real phone". Reading the components
answered each one, so they are done here rather than left for a device.

- [x] **Checkboxes**, in `frontend/src/components/form/CheckboxField.tsx`.
      Mantine makes the label tappable, but the label is only one line of
      text, about 22px, so the row was not 44px after all. On phones the
      label gets 11px of padding above and below, which makes it at least
      44px, and the box moves down by the same 11px so it stays level with
      the first line of a long declaration. `NewPatientPage.tsx:196` uses
      a raw Mantine `Checkbox` rather than `CheckboxField`, so it does not
      get this.

- [x] **Radios**, in `frontend/src/components/form/RadioField.tsx`. Each
      option was already drawn in a 44px row, but the padding was on a
      `div` around the radio, which cannot be tapped, so only the 22px line
      of text worked. On phones the padding moves from the `div` into the
      label, in the same way as the checkboxes.

- [x] **The clear ✕ on a clearable select**, `AllResults.tsx:129`: left as
      it is. It is not a `CloseButton` but Mantine's `InputClearButton`,
      which shares the input's right section with the chevron, so a 44px ✕
      would not fit beside it. Mantine also hides it from screen readers
      and the keyboard. There is another way to clear the filter anyway:
      Mantine's `Select` deselects when the chosen option is tapped again,
      and those options are full-width rows. (The Phase 2 pull request,
      #1222, said this ✕ was an `sm` close button. That was wrong, and the
      comment in `touch-targets.css` is corrected here.)

- [x] **Text links on their own line**, through a new `standalone` prop on
      `frontend/src/components/typography/TextLink.tsx`. On phones a
      standalone link is at least 44px tall. WCAG 2.5.8 exempts links
      inside a sentence, and they keep their line height, so the prop is
      opt-in. It is set on the eight links that stand alone: "Forgot
      password?" and "Register" on the login form, "Back to sign in" on the
      forgot and reset password forms, the two links on the verify email
      page, "Back to login" on the verify email pending page, "Back to
      patient list", and "Your previous feedback" in the feedback modal.
      The "Your feedback" link inside the sentence after sending feedback
      stays inline.

## Phase 9: Accessibility journeys

- [x] **Record which journeys this touches**, in
      `docs/docs/frontend/accessibility/testing-log.md`. Phases 1 and 4
      change the navigation drawer and the top ribbon, which every journey
      goes through, and Phase 3 changes every form field, including the
      login form. So journeys 1 to 4 are all affected. They were already on
      the "Not yet run" list for VoiceOver and TalkBack, and a new line
      there asks for those runs to be done on a phone too, checking the
      44px minimum.

## Decisions

- **44px from Phase 2 onwards** — 44px is the WCAG AAA and NHS figure,
  and it is enough. The work in Phase 1 went to 48px, following Material's
  guidance, before this was settled. It has shipped and stays as it is:
  48px is above the floor, so lowering it would only be for consistency.

- **Phones only, except the drawer** — desktop is used with a mouse, where
  the current sizes are fine and denser tables are worth having. The
  drawer is the exception because tablets use it.

- **Global rules over per-component props, where Mantine allows it** —
  buttons, close buttons and inputs are set once in `touch-targets.css`,
  so every current and future use gets the size. Components that draw
  their own icon buttons (search, filter, burger, ellipsis, inbox) are
  changed in the component, because their sizes are hard-coded there.

- **No unit tests for the CSS-only rules** — the test environment cannot
  apply media queries or measure layout, so a test would only check that a
  class name exists. Storybook, with the window narrowed below 640px, is
  the check for those. Components that choose a size in React (switch,
  icon button, and those in Phase 4 and 5) do get tests.
