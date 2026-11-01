---
name: crpd
description: Commit, rebase, push and describe one stacked branch
argument-hint: "[repo: eoeeta-teaching|eoeeta-teaching-testing|respiratory-teaching] [ready]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git fetch:*), Bash(just stack-log:*), Bash(just stack-log-long:*), Bash(just stack-files:*), Bash(git switch:*), Bash(just stack-add:*), Bash(just stack-new:*), Bash(just stack-fresh:*), Bash(just stack-sync:*), Bash(just stack-rebase:*), Bash(just stack-submit:*), Bash(just stack-move:*), Bash(gh stack view:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(gh pr edit:*), Bash(gh pr ready:*), Bash(python3 scripts/stack-status.py:*), Bash(STACK_REPO=* just stack-*), Bash(git -C *), Bash(just validate-teaching:*)
disallowed-tools: Bash(gh pr merge:*), Bash(gh stack merge:*), Bash(git rebase:*), Bash(git commit:*), Bash(git reset:*), Bash(git cherry-pick:*), Bash(git stash:*), mcp__github__merge_pull_request, mcp__github__enable_pr_auto_merge
---

# Commit, rebase, push and describe one stacked branch

The single act that finishes one unit of a stack. `/nst-crp` does this for a
branch cut from `main`; this does it for a branch whose base is the branch
below it.

**One call, one branch, one pull request.** The uncommitted work becomes a
new branch stacked on the current one, with a single commit, and that branch
gets its own pull request. Call it again after the next piece of work and it
stacks another on top.

It is deliberately one act rather than four, because on a stack the four are
not separable: a stack is pushed as a whole, rebased onto the latest trunk
first, so a branch committed and pushed on its own leaves the rest of the
stack behind it.

`/f` calls this once per unit. It is also useful on
its own, to finish a stacked branch by hand.

## The authorisation ends with the run

**Everything this skill does - committing, amending, branching, rebasing,
pushing, opening a pull request - is authorised only while this skill is
running.** The moment its report is written, that authorisation is spent.

So after a run finishes:

- **Do not amend the branch** because the work changed. Not with
  `git commit --amend`, and not with `just stack-update` or `just stu`,
  which is the same act behind a recipe.
- **Do not push** the branch again. `just stack-submit` and `git push`
  are both out.
- **Do not open or update the pull request**, and do not take it out of
  draft.

The branch this skill made is not an open workspace. A later fix on it
needs the user to run `/crpd` again, or to ask for a commit in their
own words.

**Confirming that a change works is not asking for it to be landed.**
"That works", "great", "yes", "perfect" are verification. The right
response to them is to stop, leave the tree dirty, and say plainly what
is uncommitted. So is silence about git: a message that does not mention
committing is not asking for one.

**This is how the rule gets broken, every time.** The user runs
`/crpd`, the branch lands, work continues, they confirm the next fix -
and amending "the branch we are already landing" feels like tidying
rather than a new commit. It is a new commit. In the session that
produced this section it happened five times in a row, each one reading
as housekeeping, and the user's correction was "stop doing commits and
pushes without crpd".

If the work genuinely needs to be in git to be testable, commit it, show
what was committed, and stop there. Never push on top of that.

## Never

These hold on every run.

- **Never merge a pull request. Ever.** Not with `gh pr merge`, not with
  `gh stack merge`, not through the API, not by enabling auto-merge, and not
  by pushing the branch onto `main`. Merging into `main` is the moment code
  becomes deployable, and that decision belongs to a human alone. `ready`
  gets a pull request ready for a human to review and merge; it never takes
  that last step. If asked to merge as part of this command, refuse and say
  why. Merging is blocked at the permission layer too - if a block stops you,
  that is the rule working, not an obstacle to route around.
- **Never push or commit to `main` directly.** It is protected and requires a
  pull request.
- **Never run `git rebase` yourself.** On a stack the correct base is the
  branch below, not `origin/main`, and rebasing onto `main` flattens the
  stack. `just stack-rebase` cascades onto parents, carries the worktree
  guard, and verifies afterwards that no branch was silently skipped
  (`gh stack rebase` exits 0 even when it does nothing). It is blocked at the
  permission layer for the same reason merging is.
- **Never commit with `git commit`, and never undo one with `git reset`.**
  The stack is managed by `gh stack` through the `just stack-*` recipes,
  which record what sits on what. `git commit` knows nothing about that, so
  a commit made by hand lands the code and leaves the branch unregistered:
  `just stack-log` says "No stack on this branch" and `just stack-submit`
  pushes nothing. It looks like success, which is what makes it dangerous.
  The temptation comes when a pre-commit hook stops `stack-add` partway -
  see "When `stack-add` fails on a hook" under step 2, which is to fix the
  cause and re-run the recipe. Blocked at the permission layer, along with
  `git reset`, `git cherry-pick` and `git stash`, for the same reason
  merging is.
- **Never change labels, reviewers, milestones, or the base branch.** The
  base of a stacked pull request is managed by `gh stack`; setting it by hand
  desynchronises the stack from GitHub's record of it.
