## API compatibility gate and client forced-reload mechanism

### Problem being solved

The frontend is a client-routed SPA. A browser tab can keep running an old
JavaScript bundle for weeks without ever reloading. Some backend API changes
would break that old bundle if it kept talking to the new API; others are
harmless (e.g. a cosmetic field being removed from a response nobody reads).

CI already runs `oasdiff breaking` on every PR, comparing the OpenAPI spec
generated from the PR branch against the spec on `main`. If it detects an
undeclared breaking change, the PR is blocked behind a required-reviewer
GitHub Environment called `api-breaking-change-review`, so a named human
must click Approve before merge. This must stay true: a code comment,
commit trailer, or PR label must never be able to satisfy this gate, only a
real environment approval by an accountable person, because an AI coding
agent (or a rushed human) can produce text as easily as it produces code.

What was missing: a way for that human to record _which_ changes actually
require every open tab to force-reload immediately, versus which are safe
to let update quietly on next navigation (the app already has a separate,
existing "silent background update on next safe navigation" mechanism —
this spec only concerns the _forced, immediate_ reload path).

**Relationship to the existing hourly-timer/navigation reload** (item 14/15
of [2026-08-09-alembic-review-and-revisions-plan.md](2026-08-09-alembic-review-and-revisions-plan.md)):
that mechanism is unchanged and keeps handling every `forces_reload: false`
decision exactly as it does today — silent, whitelist-gated, no urgency. It
also left an explicitly open gap: "still needs a design for how the
reload-trigger code learns a given reload is a contract-step one." This
sub-plan is that design for the `forces_reload: true` case specifically,
and it deliberately overrides the whitelist-gate for that case: a forced
reload happens immediately, on whatever route the tab is currently on, not
deferred to the next safe navigation or the next hourly tick. The two
mechanisms are not in conflict — they cover disjoint decisions
(`forces_reload: false` vs `true`) and the forced path intentionally takes
priority when it fires.

### Design: `api-compatibility/` folder of decision files

Add a folder to the repo root:

```
api-compatibility/
  20260818090000-init.yaml
  20260819141230-remove-encounter-delete.yaml
  20260820103005-clock-field-removed.yaml
  ...
```

Each file is one human decision about **exactly one** oasdiff-flagged
change (or, for the first file only, a statement that there was nothing to
decide yet). See "Multiple flagged changes in one PR" below for how this
scales when a single PR touches several endpoints.

**Filename format:** `YYYYMMDDHHMMSS-<slug>.yaml`, where the timestamp is
UTC, 14 digits, no separators, followed by a dash and a lowercase
kebab-case slug. Filenames must match:

```
^\d{14}-[a-z0-9]+(-[a-z0-9]+)*\.yaml$
```

The timestamp prefix (not a sequential integer) is deliberate: it lets two
developers create files on independent branches, at the same time, off the
same `main`, without their _filenames_ colliding — each reads their own
clock, not a shared counter. See "Concurrent PRs and the generation
number" below for why the `generation` field inside the file needs a
separate safeguard.

**File 0001-equivalent (bootstrap, committed once, never repeated):**

```yaml
generation: 1
forces_reload: false
change: "none"
reason: "no changes as first commit"
```

**A file that does NOT require a forced reload** (e.g. removing an unused
cosmetic field):

```yaml
generation: 1
forces_reload: false
change: "response-property-removed GET /api/v1/clock"
reason: "Cosmetic display field on the clock widget. Old bundles render an empty string for it. No clinical data path affected."
```

**A file that DOES require a forced reload** (e.g. removing an endpoint an
old bundle still calls):

```yaml
generation: 2
forces_reload: true
change: "api-path-removed-without-deprecation DELETE /api/v1/encounters/{id}"
reason: "Old bundles call this from the encounter close button and will 404 against the new API."
```

Field meanings:

- `generation` — a human/script-assigned integer. Only meaningful and
  load-bearing on files where `forces_reload: true` (see next section for
  why). On `forces_reload: false` files it's informational only, kept so
  a human skimming the directory can see roughly when a decision was made
  relative to others — it is **not** required to be unique on `false`
  files and CI does not check it for them. It also must not be incremented if
  `forces_reload` is false.
- `forces_reload` — boolean. `true` means every open browser tab must be
  forced to reload as soon as this deploy goes live. `false` means the
  existing silent background-update mechanism is sufficient.
- `change` — the oasdiff change ID plus the operation it applies to, taken
  verbatim from the `oasdiff breaking --format json` output in the CI log.
  A single string, referring to exactly one flagged change — see below for
  why this is deliberately not a list. Used so a reviewer can match the
  file's claim against what oasdiff actually flagged.
- `reason` — free text, must be non-empty. This is the hazard-log /
  clinical-safety artefact: why a human judged this safe (or not) for
  currently-open clinical sessions.

No `since`/base-SHA field is needed: `git blame` / `git log` on the file
itself already gives an exact, tamper-evident record of which commit
introduced the decision. Storing a SHA by hand would just duplicate
something Git already records correctly.

### Multiple flagged changes in one PR

A PR is free to touch several endpoints and trigger several oasdiff
findings at once. This is handled by adding **one file per flagged
change**, not by combining several changes into one file. Concretely, for
a PR that changes three endpoints, where oasdiff flags all three:

