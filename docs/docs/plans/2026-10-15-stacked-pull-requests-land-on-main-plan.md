# Stacked pull requests land on main plan

Twice on 15 October 2026 a stacked pull request was closed by GitHub when
the stack beneath it merged, and twice more a pull request was merged into
the branch below it rather than into `main`, so its work sat on a branch
that nothing carried further. The repository's own bot,
`merged-outside-main.yml`, caught the second pair; nothing caught the
first. Both have one cause: not every pull request in a stack is one
GitHub's stack feature knows about, and GitHub will merge a stacked pull
request into its base branch if asked, where the tools the industry
settled on will not.

The standard, which Graphite follows and which GitHub's own stacked pull
requests adopted when they went generally available on 6 October 2026, is
that a stacked pull request lands on `main` one at a time from the bottom,
and the tool re-points the ones above. `gh stack`, which this repository
uses, is GitHub's command line for that. The aim here is to use it as
designed: every pull request made through it, merged only when its base
reads `main`, and the stack synced after every merge.

## Phase 1: Carry the stranded work to main

- [x] Open one pull request from
      `feature/eslint-no-list-of-javascript-allowed-to-stay` into `main`.
      That branch holds three changes whose own pull requests are closed
      or merged into branches: #2021, removing the guard's empty
      allow-list; #2023, pointing VS Code at each worktree's own
      `backend/.venv`; and #2026, renaming `review-ledger` to
      `audit-stamp` and fixing the extension's watch. The description
      lists the three and links them, so the review history is kept.
      Done on 15 October 2026 as #2032.

- [x] Bring the local stack into line: `just stack-sync` drops the merged
      branches and rebases what is open onto `main`. Done the same day.

## Phase 2: Every pull request goes through the stack tool

- [x] Take the queued-branch workaround out of `/crpd`. Step 5 of
      `.claude/skills/crpd/SKILL.md` says that when a pull request in the
      stack is queued, `stack-submit` must not run, and the new branch
      is pushed on its own with `git push` and given a pull request with
      `gh pr create`. That was written on 4 October 2026, before GitHub's
      stacks went generally available, when `gh stack submit` would
      force-push a queued branch and drop it from the merge queue. It
      now skips a queued branch itself: `stack-submit` printed "Skipping
      feature/… (PR #2001 queued)" on 15 October. A pull request made
      with `gh pr create` is one GitHub's stack feature does not track,
      so when the stack beneath it merges GitHub cannot re-point it and
      closes it, which is what happened to #2014. Rewrite step
      5 to run `stack-submit` always, say why the workaround went, and
      remove `gh pr create` and the bare `git push` from the skill's
      `allowed-tools`. Correct the memory note that records the
      workaround.
      Done on 16 October 2026. Step 5 runs `stack-submit` always, and
      says why the workaround went; `gh pr create` and `git push` are out
      of the skill's `allowed-tools`, and the exception for naming a base
      is gone from its "Never" list. `update-docs-docs`, which told a run
      to hold its pushes while anything was queued, now pushes as usual.
      The memory note is corrected, keeping one caveat it recorded: on
      25 September GitHub briefly did not report a queued pull request
      as queued, and `stack-submit` force-pushed it out of the queue.
      That can still happen; the cost is queueing it again by hand.

- [x] Check that `stack-submit` registers a pull request GitHub then
      re-points. On a throwaway stack of two branches, merge the bottom
      through the queue and confirm the top's base changes to `main`
      rather than the top being closed. Record the result here; if
      GitHub closes it still, the fault is upstream in a nine-day-old
      feature, and Phase 3's rule is the whole protection until it is
      fixed.
      Not run as written: it needs a pull request merged, and merging is
      Mark's alone. Today's history answers it instead, and the answer is
      no. #2014 was made by hand with `gh pr create`, but #2021 was made
      by `stack-submit`, and GitHub closed both. #2021's base was a
      branch whose own pull request merged into the branch below it,
      not into `main`, as GitHub's stack merge does for every pull
      request but the bottom one; GitHub then had nowhere to re-point
      #2021 and closed it, despite the changelog's promise that stacks
      retarget. So Phase 2 removes one way to lose a pull request, not
      both, and Phase 3's check is the protection that holds.

## Phase 3: Merge only when the base reads main

- [ ] Say so where merging is described. `.claude/rules/ci.md` and
      `.github/instructions/ci.instructions.md` tell a reviewer to queue
      an approved pull request with "Merge when ready". Add, in both:
      look at the base first, and if it reads a `feature/…` branch rather
      than `main`, do not merge; run `just stack-sync`, which moves it to
      `main` once the one beneath has landed, and queue it then. A pull
      request merged into its base branch is not on `main` and nothing
      carries it there. Run `/sync-copilot-config` for the pair.

- [ ] Make the mistake harder to make. GitHub shows a stacked pull
      request's merge button with its base branch as the target, which
      is the trap. Find out whether a ruleset can refuse a merge into any
      branch but `main`, or whether `merged-outside-main.yml` can be
      turned from a warning after the fact into a required check that
      fails while the base is not `main`. The second is in this
      repository's hands: a check on `pull_request` that reads
      `base_ref` and fails on anything but `main`, listed in
      `required_status_checks` in `infra/github/branch_rules.tf`, with
      a `merge_group` trigger as `.claude/rules/ci.md` requires of every
      required check. It would fail on every stacked pull request but
      the bottom one, which is right: those are not ready to merge until
      the stack tool has moved them. Decide here which, and build it.

## Phase 4: Sync after every merge

- [ ] Add to `/crpd` and `/f`, in their "before anything" sections, that
      after any pull request in the stack has merged, `just stack-sync`
      runs before anything is built or merged, and that a stack whose
      bottom was closed by GitHub rather than merged is treated the
      same. `/f` already says this for a stack with a merged branch; make
      the closed case explicit, since it is the one that caught us.

## Decisions

- **Use the stack tool as designed rather than build around it** - the
  closed pull requests were made outside `gh stack`, by a workaround for
  a behaviour the tool no longer has. Removing the workaround puts every
  pull request where GitHub can re-point it. A workflow that re-points
  pull requests itself, considered on 15 October, would duplicate what
  GitHub now does and would have to be kept right as GitHub changes.

- **Keep "delete branch on merge" on** - turning it off was considered
  so a closed pull request could not happen. It would only hide the
  problem: the pull request above would stay open but still point at a
  merged branch, and merging it would land its work on that branch, which
  is Phase 1's mess again with less warning.

- **A required check beats a reminder** - Phase 3's rule is written down
  first because that is quick, but a merge button that cannot be pressed
  is the only thing that holds when the person merging is in a hurry.
