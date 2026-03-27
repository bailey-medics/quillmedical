---
applyTo: "frontend/src/components/**"
---

# Component conventions

- **Reuse existing components** from this `components/` folder. Always check what already exists before creating anything new.
- Use **typography components** from `components/typography/` for **all** text — Never use raw Mantine `<Text>`, `<Title>`, or plain HTML text elements. If none of the existing typography components fit, ask a human before creating a new one.
- Use the **`<Icon>`** component from `components/icons/Icon.tsx` to wrap **all** Tabler icons — never render Tabler icons directly in JSX (e.g. `<IconPencil />` on its own is not allowed). Always use `<Icon icon={<IconPencil />} />`. Register any new icons in `components/icons/appIcons.tsx` first.
- If you need a new component that does not have existing atomic components to compose from, **stop and ask a human for help** — do not create new atomic components on your own.
- Every new component must have a `.stories.tsx` and `.test.tsx` file alongside it.

## Language and text

- **British English** for all UI text, comments, and code identifiers (e.g. `colour` not `color` in our own props). Exceptions: external APIs, libraries, CSS properties, HTTP headers.
- **Sentence case** for all UI labels, buttons, and headings (e.g. "Add new user", not "Add New User"). Exceptions: product names, acronyms, proper nouns.

## Styling

- **No inline styles** — use Mantine component props or CSS modules only.
- **Responsive**: always use `theme.breakpoints.sm` (`48em` / 768px) for mobile/desktop splits via `useMediaQuery`.

## Testing and stories

- Use `renderWithMantine` or `renderWithRouter` from `@test/test-utils` in all tests.
- Use `VariantStack` and `VariantRow` from `src/stories/variants.tsx` for "all sizes" or "all variants" stories.
