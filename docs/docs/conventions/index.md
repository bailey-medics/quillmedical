# Engineering conventions

This page is the single, human-facing source of truth for the cross-cutting conventions
we follow across Quill Medical. It complements — and is kept in step with —
`.github/copilot-instructions.md` (which frames the same rules for the AI coding agent)
and the narrow, path-scoped rules in `.github/instructions/*.instructions.md`.

Where a rule applies to a specific folder (components, pages, workflows, the `Justfile`),
the scoped instruction file is authoritative for the detail. This page captures the
conventions that apply everywhere.

## Language and text

- **British English** for all documentation, comments, UI text, and code identifiers
  where appropriate. Exceptions: external APIs, libraries, CSS properties, and HTTP
  headers keep their original spelling.
- **Sentence case** for all UI titles, labels, buttons, and headings — for example
  "Add new user", not "Add New User". Product names, acronyms, and proper nouns keep
  their casing.
- In Markdown, use proper heading syntax (`#`, `##`, `###`) rather than bold text, and
  avoid trailing punctuation on headings. Wrap email addresses in angle brackets, for
  example `<info@quill-medical.com>`.

## Version pinning

Dependencies are pinned to exact versions wherever practical — including GitHub Actions
(for example `actions/checkout@v7.0.1`, `docker/build-push-action@v7.3.0`), Docker base
images, and lockfile-managed packages. Exact pins keep builds reproducible and make every
version change an explicit, reviewable Renovate PR rather than a silent floating-tag
update. See [Automatic dependency updates](../dependencies/automatic-updates.md) for how
those PRs are scheduled, tiered, and reviewed.

## Type safety

Strong static typing is treated as a clinical-safety requirement, not a stylistic
preference.

- **Backend (Python)** must pass `mypy --strict` with zero errors. Annotate every
  parameter and return type, avoid `Any` except for genuinely dynamic data, use Pydantic
  for API validation and `Mapped[Type]` for ORM models, and prefer `Enum` or `Literal`
  over bare strings for constants.
- **Frontend (TypeScript)** runs with `"strict": true`. Define interfaces for API
  responses, props, and complex objects; use type guards rather than `as` assertions; and
  handle `null`/`undefined` explicitly.

## Defensive programming

- Validate all input at system boundaries (Pydantic on the backend, Zod on the frontend);
  reject unexpected fields with Pydantic `extra='forbid'`.
- Wrap all external calls (database, FHIR, EHRbase, file I/O) in error handling, catch
  specific exceptions, and fail safe (deny access, safe fallbacks).
- Use parameterised queries only (SQLAlchemy ORM — never string concatenation), wrap
  writes in transactions with rollback, and make critical operations idempotent.
- Never log or display PHI in errors, logs, or notifications. Audit clinical
  modifications (who, what, when) and version clinical documents rather than updating them
  in place.

## Testing

- Always create or update tests when changing code.
- Run backend and frontend unit tests **inside Docker containers**, never directly on the
  host: `just ub` (backend) and `just uf` (frontend), with targeted runs preferred during
  development.
- Storybook runs on the host: `just sb` (dev), `just sbt` / `just sbtci` (tests).
- Every reusable frontend component must have associated `.stories.tsx` and `.test.tsx`
  files.

## Frontend specifics

- Use the `api` client from `@/lib/api.ts` for all backend calls — never raw `fetch`
  (the sole exception is `checkHealth()` in `ConnectivityContext.tsx`).
- Use the path aliases (`@/`, `@lib/`, `@components/`, `@test/`, `@domains/`) rather than
  relative paths.
- Style with Mantine and CSS modules — no inline styles.
- Follow the component reuse hierarchy: reuse an existing Storybook component first,
  compose from existing components second, and only build from scratch when nothing fits
  (with a plan reviewed by a human before implementation).

## Package management

- The frontend uses **Yarn 4** — never use `npm`.
- The backend uses **Poetry**.

## Git and review

- **Never auto-commit or auto-push** — always ask for permission first.
- **Never merge pull requests** — merging is solely a human responsibility.
- Branches follow the `feature/*` convention; `main` requires a pull request and is never
  pushed to directly. See the [CI/CD pipeline](../cicd/index.md) for the full branching
  strategy.
