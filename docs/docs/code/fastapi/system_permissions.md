# System Permissions

## Module Init

::: app.system_permissions

## Permissions

::: app.system_permissions.permissions

`require_admin()` and `require_superadmin()` live in `app.deps` — see
[Dependencies](deps.md). `require_staff()` was deleted: nothing called it, and
what it was checking is a per-place question rather than a rung on a ladder.
See `docs/docs/plans/2026-09-09-platform-role-plan.md`.
