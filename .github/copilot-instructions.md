# Copilot Instructions for Quill Medical

## Stack Overview

- **Backend**: FastAPI (Python 3.13), Poetry, PostgreSQL core DB
- **Frontend**: React 19 + TypeScript + Vite + Mantine UI (Yarn 4, **never use npm**)
- **Healthcare**: HAPI FHIR (demographics) and EHRbase (all other clinical data)
- **Infrastructure**: Docker Compose, GCP Cloud Run + Global HTTPS Load Balancer (prod), Caddy (dev proxy + prod static serving), GCS (public site)

## Key Commands

- **Use the `just` recipes first and foremost.** Each one is the tested,
  worktree-safe way to do its job: it knows which container to run in, what to
  mount, which ports and env to use, and it cleans up after itself. A raw
  `docker exec`, `pytest`, `yarn` or `alembic` command improvised in its place
  loses all of that and is how tests came to run against the wrong worktree.
- `just --list` shows every recipe with its alias and a one-line description.
- If no recipe does what you need, say so rather than improvising; the fix is
  usually to add one, following the conventions in `.claude/rules/just.md`.

See the `Justfile` if you want to know more.

## Testing Requirements

- **ALWAYS create/update tests** when changing code
- **ALWAYS run backend and frontend unit tests inside Docker containers** — never run them directly on the host
  - Backend: `just ub` (all unit tests) or `just ub -k "test_name"` (targeted)
  - Frontend: `just uf` (all unit tests) or `just uf src/path/to/file.test.tsx` (targeted)
  - Both run in a throwaway container from `compose.unit-tests.yml` that mounts the current worktree, so they work from any worktree and do not need the dev stack running
- **Test tiers — test what you touched locally; CI tests everything.** Each tier is wider and slower than the one before, and each only adds what the previous one cannot see:
  - **Local, while developing**: only the tests for the code being changed (`just ub -k "..."`, `just uf src/path/to/file.test.tsx`). Seconds, run as often as useful.
  - **Pre-commit, automatic**: lint, format, typecheck and spelling on the staged files, via the husky and pre-commit hooks.
  - **CI fast tier**: the full backend and frontend unit suites plus Storybook build, on every push. The merge queue re-runs them against current `main` before anything lands.
  - **CI heavy tier**: Storybook interaction tests, Semgrep and E2E, once the PR leaves draft.
- **Do not run the full unit suite locally before committing or pushing** (`just ub` or `just uf` with no filter). It duplicates the fast tier and costs minutes per push. The only times it is justified:
  - CI is red and you are iterating on the fix — each CI round trip is then slower than a local run
  - a rebase onto `main` hit conflicts
  - the change touches a shared module with wide blast radius: `models.py`, `conftest.py`, `api.ts`, `shared/` YAML and its generated types, a dependency bump
- **Never claim a suite passed that was not run.** Name the exact commands that were run; "tests pass" on its own is not a report
- Storybook: runs on the host — `just sb` (dev server), `just sbt` (tests), `just sbtci` (CI mode)
- E2E: `just e2e` brings up a fresh per-worktree `compose.ci.yml` stack (the CI one) on a free port, runs Playwright against it and tears it down — never the dev stack
- **Never run Storybook tests and `just e2e` at the same time** — both saturate the machine, and the Storybook runner then times out loading its own pages and reports mass failures that pass on their own
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
  two-deploy pattern — see `backend.instructions.md`

### Frontend (React + TypeScript)

- **API**: Use `api.ts` client for all backend calls (auto-retry on 401, CSRF, credentials) — never raw `fetch` (sole exception: `checkHealth()` in `ConnectivityContext.tsx`)
- **Auth**: `AuthContext.tsx` provides `state`, `login`, `logout`, `reload`
- **Routing**: React Router v7 with `createBrowserRouter` in `src/main.tsx`
- **Protection**: `<RequireAuth>` for authenticated routes, `<GuestOnly>` for login/register, `<RequireOperator>` for Quill-operator routes, `<RequireCompetency competency="manage_users">` for CBAC-gated routes, `<RequireClinical>` for FHIR/EHRbase-dependent routes, `<RequireFeature feature="teaching">` for feature-gated routes (all in `src/auth/`). All default to a 404 rather than a 403, hiding a route from somebody who may not use it.
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
</VariantStack>
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
- **Three-database architecture**: core DB (users/competencies/org units/teaching and other non-patient facing features), FHIR DB (demographics via HAPI), EHRbase DB (clinical documents)

### Authorisation

Three layers control access, and they answer different questions:

- **Platform role** — *may this person operate Quill itself?* One value,
  `superadmin`, and its absence. True everywhere or nowhere.
- **Competencies (CBAC)** — *what is this person qualified to do at all?*
  A set resolved per user. This is the ceiling.
