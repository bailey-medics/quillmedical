# Dark/light mode plan

## Status: phase 1-3 complete

## Current state

The app runs in implicit light mode with no dark infrastructure:

- **Main app** (`main.tsx`): `MantineProvider` has no `defaultColorScheme` or `forceColorScheme`, so Mantine defaults to `"light"`
- **Public pages** (`PublicMantineProvider.tsx`): explicitly `defaultColorScheme="light"` — public pages are dark-themed by design and have no light mode
- **Public footer** (`PublicFooter.tsx`): the only dark-mode usage — wraps itself in `forceColorScheme="dark"`
- **Storybook** (`preview.tsx`): no colour scheme config, inherits Mantine default
- **`cssVariablesResolver`** in `theme.ts`: `dark: {}` is empty; `light: {}` sets `--mantine-color-text` and `--mantine-color-placeholder`
- **No `ColorSchemeScript`** rendered anywhere (needed to prevent flash of wrong scheme)
- **No usage** of `useMantineColorScheme`, `useComputedColorScheme`, or `light-dark()` CSS function
- **Semantic colours** (`semanticColours.ts`): hardcoded to light-mode-friendly values with no dark variants
- **CSS modules**: several hardcoded hex/rgb values in `PublicButton.module.css`, `PublicBurgerButton.module.css`, `UnreadBadge.module.css`, and others

## Motivation

- Clinical use cases — PACS image viewing (e.g. X-rays) benefits from dark backgrounds
- Accessibility — reduced eye strain in low-light environments
- Future-proofing — laying the foundation now during design system work makes it far easier to enable later
- User preference — some users prefer dark interfaces (no user toggle for now, but the infrastructure will be ready)

## Scope decisions

- **No user toggle** — dark/light mode is not user-selectable in this phase. The infrastructure is being laid so it can be enabled later.
- **Page-level enforcement** — pages can force dark or light mode via `forceColorScheme` (e.g. PACS viewer forces dark, most pages stay light).
- **Public pages stay as-is** — they are dark-themed by design and have no light mode variant. No changes needed.
- **No transition animations** — scheme changes are instant.
- **Colour values are initial placeholders** — dark-mode colours will be refined collaboratively after the infrastructure is in place.

## Implementation phases

### Phase 1 — Foundation

1. **Add `ColorSchemeScript` to `index.html`**
   - Place in `<head>` before any stylesheets
   - Prevents flash of wrong colour scheme on page load

2. **Set `defaultColorScheme="light"` explicitly on `MantineProvider` in `main.tsx`**
   - Makes the light default explicit rather than implicit
   - When a user toggle is added later, change to `"auto"` to respect OS preference

3. **Populate `dark: {}` in `cssVariablesResolver` (`theme.ts`)**
   - Define dark-mode values for `--mantine-color-text`, `--mantine-color-placeholder`
   - Add dark-mode values for `--brand-background` and any custom surface/background tokens
   - Use navy-tinted dark (not pure black) for consistency with brand

4. **Add dark-mode semantic colours (`semanticColours.ts`)**
   - Either add `darkBg`/`darkText` pairs per status token, or convert to CSS variables that resolve differently per colour scheme

### Phase 2 — Hardcoded colour cleanup

Depends on Phase 1. Tasks are independent of each other.

5. **Fix CSS module hardcoded colours**
   - `PublicButton.module.css`: `#333` (3 occurrences), `#a07728`, `#d4a854`
   - `PublicBurgerButton.module.css`: `#1e2d4a`
   - `UnreadBadge.module.css`: `color: white`
   - Replace with CSS variables or Mantine's `light-dark()` CSS function

6. **Audit component `c=` props**
   - Components using `c="white"`, `c="dark"`, or hardcoded colour strings need checking
   - Mantine tokens like `c="dimmed"` already adapt to colour scheme automatically

### Phase 3 — Storybook

Depends on Phase 1.

7. **Add Storybook dark mode toolbar**
   - Use `@storybook/addon-themes` or a custom toolbar item to toggle `data-mantine-color-scheme` on the preview
   - Allows designers to verify both schemes side by side and refine dark-mode colours

### Phase 4 — Page-level enforcement pattern

Depends on Phase 1.

8. **Document the `forceColorScheme` pattern for page-level overrides**
   - Pages like PACS viewer wrap content in `<MantineProvider forceColorScheme="dark">` (same pattern as `PublicFooter`)
   - Create a reusable wrapper component if needed (e.g. `<ForceDarkScheme>`)

## Files involved

| File                                                           | Changes                                                                    |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `frontend/index.html`                                          | Add `ColorSchemeScript` in `<head>`                                        |
| `frontend/src/main.tsx`                                        | Add `defaultColorScheme="light"` to `MantineProvider`                      |
| `frontend/src/theme.ts`                                        | Populate `dark: {}` in `cssVariablesResolver` with dark-mode token values  |
| `frontend/src/styles/semanticColours.ts`                       | Add dark-mode status colour variants                                       |
| `frontend/src/components/button/PublicButton.module.css`       | Replace 6 hardcoded colour values                                          |
| `frontend/src/components/button/PublicBurgerButton.module.css` | Replace hardcoded hover colour                                             |
| `frontend/src/components/badge/UnreadBadge.module.css`         | Replace `color: white` with CSS variable                                   |
| `frontend/.storybook/preview.tsx`                              | Add dark mode toggle toolbar                                               |

## Key decisions

| Decision               | Decision                                      | Rationale                                                                                           |
| ---------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Default scheme         | `"light"` (explicit)                          | No user toggle for now; change to `"auto"` when toggle is added                                     |
| User toggle            | Not yet                                       | Infrastructure first; toggle added in a future PR                                                   |
| Public pages           | No changes                                    | Dark-themed by design; no light mode variant exists                                                 |
| PACS/X-ray views       | Per-page `forceColorScheme="dark"`             | Same pattern as `PublicFooter`; keeps dark mode scoped to where it's clinically useful               |
| Dark surface colour    | Navy-tinted dark (not pure black)              | Consistent with brand; easier on eyes                                                               |
| Preference persistence | `localStorage` (Mantine default) when enabled | No backend change needed initially; sync across devices only if stored in user profile later         |
| Transition animation   | None                                          | Instant scheme changes                                                                              |
| Dark colour values     | Initial placeholders                          | Will be refined collaboratively after infrastructure is in place                                     |

## Verification checklist

- [ ] Dark mode renders correctly when forced via `forceColorScheme="dark"` on a page
- [ ] Light mode remains the default and looks unchanged
- [ ] No flash of wrong colour scheme on page load (`ColorSchemeScript` working)
- [ ] Storybook toggle — stories render correctly in both schemes
- [ ] Public pages remain unaffected
- [ ] Images and logos — correct variants used per scheme (e.g. white logo on dark, default on light)
- [ ] Full test suite passes
- [ ] Storybook builds successfully

## Further considerations

- **Logo variants**: the Quill logo already has white/light-grey/default variants. Dark mode should use the white variant in the main navigation.
- **User profile sync**: when a user toggle is added, if preference should persist across devices, store in the user profile on the backend.
- **Print styles**: dark mode should not affect print output — ensure `@media print` overrides to light scheme.
