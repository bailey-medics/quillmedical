# Stacked branches plan

**Date:** 2026-09-14
**Status:** Investigated, then parked. Nothing below was adopted.

## Outcome: wait for GitHub's stacks to mature

The plan below was written first and acted on second. A real four-branch
stack was built, pushed, and observed end to end. **The decision is to
wait**, and the plan is kept unchanged beneath this section because the
reasoning in it remains sound — only the tooling was found wanting.

### What was tried

Pull requests #667 to #670, stacked with
[git-spice](https://abhinav.github.io/git-spice/):

- `feature/stacked-branches-plan` (#667) — base `main`
- `feature/2nd-changes` (#668) — base `feature/stacked-branches-plan`
- `feature/3rd-changes` (#669) — base `feature/2nd-changes`
- `feature/4th-changes` (#670) — base `feature/3rd-changes`

GitHub then offered, via a banner on the pull requests, to adopt the
chain as one of its own **native stacks**. That offer was accepted and it
worked cleanly: the stack was recognised, no base branch was changed, and
the pull requests kept their numbers.

### What the experiment corrected

Two sections of the plan below assert blockers. **Both are wrong**, and
they are left in place rather than edited so the record shows what was
believed and what was found.

- **"Both CI workflows ignore pull requests that do not target `main`"
  — false.** Run `34871904347` is a `pull_request` event for #668, whose
  base is a feature branch, and it ran the heavy tier; the four gate
  contexts reported too. All four pull requests finished with 40 or 41
  checks and nothing failing. What had suppressed the checks was **draft
  status**, not the `branches: [main]` filter — marking them ready fired
  everything within seconds. So Phase 1 is unnecessary.

- **"`strict_required_status_checks_policy` blocks stacked pull
  requests" — false.** #668 to #670 did show `BLOCKED`, which looked like
  confirmation, but the cause was two still-running checks; #667, whose
  checks had finished, showed `CLEAN`. The `protected-branches` ruleset
  targets `refs/heads/main` alone, and a ruleset applies to the branch
  being written to — so a pull request based on a feature branch is
  governed by neither the queue nor `strict`. Phase 2 is unnecessary too.

**This repository therefore needs no changes at all to support
stacking.** Whenever it is adopted, it can be adopted as-is.

A third correction, to this document's own research: its assessment of
`github/gh-stack` was wrong in three claims of four. The worktree fix is
**released** (PR #330, merged 29 July 2026, in v0.1.0 — the pull request
numbers cited below are misidentified); the repository is **active**
(v0.1.1 shipped 2 September 2026); and **#444 is not an established
blocker** but a single uncorroborated report needing a stack large enough
to overflow a merge group plus its 50% buffer. Only "#35 and #87 are open
and unfixed" was right. Crucially, **those are defects in the `gh stack`
CLI** — the web banner and the server-side rebase run in GitHub's
infrastructure and cannot be affected by local worktrees.

### Why wait, then

Not because stacking failed. It worked. The friction is in living with
it day to day:

- **Neither tool has a VS Code extension worth using.** GitHub has none
  at all — the official "GitHub Pull Requests and Issues" extension was
  checked directly at v0.166.0 and has 172 commands, none stack-related,
  with no mention of stacks anywhere in its bundle. Its documentation
  lists the surfaces as the website, the CLI, mobile and coding agents;
  VS Code is never named and GitHub Desktop is explicitly excluded. Two
  feature requests exist — `microsoft/vscode-pull-request-github#8887`
  and `microsoft/vscode#328721` — both assigned, neither answered.
  git-spice's only extension is third-party and pre-1.0.

- **The git-spice command line asks a lot to be remembered.** The binary
  is `git-spice` rather than `gs`; `brew link` can leave nothing on
  `PATH`; a bare `repo init` prompts and so dies in any non-interactive
  context; authentication is separate from `gh`; a branch made with
  `git switch -c` is invisible to it; an interrupted `branch create`
  leaves a detached HEAD. Each is small. Together they are the cost.

- **The tooling can live inside the stack it manages.** The `just`
  recipes written during the trial were committed to upper branches, so
  moving down to fix the bottom branch removed the very commands needed
  to fix it.

- **Review happens in VS Code.** A stack driven entirely from a browser
  and a terminal is more friction than the reviewing gain justifies for
  a single developer.

### The trigger to revisit

**An official VS Code integration for GitHub's stacked pull requests.**
The two feature requests above are the thing to watch. GitHub's is the
implementation to adopt rather than git-spice's: it is server-side, so
indifferent to the four worktrees here; it handles the merge queue
natively; and its "Rebase stack" button needs no local checkout.

A secondary trigger, if that is slow: `gh-stack` issues #35 and #87
closing, which would make its CLI safe in a multi-worktree checkout.

**Not adopted:** the `just` recipes written during the trial, the CI
trigger change of Phase 1, and the removal of `strict` in Phase 2. The
last two solve problems that do not exist. The recipes work, and remain
on the trial branches if they are ever wanted.

---

The original plan follows, unchanged.

## Summary

Added to see what happens if we edit the first branch

The intent is continuous incremental improvement of how work reaches
`main` — Kaizen applied to the review process rather than to the code.
Graphite has been used before for this; [git-spice](https://abhinav.github.io/git-spice/)
is the alternative proposed here, because it is a local CLI over ordinary
git branches with no service, no account and no hosted state. A third-party
VS Code extension exists and the maintainer is now adding APIs to support
it, but it is not official — see the research findings below.

The change: a plan's review units become stacked pull requests rather
than one large one. The unit of work stays what the plan documents
already call a unit; what changes is that each one reaches `main` as its
own small pull request, reviewable on its own, instead of being flattened
into a single commit range at the end.

This is a change to how work is submitted for review. It is not a change
to how work is written, tested, human-reviewed or merged, and it does not
aim to make Claude produce more code.

## Why

The plan documents already decompose work correctly. The clinician
passport plan says so in as many words:

> The commits are the review unit; the pull request is the feature.
> The order is deliberate. Each unit is useful to review on its own, and
> each depends only on the ones above it, so a change of mind at unit
> three does not invalidate unit one.

It then names five units. Those five units became five commits inside a
single pull request — #610, **+9919 lines across 34 files**, reviewed in
one sitting. The decomposition was done, and then discarded at exactly
the point where it would have paid off.

The same shape repeats across the branch:

- **#610** — +9919 / −30, 34 files, 6 commits
- **#655** — +3949 / −37, 18 files, 9 commits
- **#658** — +1961 / −647, 30 files
- **#657** — +1645 / −395, 31 files

The phases were also serialised by review rather than by code. Phase 1
merged at 12:17 and phase 2 was created at 19:28; phase 4 merged at 19:43
and phase 5 was created at 20:15. Yet the files barely overlap — phase 2
adds `gcs_store.py`, phase 3 `router.py`, phase 4 `render.py` and
`pdf.py` — and only two of the five phases added a migration. Very little
in the code forced that ordering. Waiting for a human did.

**The bottleneck is review, not authoring.** CI is roughly four minutes.
Pull requests merge in anything from 0.2 to 17 hours. Four worktrees are
usually checked out but only two pull requests are typically open. There
is one reviewer, and a night of unattended work that lands as one
ten-thousand-line pull request makes the following morning harder, not
easier. Stacking is what makes a large batch of generated work
reviewable: six pull requests of a few hundred lines each, in dependency
order, instead of one that has to be read all at once.

## Merging mid-feature to reach teaching

Some units must merge before the feature they belong to is finished, so
the business logic can be exercised on GCP. `deploy.yml` triggers on
`branches: [main]`, so landing on `main` deploys to teaching
automatically, and there is no other way to run the code on real
infrastructure.

This is a constraint on stacking, not an argument against it. It decides
how the bottom of a stack is chosen:

- **The bottom branch must be safe to deploy on its own.** It will be
  live on teaching within minutes of merging. This is not hypothetical:
  it is the ordinary consequence of every merge.
- **Half a feature on `main` is fine; half a feature reachable by a user
  is not.** The existing answer is the one the passport plan already
  reached — feature-gate the entry point, then merge freely underneath
  it. Its own words: code "merged into `main` would be a feature nobody
  can use and nobody can delete".
- **Order units so the deployable one is at the bottom.** Where a unit is
  only meaningful together with the one above it, they are one unit and
  should not have been split.

It also sharpens the case against merging a whole stack at once: the
reason for merging early is to test _one_ piece on teaching, and an
action that lands six branches together deploys all six.

## What git-spice does

A stack is a chain of branches, each based on the one below it rather
than on `main`. `gs` tracks that chain locally in a git ref and knows how
to rebase the whole chain when anything below changes.

- **Submitting** opens one pull request per branch, each based on its
  parent, with the bottom one based on `main`. Each pull request gets a
  navigation comment showing its position in the stack.
- **Restacking** rebases the upper branches when a lower one changes,
  which is the operation that makes the pattern viable by hand.
- **Syncing** detects which pull requests have merged, deletes those
  branches, and retargets what remains onto `main`.

## Research findings

Gathered 2026-09-14, against GitHub's documentation, the git-spice docs
and both issue trackers. Each finding is marked **confirmed** where a
source states it outright, or **inferred** where it follows from what is
written but is never said in as many words. The inferred ones are what
Phase 0 exists to settle.

### The merge queue attaches to the base branch

**Inferred.** The `protected-branches` ruleset — which carries both the
merge queue and `strict` — targets `refs/heads/main` and nothing else,
with an empty exclude list. Rulesets apply to the branch being written
to, which for a merge is the base. So a pull request based on
`feature/unit-1` should be subject to neither the queue nor `strict`, and
should show the ordinary merge button.

GitHub's documentation consistently says "targeting a branch that
requires a merge queue", which implies this, but never states the
converse. No page describes what the merge box looks like for a pull
request based on an unprotected feature branch. This is the single most
load-bearing assumption in the plan and the cheapest to test.

### A merge queue cannot cover `feature/**`

**Confirmed.** "A merge queue cannot be enabled with branch protection
rules that use wildcard characters (`*`) in the branch name pattern", and
the rule is repository-level only, never available in organisation
rulesets. So there is no arrangement in which stacked pull requests get a
queue of their own. Only the bottom of a stack is ever queued.

### `strict` may not block anything after all

**Inferred, and it contradicts "What blocks this today" below.** If the
ruleset only governs pull requests whose base is `main`, then `strict`
only ever applies to the bottom of a stack — and the bottom of a stack is
up to date with `main` by construction, because that is what it is based
on. On that reading `strict` blocks nothing and Phase 2 is unnecessary.

The section below is left as written rather than rewritten, because the
two readings are distinguished by an experiment that has not been run
yet. Phase 0 settles it, and whichever way it falls, one of the two
sections is then corrected rather than both being hedged now.

If `strict` turns out not to block stacking, the whole plan reduces to
Phase 1: widening the CI triggers.

### GitHub now has native stacked pull requests

**Confirmed.** Public preview since 30 July 2026, free, no waitlist. A
`gh stack` CLI extension (`gh extension install github/gh-stack`) plus
web and mobile support; GitHub Desktop is explicitly excluded. The
commands mirror git-spice closely — `init`, `add`, `rebase`, `submit`,
`sync`, `merge` — and its default alias is also `gs`.

Two things it gets right that matter here:

- **The bottom pull request can merge on its own.** "You can merge any
  number of pull requests at once, as long as they form a contiguous
  group starting from the lowest unmerged pull request", after which
  "the next unmerged pull request is automatically rebased to target the
  stack base directly". The warning that a mid-stack pull request cannot
  merge in isolation is a restriction on merging _upward_ — skipping the
  ones below — not on landing the bottom one. This is exactly the
  one-unit-at-a-time rhythm the teaching deploy needs.
- **Pull requests open as drafts by default.** `--open` is the opt-out,
  so the `ready_for_review` gate this repository depends on is safe
  without configuration.

It also has a genuine advantage git-spice lacks: a **"Rebase stack"
button in the web merge box**, which performs the cascading rebase
server-side with no local checkout.

### Why native stacks are not adopted here yet

**Confirmed, from the `github/gh-stack` tracker (~123 open issues).**
Both blocking problems fall in this repository's two most sensitive
areas.

- **Worktrees — issue #35, open.** `gh stack rebase` prints
  `✓ Rebased <branch> onto <base>` and exits zero when the branch is
  checked out in another worktree, having done nothing. A silent no-op
  reporting success is the same failure class as the stale-worktree test
  runs recorded in `CLAUDE.md`, which produced a "full suite green"
  claim that had to be retracted. Issue #87 is the companion: `gh stack
sync` fails outright on worktrees. Four worktrees are normally checked
  out here.
- **Merge queue — issue #444, open.** When a stack is too large for one
  merge group the queue splits it, and the pull request at the boundary
  has its base deleted by the same merge, is re-targeted onto another
  branch that merge also deleted, and is then **closed**. The closed
  pull request cannot be recovered through the API or the UI.
  Merging one at a time should avoid it — a single-pull-request group
  cannot split — but that is inference, not GitHub's guidance.

Two smaller ones worth noting: commits **lose GPG verification** during
stack rebases (maintainer says a fix is in progress), and `gh stack
sync` always rebases, which breaks review history (#354).

**Reassess when #35, #87 and #444 are closed.** That is a checkable
trigger rather than a vague "when it matures", and the server-side rebase
button plus the native stack map are worth migrating for once the
foundation is sound.

### Batch merging a stack

The Graphite habit of selecting the third pull request and merging it
with everything below is what prompted this. Both tools have the
command; neither can be relied on here, and for different reasons.

**git-spice — does not work under a required queue. Confirmed.**
`gs downstack merge` merges through the forge's plain merge API, which
returns **405, "This branch must be merged through the merge queue"**
when a queue is required. Joining a queue needs a different call that
git-spice does not make. The maintainer has never tested against a queue
and says so: "It might? I don't have a merge queue to test with yet." It
is also experimental, off by default behind `spice.experiment.merge`,
documented as possibly "incomplete or buggy", and has an open issue
(#1357) where it waits forever if a pull request is merged out of band —
which a queue does by definition.

**GitHub native stacks — works, but can lose a pull request.
Confirmed.** Batch merging is supported and queue-aware, but issue #444
is open: when a stack is too large for one merge group the queue splits
it, and the pull request at the boundary has its base deleted by the
merge, is re-targeted onto another branch the same merge deleted, and is
then closed. It cannot be recovered through the UI or the API. Merging
one at a time should avoid it, since a single-pull-request group cannot
split, but that is inference rather than documented guidance.

**Neither tool escapes the underlying limit. Confirmed.** GitHub accepts
only the bottom pull request of a stack into a merge queue — "it will not
put multiple stacked branches into the queue because GitHub doesn't
support that". So every batch merge is internally a loop: merge the
bottom, restack, re-target, queue the next. Nothing lands a stack
atomically. The only thing a button changes is whether a human watches
the loop run.

**Turning the merge queue off would clear the 405 — and is still not
worth it.** The ordinary merge endpoint returns, so `gs downstack merge`
would work. But the queue is what re-tests each pull request against
current `main`, and a stack is the one case where `main` genuinely moves
underneath the work, because the stack itself is what moves it. The
feature would still be experimental, and it would still conflict with the
rule that merging is a human decision. The 405 is the least important of
the three obstacles, and removing the queue clears only that one while
giving up a protection added deliberately after the problem was hit
twice.

**If the clicking is the irritation**, the cheap answer is a `just`
recipe that queues the bottom pull request and runs `gs repo sync` when
it lands: the same convenience, with the queue intact and one human
decision per pull request preserved.

### The git-spice VS Code extension

**Confirmed.** There is still no official one. The maintainer closed the
request as _not planned_ in November 2025 — "I don't have plans to
develop a VSCode integration at this time because I don't use it" — and
the integrations page lists only an Emacs plugin.

What has changed is that the third-party extension is now
upstream-supported rather than ignored: `irl-llc/git-spice-code-extension`
has reached v0.1.1 (June 2026), and three git-spice issues exist
specifically to serve it — JSON output from `gs log`, per-change forge
checks, and cross-forge inline review comments, the last naming the
extension as its motivating example.

It remains immature: 3 stars, around 100 installs, 34 open issues, and no
commits since 24 June 2026. Worth watching, not worth depending on.

## What blocks this today

Two settings block stacking outright. Both were checked against
`infra/github/branch_rules.tf` and the workflow files rather than
assumed, and neither is the merge queue.

**1. `strict_required_status_checks_policy = true`.** This is "branch
must be up to date with `main` before merging". A stacked pull request is
never up to date with `main` by construction — its base is the branch
below it. The flag blocks every pull request in a stack except the
bottom one, and no queue configuration changes that.

It is also now **redundant**. It predates the merge queue, introduced
when the strategy was rebase-before-merge (see
[CI post-merge strategy](2026-08-21-ci-post-merge-strategy.md)). The
queue already re-runs every required check against the pull request
combined with current `main` on the merge-group ref, which is the same
guarantee by a different route. `.claude/rules/ci.md` records that the
queue replaced the manual rebase. Removing `strict` therefore gives up
nothing that is not already provided.

**2. Both CI workflows ignore pull requests that do not target `main`.**
`ci.yml` and `gate-breaking.yml` scope their `pull_request` triggers to
`branches: [main]`. A stacked pull request based on `feature/unit-2`
fires no `pull_request` event at all, so the entire heavy tier and all
four gate contexts never report. Such pull requests hang on "Expected —
Waiting for status to be reported" — the exact failure
`.claude/rules/ci.md` records happening for real with Renovate.

The fast tier survives, because it triggers on `push` to any non-`main`
branch. So without this change a stacked pull request gets lint,
typecheck and unit tests, and nothing else.

## What does not need to change

- **Keep the merge queue.** It is not the blocker. `.claude/rules/ci.md`
  documents three separate ways it was broken from a distance and what
  each cost, and the post-merge plan chose it deliberately so that CI
  never has to run on `main`.

  Turning it off would clear the 405 that stops `gs downstack merge`
  working, and that is the whole of what it would buy: the feature stays
  experimental, it still conflicts with the rule that merging is a human
  decision, and GitHub still refuses to queue anything but the bottom
  pull request. One obstacle of three removed, in exchange for the
  protection that re-tests each pull request against current `main` — in
  the one situation where `main` genuinely moves underneath the work,
  because the stack itself is what moves it. See "Batch merging a stack".

- **Keep merging one pull request at a time, by hand.** The flow is:
  queue the bottom pull request, let it merge, `gs repo sync`, queue the
  next. One click per pull request, each one a decision that this change
  is fit for `main`. Note this is not a safety argument about catching
  breakage — CI does that, on every pull request, and again in the queue
  against current `main`. It is the existing rule that merging is a human
  decision, and the fact that no tool can batch it here anyway. See
  "Batch merging a stack" in the research findings.

- **Merge commits are fine.** `gs repo sync` asks the GitHub API whether
  a pull request merged, which is merge-strategy agnostic, so
  `merge_method = "MERGE"` is detected correctly and the branch deleted.
  The widely quoted "this only works for merge commits and
  fast-forwards" line is the fallback for remotes git-spice does not
  support natively, not for GitHub.

- **The approvals blocker does not apply.** git-spice's documentation
  warns that a repository dismissing approvals when a pull request's base
  changes is fundamentally incompatible with stacking.
  `dismiss_stale_reviews_on_push = true` is set here — but
  `required_approving_review_count = 0`, so no approval is ever required
  and there is never one to dismiss. **It stops being a non-issue the
  moment required approvals are turned on**, which is the one
  configuration change that would invalidate this plan.

- **Branch naming works.** `git config spice.branchCreate.prefix
"feature/"` makes every created branch satisfy the branch-naming
  ruleset, which accepts `feature/*`.

- **Every pull request must still open as a draft.** `auto-pr.yml` opens
  them with `--draft`, and the heavy tier and four gate contexts trigger
  on `ready_for_review` and `synchronize`, never on `opened`. Anything
  git-spice opens must be a draft too, or those contexts never report.

## Risks

- **Worktrees share one state store.** Confirmed by observation on
  2026-09-14, no longer inferred: `git-spice repo init` run in the
  `quillmedical-4` worktree wrote `refs/spice/data` into the main
  checkout's `.git/refs/spice/`, where every worktree reads it. Upstream
  issue #1247
  describes the consequence: stack-wide operations act on all tracked
  branches regardless of which worktree they belong to, so a command run
  in one worktree can churn stacks checked out in another. git-spice
  skips branches checked out elsewhere rather than corrupting them, but
  the operations are not worktree-scoped today. **Mitigation:** prefer
  the branch-scoped `gs upstack` and `gs downstack` commands over bare
  `gs stack restack` whenever another worktree holds live branches.

- **Migrations are the sharp edge.** Fifteen landed in three weeks,
  guarded by the `Alembic autogenerate drift check` and the
  `DB migration immutability check`, the latter with no approval path at
  all. Stacked branches each adding a migration share one
  `down_revision` chain that is rewritten on every restack, and a broken
  chain is exactly the kind of failure an unattended run would produce
  silently. **Mitigation:** at most one migration per stack, in the
  bottom branch. A unit needing a second migration starts a new stack
  after the first has merged.

- **CI cost multiplies.** There are 18 required checks, and widening the
  triggers means a stacked pull request runs the heavy tier — Storybook
  interaction tests, Semgrep, E2E — against a base that is not `main`. A
  six-deep stack is roughly six times the runs. **Mitigation if that
  bites:** gate the heavy tier on `base == main`, so stacked pull
  requests run the fast tier only until they reach the bottom of the
  stack. Weaker, and it means the heavy tier first sees a unit at the
  moment it is about to merge, but far cheaper.

- **Removing `strict` is a real change to the merge gate**, even though
  the queue supplies the same guarantee. If the queue is ever disabled
  through `var.merge_queue_enabled` — the documented escape hatch for a
  ruleset deadlock — the repository is then left with neither protection
  for as long as the hatch is open. **Mitigation:** note it in the
  escape-hatch runbook in `.claude/rules/ci.md`, so re-enabling the queue
  is understood as restoring the gate rather than a tidy-up.

- **The VS Code extension is not worth depending on.** There is no
  official one, and the third-party one is at v0.1.1 with around 100
  installs and three months without a commit. It is now upstream-aware —
  git-spice is adding JSON APIs specifically to serve it — so this may
  change. This plan uses the CLI only; review continues in the VS Code
  Source Control diff view, which none of this affects.

## Setting up git-spice

Written to be lifted into `docs/docs/` as its own page once the approach
is settled, so it repeats a little of what is above and assumes no
knowledge of this plan.

### The short version

```bash
just si
```

`just stack-init` installs git-spice if it is missing, works around the
Homebrew link failure described below, initialises the repository with
the flags that avoid an interactive prompt, and sets both git config
options this repository needs. It is idempotent, and `just i`
(`initialise-repo`) calls it, so a fresh clone gets it for free.

The rest of this page is what that recipe does and why, for when it
fails or the details matter.

**Only the already-installed path has actually been run.** As of
2026-09-14 the recipe has been exercised on a machine where git-spice
was present and the repository already initialised, where it correctly
did nothing. The branches that install the tool, link it around the
Homebrew failure, and run `repo init` for the first time are written
from what was done by hand and have not been executed by the recipe
itself. If `just si` misbehaves on a fresh machine, that is unlucky
rather than surprising — the steps below are the manual equivalent, and
each one is known to work.

### Install the command-line tool

```bash
brew install git-spice
```

**The binary is `git-spice`, not `gs`.** Homebrew renamed it, and says so
on install. Anything written against the upstream documentation — which
uses `gs` throughout — needs the name changed or an alias adding:

```bash
alias gs='git-spice'
```

**Homebrew's link step may fail, leaving the binary off `PATH`.** On this
machine it failed with:

```text
Error: Could not symlink share/fish/vendor_completions.d/git-spice.fish
/usr/local/share/fish/vendor_completions.d is not writable.
```

That directory belongs to fish and matters not at all to a zsh user, but
`brew link` is all or nothing: one unwritable path aborts every symlink,
including `bin/git-spice`. The result is a formula Homebrew reports as
installed and a `command -v git-spice` that finds nothing.

Link the two things that matter directly, which needs no `sudo` when
`/usr/local/bin` is group-writable, as it is here:

```bash
ln -sf /usr/local/opt/git-spice/bin/git-spice /usr/local/bin/git-spice
ln -sf /usr/local/opt/git-spice/share/zsh/site-functions/_git-spice \
       /usr/local/share/zsh/site-functions/_git-spice
```

Then confirm:

```bash
command -v git-spice && git-spice --version
```

### Initialise a repository

Run once, from a terminal, before opening the VS Code panel:

```bash
git-spice repo init --trunk main --remote origin
git config spice.branchCreate.prefix "feature/"
```

**Pass `--trunk` and `--remote` rather than running a bare
`repo init`.** Without them git-spice asks which branch is trunk and
which remote to use. That is fine in a terminal and fatal anywhere that
cannot answer a prompt — see the next heading.

The prefix matters: branch protection rejects any branch outside
`feature/*`, `hotfix/*`, `copilot/*` and `renovate/*`, and finding that
out after a branch exists means unpicking it by hand. `repo init` does
not set it, so it is a separate command.

State lives in the git ref `refs/spice/data`. Ordinary refs are shared
between worktrees, so every worktree of this repository sees one store —
see the worktree warning below.

### "Not allowed to prompt for input"

The first thing the VS Code panel does in an uninitialised repository is
fail, like this:

```text
Load branches: Command failed: git-spice ll -a --json
INF Repository not initialized. Initializing.
INF Using remote: origin
FTL git-spice: main.ListHandler: auto-initialize: guess trunk:
    prompt for trunk branch: not allowed to prompt for input
```

Nothing is broken. git-spice found no state, tried to initialise itself,
and needed to ask which branch is trunk — and an extension has no
terminal to ask in. Run the `repo init` above with both flags, then press
**Refresh** in the Git Spice panel.

The same failure will appear anywhere non-interactive — a CI job, a hook,
an agent session — so always give `repo init` its flags rather than
relying on the prompt.

If `repo init` reports the branch is behind, believe it:

```text
WRN main is behind upstream by 20 commits
WRN Please run 'git-spice repo sync' before other git-spice commands.
```

A stack built on a stale trunk produces pull requests whose diffs carry
unrelated changes. Sync first.

### Log in to GitHub

git-spice keeps its own credentials rather than borrowing the ones `gh`
holds, so there is a one-off login per machine:

```bash
git-spice auth login --forge=github
```

Choose **CLI** from the menu it offers. That reuses the token `gh`
already has, which avoids creating a second credential to rotate or
revoke. The other methods — OAuth, a GitHub App, a personal access
token, Git Credential Manager — all mean another secret in another
place.

The token is stored in the system keychain, so this is once per machine
rather than once per clone or worktree. `just si` checks for it and says
what to run, but deliberately does not run it: the menu is interactive,
and `auth login` fails outright when a token already exists.

Without it, the first submit fails like this:

```text
ERR No authentication token found for github.
FTL git-spice: submit branch feature/...: not logged in to github
```

### Tracking a branch git-spice did not create

`just sn` (`git-spice branch create`) registers a branch as it creates
it. A branch made the ordinary way — `git switch -c`, or `git checkout
-b` — is invisible to git-spice, and submitting it fails:

```text
FTL git-spice: submit branch feature/...: lookup branch:
    does not exist in store
```

The cure is to track it:

```bash
git-spice branch track --base main
```

`just ss` now runs `branch track` before every submit, so this is mostly
background. It does so unconditionally rather than after checking:
tracking is idempotent — on an already-tracked branch it re-confirms the
base and exits 0 — and git-spice offers no query for "is this branch
tracked", so there is nothing to check against. Tracking is harmless and
reversible with `git-spice branch untrack`, which is why the recipe acts
here rather than only reporting — unlike the login above, which it never
performs.

### The VS Code extension

Optional, and a viewer rather than a replacement for the command line.
Install "Git Spice" by IRL AI LLC from the marketplace. It adds one
panel to the Source Control sidebar showing the stack, the commits on
each branch and the state of each change request, plus right-click
operations and `Cmd+Shift+Enter` in the commit box to create a branch
from the message.

Three things to know before using it:

- **Leave `git-spice.path` empty.** The extension invokes `git-spice` by
  default, which is exactly what Homebrew installs. Set it only if the
  binary is elsewhere or renamed. Setting it to a bare `gs` would be a
  mistake on a machine that has Ghostscript, whose binary is also `gs`.
- **Never use "Submit Stack".** That command is hardcoded as
  `stack submit --fill --no-draft`, so every pull request in the stack
  opens ready for review. This repository's heavy CI tier and its four
  gate checks fire on `ready_for_review` and `synchronize` and never on
  `opened`, so a pull request created ready gets none of them and hangs
  on "Expected — Waiting for status to be reported" with nothing in the
  Actions tab to explain it. Use the per-branch **Submit**, which passes
  no draft flag, or run `git-spice stack submit` in a terminal.
- **The marketplace build is behind the source.** The published version
  is v0.0.4 (30 May 2026) and predates the fix for using git-spice inside
  a worktree; the repository is on v0.1.1 and their release workflow has
  been failing since July. Build from source to get the fix:

  ```bash
  git clone https://github.com/irl-llc/git-spice-code-extension.git
  cd git-spice-code-extension
  npm install
  npx vsce package --no-dependencies
  code --install-extension git-spice-*.vsix
  ```

The extension shows change-request state but **not CI check results** —
that is an open upstream request. GitHub remains the place to see whether
a pull request is green.

### Worktrees

git-spice's state is one ref shared by every worktree, and stack-wide
operations are not worktree-scoped upstream yet: a command run in one
worktree acts on tracked branches belonging to another. Branches checked
out elsewhere are skipped rather than corrupted, but the effect is still
surprising.

Prefer the branch-scoped commands — `git-spice upstack …` and
`git-spice downstack …` — over `git-spice stack restack` whenever another
worktree has live branches.

### Everyday commands

Use the `just` recipes. Each one wraps a git-spice command with the flags
this repository needs, so the decisions are made once and reviewed rather
than retyped:

```bash
just si    # stack-init     — install and set up git-spice (once per clone)
just sl    # stack-log      — show the stack
just sn x "feat: y"  # stack-new — branch feature/x on top, committing your changes
just sm    # stack-amend    — fold changes into this branch's commit
just sr    # stack-restack  — rebase the branches above this one
just ss    # stack-submit   — open or update this branch's PR, as a draft
just ssa   # stack-submit-all — ditto for every branch in the stack
just sy    # stack-sync     — drop merged branches, re-target the rest
```

Two of those carry a decision worth knowing about:

- **`just ss` passes `--draft` explicitly.** Every pull request here must
  open as a draft or it never gets the heavy CI tier or the four gate
  checks. Belt and braces:
  `git config spice.submit.draft true` sets the same default for any
  submit run by hand.
- **`just sr` runs `upstack restack`, not `stack restack`.** The
  stack-wide form reaches branches belonging to other worktrees; this
  touches only what sits above the current branch.

Navigation has no recipe, because it is harmless and shorter to type
directly: `git-spice up`, `down`, `trunk`.

`just sy` is the one to run after a pull request merges: it notices the
merge, deletes the branch, and re-targets whatever sat above it onto
`main`.

**Do not use `git-spice stack merge` or `git-spice downstack merge`**
here. Merging is a human decision under this repository's rules, and the
commands do not work against a required merge queue in any case — see the
research findings above.

## Phases

### Phase 0: prove a stack can go green

Done by hand, on a branch that would have been written anyway, before any
configuration or tooling changes. The point is to find out what actually
happens, and to record it — every expectation below is a prediction until
it is observed.

- [x] `brew install git-spice`. Done 2026-09-14. Two surprises, both
      written up in "Setting up git-spice" above: the binary is
      `git-spice` rather than `gs`, and `brew link` aborted on an
      unwritable fish completions directory, leaving nothing on `PATH`
      until `bin/git-spice` was symlinked by hand.
- [x] `git-spice repo init` in one worktree, and
      `git config spice.branchCreate.prefix "feature/"`. Done
      2026-09-14. A bare `repo init` is not enough: the VS Code panel
      triggered an auto-initialise that died with "not allowed to prompt
      for input", because guessing the trunk needs a question asked.
      `--trunk main --remote origin` answers it up front. Written up
      under "Not allowed to prompt for input" above.
- [ ] Build a two-branch stack for a small piece of real work and submit
      it with `gs stack submit`.
- [ ] **Verify both pull requests opened as drafts.** If they did not,
      stop and find the flag that makes git-spice open drafts. Everything
      downstream depends on it.
- [ ] Confirm the upper pull request's base is the lower branch, not
      `main`, and that the branch-naming ruleset accepted both.
- [ ] **Confirm what the upper pull request reports before any CI change**
      — the expectation is fast tier only, with the heavy tier and the
      four gate contexts never appearing. Record what is actually seen.
- [ ] **Confirm the merge queue accepts a pull request based on a feature
      branch, or only ones targeting `main`.** If only `main`, that is
      fine — only the bottom of a stack is ever queued — but it must be
      known rather than assumed.
- [ ] Mark the bottom one ready, queue it, let it merge, and confirm it
      deploys to teaching as any other merge does.
- [ ] Run `gs repo sync` and confirm the merged branch is deleted and the
      upper pull request is retargeted onto `main`.
- [ ] Record everything that contradicted this plan.

### Phase 1: widen the CI triggers

Smallest change that unblocks anything, and independently useful. Do it
alone and verify it before touching branch protection.

- [ ] Add `feature/**` alongside `main` in the `pull_request` trigger's
      `branches` list in `.github/workflows/ci.yml`.
- [ ] Do the same in `.github/workflows/gate-breaking.yml`.
- [ ] Re-read that workflow's trigger comment first: it explains at
      length why `opened` is excluded and why the gates must not re-run
      on `merge_group`. Neither reason is affected by widening the base
      filter, but the change belongs next to that reasoning.
- [ ] Verify on the Phase 0 stack that the upper pull request now reports
      the heavy tier and all four gate contexts.
- [ ] Decide whether the heavy tier stays on for non-`main` bases or is
      gated to `base == main` for cost. Record the decision and why.

### Phase 2: drop the strict policy

- [ ] Set `strict_required_status_checks_policy = false` in
      `infra/github/branch_rules.tf`, with a comment saying the merge
      queue now provides the guarantee and pointing at the post-merge
      strategy plan it came from.
- [ ] `just terraform-github`, and confirm no other drift.
- [ ] Verify the upper pull request of the Phase 0 stack can now be
      queued once the one below it has merged.
- [ ] Add the interaction to the escape-hatch runbook in
      `.claude/rules/ci.md`: with `strict` gone, disabling the queue
      removes both gates at once.

### Phase 3: worktree behaviour

- [ ] With stacks live in two worktrees at once, run the branch-scoped
      commands and confirm they leave the other worktree's stack alone.
- [ ] Establish whether bare `gs stack restack` is safe enough to use
      here at all, or should simply be avoided.
- [ ] Write the finding up as a rule in `.claude/rules/`, beside the
      existing worktree guidance, so the constraint is stated where it
      will be read.

### Phase 4: plan format

- [ ] Extend `.claude/rules/plans.md` so a phase states its review units
      explicitly, in the form the clinician passport plan already uses —
      a named unit, a sentence or two on what it contains, and what it
      depends on.
- [ ] State the rule plainly: **one unit, one branch, one pull request.**
- [ ] State the deployability rule: the bottom unit of a stack must be
      safe to deploy to teaching on its own, feature-gated if it is not.
- [ ] State the migration constraint: at most one migration per stack, in
      the bottom unit.

### Phase 5: tooling

- [x] Add `just` recipes wrapping the handful of commands actually used,
      following `.claude/rules/just.md` — alias above the comment, two
      blank lines between blocks. Done 2026-09-14: `stack-log` (`sl`),
      `stack-new` (`sn`), `stack-restack` (`sr`), `stack-submit` (`ss`)
      and `stack-sync` (`sy`), with a private `_git-spice` helper that
      resolves the binary and explains the Homebrew link failure when it
      cannot. Two decisions are baked into the recipes rather than left
      to memory: `stack-submit` passes `--draft` explicitly, and
      `stack-restack` runs `upstack restack` rather than the stack-wide
      form that reaches into other worktrees.
- [x] Add `stack-init` (`si`) for fresh clones, and call it from
      `initialise-repo`. Done 2026-09-14: it installs git-spice when
      absent, links the binary directly rather than re-running the
      `brew link` that fails here, runs `repo init --trunk main --remote
    origin` only when `refs/spice/data` is absent, and sets both
      `spice.branchCreate.prefix` and `spice.submit.draft`. Idempotent,
      because `just i` runs per worktree while the state ref is shared
      by all of them.
- [ ] Decide, and write down, whether `just rebase` keeps its current
      single-branch behaviour or learns about stacks. It currently
      assumes one branch on `main` and would do the wrong thing inside a
      stack.

### Phase 6: the /crp skills

- [ ] Teach `/crp` to submit with git-spice when the branch is tracked in
      a stack, and to push as it does now when it is not.
- [ ] Update the "branch merged and deleted at origin" logic, which
      assumes a flat model. In a stack the answer is `gs repo sync`
      rather than cutting a fresh branch from `main`.
- [ ] Leave every rule in the "Never" section exactly as it stands.
      Nothing here merges anything, and `gs stack merge` is not to be
      used — see the decision below.
- [ ] Mirror the changes into `/crpf`.

### Phase 7: the overnight run

Only once the phases above have landed.

- [ ] Write a plan whose units are sized for stacking, and use it for one
      unattended run.
- [ ] Review the resulting stack the next morning and record whether the
      unit boundaries survived contact with a real generated batch, or
      whether the units drifted into each other.

## Decisions

- **Keep the merge queue; remove `strict` instead.** The queue was
  assumed to be the obstacle and is not. `strict` is what blocks a
  stacked pull request, it is redundant now the queue re-tests against
  current `main`, and it is a leftover from the rebase-before-merge era
  that the queue replaced.

- **Do not batch-merge a stack.** `gs stack merge` and `gs downstack
merge` exist — the latter is Graphite's "merge everything below"
  button — and are deliberately unused. Two reasons, either sufficient:
  merging into `main` is a human decision under the existing rules, and
  the tooling cannot do it here anyway (405 against a required queue;
  experimental; and GitHub queues only the bottom pull request
  regardless).

  **This is not a safety argument, and an earlier draft wrongly made it
  one.** That draft claimed batching would cost the ability to tell which
  unit broke teaching. It would not: every pull request runs the full
  eighteen required checks, and the queue re-runs them against current
  `main` before merging. Nobody inspects the teaching site between
  merges, so the deploy boundary it promised was a benefit never
  collected. What batching actually costs is narrow — a bug that passes
  all eighteen checks and only appears on real infrastructure would be
  bisected across several changes instead of one — and even that is
  mostly theoretical, because the queue merges one at a time whatever the
  user interface does.

- **The bottom of a stack must be independently deployable.** Merging to
  `main` deploys to teaching with no further gate, so "not finished yet"
  is not a reason it cannot merge, but "not safe to be live" is. Feature
  gating is the existing answer and needs no new mechanism.

- **One migration per stack, in the bottom branch.** A shared
  `down_revision` chain rewritten by every restack is the one failure
  here that is both silent and guarded by a check with no approval path.
  Keeping migrations out of the upper branches removes the class of
  problem rather than managing it.

- **Prefer `gs upstack` and `gs downstack` to `gs stack`.** Stack-wide
  commands are not worktree-scoped upstream yet, and four worktrees are
  normally checked out here. The branch-scoped commands do the same work
  with a smaller blast radius.

- **The CLI, not the extension.** The only VS Code extension is
  third-party, at v0.1.1 with around 100 installs and quiet since June.
  Review already happens in the Source Control diff view, which is
  unaffected either way. Reconsider if the extension gains traction — the
  upstream work now going into supporting it makes that plausible.

- **git-spice now, GitHub native stacks later.** Native stacks handle the
  two things that matter most here correctly — the bottom pull request
  merges alone, and drafts are the default — and they have a server-side
  rebase button git-spice cannot match. They are not adopted now because
  their worktree support silently no-ops (#35) and their merge queue
  handling can close a pull request unrecoverably (#444), which are this
  repository's two most sensitive areas. Reassess when #35, #87 and #444
  close.

- **Phase 0 before any configuration change.** Both blocking settings are
  load-bearing, and the failure mode for getting CI triggers wrong is a
  pull request that hangs with nothing in the Actions tab to explain it.
  One deliberate two-branch experiment costs an afternoon; discovering
  the same facts inside a six-deep stack costs more.

---

## Revisited: GitHub stacks with a local CLI wrapper

**Date:** 2026-09-14, later the same day
**Status:** Adopted. Tooling built, not yet used on real work.

git-spice is dropped. Graphite was tried and dropped too — it does not fit
the pull request comments, the breaking-change gates or the workflow
layout here. What remains is GitHub's own native stacks, which is where
the plan above already pointed, and the decision is to adopt them now
rather than wait for a VS Code extension.

The reason the wait no longer makes sense: stacks are for one specific
job here — an LLM builds a feature unattended, and the stack is what
makes the result reviewable line by line the next morning. That is
terminal work already. An extension would be pleasant, but nothing about
the job is blocked without one.

### What the earlier assessment got wrong

The sections above rejected native stacks on two grounds. Both were
checked against `gh stack` v0.1.1 on 2026-09-14 and **both have been
fixed upstream** since they were written:

- **Drafts.** The plan warned that a pull request opened ready for review
  never gets the heavy CI tier or the four gate contexts, because those
  fire on `ready_for_review` and `synchronize` and never on `opened`.
  `gh stack submit --auto` now opens every new pull request as a draft,
  with `--open` as the opt-out. The gate is safe by default.

- **The merge queue.** `gh stack merge` is now queue-aware: "If the base
  branch uses a merge queue, the stack is added to the queue". Issue #444
  is still open, but it needs a stack large enough to overflow a merge
  group, and merging one pull request at a time cannot reach it.

### What is still broken, and it is the worktree handling

Four open issues, all in the same place, and the important one was
**reproduced here on 2026-09-14** rather than taken from the tracker:

- **`gh stack rebase` reports success after doing nothing (#35).** Given a
  stack branch checked out in another worktree, it prints the git error,
  skips that branch, and **still exits 0**. The branch is left un-rebased.
  Anything chaining `rebase && submit` would push a stack it believed was
  rebased and was not.

  This is the same silent-success failure class as the stale-worktree test
  runs recorded in `CLAUDE.md` — the ones that produced a "full suite
  green" claim that had to be retracted. It is the single reason the
  recipes below guard rather than simply wrap.

- **Stack state is worktree-local (#459).** It lives at
  `$(git rev-parse --git-dir)/gh-stack`, which in a worktree resolves to
  `.git/worktrees/<name>/gh-stack`. Other worktrees cannot see it, and
  `git worktree remove` deletes it. Confirmed directly: a stack created in
  one checkout was invisible from a sibling worktree.

- **`gh stack sync` fails on worktrees (#87)**, and **`init` can write
  `branch.<name>.remote = .` (#480)**, which makes a later submit report a
  push that never happened. #480 did not reproduce here.

### Decisions

- **Adopt GitHub native stacks, driven by `just` recipes.** The web
  interface is good and the CLI is adequate; the recipes exist to make the
  CLI safe rather than to hide it. No VS Code extension is waited on.

- **One stack lives in one worktree.** Forced by #459 rather than chosen:
  the state is worktree-local and dies with the worktree. It costs
  nothing, because a stack is one feature and a worktree already holds one
  plan's work. The alternative — symlinking the state file into the common
  git directory, which is the fix upstream is weighing — was rejected: it
  is an unsupported layout for a tool on v0.1.1 shipping monthly, and a
  format change would corrupt a stack at the worst moment.

- **Guard hard, do not warn.** Every stack operation refuses outright when
  a stack branch is checked out in another worktree, naming the branch and
  the worktree. Warning and continuing was considered and rejected: the
  failure it guards against is one that already reports success, so a
  warning would be one more line of output above a green tick.

- **Verify the rebase afterwards as well.** `gh stack rebase` exiting 0
  is not evidence it worked, so `just str` re-reads the stack and fails if
  any branch still needs a rebase. `gh stack view --json` reports
  `needsRebase` correctly for exactly the branch a silent skip leaves
  behind — confirmed in the same experiment that reproduced #35.

- **Two log recipes, not one.** `just stl` is local-only and instant;
  `just stll` joins pull request and CI state in one `gh pr list` call.
  Kept separate for now rather than picking one, to see which gets used.

- **GitHub is the recovery path.** If a worktree is lost with its stack
  state, `gh stack checkout <n>` re-fetches the stack. This works only
  once two or more pull requests exist, so it is a backstop, not a plan.

- **Merging stays a human decision.** `gh stack merge` is not wrapped in
  any recipe. Unchanged from the rules above, and from `/crp`.

### What was built

- **`scripts/stack-status.py`** — draws the stack, joining two things
  `gh stack view` cannot know: which branches another worktree holds
  (from `git worktree list --porcelain`), and, with `--prs`, the pull
  request number, draft state and a CI roll-up (one `gh pr list` call for
  the whole stack). `--check` exits 2 when a branch is held elsewhere,
  which is what the guard reads.

  `--files` is the review view: what each branch changes **against its
  own parent**, which is the unit to read. Diffed against the trunk a
  branch three layers up replays everything below it — the wall of diff
  stacking exists to avoid. `--patch` gives the full diff instead of the
  per-file summary.

- **Justfile recipes**, all prefixed `st` so they sit apart from the
  container recipes (`sd`, `sb`, `sc`) that already own the short `s`
  names — `stn` (start a stack), `sta` (add a branch on top), `stl`
  (log), `stll` (log with pull requests and CI), `stm` (move about the
  stack), `stc` (check a stack out, the recovery path), `str` (rebase,
  guarded and verified), `sts` (submit as drafts), `sty` (sync), plus the
  private `_stack-guard` and `_stack-branch-name`.

  The whole flow is `just` commands: `gh stack` is never typed directly.
  `stn` and `sta` add the `feature/` prefix when it is missing, because
  branch protection rejects anything else at creation time, and both
  stage and commit in the same step rather than leaving a bare `git add`
  to be remembered. Both stage everything, untracked files included:
  splitting a dirty tree across a stack is done by committing what is
  ready and leaving the rest for the branch above, not by naming files on
  the command line.

### Phases

#### Phase A: tooling

- [x] Install `gh stack` and establish the real command surface rather
      than the one the plan above assumed. Done 2026-09-14, v0.1.1.
- [x] Reproduce #35 in a scratch repository, and confirm
      `gh stack view --json` still reports `needsRebase` correctly for the
      branch it skipped. Done 2026-09-14 — that is what makes the
      after-the-fact check in `just str` possible.
- [x] Write `scripts/stack-status.py` with `--prs`, `--check` and
      `--no-colour`. Done 2026-09-14.
- [x] Add the `sl`, `sll`, `sr`, `ss`, `sy` recipes and `_stack-guard`.
      Done 2026-09-14.
- [ ] Use the recipes on one real stack before trusting them further.
      Everything so far has been exercised in scratch repositories.

#### Phase B: fold into the existing workflow

- [ ] Write `.claude/rules/stacks.md`: one stack per worktree, the guard
      and why it refuses, and that merging is never automated.
- [ ] Decide whether `just rebase` (`rb`) should refuse inside a stack.
      It assumes one branch on `main` and would flatten a stack today.
- [ ] Teach `/crp` to use `just sts` when the branch is in a stack, and to
      push as it does now when it is not. Mirror into `/crpf`.
- [ ] Clear the abandoned git-spice state: the `refs/spice/data` ref and
      the four trial branches (`feature/git-spice-introduce`,
      `feature/introduce-git-spice`, `feature/stacked-branches-plan`,
      `feature/stacked-branches-findings`). Two tools' notes in one
      repository is a trap for whoever reads it next.

#### Phase C: the overnight run

- [ ] Use a stack for one unattended feature build, then review it the
      next morning and record whether the unit boundaries survived.
- [ ] Record whether `sl` or `sll` is the one actually reached for, and
      drop the other if the answer is clear.
