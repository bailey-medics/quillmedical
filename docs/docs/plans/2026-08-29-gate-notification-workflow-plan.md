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

|                              | Question it answers                                      | Scope          |
| ---------------------------- | -------------------------------------------------------- | -------------- |
| Workflow-level `concurrency` | Does a new run kill the whole previous run?              | The entire run |
| Job-level `concurrency`      | Can two instances of _this job_ run at once across runs? | That job only  |

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
  api_schema_diff: # detection, once per commit
  destructive_migration_check: # detection, once per commit
  decide: # posts the comment - must not overlap
    steps: # wait-for-ancestors, then gate-notify.sh
  notify: # Slack
  gate: # the approval
    concurrency:
      group: gate-breaking-approval-${{ github.event.pull_request.number }}
      cancel-in-progress: true # a newer commit supersedes the older pending approval
    environment: <review environment>
```

That satisfies four requirements which previously looked mutually exclusive:

| Requirement                                  | How it is met                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Detection runs once, and is defined once     | The two detection jobs live in one workflow; no second copy anywhere                                                                   |
| A notification is never lost to cancellation | No workflow-level `concurrency`, so runs are never cancelled                                                                           |
| Comment posting is serialised                | Each decide job waits for any ancestor commit still being decided (Phase 5), which both orders the comments and stops them overlapping |
| Exactly one approval pending at a time       | `gate` job group with `cancel-in-progress: true` — a newer commit cancels the older pending approval                                   |

Because the gate now sits in the same run as the notification,
`github.run_id` again points at a real pending deployment, so the Slack "Review
pending deployments" link stays correct with no change needed.

## Rejected: leaving detection in `ci.yml` and duplicating it

An earlier draft kept the gates in `ci.yml` and gave the new workflow its own
detection, accepting that `heavy_api_schema_diff` — two checkouts,
`setup-python`, two Poetry installs, two `dump_openapi.py` runs,
`install-oasdiff.sh`, then `oasdiff` — would run twice per push.

Sharing the result instead was considered and does not work. `workflow_call`
runs _inside_ the caller, so it inherits the caller's cancellation.
`workflow_run` fires only after the producing workflow finishes, so a cancelled
`ci.yml` would produce no notification — and its check runs attach to the
default branch tip rather than the PR head, so the required status checks would
disappear from the PR entirely. Artifacts and `actions/cache` both need the
producer to have finished, and the two workflows start on the same event at the
same instant.

The answer was not to feed the second consumer but to remove it: put both
consumers in one run.

## Phase 1: New workflow `.github/workflows/gate-breaking.yml`

- [x] Triggers: `pull_request`, types
      `[opened, reopened, ready_for_review, synchronize]`, `branches: [main]`.
      Include `opened`/`reopened` — `ci.yml` omits them, but a PR opened with a
      break already present must still be recorded.
- [x] **No workflow-level `concurrency` block.** Add a comment saying so
      explicitly and why, since its absence is load-bearing and otherwise reads
      like an oversight.
- [x] `permissions: contents: read`, `pull-requests: write` (for the comment).
- [x] **Two detection jobs, moved across unchanged** — `heavy_api_schema_diff`
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

- [x] Keeping them separate also settles the naming question for free: each job
      keeps its own `name:`, which is the required-check context. Nothing to
      reconcile.
- [x] Keep `github.event.pull_request.draft == false` on both.
- [x] **`decide` jobs** (one per gate) — moved verbatim from `ci.yml`
      (`heavy_api_breaking_change_gate_notify`,
      `heavy_db_destructive_migration_gate_notify`). Same
      `GATE_MESSAGE`/`GATE_ALL_CLEAR_MESSAGE` env, same `to-slack-mrkdwn.sh`
      step, same `gate-notify.sh` call. Serialisation of the read-then-write
      comes from Phase 5's wait-for-ancestors step, which replaced this
      phase's original job-level `concurrency` group once its one-pending-run
      limit was judged unacceptable.
- [x] **`notify` jobs** — moved verbatim, still calling `slack-notify.yml`.
- [x] **`gate` jobs** — moved from `ci.yml` with their `environment:` and
      `name:` unchanged, plus the job-level `concurrency` block with
      `cancel-in-progress: true` and a comment explaining that a newer commit
      must supersede an older pending approval so a human is never faced with
      a queue of them.
- [x] Drop the `heavy_` prefix from job **ids** (they are no longer part of
      `ci.yml`'s heavy tier) but **not** from any `name:` that is a required
      check.

### Name the commit inside the comment

A PR comment lands in the conversation timeline at the moment it is posted, so
it sits _after_ the push that caused it but is not anchored to it. Detection
takes a minute or more, during which another commit or review comment can land
in between; and a push of several commits collapses into one timeline group, so
position cannot say which of them introduced the finding.

- [x] Add the short commit SHA to both `GATE_MESSAGE` blocks — a line reading
      "Found in commit &lt;short-sha&gt;" — so each comment says what it
      describes regardless of where it lands. Add it to
      `GATE_ALL_CLEAR_MESSAGE` too —
      "the findings went away" is worth pinning to a commit as much as their
      arrival is.
- [x] Take it from `${{ github.event.pull_request.head.sha }}`, **not**
      `github.sha`. On `pull_request` events `github.sha` is the synthetic
      merge commit GitHub creates to test the merge result; it does not exist
      on the branch, so a reader trying to match it against `git log` would
      find nothing.
- [x] The Slack message inherits this for free — it is built from
      `GATE_MESSAGE` via `to-slack-mrkdwn.sh`, so the SHA appears in both with
      no second edit.

## Phase 2: Strip the moved jobs from `ci.yml`

- [x] Remove the detection, gate, decide and notify jobs, leaving `ci.yml` as
      tests only, still with `cancel-in-progress: true`.
- [x] Move `heavy_api_compat_notify` across too. It reports a _failure of_
      `heavy_api_schema_diff` (via `needs` and
      `needs.heavy_api_schema_diff.result == 'failure'`), so it has to follow
      the job it watches — a cross-workflow `needs` does not exist. It takes no
      job-level `concurrency`: it fires on a broken run, and a broken run that
      gets superseded genuinely has nothing left to report.
- [ ] **Verify the four required status checks still report on the PR.**
      `infra/github/branch_rules.tf` pins them by context name — "API
      breaking-change check", "API breaking-change review gate", "DB
      destructive migration check", "DB destructive migration review gate". For
      GitHub Actions the context _is_ the job's `name:`, so moving a job
      between workflows while keeping its `name:` identical should leave the
      context unchanged and need no Terraform change. **This is the single
      highest-risk assumption in the plan** — if it is wrong, branch protection
      blocks every merge on checks that no longer report. Confirm on the first
      run of the new workflow, before merging, and be ready to update
      `branch_rules.tf` in the same PR if the context string turns out to be
      qualified by workflow name.

## Phase 3: Documentation

- [x] Update the notification sections of
      `docs/docs/backend/alembic-migration-safety.md` and
      `docs/docs/backend/api-compatibility.md`: detection, the decision, the
      Slack message and the approval now live in `gate-breaking.yml`; the
      decision runs per commit and is never cancelled; the approval is still
      one at a time.
- [x] Cross-reference this plan from Phase 5b of the
      [destructive migration review plan](2026-08-25-db-destructive-migration-review-plan.md).
- [x] Note in `.github/scripts/ci/gate-notify.sh`'s header that its
      read-then-write against the PR's comments is not atomic and depends on
      the caller serialising it — provided by `wait-for-ancestor-decisions.sh`
      (Phase 5), which replaced the concurrency group this item originally
      referred to.

## Phase 4: Verification

- [x] `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:1.7.8 -color`
- [x] `bats --recursive .github/scripts` — 173 passing. Was 151 before this
      plan; the 22 added are `wait-for-ancestor-decisions.bats` (Phase 5),
      which did not exist when this line was written.
- [x] `find .github/scripts -name '*.sh' -exec shellcheck --source-path=SCRIPTDIR {} +`
- [x] `pre-commit run --files <changed files>`
- [x] `grep -n "gate_notify\|schema_diff\|destructive_migration" .github/workflows/ci.yml`
      should return nothing. Confirmed: no orphaned references remain.
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

## Phase 5: Wait for ancestors — every commit recorded, in commit order

Phases 1–2 serialised the decide jobs with job-level `concurrency`
(`cancel-in-progress: false`). GitHub concurrency groups hold **one running
plus one pending** instance — a third arrival cancels the queued second — so
three rapid pushes silently drop the middle commit's decision. Decided
unacceptable: every commit's run must execute `gate-notify.sh`. "Nothing
needed" is a fine answer; the decision never running is not.

Two false starts, recorded so they are not revisited:

- **Workflow-level `concurrency` instead of job-level.** Same mechanism, same
  one-pending limit, so it fixes nothing — and the approval gate lives in this
  workflow and can wait **days** on a human (see below), so serialising whole
  runs would queue a commit's _notification_ behind an earlier commit's
  _approval_. The notification is what prompts the approval, so that is
  backwards.
- **A branch mutex.** Would give an unbounded queue, but orders waiters by
  **lock acquisition**, not commit order. Detection times vary, so an older
  commit can reach the lock after a newer one and post beneath it. It also
  needs `contents: write` to push the lock ref.

### The agreed mechanism

Before writing its comment, a decide job asks GitHub whether any **ancestor
commit** of its own is still being decided. If so, it waits and re-polls.
Push A → B → C rapidly and all three detect in parallel, but:

- **A** has no ancestor in flight → posts immediately
- **B** sees A's decide job unfinished → waits → posts after A
- **C** waits for both → posts last

Comments land in commit order, always. Two properties fall out for free:

- **Mutual exclusion.** B cannot post while A is posting, so the
  read-then-write in `gate-notify.sh` never overlaps. **No mutex needed.**
- **No queue limit.** Nothing is queued _by GitHub_ — each job simply polls —
  so there is no one-pending cap. Five rapid commits all record; ten do too.

Only the seconds-long write waits. Detection still runs fully in parallel
across commits, so nothing slows down.

### Three details the mechanism depends on

- **Wait on the decide _job_, not the run.** The run also contains the
  approval gate. A job awaiting environment approval has not started, so its
  `timeout-minutes` has not begun counting — GitHub holds the run in
  `waiting` for up to **30 days** before cancelling it. Waiting on the run
  would stall every later commit behind an unapproved one for that long. Poll
  `/actions/runs/{id}/jobs` and look only at the decide job. Such a run is
  not `completed`, so it does reach the job check — which finds its decide
  job long since finished and moves on.
- **Ancestry, not timestamps.** `git merge-base --is-ancestor` against the
  existing `fetch-depth: 0` checkout. After a force-push the old commit is no
  longer an ancestor, so the wait naturally stops caring about a commit that
  is no longer on the branch.
- **A deadline that fails open.** If an ancestor's decide job is stuck, post
  anyway rather than block forever. A late comment is recoverable; a missing
  one is not.

### Known gap

First, the scope: a `pull_request` synchronize event fires once per **push**,
not per commit. Several commits pushed together produce a single run for the
last of them, so there is nothing to order. All of this engages only across
separate pushes — which is also the only way to exercise it.

Within that scope there is, on inspection, nothing worth guarding. GitHub
creates a run record within seconds of the push event — registration happens
then, not when a runner picks the job up. The wait runs in the decide job,
which `needs` its detection job, so the earliest it can poll is roughly 90
seconds later, by which time any sibling run has existed for most of that
time.

A settle delay before the first poll was drafted and then **removed**. It
could only pay out if a decide job polled within a few seconds of the push,
which detection makes impossible — so it was 20 seconds added to every comment
and Slack message on every push, for insurance that can never fire. Runner
queueing does not revive the case: a run waiting for a runner still has a
record, with status `queued`, which `ancestor_run_ids` keeps.

The `Found in commit <sha>` line (Phase 1) remains the backstop: even an
out-of-order pair states which commit each describes, so nothing is ambiguous
and nothing is lost.

- [x] `.github/scripts/ci/wait-for-ancestor-decisions.sh` following
      `.claude/rules/workflows.md` (header block, `set -euo pipefail`,
      `shared/logging.sh`, arguments validated first). Arguments: the decide
      job's `name:`, this run's head SHA, and this run's id (to exclude
      itself). Steps: list in-progress and queued runs of this workflow for
      this branch; keep those whose `head_sha` is an ancestor of ours and
      still present in the checkout; for each, fetch its jobs and check
      whether the named decide job has `status: completed`; poll until none
      remain or the deadline passes. No settle delay - see Known gap above.
      Thresholds env-overridable so bats
      can drive them.
- [x] Treat a _cancelled_ or _failed_ ancestor decide job as finished — it
      will never post, so waiting on it would hang until the deadline.
- [x] A commit missing from the checkout (force-pushed away) is not an
      ancestor: `git cat-file -e` first, and skip rather than fail.
- [x] `.github/scripts/ci/wait-for-ancestor-decisions.bats` — argument guards,
      plus pure functions for the two decisions worth isolating: filtering a
      list of runs down to unfinished ancestors, and reading a job list to
      decide whether the named job has finished. The `gh api` and `git` calls
      stay untested, matching `gate-notify.bats`.
- [x] `gate-breaking.yml`: **delete** the job-level `concurrency` block from
      both decide jobs — leaving it would still cap the queue at one waiter
      and cancel the middle, making the wait pointless — and add the wait step
      immediately before the `gate-notify.sh` step. `to-slack-mrkdwn.sh` is
      pure and needs no wait, so it can stay ahead of it.
- [x] `permissions:` gains `actions: read` (listing runs and jobs).
      Deliberately **not** `contents: write`, which the rejected mutex would
      have required — this reads status rather than creating refs.
- [x] Raise both decide jobs' `timeout-minutes` from 5 to 15, to cover waiting
      behind several predecessors plus the wait script's own deadline.
- [x] Keep the approval-gate jobs' `concurrency` blocks
      (`cancel-in-progress: true`) untouched — superseding pending approvals
      is wanted and unrelated to ordering.
- [x] No change to `gate-notify.sh`. The earlier plan's `head-sha` argument,
      `newest_recorded_commit` function and compare-API check were for the
      skip-the-straggler guard, which this replaces: nothing is skipped, so
      nothing needs detecting. The `Found in commit <sha>` line from Phase 1
      stays as the backstop.
- [ ] Verification, on top of Phase 4's: on the live PR, make three
      **separate pushes** in quick succession — A (break), B (second break),
      C (revert all). They must be separate `git push` invocations: one push
      of three commits fires a single synchronize event and produces one run,
      which would not exercise the ordering at all. Then
      confirm the comments read A, B, C in that order with none missing;
      check the wait step's log shows later commits actually waiting; and
      confirm no approval sat unapproved while a later commit's comment was
      blocked behind it.

## Decisions

- **One workflow holding detection, decision, notification and gate** —
  Removes the second consumer of detection rather than trying to feed it, so
  detection is defined and run once. Cross-workflow transports all require the
  producer to finish first, and both workflows start on the same event
- **The two detection jobs stay separate, with no shared setup job** — They
  have no setup in common. The API check needs two checkouts, `setup-python`,
  two Poetry installs, two `dump_openapi.py` runs and `oasdiff`; the migration
  check needs a checkout, a `git fetch` and stdlib Python. A `prepare` job
  would have nothing to prepare, and keeping them apart preserves each one's
  required-check `name:` for free
- **No workflow-level `concurrency` on `gate-breaking.yml`** — A job cannot
  opt out of its own run being cancelled, so the only way a notification
  survives is for the run never to be cancelled
- **Decide jobs serialised by waiting for ancestor commits, not by any
  `concurrency` group** — `gate-notify.sh` reads the PR's comments then writes
  one, with no compare-and-swap available, so overlap must be excluded. A
  concurrency group queues at most one waiter and cancels deeper ones,
  dropping middle commits' decisions; waiting on ancestors has no queue at
  all, so no cap (Phase 5)
- **Job-level `cancel-in-progress: true` on `gate`** — An approval is only
  meaningful for the newest commit. Without this a human faces a queue of
  pending approvals, which is the fastest way to make people disengage from
  the gate entirely
- **`ci.yml` keeps `cancel-in-progress: true`** — Superseded test runs are
  pure waste; nothing about this plan changes that
- **Required-check job `name:` values preserved verbatim** — For Actions the
  required-check context is the job name, so keeping names identical should
  avoid any `branch_rules.tf` change. Flagged as the plan's main risk and
  verified before merge
- **Detection now runs for every commit, not just the last surviving one** —
  That is the point — a commit whose run is cancelled is a commit with no
  record. Costs more than today's cancel-everything behaviour, deliberately
- **A branch mutex was designed and then rejected** — It would have given an
  unbounded queue, but orders waiters by lock acquisition rather than commit
  order — an older commit whose detection ran slow would post beneath a newer
  one. It also needed `contents: write`. Waiting on ancestors gives the same
  unbounded queue _and_ correct order, for a weaker permission
- **Mutual exclusion is a side effect, not a separate mechanism** — If B will
  not post until A's decide job has finished, the two can never overlap. One
  mechanism delivers both ordering and exclusion, so no lock is needed
  alongside it
- **The wait fails open at its deadline** — If an ancestor's decide job is
  stuck, post anyway. A comment arriving late is recoverable; one that never
  arrives is not — and never arriving is the failure this whole phase exists
  to remove
- **Wait on the decide _job_, never the whole run** — The run also holds the
  approval gate, and a run awaiting approval sits in `waiting` for up to 30
  days (`timeout-minutes` only starts once a job actually runs). Waiting for
  the run would queue a commit's notification behind an earlier commit's
  approval for that long — backwards, since the notification is what prompts
  the approval
- **`actions: read`, not `contents: write`** — Reading run and job status
  needs only `actions: read`. The rejected mutex would have needed permission
  to create refs — a materially wider grant in a clinical-safety repo for a
  worse result
- **Ancestry by `git merge-base --is-ancestor`, not push timestamps** — A
  force-push removes commits from the branch; ancestry stops matching them
  automatically, so the wait never blocks on a commit that no longer exists.
  Timestamps would have no such self-correction
- **Each comment names its commit SHA** — A PR comment lands in the timeline
  when it is posted, not anchored to the commit that caused it — detection
  takes minutes, and a push of several commits collapses into one timeline
  group. Naming the SHA in the body makes attribution exact regardless of
  position
- **SHA taken from `github.event.pull_request.head.sha`** — On `pull_request`
  events `github.sha` is the synthetic merge commit GitHub builds to test the
  merge result. It is not on the branch, so a reader matching it against `git
log` would find nothing
- **Comment order matches commit order, and nothing is skipped** — Earlier
  designs achieved order by silencing a late straggler, which discards a
  record that was asked for. Waiting instead keeps every commit's comment
  _and_ puts it in the right place
- **No settle delay before the first poll** — A delay was drafted to cover
  the case where a run polls before GitHub has registered an earlier sibling,
  then removed. GitHub creates a run record within seconds of the push, and
  the decide job polls roughly 90 seconds later, so the window has already
  closed. It would have added 20 seconds to every comment and Slack message
  on every push for insurance that can never fire. The `Found in commit
  <sha>` line stays as the backstop if the race ever did occur
