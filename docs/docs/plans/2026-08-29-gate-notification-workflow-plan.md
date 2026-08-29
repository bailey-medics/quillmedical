# Gate notification workflow plan

The API breaking-change and destructive-migration gates record findings as a
timeline of PR comments plus a Slack message (Phases 5b/5c of the
[destructive migration review plan](2026-08-25-db-destructive-migration-review-plan.md),
merged in `804b4655`). All of that work currently lives in
`.github/workflows/ci.yml`, which sets `cancel-in-progress: true` — so a second
push cancels the first run, and with it any notification work that had not yet
finished. Two commits pushed in quick succession, one introducing a break and
one reverting it, can therefore leave no record that the break ever existed.

The outcome this plan delivers: **every commit works out whether a comment or
Slack message is needed, one after another, never skipped because a newer push
arrived.** A decision of "nothing needed" is a perfectly good outcome — what
must not happen is the decision never being made. The expensive test jobs keep
being cancelled exactly as they are today, and a human is still only ever asked
for **one** approval at a time.

## The idea: one run, jobs with different cancellation behaviour

Two settings that sound alike do different jobs, and the whole design turns on
the difference:

| | Question it answers | Scope |
| --- | --- | --- |
| Workflow-level `concurrency` | Does a new run kill the whole previous run? | The entire run |
| Job-level `concurrency` | Can two instances of *this job* run at once across runs? | That job only |

A job cannot opt out of its own run being cancelled — which is why nothing
inside `ci.yml` can be made to survive its `cancel-in-progress: true`. But a
workflow with **no** workflow-level concurrency never has its runs cancelled at
all, and inside such a workflow job-level concurrency is free to give
individual jobs whatever behaviour they need.

So a single new workflow, `.github/workflows/gate-breaking.yml`, holds
detection, the notification decision, the Slack message **and** the approval
gate — each job configured independently:

```yaml
on: pull_request
# No workflow-level concurrency: every commit gets a run, nothing is dropped.

jobs:
  api_schema_diff:               # detection, once per commit
  destructive_migration_check:   # detection, once per commit
  decide:                        # posts the comment - must not overlap
    concurrency:
      group: gate-breaking-decide-${{ github.event.pull_request.number }}
      cancel-in-progress: false
  notify:                        # Slack
  gate:                          # the approval
    concurrency:
      group: gate-breaking-approval-${{ github.event.pull_request.number }}
      cancel-in-progress: true   # a newer commit supersedes the older pending approval
    environment: <review environment>
```

That satisfies four requirements which previously looked mutually exclusive:

| Requirement | How it is met |
| --- | --- |
| Detection runs once, and is defined once | The two detection jobs live in one workflow; no second copy anywhere |
| A notification is never lost to cancellation | No workflow-level `concurrency`, so runs are never cancelled |
| Comment posting is serialised | `decide` job group with `cancel-in-progress: false` — a second run queues behind rather than overlapping |
| Exactly one approval pending at a time | `gate` job group with `cancel-in-progress: true` — a newer commit cancels the older pending approval |

Because the gate now sits in the same run as the notification,
`github.run_id` again points at a real pending deployment, so the Slack "Review
pending deployments" link stays correct with no change needed.

## Rejected: leaving detection in `ci.yml` and duplicating it

An earlier draft kept the gates in `ci.yml` and gave the new workflow its own
detection, accepting that `heavy_api_schema_diff` — two checkouts,
`setup-python`, two Poetry installs, two `dump_openapi.py` runs,
`install-oasdiff.sh`, then `oasdiff` — would run twice per push.

Sharing the result instead was considered and does not work. `workflow_call`
runs *inside* the caller, so it inherits the caller's cancellation.
`workflow_run` fires only after the producing workflow finishes, so a cancelled
`ci.yml` would produce no notification — and its check runs attach to the
default branch tip rather than the PR head, so the required status checks would
disappear from the PR entirely. Artifacts and `actions/cache` both need the
producer to have finished, and the two workflows start on the same event at the
same instant.

The answer was not to feed the second consumer but to remove it: put both
consumers in one run.

## Phase 1: New workflow `.github/workflows/gate-breaking.yml`

- [ ] Triggers: `pull_request`, types
      `[opened, reopened, ready_for_review, synchronize]`, `branches: [main]`.
      Include `opened`/`reopened` — `ci.yml` omits them, but a PR opened with a
      break already present must still be recorded.
- [ ] **No workflow-level `concurrency` block.** Add a comment saying so
      explicitly and why, since its absence is load-bearing and otherwise reads
      like an oversight.