- **Practising competencies** — *where may they do it?* One row per person,
  place and competency.

What somebody may actually do at a place is the **intersection** of the last
two. Healthcare draws the same line as credentialing versus privileging:
what you are qualified for, then what you are authorised to do here.

#### Platform role

`User.platform_role` is `superadmin` or absent — operating the deployment, not
administering any organisation. Its one consumer sends a test push to every
subscribed client, which no organisation bounds.

- Backend: `require_operator` / `DEP_REQUIRE_OPERATOR` in `backend/app/deps.py`
- Frontend: `<RequireOperator>` in `src/auth/RequireOperator.tsx`
- Vocabulary: `PLATFORM_ROLES` in `models.py`, validated by
  `validate_platform_role` rather than a database enum, so it grows without a
  migration

**This replaced a four-rung `system_permissions` hierarchy**
(`single-user < staff < admin < superadmin`). Three of those rungs described a
person at a *place* and moved to membership and competencies; by the end only
`superadmin` was ever passed. There is no `backend/app/system_permissions/`
module, no `check_permission_level`, no `RequirePermission` guard and no
`default_system_permission` on a base profession. See
`docs/docs/plans/2026-09-09-platform-role-plan.md`.

**Administering a place is not this question** — that is the `manage_users`
competency.

#### CBAC (competency-based access control)

Controls all data access and actions, clinical and feature admin alike.
Resolution per user: `(base_profession_competencies + additional) − removed`,
via `resolve_user_competencies` behind `User.get_final_competencies`.

- **Catalogue**: `shared/competency-definitions/` — `clinical.yaml`,
  `clinical-admin.yaml`, `admin.yaml`, `oncology.yaml`, `teaching.yaml`,
  `passport.yaml`. All merged into one catalogue at load, so **ids must be
  unique across the directory**, not just within a file. Which file an entry
  lives in carries no meaning to the code; it is for the reader.
- **Professions**: `shared/base-professions.yaml` — `id`, `display_name`,
  `description`, `requires_clinical_services`, `base_competencies`
- **Backend**: `backend/app/cbac/` — `has_competency("competency_id")` from
  `app.deps` as a FastAPI dependency
- **Frontend**: types at `src/types/cbac.ts`, hooks at `src/lib/cbac/hooks.ts`
  (`useHasCompetency`, `useHasAnyCompetency`, `useHasAllCompetencies`), guard
  `<RequireCompetency competency="manage_users">`
- **Generated JSON**: `src/generated/` from the shared YAML via
  `yarn generate:types`
- Route pattern: `Depends(has_competency("prescribe_controlled_schedule_2"))`

**`has_competency` checks the ceiling only, never the place.** Endpoints that
need *where* scope separately on membership. A route guard has no place to
scope to, so it gates on the competency alone and lets the API refuse
anything out of scope.

**`manage_users` is the root competency — grant it rarely.** Because
`update_user` writes `additional_competencies` wholesale with no check on
which ids are granted, a holder can mint any competency in the catalogue,
including `manage_users` itself. That is accepted rather than overlooked; the
reasoning is in `admin.yaml`.

#### Practising competencies — where

`backend/app/cbac/scoped.py` over the `practising_competency` table. Every
read of a place goes through this module.

- `competencies_at(db, user, org_unit_id=...)` — what they may practise there,
  narrowed to their ceiling
- `can_practise_at(db, user, competency, org_unit_id=...)` — the single check
- `who_can_practise_at(db, competency, org_unit_id=...)` — the other direction.
  It deliberately does **not** apply ceilings, because that would mean loading
  every user; it is a candidate list, so check `can_practise_at` before acting
  on a name from it.

- **A row means authorised. There is no boolean** — absence is the
  unauthorised state, so practice cannot be withdrawn without removing the row
  that says who authorised it.
- **Nothing is inherited.** A row at an organisation says nothing about its
  wards, and one at a ward says nothing about its organisation. So a ward
  manager can administer their ward without trust-wide authority, and "why
  could this person do that?" is answered by one row rather than by replaying
  a hierarchy.
- **A row beyond somebody's ceiling has no effect**, so a lapsed
  qualification narrows every place at once without a row being touched — and
  a ceiling with no row behind it authorises nothing.

#### Org units — one tree for every place

`OrgUnit` in `models.py` is one node of the governance tree: a trust, a site,
a ward. There is no separate `Organisation` or `Site` model, and no
`organisation_site` or `site_staff_member` table.

**An org unit's `type` is the only thing that says what it is — never its
position in the tree.** An organisation is a node whose type says
"organisation", not a node that happens to have no parent.

- **Type vocabulary**: `shared/org-unit-types.yaml`, validated in code by
  `validate_org_unit_type` rather than a database enum so it grows without a
  migration. Read via `type_can_hold_features`, `type_can_hold_positions`,
  `type_can_hold_competencies` in `backend/app/org_units/types.py`.
