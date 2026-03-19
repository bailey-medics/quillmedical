# Copilot Instructions for Quill Medical

## Stack Overview

- **Backend**: FastAPI (Python 3.13), Poetry, PostgreSQL auth DB
- **Frontend**: React 19 + TypeScript + Vite + Mantine UI (Yarn 4, **never use npm**)
- **Healthcare**: HAPI FHIR (demographics), EHRbase (clinical letters)
- **Infrastructure**: Docker Compose, Caddy reverse proxy, GCS (public site)

## Key Commands

```bash
just start-dev      # Start (or 'just start-dev b' to rebuild)  [alias: sd]
just stop            # Stop all containers                       [alias: sc]
just migrate "msg"  # Database migration                        [alias: m]
just unit-tests-backend / just unit-tests-frontend               # [ub / uf]
just create-user    # Interactive user creation                  [alias: cu]
just storybook      # Start Storybook dev server                [alias: sb]
just enter-backend  # Shell into backend container              [alias: eb]
just enter-frontend # Shell into frontend container             [alias: ef]
just poetry-install # Lock and install Poetry deps              [alias: pi]
just yarn-install   # Install frontend deps in container        [alias: yi]
just docs           # Build and serve docs locally              [alias: d]
just pre-commit     # Run pre-commit hooks                      [alias: pc]
```

## Testing Requirements

- **ALWAYS create/update tests** when changing code
- Backend: pytest with fixtures from `conftest.py`
- Frontend: vitest + @testing-library/react with `renderWithMantine`/`renderWithRouter`
- Cover: props variations, edge cases, null/undefined, interactions, loading/error states
- Run tests before completing work

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
  - `DEP_GET_SESSION` — DB session (via `get_auth_db`)
  - `DEP_CURRENT_USER` — Authenticated user from JWT cookie
  - `DEP_REQUIRE_ROLES_CLINICIAN` — Clinician role gate
  - `DEP_REQUIRE_CSRF` — CSRF token validation (mutating endpoints)

### Frontend (React + TypeScript)

- **API**: Use `frontend/src/lib/api.ts` client (auto-retry on 401, never raw `fetch`)
- **Auth**: `AuthContext.tsx` provides `state`, `login`, `logout`, `reload`
- **Routing**: React Router v7 with `createBrowserRouter` in `src/main.tsx`
- **Protection**: `<RequireAuth>` for authenticated routes, `<GuestOnly>` for login/register, `<RequirePermission level="admin">` for admin routes (all in `src/auth/`)
- **Path aliases**: `@/*` → `src/*`, `@lib/*` → `src/lib/*`, `@components/*` → `src/components/*`, `@test/*` → `src/test/*`, `@domains/*` → `src/domains/*`
- **Styling**: Mantine 8.3 + CSS modules, no inline styles
- **Testing**: Use `renderWithMantine` or `renderWithRouter` from `@test/test-utils`
- **Storybook**: Components with `.stories.tsx` MUST have `.test.tsx`
- **Page Layout**: ALWAYS wrap page content in `<Container size="lg">` for consistent max-width (1140px)
  - Standard pattern: `<Container size="lg" py="xl"><Stack gap="lg">...</Stack></Container>`
  - Ensures consistent content width across all pages
  - Works correctly in Storybook for visual testing
  - Example: Messages, Settings, all Admin pages
- **Responsive**: ALWAYS use `theme.breakpoints.sm` for responsive behaviour
  - Import: `const theme = useMantineTheme();` from `@mantine/core`
  - Mobile/Desktop split: `useMediaQuery(\`(max-width: ${theme.breakpoints.sm})\`)`
  - Standard breakpoint: `sm = "48em"` (768px) - matches navigation drawer toggle
  - Use in all components that need responsive layout/sizing decisions

### Component reuse hierarchy (Storybook-first)

When building UI, follow this priority order:

1. **Reuse existing Storybook components** — always check the catalogue below first
2. **Compose new components from existing ones** — combine Storybook components together
3. **Build from scratch** — only when no existing component fits; create a new component with `.stories.tsx` and `.test.tsx`

All reusable UI must live in `frontend/src/components/` with Storybook stories. Pages consume components; pages do not contain reusable UI inline.

#### Storybook component catalogue

| Category | Component | Path |
|---|---|---|
| ActionCard | ActionCard | `components/action-card/` |
| Admin | Admin | `components/admin/` |
| Appointments | AppointmentsList | `components/appointments/` |
| Avatars | ProfilePic, StackedProfilePics | `components/profile-pic/` |
| Badge | ActiveStatus, PermissionBadge, UnreadBadge | `components/badge/` |
| Button | ActionCardButton, AddButton, BurgerButton, IconButton | `components/button/` |
| Data | Date, NationalNumber | `components/data/` |
| Demographics | Demographics | `components/demographics/` |
| Documents | Document, DocumentThumbnail, DocumentsList | `components/documents/` |
| Drawers | NavigationDrawer | `components/drawers/` |
| Footer | Footer | `components/footer/` |
| Gender | Gender, GenderIcon | `components/gender/` |
| Icons | Icon, NavIcon | `components/icons/` |
| Images | QuillLogo, QuillName | `components/images/` |
| Layouts | MainLayout, NotFoundLayout, Complete, Complete.PatientList | `components/layouts/` |
| Letters | LetterList, LetterView | `components/letters/` |
| Markdown | MarkdownView | `components/markdown/` |
| Messaging | Messaging, MessagesList, MessagingTriagePayment | `components/messaging/` |
| MultiStepForm | MultiStepForm | `components/multi-step-form/` |
| Navigation | SideNav, SideNavContent, NestedNavLink | `components/navigation/` |
| Notes | NotesList | `components/notes/` |
| Notifications | EnableNotificationsButton | `components/notifications/` |
| PageHeader | PageHeader | `components/page-header/` |
| Patients | PatientsList | `components/patients/` |
| Ribbon | TopRibbon | `components/ribbon/` |
| Search | SearchField | `components/search/` |
| StateMessages | StateMessage | `components/state-message/` |
| StatCards | StatCard | `components/stats-card/` |
| Tables | AdminTable | `components/tables/` |
| Warnings | DirtyFormNavigation | `components/warnings/` |

