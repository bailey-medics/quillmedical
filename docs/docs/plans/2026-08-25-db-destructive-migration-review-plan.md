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
migrations. It reuses the existing reviewer, the existing Slack channel, and
the existing accountability rationale (the author is the approver, by
design — see below) rather than inventing new mechanics. The static marker
check stays as-is; it's still a useful fast, pre-commit-level nudge that
forces the marker to exist, and does not need replacing — this plan adds the
missing human decision on top of it, and deliberately does **not** let the
marker's presence or absence influence whether the gate fires, so the gate
can't be satisfied by the same text the checker already accepts.

## Phase 1: Detection — report destructive ops independent of the marker

- [ ] Add a non-failing, informational mode to
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
- [ ] Add `backend/tests/test_check_migrations.py` (or extend it if it
      already covers other modes) coverage for the new mode: a fixture
      migration with a non-destructive `add_column` is not reported; a
      fixture with `drop_column` and the marker is still reported (the
      marker must not suppress detection); a fixture with `drop_table` and
      no marker is reported; a fixture touching only `alter_column` is not
      reported.

## Phase 2: CI detection job

- [ ] Add `heavy_db_destructive_migration_check` to `.github/workflows/ci.yml`,
      heavy tier (`if: github.event_name == 'pull_request' &&
      github.event.pull_request.draft == false`), mirroring
      `heavy_api_schema_diff`'s two-checkout structure (PR branch + main
      branch, `fetch-depth: 0`).
- [ ] Diff `backend/alembic/versions/*.py` between `origin/main` and the PR
      branch (`git diff --name-only --diff-filter=A
      origin/main...HEAD -- backend/alembic/versions/*.py`) to get the set
      of migration files **newly added on this PR** — mirroring how
      `oasdiff` diffs `main` against the PR branch rather than re-scanning
      the whole history each time. A migration merged in an earlier PR was
      already gated when it was added.
- [ ] Run the new `--report-destructive` mode against that file set; set a
      `destructive` job output (`true`/`false`) and capture the per-file
      op summary for the notification/job-summary steps.
- [ ] Write a job summary (mirroring
      `.github/scripts/ci/write-breaking-changes-summary.sh`) listing each
      flagged migration, its revision id, and which destructive ops were
      found, when `destructive == 'true'`.
- [ ] Add `.github/scripts/ci/*.bats` coverage for any new shell glue,
      matching the existing pattern (`check-api-breaking-changes.bats`).

## Phase 3: Human gate job

- [ ] Add `heavy_db_destructive_migration_gate` to `ci.yml`: `needs:
      heavy_db_destructive_migration_check`, `if:
      needs.heavy_db_destructive_migration_check.outputs.destructive ==
      'true'`, `environment: db-destructive-migration-review` — directly
      mirroring `heavy_api_breaking_change_gate`.
- [ ] Add both job names (`DB destructive migration check`, `DB
      destructive migration review gate`) as required status checks in
      `infra/github/branch_rules.tf`, alongside the existing "API
      compatibility" required-check block.

## Phase 4: Slack notification

- [ ] Add `heavy_db_destructive_migration_notify` to `ci.yml`, using the
      existing reusable `.github/workflows/slack-notify.yml`, `channel:
      teaching` (same webhook, no new secret) — same trigger condition as
      the gate job. Message includes the flagged migration(s), the ops
      found, the PR link, and a link to "Review pending deployments" for
      the `db-destructive-migration-review` environment, mirroring the API
      breaking-change Slack message.

## Phase 5: Terraform — new environment

- [ ] Add a `db_destructive_migration_review` block to
      `infra/github/environments.tf`, directly mirroring
      `api_breaking_change_review`: same reviewer
      (`data.github_user.api_breaking_change_reviewer` — reuse rather than
      look up `Cotswoldsmaker` a second time), `prevent_self_review =
      false`, and a comment carrying the same accountability rationale (a
      second reviewer isn't inherently more careful than the author; the
      goal is one genuine, separate, deliberate approval action from
      whoever is accountable, not diffusing accountability across more
      people).
- [ ] Note in the PR description that `terraform apply` is a manual,
      separate step (as it was for `api-breaking-change-review`) — not run
      as part of this plan's implementation, and coordinate with the repo
      owner before applying.

## Phase 6: Documentation

- [ ] Extend the "Destructive changes" section of
      `.github/instructions/backend.instructions.md` (source of truth —
      `.claude/rules/backend.md` is synced from it) with an "Enforcement:
      CI detection + required-reviewer environment gate" subsection,
      mirroring the API compatibility section's equivalent subsection:
      what's detected, why detection ignores the marker, and that the
      `db-destructive-migration-review` environment approval is the only
      way a destructive migration proceeds.
- [ ] Add a "Layer 3 — human review gate for destructive migrations"
      section to `docs/docs/backend/alembic-migration-safety.md`,
      following the existing Layer 1 / Layer 2 structure, and add this
      plan to its "Related" list.
- [ ] Run `/sync-copilot-config` to propagate the instructions edit into
      `.claude/rules/backend.md` and report any other drift it finds.
- [ ] Register this plan in `docs/docs/plans/index.md`.

## Phase 7: Verification

- [ ] Unit tests from Phase 1 pass (`just ub -k check_migrations`).
- [ ] One-off manual GitHub walkthrough on a throwaway branch/PR (not
      merged): a migration with no destructive ops leaves the gate
      skipped; a migration with a `drop_column` (marker present or not —
      prove the marker doesn't suppress the gate) sends it to `waiting`,
      posts to Slack, and blocks the required check until the environment
      is approved or rejected. Unlike the API gate's permanent dummy
      endpoints, don't leave a fabricated destructive migration in the
      real chain afterwards — close/delete the throwaway branch once the
      walkthrough is captured, since a real Alembic chain can't carry a
      disposable fixture revision the way a pair of flag-gated dummy API
      endpoints can.

## Decisions

| Decision | Rationale |
| --- | --- |
| Detection ignores the `allow-destructive` marker entirely | The whole point is a check the marker's own text can't satisfy — mirrors the API gate's rejection of a code comment as proof of a human decision. The existing static check (marker required) is left in place unchanged, purely as a separate, faster nudge |
| Reuse the existing reviewer and Slack channel rather than create new ones | No reason to diffuse accountability further or fragment notifications; the same rationale that put a single named, non-self-review-exempt reviewer on `api-breaking-change-review` applies unchanged here |
| Gate covers `drop_column` / `drop_table` / `drop_constraint` uniformly, no per-op risk tiering | Matches `check_migrations.py`'s existing `DESTRUCTIVE_OPS` set; splitting risk tiers (e.g. treating a constraint drop as lower-risk than a column drop) is easy to add later if it proves too noisy, but starting uniform avoids guessing at a risk model with no data yet |
| No special-case detection for column/table renames | A rename already ships as add-then-drop across separate deploys (see "Renaming or retiring a column" in `.claude/rules/backend.md`); the contract step of that pattern **is** a `drop_column` call, so it's already covered without extra logic |
| Diff `main` vs the PR branch for *new* migration files only, not a full-history rescan | Mirrors `oasdiff`'s main-vs-PR diff; a migration merged in an earlier PR was already gated when it was added, so re-flagging it on every later PR would be noise |
| No permanent dummy destructive migration fixture (unlike the API gate's permanent dummy endpoints) | The API gate could afford two permanent, flag-gated no-op endpoints because they cost nothing sitting in the served app. A destructive Alembic migration is a real, one-way step in a real linear chain — there's no equivalent "disposable but permanent" fixture, so verification is a one-off manual walkthrough on a throwaway branch instead |
