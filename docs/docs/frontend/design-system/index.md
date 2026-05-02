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

Status colours communicate state in badges, alerts, and form validation. Each token defines a background and text colour pair.

| Token       | Mantine value | Usage                              |
| ----------- | ------------- | ---------------------------------- |
| success     | green         | Active, completed, final, pass     |
| warning     | yellow.8      | Draft, pending                     |
| outstanding | pink          | Deactivated, cancelled, fail       |
| info        | blue          | Upcoming, amended, admin, unread   |
| neutral     | yellow.4      | Staff, default                     |
| accent      | violet        | Incomplete, special states         |
| alert       | red           | No-show, patient, attention needed |

## Text colours

| Token       | Value                              | Usage                                              |
| ----------- | ---------------------------------- | -------------------------------------------------- |
| default     | inherits                           | Headings (HeaderText, PageHeader)                  |
| body        | dimmed                             | Secondary body text (BodyText, BodyTextClamp)      |
| emphasis    | black                              | Emphasised body text (BodyTextBlack, BodyTextBold) |
| error       | red.8                              | Validation and error messages (ErrorText)          |
| placeholder | `var(--mantine-color-placeholder)` | Empty field hints (PlaceholderText)                |

> **Accessibility note:** Error text uses `red.8` (`#e03131`) rather than the default Mantine `red` (`#fa5252`) for better visibility with red-green colour blindness.

## Typography components

All typography is wrapped in purpose-built components — raw Mantine `Text` or `Title` should not be used directly.

| Component       | Wraps      | Size | Colour      | Weight |
| --------------- | ---------- | ---- | ----------- | ------ |
| PageHeader      | Title (h1) | xl   | inherits    | bold   |
| HeaderText      | Title (h2) | lg   | inherits    | bold   |
| BodyTextBlack   | Text       | lg   | black       | normal |
| BodyTextBold    | Text       | lg   | black       | 700    |
| BodyText        | Text       | lg   | dimmed      | normal |
| BodyTextClamp   | Text       | lg   | dimmed      | normal |
| ErrorText       | Text       | lg   | red.8       | 700    |
| PlaceholderText | Text       | lg   | placeholder | normal |
| HyperlinkText   | Anchor     | lg   | link        | normal |

## Semantic colour tokens

All colour values live in a single file:

```
frontend/src/styles/semanticColours.ts
```

This exports `brand`, `statusColours`, and `textColours`. Components should import from here rather than hardcoding colour values. Badge colours (`badgeColours.ts`) will be refactored to import from this file.

## Storybook documentation

The **Foundations/** category in Storybook provides visual references:

- **Foundations/Colours** — brand swatches, status badges, text colour samples, and 10-shade scale ramps
- **Foundations/Typography** — every typography component rendered with sample text, plus the responsive font size scale

These are documentation-only stories with no associated test files.

## What has been done

- Created `semanticColours.ts` as the single source of truth for all design tokens
- Built Foundations/Colours and Foundations/Typography Storybook stories
- Updated ErrorText to `red.8` for colour-blind accessibility
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

## What is planned

- **Refactor badge colours** — `badgeColours.ts` will import from `semanticColours.ts` instead of defining its own values
- **Delete BadgeColours story** — replaced by Foundations/Colours
- **Colour accessibility audit** — a sighted reviewer should verify contrast ratios and colour-blind distinguishability across all tokens
- **Spacing tokens** — document any custom spacing conventions beyond Mantine's built-in props
- **Component backgrounds and borders** — expand the semantic palette to cover hover states, borders, and surface colours as patterns emerge
