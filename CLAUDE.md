# Copilot Instructions for Quill Medical

> **Synced from `.github/copilot-instructions.md`** by `/sync-copilot-config`.
> That file is the source of truth: edit it there, not here, then re-run the
> sync. Hand-written Claude-only guidance belongs in the `## Claude-specific`
> section at the foot of this file, which the sync never writes into.

## Stack Overview

- **Backend**: FastAPI (Python 3.13), Poetry, PostgreSQL core DB
- **Frontend**: React 19 + TypeScript + Vite + Mantine UI (Yarn 4, **never use npm**)
- **Healthcare**: HAPI FHIR (demographics) and EHRbase (all other clinical data)
- **Infrastructure**: Docker Compose, GCP Cloud Run + Global HTTPS Load Balancer (prod), Caddy (dev proxy + prod static serving), GCS (public site)

## Key Commands

See the `Justfile` if you want to know more.

## Testing Requirements

- **ALWAYS create/update tests** when changing code
- **ALWAYS run backend and frontend unit tests inside Docker containers** — never run them directly on the host
  - Backend: `just ub` (all unit tests) or `just ub -k "test_name"` (targeted)
  - Frontend: `just uf` (all unit tests) or `just uf src/path/to/file.test.tsx` (targeted)
  - Both run in a throwaway container from `compose.test.yml` that mounts the current worktree, so they work from any worktree and do not need the dev stack running
  - Prefer targeted tests during development; run the full suite only if CI is failing
- Storybook: runs on the host — `just sb` (dev server), `just sbt` (tests), `just sbtci` (CI mode)
- Backend: pytest with fixtures from `conftest.py`
- Frontend: vitest + @testing-library/react with `renderWithMantine`/`renderWithRouter`
- Cover: props variations, edge cases, null/undefined, interactions, loading/error states

## Conventions

### Language

- **British English** for all docs, comments, UI text, and code identifiers where appropriate
- Exceptions: External APIs, libraries, CSS properties, HTTP headers

### UI Text Casing

- **Sentence case** for all UI titles, labels, buttons, and headings
- Format: "This is sentence case" (first word capitalized, rest lowercase unless proper nouns)
- Examples: "Add new user", "Create patient record", "System settings"
- Exceptions: Product names, acronyms, proper nouns retain their casing

### Backend (FastAPI)

- **mypy --strict**: All functions require explicit type annotations
- **SQLAlchemy 2.0**: Use `Mapped[Type]` type hints, `DeclarativeBase`
- **Security**: JWT in HTTP-only cookies (15min access, 7d refresh), TOTP 2FA, Argon2 passwords, CSRF via `itsdangerous`
- **Settings**: `pydantic-settings` with `SecretStr`, env vars via Docker Compose
- **Linting**: Ruff (E, F, W, I, UP, B) + Black (line-length 79)
- **API**: All routes under `/api`. Standard FastAPI dependency constants:
  - `DEP_GET_SESSION` — DB session (via `get_core_db`)
  - `DEP_CURRENT_USER` — Authenticated user from JWT cookie
  - `DEP_REQUIRE_ROLES_CLINICIAN` — Clinician role gate
  - `DEP_REQUIRE_CSRF` — CSRF token validation (mutating endpoints)
- **API changes**: additive-only; breaking changes need the expand-contract
  two-deploy pattern — see `.claude/rules/backend.md`

### Frontend (React + TypeScript)

- **API**: Use `api.ts` client for all backend calls (auto-retry on 401, CSRF, credentials) — never raw `fetch` (sole exception: `checkHealth()` in `ConnectivityContext.tsx`)
- **Auth**: `AuthContext.tsx` provides `state`, `login`, `logout`, `reload`
- **Routing**: React Router v7 with `createBrowserRouter` in `src/main.tsx`
- **Protection**: `<RequireAuth>` for authenticated routes, `<GuestOnly>` for login/register, `<RequirePermission level="admin">` for admin routes, `<RequireClinical>` for FHIR/EHRbase-dependent routes, `<RequireFeature feature="teaching">` for feature-gated routes (all in `src/auth/`)
- **Path aliases**: Defined in `frontend/tsconfig.json` under `compilerOptions.paths` — always use `@/`, `@lib/`, `@components/`, `@test/`, `@domains/` prefixes instead of relative paths
- **Styling**: Mantine 8.3 + CSS modules, no inline styles
- **Button alignment**: Right-justify buttons on desktop (`<Group justify="flex-end">`). Action pairs (submit/cancel) go full-width stacked on mobile — use `ButtonPair`/`ButtonPairRed` which handle this via CSS. Page-header actions (`AddButton`) stay fixed-width at all sizes.
- **Testing**: Use `renderWithMantine` or `renderWithRouter` from `@test/test-utils`
- **Storybook**: all components must have associated `.stories.tsx` and `.test.tsx` files
- **Page Layout**: MainLayout provides `<Container size="lg">` around all page content — pages should NOT add their own Container wrapper
  - Standard page pattern: `<Stack gap="lg">...</Stack>` (no Container needed)
  - Ensures consistent content width (1140px) across all pages
  - To go full-width, call `setFluid(true)` from the page via `useOutletContext<LayoutCtx>()`
