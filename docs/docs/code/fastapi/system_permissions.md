# System Permissions

## Module Init

::: app.system_permissions

## Permissions

::: app.system_permissions.permissions

`require_operator()` lives in `app.deps` — see [Dependencies](deps.md). It asks
`platform_role`, not a rung on a ladder.

`require_staff()` and `require_superadmin()` were both deleted for the same
reason: nothing called them. `require_admin()` became `require_operator()`,
because its one consumer sends a push notification to every subscribed client
in the deployment — unbounded by any organisation, so the platform question
rather than an administrative act at a place. See
`docs/docs/plans/2026-09-09-platform-role-plan.md`.
