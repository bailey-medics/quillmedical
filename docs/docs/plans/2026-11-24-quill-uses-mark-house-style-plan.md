# Quill uses mark-house-style plan

Quill keeps its own copies of Claude Code rules and skills that Mark's
mark-house-style repository also holds, and the two have drifted. Four rule
files exist in both places: `home-details.md`, `just.md`, `plans.md` and
`workflows.md`, differing by 12 to 138 lines. Claude Code loads personal
rules from `~/.claude/rules/` and project rules from `.claude/rules/`
together, with neither winning, and its documentation says Claude "may
follow either one" where they conflict. So in Quill today Claude reads two
versions of each rule. Seven skills are duplicated too: Quill's `crpd`, `e`,
`f`, `g`, `p`, `s` and `in-code-documentation` beside mark-house-style's
`t-` versions of the same, carried over from Turva.

The outcome is one copy of each. mark-house-style holds the general rule or
skill. Each repository's own instructions supply what is particular to it,
such as its test commands and its plans folder. Quill keeps only what is
Quill's own: the Owl skills and hooks, the backend and frontend rules, and
the docs site. The justfile side is already done, in #2539, #2540 and
#2542.

## Open questions

- [x] **Do other skills need a back-up besides `crpd`?** Owl only calls
  `/crpd`. A contributor without mark-house-style would have no `/p`,
  `/f` or `/s` in Quill at all after Phase 3. - No, not for now: there is
  no obvious need for any other. Answered by Mark, 24 November 2026.

- [x] **Should CI also catch drift?** mark-house-style is on GitHub, so
  a CI job could fetch it and run the same comparison. That would catch
  drift when nobody starts a session. - No: CI does not need to catch
  drift. Answered by Mark, 24 November 2026.

- [x] **Does Turva need a back-up too?** Turva has no unattended runner
  like Owl today. - No. Answered by Mark, 24 November 2026.

- [x] **What does `/f` do with the mark-house-style half of each phase?**
  Each phase changes files in Quill and in mark-house-style, which takes
  direct commits to `main` and is pulled by every session at start. -
  `/f` commits and pushes mark-house-style to `main` as part of landing
  each phase, just before the Quill pull request. Running `/f` is the
  go-ahead for both. Answered in `/g`, 24 November 2026.

- [x] **Who tries the merged `t-` skills before the prefix is dropped,
  and where?** - `/f` tries them itself, in a temporary Quill worktree
  made fresh from `origin/main`, so the trial starts its own stack apart
  from the one `/f` is building. `/f` closes each trial pull request
  without merging, deletes its branch, and removes the worktree. Answered
  in `/g`, 24 November 2026.

- [x] **Is Phase 2 too big for one pull request?** `crpd` alone is about
  1,000 lines in Quill. - Yes: it splits in two, `crpd` and `f` first,
  then the five small skills. Answered in `/g`, 24 November 2026.

- [x] **Where Quill's `CLAUDE.md` is stricter than the global one, which
  wins?** - The stricter wording moves into the global `CLAUDE.md`, so
  every repository gets it, and Quill's copy goes. Answered in `/g`,
  24 November 2026.

- [x] **Does Turva's "For the shared skills" section need a Turva pull
  request?** - No: it goes in mark-house-style's
  `projects/turva/rules/turva.md`, which `turva-link` already copies into
  Turva. Settled from the code in `/g`, 24 November 2026: the Turva
  repository itself names no `t-` skill, so the rename needs no Turva
  change either.

## Phase 1: one copy of each rule

- [x] Merge each pair into a general rule in mark-house-style's
  `claude/rules/`: `home-details.md`, `just.md`, `plans.md` and
  `workflows.md`. Each one says what holds in every repository, and names
  no project. mark-house-style's `home-details.md` today names Turva, and
  its `plans.md` assumes a `plans/` folder at the root, so both need the
  project names taken out. Where a rule only makes sense with a project's
  detail, such as which folder plans live in, the general rule says
  "the repository's plans folder" and the repository says where that is.