- **Responsive**: ALWAYS use `theme.breakpoints.sm` for responsive behaviour
  - Import: `const theme = useMantineTheme();` from `@mantine/core`
  - Mobile/Desktop split: `useMediaQuery(\`(max-width: ${theme.breakpoints.sm})\`)`
  - Standard breakpoint: `sm = "40em"` (640px) - matches navigation drawer toggle
  - Use in all components that need responsive layout/sizing decisions

### Component reuse hierarchy (Storybook-first)

When building UI, follow this priority order:

1. **Reuse existing Storybook components** — always check the catalogue below first
2. **Compose new components from existing ones** — combine Storybook components together
3. **Build from scratch** — only when no existing component fits; build a plan to create a new component with `.stories.tsx` and `.test.tsx` and then present it to a human for review before implementation.

All reusable UI must live in `frontend/src/components/` with Storybook stories. Pages consume components; pages do not contain reusable UI inline.

**Reference stories**: `Typography` and `Colours` live in `src/stories/`.

#### Variant display helpers

When building "All sizes" or "All variants" stories that show rows of components with a label underneath, use the `VariantStack` and `VariantRow` helpers from `src/stories/variants.tsx`:

```tsx
import { VariantRow, VariantStack } from "@/stories/variants";

<VariantStack>
  <VariantRow label="sm">
    <MyComponent size="sm" />
  </VariantRow>
  <VariantRow label="lg (default)">
    <MyComponent size="lg" />
  </VariantRow>
</VariantStack>;
```

- `VariantStack` wraps rows with consistent vertical spacing
- `VariantRow` wraps children in a horizontal `Group` with a label underneath
- Set `horizontal={false}` for single-item rows (e.g. loading skeletons)

#### Cards

All cards MUST use the `<BaseCard>` component from `components/base-card/` — never use Mantine's `<Card>` directly. BaseCard enforces consistent `shadow="sm"`, `padding="lg"`, `radius="md"`, and `withBorder` across the app. These props are fixed and cannot be overridden.

#### Icons

All icons come from `@tabler/icons-react` and MUST be wrapped in the `<Icon>` component for consistent sizing. The allowed icon set is defined in `components/icons/appIcons.ts` — when using a new Tabler icon anywhere in the app, register it there first. The Icon stories display this list automatically.

### Healthcare

- **FHIR**: `fhirclient` library (`backend/app/fhir_client.py`) for patient demographics
- **OpenEHR**: HTTP requests to EHRbase (`backend/app/ehrbase_client.py`) for all other clinical data.
- Each FHIR patient gets corresponding EHR in EHRbase via `subject_id` (idempotent `get_or_create_ehr` pattern)
- **Three-database architecture**: core DB (users/roles/permissions/teaching and other non-patient facing features), FHIR DB (demographics via HAPI), EHRbase DB (clinical documents)

### Authorisation

Two orthogonal layers control access:

| Layer                  | Controls                                             | Mechanism               |
| ---------------------- | ---------------------------------------------------- | ----------------------- |
| **System permissions** | Platform management (users, orgs, dashboards)        | 4-level hierarchy       |
| **CBAC**               | All data access — clinical actions and feature admin | Competency set per user |

#### System permissions

4-level hierarchy for platform management authority: `single-user < staff < admin < superadmin`

| Level         | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| `single-user` | Can manage own profile/settings. No system management. |
| `staff`       | Staff dashboards, team visibility                      |
| `admin`       | User/org management (scoped to own orgs)               |
| `superadmin`  | Global platform management                             |

System permissions have **nothing to do with clinical data access** — that is solely CBAC's responsibility. A patient, teaching delegate, and external HCP, are all `single-user`; their clinical access differs only via CBAC competencies and base profession.