```
api-compatibility/
  20260821090100-remove-encounter-delete.yaml   forces_reload: true,  generation: 5
  20260821090115-clock-field-removed.yaml       forces_reload: false, generation: 5
  20260821090130-widen-status-enum.yaml         forces_reload: false, generation: 5
```

Each file has its own `change`, its own `reason`, and its own independent
`forces_reload` verdict. The PR is still reviewed and approved once, as a
single event through `api-breaking-change-review` — the reviewer reads all
new files together — but the decisions themselves stay separable.

**`change` is deliberately a single scalar string, not a list, and a file
must never bundle two independent oasdiff findings together.** The reason:
if two genuinely different changes were forced into one file, they would
have to share one `forces_reload` value even when their true urgency
differs — e.g. one change is genuinely breaking and the other is cosmetic,
but the file can only say `true` or `false` once. Marking the whole file
`true` needlessly interrupts every user for the harmless change; marking
it `false` silently fails to protect anyone from the genuinely breaking
one. There is no correct shared value, so the schema does not allow it:
one file, one change, one verdict, one reason. If two oasdiff findings
really do describe the exact same underlying edit (e.g. a field removal
and a type narrowing on the same field in the same commit), it is still
simplest and safest to write two files with the same `reason` repeated
rather than introduce a `changes: [...]` list — the duplication is cheap
and the schema stays unambiguous.

**Coverage requirement:** every change oasdiff flags in a PR must have a
corresponding file referencing it via `change` — not just one of several.
A PR with three flagged changes that only adds a file for one of them must
fail CI, otherwise a change could ship undeclared by hiding behind an
unrelated file that happens to satisfy "at least one new file exists."

**Numbering when a PR adds two or more `forces_reload: true` files:** each
must get its own `generation`, incrementing from `main`'s current
max-true-generation — e.g. `main + 1` and `main + 2` — never the same
number for two `true` files (see "Concurrent PRs and the generation
number" below for why). `forces_reload: false` files in the same PR can
reuse any `generation` value freely, including numbers already used by the
`true` files, since `false` files are never checked for uniqueness.

### Deriving the client compatibility generation

```
required_client_generation = max(generation for files where forces_reload: true)
                              or 1 if no such file exists
```

`forces_reload: false` files are excluded from this calculation entirely
— they never move the number, because nothing at runtime needs to know
about them. This number is baked into both the backend and frontend build
artefacts at build time (both built from the same commit), e.g. as a Vite
`define` for the frontend and as backend config served on every response,
e.g. an `Compat-Generation` header.

### Concurrent PRs and the generation number (race condition + fix)

**The race:** two developers can independently branch off the same
`main`, both compute "next generation number" by looking at the current
max, and both mint the same number for two _different_, contradictory
decisions (e.g. Dev A: generation 5, forces*reload: true for change X; Dev
B: generation 5, forces_reload: true for change Y). The timestamp-based
filename does not prevent this — it only stops the \_files* from
colliding, not the _number written inside them_.

**Why it matters:** if two `forces_reload: true` files both land on
`main` claiming the same generation, `required_client_generation` becomes
ambiguous — there's no principled way to decide what "generation 5" means
operationally.

**Why `forces_reload: false` files are exempt:** a `false` file is never a
candidate for defining `required_client_generation` (see formula above),
so two `false` files — or a `false` file and a `true` file — sharing a
`generation` number creates no ambiguity. Only two `true` files sharing a
number is a real problem.

**The fix (two parts, both required):**

1. **Repo setting:** enable "Require branches to be up to date before
   merging" (or a merge queue) in branch protection for `main`. This
   forces a PR to re-run CI against the _current_ `main` — not the `main`
   it originally branched from — immediately before merge is allowed.
   This turns the cross-PR race into a same-branch, same-PR problem: if
   Dev A merges first, Dev B's branch is blocked until Dev B merges `main`
   in, at which point Dev B's branch contains _both_ files and CI
   re-runs on it.

2. **CI check:** fail if any two files with `forces_reload: true` in
   `api-compatibility/` (as they exist on the current branch, post-merge
   of `main`) share the same `generation` value. No such check is needed
   or applied to `forces_reload: false` files.

Practical consequence: a PR whose only new files are `forces_reload:
false` can never collide with another PR regardless of timing, since
neither is a candidate for `required_client_generation`. The
up-to-date-branch friction only bites on the genuinely rare case of two
`forces_reload: true` changes landing at the same time — comparable to an
ordinary Git merge conflict, and resolved the same way (bump your file's
`generation` by one and retry).

### Immutability rules (field-level, not file-level)

Once a file is merged to `main`, later PRs may **never** change:

- `generation`
- `forces_reload`
- `change`

These three fields together constitute the record of what was actually
approved by the required reviewer on a specific commit. Changing any of
them after merge would make that approval retroactively meaningless.

Later PRs **may** edit:

- `reason` — e.g. to fix a typo or add context discovered later. A
  `reason`-only edit to an existing file is a legitimate PR and should
  still route through the `api-breaking-change-review` environment (since
  `reason` is the hazard-log artefact and a change to it deserves a second
  pair of eyes), but it is not blocked outright the way editing the other
  three fields is.
- comments

Deleting an existing file is **never** permitted. A superseded decision
gets a new file, not a removed old one.

CI must diff each _existing_ file (one already present on `main`) against
its version in the PR, field by field, and fail only if `generation`,
`forces_reload`, or `change` differ. A `reason`-only diff or comment must pass.

### CI rules to implement (GitHub Actions)

On every PR that touches the API surface:

1. Run `oasdiff breaking --format json` comparing the PR branch's generated
   spec against `main`'s spec.
2. If oasdiff flags one or more ERR/WARN changes: **every** flagged
   change must have a corresponding new file under `api-compatibility/`
   referencing it via `change` — not merely at least one. Fail CI and list
   which flagged change(s) have no matching file.
3. Every new file's `reason` must be non-empty. Fail CI if empty.
4. Each new file must reference exactly one `change` (a single scalar
   string). Reject any file whose `change` field looks like it's trying to
   encode more than one finding (e.g. contains a list, or is suspiciously
   long/compound) — this is a soft guard; the hard guard is human review
   at the `api-breaking-change-review` gate.
5. For every file already present on `main` that this PR also touches:
   fail if `generation`, `forces_reload`, or `change` differ from the
   `main` version. A `reason` or comment-only change is allowed. Fail if the PR
   deletes an existing file.
6. New filenames must match `^\d{14}-[a-z0-9]+(-[a-z0-9]+)*\.yaml$`. Fail
   otherwise.
7. Fail if any two files with `forces_reload: true` (across the whole
   directory as it stands on this branch) share the same `generation`
   value. Do not apply this check to `forces_reload: false` files.
   7a. Files with `forces_reload: false` must only have a generation number
   between 1 and the highest number in the `api compatibility` folder.
8. This step does not need to verify that `forces_reload` correctly
   reflects deep semantic truth (that's the human reviewer's job) — only
   that the file(s) exist, are well-formed, and follow the rules above.
   The `api-breaking-change-review` environment approval is what stands in
   for that human judgement.
9. Any PR that adds or edits files under `api-compatibility/` must route
   through the existing required-reviewer environment
   `api-breaking-change-review` before merge (this environment binding
   already exists — just ensure the job step that adds/checks these files
   is the one gated by it).
10. Fail CI if a `change` field doesn't
    correspond to anything oasdiff actually flagged this run (guards
    against copy-paste of a stale change string).
11. Repo setting (not a CI script step, but required for rule 7 to be
    effective): branch protection on `main` must require branches to be up
    to date before merging (or use a merge queue if the latter is not
    possible). **Already satisfied** — `infra/github/branch_rules.tf` sets
    `strict_required_status_checks_policy = true` on `main`; no Terraform
    change needed, just confirm it still applies once the new CI checks
    below are added as required status checks.

### Backend behaviour

- On startup/build, read `api-compatibility/` and compute
  `required_client_generation` per the formula above (max `generation`
  among `forces_reload: true` files only).
- Serve this value on every API response, e.g. header
  `Compat-Generation: 4`.

### Frontend behaviour

- Build-time: bake in the frontend's own `COMPAT_GENERATION` (same value
  as the backend it was built alongside — both built from the same commit,
  asserted equal at deploy/promote time).
