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
existing notify-once-per-change-set mechanism (see Phase 5), and the existing
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

## Phase 5: Slack notification, once per change-set — ✅ COMPLETE

The API gate's Slack job originally re-pinged on every push to a non-draft
PR, because the `pull_request` trigger fires on `synchronize` and not just
on PR open; the
[API breaking change notification dedup plan](2026-08-27-api-breaking-change-notify-dedup-plan.md)
closed that by hashing the current change-set and recording the hash on a
sticky PR comment, notifying only when the hash moves. The same trigger
applies to this gate, so notify-once is built in from the start here rather than
shipping a noisy job and retrofitting it.

- [x] Generalise `.github/scripts/ci/dedup-breaking-change-notify.sh` into
      a marker-key-parameterised `.github/scripts/ci/gate-notify.sh`
      (`<marker-key> <pr-number> <hash> <title>`): the marker becomes
      `<!-- <marker-key>: <hash> -->` and `build_body`'s blurb takes the
      title, leaving `find_marker_comment`'s matching/capture logic
      otherwise as-is. **Superseded during review — see Phase 5b.** Update the existing `heavy_api_breaking_change_dedup`
      caller to pass `breaking-api-change-hash`, keeping its marker string
      byte-identical so marker comments already sitting on in-flight PRs
      still match.
      **Note:** `dedup-breaking-change-notify.sh` was deleted rather than
      kept as a wrapper — a wrapper would have left two entry points to the
      same logic and a stale bats suite testing functions that no longer
      lived there. The generalised script is named `gate-notify.sh`, not
      `dedup-notify.sh`: sending one message per distinct finding is what a
      notification should do anyway, so naming the artefacts after
      "deduplication" describes a past fix rather than the responsibility.
- [x] Carry `dedup-breaking-change-notify.bats` over to the renamed script
      and extend it with a second, distinct marker key, proving the two
      gates' marker comments don't collide on a PR that trips both.
      **Addition:** `count_marker_comments` was added alongside (defence in
      depth) — this gate only ever updates a marker in place, so a second
      marker for the same key means one was created outside the gate (a
      copy-paste, a hand-edit). It logs a warning and continues on the first
      marker rather than failing, since the first is still the one the gate
      wrote.
- [x] ~~Extract `compute-breaking-change-hash.sh`'s `hash_change_lines`
      (`sort | sha256sum`) into a shared helper both callers source, so the
      "sorted identity lines in, stable hash out" contract lives in one
      place.~~ **Not done, deliberately.** A shared module was written and
      then removed: the function is a single line, it has two consumers, and
      the two hashes are independent — nothing ever compares the API gate's
      hash against the migration gate's, so there is no contract between them
      to centralise. The extraction cost a new file in `shared/` (which
      otherwise holds only `logging.sh`, sourced by every script), a
      `# shellcheck source=` directive in each consumer, and an indirection
      for anyone reading either script — to save one line. The part actually
      worth preserving is *why* the input is sorted; that is now a comment in
      both scripts. Hash the Phase 1 `--report-destructive` output lines — one per
      flagged migration, each carrying its revision id and the ops found —
      to get the destructive-change-set hash, and set it as a
      `heavy_db_destructive_migration_check` job output alongside
      `destructive`.
- [x] Add `heavy_db_destructive_migration_gate_notify` to `ci.yml`,
      mirroring `heavy_api_breaking_change_gate_notify`: `needs:
heavy_db_destructive_migration_check`, same `if:` condition as the
      gate job, marker key `db-destructive-migration-hash`, output
      `should_notify`.
- [x] Add `heavy_db_destructive_migration_notify` to `ci.yml`, using the
      existing reusable `.github/workflows/slack-notify.yml`, `channel:
teaching` (same webhook, no new secret), gated on **both**
      `...check.outputs.destructive == 'true'` and
      `...should_notify.outputs.should_notify == 'true'`. Message includes the
      flagged migration(s), the ops found, the PR link, and a link to
      "Review pending deployments" for the
      `db-destructive-migration-review` environment, mirroring the API
      breaking-change Slack message.
