# Page messages centralisation plan

## Goal

Replace the current mix of `PageFlash` + manual `FormStatus` (with local `useState`) with a single `PageMessage` system rendered from a context provider in `MainLayout`. Form-internal `<FormStatus />` (context mode) is unaffected.

## Current architecture

- **React Router**: `react-router-dom ^7.9.1`
- **RootLayout** → `<SearchProvider>` → `<NavigationBlocker>` → `<MainLayout>` → `<ErrorBoundary>` → `<Outlet>`
- **MainLayout** renders `children` inside a `<Box>` between header and `<Footer>`
- **FormStatus** uses `<BaseCard>` with `bg` from `statusColours` (CSS variables in `semanticColours.ts`)
- **PageFlash** reads `location.state.flash`, captures it in local state, clears from history, renders `<FormStatus>` manually

## Existing usage patterns

### Pattern A — FormStatus inside `<Form>` context (no change needed)

| Page                                                   | Notes                                        |
| ------------------------------------------------------ | -------------------------------------------- |
| `pages/ChangePassword.tsx`                             | Inside Form                                  |
| `pages/RegisterPage.tsx`                               | Inside Form                                  |
| `pages/TotpSetup.tsx`                                  | Inside Form                                  |
| `pages/admin/organisations/AddSiteToOrgPage.tsx`       | Inside Form, navigates with flash on success |
| `pages/admin/organisations/AddStaffToOrgPage.tsx`      | Inside Form                                  |
| `pages/admin/organisations/CreateOrganisationPage.tsx` | Inside Form, navigates with flash on success |
| `pages/admin/organisations/EditOrganisationPage.tsx`   | Inside Form                                  |
| `pages/admin/organisations/OrgFeaturesPage.tsx`        | Inside Form                                  |
| `pages/admin/sites/AddStaffToSitePage.tsx`             | Inside Form, navigates with flash on success |
| `pages/admin/sites/EditSitePage.tsx`                   | Inside Form                                  |
| `pages/admin/teaching/AdminBankOrgSettingsPage.tsx`    | Inside Form                                  |

### Pattern B — PageFlash consumer (reads router navigation state)

| Page                                                   | Notes                                                 |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `pages/admin/organisations/AdminOrganisationsPage.tsx` | PageFlash + inline manual FormStatus for delete       |
| `pages/admin/organisations/OrganisationAdminPage.tsx`  | PageFlash + inline manual FormStatus for site removal |
| `pages/admin/sites/SiteAdminPage.tsx`                  | PageFlash only                                        |

### Pattern C — Flash senders (navigate with `state.flash`)

| Page                                                   | Payload                                        |
| ------------------------------------------------------ | ---------------------------------------------- |
| `pages/admin/organisations/CreateOrganisationPage.tsx` | `{ variant: "success", title, description }`   |
| `pages/admin/organisations/AddSiteToOrgPage.tsx`       | `{ variant: "success", title, description }`   |
| `pages/admin/sites/AddStaffToSitePage.tsx`             | `{ title }` (no variant — defaults to success) |

### Pattern D — Manual FormStatus with local state

| Page                     | State variable               | Usage                           |
| ------------------------ | ---------------------------- | ------------------------------- |
| `AdminOrganisationsPage` | `flash` / `setFlash`         | Delete org success/error        |
| `OrganisationAdminPage`  | `siteFlash` / `setSiteFlash` | Remove site/staff success/error |

## Proposed design

### Type

```typescript
export type PageMessageVariant = "success" | "partial_success" | "error";

export interface PageMessage {
  id: string; // crypto.randomUUID() for deduplication
  variant: PageMessageVariant;
  title: string;
  description?: ReactNode;
}
```

### Hook: `usePageMessage()`

```typescript
interface UsePageMessage {
  messages: PageMessage[];
  showMessage: (msg: Omit<PageMessage, "id">) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}
```

### Provider placement (RootLayout)

```tsx
<PageMessageProvider>
  <PageMessageDisplay />   {/* renders all messages above children */}
  <Outlet ... />
</PageMessageProvider>
```

### Rendering (PageMessageDisplay)