- Runtime: a response interceptor (axios/fetch wrapper) reads
  `Compat-Generation` off every API response. Call the backend's served
  value `S` and the frontend's own baked-in value `C`:
  - `C == S` → fully compatible, do nothing (existing silent
    background-update mechanism handles picking up new builds over time).
  - `C > S` → backend is momentarily behind (rolling deploy in progress,
    or a stale backend instance). Do nothing. Never act on this direction.
  - `C < S` → this tab is running a bundle older than the backend now
    requires. Trigger the forced-reload flow (see below).
  - Header missing or response is a non-2xx with no header → treat as
    unknown, do nothing. Never infer incompatibility from a missing
    header or from HTTP error status alone.

### Forced-reload flow (when `C < S`)

1. Set an in-memory flag; do not reload immediately.
2. Stop/queue further mutating requests from this tab (this tab is now
   known to be speaking a contract the backend no longer honours).
3. Show a blocking modal telling the user the app must update. Reuse/extend
   the existing `UpdatingBanner` component
   (`frontend/src/components/updating-banner/`, already built in
   Storybook for the item 14/15 contract-step case) per the
   Storybook-first component reuse hierarchy, rather than building a new
   modal from scratch — it may need a new prop/variant to support this
   flow's blocking, non-route-gated timing, since today it's a passive
   `role="status"` strip with no such variant.
4. Before reloading: persist any in-progress form/editor state to
   `sessionStorage`, then reload, then attempt to restore it after reload.
   This matters clinically — a forced `location.reload()` must not
   silently discard a half-written clinical note.