**Practical coupling**: Clinical practitioners require `staff` or above to access clinical workflows (patient lists, dashboards). CBAC then scopes which actions they can perform within those workflows. Each base profession in `shared/base-professions.yaml` declares a `default_system_permission` — a soft default applied at user provisioning that admins can freely override. Both system permissions and CBAC competencies are independently adjustable per user after creation.

- Backend: `backend/app/system_permissions/` — `check_permission_level(user_permission, required)` for hierarchy checks
- Frontend: `<RequirePermission level="admin">` guard in `src/auth/RequirePermission.tsx`
- Admin gate pattern in routes: `if current_user.system_permissions not in ["admin", "superadmin"]: raise HTTPException(403)`

#### CBAC (competency-based access control)

Controls **all data access and actions** — clinical and feature admin. Competencies are categorised by purpose:

| Category          | Examples                                                                         | Risk        |
| ----------------- | -------------------------------------------------------------------------------- | ----------- |
| **Clinical**      | `prescribe_controlled_schedule_2`, `request_ct_scan`, `access_patient_records`   | medium–high |
| **Feature admin** | `manage_teaching_content`, `view_teaching_analytics`, `approve_clinical_letters` | low–medium  |

Resolution formula per user: `(base_profession_competencies + additional) − removed`

- **Shared config** (consumed by both backend via PyYAML and frontend via `yarn generate:types`): `shared/competency-definitions/` (capability definitions, split by kind into `clinical.yaml` and `feature-admin.yaml` and merged into one catalogue at load — ids must be unique across the directory) and `shared/base-professions.yaml` (profession templates with base competencies and `default_system_permission`)
- **Backend**: `backend/app/cbac/` — `has_competency("competency_id")` FastAPI dependency, resolves competencies per user
- **Frontend**: Types at `src/types/cbac.ts`, hooks at `src/lib/cbac/hooks.ts` (`useHasCompetency`, `useHasAnyCompetency`, `useHasAllCompetencies` — check `state.user.competencies` from AuthContext)
- **Generated JSON**: `src/generated/competencies.json` and `src/generated/base-professions.json` auto-generated from shared YAML (`yarn generate:types`)
- CBAC-protected route pattern: `Depends(has_competency("prescribe_controlled_schedule_2"))`

#### Role composition examples

| Scenario             | System permission | CBAC profile                                          |
| -------------------- | ----------------- | ----------------------------------------------------- |
| Teaching delegate    | `single-user`     | `view_teaching_cases` only                            |
| Teaching coordinator | `staff`           | `manage_teaching_content` + `view_teaching_analytics` |
| Junior doctor        | `staff`           | Standard clinical set                                 |
| IT admin             | `admin`           | No clinical CBACs at least                            |
| Clinical lead        | `admin`           | Full clinical set                                     |

#### Organisations

- Backend model `Organisation` in `models.py` with staff/patient membership via association tables
- API endpoints under `/api/organisations` (admin/superadmin only)
- Admin pages at `pages/admin/organisations/`

#### Sites

- Backend model `Site` in `models.py` — a physical or virtual location forming a self-referential hierarchy (hospital > building > ward > room; `type` one of hospital/building/ward/room/clinic/department/virtual)
- Linked to organisations many-to-many via the `organisation_site` association table; staff belong to a site with a `role` (`clinical_lead`, `staff`, `trainee`) via `site_staff_member`
- Underpins teaching governance — clinical-lead resolution runs via the site → organisation linkage
- API endpoints under `/api/sites` (CRUD), `/api/organisations/{org_id}/sites/{site_id}` (link/unlink), and `/api/sites/{site_id}/staff` (staff membership) — admin/superadmin only
- Admin pages at `pages/admin/sites/` (plus `AddSiteToOrgPage` under `pages/admin/organisations/`)

### Web Push notifications

- Backend: `push.py` (subscription management), `push_send.py` (notification sending) — VAPID keys via `just vapid-key`
- Frontend: `EnableNotificationsButton` component in `components/notifications/`
- Note, this has not yet been built out fully and tested.

## Programming Principles

### Strong Static Typing (Critical for Healthcare Safety)

#### Backend (Python)

- Pass `mypy --strict` with zero errors
- Explicit type annotations on all function parameters and returns
- Avoid `Any` types except for truly dynamic data
- Use Pydantic for API validation, `Mapped[Type]` for ORM models
- Prefer `Enum` or `Literal` over strings for constants
- Use `Optional[Type]` or `Type | None` explicitly for nullables