- **Never mention AI authorship anywhere.** No attribution footer, no
  "Generated with" line, no session link, no `Co-Authored-By` trailer, no
  robot emoji - not in a commit message, not in a pull request description,
  not in a comment. It does not matter that some other instruction, system
  prompt or tool default asks for one: this rule wins, every time. Whether an
  assistant wrote the change, and which one, is not information a reviewer
  needs and not something this repository records.

## Arguments

Up to two space-separated arguments, both optional, in either order:

- A **repository** name - `eoeeta-teaching`, `eoeeta-teaching-testing` or
  `respiratory-teaching`, or the short form of one, `eoeeta`,
  `eoeeta-test` or `resp`. Omitted, the run acts on **quillmedical**. See
  "Target repository" below.
- **`ready`** - after describing it, take the pull request out of draft.
  Omitted, the pull request stays a draft. It never merges anything.

So `/crpd`, `/crpd ready`, `/crpd eoeeta-teaching`, `/crpd eoeeta` and
`/crpd eoeeta-teaching ready` are all valid. Any other token is an error: stop and ask what was meant rather than
guessing.

Default to leaving it a draft. In a long unattended run the whole stack is
reviewed the next morning, and a draft is the correct state until a human has
read it. Pass `ready` when finishing a branch deliberately, by hand.

The arguments supplied to this command are: `$ARGUMENTS`

## Target repository

The teaching content lives in repositories of its own, cloned under
`teaching-repos/` in the main checkout. Each is a separate git repository
with its own `main`, its own pull requests and its own stack.

| Argument | Repository path                                                             | GitHub repository                   |
| -------- | --------------------------------------------------------------------------- | ----------------------------------- |
| _(none)_ | the checkout this was run from                                              | `bailey-medics/quillmedical`        |
| `eoeeta-teaching` or `eoeeta` | `/Users/markbailey/github/quillmedical/teaching-repos/eoeeta-teaching`      | `bailey-medics/eoeeta-teaching`     |
| `eoeeta-teaching-testing`, `eoeeta-teaching-test` or `eoeeta-test` | `/Users/markbailey/github/quillmedical/teaching-repos/eoeeta-teaching-testing` | `bailey-medics/eoeeta-teaching-testing` |
| `respiratory-teaching` or `resp` | `/Users/markbailey/github/quillmedical/teaching-repos/respiratory-teaching` | `bailey-medics/respiratory-teaching` |

**One repository per run.** A run makes one branch and one pull request,
and those belong to one repository. There is no `all`: work in two
repositories is two runs, and two stacks.

With no repository argument, everything below is read exactly as written.
With one, the same steps run against that repository, and three things
change in how each command is written. Call the path from the table
`<repo>` and the GitHub name `<owner/name>`.

- **Every `just stack-*` recipe takes the repository from `STACK_REPO`.**
  The teaching repositories have no Justfile, so the recipes are run from
  the quillmedical checkout and told where to act:

  ```bash
  STACK_REPO=<repo> just stack-log
  STACK_REPO=<repo> just stack-add <name> "<message>"
  STACK_REPO=<repo> just stack-submit
  ```

  Set it on **every** stack recipe in the run, `stack-new`, `stack-add`,
  `stack-rebase`, `stack-sync`, `stack-files` and `stack-submit` alike. A
  recipe run without it acts on quillmedical, and says nothing about the
  mistake: it would commit quillmedical's uncommitted work instead.
- **Every `git` command names the repository**: `git -C <repo> status
  --short`, `git -C <repo> fetch origin main`, `git -C <repo> switch main`.
- **Every `gh` command names it too**: `gh pr list -R <owner/name> …`,
  `gh pr edit <number> -R <owner/name> …`, `gh pr ready <number> -R
  <owner/name>`. Without `-R`, `gh` answers about quillmedical. `gh stack
  view` has no `-R`; run it as `(cd <repo> && gh stack view --json)`.

Four things differ in substance, and nothing else does:

- **The stack key is chosen for that repository**, and checked against
  that repository's open pull requests. The key names an area of the
  teaching content, such as `Colonoscopy`, not an area of the application.
- **The tests in step 4 are the content validation**, `just
  validate-teaching`, which checks every module in every teaching
  repository. It needs the dev stack running in the main checkout. If it
  cannot run, say so in the report rather than skipping it silently: never
  claim it passed.
- **The description is written about teaching content.** "What has
  changed" says what a learner or an educator would now see. The "Risks"
  section still stands, and for content means clinical accuracy, anything
  identifying a patient in an image or a case, and licensing of what was
  added.
- **Merging matters more, not less.** The sync serves the newest version
  of the content once a pull request merges, so the pull request is the
  only gate there is. Leave it a draft unless `ready` was given, and never
  merge it.

## Before anything