5. After reload, if `C < S` still holds (e.g. deploy ordering was wrong —
   frontend generation was published before the matching bundle was
   actually live), do **not** force again immediately for the _same_
   generation. Track the attempted generation, attempt count, and next
   allowed retry time in `sessionStorage` (survives the reload). Combine
   both of the following rather than choosing one over the other:
   - Show a dismissible fallback banner ("An update is available but
     couldn't be applied automatically, please refresh manually") so the
     user is never stuck without a way forward and is never subjected to
     a tight reload loop.
   - Keep retrying automatically in the background every 5 minutes, via a
     real compatibility check (a lightweight request through the normal
     interceptor) rather than a blind reload with no evidence — if the
     deploy has since caught up, this check's own detected mismatch (or
     lack of one) drives the next action exactly as it would for any
     other mismatch. Dismissing the banner only hides the UI; the
     background retry keeps running regardless, so a tab left open
     eventually self-heals once the correct bundle is live, without
     requiring the user to keep re-checking.

### Non-goals / explicitly out of scope for this mechanism

- This does not replace the existing arrival-based silent background
  update mechanism for ordinary (non-breaking) deploys — that keeps
  working exactly as before and is what handles the `forces_reload: false`
  / generation-unchanged case.
- This does not attempt to force-reload only the tabs affected by a
  specific endpoint. Any `C < S` mismatch forces a full reload of that
  tab, regardless of which part of the app it's using. Per-route targeting
  was considered and rejected as unnecessary complexity for the current
  scale.
- `api-compatibility/` files are not a substitute for oasdiff's own
  `.oasdiff.yaml` severity-levels configuration. Use severity-levels for a
  standing, always-true policy decision about a whole class of change
  ("we never consider X breaking"). Use an `api-compatibility/` file for a
  one-off, per-PR human judgement about one specific change, with a
  recorded reason.

---

## Task for Copilot: `backend/scripts/new_compat_decision.py`

Write a CLI script that scaffolds a new decision file under
`api-compatibility/` in this repo, per the spec above.

**Location:** `backend/scripts/new_compat_decision.py`, executable,
Python 3 stdlib only (no new dependencies) — alongside the repo's other
interactive/admin scripts (`backend/scripts/create_user.py`,
`admin_cli.py`, `dump_openapi.py`), not the repo-root `scripts/` folder
(which today only holds bash tooling). Follow those scripts' existing
style: module docstring, `from __future__ import annotations`, plain
`input()`/prompts (no `click`/`typer` — not used elsewhere in this repo).

**Behaviour:**