- [ ] `permissions: contents: read`, `pull-requests: write` (for the comment).
- [ ] **Two detection jobs, moved across unchanged** — `heavy_api_schema_diff`
      ("API breaking-change check") and `heavy_db_destructive_migration_check`
      ("DB destructive migration check"), keeping every step and every script
      call exactly as they are today.

      They are **not** merged into one job, and need no shared setup job,
      because they have nothing in common to share. The API check needs two
      checkouts, `setup-python`, two Poetry installs, two `dump_openapi.py`
      runs and `install-oasdiff.sh`. The migration check needs a checkout, a
      `git fetch`, and bash scripts calling stdlib Python — no Poetry, no
      `setup-python`, no specs, no `oasdiff`. A `prepare` job feeding both
      would have nothing to prepare.
- [ ] Keeping them separate also settles the naming question for free: each job
      keeps its own `name:`, which is the required-check context. Nothing to
      reconcile.
- [ ] Keep `github.event.pull_request.draft == false` on both.
- [ ] **`decide` jobs** (one per gate) — moved verbatim from `ci.yml`
      (`heavy_api_breaking_change_gate_notify`,
      `heavy_db_destructive_migration_gate_notify`). Same
      `GATE_MESSAGE`/`GATE_ALL_CLEAR_MESSAGE` env, same `to-slack-mrkdwn.sh`
      step, same `gate-notify.sh` call. Add the job-level `concurrency` block
      with `cancel-in-progress: false`, and a comment explaining that it
      serialises `gate-notify.sh`'s read-then-write against the PR's comments,
      which has no compare-and-swap available.
- [ ] **`notify` jobs** — moved verbatim, still calling `slack-notify.yml`.
- [ ] **`gate` jobs** — moved from `ci.yml` with their `environment:` and
      `name:` unchanged, plus the job-level `concurrency` block with
      `cancel-in-progress: true` and a comment explaining that a newer commit
      must supersede an older pending approval so a human is never faced with
      a queue of them.
