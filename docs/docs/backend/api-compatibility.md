# API compatibility (expand-contract)

## Overview

Every API response shape and required request field is a contract that
stale clients still depend on — not just during a rolling deploy, but for
as long as a browser tab stays open. This page explains why a single
breaking deploy is unsafe on the client boundary, the two-deploy pattern
that closes the gap, and the tooling that enforces it automatically rather
than relying on human review alone. It mirrors the database
[expand-contract](alembic-migration-safety.md) rule, applied to the API
boundary instead of the schema.

## Why a stale tab is a real risk, not a theoretical one

Refresh tokens rotate on every use (`main.py`, `/api/auth/refresh`), so a
tab kept alive by routine use never hits the 7-day refresh TTL and never
re-logs-in. Because this is a client-routed single-page app, re-login is
the only thing that would otherwise force a fresh page load — a tab can
genuinely stay open for 30+ days on the bundle it started with, still
calling the API with the shapes that bundle expects.

## The rule: additive-only within the compatibility window

Adding an optional response field is safe. Renaming, removing, or
retyping a field, or adding a **required** request field, is a breaking
change and must never ship as a single deploy. Instead it's staged across
two deploys, at least one release apart:

1. **Expand** — the new shape goes live **alongside** the old one; both are
   served simultaneously, so a stale tab keeps working exactly as before —
   nothing about this deploy is "breaking" for anyone yet.
2. **Contract** — the old shape is removed, **at least one full release
   cycle later** (the "N releases" of deprecation), never in the same
   deploy as the expand step, and never sooner than a release cycle.

This is the same reasoning as the database's expand-contract rule, applied
to the API boundary instead of the schema: [item 14](../plans/2026-08-09-alembic-review-and-revisions-plan.md)'s
hourly-timer-and-navigation, whitelist-gated reload check gives every
stale tab numerous opportunities — timer-driven, not just
navigation-driven — to pick up the expand deploy well before the contract
deploy ships, since a release cycle spans many days of ordinary use. The
risk window is closed by the staging gap, reinforced by (not solely
dependent on) that hourly check.

## Enforcement: automated schema diff + a human gate an agent can't self-satisfy

A `# api-check: breaking-change` code comment, a `BREAKING CHANGE:`
commit-message trailer, and a PR label were each considered and rejected.
All three are just text/metadata that an AI coding agent produces as
routinely as the code itself, so none of them prove a human actually
decided the change was intentional. A code comment has a second flaw even
setting that aside: unlike an Alembic migration file (write once, reviewed
once, never revisited), application source is edited repeatedly forever,
so a marker added for one breaking change sits there permanently and can
silently "cover" an unrelated, unreviewed change to the same endpoint
months later.

A second-reviewer requirement (CODEOWNERS + required PR review) was also
considered and rejected on principle, not just team size: design for the
lowest common denominator — a lazy human — and a second reviewer is not
inherently more careful than the person who wrote the change. The gate
below is deliberately built so **the author themself** is the accountable
approver — the goal is forcing one genuine, separate, deliberate action out
of whoever is accountable, not diffusing accountability across more people
who could each be equally lazy.

- **Schema diff**: `oasdiff breaking` compares the OpenAPI spec generated
  from `main` (`backend/scripts/dump_openapi.py`) against the spec
  generated from the PR branch, in the `api_schema_diff` job of
  `.github/workflows/gate-breaking.yml`.
  Chosen over hand-written contract tests because it needs no test
  authoring per endpoint — it diffs the full spec on every PR
  automatically. `oasdiff`'s source-location tracking only maps a change
  back to a line/column inside the OpenAPI spec file itself, not into the
  Python source that generated it, so the check can only report "was _any_
  breaking change found", never "which exact source line caused it".
- **Human gate**: a breaking-change finding routes the workflow through a
  required-reviewer GitHub Actions environment
  (`api-breaking-change-review`) with the repo owner (the author) as the
  sole reviewer. "Prevent self-review" stays **off** — by design, see the
  accountability reasoning above. Approving is a distinct action in the
  GitHub Actions UI/mobile app — less reachable from an agent's
  terminal/editor session — and it is scoped to the exact commit SHA of
  that workflow run, so a new push always requires a fresh approval;
  nothing left over from an earlier commit can satisfy it.
- **Notification**: a breaking-change finding posts to Slack (via the
  reusable `.github/workflows/slack-notify.yml`, `channel: teaching`) with
  `oasdiff`'s changelog summary of what changed, so the approval prompt
  shows _what_ is being confirmed rather than a bare "approve?".
