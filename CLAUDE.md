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
  two-deploy pattern — see `.claude/rules/backend.md`

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
- **Three-database architecture**: core DB (users/competencies/org units/teaching and other non-patient facing features), FHIR DB (demographics via HAPI), EHRbase DB (clinical documents)

### Authorisation

Three layers control access, and they answer different questions:

- **Platform role** — _may this person operate Quill itself?_ One value,
  `superadmin`, and its absence. True everywhere or nowhere.
- **Competencies (CBAC)** — _what is this person qualified to do at all?_
  A set resolved per user. This is the ceiling.
- **Practising competencies** — _where may they do it?_ One row per person,
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
person at a _place_ and moved to membership and competencies; by the end only
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
need _where_ scope separately on membership. A route guard has no place to
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

**Place-administration endpoint**: Add `Depends(has_competency("manage_users"))`, then scope to the caller's own org units in the route body — the competency says _what_, membership says _where_

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

## Claude-specific

### End every response with a tldr

**Close each response with a short bulleted summary.** User does not have time
to read long prose. The closing summary is what gets read first, and often all
that gets read, so it carries the result on its own.

This is a rule about **how a response ends**, not about every line inside it.

#### This rule outranks any output style

**It applies in every output style, including Concise, and it is never
suspended.** An output style is a harness setting; this is a project
instruction, and where the two disagree this one wins. That holds even when the
style asserts its own precedence — Concise says "these rules win where they
conflict with more general communication or formatting guidance elsewhere",
and this rule is not the general guidance it is talking about.

**In particular, the TL;DR is not a "closing recap" and is not "narration".**
Concise bans restating what you already said, and rightly. The TL;DR is not
that: it is the summary the user reads *first*, and often instead of the prose
above it. Dropping it removes the part that gets read and keeps the part that
does not, which is precisely backwards.

Under Concise, keep the prose above the summary shorter — the summary itself
stays. If you ever find yourself reasoning that some other instruction excuses
you from writing one, that reasoning is wrong: write the TL;DR.

The closing summary:

- **Opens with a level two heading reading `## TL;DR`.** Nothing else goes on
  that line, and the bullets follow directly beneath it.
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

```markdown
## TL;DR

- **Added the summary rule to CLAUDE.md.** It sits under the Claude-specific
  section so the Copilot sync will not overwrite it.
- **Nothing else changed.** No tests or code were touched.
```

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

### A stopped Docker daemon is not a reason to skip the tests

Every test recipe here runs in a container, so on a machine where Docker
Desktop is not running they all fail the same way, before a single test is
collected:

```text
Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
Is the docker daemon running?
```

That is a stopped daemon, not a broken test run — and not a reason to report
back that the Docker tests were left out. **Start the daemon, then run them.**

```bash
just dds    # docker-daemon-start: opens Docker Desktop, waits until
            # `docker system info` answers, prints "Docker is running."
```

Then re-run whichever recipe failed — `just ub -k "…"`, `just uf
src/path/to/file.test.tsx`, `just e2e`, `just migrate "…"` — and
report its real result.

- **Do this without asking first.** Starting the daemon changes nothing in
  the repository and nothing outside the machine. It is setup for a command
  already agreed, not a new decision.
- **`just sd`, `just st` and `just ts` already do it themselves**, via the
  private `_start-docker-daemon` recipe (same check, with a 60s timeout and a
  clear message when the host is not macOS). The unit-test, E2E and migration
  recipes do not, which is why this rule exists.
- **`just dds` only knows how to drive Docker Desktop on macOS.** On any
  other host it will not help: say the daemon is down and what it needs,
  rather than quietly dropping the tests.
- **It waits indefinitely** for the daemon to answer, so a `just dds` still
  running after a minute or two means Docker Desktop itself is stuck. Stop
  waiting and report that.
- **Never substitute a host-level run** — a bare `pytest`, `yarn
  unit-test:run` or `npx playwright` — because the daemon was down. The
  container is what makes the run correct; see the section below.

**Never report a suite as passing that Docker refused to run**, and never let
a daemon failure stand in for a test result. Either the suite ran, and the
command and its outcome are named, or it did not run and that is said plainly.

