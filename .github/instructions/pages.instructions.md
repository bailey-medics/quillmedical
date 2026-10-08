---
applyTo: "frontend/src/pages/**"
---

# Page conventions

- Pages must **only use components from `components/`** (the Storybook catalogue). Do not place reusable UI inline in pages.
- If a page needs a component that does not exist in `components/`, build a new Storybook component first following the rules in `.github/instructions/components.instructions.md`, then use it in the page.
- **Right-justify all buttons** - wrap buttons in `<Group justify="flex-end">` so they align to the right of their container.
- **Never use `clearable` on SelectField** - do not add the clear (X) button to select inputs. If a field is optional, use placeholder text to indicate this.
- **Page messages and confirm modals** - always use `username` (not full name) when referencing a user in page message descriptions and confirm modal text.
- **New pages show a child nav link while open** - when adding a page, give the sidebar entry it sits under a child link for it that appears only while that page is open, and is marked active. Use `NestedNavLink` children in `SideNavContent.tsx` (and `TeachingMainNav.tsx` for teaching pages), as the Admin, Passport and Feedback entries do. It tells somebody where they are in the menu without adding a permanent entry. Leave it out only where a child would mislead, and say why in a comment.
- **A feature's pages load as one lazy chunk, never one per page** - export a new page from its feature's chunk module (`pages/admin/adminChunk.ts`, `pages/clinical/clinicalChunk.ts`, `pages/passport/passportChunk.ts`, `pages/safety/safetyChunk.ts`, `features/teaching/teachingChunk.ts`) and route it in `main.tsx` with `lazyFrom(loadAdmin, "PageName")`. Do not give a route a `lazy: () => import(...)` of its own, and do not import a feature's page into `main.tsx` directly; `featureChunks.test.ts` fails on both. Keep `handle` on the route object, and pass a page's own guard as the third argument to `lazyFrom` rather than nesting the page under a guard route. A new feature gets its own `<feature>Chunk.ts`, with a loader and a `canOpen` test in `frontend/src/featureChunks.ts`. Teaching must stay one chunk: nothing may be fetched between starting an exam and seeing its result.
