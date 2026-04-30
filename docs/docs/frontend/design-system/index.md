# Design system

Quill's design system provides a consistent visual language across the application. It is built on [Mantine 8](https://mantine.dev/) and documented in Storybook under the **Foundations/** category.

## Brand colours

| Token     | Hex                   | Usage                                       |
| --------- | --------------------- | ------------------------------------------- |
| Primary   | `#001a36` (deep navy) | Navigation, primary actions, brand identity |
| Secondary | `#C8963E` (gold)      | Secondary buttons, accents, highlights      |

The primary colour was extracted from the Quill logo. The secondary gold complements the navy and matches the public site amber.

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

- **Foundations/Colours** — brand swatches, status badges, and text colour samples
- **Foundations/Typography** — every typography component rendered with sample text, plus the responsive font size scale

These are documentation-only stories with no associated test files.

## What has been done

- Created `semanticColours.ts` as the single source of truth for all design tokens
- Built Foundations/Colours and Foundations/Typography Storybook stories
- Updated ErrorText to `red.8` for colour-blind accessibility
- Standardised all badge components to use config record patterns with shared `BadgeColourConfig`
- Added `BadgeSkeleton` shared loading component
- Added `StateMessage` empty states to all list components

## What is planned

- **Refactor badge colours** — `badgeColours.ts` will import from `semanticColours.ts` instead of defining its own values
- **Delete BadgeColours story** — replaced by Foundations/Colours
- **Colour accessibility audit** — a sighted reviewer should verify contrast ratios and colour-blind distinguishability across all tokens
- **Public site colours** — document the public site palette (navy, amber, off-white) as a separate Foundations section
- **Spacing tokens** — document any custom spacing conventions beyond Mantine's built-in props
- **Component backgrounds and borders** — expand the semantic palette to cover hover states, borders, and surface colours as patterns emerge
- **Mantine theme integration** — wire brand colours into the Mantine `primaryColor` theme setting so default buttons, links, and focus rings use the navy automatically