### Tests run from any worktree; the dev stack belongs to one

There are several worktrees of this repository, but only one dev stack. Its
containers are bind-mounted to whichever worktree started it, and the
container names are fixed — `quill_backend`, `quill_postgres_core` — so
`docker exec quill_backend …` from any worktree reaches **the worktree that
started the stack**, not the one you are working in.

**The unit tests no longer go through the stack.** `just ub` and `just uf`
run `docker compose run --rm` against `compose.unit-tests.yml`: a throwaway
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
- **Never run `pre-commit install`.** Git runs the tracked `.husky/pre-commit`
  through the relative `core.hooksPath` set by `just initialise-repo`, which
  resolves per worktree. pre-commit refuses to install alongside it anyway.

**End-to-end tests have their own per-worktree stack.** `just e2e` (and
`e2e-ui`, `e2e-report`) brings up `compose.ci.yml`, the same file, images and
seed script the CI job uses, as a compose project named `quill-e2e-<dir>` on
a free port Docker picks, runs the migrations and `seed_ci.py`, runs
Playwright with `E2E_BASE_URL` pointing at it, and tears the stack down
afterwards, pass or fail. It does not touch the dev stack or its database, so
a local run rehearses CI and several worktrees can run it at once. The cost
is a production build of both images on first run; later runs hit the cache
unless the sources changed.

**Migrations use a throwaway database.** `just migrate "message"` brings up
a Postgres on tmpfs from `compose.migrate.yml` as project `quill-migrate-<dir>`,
upgrades it to head from this worktree's migrations, autogenerates against
this worktree's models, applies the result, and drops the database. It never
touches the dev stack's database, so it is correct from any worktree. If the
generated `upgrade()` is empty it fails and says so, because an empty
revision means the models already match the migrations, not that the
recipe worked.

**Recipes that still need the live stack** keep the `_worktree-guard`
check and refuse to run from a worktree the stack does not serve:
`just eb` / `just ef`, the create-user recipes and `just validate-teaching`.
The guard reads the owning path from Docker:

```bash
docker inspect quill_backend --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}'
```

**Why the guard exists.** Before the test recipes were separated from the
stack, both failures were silent and both looked like success:

- **Tests passed against code you did not write.** New tests were not
  collected, because the files were not there. This produced a "full suite
  green" claim that had to be retracted.
- **A migration autogenerated as empty.** `just migrate` compared the other
  worktree's models against the database, found no difference, and wrote a
  revision with an empty `upgrade()`. It exited zero. Committing it would put
  a permanent no-op in the chain and leave the real tables uncreated. The
  recipe now uses its own database and refuses an empty result.

After `just migrate`, read the generated `upgrade()` and `downgrade()` before
committing; the pre-commit hook runs `check_migrations.py` over it as well.

A stray `.hypothesis/` directory at the repository root is a smaller symptom of
the same thing: it appears when pytest is run from the host rather than in a
container, and is not gitignored.

### One commit per stacked branch: amend, never add

A stacked branch carries exactly one commit, and that commit is the unit
being reviewed. So when a change is made on a branch that is part of a
stack, it is folded into the commit already there — never added as a second
one.

**Use `just stack-update` (`just stu`)**, not `git commit`. It amends the
branch's commit with whatever is in the working tree, then rebases every
branch above it, because amending rewrites the commit those branches sit on.
Both halves are the same operation: a plain `git commit` leaves the branches
above stranded on a commit that no longer exists, and does it silently.

- `just stu` on its own keeps the existing message.
- `just stu "new message"` rewords it at the same time.
- It stages everything, untracked files included, exactly as `stack-new` and
  `stack-add` do.

**Check whether the branch is in a stack before committing.** `just stl`
draws the stack, or says "No stack on this branch"; `python3
scripts/stack-status.py --check` answers the same question by exit code, 0
in a stack and 1 outside one. On an ordinary branch the "NEVER
auto-commit/push" rule under **Critical Rules** applies unchanged.

A branch that accumulates "fix: typo" on top of its real change is how a
two-unit stack became four branches on the first real run of this tooling.
