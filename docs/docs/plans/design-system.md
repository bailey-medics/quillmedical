# Design system plan

## Goal

Create a `Foundations/` Storybook category that documents the app's design decisions — semantic colours, typography, and spacing — so developers can look at Storybook and know exactly which tokens to use.

## Phase 1: semantic colour palette

Create `frontend/src/styles/semanticColours.ts` as the single source of truth for all status and text colours used across the app.

### Primary colour

The app's primary colour is **`#001a36`** — a deep navy blue taken from the Quill logo. This will be used for primary actions, active navigation states, and brand-aligned UI elements. Status colours and the broader palette should complement this navy.

### Secondary colour

The app's secondary colour is **gold** — warm accent to complement the navy primary. Aligns with the existing public site amber (`#C8963E`). Exact shade to be confirmed once we see it in context — may use the public site amber as-is or adjust. Used for secondary buttons, accents, highlights, and hover states.

### Status colours

| Token       | Mantine value | Usage                             |
| ----------- | ------------- | --------------------------------- |
| success     | teal          | Active, completed, final, pass    |
| warning     | cyan.6        | Draft, pending                    |
| outstanding | pink          | Deactivated, cancelled            |
| info        | blue          | Upcoming, amended, admin, unread  |
| neutral     | yellow.4      | Staff, default                    |
| accent      | violet        | Incomplete, special states        |
| alert       | red           | No-show, patient, fail, attention |

Each status token stores `{ bg: string; text: string }` — background and text colour — matching the existing `BadgeColourConfig` shape.

### Text colours

| Token            | Value                     | Usage                                       |
| ---------------- | ------------------------- | ------------------------------------------- |
| text.default     | (inherits)                | HeaderText, PageHeader — default headings   |
| text.body        | var(--mantine-color-text) | BodyText, BodyTextClamp — primary body text |
| text.error       | orange.8                  | ErrorText — validation and error messages   |
| text.placeholder | gray.4                    | PlaceholderText — empty field hints         |

### Refactor badge colours

Refactor `frontend/src/components/badge/badgeColours.ts` to import from `semanticColours.ts` instead of defining its own values. No behaviour change for badge components — same values, different source of truth.

## Phase 2: Foundations/Colours story

Create `frontend/src/stories/Colours.stories.tsx` with `title: "Foundations/Colours"`.

Sections:

- **Semantic palette** — colour swatches with token name, Mantine value, and usage description
- **Badge mapping** — shows which semantic tokens map to which badge states (reference, not duplication)

The existing `BadgeColours.stories.tsx` is deleted — its content moves here to avoid duplication.

> **Note:** Public site colours (navy, amber, off-white, etc.) are out of scope for now. They will be added as a separate section later.

## Phase 3: Foundations/Typography story

Create `frontend/src/stories/Typography.stories.tsx` with `title: "Foundations/Typography"`.

Sections:

- **Component showcase** — every typography component rendered with sample text, labelled with its name and key props (size, colour, weight)
- **Font size scale** — the responsive scale from `theme.ts` (xs through xl, mobile and desktop values)

### Typography components to document

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

## Phase 4: clean up

- Delete `frontend/src/components/badge/BadgeColours.stories.tsx` (replaced by Foundations/Colours)
- Update `copilot-instructions.md` Storybook component catalogue to include Foundations stories

## Verification

1. `docker exec quill_frontend sh -lc "yarn storybook:build"` — all stories compile
2. `docker exec quill_frontend sh -lc "yarn unit-test:run src/components/badge/"` — badge tests still pass after refactor
3. Visual check: Foundations/Colours and Foundations/Typography render correctly

## Decisions

- Stories live in `frontend/src/stories/` alongside existing `variants.tsx`
- Documentation-only stories — no test files needed
- Semantic palette is TypeScript-first (importable by components)
- Badge colours remain a separate file wrapping the shared palette (keeps badge API stable)
- Public site colours are deferred — will be added as a separate Foundations section later

## Open questions

- Should the semantic palette eventually cover component backgrounds, borders, and hover states? Start with status and text colours only, expand later as patterns emerge.
- Should spacing tokens be documented in Foundations? Mantine handles most spacing via props, but any custom spacing conventions could be captured here.
