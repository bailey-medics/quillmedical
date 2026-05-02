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

Body text uses `#143f6b` (primary shade 6) instead of pure black. This reduces harsh contrast against white backgrounds, improving readability for extended use while maintaining a strong AA contrast ratio (~10:1).

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

- `primaryShade: 6` — used for filled buttons and interactive elements (one shade lighter than the brand colour for better visual weight on screen)
- Shades 7–9 are reserved for text, hover states, and the darkest brand applications

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
- Buttons use `primaryShade: 6` (`#143f6b`) globally — one shade lighter than the darkest navy for better readability against white text
- ActionCardButton defaults to filled, full-width

## Navigation icons

- Nav icons render as plain Tabler icons without circular backgrounds
- Inherit the default text colour from the nav context
- Burger button matches the public site style (amber icon, navy hover background)

## Status colours

Status colours communicate state in badges, alerts, and form validation. Each token defines a background and text colour pair. Colours were chosen for colour-blind accessibility — avoiding red/green pairs that are indistinguishable to users with protanopia or deuteranopia.

| Token       | Mantine value | Usage                             |
| ----------- | ------------- | --------------------------------- |
| success     | teal          | Active, completed, final, pass    |
| warning     | cyan.6        | Draft, pending                    |
| outstanding | pink          | Deactivated, cancelled            |
| info        | blue          | Upcoming, amended, admin, unread  |
| neutral     | yellow.4      | Staff, default                    |
| accent      | violet        | Incomplete, special states        |
| alert       | red           | No-show, patient, fail, attention |

## Grey scale

The app uses Mantine's default grey scale (shades 0–4 only) for subtle backgrounds, dividers, and placeholder text. These are exported as `greyScale` from `theme.ts` alongside the brand colour scales.

| Shade | Hex       | Usage                                |
| ----- | --------- | ------------------------------------ |
| 0     | `#f8f9fa` | Table striped rows, subtle fills     |
| 1     | `#f1f3f5` | Light dividers, card backgrounds     |
| 2     | `#e9ecef` | Borders, separators, BaseCard border |
| 3     | `#dee2e6` | Disabled backgrounds                 |
| 4     | `#ced4da` | Placeholder text                     |

The global Mantine placeholder colour (`--mantine-color-placeholder`) is overridden in the theme to use `gray.4` so all input placeholders use the design system grey.

## Text colours

| Token       | Value                       | Usage                                             |
| ----------- | --------------------------- | ------------------------------------------------- |
| default     | inherits                    | Headings (HeaderText, PageHeader)                 |
| body        | `var(--mantine-color-text)` | Body text (BodyText, BodyTextClamp, BodyTextBold) |
| error       | orange.8                    | Validation and error messages (ErrorText)         |
| placeholder | gray.4                      | Empty field hints (PlaceholderText)               |

> **Accessibility note:** Error text uses `orange.8` with an alert circle icon rather than red, providing a distinct visual signal for users with red-green colour vision deficiency. The icon ensures error state is communicated by shape as well as colour.

## Typography components

All typography is wrapped in purpose-built components — raw Mantine `Text` or `Title` should not be used directly.

| Component       | Wraps      | Size | Colour    | Weight |
| --------------- | ---------- | ---- | --------- | ------ |
| PageHeader      | Title (h1) | xl   | primary.6 | bold   |
| HeaderText      | Title (h2) | lg   | inherits  | bold   |
| BodyText        | Text       | lg   | text      | 500    |
| BodyTextBold    | Text       | lg   | text      | 700    |
| BodyTextInline  | Text/span  | lg   | text      | 500    |
| BodyTextClamp   | Text       | lg   | text      | 500    |
| BodyTextMuted   | Text       | lg   | dimmed    | 500    |
| ErrorText       | Text       | lg   | orange.8  | 700    |
| PlaceholderText | Text       | lg   | gray.4    | normal |
| HyperlinkText   | Anchor     | lg   | primary.4 | normal |
| MarkdownView    | div (HTML) | lg   | text      | 500    |

Notes:

- **PageHeader** uses `primary.6` via CSS module with responsive sizing (1.875rem mobile → 2.5rem desktop)
- **ErrorText** includes an `IconAlertCircle` icon alongside the text for colour-blind accessibility
- **HyperlinkText** has a permanent underline and darkens to `primary.8` on hover
- **MarkdownView** renders sanitised HTML from markdown, styled via CSS module to match BodyText

## Semantic colour tokens

All colour values live in two files:

- `frontend/src/styles/semanticColours.ts` — exports `brand`, `statusColours`, and `textColours` for status badges, alerts, and text
- `frontend/src/components/badge/badgeColours.ts` — mirrors `semanticColours` for badge-specific use with `BadgeColourConfig` shape

Components should import from these files rather than hardcoding colour values. The badge colours file defines the same semantic tokens (`success`, `warning`, `alert`, etc.) for use with badge components.

## Storybook documentation

The **Foundations/** category in Storybook provides visual references:

- **Foundations/Colours** — brand swatches, status badges, text colour samples, grey scale, and 10-shade colour scale ramps (primary navy, secondary amber, neutral grey)
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

## What is planned

- **Spacing tokens** — document any custom spacing conventions beyond Mantine's built-in props
- **Component backgrounds and borders** — expand the semantic palette to cover hover states, borders, and surface colours as patterns emerge
