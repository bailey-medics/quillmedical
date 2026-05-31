# CBAC frontend implementation plan

Wire competency-based access control into the frontend so UI elements (action cards, pages, buttons) can be shown/hidden based on the authenticated user's resolved competencies.

## Current state

- **Backend**: `User.get_final_competencies()` resolves `base + additional - removed` competencies per user. CBAC dependencies (`has_competency(...)`) protect API endpoints.
- **Frontend hooks**: `useHasCompetency`, `useHasAnyCompetency`, `useHasAllCompetencies` exist in `src/lib/cbac/hooks.ts` but are **stubs returning `false`**.
- **`/auth/me` response**: Does NOT include competencies.
- **`User` type** (`AuthContext.tsx`): No `competencies` field.
- **Result**: Frontend cannot gate UI on competencies — the teaching modules action card uses `isSuperadmin` as a workaround.

## Implementation steps

### - [x] Step 1: Backend — include competencies in `/auth/me`

**File**: `backend/app/main.py` (the `me()` endpoint)

Add `"competencies": u.get_final_competencies()` to the response dict. No new endpoint needed.

### - [x] Step 2: Frontend — add `competencies` to User type

**File**: `frontend/src/auth/AuthContext.tsx`

```ts
export type User = {
  // ...existing fields...
  /** Resolved CBAC competencies for this user */
  competencies?: string[];
};
```

No changes to `AuthContext` logic — `competencies` will be populated automatically from the `/auth/me` response since `reload()` spreads the response into state.

### - [x] Step 3: Frontend — implement CBAC hooks

**File**: `frontend/src/lib/cbac/hooks.ts`

Replace stubs with actual checks against `state.user.competencies`:

```ts
export function useHasCompetency(competency: CompetencyId): boolean {
  const { state } = useAuth();
  if (state.status !== "authenticated") return false;
  return state.user.competencies?.includes(competency) ?? false;
}

export function useHasAnyCompetency(...competencies: CompetencyId[]): boolean {
  const { state } = useAuth();
  if (state.status !== "authenticated") return false;
  const userComps = state.user.competencies ?? [];
  return competencies.some((c) => userComps.includes(c));
}

export function useHasAllCompetencies(...competencies: CompetencyId[]): boolean {
  const { state } = useAuth();
  if (state.status !== "authenticated") return false;
  const userComps = state.user.competencies ?? [];
  return competencies.every((c) => userComps.includes(c));
}
```

### - [x] Step 4: Frontend — gate teaching modules UI on CBAC

**File**: `frontend/src/pages/admin/teaching/AdminTeachingDashboard.tsx`

Replace `isSuperadmin` check with:

```ts
const canManageTeaching = useHasCompetency("manage_teaching_content");
```

Only show the Modules action card when `canManageTeaching` is true.

**File**: `frontend/src/main.tsx`

Optionally add a `<RequireCompetency>` guard around the teaching modules routes — or rely on the backend 403 as the authoritative check and treat the frontend as progressive disclosure only.

## Testing

- [x] **Backend**: Add test in `tests/test_auth.py` verifying `/auth/me` returns `competencies` list
- [x] **Frontend**: Update CBAC hook tests to verify they return correct values based on mocked user state
- [x] **AdminTeachingDashboard**: Test that Modules card is hidden when user lacks `manage_teaching_content`

## Notes

- Frontend CBAC is **progressive disclosure only** — the backend remains the authoritative enforcement layer
- No new API endpoints needed — piggybacks on existing `/auth/me`
- `competencies` is a flat string array; no hierarchy or risk-level metadata needed on the frontend
- The `CompetencyId` type in `src/types/cbac.ts` already defines valid IDs (generated from `shared/competencies.yaml`)
