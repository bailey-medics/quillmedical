# Colour-to-design-system update

## Goal

Eliminate all Mantine built-in colour names (`red`, `green`, `blue`, `teal`, `cyan`, `violet`, `pink`, `orange`, `yellow`, `dark`) from the codebase and replace with design-system named colours defined in `theme.ts`.

## Current state

- `theme.ts` exports `primaryScale`, `secondaryScale`, `greyScale`, `brandColours`, `publicColours`
- `semanticColours.ts` maps status names to Mantine built-in colours (e.g. `success.bg = "teal"`, `alert.bg = "red"`)
- 52 instances across 25 files use raw Mantine colour names directly
- `--error-color: #f55142` already exists as a CSS variable in both light/dark modes

## Phase 1: define status colours in theme.ts

Add a new exported `statusColourValues` object to `theme.ts` containing the single hex value for each status colour:

```ts
export const statusColourValues = {
  success: "#12b886", // Teal — active, completed, pass (Mantine teal.6)
  warning: "#15aabf", // Cyan — draft, pending (Mantine cyan.6)
  outstanding: "#e64980", // Pink — deactivated, cancelled, fail (Mantine pink.6)
  info: "#228be6", // Blue — upcoming, informational (Mantine blue.6)
  neutral: "#ffd43b", // Yellow — staff, default (Mantine yellow.4)
  accent: "#7950f2", // Violet — incomplete, special states (Mantine violet.6)
  alert: "#fa5252", // Red — no-show, patient, attention (Mantine red.6)
} as const;
```

Register these as CSS variables in `cssVariablesResolver` (in the shared `variables` section so they work in both light and dark modes):

```ts
variables: {
  // ...existing variables
  "--success-color": statusColourValues.success,
  "--warning-color": statusColourValues.warning,
  "--alert-color": statusColourValues.alert,
  "--info-color": statusColourValues.info,
  "--neutral-color": statusColourValues.neutral,
  "--accent-color": statusColourValues.accent,
  "--outstanding-color": statusColourValues.outstanding,
},
```

