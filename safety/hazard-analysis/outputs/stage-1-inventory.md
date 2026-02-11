# Stage 1 - code inventory

## Tier 1 — direct clinical data

| File                                                            | Purpose                                                                            | Key Dependencies                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| `frontend/src/components/demographics/Demographics.tsx`         | Displays compact patient demographics (name, age, gender, DOB, NHS number)         | Patient type, FHIR data         |
| `frontend/src/components/demographics/DemographicsDetailed.tsx` | Displays detailed patient demographics with avatar and all demographic fields      | Patient type, ProfilePic        |
| `frontend/src/components/demographics/NationalNumber.tsx`       | Displays and formats national health identifiers (NHS number, Medicare, etc.)      | FHIR identifier system          |
| `frontend/src/domains/patient.ts`                               | Defines Patient type mapping from FHIR R4 Patient resource                         | FHIR R4 structures              |
| `frontend/src/pages/Patient.tsx`                                | Displays individual patient detail page with demographics and clinical sections    | FHIR Patient, api client        |
| `frontend/src/pages/Home.tsx`                                   | Lists all patients from FHIR server with demographics                              | FHIR Patient bundle, api client |
| `frontend/src/components/patients/PatientsList.tsx`             | Renders patient list cards with demographics                                       | Patient type                    |
| `frontend/src/components/letters/LetterView.tsx`                | Displays clinical letter content                                                   | Markdown rendering              |
| `frontend/src/components/letters/Letters.tsx`                   | Lists clinical letters for patient                                                 | Letter data structures          |
| `frontend/src/lib/fhir-patient.ts`                              | Extracts avatar gradient index from FHIR Patient extensions                        | FHIR Patient extension          |
| `backend/app/fhir_client.py`                                    | FHIR R4 client for patient demographics (list, read, create, update)               | fhirclient, HAPI FHIR server    |
| `backend/app/ehrbase_client.py`                                 | OpenEHR client for clinical letters (create, list, retrieve compositions)          | EHRbase server, httpx           |
| `backend/app/main.py`                                           | FastAPI routes for patients and letters (GET/POST/PUT /api/patients, /api/letters) | FHIR client, EHRbase client     |
| `backend/app/patient_records.py`                                | Patient record management functions                                                | FHIR client                     |
| `backend/app/schemas/letters.py`                                | Pydantic schemas for letter creation and retrieval                                 | Pydantic BaseModel              |
| `backend/app/utils/colors.py`                                   | Avatar gradient color generation for patient identification                        | Color calculations              |

## Tier 2 — clinical workflow

| File                                                    | Purpose                                                         | Key Dependencies               |
| ------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| `frontend/src/auth/AuthContext.tsx`                     | Provides authentication state and user session management       | api client, JWT tokens         |
| `frontend/src/auth/RequireAuth.tsx`                     | Route guard requiring authentication for clinical pages         | AuthContext                    |
| `frontend/src/auth/GuestOnly.tsx`                       | Route guard redirecting authenticated users from login/register | AuthContext                    |
| `frontend/src/RootLayout.tsx`                           | Main application layout with patient context in top ribbon      | Patient context, routing       |
| `frontend/src/components/navigation/SideNav.tsx`        | Main navigation sidebar for clinical workflows                  | Routing links                  |
| `frontend/src/components/navigation/SideNavContent.tsx` | Navigation menu content and links                               | Navigation configuration       |
| `frontend/src/components/drawers/NavigationDrawer.tsx`  | Mobile navigation drawer                                        | SideNavContent                 |
| `frontend/src/components/ribbon/TopRibbon.tsx`          | Top banner displaying current patient context                   | Patient demographics           |
| `frontend/src/pages/Settings.tsx`                       | User account settings including TOTP 2FA management             | api client, QR codes           |
| `frontend/src/pages/TotpSetup.tsx`                      | Two-factor authentication setup workflow                        | api client, QR code generation |
| `frontend/src/pages/LoginPage.tsx`                      | User authentication page with TOTP support                      | api client, AuthContext        |
| `frontend/src/pages/RegisterPage.tsx`                   | New user registration page                                      | api client                     |
| `frontend/src/App.tsx`                                  | React Router configuration for all clinical and auth routes     | React Router                   |
| `backend/app/security.py`                               | JWT token generation, TOTP verification, password hashing       | pyotp, passlib, jose           |
| `backend/app/models.py`                                 | SQLAlchemy User and Role models for RBAC                        | SQLAlchemy                     |
| `backend/app/main.py`                                   | Authentication routes (/api/auth/login, /logout, /totp, etc.)   | security module                |

## Tier 3 — infrastructure

