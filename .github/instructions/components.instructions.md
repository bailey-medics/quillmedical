---
applyTo: "frontend/src/components/**"
---

# Component conventions

- **Reuse existing components** from this `components/` folder. Always check what already exists before creating anything new.
- Use **typography components** from `components/typography/` for **all** text — Never use raw Mantine `<Text>`, `<Title>`, or plain HTML text elements. If none of the existing typography components fit, ask a human before creating a new one.
- Use **`<PageHeader>`** for page-level titles and component section headings displayed on pages.
- Use the **`<BaseCard>`** component from `components/base-card/BaseCard.tsx` for **all** cards — never use Mantine's `<Card>` directly. BaseCard enforces consistent `shadow="sm"`, `padding="lg"`, `radius="md"`, and `withBorder`. These props are fixed and cannot be overridden.
- Use the **`<Icon>`** component from `components/icons/Icon.tsx` to wrap **all** Tabler icons — never render Tabler icons directly in JSX (e.g. `<IconPencil />` on its own is not allowed). Always use `<Icon icon={<IconPencil />} />`. Register any new icons in `components/icons/appIcons.tsx` first.
- If you need a new component that does not have existing atomic components to compose from, **stop and ask a human for help** — do not create new atomic components on your own.
- Every new component must have a `.stories.tsx` and `.test.tsx` file alongside it.

## Language and text

- **British English** for all UI text, comments, and code identifiers (e.g. `colour` not `color` in our own props). Exceptions: external APIs, libraries, CSS properties, HTTP headers.
- **Sentence case** for all UI labels, buttons, and headings (e.g. "Add new user", not "Add New User"). Exceptions: product names, acronyms, proper nouns.

## Styling

- **No inline styles** — use Mantine component props or CSS modules only.
- **Use `rem` instead of `px`** in CSS modules where possible for better scalability.
- **Responsive**: always use `theme.breakpoints.sm` (`48em` / 768px) for mobile/desktop splits via `useMediaQuery`.
- **Right-justify all buttons** — wrap buttons in `<Group justify="flex-end">` so they align to the right of their container.

## Colours

- **All colours must come from the design system** — never use hardcoded colour values (e.g. `black`, `#333`, `rgb(...)`) in components or CSS modules.
- **Never use Mantine's built-in colour scales directly** (e.g. `dark.4`, `blue.6`, `red.5`, `--mantine-color-dark-4`, `--mantine-color-blue-6`) — they are not part of our design system. Only use our defined tokens: `primary`, `secondary`, `gray`, and semantic/status colours from the imports below.
- **Brand colours**: import `brandColours`, `publicColours` from `@/theme`.
- **Colour scales**: import `primaryScale`, `secondaryScale`, `greyScale` from `@/theme`.
- **Status/semantic colours**: import from `@/styles/semanticColours` (e.g. `statusColours`, `textColours`).
- **Badge colours**: import from `components/badge/badgeColours.ts`.
- **In CSS modules**: use Mantine CSS variables (e.g. `var(--mantine-color-text)`, `var(--mantine-color-primary-6)`, `var(--mantine-color-gray-0)`) — never raw colour literals.
- **In TSX**: use Mantine colour tokens (e.g. `c="primary.7"`, `c="gray.4"`) or imports from the above modules.
- **Dark mode borders**: all form field inputs must use `var(--mantine-color-primary-9)` for border colour in dark mode via `[data-mantine-color-scheme="dark"]` selectors in CSS modules.

## Testing and stories

- Use `renderWithMantine` or `renderWithRouter` from `@test/test-utils` in all tests.
- Use `VariantStack` and `VariantRow` from `src/stories/variants.tsx` for "all sizes" or "all variants" stories.
- Loading/skeleton stories should be placed **last** in the stories file.
- Use `layout: "padded"` (not `"centered"`) so stories render top-left. Exception: layout components (e.g. `MainLayout`, `NotFoundLayout`).
- **Do NOT wrap stories in `MemoryRouter`** — Storybook's `preview.tsx` already provides a `RouterProvider` context. Adding a `MemoryRouter` decorator causes a "cannot render a Router inside another Router" error.
