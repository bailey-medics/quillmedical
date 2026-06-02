---
agent: "agent"
name: fast-api-docs
description: Generate FastAPI Code Documentation
---

# Generate FastAPI Code Documentation

Please can you:

1. Review the Python modules in `/backend/app/`
2. Create documentation pages in `/docs/docs/code/fastapi/` for each module if not already present (e.g. `main.md`, `schemas.md`, etc.). Make sure these are still accurate to the code.
3. Use mkdocstrings syntax (`::: app.module_name`) to auto-generate docs from docstrings
4. Create an `index.md` with links to all module pages
5. Update the `/docs/mkdocs.yml` navigation to include all FastAPI modules under Code Documentation → Backend

Each module page should follow this format:

```markdown
# Module Name

::: app.module_name
```

For schemas, include all submodules (auth, cbac, features, letters, messaging) in a single schemas.md file.