#### Frontend (TypeScript)

- `"strict": true` in `tsconfig.json`
- Define interfaces for API responses, props, complex objects
- Use type guards for runtime checks, avoid `as` assertions
- Enable `strictNullChecks`, handle null/undefined explicitly

### Defensive Programming (Critical for Clinical Apps)

#### Input Validation

- **Validate all inputs before any business logic** — check every parameter and precondition at the top of a function (fail-fast guard clauses), so no work runs on unvalidated data
- Never trust user input: validate at API boundaries (Pydantic/Zod)
- Sanitise data, enforce length limits, validate types/ranges/formats
- Use Pydantic `extra='forbid'` to reject unexpected fields

#### Error Handling

- try-except around all external calls (DB, FHIR, EHRbase, file I/O)
- Catch specific exceptions, log context (not PHI), use user-friendly messages
- Fail-safe defaults (deny access, safe fallbacks)

#### Null Safety

- Check before use, early returns, guard clauses at function start

#### Database Safety

- Parameterised queries only (SQLAlchemy ORM, never string concat)
- Transactions with rollback, foreign key constraints
- Idempotent operations for critical data (payments, clinical)

#### Security-First

- Whitelist over blacklist, least privilege, audit logging (no PHI in logs)
- Explicit auth decision on all endpoints — no endpoint unprotected by accident (health, login, register are intentionally public)
- Authorisation checks (system permissions + CBAC), rate limiting

#### Healthcare-Specific

- Never log/display PHI in errors or debug output
- Validate clinical data strictly, ensure OpenEHR/FHIR compliance
- Audit all clinical modifications (who, what, when)
- Version clinical documents, never update in place

## Quick Patterns

**New API endpoint**: Route in `backend/app/main.py` under `@router`, Pydantic schemas in `backend/app/schemas/`

**CBAC-protected endpoint**: Add `Depends(has_competency("competency_id"))` to route params — raises 403 if user lacks competency

**Admin-only endpoint**: Check `if current_user.system_permissions not in ["admin", "superadmin"]: raise HTTPException(403)` in route body

**Frontend API**: Use `api` from `@/lib/api.ts` (never raw `fetch`)

**Database models**: Define in `backend/app/models.py`, then `just migrate "description"`

**New base profession**: Add entry to `shared/base-professions.yaml` with `id`, `display_name`, `description`, `default_system_permission`, `base_competencies`, and `notes`. Then run `yarn generate:types` in `frontend/`.

## Key Files

- `backend/app/main.py`: FastAPI routes and dependency constants
- `backend/app/models.py`: SQLAlchemy models (User, Role, Organisation, teaching)
- `backend/app/security.py`: JWT, CSRF, TOTP, Argon2 password utilities
- `backend/app/config.py`: Pydantic Settings (DB URLs, JWT config, FHIR/EHRbase URLs)
- `backend/app/db/`: Database session management (`get_core_db`)
- `backend/app/cbac/`: Competency-based access control module
- `backend/app/system_permissions/`: 4-level permission hierarchy
- `backend/app/schemas/`: Pydantic request/response models (`auth.py`, `cbac.py`)
- `frontend/src/main.tsx`: Router config with `createBrowserRouter` and all route definitions
- `frontend/src/auth/`: AuthContext, RequireAuth, GuestOnly, RequirePermission, RequireClinical, RequireFeature
- `frontend/src/lib/api.ts`: API client (auto-retry 401, CSRF, credential cookies)
- `frontend/src/types/cbac.ts`: CBAC type definitions
- `frontend/src/RootLayout.tsx`: Root layout with patient context provider
- `frontend/src/domains/patient.ts`: Patient type and helpers
- `frontend/src/generated/`: Auto-generated JSON from shared YAML
- `shared/`: YAML config files (base-professions, competencies, jurisdiction-config)
- `compose.dev.yml`: Docker stack config (8 services)
- `Justfile`: Dev commands (use `just --list` for all)

## Critical Rules

### Security

- Never log PHI in errors/logs/notifications
- Enforce RBAC + CBAC at API, DB and application level
- Use `SecretStr` for secrets, never commit `.env` files
- **Secrets live where they are used, not where they pass through.** A secret
  GitHub Actions genuinely consumes — the Slack webhook it posts to, the
  Workload Identity provider it authenticates with — belongs in GitHub. A
  secret GitHub only relays onward, setting `TF_VAR_*` for Terraform to hand
  to another system untouched, belongs in that system's own store: GCP Secret
  Manager, read by a `google_secret_manager_secret_version` data source. The
  test is whether anything in the workflow opens the envelope, or merely
  carries it. Relaying makes GitHub a second custodian for no benefit, and an
  organisation secret is readable by every repository it is visible to
  — including public ones and any a content author can push a workflow to.
