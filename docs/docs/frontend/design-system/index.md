# Design system

Quill's design system provides a consistent visual language across the application. It is built on [Mantine 8](https://mantine.dev/) and documented in Storybook under the **Foundations/** category.

## Typography

### Font: Atkinson Hyperlegible Next

The app uses [Atkinson Hyperlegible Next](https://brailleinstitute.org/freefont) (variable weight) from the Braille Institute. It was chosen for:

- **Accessibility** — designed specifically for low-vision readers with exaggerated character differentiation (e.g. distinct `I`, `l`, `1`; open `a`, `g`, `0`)
- **Healthcare suitability** — clinical environments require fast, accurate reading of names, dosages, and identifiers where character confusion can cause harm
- **Variable weight** — single file supports all weights (400–700), reducing load times
- **Free and open** — SIL Open Font Licence, no restrictions on use

### Text colour

Body text uses `#143f6b` (primary shade 5) instead of pure black. This reduces harsh contrast against white backgrounds, improving readability for extended use while maintaining a strong AA contrast ratio (~10:1).

The colour is set via both `theme.black` and `--mantine-color-text` in the CSS variables resolver to ensure all Mantine components inherit it.

## Brand colours

| Token     | Hex                   | Usage                                       |
| --------- | --------------------- | ------------------------------------------- |
| Primary   | `#001a36` (deep navy) | Navigation, primary actions, brand identity |
| Secondary | `#C8963E` (amber)     | Secondary buttons, accents, highlights      |

The primary colour was extracted from the Quill logo. The secondary amber complements the navy and provides warmth for CTAs and highlights.

### Logo font: El Messiri

The "Quill Medical" logo text uses [El Messiri](https://fonts.google.com/specimen/El+Messiri) and is rendered as a PNG image — the font is not loaded at runtime. El Messiri was chosen for its elegant, slightly calligraphic character that complements the clinical identity.

### Primary scale (navy)

A 10-shade ramp derived from the brand navy, with cooler blue tones in the lighter shades (0–3) to avoid a lavender/pink cast that can appear against white backgrounds — particularly noticeable for users with colour vision deficiency.

- `primaryShade: 5` — used for filled buttons and interactive elements (lighter than the brand colour for better visual weight on screen)
- Shades 7–9 are reserved for hover states and the darkest brand applications
- Shades 0–1 are the dark-mode text accents: `primary.1` is the dark-mode muted text and link colour, `primary.0` the dark-mode link hover
- `primaryShade: 5` also applies to every Mantine named colour, so `color="red"` gives `red.5`, which fails contrast with white text. Use the status tokens instead

### Secondary scale (amber)

A 10-shade ramp derived from `#C8963E`. Used for accent elements, highlights, and the public site.

- `primaryShade: 5` — brand amber for badges and decorative uses

## Cards (BaseCard)

All cards use the `BaseCard` component (never Mantine's `Card` directly). The current styling:

- `shadow="sm"` — subtle elevation
- `radius="md"` — rounded corners
- `withBorder` with `borderColor: gray.2` — very faint border for edge definition without looking heavy
- No background tint — clean white

This follows the modern pattern used by Notion, Linear, and NHS App: faint border plus light shadow for definition without visual weight.

## Buttons

- Default variant: `"filled"` (navy background, white text)
- Buttons use `primaryShade: 5` (`#143f6b`) globally, lighter than the darkest navy for better readability against white text
- ActionCardButton defaults to filled, full-width

## Navigation icons

- Nav icons render as plain Tabler icons without circular backgrounds
- Inherit the default text colour from the nav context
- Burger button matches the public site style (amber icon, navy hover background)

## Status colours

Status colours communicate state in badges, alerts, and form validation. Colours were chosen for colour-blind accessibility, avoiding red/green pairs that are indistinguishable to users with protanopia or deuteranopia, and every status also carries an icon so colour is never the only signal.

Each status has two colours, because a fill and a word need different shades:

- **Fill (`bg`, `--<status>-color`)** — a background with white text on it, the same in both colour schemes. Every fill that takes white text is dark enough for WCAG AA (4.5:1).
- **Word (`fg`, `--<status>-text-color`)** — the status written as text with no fill behind it, such as "Fail" in a results table. It changes with the colour scheme: a darker shade in light mode, which also passes on `gray.2`, and Mantine's shade 3 in dark mode, which passes on every navy surface. Never use a fill colour for text.

The tokens, fill first and then the light and dark word colours:

- **success** — teal. Fill `teal.9` `#087f5b`; word `#07704f` / `teal.3`. Active, completed, final, pass
- **warning** — cyan. Fill `cyan.9` `#0b7285`; word `#0b6b7a` / `cyan.3`. Draft, pending
- **outstanding** — pink. Fill `pink.7` `#d6336c`; word `pink.9` / `pink.3`. Deactivated, cancelled
- **info** — blue. Fill `blue.8` `#1971c2`; word `blue.9` / `blue.3`. Upcoming, amended, admin, unread
- **neutral** — yellow. Fill `yellow.4` `#ffd43b` with near-black text (`--status-text-dark`); word is body text. Staff, default
- **accent** — violet. Fill `violet.6` `#7950f2`; word `violet.8` / `violet.3`. Incomplete, special states
- **alert** — red. Fill `red.9` `#c92a2a`; word `#b02525` / `red.3`. No-show, patient, fail, attention
- **update** — pale blue. Fill `blue.0` `#e7f5ff` with near-black text; word is body text. Nothing recorded yet, gentle prompts

The values live in `statusColourValues` and `statusTextColourValues` in `theme.ts`; components read them through `statusColours` in `semanticColours.ts`.

## Grey scale

The app uses Mantine's default grey scale, shades 0–7, exported as `greyScale` from `theme.ts` alongside the brand colour scales.

- **0 `#f8f9fa`** — table striped rows, subtle fills
- **1 `#f1f3f5`** — light dividers, card backgrounds
- **2 `#e9ecef`** — borders, separators, BaseCard border
- **3 `#dee2e6`** — disabled backgrounds
- **4 `#ced4da`** — input placeholder text (`--mantine-color-placeholder`), borders
- **5 `#adb5bd`** — icons and borders only
- **6 `#868e96`** — icons and graphics only
- **7 `#495057`** — muted text, the light-mode `dimmed` colour

**Only grey 7 is for text.** Greys 4–6 fall below the WCAG AA 4.5:1 minimum for text on white (grey 6 is 3.3:1), so they are for icons, borders and placeholders, where WCAG 1.4.11 asks 3:1 or nothing.

## Text colours

Every text colour meets WCAG AA (4.5:1) on the surfaces it is used on, in both colour schemes; `theme.test.ts` checks each one. The tokens are listed in `textColours` in `semanticColours.ts` and shown in **Foundations/Colours**.

- **default** — inherits. Headings (`Heading`, `PageHeader`)
- **body** — `var(--mantine-color-text)`, navy `#143f6b` in light and `#c9d1d9` in dark. Body text (`BodyText`, `BodyTextBold`, `BodyTextInline`, `BodyTextClamp`)
- **muted** — `c="dimmed"` / `var(--mantine-color-dimmed)`: `gray.7` in light, `primary.1` in dark. `FieldDescription`, input descriptions, `EmptyState`, the messages in `ErrorState` and `NotFoundLayout`
- **link** — `var(--link-color)`: `primary.4` in light, `primary.1` in dark, hovering to `primary.8` and `primary.0`. `TextLink` and inline links
- **error** — `var(--error-color)`: orange-red `#c4320a` in light, `#ff8a65` in dark. `ErrorMessage`, input error text and error borders

Input placeholders use `--mantine-color-placeholder`, `gray.4`. It is not a text colour for content and is not in `textColours`: at 1.5:1 on white it would fail the Storybook accessibility check anywhere it carried real text.

> **Accessibility note:** Error text is an orange-red with an alert circle icon rather than red, giving a distinct signal for users with red-green colour vision deficiency. The icon ensures error state is communicated by shape as well as colour.

## Typography components

All typography is wrapped in purpose-built components in `components/typography/`; raw Mantine `Text` or `Title` should not be used directly.

- **PageHeader** — `Title` h1, body text colour, responsive size (1.875rem mobile → 2.5rem desktop)
- **Heading** — `Title` h2, inherits colour, bold
- **BodyText**, **BodyTextInline**, **BodyTextClamp** — `Text`, `md` (19px), body colour, weight 500
- **BodyTextBold** — as BodyText, weight 700
- **FieldDescription** — `Text`, `md`, muted (`dimmed`), weight 500
- **EmptyState** — `Text`, `md`, muted (`dimmed`). It was `gray.4` (1.5:1 on white), which is too faint for content a reader needs
- **ErrorMessage** — `Text`, `md`, `--error-color`, bold, with an `IconAlertCircle` icon for colour-blind accessibility
- **TextLink** — `Anchor` with a permanent underline, `--link-color`, hovering to `--link-hover-color`
- **MarkdownView** — rendered HTML styled to match BodyText; its links use the `info` word colour (`--info-text-color`)
- **PublicBodyText**, **PublicTitle** — for the public site, on the navy background

## Semantic colour tokens

All colour values live in two files:

- `frontend/src/styles/semanticColours.ts` — exports `brand`, `statusColours`, and `textColours` for status badges, alerts, and text
- `frontend/src/components/badge/badgeColours.ts` — mirrors `semanticColours` for badge-specific use with `BadgeColourConfig` shape

Components should import from these files rather than hardcoding colour values. The badge colours file defines the same semantic tokens (`success`, `warning`, `alert`, etc.) for use with badge components.

## Storybook documentation

The **Foundations/** category in Storybook provides visual references:

- **Foundations/Colours** — brand swatches, status fills beside their word colours, text colour samples, and 10-shade colour scale ramps (primary navy, secondary amber, neutral grey). Switch the toolbar to dark to see the scheme-aware tokens change
- **Foundations/Typography** — every typography component rendered with sample text, plus the responsive font size scale

These are documentation-only stories with no associated test files.

## Pass/fail indicators

Atomic `PassIcon` and `FailIcon` components in `components/badge/` provide consistent pass/fail visual indicators:

- **PassIcon** — teal filled circle with white tick (uses `badgeColours.success`)
- **FailIcon** — red filled circle with white cross (uses `badgeColours.alert`)

Both wrap the `Icon` component with `containerVariant="filled"` and accept a `size` prop. Used in `ScoreBreakdown` and available for any pass/fail context.

## What has been done

- Created `semanticColours.ts` as the single source of truth for all design tokens
- Built Foundations/Colours and Foundations/Typography Storybook stories
- Updated ErrorText to `orange.8` with alert icon for colour-blind accessibility
- Changed success status colour from green to teal for colour-blind distinguishability
- Changed warning status colour from yellow.8 to cyan.6 for colour-blind distinguishability
- Standardised all badge components to use config record patterns with shared `BadgeColourConfig`
- Added `BadgeSkeleton` shared loading component
- Added `StateMessage` empty states to all list components
- Chose Atkinson Hyperlegible Next as the app font for accessibility
- Registered navy and amber as Mantine colour scales with `primaryShade: 6`
- Set body text to `#143f6b` (primary.6) via CSS variables resolver
- Reworked lighter primary shades (0–6) to be cooler/bluer, avoiding lavender cast
- Removed border from BaseCard, replaced with subtle `gray.2` border + shadow
- Changed ActionCardButton to filled variant by default
- Removed circular backgrounds from nav icons
- Updated burger button to match public site (amber icon)
- Made search icon in ribbon white
- Updated UnreadBadge to use primary navy
- Exported `greyScale` from `theme.ts` as part of the design system
- Overrode `--mantine-color-placeholder` to use `gray.4` from grey scale
- Updated MarkdownView CSS to match BodyText styling (size, weight, colour)
- Added `HyperlinkText` underline and primary-4/primary-8 hover colour
- Created `PlaceholderText` component using `gray.4`
- Created `BodyTextMuted` component for dimmed secondary text
- Created `PassIcon` and `FailIcon` atomic badge components
- Created `SearchButton` atomic button component
- Updated `ScoreBreakdown` to use `PassIcon`/`FailIcon` instead of inline Icon configuration
- Added Colours section to component instructions for design system compliance

- Brought every text and status colour to WCAG AA contrast in both colour schemes (accessibility plan, phase 1): muted text moved from `gray.6` to `dimmed`; status fills darkened; status word colours, link colours and a scheme-aware error colour added; every modal close button named "Close dialog"

## What is planned

- **Spacing tokens** — document any custom spacing conventions beyond Mantine's built-in props
- **Component backgrounds and borders** — expand the semantic palette to cover hover states, borders, and surface colours as patterns emerge
