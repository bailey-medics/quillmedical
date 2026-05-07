# Design system update plan

Status: In progress (PR #243 `feature/updating-storybook-components`)

## What's been done

- Extended grey scale from 5 to 8 entries (shades 0–7)
- Dark mode CSS variable hierarchy: body (shade 8), cards (shade 7), input bg (shade 6), input border (shade 9)
- Form field description styling via global CSS override (Mantine `styles` prop doesn't work for descriptions)
- WithDescription + DarkMode stories on all 5 form field components and SolidSwitch
- EllipsisMenu component with stories and tests; integrated into OrganisationAdminPage
- Menu item global font-size/weight override
- Competency display names on UserAdminPage
- Disabled IconTextButton light/dark mode fix
- MultiStepForm stories with real form fields
- All tests passing (frontend + backend), Storybook build passing

## What remains

### Phase 1 — Replace raw Mantine components on pages

These pages use raw Mantine primitives instead of design system components. Each task is a self-contained unit of work.

#### 1a. Raw `<Button>` → ButtonPair / ButtonPairRed (~25 instances)

Most admin pages have hand-rolled Cancel + Submit button pairs. Replace with `ButtonPair` or `ButtonPairRed` (for destructive actions).

| Page                    | File                                                    |
| ----------------------- | ------------------------------------------------------- |
| ChangePassword          | `pages/settings/ChangePassword.tsx`                     |
| NewUserPage             | `pages/admin/users/NewUserPage.tsx`                     |
| NewPatientPage          | `pages/admin/patients/NewPatientPage.tsx`               |
| DeactivateUserPage      | `pages/admin/users/DeactivateUserPage.tsx`              |
| EditOrganisationPage    | `pages/admin/organisations/EditOrganisationPage.tsx`    |
| AddPatientToOrgPage     | `pages/admin/organisations/AddPatientToOrgPage.tsx`     |
| AddStaffToOrgPage       | `pages/admin/organisations/AddStaffToOrgPage.tsx`       |
| CreateOrganisationPage  | `pages/admin/organisations/CreateOrganisationPage.tsx`  |
| OrgFeaturesPage         | `pages/admin/organisations/OrgFeaturesPage.tsx`         |
| OrganisationAdminPage   | `pages/admin/organisations/OrganisationAdminPage.tsx`   |
| TeachingOrgSettingsPage | `pages/admin/organisations/TeachingOrgSettingsPage.tsx` |
| AdminPermissionsPage    | `pages/admin/users/AdminPermissionsPage.tsx`            |
| DeactivatePatientPage   | `pages/admin/patients/DeactivatePatientPage.tsx`        |
| ActivatePatientPage     | `pages/admin/patients/ActivatePatientPage.tsx`          |

#### 1b. Raw `<Alert>` → ResultMessage / StateMessage (~32 instances)

Most raw `<Alert>` usages are **inline contextual alerts** within forms and content areas. `ResultMessage` and `StateMessage` are **full-width coloured cards** designed for page-level states — they don't map to inline alerts.

**Replace** — full-page success redirects with `ResultMessage`:

| Page                 | Alert                          | Replacement                                     |
| -------------------- | ------------------------------ | ----------------------------------------------- |
| EditOrganisationPage | "Organisation updated" (green) | `ResultMessage variant="success"`               |
| AddPatientToOrgPage  | "Patient added" (green)        | `ResultMessage variant="success"`               |
| TeachingOrgSettings  | "Saved" (green, inline)        | `ResultMessage variant="success"` (move inline) |

**Leave as-is** — inline contextual alerts that don't map to existing components:

- Form validation errors shown inline above forms (~15 instances)
- Info/warning banners within content areas (orange "Warning", primary "Confirmation")
- Full-page load errors (StateMessage's fixed title "Error loading data" is less specific than e.g. "Error loading organisation")

**Future work**: Consider creating an inline `AlertMessage` component that wraps `<Alert>` with consistent icon sizing and styling. This is out of scope for this PR.

#### 1c. Raw `<Table>` → DataTable (7 instances)

**Replaced** — display-only and row-click tables:

| Page                | Status   |
| ------------------- | -------- |
| ViewAllUsersPage    | Replaced |
| ViewAllPatientsPage | Replaced |

**Deferred** — tables with per-row action buttons (edit, deactivate, activate). `DataTable` wraps cell content in `BodyTextInline` and uses `onRowClick` for the whole row. Per-row action buttons conflict with this pattern. These need a design decision about whether to use row-click navigation or keep inline action buttons.

| Page                  | Issue                          |
| --------------------- | ------------------------------ |
| EditUserPage          | IconButton action column       |
| DeactivateUserPage    | Red "Deactivate" button column |
| DeactivatePatientPage | Red "Deactivate" button column |
| ActivatePatientPage   | Green "Activate" button column |
| EditPatientPage       | IconButton action column       |

#### 1d. Raw `<Text>` / `<Title>` → typography components

**Replaced:**

| Page             | Changes                                                             |
| ---------------- | ------------------------------------------------------------------- |
| PatientAdminPage | 12× Text → BodyText/BodyTextBold/BodyTextInline, 3× Title → Heading |

**Not applicable:** MessageThread does not exist as a page — messaging UI is in `components/messaging/`.

#### 1e. Raw `<Paper>` → BaseCard

**Replaced:**

| Page                   | Status                           |
| ---------------------- | -------------------------------- |
| PatientAdminPage       | 2× Paper → BaseCard (done in 1d) |
| CreateOrganisationPage | Paper → BaseCard                 |
| AddStaffToOrgPage      | Paper → BaseCard                 |

**Left as-is:** AdminBankDetailPage uses Paper as inner highlight panels within BaseCard (not a card replacement).

#### 1f. Raw `<TextInput>` / `<Select>` → TextField / SelectField

**Replaced:**

| Page                   | Changes                                           |
| ---------------------- | ------------------------------------------------- |
| CreateOrganisationPage | 2× TextInput → TextField, 1× Select → SelectField |
| AddStaffToOrgPage      | 1× Select → SelectField                           |

### Phase 2 — Centralise icon imports (20 pages) ✅

All 20 pages in `src/pages/` that imported directly from `@tabler/icons-react` have been updated to import from `@components/icons/appIcons`. All 14 unique icons were already registered — no new registrations needed.

### Phase 3 — Replace hardcoded colours with design tokens

#### 3a. Component TSX files ✅

| Component              | Old values                      | Replacement                                                                               |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| DataTable              | `#143f6b`, `#0a2f56`            | `var(--mantine-color-primary-5)`, `var(--mantine-color-primary-6)`                        |
| MessagingTriagePayment | `#e6e6e6`, `#eee`               | `var(--mantine-color-default-border)`                                                     |
| BurgerButton           | `#1e2d4a`                       | `colours.darkBlueHover` (from publicColours)                                              |
| SolidSwitch            | `#000d1f`, `#143f6b`            | `var(--mantine-color-primary-9)`, `var(--mantine-color-primary-5)`                        |
| ProfilePic             | `#FFFFFF`, `#000000`, `#333333` | `var(--mantine-color-white)`, `var(--mantine-color-black)`, `var(--mantine-color-dark-6)` |
| Home                   | `color: "red"`                  | `var(--mantine-color-red-6)`                                                              |

#### 3b. Component `rgba`/shadow values — left as-is ✅

Alpha-blended `rgba()` values in BaseCard, DirtyFormNavigation, TopRibbon, and ExamCloseButton are intentional transparency overlays that work correctly in both light and dark modes by design. Not tokenised.

#### 3c. Public component CSS modules — left as-is ✅

Brand-specific amber/navy overlays on the public marketing site. These are intentional design choices for the public site's visual identity. Out of scope for this phase.

### Phase 4 — Add missing DarkMode stories ✅

Added `DarkMode` story to 15 components using the `{ ...BaseStory, globals: { colorScheme: "dark" } }` pattern:

| Category    | Components                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Badges (8)  | ActiveStatusBadge, AppointmentStatusBadge, AssessmentResultBadge, LetterStatusBadge, NoteCategoryBadge, OnQuillBadge, PermissionBadge, UnreadBadge |
| Data (3)    | Date, Gender, NationalNumber                                                                                                                       |
| Buttons (2) | BurgerButton, SearchButton                                                                                                                         |
| Ribbon (1)  | TopRibbon                                                                                                                                          |
| Search (1)  | SearchFields                                                                                                                                       |

The ~20 `Public*` components are always rendered on their own dark backgrounds and do not need separate dark mode stories.

## Out of scope

- Public marketing site redesign (separate effort)
- New component creation beyond what's needed for replacements
- Backend changes
