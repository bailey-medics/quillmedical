# Database destructive migration review plan

`check_migrations.py` already requires a `# migration-check: allow-destructive`
marker on any migration whose `upgrade()` calls `drop_column`, `drop_table`,
or `drop_constraint` (see "Destructive changes" in
`.claude/rules/backend.md`). That marker is self-attested: whoever writes
the migration — human or AI coding agent — adds the comment themself, and
the checker only confirms the comment exists, not that a second, accountable
decision was made. This is exactly the gap the API breaking-change gate
(item 15 of the
[alembic review and revisions plan](2026-08-09-alembic-review-and-revisions-plan.md),
documented in `docs/docs/backend/api-compatibility.md`) was built to close
for the API boundary: a `# api-check: breaking-change` code comment, a
commit trailer, and a PR label were all considered and rejected there,
because each is just text an agent produces as routinely as the code
itself — none of them prove a human decided the change was intentional. The
same reasoning applies to a dropped column or table: in a healthcare system,
a silently-approved `drop_column` can discard clinical audit history with
no record that anyone weighed that cost.

The outcome of this plan is a second instance of the same pattern already
proven for API changes — automated detection plus a required-reviewer
GitHub Actions environment gate, Slack-notified — applied to destructive DB
migrations. It reuses the existing reviewer, the existing Slack channel, the
existing notification-dedup mechanism (see Phase 5), and the existing
accountability rationale (a set author is the approver, by design — see
below) rather than inventing new mechanics. The static marker
check stays as-is (note location change below); it's still a useful fast,
pre-commit-level nudge that
forces the marker to exist, and does not need replacing — this plan adds the
missing human decision on top of it, and deliberately does **not** let the
marker's presence or absence influence whether the gate fires, so the gate
can't be satisfied by the same text the checker already accepts.

Note where that marker lives, since the comparison above could suggest
otherwise: `# migration-check: allow-destructive` sits inside the **migration
file** (`backend/alembic/versions/*.py`), directly above the destructive
call — not in application source, where the rejected
`# api-check: breaking-change` comment would have gone. That difference is
what makes a comment an acceptable home for this attestation at all.
`docs/docs/backend/api-compatibility.md` rejects a code comment for the API
boundary partly because application source "is edited repeatedly forever, so
a marker added for one breaking change sits there permanently and can
silently 'cover' an unrelated, unreviewed change to the same endpoint months
later" — and names the Alembic migration file ("write once, reviewed once,
never revisited") as the explicit counterexample. A migration is authored
once and never revisited, so its marker cannot drift onto work it was never
written for.

## Phase 1: Detection — report destructive ops independent of the marker

- [x] Add a non-failing, informational mode to
      `backend/scripts/check_migrations.py` (e.g. `--report-destructive
<file> [<file> ...]`) that parses the given migration file paths and
      prints one line per file listing any `drop_column` / `drop_table` /
      `drop_constraint` calls found in `upgrade()` — **regardless of
      whether the `allow-destructive` marker is present**. Reuse the
      existing `collect_migrations`/AST-walk logic (`DESTRUCTIVE_OPS`,
      `_call_name`) rather than duplicating it; this mode reports, it does
      not raise `Problem`s or set an exit code — the existing `check_all`
      path is unchanged and keeps failing on a missing marker independently
      of this gate.
- [x] Add `backend/tests/test_check_migrations.py` (or extend it if it
      already covers other modes) coverage for the new mode: a fixture
      migration with a non-destructive `add_column` is not reported; a
      fixture with `drop_column` and the marker is still reported (the
      marker must not suppress detection); a fixture with `drop_table` and
      no marker is reported; a fixture touching only `alter_column` is not
      reported.

## Phase 2: CI detection job

- [x] Add `heavy_db_destructive_migration_check` to `.github/workflows/ci.yml`,
      heavy tier (`if: github.event_name == 'pull_request' &&
github.event.pull_request.draft == false`), mirroring
      `heavy_api_schema_diff`'s two-checkout structure (PR branch + main
      branch, `fetch-depth: 0`).
      **Deviation, agreed during implementation:** a *single* checkout is
      used, not two. `heavy_api_schema_diff` needs `main/` because it runs
      `dump_openapi.py` against main's code to produce a spec to diff; this
      job only needs the *filenames* added on the PR (`git diff
      --diff-filter=A origin/main...HEAD`), and those files exist in the PR
      checkout already, so a second working tree would be unused. The job
      also needs no Poetry install — `check_migrations.py` is pure stdlib,
      so bare `python3` on the runner is enough.