- [ ] Drop the `heavy_` prefix from job **ids** (they are no longer part of
      `ci.yml`'s heavy tier) but **not** from any `name:` that is a required
      check.

### Name the commit inside the comment

A PR comment lands in the conversation timeline at the moment it is posted, so
it sits *after* the push that caused it but is not anchored to it. Detection
takes a minute or more, during which another commit or review comment can land
in between; and a push of several commits collapses into one timeline group, so
position cannot say which of them introduced the finding.

- [ ] Add the short commit SHA to both `GATE_MESSAGE` blocks — a line reading
      "Found in commit &lt;short-sha&gt;" — so each comment says what it
      describes regardless of where it lands. Add it to
      `GATE_ALL_CLEAR_MESSAGE` too —
      "the findings went away" is worth pinning to a commit as much as their
      arrival is.
- [ ] Take it from `${{ github.event.pull_request.head.sha }}`, **not**
      `github.sha`. On `pull_request` events `github.sha` is the synthetic
      merge commit GitHub creates to test the merge result; it does not exist
      on the branch, so a reader trying to match it against `git log` would
      find nothing.
- [ ] The Slack message inherits this for free — it is built from
      `GATE_MESSAGE` via `to-slack-mrkdwn.sh`, so the SHA appears in both with
      no second edit.

## Phase 2: Strip the moved jobs from `ci.yml`

- [ ] Remove the detection, gate, decide and notify jobs, leaving `ci.yml` as
      tests only, still with `cancel-in-progress: true`.
- [ ] Move `heavy_api_compat_notify` across too. It reports a *failure of*
      `heavy_api_schema_diff` (via `needs` and
      `needs.heavy_api_schema_diff.result == 'failure'`), so it has to follow
      the job it watches — a cross-workflow `needs` does not exist. It takes no
      job-level `concurrency`: it fires on a broken run, and a broken run that
      gets superseded genuinely has nothing left to report.
- [ ] **Verify the four required status checks still report on the PR.**
      `infra/github/branch_rules.tf` pins them by context name — "API
      breaking-change check", "API breaking-change review gate", "DB
      destructive migration check", "DB destructive migration review gate". For
      GitHub Actions the context *is* the job's `name:`, so moving a job
      between workflows while keeping its `name:` identical should leave the
      context unchanged and need no Terraform change. **This is the single
      highest-risk assumption in the plan** — if it is wrong, branch protection
      blocks every merge on checks that no longer report. Confirm on the first
      run of the new workflow, before merging, and be ready to update
      `branch_rules.tf` in the same PR if the context string turns out to be
      qualified by workflow name.

## Phase 3: Documentation

- [ ] Update the notification sections of
      `docs/docs/backend/alembic-migration-safety.md` and
      `docs/docs/backend/api-compatibility.md`: detection, the decision, the
      Slack message and the approval now live in `gate-breaking.yml`; the
      decision runs per commit and is never cancelled; the approval is still
      one at a time.
- [ ] Cross-reference this plan from Phase 5c of the
      [destructive migration review plan](2026-08-25-db-destructive-migration-review-plan.md).
- [ ] Note in `.github/scripts/ci/gate-notify.sh`'s header that its
      read-then-write against the PR's comments is not atomic and depends on
      the caller serialising it — now provided by the `decide` job's
      concurrency group.

## Phase 4: Verification

- [ ] `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.8 -color`
- [ ] `bats --recursive .github/scripts` — stays at 151 passing. No script
      changes, so any movement is a regression.
- [ ] `find .github/scripts -name '*.sh' -exec shellcheck --source-path=SCRIPTDIR {} +`
- [ ] `pre-commit run --files <changed files>`
- [ ] `grep -n "gate_notify\|schema_diff\|destructive_migration" .github/workflows/ci.yml`
      should return nothing.
- [ ] **Required checks**: on the first PR, confirm all four contexts still
      appear and are satisfiable. This gates everything else.
- [ ] **One approval only**: push two commits each carrying a destructive
      migration; confirm the first commit's pending approval is cancelled and
      only one "Review pending deployments" remains.
- [ ] **No lost notification**: push a commit adding a destructive migration
      and, before CI settles, a second removing it. Expected — both `decide`
      jobs complete in order, leaving a break comment followed by an all-clear
      comment, with one Slack message for the break and none for the all-clear.
- [ ] **Link correctness**: confirm the Slack message's "Review pending
      deployments" link reaches a real pending deployment, now that the gate
      shares the run.

## Decisions

| Decision | Rationale |
| --- | --- |
| One workflow holding detection, decision, notification and gate | Removes the second consumer of detection rather than trying to feed it, so detection is defined and run once. Cross-workflow transports all require the producer to finish first, and both workflows start on the same event |
| The two detection jobs stay separate, with no shared setup job | They have no setup in common. The API check needs two checkouts, `setup-python`, two Poetry installs, two `dump_openapi.py` runs and `oasdiff`; the migration check needs a checkout, a `git fetch` and stdlib Python. A `prepare` job would have nothing to prepare, and keeping them apart preserves each one's required-check `name:` for free |
| No workflow-level `concurrency` on `gate-breaking.yml` | A job cannot opt out of its own run being cancelled, so the only way a notification survives is for the run never to be cancelled |
| Job-level `cancel-in-progress: false` on `decide` | `gate-notify.sh` reads the PR's comments then writes one, with no compare-and-swap available; overlapping runs would both read "nothing yet" and both post |
| Job-level `cancel-in-progress: true` on `gate` | An approval is only meaningful for the newest commit. Without this a human faces a queue of pending approvals, which is the fastest way to make people disengage from the gate entirely |
| `ci.yml` keeps `cancel-in-progress: true` | Superseded test runs are pure waste; nothing about this plan changes that |
| Required-check job `name:` values preserved verbatim | For Actions the required-check context is the job name, so keeping names identical should avoid any `branch_rules.tf` change. Flagged as the plan's main risk and verified before merge |
| Detection now runs for every commit, not just the last surviving one | That is the point — a commit whose run is cancelled is a commit with no record. Costs more than today's cancel-everything behaviour, deliberately |
| Accept that three or more rapid pushes may drop a middle `decide` job | A concurrency group holds only one pending entry, so a third arrival cancels the queued second. Removing the group would restore full coverage but let comment-posting overlap, which is worse |
| Each comment names its commit SHA | A PR comment lands in the timeline when it is posted, not anchored to the commit that caused it — detection takes minutes, and a push of several commits collapses into one timeline group. Naming the SHA in the body makes attribution exact regardless of position |
| SHA taken from `github.event.pull_request.head.sha` | On `pull_request` events `github.sha` is the synthetic merge commit GitHub builds to test the merge result. It is not on the branch, so a reader matching it against `git log` would find nothing |
| Comment ordering is not strictly guaranteed | Without workflow-level queueing, two runs' `decide` jobs contend and the winner is whichever finished its detection job first — usually chronological. A flip produces one self-healing extra comment, a case the newest-comment-wins rule already handles |