- **Capability flags, not hardcoded name lists.** Each type declares
  `requires_parent`, `can_hold_features`, `can_hold_positions`,
  `can_hold_competencies` and `can_have_members`. Rules ask "can this type
  hold positions?" instead of each carrying its own list of type names.
  Nobody is clinical lead of room four.
- **Membership**: `org_unit_member` and `org_unit_patient_member`, with a
  capacity from `MEMBER_CAPACITIES` (`staff`, `trainee`, `external`,
  `patient`). A capacity is never a ranking and never a permission check — it
  says only how somebody comes to be at a place.
- **Reach flows downward**, and is distinct from membership: organisation
  membership reaches the organisation and its sites, site membership reaches
  the organisations that site is linked to. `get_member_org_unit_ids` versus
  `get_reachable_org_unit_ids` in `backend/app/organisations.py`.
- **API**: `/api/org-units` (`backend/app/org_units/router.py`)
- **Admin pages**: `pages/admin/organisations/`, `pages/admin/sites/`
- See `docs/docs/plans/2026-09-11-site-tree-unification-plan.md`.

#### Positions

A position is a slot a place has, in `models.py` as `Position` and
`PositionHolding`, managed by `backend/app/cbac/positions.py`.

- **It exists whether or not anyone fills it**, which separates it from a
  competency: "this site has no clinical lead" is a state worth chasing,
  where a competency nobody holds is simply absent.
- **Holding is dated rows, not a column**, so the post outlives its holders
  and its history stays queryable — "who was Caldicott Guardian in March?"
- **Appointment checks `can_practise_at`**: holding a competency somewhere is
  not enough, it must be authorised where the post is. A post with no place
  fails closed.
- **Acting cover does not fill a vacancy** and does not count against
  `max_holders`, because covering leave must not be blocked by the person
  being covered for.
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

**Operator-only endpoint**: Add `DEP_REQUIRE_OPERATOR` to the route params — gates on `platform_role`, for operating Quill itself

**Place-administration endpoint**: Add `Depends(has_competency("manage_users"))`, then scope to the caller's own org units in the route body — the competency says *what*, membership says *where*

**Frontend API**: Use `api` from `@/lib/api.ts` (never raw `fetch`)

**Database models**: Define in `backend/app/models.py`, then `just migrate "description"`

**New base profession**: Add entry to `shared/base-professions.yaml` with `id`, `display_name`, `description`, `requires_clinical_services` and `base_competencies` (the model forbids extra fields, so nothing else). Then run `yarn generate:types` in `frontend/`.

## Key Files

- `backend/app/main.py`: FastAPI routes and dependency constants
- `backend/app/models.py`: SQLAlchemy models (User, OrgUnit, PractisingCompetency, Position, teaching)
- `backend/app/security.py`: JWT, CSRF, TOTP, Argon2 password utilities
- `backend/app/config.py`: Pydantic Settings (DB URLs, JWT config, FHIR/EHRbase URLs)
- `backend/app/db/`: Database session management (`get_core_db`)
- `backend/app/cbac/`: Competency-based access control module
- `backend/app/org_units/`: the place tree — router, and type capability flags
- `backend/app/cbac/scoped.py`: what somebody may practise at one place
- `backend/app/schemas/`: Pydantic request/response models (`auth.py`, `cbac.py`)
- `frontend/src/main.tsx`: Router config with `createBrowserRouter` and all route definitions
- `frontend/src/auth/`: AuthContext, RequireAuth, GuestOnly, RequireOperator, RequireCompetency, RequireClinical, RequireFeature
- `frontend/src/lib/api.ts`: API client (auto-retry 401, CSRF, credential cookies)
- `frontend/src/types/cbac.ts`: CBAC type definitions
- `frontend/src/RootLayout.tsx`: Root layout with patient context provider
- `frontend/src/domains/patient.ts`: Patient type and helpers
- `frontend/src/generated/`: Auto-generated JSON from shared YAML
- `shared/`: YAML config files (base-professions, competencies, jurisdiction-config)
- `compose.dev.yml`: Docker stack config (8 services)
- `Justfile`: Dev commands (use `just --list` for all)

## Critical Rules

### Database storage

- **Ask a human before storing anything non-relationally.** A `JSON` or
  `JSONB` column, an array column or a delimited string needs an explicit
  decision from a person before it is written, not a note in a pull
  request. Propose it, say what it would hold and why a table does not
  fit, and wait.
- The test is whether anything needs to point at what is inside. A
  document read back whole is genuinely a document; a list of references
  to other entities is a relationship, and wants a table with a foreign
  key. See `.claude/rules/backend.md` for what a JSON column costs.

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