- [x] Diff `backend/alembic/versions/*.py` between `origin/main` and the PR
      branch (`git diff --name-only --diff-filter=A
origin/main...HEAD -- backend/alembic/versions/*.py`) to get the set
      of migration files **newly added on this PR** — mirroring how
      `oasdiff` diffs `main` against the PR branch rather than re-scanning
      the whole history each time. A migration merged in an earlier PR was
      already gated when it was added.
- [x] Run the new `--report-destructive` mode against that file set; set a
      `destructive` job output (`true`/`false`) and capture the per-file
      op summary for the notification/job-summary steps.
- [x] Write a job summary (mirroring
      `.github/scripts/ci/write-breaking-changes-summary.sh`) listing each
      flagged migration, its revision id, and which destructive ops were
      found, when `destructive == 'true'`.
- [x] Add `.github/scripts/ci/*.bats` coverage for any new shell glue,
      matching the existing pattern (`check-api-breaking-changes.bats`).

## Phase 3: Terraform — the approval environment

- [x] Add a `db_destructive_migration_review` block to
      `infra/github/environments.tf`, directly mirroring
      `api_breaking_change_review`: same reviewer
      (`data.github_user.api_breaking_change_reviewer` — reuse rather than
      look up `Cotswoldsmaker` a second time), `prevent_self_review =
false`, and a comment carrying the same accountability rationale (a
      second reviewer isn't inherently more careful than the author; the
      goal is one genuine, separate, deliberate approval action from
      whoever is accountable, not diffusing accountability across more
      people).
- [x] Set `can_admins_bypass = false` on this environment **and** on the
      existing `api_breaking_change_review`, so both gates are binding rather
      than advisory. Today the sole admin and the sole reviewer are the same
      person, making the setting look redundant — but the roles are expected
      to diverge: a Clinical Safety Officer with coding experience is the
      right approver for discarding clinical audit history, whereas a repo
      admin may have minimal clinical experience. The default (`true`) would
      let exactly the wrong role wave the change through.
- [ ] Note in the PR description that `terraform apply` is a manual,
      separate step (as it was for `api-breaking-change-review`) — not run
      as part of this plan's implementation, and coordinate with the repo
      owner before applying.
- [ ] **Apply this phase before Phase 4 merges** — see the sequencing hazard
      recorded under Phase 4. Until the environment exists with its required
      reviewer, the gate job passes without approving anything.

## Phase 4: Human gate job

**Sequencing hazard, found during implementation — Phase 3 must be applied
before this phase merges. Resolved: Phase 3's `terraform apply` ran on
2026-08-27 and both environments were verified live via the GitHub API
(`can_admins_bypass: false`, reviewer `Cotswoldsmaker`) before this phase was
committed.** The gate's entire blocking power comes from the
`db-destructive-migration-review` environment having a required reviewer. That
environment is created by Phase 3's Terraform, and `terraform apply` is a
manual step. If this phase merges first, the environment does not yet exist
with its protection rule, and a workflow referencing a missing environment
gets one created implicitly, with **no** protection rules attached. The gate
job would then pass instantly, with no human approving anything, while
appearing green and being listed as a required check — a gate that looks
enforced and enforces nothing, which is worse than no gate at all because it
manufactures false confidence. Order: apply Phase 3's Terraform first, confirm
the reviewer is attached to the environment in the GitHub UI, and only then
merge this phase.

- [x] Add `heavy_db_destructive_migration_gate` to `ci.yml`: `needs:
heavy_db_destructive_migration_check`, `if:
needs.heavy_db_destructive_migration_check.outputs.destructive ==
'true'`, `environment: db-destructive-migration-review` — directly
      mirroring `heavy_api_breaking_change_gate`.
- [x] Add both job names (`DB destructive migration check`, `DB
destructive migration review gate`) as required status checks in
      `infra/github/branch_rules.tf`, alongside the existing "API
      compatibility" required-check block.

## Phase 5: Slack notification, deduplicated

The API gate's Slack job originally re-pinged on every push to a non-draft
PR, because the `pull_request` trigger fires on `synchronize` and not just
on PR open; the
[API breaking change notification dedup plan](2026-08-27-api-breaking-change-notify-dedup-plan.md)
closed that by hashing the current change-set and recording the hash on a
sticky PR comment, notifying only when the hash moves. The same trigger
applies to this gate, so dedup is built in from the start here rather than
shipping a noisy job and retrofitting it.