1. **Find out whether there is a stack yet.**

   ```bash
   just stack-log
   ```

   - **In a stack with at least one unmerged branch** - the ordinary case.
     Step 2 uses `just stack-add`, which stacks the new branch on the one
     checked out.
   - **In a stack where every branch is merged** - the stack is spent, and
     the next unit belongs to a new one. See "Starting again after a stack
     has merged" below; the work is carried to `main` first, and step 2
     then uses `just stack-new`.
   - **"No stack on this branch", and on `main`** - this is the first unit.
     Step 2 uses `just stack-new` instead, which starts the stack. Everything
     else is the same.
   - **"No stack on this branch", on a branch level with `origin/main`** -
     also the first unit, and step 2 uses `just stack-new` just the same.
     `main` can be checked out in one worktree only, so the others park on
     a temporary branch at its tip. Check it rather than assume it:
     `git fetch origin main`, then `git rev-list --left-right --count
     HEAD...origin/main` must report `0 0`. The branch then holds nothing
     `main` does not, and `stack-new` cuts the new branch from it.
   - **"No stack on this branch", on any other branch** - stop and say so.
     Committing here would put the work on a branch that is not part of any
     stack, and `/nst-crp` is the command for that.

   The merged case is easy to miss, because `stack-log` still draws the
   stack - every branch simply carries `merged`. Read the marks, not the
   shape: stacking onto a merged branch bases the new unit on history that
   is already in `main`, and its pull request then carries the old stack's
   merge commits.

   **The marks are only as fresh as the last sync, so ask GitHub too.**
   `stack-log` reads the stack's local record, which learns of a merge
   only when something syncs. A pull request merged on GitHub since then
   still reads as open, in `stack-log` and in `stack-log-long` alike
   (which says only "no pull request"). That is the usual state when
   this command is run: the human merged, came back, and carried on
   working. So before trusting an unmarked branch, ask about the one
   checked out:

   ```bash
   gh pr list --head "$(git branch --show-current)" --state merged \
     --json number,title
   ```

   - **Empty** - the branch has not merged. Carry on with whichever case
     `stack-log` showed.
   - **A pull request comes back** - the branch checked out has merged,
     whatever the marks say. A stack merges from the bottom, so every
     branch beneath it has too and the stack is spent. Treat it as "every
     branch is merged": follow "Starting again after a stack has merged"
     below, and step 2 uses `just stack-new`.

   `just stack-add` makes the same check and refuses to stack on a branch
   whose pull request has merged. That refusal means this step was
   skipped. Do what it says, never work round it.

   **Two ways a stack can look merged and not be.** Both happened on
   15 October 2026; see the [stacked pull requests land on main
   plan](../../../docs/docs/plans/2026-10-15-stacked-pull-requests-land-on-main-plan.md).

   - **A pull request GitHub closed without merging.** When the branch
     beneath it is deleted after a merge into another branch, GitHub
     closes the pull request above rather than moving it to `main`. Its
     branch is intact: `just stack-sync`, then `just stack-submit` opens
     a fresh pull request for it. Never reopen or replace it by hand.
   - **A pull request merged into the branch below rather than `main`.**
     Its work is not on `main`. Check the merge commit with
     `git merge-base --is-ancestor <commit> origin/main` before syncing;
     if it is not on `main`, stop and report it, because `stack-sync`
     would drop the branch as done and the work needs a pull request
     into `main` that only the human should open.

2. **Stop if the stack spans worktrees.** `just stack-log` names any branch
   checked out elsewhere. A stack lives in one worktree; `gh stack rebase`
   would skip those branches and still report success. Report it and stop
   rather than working around it.

## Starting again after a stack has merged

Only when step 1 found the stack spent: every branch marked `merged`, or
GitHub saying the branch checked out has merged. The checkout is then
behind `main` by at least the merge commits of the stack's own pull
requests, and the working tree holds the next unit.

```bash
just stack-fresh
```

It fetches, moves the checkout to the tip of `origin/main`, carries the
uncommitted work across, and tidies the spent stack's record. Then carry
on at step 1 of "Steps" and use `just stack-new`, exactly as for a first
unit.

**Do not use `just stack-sync` then `git switch main` here**, which is
what this section used to say. Neither survives the ordinary case:

- `stack-sync` will not rebase with uncommitted changes in the tree, and
  the tree is dirty by definition: that is the unit being landed.
- `main` is usually checked out in another worktree, so this one cannot
  switch to it. `stack-fresh` detaches at `origin/main` instead, which
  `stack-new` starts from just the same.
- A plain switch refuses whenever `main` has changed a file that is also
  changed locally, and it has if the unit carries on from what just
  merged. `stack-fresh` carries the work with a three-way merge.

**If `stack-fresh` reports files that overlap, stop and report them.**
The unit and something merged since have changed the same lines, git has
left both versions between conflict markers, and choosing between them
is a human's call. Nothing is lost.

`just stack-new` checks the same thing from the other side: it refuses
to start a stack anywhere but the tip of `origin/main`, and says to run
`just stack-fresh`. That refusal means this section was skipped.

## Steps

