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

| Page                 | Alert                           | Replacement                                     |
| -------------------- | ------------------------------- | ----------------------------------------------- |
| EditOrganisationPage | "Organisation updated" (green)  | `ResultMessage variant="success"`               |
| AddPatientToOrgPage  | "Patient added" (green)         | `ResultMessage variant="success"`               |
| TeachingOrgSettings  | "Saved" (green, inline)         | `ResultMessage variant="success"` (move inline) |

**Leave as-is** — inline contextual alerts that don't map to existing components:

- Form validation errors shown inline above forms (~15 instances)
- Info/warning banners within content areas (orange "Warning", primary "Confirmation")
- Full-page load errors (StateMessage's fixed title "Error loading data" is less specific than e.g. "Error loading organisation")

**Future work**: Consider creating an inline `AlertMessage` component that wraps `<Alert>` with consistent icon sizing and styling. This is out of scope for this PR.

#### 1c. Raw `<Table>` → DataTable (7 instances)

**Replaced** — display-only and row-click tables:

| Page                | Status    |
| ------------------- | --------- |
| ViewAllUsersPage    | Replaced  |
| ViewAllPatientsPage | Replaced  |

**Deferred** — tables with per-row action buttons (edit, deactivate, activate). `DataTable` wraps cell content in `BodyTextInline` and uses `onRowClick` for the whole row. Per-row action buttons conflict with this pattern. These need a design decision about whether to use row-click navigation or keep inline action buttons.

| Page                  | Issue                              |
| --------------------- | ---------------------------------- |
| EditUserPage          | IconButton action column           |
| DeactivateUserPage    | Red "Deactivate" button column     |
| DeactivatePatientPage | Red "Deactivate" button column     |
| ActivatePatientPage   | Green "Activate" button column     |
| EditPatientPage       | IconButton action column           |

#### 1d. Raw `<Text>` / `<Title>` → typography components (~20 instances)

| Page             | File                                        | Notes                                                 |
| ---------------- | ------------------------------------------- | ----------------------------------------------------- |
| PatientAdminPage | `pages/admin/patients/PatientAdminPage.tsx` | Heaviest offender (~15 instances)                     |
| MessageThread    | `pages/messaging/MessageThread.tsx`         | `<Text fw={600} size="lg">` → BodyTextBold or Heading |

#### 1e. Raw `<Paper>` → BaseCard (6 instances)

| Page                   | File                                                   |
| ---------------------- | ------------------------------------------------------ |
| PatientAdminPage       | `pages/admin/patients/PatientAdminPage.tsx`            |
| CreateOrganisationPage | `pages/admin/organisations/CreateOrganisationPage.tsx` |
| AddStaffToOrgPage      | `pages/admin/organisations/AddStaffToOrgPage.tsx`      |
| AdminBankDetailPage    | `pages/admin/bank/AdminBankDetailPage.tsx`             |

#### 1f. Raw `<TextInput>` / `<Select>` → TextField / SelectField (4 instances)

| Page                   | File                                                   |
| ---------------------- | ------------------------------------------------------ |
| CreateOrganisationPage | `pages/admin/organisations/CreateOrganisationPage.tsx` |
| AddStaffToOrgPage      | `pages/admin/organisations/AddStaffToOrgPage.tsx`      |

### Phase 2 — Centralise icon imports (~16 pages)

Pages import directly from `@tabler/icons-react` instead of from `@/components/icons/appIcons`. Register any missing icons in `appIcons.tsx` and update imports across all admin pages.

### Phase 3 — Replace hardcoded colours with design tokens

#### 3a. Component TSX files

| Component              | Hardcoded values                | Suggested replacement                                 |
| ---------------------- | ------------------------------- | ----------------------------------------------------- |
| DataTable              | `#143f6b`, `#0a2f56`            | Theme primary scale shades via CSS variables          |
| MessagingTriagePayment | `#e6e6e6`, `#eee`               | Grey scale CSS variables                              |
| BurgerButton           | `#1e2d4a`                       | Primary scale CSS variable                            |
| SolidSwitch            | `#000d1f`, `#143f6b`            | Primary scale CSS variables                           |
| ProfilePic             | `#FFFFFF`, `#000000`, `#333333` | Mantine colour tokens (`white`, `dark.8`, grey scale) |
| Home                   | `color: "red"`                  | Mantine `color="red"` or `var(--error-color)`         |

#### 3b. Component `rgba`/shadow values

| Component           | Value                                             | Notes                                      |
| ------------------- | ------------------------------------------------- | ------------------------------------------ |
| BaseCard            | `rgba(0,0,0,0.25)`                                | Dark mode shadow — may be acceptable as-is |
| DirtyFormNavigation | `rgba(0, 0, 0, 0.1)`                              | Modal border                               |
| TopRibbon           | `rgba(255,255,255,0.1)`, `rgba(255,255,255,0.25)` | Mantine CSS var overrides                  |
| ExamCloseButton     | `rgba(0, 0, 0, 0.1)`                              | Modal content border                       |

These alpha-blended values are harder to tokenise. Consider whether they need changing.

#### 3c. Public component CSS modules

| File                            | Values                                              |
| ------------------------------- | --------------------------------------------------- |
| PublicInfoCard.module.css       | `rgb(200 150 62 / 20%)`                             |
| PublicHeroBackground.module.css | `rgb(200 150 62 / 7%)`, `rgb(30 58 95 / 60%)`, etc. |
| PublicFooter.module.css         | `rgb(255 255 255 / 10%)`                            |
| PublicFeatureCard.module.css    | `rgb(200 150 62 / 20%)`                             |
| PublicButton.module.css         | `rgb(200 150 62 / 10%)`, `rgb(200 150 62 / 20%)`    |

These are brand-specific amber/navy overlays on the public marketing site. Lower priority — could be extracted to CSS custom properties if the public site palette changes.

### Phase 4 — Add missing DarkMode stories

14 non-public components need a DarkMode story added. Follow the existing pattern: render inside `BaseCard` + outside for comparison with `MantineProvider` `forceColorScheme="dark"`.

| Category    | Components                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Badges (8)  | ActiveStatusBadge, AppointmentStatusBadge, AssessmentResultBadge, LetterStatusBadge, NoteCategoryBadge, OnQuillBadge, PermissionBadge, UnreadBadge |
| Data (3)    | Date, Gender, NationalNumber                                                                                                                       |
| Buttons (2) | BurgerButton, SearchButton                                                                                                                         |
| Ribbon (1)  | TopRibbon                                                                                                                                          |
| Search (1)  | SearchFields                                                                                                                                       |

The ~20 `Public*` components (backgrounds, footer, feature card, info card, nav icons, text, title, layout, ribbon, button, burger) are always rendered on their own dark backgrounds and do not need separate dark mode stories.

## Out of scope

- Public marketing site redesign (separate effort)
- New component creation beyond what's needed for replacements
- Backend changes