- [ ] Generalise `.github/scripts/ci/dedup-breaking-change-notify.sh` into
      a marker-key-parameterised `.github/scripts/ci/dedup-notify.sh`
      (`<marker-key> <pr-number> <hash> <title>`): the marker becomes
      `<!-- <marker-key>: <hash> -->` and `build_body`'s blurb takes the
      title, leaving `find_marker_comment`'s matching/capture logic
      otherwise as-is. Update the existing `heavy_api_breaking_change_dedup`
      caller to pass `breaking-api-change-hash`, keeping its marker string
      byte-identical so marker comments already sitting on in-flight PRs
      still match.
- [ ] Carry `dedup-breaking-change-notify.bats` over to the renamed script
      and extend it with a second, distinct marker key, proving the two
      gates' marker comments don't collide on a PR that trips both.
- [ ] Extract `compute-breaking-change-hash.sh`'s `hash_change_lines`
      (`sort | sha256sum`) into a shared helper both callers source, so the
      "sorted identity lines in, stable hash out" contract lives in one
      place. Hash the Phase 1 `--report-destructive` output lines — one per
      flagged migration, each carrying its revision id and the ops found —
      to get the destructive-change-set hash, and set it as a
      `heavy_db_destructive_migration_check` job output alongside
      `destructive`.
- [ ] Add `heavy_db_destructive_migration_dedup` to `ci.yml`, mirroring
      `heavy_api_breaking_change_dedup`: `needs:
heavy_db_destructive_migration_check`, same `if:` condition as the
      gate job, marker key `db-destructive-migration-hash`, output
      `should_notify`.
- [ ] Add `heavy_db_destructive_migration_notify` to `ci.yml`, using the
      existing reusable `.github/workflows/slack-notify.yml`, `channel:
teaching` (same webhook, no new secret), gated on **both**
      `...check.outputs.destructive == 'true'` and
      `...dedup.outputs.should_notify == 'true'`. Message includes the
      flagged migration(s), the ops found, the PR link, and a link to
      "Review pending deployments" for the
      `db-destructive-migration-review` environment, mirroring the API
      breaking-change Slack message.
- [ ] Leave `heavy_db_destructive_migration_gate` (Phase 3) untouched by
      the dedup output — as with the API gate, approval is SHA-scoped and
      stays required on every push; only Slack noise is deduplicated.

## Phase 6: Documentation — ✅ COMPLETE

- [x] Extend the "Destructive changes" section of
      `.github/instructions/backend.instructions.md` (source of truth —
      `.claude/rules/backend.md` is synced from it) with an "Enforcement:
      CI detection + required-reviewer environment gate" subsection,
      mirroring the API compatibility section's equivalent subsection:
      what's detected, why detection ignores the marker, and that the
      `db-destructive-migration-review` environment approval is the only
      way a destructive migration proceeds.
- [x] Add a "Layer 3 — human review gate for destructive migrations"
      section to `docs/docs/backend/alembic-migration-safety.md`,
      following the existing Layer 1 / Layer 2 structure, covering the
      Slack dedup mechanism and its trade-off (as
      `docs/docs/backend/api-compatibility.md` does for the API gate), and
      add this plan to its "Related" list.
- [x] Update `docs/docs/backend/api-compatibility.md` where it names
      `dedup-breaking-change-notify.sh` to reflect the Phase 4 rename to
      the shared `dedup-notify.sh`.
- [x] Run `/sync-copilot-config` to propagate the instructions edit into
      `.claude/rules/backend.md` and report any other drift it finds.
- [x] Register this plan in `docs/docs/plans/index.md`.

**Status:** Commit 87615617. All documentation sections added and published. Awaiting manual verification (Phase 7) before implementing immutability checks (Phase 8).

## Phase 7: Verification — ⏳ PENDING (Manual human task)

**This phase is a manual walkthrough on a throwaway branch/PR — not automated. Do not merge the throwaway PR.**

- [ ] Unit tests from Phase 1 pass (`just ub -k check_migrations`), and
      the Phase 4 `.bats` suites pass for both marker keys.
- [ ] One-off manual GitHub walkthrough on a throwaway branch/PR (not
      merged):