1. Determine the repo root by walking up from the script's own location
   looking for a `.git` directory (same pattern as
   `backend/scripts/dump_openapi.py`'s `HERE.parents[...]` resolution), so
   the script works regardless of whether it's invoked from the repo root
   or elsewhere.
2. Ensure `api-compatibility/` exists at the repo root (create it if
   missing).
3. Interactive mode only:
   - Prompt for the oasdiff change id + operation (e.g.
     `"api-path-removed-without-deprecation DELETE /api/v1/encounters/{id}"`).
     Must refer to exactly one flagged change — if a developer needs to
     record decisions for multiple flagged changes, they run this script
     once per change, producing multiple files.
   - Prompt y/n for `forces_reload` boolean
   - Prompt for free text explaining the decision (the reason)
   - Slug is automatically derived from `reason` (lowercase,
     non-alphanumeric runs collapsed to single dashes, trimmed, capped at
     ~60 chars)
   - Fail on empty input for `change` and `reason`.
4. Refuse to run if `change` or `reason` contain a newline — these must be
   single YAML scalar lines. Print a clear error and exit non-zero.
5. Compute the `generation` value:
   - If `forces_reload` is true: scan all existing files in
     `api-compatibility/` with `forces_reload: true`, take the max
     `generation` among them, and use `max + 1` (initial file with '1' must exist, created via this plan).
     Before writing, re-check that no existing `forces_reload: true` file
     already has this exact `generation` value (protects against a stale
     local checkout — the CI check in the plan above is the real
     backstop, but failing fast locally is good UX). If a collision is
     found, print an error telling the user to `git pull`/rebase `main`
     and re-run.
   - If forces_reload is false: set generation to the current max(generation among forces_reload: true files) — i.e. the generation that is actually current at the time this decision was recorded, not one beyond it. No collision check is needed or performed, since false files are never required to be unique on generation.
6. Build the filename: current UTC time as `YYYYMMDDHHMMSS`, a dash, then
   the slug, then `.yaml`. Filename must match
   `^\d{14}-[a-z0-9]+(-[a-z0-9]+)*\.yaml$`.
7. Write the new file as:
   ```yaml
   generation: <integer, no leading zeros>
   forces_reload: true|false
   change: "<change, double-quote-escaped>"
   reason: "<reason, double-quote-escaped>"
   ```
8. Never write to, modify, or delete any existing file — only ever create
   new ones. Fail loudly if a target filename somehow already exists
   (extremely unlikely given the timestamp, but possible if two files are
   created within the same second) rather than overwriting — on collision,
   sleep briefly and regenerate the timestamp, or append a short random
   suffix.
9. On success (for each file created), print the file's path and
   contents. If `forces_reload` is true, print a clear note that
   `required_client_generation` will become `<generation>` once merged and
   this forces every open tab to reload. After all files in the session
   are created, print a single reminder that the PR must go through the
   `api-breaking-change-review` required-reviewer environment before
   merge, and that the repo requires the branch to be up to date with
   `main` before merging (relevant if any file in this session has
   `forces_reload: true`, since another urgent change might land first).
10. Exit code 0 on success, non-zero on any validation failure, with the
    error explained on stderr.

**Tests:** `backend/tests/test_new_compat_decision.py` (flat, alongside
the existing `test_admin_cli.py`/`test_check_migrations.py`), covering
slug derivation, generation increment/collision detection for
`forces_reload: true`, the reused-current-max behaviour for
`forces_reload: false`, filename regex compliance, and refusal on
empty/newline-containing `change`/`reason` input.

**Also add**, if not already present, the corresponding CI checks
described in the "CI rules to implement" section above — the
every-flagged-change-covered check, the field-level immutability check,
the filename regex check, and the `forces_reload: true`-only
duplicate-generation check. Flag this as a separate task if you'd rather
it be reviewed independently from the script.

Follow the existing pattern for this kind of check: a standalone script
under `.github/scripts/ci/` (mirroring `check-api-breaking-changes.sh`)
with a companion `.bats` test file (mirroring
`check-api-breaking-changes.bats`), wired into `.github/workflows/ci.yml`
near the existing `heavy_api_schema_diff` / `heavy_api_breaking_change_gate`
jobs so new `api-compatibility/` files continue to route through the
`api-breaking-change-review` environment already defined in
`infra/github/environments.tf` (no Terraform change expected).

---

## Implementation checklist

### `api-compatibility/` folder

- [x] Create `api-compatibility/` at the repo root
- [x] Add the bootstrap file (`generation: 1`, `forces_reload: false`,
      `change: "none"`)
- [x] Document the YAML schema (field meanings, immutability rules) in
      `docs/docs/backend/api-compatibility.md` or a new linked page

### `backend/scripts/new_compat_decision.py`

- [x] Implement the interactive CLI per the spec above
- [x] `backend/tests/test_new_compat_decision.py` covering slug
      derivation, generation increment/collision handling (both
      `forces_reload` values), filename regex, and empty/newline
      input refusal
- [x] Verify script conventions match `backend/scripts/create_user.py` /
      `admin_cli.py` (docstring, `from __future__ import annotations`,
      stdlib-only prompts)

### CI enforcement

- [x] New script(s) under `.github/scripts/ci/` implementing: every
      flagged change has a matching file; `reason` non-empty; `change`
      is a single scalar; field-level immutability diff (`generation`,
      `forces_reload`, `change`) against `main`; no deleted files;
      filename regex; duplicate-`generation` check for
      `forces_reload: true` files only; range check for
      `forces_reload: false` generations (rule 7a); stale `change`
      string check against this run's oasdiff output

Implemented as `.github/scripts/ci/validate-compat-files.sh`, mirroring the
existing `check-api-breaking-changes.sh` pattern (sources
`shared/logging.sh`, `set -euo pipefail`, testable via override env vars for
its git-shelling-out helpers). Covers rules 2–7, 7a and 10 (rule 1 is
oasdiff itself; rule 8 is structural-only, not a separate check; rules 9
and 11 are workflow/repo-setting, not script checks). Found and fixed a
pre-existing bug while adding immutability test coverage: `read_yaml_field`
used `[ -f "$file" ]`, which is false for a piped `/dev/stdin` (a FIFO, not
a regular file) — this silently made `validate_immutability`'s main-branch
side always read as empty. Changed to `[ -e "$file" ]`.

- [x] Companion `.bats` tests for each new CI script

`.github/scripts/ci/validate-compat-files.bats`, 36 tests, all green.
Added a `GET_MAIN_FILE_CONTENT_OVERRIDE` hook (mirroring the existing
`GET_NEW/MODIFIED/DELETED_COMPAT_FILES_OVERRIDE` pattern) so
`validate_immutability`'s `git show origin/main:<file>` call is testable
without a real git history — this uncovered the `-f`/`-e` bug above.

- [x] Wire the new step(s) into `.github/workflows/ci.yml`, gated the
      same way as `heavy_api_schema_diff` /
      `heavy_api_breaking_change_gate`

Added as two new steps inside the existing `heavy_api_schema_diff` job
(same `if` condition, no new job): generate `oasdiff breaking --format
json` alongside the existing human-readable check, then run
`validate-compat-files.sh` against it. Runs unconditionally (not gated on
`breaking == 'true'`) so a malformed/incomplete decision file fails CI even
when reviewers haven't been prompted yet. Also switched the PR checkout to
`fetch-depth: 0` plus an explicit `git fetch origin main:refs/remotes/origin/main`
so the script's `git diff origin/main...HEAD` (merge-base) calls resolve
correctly — the previous shallow (`depth: 1`) checkout had no `origin/main`
ref and insufficient history for that diff.

- [x] Confirm `strict_required_status_checks_policy` in
      `infra/github/branch_rules.tf` still covers `main` once the new
      checks are added as required status checks (no change expected)

Confirmed — the new validation runs as a step inside the existing
`heavy_api_schema_diff` job, whose required-status-check name ("API
breaking-change check") is unchanged in `infra/github/branch_rules.tf`.
No new job name, so no Terraform change needed.

### Backend

- [x] Read `api-compatibility/` at startup/build and compute
      `required_client_generation`
- [x] Serve `Compat-Generation` on every API response

Implemented as `backend/app/api_compatibility.py`:
`compute_required_client_generation()` reads all `*.yaml` files in
`api-compatibility/` and returns `max(generation for forces_reload: true)`,
or 1 if none exist — computed once at import time into
`REQUIRED_CLIENT_GENERATION`. A new `add_compat_generation_header`
middleware in `main.py` sets `Compat-Generation: <value>` on every
response. Malformed YAML files are skipped rather than raising (CI's
`validate-compat-files.sh` is the authority on well-formedness).

Path resolution mirrors the existing `shared/` YAML pattern in
`app/cbac/competencies.py` — `Path(__file__).parent.parent.parent /
"api-compatibility"` resolves to `/api-compatibility` inside the container
and to `<repo-root>/api-compatibility` when run directly from a checkout.
`backend/Dockerfile` now `COPY api-compatibility/ /api-compatibility/`
alongside the existing `shared/` copy, and `compose.dev.yml` mounts
`./api-compatibility:/api-compatibility` for dev hot-reload parity (no
change needed for `compose.ci.yml` / `compose.prod.cloud-run.yml`, which
don't volume-override `shared/` either, so the Dockerfile `COPY` suffices).

Tests: `backend/tests/test_api_compatibility.py` — formula correctness
(single/multiple `true` files, `false` files ignored, missing directory,
malformed/non-mapping YAML, non-integer `generation`), plus a
`test_client` integration check that the header is present and numeric on
`/api/health`. Confirmed via `just ub` that no other backend tests
regressed — some pre-existing, unrelated failures were found in
`test_auth.py`/`test_clinical_services.py`/etc. (a "self-registration not
available" 403 and stale `CLINICAL_SERVICES_ENABLED` expectations); these
reproduce identically with this change stashed out, so they predate this
work and are outside its scope.

### Frontend

- [x] Bake `COMPAT_GENERATION` in at build time (Vite `define`)
- [x] Response interceptor in `lib/api.ts` comparing baked-in `C` against
      served `S`
- [x] Forced-reload flow: reuse/extend `UpdatingBanner` for the blocking
      modal, stop/queue mutating requests, persist and restore
      in-progress form state via `sessionStorage`, second-failure
      passive-banner fallback. If update not available yet (eg new frontend is taking
      its time to deploy), try to force reload every 5 mins.
- [x] `.stories.tsx` + `.test.tsx` for any new/modified component
- [x] Confirm this path is documented as overriding (not conflicting
      with) the existing item 14/15 whitelist-gated silent reload, which
      continues to handle all `forces_reload: false` cases unchanged

Implemented as a new `frontend/src/lib/compat-generation/` module plus two
new/extended components:

- **Build-time constant**: `frontend/scripts/computeCompatGeneration.ts`
  mirrors the backend's formula exactly (max `generation` among
  `forces_reload: true` files, or 1), reading the same repo-root
  `api-compatibility/` folder. `vite.config.ts` computes this once at
  config-load time and injects it via `define: { __COMPAT_GENERATION__ }`;
  `vitest.config.ts` instead defines a fixed test value (`"1"`) so
  unrelated unit tests stay deterministic regardless of what's actually
  merged into `api-compatibility/`. Declared in `vite-env.d.ts`, exposed
  at runtime as `CLIENT_COMPAT_GENERATION` from
  `lib/compat-generation/compatGeneration.ts`.
- **Comparison + response interceptor**: `checkCompatGeneration(client,
serverHeader)` is a pure function (compatible / client-behind /
  server-behind / unknown — never infers incompatibility from a missing or
  non-numeric header). `lib/api.ts`'s `request()` and `requestBlob()` both
  call it right after every `fetch` resolves; on `client-behind` it marks a
  module-level `reloadPending` flag (read by a guard clause that now
  rejects further non-GET requests with a clear error) and dispatches
  `window` event `app:compat-mismatch` with the server's generation, mirroring
  the existing `app:network-error` / `app:api-success` event pattern already
  used for `ConnectivityContext`. On `compatible`, it clears any tracked
  retry record (see below) as a hygiene step.
- **Retry/fallback state machine**: `lib/compat-generation/retryState.ts`'s
  `decideRetryAction(serverGeneration, now, storage)` is a pure,
  storage-injectable function (tested against an in-memory `Storage` stub)
  tracking `{ generation, attempts, nextRetryAt }` in `sessionStorage` (so it
  survives the reloads this mechanism itself triggers). A mismatch against a
  _new_ generation always resets and reloads immediately; a mismatch
  against the _same_ tracked generation before `nextRetryAt` returns
  `fallback` (still `RETRY_INTERVAL_MS` = 5 minutes away); once
  `nextRetryAt` has passed it returns `reload-now` again. This directly
  implements the finalised combined behaviour above: an immediate first
  reload, then (if that didn't fix it) both a dismissible fallback banner
  _and_ a background retry every 5 minutes, not one or the other.
- **`ForcedReloadGate`** (`lib/compat-generation/ForcedReloadGate.tsx`,
  logic-only — no stories, same precedent as `NavigationBlocker` in
  `lib/connectivity/`) is mounted once at the app root in `main.tsx`
  (sibling to `RouterProvider`, inside `AuthProvider`/`ConnectivityProvider`,
  so it applies regardless of which layout — `MainLayout` or
  `TeachingLayout` — is currently active). It listens for
  `app:compat-mismatch`, persists in-progress form state, and renders either
  the blocking `UpdatingBanner` (briefly, before reloading) or the new
  dismissible `UpdateFallbackBanner`. On mount, if a retry record already
  exists in `sessionStorage` (this load is itself a previous forced-reload
  attempt), it proactively fires a real compatibility check
  (`api.get("/health")`) rather than waiting passively for organic traffic
  — this is what makes the background retry actually periodic rather than
  dependent on incidental API calls.
- **`UpdatingBanner`** gained a `blocking` prop: a full-screen,
  non-dismissible overlay (`role="alertdialog"`, `aria-live="assertive"`)
  for this flow, alongside its existing passive `role="status"` strip
  (unused elsewhere in the app today, built ahead of time for the item
  14/15 case per the Storybook-first component reuse hierarchy).
- **`UpdateFallbackBanner`** (new component,
  `components/update-fallback-banner/`) is the dismissible fallback —
  fixed to the viewport bottom (it's mounted at the root, not inside a page
  layout, so it can't rely on normal layout flow like `OfflineStrip`), with
  a `ButtonPair` offering "Refresh now" / "Dismiss".
- **Form-state persistence** (`lib/compat-generation/formStatePersistence.ts`):
  a deliberately generic, best-effort snapshot of native `<input
type="text/email/tel/number/search">` and `<textarea>` values to
  `sessionStorage`, keyed by `name` (falling back to `id`) and scoped per
  pathname. Restore is **exact-match only** — a saved field is written
  back via the native value setter + a bubbling `input` event (so React's
  controlled inputs pick it up) only if an element with that exact
  `name`/`id` exists after reload; anything without an exact match is
  silently dropped, never guessed at. Custom Mantine controls (`Select`,
  rich text editors, etc.) are explicitly out of scope for this generic
  mechanism.

Tests: `compatGeneration.test.ts`, `retryState.test.ts`,
`formStatePersistence.test.ts`, `ForcedReloadGate.test.tsx` (mocks
`lib/api.ts` and uses fake timers — `act()` around both event dispatch and
timer advances, not `waitFor`, since `waitFor` and fake timers don't mix
well), `UpdatingBanner.test.tsx` (extended for the `blocking` variant),
`UpdateFallbackBanner.test.tsx`, and
`scripts/computeCompatGeneration.test.ts`. All new/modified frontend files
pass `yarn tsc --project tsconfig.check.json --noEmit` and
`eslint --max-warnings=0`; the full frontend suite (`just uf`, 184 files /
1702 tests) shows no regressions.

### Frontend follow-up: consolidate status strip components

Post-implementation review noted `OfflineStrip`, `UpdatingBanner`'s passive
strip variant, and `UpdateFallbackBanner` had converged on almost the same
shape (icon + short message, `role="status"`, `aria-live="polite"`), and
raised an unhandled race: if the app is offline when a `Compat-Generation`
mismatch fires, or two mismatches fire in quick succession, the fixed
bottom banner and `OfflineStrip` could overlap or the blocking overlay
could get stuck mid-transition. Resolution below consolidates the three
into one component and removes the fixed-position/dismissible design in
favour of a simpler, always-visible, non-dismissible stack, directly below
`TopRibbon` in **both** `MainLayout` and `TeachingLayout` (the latter has
no connectivity/update indicator at all today — this is a deliberate
scope addition, agreed as part of this consolidation, not a pre-existing
gap being silently left).

**Decisions made during scoping (resolved via clarifying questions, not
assumptions):**

- The fallback state (automatic reload didn't resolve the mismatch) drops
  its "Refresh now" button entirely, not just "Dismiss" — it becomes pure
  passive status text. The user is never left with no path forward
  because the background retry (every `RETRY_INTERVAL_MS`) keeps running
  regardless; a manual button was judged unnecessary complexity once
  dismissal was already removed.
- `ForcedReloadGate` is mounted at the app root specifically so the
  _blocking_ full-screen overlay works on every route, including guest
  pages (`/login`, `/register`, etc.) that have no `TopRibbon` at all. But
  the plan's own requirement — the _fallback_ strip stacks directly below
  `TopRibbon`, alongside `MainLayout`/`TeachingLayout`'s own offline strip
  — cannot be satisfied by a component mounted outside both layouts.
  Resolution: split the existing side-effect logic (event listener, retry
  timers, `sessionStorage` bookkeeping) out of the `ForcedReloadGate`
  component and into a `ForcedReloadProvider` + `useForcedReload()` hook
  pair, mirroring the codebase's existing `ConnectivityProvider` /
  `useConnectivity()` pattern exactly. The provider wraps the app once in
  `main.tsx` (replacing the bare `<ForcedReloadGate />`) so the
  side-effects run exactly once; the _blocking_ overlay keeps rendering at
  the root (unaffected by layout, still covers guest pages); the
  _fallback_ `StatusStrip` is rendered by `MainLayout` and `TeachingLayout`
  themselves, each calling `useForcedReload()` to read `phase` and
  stacking it alongside their own connectivity strip below `TopRibbon`.
  Guest/public pages (no layout) will not show a fallback strip if a
  mismatch happens to occur there — an accepted gap, consistent with
  `OfflineStrip` never having covered guest pages either.

- [x] Create `frontend/src/components/status-strip/StatusStrip.tsx` — a
      single component replacing `OfflineStrip`, `UpdatingBanner`'s strip
      variant, and `UpdateFallbackBanner`, with a `variant` prop
      (`offline` | `reconnected` | `updating` | `fallback`) driving icon,
      message, and colour. No `onDismiss` prop, no buttons at all — these
      strips are status information, not dismissible flash messages, and
      must stay visible until their underlying condition clears
- [x] Render all strips in normal layout flow directly below `TopRibbon`
      (no fixed/overlay positioning, no z-index tiering needed); when more
      than one condition is true at once (e.g. offline **and** a pending
      forced reload), each renders its own `StatusStrip` and they stack
      vertically in the order mounted — no priority ordering between them
- [x] Responsive behaviour: full-width strip with icon + full message text
      by default; below `theme.breakpoints.sm`, only switches to a compact
      horizontal badge (icon + short label only) when a `multiple` prop is
      set — i.e. when more than one strip is showing at once. A lone
      strip always stays full-width, even on mobile; consumers
      (`MainLayout`/`TeachingLayout`) compute how many conditions are
      active and pass `multiple` to each `StatusStrip` accordingly
- [x] `frontend/src/components/status-strip/StatusStrip.module.css` —
      desktop strip layout + mobile badge layout, reusing the existing
      `--info-color`/`--warning-color`/`--success-color` design tokens
- [x] `frontend/src/components/status-strip/StatusStrip.stories.tsx` —
      every variant individually, plus explicit multi-strip stories (two
      stacked, three stacked). No viewport addon is configured in this
      repo's Storybook, so the mobile badge layout is demonstrated via a
      `StoryNote` instructing the reviewer to narrow the browser below the
      `sm` breakpoint, rather than a separate fake-mobile story
- [x] `frontend/src/components/status-strip/StatusStrip.test.tsx` —
      variant rendering, responsive class switching (via a mocked
      `window.matchMedia`, matching the `PublicLayout.test.tsx`
      precedent), accessibility attributes; no dismiss/button-related
      assertions. 12 tests, all passing
- [x] Split `ForcedReloadGate.tsx`'s side-effect logic into
      `lib/compat-generation/ForcedReloadProvider.tsx` (context provider,
      mounted once in `main.tsx`) + `useForcedReload()` hook exposing
      `phase`. Add a guard so a second `app:compat-mismatch` event while a
      reload is already in flight (`phase !== "idle"`) is ignored rather
      than overwriting the pending transition, and check `isOnline`
      (from `useConnectivity()`) before scheduling the automatic
      `location.reload()` so an offline tab goes straight to the fallback
      state instead of attempting (and silently failing) a reload
- [x] Root-mounted piece (still rendered directly in `main.tsx`, sibling to
      `RouterProvider`) keeps only the `blocking` full-screen
      `UpdatingBanner` overlay — unaffected by layout, still covers guest
      pages
- [x] Delete `frontend/src/components/offline-strip/` and
      `frontend/src/components/update-fallback-banner/` entirely; simplify
      `UpdatingBanner.tsx` back down to its `blocking` full-screen overlay
      only (that variant remains architecturally distinct — it blocks
      interaction rather than sitting in flow)
- [x] Update `MainLayout.tsx` to call `useForcedReload()` alongside its
      existing `useConnectivity()`, rendering `StatusStrip` for
      offline/reconnected/fallback (replacing `OfflineStrip`) directly
      below `TopRibbon`
- [x] Update `TeachingLayout.tsx` to do the same — call
      `useConnectivity()` (new for this layout) and `useForcedReload()`,
      rendering the same stacked `StatusStrip`s below its own `TopRibbon`
- [x] Update `MainLayout.test.tsx`, add `TeachingLayout.test.tsx`
      coverage, and update/replace `ForcedReloadGate.test.tsx` for the
      provider/hook split and the two new guards above

### Documentation

- [x] Update `docs/docs/backend/api-compatibility.md` to describe the
      `api-compatibility/` decision-file mechanism

The decision-file mechanism (file format, field meanings, immutability
rules) was already documented under "Decision files: `api-compatibility/`
folder". Updated the "Client-side reassurance" section to match the
consolidated component architecture from the frontend follow-up above:
replaced the outdated "dismissible fallback banner" description with the
actual non-dismissible `StatusStrip` (`variant="fallback"`) behaviour, and
added a "Component architecture" subsection describing the
`ForcedReloadProvider`/`useForcedReload()` split (mirroring
`ConnectivityProvider`), the root-mounted blocking overlay, and
`StatusStrip` replacing the three converged components.

- [x] Cross-reference this sub-plan from
      `2026-08-09-alembic-review-and-revisions-plan.md` item 14/15, since
      it resolves the "not yet wired up" gap noted there

Already in place from item 14's own write-up (references this sub-plan by
name for "the design for how the reload-trigger code learns a given reload
is a contract-step one") and from the "Close the client-side half of the
compatibility window" item, which explicitly points here and defers
ticking itself until this sub-plan's own checklist is complete.
