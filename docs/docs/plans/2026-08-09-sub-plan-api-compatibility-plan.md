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
   actually live), do **not** force again immediately. Track the attempted
   generation in `sessionStorage`; wait 2 mins, and on a second consecutive failure, fall
   back to a passive, dismissible banner (something like "An update is available but couldn't be applied automatically, please refresh manually") instead of looping the reload.

### Deploy ordering constraint

Deploy the backend first (it must already accept both old and new client
behaviour per the expand-contract discipline already in place), then the
frontend bundle, and only publish/serve the new `Compat-Generation`
value from the backend once the new frontend bundle is actually live and
reachable. Publishing the new generation before the matching bundle is
live causes tabs to reload into a bundle that still reports the old
generation, triggering an immediate second forced reload — this is
exactly the loop the `sessionStorage`-tracked fallback above exists to
catch, but it should not be relied upon as the primary safeguard; get the
ordering right in the deploy pipeline.

**Gap in the current pipeline (`.github/workflows/deploy.yml`):** today the
backend deploy already uses a tagged revision with `--no-traffic` plus a
health-check-then-promote step (`.github/scripts/deploy/deploy-tagged.sh`),
but the frontend deploy promotes immediately with no equivalent health
check or traffic gating. Backend promotion (and therefore whatever
`Compat-Generation` it starts serving) is not currently gated on the
frontend bundle actually being live, so the ordering constraint above is
not yet enforced mechanically — see the implementation checklist.

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

- [ ] Create `api-compatibility/` at the repo root
- [ ] Add the bootstrap file (`generation: 1`, `forces_reload: false`,
      `change: "none"`)
- [ ] Document the YAML schema (field meanings, immutability rules) in
      `docs/docs/backend/api-compatibility.md` or a new linked page

### `backend/scripts/new_compat_decision.py`

- [ ] Implement the interactive CLI per the spec above
- [ ] `backend/tests/test_new_compat_decision.py` covering slug
      derivation, generation increment/collision handling (both
      `forces_reload` values), filename regex, and empty/newline
      input refusal
- [ ] Verify script conventions match `backend/scripts/create_user.py` /
      `admin_cli.py` (docstring, `from __future__ import annotations`,
      stdlib-only prompts)

### CI enforcement

- [ ] New script(s) under `.github/scripts/ci/` implementing: every
      flagged change has a matching file; `reason` non-empty; `change`
      is a single scalar; field-level immutability diff (`generation`,
      `forces_reload`, `change`) against `main`; no deleted files;
      filename regex; duplicate-`generation` check for
      `forces_reload: true` files only; range check for
      `forces_reload: false` generations (rule 7a); stale `change`
      string check against this run's oasdiff output
- [ ] Companion `.bats` tests for each new CI script
- [ ] Wire the new step(s) into `.github/workflows/ci.yml`, gated the
      same way as `heavy_api_schema_diff` /
      `heavy_api_breaking_change_gate`
- [ ] Confirm `strict_required_status_checks_policy` in
      `infra/github/branch_rules.tf` still covers `main` once the new
      checks are added as required status checks (no change expected)

### Backend

- [ ] Read `api-compatibility/` at startup/build and compute
      `required_client_generation`
- [ ] Serve `Compat-Generation` on every API response

### Frontend

- [ ] Bake `COMPAT_GENERATION` in at build time (Vite `define`)
- [ ] Response interceptor in `lib/api.ts` comparing baked-in `C` against
      served `S`
- [ ] Forced-reload flow: reuse/extend `UpdatingBanner` for the blocking
      modal, stop/queue mutating requests, persist and restore
      in-progress form state via `sessionStorage`, second-failure
      passive-banner fallback
- [ ] `.stories.tsx` + `.test.tsx` for any new/modified component
- [ ] Confirm this path is documented as overriding (not conflicting
      with) the existing item 14/15 whitelist-gated silent reload, which
      continues to handle all `forces_reload: false` cases unchanged

### Deploy pipeline

- [ ] Extend the frontend deploy step in `.github/workflows/deploy.yml`
      to be health-checked and traffic-gated before promotion (today only
      the backend uses `deploy-tagged.sh`'s `--no-traffic` +
      health-check-then-promote; the frontend promotes immediately)
- [ ] Ensure the backend does not start serving a new `Compat-Generation`
      until the matching frontend bundle is confirmed live and reachable

### Documentation

- [ ] Update `docs/docs/backend/api-compatibility.md` to describe the
      `api-compatibility/` decision-file mechanism
- [ ] Cross-reference this sub-plan from
      `2026-08-09-alembic-review-and-revisions-plan.md` item 14/15, since
      it resolves the "not yet wired up" gap noted there