Keep `--error-color` (#f55142) as a separate token for form validation borders (accessibility-tuned). `--alert-color` (#fa5252) is for status badges, destructive buttons, and notifications.

## Phase 2: update semanticColours.ts

Import `statusColourValues` from `theme.ts` and replace Mantine built-in names:

```ts
import { statusColourValues } from "@/theme";

export const statusColours: Record<StatusColourName, StatusColourConfig> = {
  success: {
    bg: "var(--success-color)",
    text: "white",
    usage: "Active, completed, final, pass",
  },
  warning: {
    bg: "var(--warning-color)",
    text: "white",
    usage: "Draft, pending",
  },
  outstanding: {
    bg: "var(--outstanding-color)",
    text: "white",
    usage: "Deactivated, cancelled, fail",
  },
  info: {
    bg: "var(--info-color)",
    text: "white",
    usage: "Upcoming, amended, admin, unread",
  },
  neutral: {
    bg: "var(--neutral-color)",
    text: "dark",
    usage: "Staff, default",
  },
  accent: {
    bg: "var(--accent-color)",
    text: "white",
    usage: "Incomplete, special states",
  },
  alert: {
    bg: "var(--alert-color)",
    text: "white",
    usage: "No-show, patient, attention needed",
  },
};
```

## Phase 3: fix all non-design-system colour instances

### 3a: Error/destructive (37 instances of `color="red"`)

**Replace with:** `color="var(--alert-color)"` or import `statusColourValues.alert`

Files to update:

- `ErrorBoundary.tsx` — `c="red.6"` → `c="var(--alert-color)"`
- `ButtonPairRed.tsx` — `color="red"` → `color="var(--alert-color)"`
- `ExamCloseButton.tsx` — `color="red"` → `color="var(--alert-color)"`
- `MessagingTriagePayment.tsx` (line 291) — `color="red"` → `color="var(--alert-color)"`
- `NewPatientPage.tsx` — `color="red"` → `color="var(--alert-color)"`
- `NewUserPage.tsx` (lines 344, 669) — `color="red"` → `color="var(--alert-color)"`
- `Messages.tsx` — `color: "red"` → `color: "var(--alert-color)"`
- `PatientMessages.tsx` — `color: "red"` → `color: "var(--alert-color)"`
- `ViewAllUsersPage.tsx` — `color="red"` → `color="var(--alert-color)"`
- `EditUserPage.tsx` — `color="red"` → `color="var(--alert-color)"`
- `DeactivateUserPage.tsx` (2 instances) — `color="red"` → `color="var(--alert-color)"`
- `UserAdminPage.tsx` (line 185) — `color="red"` → `color="var(--alert-color)"`
- `TeachingOrgSettingsPage.tsx` (2 instances) — `color="red"` → `color="var(--alert-color)"`
- `EditOrganisationPage.tsx` (2 instances) — `color="red"` → `color="var(--alert-color)"`
- `AddPatientToOrgPage.tsx` — `color="red"` → `color="var(--alert-color)"`
- `OrgFeaturesPage.tsx` (line 193) — `color="red"` → `color="var(--alert-color)"`
- `OrganisationAdminPage.tsx` (2 instances) — `color="red"` → `color="var(--alert-color)"`
- `CreateOrganisationPage.tsx` — `color="red"` → `color="var(--alert-color)"`
- `AddStaffToOrgPage.tsx` — `color="red"` → `color="var(--alert-color)"`
- `DeactivatePatientPage.tsx` (lines 148, 170, 246, 277) — `color="red"` / `color: "red"` → `color="var(--alert-color)"`
- `ActivatePatientPage.tsx` (lines 155, 175, 254) — `color="red"` / `color: "red"` → `color="var(--alert-color)"`
- `EditPatientPage.tsx` (2 instances) — `color="red"` → `color="var(--alert-color)"`
- `PatientAdminPage.tsx` (line 263, 319 deactivated case) — `color="red"` → `color="var(--alert-color)"`
- `ViewAllPatientsPage.tsx` — `color="red"` → `color="var(--alert-color)"`

### 3b: Success (7 instances of `color="green"`)

**Replace with:** `color="var(--success-color)"` or import `statusColourValues.success`

- `TeachingOrgSettingsPage.tsx` (line 156) — success Alert
- `DeactivatePatientPage.tsx` (line 134) — success notification
- `ActivatePatientPage.tsx` (lines 141, 289) — success notification, activate button
- `PatientAdminPage.tsx` (lines 300, 319 active case) — "Linked" badge, active badge
- `UserAdminPage.tsx` (line 170) — additional competencies badge → use `color="var(--success-color)"`

### 3c: Warning (3 instances of `color="orange"` or `color="yellow"`)

**Replace with:** `color="var(--warning-color)"`

- `MessagingTriagePayment.tsx` (line 304) — `color="yellow"` → `color="var(--warning-color)"`
- `OrgFeaturesPage.tsx` (line 264) — `color="orange"` → `color="var(--warning-color)"`
- `DeactivatePatientPage.tsx` (line 180) — `color="orange"` → `color="var(--warning-color)"`

### 3d: Info (1 instance of `color="teal"`)

**Replace with:** `color="var(--info-color)"` (or `--success-color` depending on intent)

- `UserAdminPage.tsx` (line 170) — additional competencies badge → `color="var(--success-color)"`

### 3e: CSS variable violations (4 instances)

**MarkdownView.module.css:**

- `var(--mantine-color-blue-6)` → `var(--info-color)` (link colour)

**IconTextButton.module.css:**

- `var(--mantine-color-dark-5)` → `var(--mantine-color-gray-6)` (disabled bg)
- `var(--mantine-color-dark-4)` → `var(--mantine-color-gray-5)` (disabled border)
- `var(--mantine-color-dark-0)` → `var(--mantine-color-gray-0)` (disabled text)

### 3f: EllipsisMenu passthrough

- `EllipsisMenu.tsx` accepts `item.color` — consumers pass `"red"` for destructive items
- Update the `EllipsisMenuItem` interface to document that it should use CSS variable values
- Update consumers to pass `"var(--alert-color)"` instead of `"red"`

## Phase 4: validation

1. Run `grep -r '"red"\|"green"\|"blue"\|"teal"\|"cyan"\|"violet"\|"pink"\|"orange"\|"yellow"' frontend/src/ --include="*.tsx" --include="*.css"` — should return zero results (excluding theme.ts, semanticColours.ts, tests, stories)
2. Run Storybook build: `docker exec quill_frontend sh -lc "yarn storybook:build"`
3. Run frontend tests: `docker exec quill_frontend sh -lc "yarn unit-test:run"`
4. Visual check of badge colours, alert colours, and button colours in Storybook

## Phase 5: update components.instructions.md

Add rule:

> Never use Mantine built-in colour names (`red`, `green`, `blue`, `teal`, etc.) directly. Use CSS variables from the design system: `var(--alert-color)`, `var(--success-color)`, `var(--warning-color)`, `var(--info-color)`.

## Execution order

1. Phase 1 (theme.ts) — no breaking changes, adds new exports
2. Phase 2 (semanticColours.ts) — updates references, badges update automatically
3. Phase 3a–3f (bulk find-and-replace) — one file at a time or batched
4. Phase 4 (validation)
5. Phase 5 (documentation)

## Notes

- Mantine's `color` prop accepts any valid CSS colour value including `var(--x)`, so no scale registration is needed
- `--error-color` (#f55142) stays for form validation; `--alert-color` (#fa5252) is for status/destructive UI. Different hex values, different semantic purposes
- Dark mode: status colours are identical in both modes — they're used as filled backgrounds with white/dark text, so no per-mode overrides needed
- Accessibility: all status colours should maintain WCAG AA contrast (4.5:1) against white text