- [x] Leave `heavy_db_destructive_migration_gate` (Phase 3) untouched by
      the `should_notify` output — as with the API gate, approval is SHA-scoped and
      stays required on every push; only Slack noise is deduplicated.

## Phase 5b: A comment per change-set, newest wins — ✅ COMPLETE

Phase 5 shipped a single sticky comment per gate, edited in place as the
change-set moved. Reviewed and changed: the comment's *content* was current
but its *position* was historical, so on a PR that added `drop_column` early
and `drop_table` twenty commits later, the comment sat beside the first commit
while describing the latest finding. Both gates now add a comment per distinct
change-set, and consult only the newest one, so the PR conversation reads as a
chronological record of what was found and when.

- [x] Replace `find_marker_comment` (first marker for the key, capturing its
      hash via regex) with `latest_announcement_matches <comments>
<marker-key> <hash>`. The question is no longer "what does the marker
      say?" but "is this gate's newest comment already for this exact
      change-set?", which collapses the capture regex into a `startswith` on
      the full `<!-- <marker-key>: <hash> -->` line.
- [x] Select that newest comment with `max_by(.id)` rather than taking the
      last element. GitHub does return issue comments oldest-first, but ids
      are monotonic, so this is a stronger guarantee for free and the result
      cannot depend on how the API happened to order its response. Covered by
      a test that feeds the comments newest-first.
- [x] Drop the `gh api -X PATCH` branch from `main` entirely; comments are
      only ever created, never edited.
- [x] Drop the duplicate-comment warning. Two comments carrying the same hash
      is now legitimate (A → B → A leaves two A comments), so "expected at
      most one" no longer holds. Accepted loss: it had been catching
      hand-created or copy-pasted markers.
- [x] Applies to **both** gates - `gate-notify.sh` is shared, and the ask was
      for identical behaviour on API and migration breaks.

**Why newest-wins rather than searching the whole history.** An earlier
revision of this phase asked "does *any* comment carry this hash?", which made
returning to a previously-announced change-set silent - a blind spot wider
than the one Phase 5 had. Consulting only the newest comment removes it: A → B
→ A announces three times, because each step differs from the state before it.
A comment is a record of a transition, not a claim about the whole PR.

**A return to clean is recorded too.** "No findings" is passed as the literal
hash `none`, so it is a state like any other: a PR that had destructive
migrations and no longer does differs from its last announcement, and gets a
comment saying so. Two things keep that from being noise. A PR this gate has
never commented on stays silent - there is no finding to report the
disappearance of - and Slack is not told, because the notify job is gated on
the detection job having found something *as well as* `should_notify`. So an
all-clear lands on the PR timeline without paging anyone.

The gate-notify jobs therefore run whenever their detection job ran, rather
than only when it found something. The approval gate is untouched by all of
this and still re-blocks on every push for as long as a migration is present.

**Superseded in part by
[Gate notification workflow](2026-08-29-gate-notification-workflow-plan.md).**
All of this moved out of `ci.yml` into `gate-breaking.yml`, because `ci.yml`
cancels superseded runs and so could lose a commit's record entirely. The
comment behaviour described above is unchanged; what changed is which workflow
runs it, and that every commit's decision now runs, in commit order. Job ids
lost their `heavy_` prefix in the move.

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
      notify-once-per-change-set mechanism and its trade-off (as
      `docs/docs/backend/api-compatibility.md` does for the API gate), and
      add this plan to its "Related" list.
- [x] Update `docs/docs/backend/api-compatibility.md` where it names
      `dedup-breaking-change-notify.sh` to reflect the Phase 4 rename to
      the shared `gate-notify.sh`.
- [x] Run `/sync-copilot-config` to propagate the instructions edit into
      `.claude/rules/backend.md` and report any other drift it finds.
- [x] Register this plan in `docs/docs/plans/index.md`.