**Reference stories**: `Typography` and `PageLayoutConsistency` live in `src/stories/`.

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

#### Icons

All icons come from `@tabler/icons-react` and MUST be wrapped in the `<Icon>` component for consistent sizing. The allowed icon set is defined in `components/icons/appIcons.tsx` — when using a new Tabler icon anywhere in the app, register it there first. The Icon stories display this list automatically.

### Healthcare

- **FHIR**: `fhirclient` library (`backend/app/fhir_client.py`) for patient demographics
- **OpenEHR**: HTTP requests to EHRbase (`backend/app/ehrbase_client.py`) for clinical letters
- Each FHIR patient gets corresponding EHR in EHRbase via `subject_id` (idempotent `get_or_create_ehr` pattern)
- **Three-database architecture**: auth DB (users/roles/permissions), FHIR DB (demographics via HAPI), EHRbase DB (clinical documents)

### Authorisation

#### System permissions

4-level hierarchy: `patient < staff < admin < superadmin`

- Backend: `backend/app/system_permissions/` — `check_permission_level(user_permission, required)` for hierarchy checks
- Frontend: `<RequirePermission level="admin">` guard in `src/auth/RequirePermission.tsx`
- Admin gate pattern in routes: `if u.system_permissions not in ["admin", "superadmin"]: raise HTTPException(403)`

#### CBAC (competency-based access control)

Healthcare-specific authorisation layer for clinical operations.

- **Shared config**: `shared/competencies.yaml` (capability definitions with risk levels) and `shared/base-professions.yaml` (profession templates with base competencies)
- **Backend**: `backend/app/cbac/` — `has_competency("competency_id")` FastAPI dependency, resolves `base + additional - removed` competencies per user
- **Frontend**: Types at `src/types/cbac.ts`, hooks at `src/lib/cbac/hooks.ts` (`useHasCompetency`, `useHasAnyCompetency`, `useHasAllCompetencies`)
- **Generated JSON**: `src/generated/competencies.json` and `src/generated/base-professions.json` auto-generated from shared YAML (`yarn generate:types`)
- CBAC-protected route pattern: `Depends(has_competency("prescribe_controlled_schedule_2"))`

#### Organisations

- Backend model `Organization` in `models.py` with staff/patient membership via association tables
- API endpoints under `/api/organizations` (admin/superadmin only)
- Admin pages at `pages/admin/organisations/`

### Web Push notifications

- Backend: `push.py` (subscription management), `push_send.py` (notification sending) — VAPID keys via `just vapid-key`
- Frontend: `EnableNotificationsButton` component in `components/notifications/`

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
- Authentication on all endpoints, authorisation checks, rate limiting

#### Healthcare-Specific

- Never log/display PHI in errors or debug output
- Validate clinical data strictly, ensure OpenEHR/FHIR compliance
- Audit all clinical modifications (who, what, when)
- Version clinical documents, never update in place

## Quick Patterns

**New API endpoint**: Route in `backend/app/main.py` under `@router`, Pydantic schemas in `backend/app/schemas/`, then `just docs`

**CBAC-protected endpoint**: Add `Depends(has_competency("competency_id"))` to route params — raises 403 if user lacks competency

**Admin-only endpoint**: Check `if u.system_permissions not in ["admin", "superadmin"]: raise HTTPException(403)` in route body

**Frontend API**: Use `api` from `@/lib/api.ts` (never raw `fetch`)

**Database models**: Define in `backend/app/models.py`, then `just migrate "description"`

**New component**: Create in `frontend/src/components/<name>/`, add `Component.stories.tsx` and `Component.test.tsx`, update catalogue above

## Key Files

- `backend/app/main.py`: FastAPI routes and dependency constants
- `backend/app/models.py`: SQLAlchemy models (User, Role, Organization, PatientMetadata)
- `backend/app/security.py`: JWT, CSRF, TOTP, Argon2 password utilities
- `backend/app/config.py`: Pydantic Settings (DB URLs, JWT config, FHIR/EHRbase URLs)
- `backend/app/db/`: Database session management (`get_auth_db` / legacy `get_session`)
- `backend/app/cbac/`: Competency-based access control module
- `backend/app/system_permissions/`: 4-level permission hierarchy
- `backend/app/schemas/`: Pydantic request/response models (`auth.py`, `cbac.py`, `letters.py`)
- `frontend/src/main.tsx`: Router config with `createBrowserRouter` and all route definitions
- `frontend/src/auth/`: AuthContext, RequireAuth, GuestOnly, RequirePermission
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
- Enforce RBAC + CBAC at DB and application level
- Use `SecretStr` for secrets, never commit `.env` files

### Git

- NEVER auto-commit/push - always ask permission first
- Stop after fixing issues, report, and wait for instruction

### Markdown

- Use proper heading syntax (`#`, `##`, `###`), not bold
- No trailing punctuation on headings
- Wrap emails in `<email@example.com>`

````