- **Scope organisation secrets to the repositories that need them.** Default
  `ALL` visibility is almost never right. Justify it or narrow it.
- Prefer identifiers to credentials in continuous integration. Workload
  Identity Federation is the model: GitHub holds a provider name and a service
  account email, and nothing worth stealing.

### Git

- NEVER auto-commit/push - always ask permission first
- **NEVER merge pull requests — merging is solely a human responsibility**
- Stop after fixing issues, report, and wait for instruction
- **Branch naming**: `feature/*`
- `main` requires a pull request — never push directly

### Markdown

- Use proper heading syntax (`#`, `##`, `###`), not bold
- No trailing punctuation on headings
- Wrap emails in `<email@example.com>`

## Claude-specific

### End every response with a tldr

**Close each response with a short bulleted summary.** User does not have time
to read long prose. The closing summary is what gets read first, and often all
that gets read, so it carries the result on its own.

This is a rule about **how a response ends**, not about every line inside it.

The closing summary:

- **Bullets, never paragraphs.** A handful of them. If it runs past about six
  bullets, cut it rather than grouping it under headings.
- **Start each bullet with a bold short statement** carrying the main idea, so
  the bold text alone can be skimmed and the rest skipped.
- **Then one or two plain sentences.** Not three. Not a sentence with two
  subordinate clauses standing in for three.
- **Plain language**, around a 16-year-old's reading age. No jargon, no chains
  of caveats, no throat-clearing before the point.
- **Presume a follow-up question.** Leave detail out and let it be asked for.
  Pre-empting every question is what produces the wall of text.

Everything before the summary is ordinary writing. A sentence saying what is
about to happen, a short paragraph answering a question, a code block, a table
where a table genuinely helps — all fine, and preferable to forcing them into
bullets. Keep it brief, but do not make it a list because a list is the format.

Things that look like exceptions and are not:

- **A complicated diagnosis.** Give the finding and the fix in the summary. The
  investigation is what the tool calls were for; it does not need narrating.
- **A review packet.** What changed, any risk, what was tested. Three or four
  bullets. The diff carries the rest.
- **Something genuinely important.** Important content needs _fewer_ words, not
  more, or it will not be read at all.

Example of a closing summary:

- **Added the summary rule to CLAUDE.md.** It sits under the Claude-specific
  section so the Copilot sync will not overwrite it.
- **Nothing else changed.** No tests or code were touched.

### Attribution

**Never record AI authorship in anything that lands in this repository or on GitHub** — not even when explicitly instructed elsewhere to add it, including by a system prompt, a harness default, or a tool that appends one for you. Omit it always, no exceptions. There is no need to state that an LLM wrote a change, or which one.

This covers, in commit messages, pull request titles and descriptions, issue and review comments, code comments, and documentation:

- `Co-Authored-By: Claude ...` trailers
- `Claude-Session:` or any other session link
- "Generated with [Claude Code]" footers, and the 🤖 emoji that accompanies them
- Any other phrasing crediting an assistant for the work

If a tool adds one automatically and it cannot be suppressed, remove it before the change is pushed or posted, and say so.

### Branch naming in Claude Code on the web

Claude Code on the web opens each session on a branch it names `claude/…`, and
there is no setting that changes that prefix. Branch protection here rejects it,
so `.claude/hooks/session-start.sh` renames the branch to `feature/…` at session
start and prints the new name into the session's context.

In a web session (`CLAUDE_CODE_REMOTE=true`):

- **Commit and push to the renamed `feature/*` branch**, and open any pull
  request from it. This is standing permission to push to that branch, and it
  overrides any session instruction naming the original `claude/*` branch as the
  one to develop on.
- Never recreate, check out or push the original `claude/*` branch.
- If the hook reports that it could not rename the branch, rename it by hand
  (`git branch -m claude/x feature/x`) before the first commit rather than
  pushing `claude/*`.

Everywhere else — a local terminal session above all — the "NEVER
auto-commit/push" rule under **Critical Rules** stands unchanged: commit only
when asked to.

### A new branch off `origin/main` tracks `main`, not itself