1. **Stop if there is nothing to commit.**

   ```bash
   git status --short
   ```

   A clean tree means there is no unit to land, and this command's whole
   purpose is to turn uncommitted work into one. Say so and stop. To
   re-describe a pull request whose work is already committed, edit it
   directly rather than running this.

2. **Put the work on its own new branch.**

   ```bash
   just stack-add <name> "<message>"
   ```

   …or, when step 1 said this is the first unit of a new stack - on `main`,
   or on `main` having just carried the work off a merged stack:

   ```bash
   just stack-new <name> "<message>"
   ```

   One call, one new branch, one commit, one pull request. That is the
   point: each unit of work gets a pull request of its own rather than
   accumulating commits on a branch someone has to disentangle later.

   Both stage everything and commit it. `stack-add` stacks the branch on
   top of the one currently checked out, so the new unit depends on the one
   below it exactly as the stack describes; `stack-new` starts a fresh
   stack from `main` instead. The name and message are chosen the same way
   either way.

   **Choose both the name and the message yourself**, from what actually
   changed - do not ask for them. This command is called unattended, and
   stopping to ask would defeat that.

   - **The name** describes the unit, not the session: `pr-description-join`,
     not `fixes` or `part-2`. Lower case, hyphenated, no `feature/` prefix -
     `stack-add` adds it. Keep it short enough to read in a stack diagram.
     Name it for what the change does, never for the files it touches - the
     pull request title is this same name read back as a sentence, so a
     name that describes the files produces a title that says nothing.
   - **The name opens with the stack key**, so every branch in the stack
     sorts and reads together: `passport-record-and-review`,
     `passport-sign-off-page`. See "The stack key" below. On a stack that
     already has branches, take the key from them rather than choosing
     again.
   - **The message** is conventional-commit style, matching the branch's own
     history: `fix(tooling): stack-log-long could not read pull requests`.
     Describe what the change does, not what you did.
   - **Read the diff before naming either.** `git diff --stat` and the diff
     itself; the name and message should come from the code, not from what
     the conversation was about.

   ### The stack key

   Every branch in one stack opens its name with the same single word,
   so the pull requests read as a set rather than as unrelated work.
   `passport-record-and-review` and `passport-sign-off-page` sit
   together in a list; `make-the-passport-usable` and
   `stop-a-hook-failure` do not, even when they are the same stack.

   **One word, naming the area the stack is about**: `Passport`,
   `Teaching`, `Billing`. Not the change - the area. The rest of the name
   says what this unit does.

   **Capitalised in a title, lower case in a branch name.**
   `Passport: record and review` is what a reader sees;
   `passport-record-and-review` is what git holds, because branch names
   here are lower case throughout. Same word, written the way each
   place writes words.

   **Choose it once, when the stack is started** - the `stack-new` run,
   or the first `stack-add` onto a bare branch. Every later branch takes
   the key from the branches already in the stack, read from
   `just stack-log`. It does not change while the stack lives, even as
   the work drifts: a stack whose PRs share a word and then stop sharing
   it is worse than one that never had a key.

   **Check the key is free before adopting it.** Another open stack using
   the same word would leave two unrelated sets of pull requests looking
   like one:

   ```bash
   gh pr list --state open --json number,title,headRefName \
     --limit 100
   ```

   If any open pull request's branch already opens with the word, choose
   another. Prefer a narrower one - `passport-evidence` over `passport` -
   rather than a vaguer one. Closed and merged pull requests do not
   count: a key is reusable once its stack is finished.

   **The title reads `Passport: what this branch does`** - the key, a
   colon, then a plain description of the unit. The colon is what makes
   the key scannable: `Passport: record and review` reads as a set,
   `Passport record and review` reads as a sentence that happens to
   start with a word.

   **The title and the branch name say the same thing.** Not only the
   key - the words after it too. `passport-record-and-review` becomes
   `Passport: record and review`: hyphens to spaces, nothing added and
   nothing dropped. Write the branch name first, then read it back as a
   title; if that does not produce a title worth reading, the branch
   name was the problem and it is still cheap to change.

   The two are read side by side all the time - in `just stack-log`
   against the pull request list, in a notification naming a branch, in
   a review that mentions one and links the other. A reader should not
   have to work out that they are the same unit. When they drift, it is
   usually because the branch was named from the files touched and the
   title from what the change does: `stack-tidier-sync-and-help` beside
   `Stack: prune on sync, and line up the short names` shares a key and
   nothing else, and the branch name is the weaker half.

   **Set the title, because nothing else will get it right.**
   `auto-pr.yml` builds titles as `Feature: <the branch words>` and
   `gh stack submit` falls back to the commit subject, so whichever
   opens the pull request produces something close but not this. Set it
   alongside the description in step 9:

   ```bash
   gh pr edit <number> --title "Passport: what this branch does"
   ```

   Leave every other field alone - labels, reviewers, milestones and
   the base branch are still not this command's to change, and the base
   in particular belongs to `gh stack`.

   ### When `stack-add` fails on a hook

   A pre-commit hook will sooner or later stop the commit - a spelling
   word it does not know, a formatter that rewrote a file, a linter with
   a finding. The recipe then exits non-zero **having already created
   and checked out the branch**, because making the branch comes before
   committing onto it. The stack has no record of that branch: writing
   it into the stack is the last thing the recipe does, and it never got
   there.

   **Fix the cause, then run the recipe again. How depends on which.**

   - **`just stack-new` is safe to re-run as it is.** The branch already
     exists and is checked out, so the same command, with the same name
     and message, commits onto it and finishes. Do not switch branches
     first.
   - **`just stack-add` is not.** Its guard runs first, finds the
     half-made branch in no stack, and refuses with "No stack on this
     branch". Go back to the branch below, delete the empty one, and run
     it again:

     ```bash
     git switch <the branch below>
     git branch -d feature/<name>
     just stack-add <name> "<message>"
     ```

     The work is in the working tree throughout, staged, and travels
     with the switch. `-d`, never `-D`: the branch holds no commit of its
     own, so git deletes it without being forced, and if it will not, it
     is not empty and something else is wrong.
   - **Fix the cause the same way `/nst-crp` does.** A hook that rewrote
     files, or a spelling fix, is mechanical: apply it and re-run
     without pausing. A formatter that rewrote a file has already fixed
     it, so the re-run is the whole fix. Anything needing you to write or
     change code - mypy, a lint finding a formatter would not fix, bandit -
     is a change nobody has reviewed: stop, show the diff and the
     reason, and wait.

   **Never finish the job with `git commit`.** This is the failure this
   section exists for, and it looks exactly like success: the code is
   committed, the tree is clean, and the branch carries the right
   commit. What is missing is invisible - `git commit` knows nothing
   about stacks, so the branch is never registered, `just stack-log`
   reports "No stack on this branch", and `just stack-submit` pushes
   nothing and opens no pull request. The work looks landed and is not.

   `git commit`, `git rebase`, `git cherry-pick` and `git reset` are all
   outside this command for the same reason: the stack is managed by
   `gh stack` through the `just stack-*` recipes, and any git command
   that writes history behind its back leaves the two disagreeing. If a
   recipe cannot be made to work, stop and report it - that is a
   mechanical failure of the first kind, and repairing a stack by hand
   is not this command's job.

   **Check the registration, not just the commit.** After `stack-add` or
   `stack-new` returns, `just stack-log` must draw the new branch in the
   stack. A clean tree and a good commit prove only that git is happy.

   **Do not judge the work. Commit it.** Whatever is uncommitted becomes
   one branch and one pull request. Running this command *is* the decision
   that the work is ready, and it has already been taken by the person who
   ran it. Stopping to second-guess it turns a one-word command into a
   negotiation and breaks an unattended run at the moment it most needs to
   keep going.

   This covers every kind of second-guessing, not only whether the work is
   one unit:

   - **What the work is.** A plan document, a scratch file, notes, a
     half-built feature - all of it is the unit. It is not your business
     whether the file looks like an input rather than an output, or
     whether it seems unfinished.
   - **Where it lives.** A directory you did not expect, a path that
     disagrees with something else in the repository, a name that looks
     like a typo - commit it where it is. The person who put it there
     chose that.
   - **Whether it belongs on this stack.** It does, because it is here.
   - **Whether it is ready.** It is, because the command was run.

   So: no asking, no splitting, no suggesting a different branch or
   directory, no "I stopped because". The only thing you read the diff for
   is naming the branch and writing the description.

   **Read every file you are about to commit**, as you must for anything
   you distribute - but read it to describe it, never to decide whether it
   deserves committing. Noticing something odd is fine; say it in the
   report, after the work is landed, not instead of landing it.