**Status:** Commit 87615617. All documentation sections added and published. Awaiting manual verification (Phase 7) before implementing immutability checks (Phase 8).

## Phase 7: Verification — ✅ WALKTHROUGH COMPLETE (approval + race checks outstanding)

**This phase is a manual walkthrough on a throwaway branch/PR — not automated. Do not merge the throwaway PR.**

It now covers two plans: this one, and the
[gate notification workflow](2026-08-29-gate-notification-workflow-plan.md)
that moved these jobs into `gate-breaking.yml`. Both need the same throwaway
PR, so both are verified in one pass — see the second checklist below.

**Sequencing note: verification cannot start before Phase 5 is merged.** The
first walkthrough attempt ran with Phases 1–4 merged but Phase 5 not yet
written. The gate blocked correctly, but no Slack message and no record
comment appeared — because
`heavy_db_destructive_migration_gate_notify` and
`heavy_db_destructive_migration_notify` did not exist in `ci.yml` at all.
Confirmed by listing the run's jobs: the check and gate jobs were present, the
decision and notify jobs were absent. The missing notification was not a
Terraform/webhook problem (a `terraform apply` run at the time changed nothing
relevant) — the phase simply had not shipped. Do not re-diagnose this as
infrastructure: check the workflow contains the jobs first.