| File                               | Purpose                                                       | Key Dependencies    |
| ---------------------------------- | ------------------------------------------------------------- | ------------------- |
| `frontend/src/lib/api.ts`          | Axios-based API client with automatic token refresh           | axios, AuthContext  |
| `frontend/src/lib/urlUpdate.ts`    | URL parameter and query string manipulation utilities         | React Router        |
| `frontend/src/main.tsx`            | React application entry point with Mantine provider           | React, Mantine      |
| `frontend/src/test/test-utils.tsx` | Testing utilities with Mantine wrapper                        | vitest, Mantine     |
| `frontend/src/test/setup.ts`       | Vitest test environment setup                                 | vitest              |
| `backend/app/config.py`            | Pydantic settings for environment configuration               | pydantic-settings   |
| `backend/app/db/auth_db.py`        | SQLAlchemy database session management                        | SQLAlchemy engine   |
| `backend/app/push.py`              | Web Push subscription data structures                         | Pydantic            |
| `backend/app/push_send.py`         | Web Push notification sending via pywebpush                   | pywebpush, VAPID    |
| `backend/app/main.py`              | Push notification endpoints (/api/push/subscribe, /send-test) | pywebpush           |
| `backend/alembic/env.py`           | Alembic migration environment configuration                   | Alembic             |
| `backend/alembic/versions/*.py`    | Database migration scripts (9 migrations)                     | Alembic, SQLAlchemy |
| `backend/tests/conftest.py`        | Pytest fixtures for testing                                   | pytest              |
| `public/sw.js`                     | Service Worker for PWA and push notifications                 | Service Worker API  |
| `vite.config.ts`                   | Vite build configuration with SWC                             | Vite                |
| `vitest.config.ts`                 | Vitest test configuration                                     | Vitest              |

## Tier 4 — non-clinical

| File                                                                  | Purpose                                          |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| `frontend/src/App.css`                                                | Global application styles                        |
| `frontend/src/index.css`                                              | Root CSS reset and base styles                   |
| `frontend/src/components/profile-pic/gradients.ts`                    | Avatar gradient color definitions (30 gradients) |
| `frontend/src/components/profile-pic/ProfilePic.tsx`                  | Avatar component with gradient backgrounds       |
| `frontend/src/components/gender/Gender.tsx`                           | Gender display component with icon               |
| `frontend/src/components/gender/GenderIcon.tsx`                       | Gender-specific icon component                   |
| `frontend/src/components/gender/Gender.types.ts`                      | TypeScript types for gender                      |
| `frontend/src/components/date/Date.tsx`                               | Date formatting component                        |
| `frontend/src/components/markdown/MarkdownView.tsx`                   | Markdown rendering component                     |
| `frontend/src/components/icons/NavIcon.tsx`                           | Navigation icon wrapper component                |
| `frontend/src/components/search/SearchFields.tsx`                     | Search input component                           |
| `frontend/src/components/images/QuillLogo.tsx`                        | Quill application logo component                 |
| `frontend/src/components/images/QuillName.tsx`                        | Quill application name/wordmark                  |
| `frontend/src/components/images/Image.tsx`                            | Generic image wrapper component                  |
| `frontend/src/components/layouts/MainLayout.tsx`                      | Page layout wrapper                              |
| `frontend/src/components/layouts/NotFoundLayout.tsx`                  | 404 page layout                                  |
| `frontend/src/components/notifications/EnableNotificationsButton.tsx` | Push notification permission button              |
| `frontend/src/components/messaging/Messaging.tsx`                     | Messaging UI placeholder component               |
| `frontend/src/components/messaging/MessagesList.tsx`                  | Message list placeholder component               |
| `frontend/src/components/messaging/MessagingTriagePayment.tsx`        | Payment triage placeholder component             |
| `frontend/src/pages/Messages.tsx`                                     | Messages page placeholder                        |
| `frontend/src/pages/About.tsx`                                        | About page                                       |
| `frontend/src/pages/NotFound.tsx`                                     | 404 error page                                   |
| `frontend/src/vite-env.d.ts`                                          | Vite environment type declarations               |
| `frontend/src/types/qrcode.d.ts`                                      | QR code library type declarations                |
| `frontend/src/demo-data/patients/demoPatients.ts`                     | Demo patient data for Storybook                  |
| `frontend/src/demo-data/messaging/demoMessages.ts`                    | Demo message data for Storybook                  |
| `frontend/src/demo-data/letters/demoLetters.ts`                       | Demo letter data for Storybook                   |
| `frontend/src/demo-data/letters/demoSingleLetter.ts`                  | Single letter demo data for Storybook            |
| `frontend/src/components/**/*.stories.tsx`                            | Storybook stories for all components (30+ files) |
| `frontend/src/components/**/*.test.tsx`                               | Component unit tests (25+ files)                 |
| `backend/tests/test_*.py`                                             | Backend unit and integration tests (15 files)    |
| `backend/scripts/*.py`                                                | Development and admin scripts (7 files)          |
| `compose.dev.yml`                                                     | Docker Compose development configuration         |
| `Justfile`                                                            | Development command shortcuts                    |
| `package.json`                                                        | Frontend dependencies and scripts                |
| `backend/pyproject.toml`                                              | Backend dependencies via Poetry                  |
| `README.md`                                                           | Project documentation                            |
| `.github/workflows/*`                                                 | CI/CD GitHub Actions                             |
| `docs/**/*`                                                           | MkDocs documentation site                        |
| `caddy/dev/Caddyfile`                                                 | Caddy reverse proxy configuration                |
| `frontend/eslint.config.js`                                           | ESLint configuration                             |
| `frontend/tsconfig*.json`                                             | TypeScript configuration files                   |
| `backend/alembic.ini`                                                 | Alembic migration configuration                  |
| `cspell.config.json`                                                  | Spell checker configuration                      |
| `REFACTORING_SUMMARY.md`                                              | Development notes                                |
| `LICENSE`                                                             | Software license                                 |
