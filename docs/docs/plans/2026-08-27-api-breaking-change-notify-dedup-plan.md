# API breaking change notification dedup plan

Every push to a non-draft PR re-runs the full `heavy_*` tier (the
`pull_request` trigger fires on `synchronize`, not just PR open). When a
PR contains a breaking API change, `heavy_api_breaking_change_notify`
posted "⚠️ Breaking API change requires approval" to Slack on every one
of those runs for as long as the break persisted — so a PR with a
genuine, still-unresolved break got re-pinged on every follow-up commit,
even typo fixes or unrelated changes. The ask: notify once per distinct
breaking change, and only send a new message when the change-set
actually changes (a new/different break), not on every push.

## Prior behaviour (research findings)

All four jobs live in **`.github/workflows/ci.yml`**, heavy tier,
gated on `pull_request` + non-draft:

| Job | Purpose |
| --- | --- |
| `heavy_api_schema_diff` | Runs `oasdiff`, detects breaking changes, validates decision files |
| `heavy_api_breaking_change_gate` | `environment: api-breaking-change-review` manual-approval gate |
| `heavy_api_breaking_change_notify` | Sends the Slack "⚠️ Breaking API change requires approval" message |
| `heavy_api_compat_notify` | Separate Slack alert if decision-file *validation* fails |

- **Detection**: `heavy_api_schema_diff` dumps OpenAPI specs for `main`
  and the PR branch via `backend/scripts/dump_openapi.py --dev`, then
  `.github/scripts/ci/check-api-breaking-changes.sh` runs
  `oasdiff breaking --fail-on WARN` and sets job output `breaking`. A
  second run produces `oasdiff-report.json`
  (`oasdiff breaking --format json`), consumed by
  `.github/scripts/ci/validate-compat-files.sh` to check every flagged
  change has a matching `api-compatibility/*.yaml` decision file.
  Comparison is always PR-branch-vs-`main`, regenerated fresh every run.
- **Notify (before this change)**: `heavy_api_breaking_change_notify`
  fired unconditionally whenever
  `needs.heavy_api_schema_diff.outputs.breaking == 'true'`, via the
  reusable `.github/workflows/slack-notify.yml`
  (`slackapi/slack-github-action@v3.0.1`). The payload carries PR
  number/URL, `github.actor`, and a link to the Actions run — no diff
  content and no identifier for *which* change triggered it.
- **Gate**: `heavy_api_breaking_change_gate` uses a Terraform-managed
  GitHub environment (`infra/github/environments.tf`,
  `prevent_self_review = false` — the PR author is the required
  approver by design). Approval is scoped to the exact commit SHA of
  that workflow run, so a fresh approval is needed on every push
  regardless of notification noise. **This plan does not change the
  gate** — only the Slack notification is deduplicated.
- **No prior dedup mechanism**: no `actions/cache` use for
  breaking-change state, no PR comment/label automation anywhere under
  `.github/workflows/`. The closest reusable identifier was the
  deterministic per-change string oasdiff findings are reduced to —
  `"<id> <operation> <path> <text>"` — built by
  `parse_oasdiff_changes()` in
  `.github/scripts/ci/validate-compat-files.sh`, already the exact
  string stored in decision files' `change:` field.

## Implementation

Track notification state as a **hash of the current breaking-change
set, recorded on a sticky PR comment** — updated in place, not
appended to, via a hidden `<!-- breaking-api-change-hash: <hash> -->`
marker. A comment was chosen over `actions/cache` or a PR label because
cache entries are branch/key-scoped and evict after inactivity, and a
comment is simple, persists indefinitely, and doubles as a visible
audit trail on the PR itself — matching this repo's existing
audit-friendly style around breaking changes (decision files, approval
gate).

### Phase 1: Compute a stable hash for the current breaking-change set

- [x] Add `.github/scripts/ci/compute-breaking-change-hash.sh` —
      reads `oasdiff-report.json`, rebuilds each change as
      `"<id> <operation> <path> <text>"` (same identity string
      `validate-compat-files.sh`'s `parse_oasdiff_changes()` uses),
      sorts the lines (oasdiff's array order isn't a meaningful
      identity signal), and hashes with `sha256sum`. Writes
      `breaking_hash=<hash>` to `GITHUB_OUTPUT`.
- [x] Wire it into `heavy_api_schema_diff` as a new `hash` step
      (`if: steps.diff.outputs.breaking == 'true'`), run against the
      already-generated `oasdiff-report.json`. Exposed as job output
      `heavy_api_schema_diff.outputs.breaking_hash`.
- [x] Add `.github/scripts/ci/compute-breaking-change-hash.bats`
      covering the extraction/hashing logic.

### Phase 2: Compare against the PR's sticky marker comment

- [x] Add `.github/scripts/ci/dedup-breaking-change-notify.sh` — looks
      up existing PR comments via `gh api .../issues/{pr}/comments`,
      finds the first one whose body starts with the
      `<!-- breaking-api-change-hash: -->` marker, and compares its
      recorded hash to the freshly computed one:
  - Match → `should_notify=false`, no API mutation.
  - No marker yet, or a different hash → create (first time) or
    `PATCH` in place (subsequent changes) the marker comment with the
    new hash and a short explanation of what it's tracking, then
    `should_notify=true`.
- [x] Add `.github/scripts/ci/dedup-breaking-change-notify.bats`
      covering the pure marker-matching/body-building logic.
- [x] New `heavy_api_breaking_change_dedup` job in `ci.yml`, `needs:
      heavy_api_schema_diff`, `if: needs.heavy_api_schema_diff.outputs.breaking
      == 'true'`, outputs `should_notify`.

### Phase 3: Gate the Slack notify job on the new output

- [x] Update `heavy_api_breaking_change_notify`'s `needs:`/`if:` to
      `needs: [heavy_api_schema_diff, heavy_api_breaking_change_dedup]`
      and require both
      `needs.heavy_api_schema_diff.outputs.breaking == 'true'` **and**
      `needs.heavy_api_breaking_change_dedup.outputs.should_notify == 'true'`.
- [x] Leave `heavy_api_breaking_change_gate` untouched — approval stays
      required on every push regardless of notification state; only
      Slack noise is reduced.
- [x] Leave `heavy_api_compat_notify` untouched — it already only fires
      on validation *failure*, which is inherently a distinct condition
      each time it happens (a human fixes the decision file, which
      changes what's failing).
- [x] Document the mechanism and its known trade-off in
      `docs/docs/backend/api-compatibility.md`.

## Decisions

| Decision | Rationale |
| --- | --- |
| Dedup key = hash of the sorted oasdiff change-identifier set, not just the boolean `breaking` flag | The ask is "new break → new message"; a single boolean can't distinguish "same break, new commit" from "different break, new commit" |
| Sticky PR comment over `actions/cache` or a PR label | Comments aren't subject to cache eviction/key-scoping, can be edited in place, and are visible/auditable directly on the PR — no new permissions needed beyond the existing `pull-requests: write` |
| Marker comment is edited in place, not appended | Keeps the PR timeline clean — one tracking comment per PR, always reflecting the latest breaking-change set, rather than a growing thread of near-duplicate pings |
| A fixed-then-identically-reintroduced breaking change stays silent | Accepted trade-off: the ask was "once per distinct breaking-change set", and the stale marker hash genuinely still matches. The approval gate's fresh-per-commit requirement is unaffected either way, so this only affects Slack noise, not safety |
| Approval gate (`heavy_api_breaking_change_gate`) left unchanged | Its SHA-scoped, per-run approval is a deliberate security control (`prevent_self_review = false`, forcing one distinct author action) — out of scope for a noise-reduction change |
