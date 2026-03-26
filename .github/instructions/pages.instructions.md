---
applyTo: "frontend/src/pages/**"
---

# Page conventions

- Pages must **only use components from `components/`** (the Storybook catalogue). Do not place reusable UI inline in pages.
- If a page needs a component that does not exist in `components/`, build a new Storybook component first following the rules in `.github/instructions/components.instructions.md`, then use it in the page.