- [ ] a migration with no destructive ops leaves the gate
      skipped
- [ ] a migration with a `drop_column` (marker present or not —
      prove the marker doesn't suppress the gate) sends it to `waiting`,
      posts to Slack, and blocks the required check until the environment
      is approved or rejected.
- [ ] On the same throwaway PR, push a second,
      unrelated commit and confirm Slack stays silent while the gate still
      re-blocks
- [ ] add a second destructive migration and confirm the
      hash moves, the marker comment is edited in place (not appended to),
      and one fresh Slack message lands.
- [ ] Review and reject the gate
- [ ] Submit another unrelated PR
- [ ] Review and accept the gate

### DO NOT MERGE TO MAIN

Unlike the API gate's permanent dummy
endpoints, don't leave a fabricated destructive migration in the
real chain afterwards — close/delete the throwaway branch once the
walkthrough is captured, since a real Alembic chain can't carry a
disposable fixture revision the way a pair of flag-gated dummy API
endpoints can.

## Phase 8: Make migration immutability real — ⏳ NOT STARTED

**Start after Phase 7 verification completes. This phase adds enforced immutability checks to prevent edits to merged migrations.**

Migrations are described everywhere as "write once, reviewed once, never
revisited" — `docs/docs/backend/api-compatibility.md` leans on exactly that
property to justify a comment being an acceptable home for the
`allow-destructive` marker. Nothing enforces it. `check_migrations.py` runs
five checks (chain integrity, description, reversibility, NOT NULL trap,
destructive marker) and none of them is an immutability check, and nothing
in CI or pre-commit guards `backend/alembic/versions/` against modification.

This matters to the gate built above: Phase 2 deliberately diffs with
`--diff-filter=A`, so a `drop_column` *added to a migration already on main*
is invisible to it. Alembic will not re-run an applied revision, so such an
edit would not drop anything on an already-migrated environment — but it
would on any database built from scratch afterwards, and nothing currently
stops the edit being made. Mirrors `validate_no_deletions` in
`.github/scripts/ci/validate-compat-files.sh`, which enforces the same
property for API decision files.

**Scope: the whole file, including the marker and its rationale.** An
earlier draft proposed comparing `ast.dump()` so comment-only edits stayed
legal. That is the wrong rule here: the `allow-destructive` marker and its
rationale *are* comments, and they are the record of a decision a human
reviewed and approved at the gate. Editing them afterwards makes the original
approval meaningless — the same reasoning that freezes `change` and
`forces_reload` on API decision files. Since the body, the marker, and the
rationale must all be immutable, almost nothing meaningful in a migration is
left editable, so AST comparison buys complexity for a vanishing exception.
The rule is therefore the simple one: **a merged migration file does not
change, at all.**

**Sequencing constraint.** Any planned retrofit of existing migrations must
land *before* this phase. Specifically, the marker-hardening work (adding
per-op rationales to `fa4401ce1b92`) edits a merged migration by design; once
Phase 8 is in place that edit is impossible without a documented bypass.
Order: retrofit first, immutability second.

- [ ] Add `.github/scripts/ci/check-migrations-unmodified.sh`, following the
      conventions in `.claude/rules/workflows.md` (header block,
      `set -euo pipefail`, `shared/logging.sh`, args validated first). Diff
      `backend/alembic/versions/*.py` between `<main-ref>` and `HEAD` with
      `--diff-filter=MDR` to catch modifications, deletions, and renames.
      Unlike `detect-destructive-migrations.sh` this script **fails the build
      directly** (exit 1) rather than routing to a human gate: there is no
      legitimate case to approve, so an approval step would only add a
      rubber-stamp.
- [ ] Add `heavy_db_migration_immutability_check` to `.github/workflows/ci.yml`,
      heavy tier, single checkout with `fetch-depth: 0` (same shape as
      `heavy_db_destructive_migration_check`, and for the same reason — only
      the diff is needed, not a second working tree).
- [ ] Add the job name as a required status check in
      `infra/github/branch_rules.tf`, alongside the Phase 3 entries.
- [ ] Add `.github/scripts/ci/check-migrations-unmodified.bats` covering:
      a PR that adds a new migration passes; a PR that modifies a merged
      migration fails; a PR that deletes one fails; a PR that renames one
      fails; a PR touching no migrations passes; and — importantly — a
      **comment-only** edit still fails, since the marker and its rationale
      are comments and must not be rewritten after approval.
- [ ] Document the rule in `.github/instructions/backend.instructions.md`
      under "Creating migrations" (source of truth), then run
      `/sync-copilot-config`. State what to do instead: a migration that
      turns out to be wrong is corrected by a **new** migration, never by
      editing the old one — the same "supersede, never amend" rule the API
      decision files already follow. Say explicitly that this covers the
      `allow-destructive` marker and its rationale: they record an approval
      that already happened, so a later rewrite would misrepresent what was
      approved. A rationale that turns out to be wrong is corrected in the
      superseding migration, not by amending the original.
- [ ] Add a "Layer 4 — migration immutability" section to
      `docs/docs/backend/alembic-migration-safety.md`, and note there that
      this is what makes the "write once, never revisited" claim in
      `api-compatibility.md` true rather than aspirational.

## Decisions

- **Detection ignores the `allow-destructive` marker entirely** — The whole
  point is a check the marker's own text can't satisfy — mirrors the API
  gate's rejection of a code comment as proof of a human decision. The
  existing static check (marker required) is left in place unchanged, purely
  as a separate, faster nudge
- **Reuse the existing reviewer and Slack channel rather than create new
  ones** — No reason to diffuse accountability further or fragment
  notifications; the same rationale that put a single named,
  non-self-review-exempt reviewer on `api-breaking-change-review` applies
  unchanged here
- **Gate covers `drop_column` / `drop_table` / `drop_constraint` uniformly,
  no per-op risk tiering** — Matches `check_migrations.py`'s existing
  `DESTRUCTIVE_OPS` set; splitting risk tiers (e.g. treating a constraint
  drop as lower-risk than a column drop) is easy to add later if it proves
  too noisy, but starting uniform avoids guessing at a risk model with no
  data yet
- **No special-case detection for column/table renames** — A rename already
  ships as add-then-drop across separate deploys (see "Renaming or retiring
  a column" in `.claude/rules/backend.md`); the contract step of that
  pattern **is** a `drop_column` call, so it's already covered without extra
  logic
- **Diff `main` vs the PR branch for _new_ migration files only, not a
  full-history rescan** — Mirrors `oasdiff`'s main-vs-PR diff; a migration
  merged in an earlier PR was already gated when it was added, so
  re-flagging it on every later PR would be noise
- **No permanent dummy destructive migration fixture (unlike the API gate's
  permanent dummy endpoints)** — The API gate could afford two permanent,
  flag-gated no-op endpoints because they cost nothing sitting in the served
  app. A destructive Alembic migration is a real, one-way step in a real
  linear chain — there's no equivalent "disposable but permanent" fixture,
  so verification is a one-off manual walkthrough on a throwaway branch
  instead
- **Slack dedup built in from the start, rather than shipping a noisy notify
  job and retrofitting it** — The API gate needed a follow-up plan to fix
  exactly this noise; the `pull_request`/`synchronize` trigger behaves
  identically here, so the noise is a known certainty, not a risk to
  discover in production
- **Generalise the existing dedup script to a marker key rather than copy
  it** — Two near-identical scripts would drift; the only genuinely
  gate-specific parts are the marker key and the blurb, so both become
  parameters. The API caller's marker string stays byte-identical so
  in-flight PRs' existing comments keep matching
- **Dedup key = hash of the flagged migration/op set, not the boolean
  `destructive` flag** — Same reasoning as the API gate: a boolean can't
  tell "same destructive migration, new commit" from "a second destructive
  migration was added". In practice the set only moves when a migration file
  is added, so this is usually one ping per PR
- **Approval gate left ungated by `should_notify`** — Mirrors the API gate:
  environment approval is SHA-scoped and deliberately re-required on every
  push. Dedup is a notification-noise control only, never a safety control
- **Migration immutability is enforced separately (Phase 8), not folded into
  the destructive gate** — The gate answers "should this drop be approved?";
  immutability answers "should this file have changed at all?". The second has
  no legitimate yes, so it fails the build outright rather than routing to a
  reviewer — bolting it onto the gate would mean asking a human to approve
  something that is never acceptable
- **A destructive migration removed and then re-added identically stays
  silent** — Accepted trade-off, inherited unchanged from the API dedup
  plan: the stale marker hash genuinely still matches. The gate still blocks
  and still needs a fresh approval, so this affects Slack noise only