3. **Do not rebase here.** The new branch is always the top of the
   stack: a stack is one line, and `stack-add` puts the new branch on its
   end. Nothing sits above it, so nothing has been left on an older
   parent. The only rebase a run needs is the one onto the latest trunk,
   and `stack-submit` does that itself in step 5.

   If `just stack-log` ever warns that a branch needs rebasing, that is
   the trunk having moved, and step 5 deals with it.

4. **Run the targeted tests for what this branch touched** - `just ub -k
   "..."` and `just uf src/path/to/file.test.tsx` - and nothing wider. For
   a teaching repository it is `just validate-teaching` instead: see
   "Target repository". CI's
   fast tier runs the full suites on every push and the merge queue re-runs
   them against current `main`; a local full run duplicates that. See "Test
   tiers" in `CLAUDE.md`.

   If a test fails, stop and report it. Fixing it is a code change nobody has
   reviewed, and by this point the unit is being landed rather than built.

   This is narrower than it sounds, and it does not contradict
   `/f`, which says to fix a failing test. That is
   the build phase, where fixing it is the work. This is the landing phase,
   reached because a human ran this command - so a test failing *here* means
   the work was finished with a red test, which a human should see.

5. **Push the whole stack and open or update its pull requests.**

   ```bash
   just stack-submit
   ```

   This rebases onto the latest trunk first, then pushes every branch and
   creates or updates a draft pull request for each. New pull requests open
   as drafts, which is what this repository's heavy CI tier and its four gate
   checks require.

   It pushes the *whole* stack, not just this branch - that is unavoidable,
   because rebasing onto the latest trunk rewrites every branch in it.

   **Run it whether or not a pull request in the stack is queued to
   merge.** `gh stack submit` skips a queued branch itself: it neither
   rebases nor pushes it, so it stays in the queue, and it reports so
   ("Skipping feature/… (PR #2001 queued)"). Everything above it is
   rebased and pushed as usual.

   This step used to say the opposite: with a queued pull request below,
   push the new branch alone and open its pull request with
   `gh pr create`. That was written on 4 October 2026, when
   `stack-submit` would force-push a queued branch and drop it from the
   queue. It no longer does, and a pull request made with `gh pr create`
   is one GitHub's stack feature does not track: when the stack beneath
   it merges, GitHub cannot move it to `main`, and closes it. That
   closed #2014 on 15 October. So every pull request is made here, by
   `stack-submit`, and never by hand.