- **One message per distinct set of breaks**:
  `api_breaking_change_gate` re-requires approval on every commit —
  deliberately, see above — but re-sending an identical Slack ping on every
  one of those commits is just noise, not a safety property.
  `api_breaking_change_gate_notify` hashes the set of breaking
  changes (`compute-breaking-change-hash.sh`, sorted so ordering doesn't
  affect the hash) and asks whether any comment on the PR already carries
  that hash (`gate-notify.sh` with marker key `breaking-api-change-hash`,
  matched on a hidden `<!-- breaking-api-change-hash: <hash> -->` first
  line). Slack only fires when the answer is no — the first breaking change
  on a PR, or a later commit that alters which changes are breaking — never
  on a re-push that leaves the same break(s) in place. State lives in a PR
  comment rather than `actions/cache` because cache entries are
  branch/key-scoped and evict after inactivity, whereas a comment persists
  indefinitely and doubles as a visible audit trail.
- **A comment per change-set, never edited**: each distinct set of breaking
  changes gets its **own** comment, added at the point in the PR timeline
  where it appeared, so the conversation reads as a chronological record of
  what was found and when. Only the gate's **newest** comment is consulted
  when deciding whether to announce (`max_by(.id)`, so the answer doesn't
  depend on API ordering), which means moving back to a set the PR held
  earlier is announced again rather than swallowed — each comment records a
  transition, not a standing claim.
- **A return to clean is recorded too**: when the last breaking change is
  removed the gate posts an all-clear comment (✅, "no longer present"), so the
  timeline shows the break arriving *and* going. Slack is not told — the notify
  job is gated on `oasdiff` having found something as well as on
  `should_notify` — and a PR that never had a break stays silent. The gate's
  fresh-approval requirement is unaffected throughout: it re-blocks on every
  push for as long as a break is present.
- **Outside `ci.yml`, deliberately**: all of the above lives in
  `.github/workflows/gate-breaking.yml`, because `ci.yml` cancels its runs when
  a newer commit arrives. Right for expensive tests, wrong here — two commits
  pushed in quick succession, one adding a break and one reverting it, could
  leave no record the break existed, and a job cannot opt out of its own run
  being cancelled. `gate-breaking.yml` sets no workflow-level concurrency, so
  every commit's decision runs. The **approval gate** then uses job-level
  concurrency to supersede its older self, so a reviewer never faces a queue of
  pending approvals; the **decision job** deliberately uses none, because a
  concurrency group holds one running plus one pending instance and a third
  push would cancel the queued second, losing that commit's comment. It calls
  `wait-for-ancestor-decisions.sh` instead, which waits for every ancestor
  commit still deciding — no queue to cap, so every commit is recorded, and the
  comments land in commit order without a lock. See
  [Gate notification workflow](../plans/2026-08-29-gate-notification-workflow-plan.md)
  for the alternatives rejected.

## Decision files: `api-compatibility/` folder

Once a breaking change has been approved by the required reviewer, that
approval and its reasoning must be recorded durably and clearly. The
`api-compatibility/` folder at the repo root holds one YAML decision file
per flagged change, each recording the human's verdict on whether the
change requires every open browser tab to force-reload immediately
(contract-step risk) or can be handled by the routine silent update
mechanism (expand-step, or backwards-compatible addition).

### File format

Each file follows the naming pattern `YYYYMMDDHHMMSS-<slug>.yaml` (UTC
timestamp, no separators, followed by kebab-case slug). Example:

```yaml
generation: 2
forces_reload: true
change: "api-path-removed-without-deprecation DELETE /api/v1/encounters/{id}"
reason: "Old bundles call this endpoint from the encounter close button. Removing it without deprecation will cause immediate 404 errors in open tabs running that old bundle."
```

### Field meanings

- `generation` — a positive integer assigned by the script when the file is
  created. On files where `forces_reload: true`, this is a globally unique
  identifier: if two files ever both claim `forces_reload: true` with the
  same generation number, CI fails (enforced by branch protection requiring
  up-to-date merges). On `forces_reload: false` files, the generation is
  informational only and is not required to be unique. The backend and
  frontend bake this value in at build time and compare it at runtime to
  detect when a tab is running an older bundle than the current API
  requires (the client forced-reload mechanism, see below).

- `forces_reload` — boolean. `true` means every open browser tab is
  incompatible with the new API and must reload immediately; `false` means
  the existing quiet background-update mechanism (hourly timer or
  navigation, whichever comes first) is sufficient for users to pick up the
  new bundle before they encounter the changed API. This decision is a human
  judgement call recorded by the required reviewer.

- `change` — the exact oasdiff flagged change ID and operation, copied
  verbatim from the CI log so a reviewer can match the file against what
  the CI tool actually found. Example: `api-path-removed-without-deprecation DELETE /api/v1/encounters/{id}`.