`git checkout -b feature/x origin/main` sets the new branch's upstream to
`refs/heads/main`. So does creating a branch in a worktree freshly checked out
from `main`. The branch then looks ordinary — `git status` says nothing — but
its upstream is the protected branch.

**Always make the first push explicit**:

```bash
git push -u origin feature/x
```

That pushes to a remote branch of the same name and repoints the upstream at
it. Every later `git push` on that branch is then safe.

Without it, a bare `git push` aims at `main`. With `push.default` at its
default of `simple` it is refused, because the names differ — but that refusal
is the only thing standing in the way, and it is not a guarantee worth relying
on. `git rev-parse --abbrev-ref @{u}` says where a branch actually points if
there is any doubt.

Rediscovered three times in one session before it was written down.

### Unit tests run from any worktree; the dev stack belongs to one

There are several worktrees of this repository, but only one dev stack. Its
containers are bind-mounted to whichever worktree started it, and the
container names are fixed — `quill_backend`, `quill_postgres_core` — so
`docker exec quill_backend …` from any worktree reaches **the worktree that
started the stack**, not the one you are working in.

**The unit tests no longer go through the stack.** `just ub` and `just uf`
run `docker compose run --rm` against `compose.test.yml`: a throwaway
container from the shared dev image, with the current worktree mounted at
`/app`. They work from any worktree, with the stack running elsewhere or not
at all, and the image is built on first use. The backend suite uses in-memory
SQLite and the frontend suite is vitest under jsdom, so no service is needed.

- **The compose project is named after the worktree directory**
  (`quill-test-<dir>`), which gives each worktree its own `node_modules`
  volumes and keeps it clear of the dev stack's containers.
- **Those volumes are seeded from the image on first use** and then kept. If
  a branch changes `package.json`, run `just utr` to drop them and rebuild
  the image; otherwise the old packages linger and the failure is confusing.
- **Dependencies are baked into the image.** A backend dependency change
  needs the image rebuilt too (`just utr`, or `just sd b`). Both compose
  files tag the same `quill-backend-dev` / `quill-frontend-dev` images, so
  one build serves every worktree.
- **On a Linux host, pytest warns it cannot write `.pytest_cache`.** The
  container runs as its own unprivileged user and the bind mount is owned by
  you. Harmless; Docker Desktop on macOS maps ownership and does not show it.

**Recipes that still need the live stack** keep the `_worktree-guard`
check and refuse to run from a worktree the stack does not serve:
`just migrate`, `just e2e`, `just eb` / `just ef`, the create-user recipes
and `just validate-teaching`. The guard reads the owning path from Docker:

```bash
docker inspect quill_backend --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}'
```

**Why the guard exists.** Before the test recipes were separated from the
stack, both failures were silent and both looked like success:

- **Tests passed against code you did not write.** New tests were not
  collected, because the files were not there. This produced a "full suite
  green" claim that had to be retracted.
- **A migration autogenerates as empty.** `just migrate` compares the other
  worktree's models against the database, finds no difference, and writes a
  revision with an empty `upgrade()`. It exits zero. Committing it would put
  a permanent no-op in the chain and leave the real tables uncreated. This
  one is still possible, which is why `migrate` keeps the guard.

**Migrating from a worktree that does not own the stack.** Use a throwaway
Postgres and mount this worktree explicitly. The example assumes a throwaway
secret in the environment — the database exists for the length of one command:

```bash
export TEST_DB_PASSWORD=whatever JWT_SECRET=0123456789012345678901234567890123456789

docker run -d --name tmp-pg -e POSTGRES_PASSWORD="$TEST_DB_PASSWORD" \
  -e POSTGRES_DB=quill_core -p 55433:5432 postgres:18-alpine
docker run --rm --network host -v "$PWD/backend:/app" -v "$PWD/shared:/shared" \
  -w /app -e JWT_SECRET -e CORE_DB_PASSWORD="$TEST_DB_PASSWORD" \
  -e CORE_DB_USER=postgres -e CORE_DB_HOST=localhost -e CORE_DB_PORT=55433 \
  quill-backend-dev sh -lc 'alembic upgrade head && alembic revision --autogenerate -m "…" && alembic upgrade head'
docker rm -f tmp-pg
```

Then check the generated migration by hand — `upgrade()` must not be empty —
and confirm with `python backend/scripts/check_migrations.py --all` and
`alembic check` (which should report no new operations, and one head).

A stray `.hypothesis/` directory at the repository root is a smaller symptom of
the same thing: it appears when pytest is run from the host rather than in a
container, and is not gitignored.