- [x] Cut each of Quill's four, in `.claude/rules/`, down to Quill's
  additions only, keeping its name: `home-details.md`, `just.md`,
  `plans.md` and `workflows.md`. No prefix is needed: Claude Code loads
  personal and project rules from different folders, so the same name
  never collides, and the folder already says the file is Quill's. Each
  opens by saying it adds to the shared rule of the same name. Examples of what stays in
  Quill: the `check-home-details` pre-commit hook and the docs site
  publishing `docs/docs/`; `just sa b` and `scripts/start-app-args.sh`;
  `docs/docs/plans/`, the plans index and `/f`; Quill's own workflow
  conventions. Keep each file's `paths:` front matter where the original
  had one, such as `docs/docs/plans/**` for the plans rule, because the
  general rule cannot know Quill's paths.

- [x] Check nothing contradicts. Read each general rule beside its Quill
  addition, and remove any line in the addition that restates or
  disagrees with the general rule. Two loaded rules that disagree are the
  problem this phase fixes.

- [x] Commit and push the mark-house-style half to its `main`, then land
  the Quill half with `/crpd`. Every phase ends this way.

## Phase 2: the shared `crpd` and `f` do everything Quill's do

The `t-` names stay in this phase and the next. A personal skill hides a
project skill of the same name, so renaming now would replace Quill's
skills before the shared ones can stand in for them. Keeping `t-` means
both run side by side, and the shared ones can be tried in Quill before
anything switches over.

- [x] Add a "For the shared skills" section to Quill's `CLAUDE.md`, under
  `## Claude-specific`, holding what the skills need to know about Quill:
  the targeted test commands (`just ub -k`, `just uf <file>`, `just ts`),
  the plans folder and its index, the readability command
  (`python3 scripts/readability.py --longest`), and the teaching
  repositories with their `STACK_REPO` paths. Turva's answers go in
  mark-house-style's `projects/turva/rules/turva.md`, which `turva-link`
  copies into Turva, so no Turva pull request is needed.

- [x] Merge Quill's `crpd` and `f` into mark-house-style's `t-crpd` and
  `t-f`. Quill's have grown past the Turva originals, for example
  `crpd`'s readability scoring, its stack key and its handling of a
  merged stack. Everything general moves across; everything Quill-only
  becomes "read the repository's section for the shared skills".