**Do the walkthrough on its own throwaway PR.** The first attempt used
`feature/phase-7-verification` (PR #420), adding
`2026_08_28_1200-aabbccdd1111_phase_7_test_destructive.py` — a migration that
adds then drops a test column on the `users` table. That branch then grew to
carry Phases 5 and 5b, and a deliberately destructive migration cannot
merge: the gate blocks it, as designed. The test migration was therefore
**removed** from that branch so the gate work itself could merge, leaving
`fa4401ce1b92` as the chain head again.

The migration is worth recreating verbatim when the walkthrough runs, since it
was verified to:

- ✅ Pass `check_migrations.py` validation
- ✅ Execute successfully (add then drop, no permanent change)
- ✅ Trigger `heavy_db_destructive_migration_check` (contains `drop_column`)

Gate status on that first attempt (with Phase 5 not yet merged):

- ✅ CI detected the destructive op
- ✅ Gate correctly blocks at `waiting` (required approval from `db-destructive-migration-review` env)
- ❌ No Slack notification — the notify job did not exist yet
- ❌ No record comment — the notification-decision job did not exist yet

### Setup

- [ ] Open a **fresh** throwaway branch/PR off a `main` carrying Phases 5 and
      5b plus the
      [gate notification workflow](2026-08-29-gate-notification-workflow-plan.md).
      Title it **DO NOT MERGE**.
- [x] Unit tests from Phase 1 pass (`just ub -k check_migrations`) — 26
      tests green, and the full backend unit suite passes at 751. The Phase 4
      `.bats` suites pass for both marker keys, at 173 across
      `.github/scripts` (up from 151: the gate notification workflow added
      `wait-for-ancestor-decisions.bats`).
- [ ] **Required checks report.** `infra/github/branch_rules.tf` pins four
      contexts by name — "API breaking-change check", "API breaking-change
      review gate", "DB destructive migration check", "DB destructive
      migration review gate". They moved from `ci.yml` to `gate-breaking.yml`;
      for Actions the context *is* the job's `name:`, so identical names
      should mean no Terraform change. **Confirm this before anything else:**
      if a context no longer reports, branch protection blocks every merge,
      and the fix belongs in the same PR.
- [ ] Confirm the run contains `db_destructive_migration_gate_notify` and
      `db_destructive_migration_notify` — now in `gate-breaking.yml`, without
      the `heavy_` prefix.
- [ ] With no destructive migration and no API break yet, confirm both gates
      are **skipped**, which counts as passing.

### Making each kind of break

- **Destructive migration** — `just migrate "phase 7 test"`, then edit the
  generated file to `op.drop_column(...)` on a throwaway column. It needs the
  `# migration-check: allow-destructive` marker or pre-commit rejects the
  commit locally. Detection ignores the marker; the marker only satisfies the
  static check.
- **API break** — flip one of the three flags in
  `backend/app/test_api_endpoints.py` (`MUTATE_REMOVE_MESSAGE_1`,
  `MUTATE_REMOVE_DETAIL_1`, `MUTATE_REMOVE_SUMMARY_2`) from `False` to `True`.
  These exist for exactly this. **Each flip also needs a decision file**
  (`python backend/scripts/new_compat_decision.py`) — without one,
  `validate-compat-files.sh` fails `api_schema_diff`, the decide job is
  skipped as a result, and you get a validation-failure Slack message rather
  than the gate behaviour you meant to test.

### The walkthrough

**Every numbered step is one separate `git push`.** Batching commits into a
single push fires one `synchronize` event and produces one run, which tests
nothing about ordering. Wait for CI to settle between steps.

Each step gives the command to run, then what to look for.

**Migrations — the marker must not suppress the gate**

- [ ] **1.** Add destructive migration **A** *without* the marker.
      `just migrate "phase 7 test a"`, edit the generated file to
      `op.drop_column("users", "test_column")` in `upgrade()`, then
      `git commit --no-verify` (pre-commit will refuse it otherwise — that is
      the point) and push.
      → **two** `ci.yml` jobs fail on the missing marker: `pre-commit` (the
      `check-migrations` hook) and `unit` (`test_current_history_passes`,
      which asserts the real migrations directory is clean). Separately and
      independently, `gate-breaking.yml` still detects the migration:
      comment, Slack, gate at `waiting`. Detection ignoring the marker is the
      whole design, and the two workflows failing/firing independently is what
      proves it.
- [ ] **2.** Add the `# migration-check: allow-destructive` marker; commit
      normally; push.
      → pre-commit now passes. **No new comment and no Slack** — the hash is
      built from the file name, revision and ops, none of which a comment
      changes. Confirms the marker has no bearing on change-set identity.
- [ ] **3.** Add destructive migration **B** (with its marker); push.
      → hash moves, so a **second** comment appears and the first is left
      untouched; one fresh Slack message; still exactly **one** pending
      approval — A's should have been cancelled.
- [ ] **4.** Commit something trivial (a comment or whitespace); push.
      → **no** comment, **no** Slack — the change-set is unchanged — but the
      gate re-blocks, since approval is SHA-scoped.

**API — the decision file must exist**

- [ ] **5.** Flip `MUTATE_REMOVE_MESSAGE_1` to `True` in
      `backend/app/test_api_endpoints.py`, *without* a decision file; push.
      → **`api_schema_diff` fails** at `validate-compat-files.sh`, and the
      "api-compatibility validation failed" Slack message fires. The break is
      **still recorded**: comment, Slack and a pending approval, exactly as a
      marker-less migration is at step 1. The failing check keeps the PR
      blocked either way; the record is about *when the break appeared*, not
      whether its paperwork arrived with it.
- [ ] **6.** Add the decision file
      (`python backend/scripts/new_compat_decision.py`, pasting the oasdiff
      change string verbatim from the failed run's log); push.
      → `api_schema_diff` passes, and the API gate fires properly: comment and
      Slack. The migration gate stays silent, its hash unchanged.
- [ ] **7.** Flip a second flag (`MUTATE_REMOVE_DETAIL_1` or
      `MUTATE_REMOVE_SUMMARY_2`) and add its decision file; push.
      → second API comment and Slack.
- [ ] **8.** Commit something trivial; push.
      → both gates silent, both still blocking.

**Tearing down — migrations first**

- [ ] **9.** Remove migration **B**; push.
      → the hash returns to A-only, which is *not* what the newest comment
      says, so a **third** migration comment appears with a Slack message.
      This is the newest-comment-wins rule: returning to an earlier state is a
      change like any other, not a reason to stay silent.
- [ ] **10.** Remove migration **A**; push.
      → all-clear comment (✅), **no** Slack — nobody needs paging that a risk
      went away — and the migration gate stops blocking. The API gate still
      blocks.
- [ ] **11.** Flip the second API flag back to `False`; push.
      → API comment and Slack. Migration side stays silent, already clean.
- [ ] **12.** Flip the first flag back and delete both decision files; push.
      → API all-clear comment, no Slack, API gate stops blocking. No gate is
      blocking now.

### Approval behaviour

- [ ] Re-add one destructive migration, then **reject** the environment
      approval; confirm the required check fails and the PR stays blocked.
- [ ] Push again and **approve**; confirm the check passes.
- [ ] Confirm the Slack message's "Review pending deployments" link reaches a
      real pending deployment — the gate now shares the run with the
      notification, so `github.run_id` points at something live.

### Ordering under rapid pushes

Unlike the walkthrough above, these are deliberately **not** paced. Push as
fast as you can, without waiting for CI.

- [ ] Three separate pushes in quick succession — A (break), B (second
      break), C (revert both). Confirm the comments read A, B, C in that
      order with none missing, and that the wait step's log shows later
      commits actually waiting on earlier ones.
- [ ] A push adding a destructive migration followed immediately by one
      removing it. Both decide jobs should complete, leaving a finding
      comment then an all-clear — one Slack message for the finding, none for
      the all-clear. This is the failure the whole workflow split exists to
      prevent, so it is the most important check here.
- [ ] Confirm no approval sat unapproved while a later commit's comment was
      blocked behind it — the reason the wait keys on the decide *job* rather
      than the whole run.

### Walkthrough result — PR #435, 2026-08-29

All twelve steps ran on `feature/phase-7-gate-walkthrough`. Eight comments,
both gates released cleanly at the end:

| Time | Comment |
| --- | --- |
| 18:54 | 🚨 migration — A only (no marker yet) |
| 19:12 | 🚨 migration — A + B |
| 19:31 | ⚠️ API — first break |
| 19:43 | ⚠️ API — both breaks |
| 19:48 | 🚨 migration — back to A only |
| 19:49 | ✅ migration all-clear |
| 20:10 | ⚠️ API — back to one break |
| 20:17 | ✅ API all-clear |

What each step proved, all confirmed live rather than by unit test:

- **Silence is correct twice over.** Adding the marker (step 2) and an
  unrelated commit (steps 4, 8) both produced no comment and no Slack, because
  neither changes the hash — while the gate still re-blocked, approval being
  commit-scoped.
- **Returning to an earlier state is announced** (steps 9, 11). The hash went
  back to a value already on the PR, and a fresh comment landed anyway. A
  "have we ever seen this hash?" check would have gone silent and left the
  newest comment claiming two findings when one remained. This is the single
  assertion that justifies newest-comment-wins.
- **Both gates blocked at once** (step 6) without cancelling each other,
  proving the per-gate concurrency groups are genuinely independent. A shared
  group would have let one approval silently cancel the other.
- **Only ever one approval pending per gate.** Eleven commits, and every
  superseded gate showed `cancelled`.
- **All-clear is comment-only** (steps 10, 12): ✅ comment, no Slack, gate
  released.
- **A missing marker fails CI twice** — `pre-commit` and `unit`
  (`test_current_history_passes`) — while the gate fires regardless.

Still outstanding: the approval behaviour checks (reject, then approve) and
the rapid-push ordering checks. Both need a **fresh** throwaway PR, since this
one is being closed.

### Found during the walkthrough

Recorded as the run turned them up, since each changes something.

- [x] **The approval prompt now tells the reviewer to check CI first.** A
      migration missing its marker still trips the gate — detection ignores
      the marker by design — so a reviewer can be asked to approve something
      whose static checks are red. The message now says to check the other
      checks are green first, and that approving early is wasted anyway since
      approval is commit-scoped. Deliberately phrased as "checks are green"
      with the marker as the example, rather than "check the markers": a
      reviewer can see check status at a glance but would have to open files
      to audit markers, and making the marker the approval criterion would
      blur the rule that it must never substitute for the decision.
      **Migration gate only** — the API gate cannot reach a reviewer in that
      state, because a missing decision file fails `api_schema_diff`, which
      skips the gate that `needs` it.
- [ ] **Re-test on a fresh throwaway PR: a break with no paperwork must still
      be announced, on both sides.** Push a destructive migration with **no**
      `allow-destructive` marker, and an API break with **no** decision file,
      and confirm each produces a PR comment *and* a Slack message. The
      migration half already behaves this way — step 1 proved it — so this is
      really a test of the API half, which needs the fix below to land first.
      Without it the API break is silent, and the timeline cannot show when a
      break appeared unless its paperwork happened to arrive at the same time.
- [x] **The two gates recorded findings differently, and now do not.** A
      migration missing its marker was still detected, recorded and gated; an
      API break missing its decision file was not, because
      `validate-compat-files.sh` runs inside `api_schema_diff` and its failure
      skipped every job that `needs` it. So a break could fail CI and leave no
      trace on the PR timeline. Fixed by gating the API decide, notify and
      approval jobs on `!cancelled()` rather than implicit success: the break
      is detected before validation runs, so the finding is recorded either
      way. The failing check still blocks the PR. **Verify on the next run
      that a failed job's outputs (`breaking`, `breaking_hash`) still reach
      the dependent jobs** — that is the assumption the fix rests on.
- [x] **`validate-compat-files.sh` broke under bash 3.2.** Expanding the
      empty `covered_changes` array under `set -u` errored on macOS's bash 3.2
      (`unbound variable`) while working on CI's bash 5 — and empty is the
      normal case when a change has no decision file yet, which is exactly
      when someone runs it locally to find out why CI failed. Fixed with
      `${arr[@]+"${arr[@]}"}`; it now reports the uncovered change instead.
- [x] **The API approval prompt gained the same CI-green caveat as the
      migration one.** It was migration-only because the API gate could not
      reach a reviewer while validation was failing. The `!cancelled()` fix
      changes that, so the API message now carries the warning too. A caveat
      that was accurate before the fix would have been quietly wrong after it.
- [x] **`check_destructive` matched the marker anywhere in the file.** It was
      a plain substring search over the whole source, so the marker satisfied
      the check from inside a docstring, from a comment far from the call, or
      from prose explaining that the marker was *absent* — exactly how the
      first walkthrough fixture passed when it should have failed. One marker
      also vouched for every destructive call in the file.

      Now checked **per call**: the marker must sit on the call's own line, or
      in the run of comments and blank lines immediately above it. Scanning
      stops at the first statement, so a marker cannot reach past one call to
      cover another. The rationale a marker carries (see Phase 8) lives in that
      same run, so marker + reason + call still passes. Errors name the line
      and the operation, and every unmarked call is reported rather than just
      the first.

      Both existing migrations pass unchanged. `fa4401ce1b92` already writes
      the marker twice, once per drop — redundant under the old rule, required
      under the new one, and the more honest reading: two drops are two
      decisions. The squashed baseline is unaffected, its `drop_table` calls
      all being in `downgrade()`, which the checker does not walk. Seven tests
      cover the cases that used to slip through.
- [x] **`auto-pr.yml` opens PRs as drafts**, and both detection jobs carry
      `draft == false`, so nothing gate-related runs until the PR is marked
      ready for review. Anyone repeating this walkthrough will hit it and may
      conclude the gates are broken. Noted in the setup steps above.
- [x] **A missing marker fails CI twice**, not once: the `pre-commit` job via
      the `check-migrations` hook, and the `unit` job via
      `test_current_history_passes`, which asserts the real migrations
      directory passes. The second is the stronger of the two — it catches a
      bad migration arriving by any route, including a `--no-verify` commit or
      the web UI, where the local hook never runs.

### One Slack message per gate

The second walkthrough (PR #437) pushed a marker-less migration and a
decision-file-less API break together, and produced **three** Slack messages —
two of them about the same API break. The gates are meant to mirror each other,
so knowing how one behaves tells you how the other does, and they did not:

| | Migration | API |
| --- | --- | --- |
| Break found | 🚨 Slack + comment | ⚠️ Slack + comment |
| All clear | comment only | comment only |
| Static check failed | *nothing* | 🚨 Slack (`api_compat_notify`) |

**Remove the extra rather than add a twin.** A migration equivalent would be a
"check_migrations.py failed" message, but that check lives in `ci.yml` and
pre-commit catches it locally, so the job would almost never fire — symmetry in
shape, not behaviour.

Nothing useful is lost, because the only real content in the extra message is
the `oasdiff` change string, which is what `new_compat_decision.py` wants
pasted in. Moving it into the gate message also repairs a defect the split was
hiding: the API gate message says *"Review the summary below"* and carries no
summary. Before the `!cancelled()` fix the two messages could never fire
together, so nobody noticed.

The resulting rule holds for both gates with no exceptions: **Slack tells you a
break needs approval; everything else is on the PR.**

- [ ] Add the breaking-change summary to the API `GATE_MESSAGE`, mirroring the
      migration gate's `**Migrations:**` block. Note
      `compat_validation_error` is **not** the source — it greps `ERROR:`
      lines, so it is empty when validation passes. Extract the
      `<id> <operation> <path> <text>` lines from `oasdiff-report.json`
      instead, reusing the jq already in `compute-breaking-change-hash.sh`,
      in a step that runs before validation so both paths have it.
- [ ] Delete `api_compat_notify` from `gate-breaking.yml`, and check nothing
      references it.
- [ ] Update `api-compatibility.md` and `alembic-migration-safety.md` with the
      one-message rule, stated as holding for both.
- [ ] **Accepted loss:** if `api_schema_diff` fails for a reason other than a
      missing decision file — `oasdiff` crashing, the schema-coverage check —
      there will be a red check and no Slack. Already true of every migration
      static failure, so the behaviour becomes consistent rather than newly
      weak.
- [ ] Re-run the Step A push and confirm **exactly two** Slack messages, and
      that the API one carries a string complete enough to paste straight into
      `new_compat_decision.py`.

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
- **Notify-once built in from the start, rather than shipping a noisy notify
  job and retrofitting it** — The API gate needed a follow-up plan to fix
  exactly this noise; the `pull_request`/`synchronize` trigger behaves
  identically here, so the noise is a known certainty, not a risk to
  discover in production
- **Generalise the existing notification-decision script to a marker key rather than copy
  it** — Two near-identical scripts would drift; the only genuinely
  gate-specific parts are the marker key and the blurb, so both become
  parameters. The API caller's marker string stays byte-identical so
  in-flight PRs' existing comments keep matching
- **Notification key = hash of the flagged migration/op set, not the boolean
  `destructive` flag** — Same reasoning as the API gate: a boolean can't
  tell "same destructive migration, new commit" from "a second destructive
  migration was added". In practice the set only moves when a migration file
  is added, so this is usually one ping per PR
- **Approval gate left ungated by `should_notify`** — Mirrors the API gate:
  environment approval is SHA-scoped and deliberately re-required on every
  push. How often Slack is told is a notification concern only, never a safety control
- **Migration immutability is enforced separately (Phase 8), not folded into
  the destructive gate** — The gate answers "should this drop be approved?";
  immutability answers "should this file have changed at all?". The second has
  no legitimate yes, so it fails the build outright rather than routing to a
  reviewer — bolting it onto the gate would mean asking a human to approve
  something that is never acceptable
- **A destructive migration removed and then re-added identically stays
  silent** — Accepted trade-off, inherited unchanged from the API notification
  plan: the stale marker hash genuinely still matches. The gate still blocks
  and still needs a fresh approval, so this affects Slack noise only