- `reason` — free-form text explaining why the human made this
  `forces_reload` decision. This is the safety/hazard-log artefact: it
  records the thinking for a clinical/compliance audit trail, not just the
  outcome. Must be non-empty.

### Immutability and edits

Once a file is merged to `main`, the `generation`, `forces_reload`, and
`change` fields become immutable — editing them retroactively would make
the original approval meaningless for compliance purposes. The `reason`
field may be edited in later PRs to fix typos or add context, and comments
may be added, but only via the same `api-breaking-change-review` gate to
keep the audit trail clear. Deleting an existing file is never permitted;
if a decision is superseded, record a new decision file instead.

## Client-side reassurance: the status strip and "Updating…" overlay

### Routine and expand-step deploys (forces_reload: false)

Routine and expand-step deploys stay fully silent — the existing
whitelist-gated reload (hourly timer or navigation, whichever is first)
picks up the new bundle with no message. These cases cover the vast
majority of API changes (additions, deprecations, optional field removals).

### Contract-step deploys (forces_reload: true)

A contract-step deploy is the one point of actual client risk: a breaking
change that open tabs cannot tolerate. When the backend starts serving a
new `Compat-Generation` value (bumped when a `forces_reload: true` decision
is merged), any open tab running an older client bundle will detect the
mismatch at its next API call. The detection works as follows:

- Both backend and frontend bake in their `Compat-Generation` value at
  build/deploy time (the backend serves it as an HTTP header on every
  response, the frontend bakes it as a build-time constant).
- On every API response, the frontend's interceptor compares its own
  generation (baked in at build) against the backend's generation (served
  in the response header). If they match, the tab is compatible and
  continues normally. If the tab's generation is _older_ than the backend's
  generation, the tab is incompatible.
- When incompatibility is detected (`client_generation < server_generation`),
  the tab immediately:
  1. Shows a blocking, full-screen overlay (the `UpdatingBanner` component,
     mounted at the app root via `ForcedReloadGate` so it covers every
     route including guest pages), telling the user the app must update.
  2. Persists any in-progress form or editor state to `sessionStorage`.
  3. Reloads the page, restores the persisted state after reload, and
     continues.
     A second mismatch event received while this transition is already in
     flight is ignored rather than overwritten, and an offline tab skips the
     reload attempt entirely (it would just fail to reach anything) and goes
     straight to the fallback state below instead.

If the reload fails to resolve the mismatch (e.g. the backend generation
mismatch persists after reload due to deploy ordering issues), the tab
shows a non-dismissible `StatusStrip` (`variant="fallback"`) in normal
layout flow directly below `TopRibbon` — pure passive status text, with no
"Refresh now" or dismiss button — **and** keeps retrying automatically in
the background every 5 minutes via a real compatibility check (never a
blind reload with no evidence), so a tab left open eventually self-heals
once the correct bundle is live, without needing the user to do anything.
The strip stays visible until the underlying condition clears on its own.

### Component architecture

The side-effect logic (listening for the mismatch event, running the
retry timer, persisting/restoring form state) lives in
`lib/compat-generation/ForcedReloadProvider.tsx` and its `useForcedReload()`
hook, mounted once at the app root — mirroring the existing
`ConnectivityProvider`/`useConnectivity()` pattern exactly. This keeps the
side effects running exactly once regardless of which layout is active,
while still letting each layout render its own status strip:

- `ForcedReloadGate` (root-mounted, sibling to `RouterProvider`) renders
  only the blocking `UpdatingBanner` overlay while `phase === "blocking"` —
  this covers every route, including guest pages with no layout at all.
- `MainLayout` and `TeachingLayout` each call `useForcedReload()` and
  `useConnectivity()` directly, rendering `StatusStrip` for the
  offline/reconnected/fallback conditions below their own `TopRibbon`,
  alongside each other when more than one condition is true at once (no
  priority ordering between them).
- `StatusStrip` (`components/status-strip/StatusStrip.tsx`) is a single
  component covering all four non-blocking variants (`offline` |
  `reconnected` | `updating` | `fallback`) — it replaced three separate,
  near-identical components (`OfflineStrip`, `UpdatingBanner`'s old passive
  strip variant, `UpdateFallbackBanner`) that had converged on the same
  shape (icon + short message, `role="status"`, `aria-live="polite"`).

This forced-reload mechanism is the only thing that protects users in
genuinely breaking contract-step scenarios — the expand-contract staging
already eliminates the risk operationally, so the reload is reassurance
rather than the risk-elimination mechanism itself.