- [x] Try them in a temporary Quill worktree, made with
  `git worktree add` from `origin/main`, so the trial starts a stack of
  its own instead of joining the one `/f` is building. Run
  `/t-crpd draft` on a one-line change there, and check it names the
  branch, scores the description and opens a draft pull request as
  Quill's `crpd` would. Fix any gap in mark-house-style and try again.
  Then close the trial pull request without merging, delete its branch
  and remove the worktree, and say how the trial went in this phase's
  pull request.

  Done on 24 November 2026 as #2544, closed without merging. `/t-crpd
  draft` started a stack, committed, pushed, found the pull request,
  read its files and posted a scored description as Quill's `crpd`
  does. One thing came up that is not the skill's: a worktree made
  fresh with `git worktree add` has no `node_modules`, so the
  pre-commit hook stops until `just yarn-install` has run in it.

- [x] Commit and push the mark-house-style half to its `main`, then land
  the Quill half with `/crpd`.

## Phase 3: the five small shared skills do everything Quill's do

- [ ] Merge Quill's `p`, `g`, `s`, `e` and `in-code-documentation` into
  mark-house-style's `t-` versions, the same way as Phase 2. They are
  small, from 16 to 110 lines each.

- [ ] Try `/t-p` on a scratch plan and `/t-s` on an explanation, in the
  same kind of temporary worktree, and compare each with Quill's. Remove
  the worktree afterwards, and delete the scratch plan.

- [ ] Commit and push the mark-house-style half to its `main`, then land
  the Quill half with `/crpd`.

## Phase 4: drop the prefix, with Owl's back-up copy

This phase switches every repository at once, because mark-house-style
lands on `main` and every session pulls it at start. It must land together
with Quill's pull request deleting its copies, or soon before it: in the
gap, Quill runs the shared skills, which Phases 2 and 3 made complete.

- [ ] Rename mark-house-style's skills from `t-crpd` and the rest to
  `crpd`, `e`, `f`, `g`, `p`, `s` and `in-code-documentation`.
  `scripts/install.sh` links each skill into `~/.claude/skills/`, so it
  must also remove the old `t-` links, with a test. Update every mention
  of `/t-crpd`, `/t-f`, `/t-p` and `/t-g`: the global `CLAUDE.md`,
  Turva's rules in `projects/turva/rules/`, and the README.

- [ ] Delete Quill's `.claude/skills/` copies of the seven, so nothing of
  Quill's is shadowed. Quill's own skills stay: `alert`, `ask`,
  `sync-copilot-config`, `update-docs-docs` and the rest.

- [ ] Keep a back-up of `crpd` for Owl in
  `.claude/skill-backups/crpd/SKILL.md`. Owl's `/alert` run ends with
  `/crpd`, unattended, so it must work on a machine without
  mark-house-style. The folder is outside `.claude/skills/`, so Claude
  Code never loads it as a skill. Change the `alert` skill to say: run
  `/crpd`, and if no `crpd` skill is available, follow
  `.claude/skill-backups/crpd/SKILL.md` instead.

- [ ] Write `scripts/check-skill-backups.sh` with bats tests in
  `scripts/tests/`. For each skill in `.claude/skill-backups/`, it
  compares the back-up with `~/.claude/skills/<name>/SKILL.md`. Where
  the two differ, it prints which, and the command that copies the
  personal one over. Where there is no personal copy, it says nothing,
  because the back-up is then the one in use. The tests cover: the same,
  different, no personal copy, and no back-ups at all.

- [ ] Run it from `.claude/hooks/session-start.sh`, so a session that
  starts with the two drifted is told so in its context. Claude then
  flags it in its first reply and offers to bring the back-up up to
  date. Add `just sync-skill-backups` to make the copy, so the fix is one
  command.

- [ ] Commit and push the mark-house-style half to its `main`, then land
  the Quill half with `/crpd` straight after, so the gap between the two
  is short.

## Phase 5: CLAUDE.md says each thing once

- [ ] Remove from the `## Claude-specific` section of Quill's
  `CLAUDE.md` everything the global `CLAUDE.md` already says: change code
  only on `implement` or `i`, say what you are about to do, end with a
  TL;DR and a conclusion, attribution, and the blank lines between steps.
  Keep what is Quill's: the `local/` folder, the two production names,
  Owl, the dev stack and worktrees, stacked branches, and "the code does
  not sell anything". The section is never written by
  `/sync-copilot-config`, so the cut is safe from the next sync.

- [ ] Check anything Quill's copy says more strictly than the global
  one, and move the stricter wording into mark-house-style's global
  `claude/CLAUDE.md`, so every repository gets it. Then remove Quill's
  copy. Name each passage moved in this phase's pull request.

- [ ] Commit and push the mark-house-style half to its `main`, then land
  the Quill half with `/crpd`.

## Decisions

- **The shared skills are plain `crpd`, `p`, `s` and so on, with no
  `t-`** - Mark chose this on 24 November 2026. It means one name in
  every repository, at the cost of the switch-over needing Phases 2 and 3
  first.

- **Quill's copies are removed, not left to be hidden** - a personal
  skill would hide a project skill with the same name, but a hidden copy
  still drifts and still confuses a reader. Only Owl's back-up stays, out
  of the skills folder.

- **The drift check runs at session start, not in CI** - CI has no
  personal skills to compare with. The check is a prompt to sync, not a
  gate.