- Renders a `<Stack>` of `<FormStatus variant={...} title={...} onDismiss={...} />` for each message
- Ordering: FIFO (newest at bottom)
- Each message is individually dismissible (FormStatus already supports `onDismiss`)

### Auto-clear on navigation

Provider listens to `useLocation()` and calls `clearAll()` on pathname change — flash messages survive exactly one page view.

### Flash state compatibility

Provider reads `location.state.flash` (same shape as current PageFlash) and auto-promotes it into the message list, then clears from history state — Pattern C senders need no changes.

## Migration map

| Current pattern                              | Action                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| **Pattern A** (FormStatus inside Form)       | No change                                                                        |
| **Pattern B** (PageFlash consumer)           | Remove `<PageFlash />` — provider handles it automatically                       |
| **Pattern C** (flash sender via navigate)    | No change — provider reads `location.state.flash`                                |
| **Pattern D** (manual useState + FormStatus) | Replace with `usePageMessage().showMessage(...)` in handlers; remove local state |

### Specific file changes

| File                         | Remove                                                                                        | Add                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `AdminOrganisationsPage.tsx` | `PageFlash`, `FormStatus` import, `flash`/`setFlash` state, manual `<FormStatus>` JSX         | `usePageMessage()` → `showMessage(...)` in delete handler |
| `OrganisationAdminPage.tsx`  | `PageFlash`, `FormStatus` import, `siteFlash`/`setSiteFlash` state, manual `<FormStatus>` JSX | `usePageMessage()` → `showMessage(...)` in remove handler |
| `SiteAdminPage.tsx`          | `PageFlash` import + `<PageFlash />` JSX                                                      | Nothing (provider handles it)                             |
| `AddSiteToOrgPage.tsx`       | Nothing                                                                                       | Nothing (flash sender, compatible)                        |
| `CreateOrganisationPage.tsx` | Nothing                                                                                       | Nothing (flash sender, compatible)                        |
| `AddStaffToSitePage.tsx`     | Nothing                                                                                       | Nothing (flash sender, compatible)                        |

## New files to create

| Path                                                  | Purpose               |
| ----------------------------------------------------- | --------------------- |
| `src/components/page-message/PageMessageContext.tsx`  | Provider + hook       |
| `src/components/page-message/PageMessageDisplay.tsx`  | Renders message stack |
| `src/components/page-message/index.ts`                | Barrel export         |
| `src/components/page-message/PageMessage.test.tsx`    | Unit tests            |
| `src/components/page-message/PageMessage.stories.tsx` | Storybook stories     |

## Decided

- **Ordering**: FIFO (newest at bottom)
- **Dedupe**: None — add if needed later
- **Auto-dismiss**: Never — user must dismiss manually (clinical safety: messages must not disappear before acknowledged)
- **Placement**: Above page content in MainLayout (before `{children}`) — fully centralised, no per-page rendering needed
- **Docs**: Yes — update `Form.mdx` pattern table to reference PageMessage for patterns 3/4

## Implementation steps

- [x] Create `src/components/page-message/PageMessageContext.tsx` — provider, context, `usePageMessage` hook
- [x] Create `src/components/page-message/PageMessageDisplay.tsx` — renders message stack using `FormStatus`
- [x] Create `src/components/page-message/index.ts` — barrel exports
- [x] Add `PageMessageProvider` + `PageMessageDisplay` to `MainLayout.tsx` (above `{children}`)
- [x] Add flash-state ingestion to provider (read `location.state.flash`, promote to message, clear history state)
- [x] Create `PageMessage.test.tsx` — unit tests for provider, hook, display, flash ingestion, nav clear
- [x] Create `PageMessage.stories.tsx` — Storybook stories showing variants
- [x] Migrate `AdminOrganisationsPage.tsx` — replace `PageFlash` + manual `FormStatus` + local state with `usePageMessage`
- [x] Migrate `OrganisationAdminPage.tsx` — replace `PageFlash` + manual `FormStatus` + local state with `usePageMessage`
- [x] Migrate `SiteAdminPage.tsx` — remove `<PageFlash />` (provider handles it)
- [x] Update `Form.mdx` pattern table — reference `PageMessage` for patterns 3/4
- [x] Delete `src/components/page-flash/` (once no consumers remain)
- [x] Run tests and Storybook build