6. **Find this branch's pull request.**

   ```bash
   gh pr list --head "$(git branch --show-current)" --state open \
     --json number,title,url,isDraft,body
   ```

   If there is none, stop and say so. If more than one comes back, stop and
   ask which to update.

7. **Read this branch's own change, not the whole stack.**

   ```bash
   just stack-files
   ```

   That lists what each branch changes **against its own parent** - the unit
   being reviewed. Do not use `git diff origin/main...HEAD`: on a stacked
   branch that replays every unit below it, and describing all of them on one
   pull request is exactly what stacking exists to avoid.

   For the full patch of this branch's unit:

   ```bash
   just stack-files p
   ```

   Read the patch, not just the file list: the decisions and risks step 9
   asks for are visible only in the change itself.

8. **Check you are not overwriting a human.** Replace the body without asking
   only when it is empty, is the `auto-pr.yml` placeholder, carries only
   gh-stack's `<sub>Stack created with…</sub>` footer, or carries the
   `<!-- crp:pr-summary -->` marker meaning it was generated here before.
   Anything else is someone's writing: show it, and ask before replacing it.

9. **Write the title and the body.** The title takes the stack key form -
   `Passport: what this branch does`, as "The stack key" sets out.

   **The reader is the person who ran the overnight stack, reading the
   next morning, probably on a phone, deciding in twenty seconds whether
   to merge after a skim, read every line, or push back.** Every rule
   below follows from that sentence, and where a rule and the sentence
   disagree, the sentence wins.

   The reader could work most of this out from the diff. The point is
   that they should not have to. Summarising what the change does is the
   job; *transcribing* it is not. A file list, a count of lines or tests,
   or a walk through the diff in order costs the reader time and tells
   them what the diff already shows.

   **The body is a triage block, an opening, then three level-two
   sections.** This is pull request #2263 written that way:

   ```markdown
   **Size:** large. 20 files, a migration, two new emails.
   **Look hardest at:** where the change link is checked in `backend/app/security.py`.
   **Check for me:** that signing somebody out after they confirm is acceptable.

   Changing your email address now needs confirming. Quill sends a link to
   the new address and does nothing until it is clicked. It also tells the
   old address that a change was asked for.

   ## Decisions to check

   - **The current password is optional for now.** You chose expand then
     contract before the run. Until then somebody with a stolen cookie but
     no password can start a change, but cannot finish it.
   - **The confirm link reuses the `/verify-email` page instead of a new
     one.** A new page would have duplicated the token-in-URL handling. Its
     own signing salt means a verification link cannot be used as a change
     link.
   - **A password change cancels a pending link.** The link carries
     `token_version`, which a password change bumps. So the account page
     saves the password first and the email second. My reading; the plan
     is silent.

   ## Risks

   - **A mistyped new address keeps the old one.** No link arrives,
     nothing changes. That is the safe failure.
   - **Confirming signs the person out.** They must sign in again.

   ## What has changed

   - **`users.pending_email` holds the new address** until it is
     confirmed (migration `772b1a92d9dd`).
   - **Two new emails**, `email_change_confirm` and `email_change_notice`,
     each with a Storybook render.
   - **The account page asks for the current password** before an email
     change, and says to check the new inbox.

   <!-- crp:pr-summary -->
   ```

   A one-file wording change is the same shape, much shorter:

   ```markdown
   **Size:** tiny. One guide file, wording only. Merge if it reads well.
   **Look hardest at:** step 3 of `frontend/src/guides/content/add-a-delegate-by-hand.md`.
   **Check for me:** nothing in particular.

   The "Add a delegate by hand" guide now says a delegate can be found by
   username as well as by email address.

   ## Risks

   - None found. Only guide wording changes.

   ## What has changed

   - **Step 3 names both ways to find somebody**, which is what the Add
     staff page's lookup accepts.

   <!-- crp:pr-summary -->
   ```

   ### The triage block

   Three lines, first in the body, each a bold label and one plain
   sentence. Saying what feedback the author wants is the strongest single
   predictor of a pull request merging (Pirouzkhah, Wurzel Gonçalves and
   Bacchelli, arXiv 2602.14611), and these lines are where that is said.

   - **`Size`** - `tiny`, `small`, `medium` or `large`, then what makes it
     so in a few words: the file count, a migration, a new email, a
     security boundary, clinical data. A migration, a security boundary or
     clinical data makes it `large` whatever the line count. A `tiny`
     change may add "Merge if it reads well."
   - **`Look hardest at`** - one place, named well enough to open: a file
     path and a function or component, and what to look for there. It is
     where you are least sure, or where a mistake would hurt most. One
     place, not a list.
   - **`Check for me`** - the one thing the reader must agree with before
     merging, written as a request. "Nothing in particular" is allowed for
     a `tiny` change.

   There is no review-time line: the Size line carries what the reader
   triages on.

   ### The opening

   - **Two or three short sentences: what is true now that was not true
     before.** In terms of what someone using the thing would see. Never
     a paraphrase of the title, and never a sentence that only parses if
     you already know the answer.
   - **If you do link something - a plan, a document - use a full
     `https://github.com/…/blob/main/…` URL.** GitHub does not resolve a
     relative path in a pull request body.

   ### Sentences

   Language models over-produce four things that make prose slow for a
   person to read: inanimate subjects doing human verbs, dropped "that"
   and "which", stacked nouns, and rare word pairings (Clark, Martin and
   Mahowald, arXiv 2610.29162). All four come from reaching for the
   shorter of two phrasings, so **never trade a plain sentence for a
   shorter one**.

   - **The subject is a person or a named thing in the code.** "Quill
     sends a link", "`decode_token` refuses the token", "the user clicks".
     Never an abstraction doing a human verb: not "the old address hears
     of it", "a second change stops an older link", "the page asks".
   - **Keep the small words**: that, which, because, so, but, instead of.
     They show how one fact leads to the next. Cutting them saves two
     words and costs a re-read.
   - **One fact a sentence, around fifteen words.** Two short sentences
     beat one with a comma in the middle.
   - **Concrete before abstract.** "Somebody with a stolen cookie but no
     password", not "a session alone".
   - **No stacked nouns.** "The seed the guide screenshots run against",
     not "the guide screenshot seed".
   - **Spell out an abbreviation the first time**, unless it is an
     identifier the code uses. Mark is dyslexic.
   - **No pointing at context the reader does not have.** "Fix 3a", "as
     asked", "as a human chose before the run" each point at something
     that was in the conversation and is not in the reader's head the next
     morning. Say the thing - "you chose this before the run", "the plan's
     Phase 3" - or leave it out.
   - **No aphorisms.** A neat, balanced line states a conclusion whose
     premise the reader has not been given:

     > ✗ "Whose tree a place goes into is checked on the move, not only
     > on the create."
     >
     > ✓ "Moving an `org_unit` now checks its new parent is in the same
     > organisation. Creating one already did."

   **There is no word count.** Length follows the change: a one-file
   wording fix is a handful of lines, and a twenty-file security change is
   as long as it needs to be. A little repetition is fine. A sentence that
   only parses on the second read is not.

   ### Bullets: a bold lead, then the plain detail

   **Every bullet opens with its claim in bold, five to eight words, then
   one or two plain sentences giving the reason or the consequence.** The
   reader skims the bold column and dips into the plain text only where
   they want to, as they do with every `## TL;DR`.

   - **The bold and the plain text never say the same thing.** A bold
     headline that the sentence then repeats is wasted, and so is a
     conclusion in bold with its premise left out.
   - **One idea per bullet.** Two bullets on the same idea are one bullet;
     one bullet carrying two ideas is two.
   - **No sentence that restates another**, however short it is.

   ### Names

   **Use the vocabulary of the plan and of the code, not a private
   synonym for it.** If the plan calls it an `org_unit`, write `org_unit`;
   if the route is `/api/sites`, write `/api/sites`. A gentler word is
   worse than jargon because it can be wrong: "place" for `org_unit` cost
   a review, since the plan says the tree is governance, not geography.
   Leave out the *incidental* - a local variable, a private helper - which
   only the diff needs.

   **Give every name three or four words saying what it is, the first
   time it appears:** "`org_unit`, a node in the governance tree: a trust,
   a hospital or a ward". Bare after that.

   **Never point at something with a bare noun phrase.** "The new list",
   "the form", "that gate" ask the reader to guess which thing is meant.

   > ✗ "The new list is added beside the old ones."
   >
   > ✓ "`place_ids` is added beside `organisation_ids` and `site_ids`."

   This holds for the branch below too. A reader arrives at one pull
   request in a stack, not at all of them in order.

   ### Punctuation and spelling

   **No em dashes.** Not in the opening, not in a bullet, not in a
   heading. A comma, a colon, a full stop or a pair of brackets does the
   same job. A sentence reaching for an em dash is usually one clause too
   long, so the honest fix is to split it.

   **British English throughout**, as `CLAUDE.md` requires: organisation,
   behaviour, recognise, licence as the noun. Identifiers, route paths and
   library names keep whatever spelling the code gives them.

   ### Writing for a dyslexic reader

   The reader is dyslexic, and these are the British Dyslexia Association's
   writing rules, from its style guide: "Use short, simple sentences in a
   direct style. Give instructions clearly. Avoid long sentences of
   explanation. Use active rather than passive voice. Avoid double
   negatives. Be concise." The sentence rules above already carry the short
   sentences, the bullets, the first-use explanation of a name and bold in
   place of italics. These are the rest.

   - **Active voice.** "Quill sends a link", never "a link is sent". The
     subject names who does the verb, so the sentence says who did it.
   - **No double negatives.** Not "a job that is not excluded does not
     fail" but "every job the check covers passes". Security write-ups
     breed these, so look for them there.
   - **Instructions a person must carry out go in a numbered list**, in
     the order they are done, separate from the explanation. The guide
     says to give instructions clearly and to avoid long sentences of
     explanation around them. Secrets to set before merging, a command to
     run afterwards, a setting to change by hand: each is a numbered step.
   - **No italics, no underlining, no block capitals outside a code
     span.** The guide says underlining and italics "make the text appear
     to run together" and block capitals are "much harder to read". Bold
     is the only emphasis, and only for a word that must not be missed.
   - **Every bullet ends with a full stop.** A text-to-speech reader
     pauses on punctuation and runs straight on without it.
   - **No tables, and no text inside an image.** A text reader stumbles on
     a table and cannot hear an image. An embedded screenshot needs a
     sentence beside it saying what it shows.

   ### The sections

   - **`## Decisions to check`** - the choices you made that a human might
     have made differently. A wrong one means the whole pull request needs
     a closer read, so it comes first. Each bullet takes one shape: what
     was chosen, what it was chosen instead of, and why. Then, where the
     choice is not certain, one of two fixed words, so they can be scanned
     for: `my reading` (the plan was silent and you picked a reading) or
     `a guess`. No word means you are sure. Do not hedge with "may",
     "should" or "I believe". A departure from the plan opens with
     "Departed from the plan:". Following the plan is not a decision. Omit
     the section when there genuinely were none.

   - **`## Risks`** - security, data leaks, patient safety, anything that
     could go wrong beyond the code being incorrect. **Always present**,
     even as "None found.", because an omitted section cannot be told
     apart from one nobody thought about. Say "none found", never "none":
     it is what you noticed, not a guarantee, and your judgement of risk
     is not well calibrated.

   - **`## What has changed`** - what is different now, in terms of what a
     user of the thing would see. **Always present**, never collapsed, and
     one bullet when one is all there is. Not a file list and not a commit
     list: the diff already carries those. **Counting is not describing** -
     "sixteen tests" tells the reader nothing on its own; say what the
     tests pin down.

   ### Closing

   Finish with `<!-- crp:pr-summary -->` on its own line - nothing after
   it. **No attribution footer anywhere in the body**, no "Generated by",
   no session link, no robot emoji: if a tool appends one, strip it
   before the body is posted and say that you did.

   ```bash
   gh pr edit <number> \
     --title "Passport: what this branch does" \
     --body-file <path to the body>
   ```

   `--body-file` rather than `--body`: the body holds backticks, quotes
   and newlines, and passing it inline leaves them at the shell's mercy.

