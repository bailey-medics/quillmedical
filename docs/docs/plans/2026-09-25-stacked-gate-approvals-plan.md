# Stacked gate approvals plan

The two breaking-change gates in `.github/workflows/gate-breaking.yml`, the
API breaking-change review and the destructive migration review, never run on
a stacked pull request. The workflow's `pull_request` trigger is limited to
`branches: [main]`, and a pull request stacked on another targets the branch
below it, so its four required gate checks sit at "Expected — Waiting for
status to be reported" until it reaches the bottom of the stack and something
pushes to it again. And once they do run, an approval is tied to one commit,
so every rebase of the stack asks the reviewer to approve the same change
again.

The outcome: the gates run on every pull request in a stack, and a human
approves each flagged change once, on the pull request that introduces it,
wherever that pull request sits. The approval carries over for as long as the
pull request's own code is unchanged, so rebases and moving onto `main` do
not ask again, while any edit to its code does. The merge queue still
re-checks everything against real `main` before anything lands.

## Phase 1: Recognise an unchanged change

- [ ] **Fingerprint a pull request's own change with `git patch-id`.** Add
      `.github/scripts/ci/compute-change-fingerprint.sh <base> <head>`,
      printing `git diff <base>...<head> | git patch-id --stable` and
      writing it to `GITHUB_OUTPUT` as `change_fingerprint`. A patch ID is
      Git's own identity for "the same change": it ignores line numbers and
      the commit it sits on, so a rebase or a retarget onto `main` leaves it
      unchanged, while any edit to the pull request's code changes it. That
      is exactly the rule wanted, "unchanged code keeps its approval",
      rather than the looser "the same set of breaks", which would carry an
      approval across code edits that happened not to alter the breaks.
      Cover it in a `.bats` file: identical for a rebased copy of the same
      change, different after a one-line edit, and failing loudly on a
      missing ref. Follow the `main()` and source-guard convention in
      `.claude/rules/workflows.md`, so the tests can source it.

- [ ] **Find an earlier human approval of the same change.** Add
      `.github/scripts/ci/find-prior-approval.sh <pr-number> <environment>
      <artifact-name> <fingerprint>`, which:

      - lists this workflow's earlier `pull_request` runs for the pull
        request, newest first, excluding the current run;
      - for each, asks GitHub who approved it
        (`GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals`),
        keeping only an `approved` review of the named environment by a
        user, not a bot;
      - downloads that run's fingerprint artifact and compares it;
      - writes `approved=true`, with the approver, run and date, on the
        first match, and `approved=false` otherwise.

      **Trust comes from GitHub's own approval record**, never from a PR
      comment, label or commit message: `docs/docs/backend/api-compatibility.md`
      rejects all three as proof that a human decided, because an agent
      writes them as easily as code. The fingerprint artifact is written
      by the run's own job, which is the same trust the gate places in the
      workflow today. Cover it in `.bats` with `gh` stubbed: a match, an
      approval of a different fingerprint, an approval of the other
      environment, a bot's approval, and no earlier runs.

## Phase 2: Wire both gates to reuse an approval

- [ ] **Record the fingerprint in both detection jobs.** In
      `api_schema_diff` and `db_destructive_migration_check`, compute the
      fingerprint against the same base each already diffs against, and
      upload it as an artifact (`api-change-fingerprint`,
      `db-change-fingerprint`) whenever the job flags something.

- [ ] **Give the destructive migration check the pull request's own
      base.** It diffs against `origin/main`, so on a stacked pull request
      it would report migrations belonging to the branches below. Resolve
      the base with `resolve-pr-base-sha.sh`, as `api_schema_diff` already
      does for exactly this reason.

- [ ] **Add a prior-approval job before each gate.** A job with no
      environment runs `find-prior-approval.sh` and outputs `approved`.
      Each gate then runs only when something was flagged **and** no
      earlier approval matches. A gate skipped that way counts as passing
      for the required check, as it already does when nothing is flagged,
      and the prior-approval job writes who approved, when and in which
      run to its job summary, so the record of the decision stays one
      click away.

- [ ] **Run the gates on stacked pull requests.** Widen the
      `pull_request` trigger to `branches: [main, "feature/**"]`. The
      comment above it explains why `opened` is excluded and why the gates
      do not re-run on `merge_group`; neither reason is affected, and the
      change belongs beside that reasoning. `ci.yml` keeps its `main`
      filter: its heavy tier is the expensive part of CI, and running it on
      every branch of a stack multiplies the cost, as the
      [stacked branches plan](2026-09-14-stacked-branches-plan.md) found.

- [ ] **Update the wording that says approval is per commit.** Both
      gates' PR messages say "approval is scoped to the commit, so the next
      push re-requires it", and `docs/docs/backend/api-compatibility.md`
      says "nothing left over from an earlier commit can satisfy it". Both
      become: an approval covers the pull request's change while its code
      is unchanged, checked against GitHub's approval record, and any edit
      to its code asks again. Record the change of rule in the page's
      history rather than silently rewriting it.

## Phase 3: Verify on a real stack

- [ ] **Watch it work on a two-branch test stack**, since a workflow
      cannot be exercised locally. The bottom branch adds a harmless
      breaking change behind the test endpoint flag, the top one an
      unrelated change. Check that the top pull request reports all four
      gate contexts, that the bottom one asks once, that a rebase does not
      ask again, that an edit to the bottom branch does, and that merging
      the bottom leaves the top green. Close both without merging, and
      record what was seen here.

## Decisions

- **Patch ID over the breaking-change hash** — the hash identifies the set
  of breaks and was built to stop repeated Slack messages. Keying approval
  on it would let an approval survive a code edit that left the breaks
  alone, which is more than was asked for. A patch ID changes with any edit
  to the pull request's own code and survives only rebases and retargets.

- **GitHub's approval record as the only proof** — the rule this repository
  already holds for these gates. Everything a script could write is
  something an agent could write.

- **Gates widened, heavy tier not** — the gates are cheap and are what
  hangs; the heavy tier is expensive, and the merge queue runs it against
  real `main` before anything lands.
