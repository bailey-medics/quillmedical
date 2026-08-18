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
  generated from the PR branch, in the `api_breaking_change_check` CI job.
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

## Client-side reassurance: the "Updating…" banner

Routine and expand-step deploys stay fully silent — the existing
whitelist-gated reload (hourly timer or navigation, whichever is first)
picks up the new bundle with no message. A contract-step deploy is the one
point of actual client risk, so it additionally shows a short,
non-dismissible "Updating to the latest version…" banner
(`components/updating-banner/UpdatingBanner.tsx`, modelled on the existing
`OfflineStrip` pattern) for a few seconds before reloading — reassurance
for a risk the staging has already eliminated, not the thing eliminating
it.