10. **Mark it ready only if `ready` was given**, and only if step 6 reported
   `isDraft: true`:

   ```bash
   gh pr ready <number>
   ```

   Marking ready starts the heavy CI tier - say so when reporting. If it is
   already out of draft, leave it and say so. This is the last step; do not
   merge it.

## Report

One short block:

- The branch created, and its position in the stack (`just stack-log`).
- The pull request URL, and under it the description's three triage
  lines: Size, Look hardest at, Check for me.
- Whether it was left a draft or marked ready.
- The commit message and the title used, since the name, the message and
  the title were all chosen for you.
- **Any decision or risk written into the description**, repeated here in
  one line each. After an unattended run the terminal is read before the
  pull requests are, and a decision nobody sees is a decision nobody
  checked.
- Which tests were run, by name. Never claim a suite that was not run.

If a step fails mechanically - a test fails, a rebase conflicts, two pull
requests match the branch - stop and report it rather than working around
it.

**That is not licence to stop because the work itself gave you pause.**
The stopping conditions in this command are all of the first kind: no
stack, a stack spanning worktrees, a failing test, an ambiguous pull
request. None of them is about what the work is, where it lives, or
whether it looks ready. Those are settled by the command having been run.

**Writing the report ends the run, and ends what it authorised.** From
that point the branch is the user's, not yours: no further commit, no
amend, no push, no pull request edit, however small the change or however
clearly it belongs to the unit just landed. See "The authorisation ends
with the run" above.
