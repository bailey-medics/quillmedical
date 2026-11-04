<!-- cspell:words dontAsk NONESSENTIAL -->
# Alert watcher never types into a dialog plan

On 4 November 2026 two App production alerts were lost. The alert watcher
typed `/clear` and `/alert <file>` into worktree 5's tmux pane, but Claude
Code had a dialog open in front of its prompt, so the keystrokes went into
the dialog and no run started. The watcher waited out its start grace,
logged `finished ... sawBusy=false`, and kept the ledger's `run` record, so
neither alert was retried and nobody was told. The 14:09 `/api/passport`
500 was found only because a person saw it in Slack.

This plan closes both halves of the gap. First, the session is started so
that Claude asks nothing: no selection questions and no permission
prompts. Second, the watcher stops trusting that typing worked. It checks
that the pane is at an idle prompt before typing, and it treats a run that
never went busy as a failure, said in the thread, rather than as done.

## Phase 1: The watcher's session asks nothing

- [x] **Refuse `AskUserQuestion`**, by adding
      `--disallowedTools AskUserQuestion` to the `claude` command in
      `scripts/alert-watcher/start-session.sh`. A selection question is a
      dialog that waits for a person, and an alert run has none. With the
      tool refused, the run states its assumption in the Slack thread and
      carries on, which the `/alert` skill already expects of it.
- [x] **Start in `--permission-mode auto`, not `dontAsk`**, in the same
      command. The plan first said `dontAsk`, but the Claude Code
      permission modes page
      (<https://code.claude.com/docs/en/permission-modes>) says it
      "auto-denies every tool call that would otherwise prompt you", and a
      file edit prompts in manual mode. So an alert run could not have
      written its fix without widening the allow list to every edit, which
      is the widening the Decisions below rule out. Auto mode decides each
      call with its classifier instead of asking, and the same page names
      the few cases where it still asks: an explicit `ask` rule (the
      project has none), `AskUserQuestion` (refused above), a read outside
      the working directories (refused in the next step), and three blocks
      in a row or twenty in a session, after which it "resumes prompting".
      That last has no switch; Phase 2 is the safety net for it. The mode
      is passed explicitly because the docs say `defaultMode: auto` "does
      not take effect from project or local settings", so the project's
      `.claude/settings.json` does not set it. Deny rules "block in every
      mode", so the `/alert` skill's refusals of `git push` and
      `gh pr merge` still hold.
- [x] **Switch off what can be switched off**, in
      `scripts/alert-watcher/session-settings.json`, passed with
      `--settings` so it applies to this session only. From the settings
      and environment variable references:
      `permissions.blockReadsOutsideWorkingDirectories` (a read outside
      the worktree and the alert folder is refused rather than asked
      about), `spinnerTipsEnabled`, `awaySummaryEnabled` and
      `promptSuggestionEnabled` off (less drawn in the pane for Phase 2 to
      read past), and `CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1` exported
      before `claude` starts. `feedbackSurveyRate` was left out: the
      reference says it changes the rate without saying what turns it off,
      and a value the schema refused would itself open a "Settings Error"
      dialog at start. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` was left
      out too, since it also stops feature flags being fetched. Checked by
      starting Claude Code 2.1.318 with these flags in a scratch tmux
      session: it came up at an idle prompt with no warning. There is no
      switch for onboarding notices, release notes or the plan banner
      Claude Code prints above the first prompt.
- [ ] **Restart the session to pick it up.** `start-session.sh` leaves a
      running session alone, so the flags take effect only after
      `tmux kill-session -t q5` and a fresh start. This is for a person to
      do once the pull request merges, since it ends the session doing
      the restarting.

## Phase 2: Look at the pane before typing

- [ ] **Add `isAtPrompt()` to `scripts/alert-watcher/src/session.ts`**,
      which reads the pane with `tmux capture-pane -p -t <target>` and
      answers whether Claude Code is at an empty, idle prompt. This
      depends on Claude Code's screen text, which can change between
      versions, so keep the matching in one small function, write its
      tests from captured panes (idle, mid-turn, a selection dialog, a
      permission prompt, half-typed text), and fail closed: anything not
      recognised as idle counts as not ready.
- [ ] **Only start a run at an idle prompt**, in `startNext` in
      `scripts/alert-watcher/src/watcher.ts`. If the pane is not ready,
      leave the alert queued and check again on the next tick, exactly as
      it does for the busy flag. Post once in the thread, "Waiting:
      worktree 5 has a prompt open that needs a person", so whoever
      looks knows why, and do not post again for the same alert.
- [ ] **Do not record `run` in the ledger until the run has started.**
      Today `startNext` records `run` the moment it types (line 275), so a
      run that never starts still uses up its fingerprint for the day.
      Record it once the busy flag is first seen instead.

## Phase 3: A run that never started is a failure

- [ ] **Treat `sawBusy=false` after the start grace as not picked up**, in
      `followRun` in `scripts/alert-watcher/src/watcher.ts`. Log
      `not-picked-up` rather than `finished`, reply in the thread "Not
      picked up: worktree 5 did not start the run. A person needs to
      look", and leave the fingerprint out of the ledger, so the next post
      of the same alert is tried again.
- [ ] **Try once more before giving up.** Put the alert back at the head
      of the queue once, so a brief dialog that has since been dismissed
      costs a few minutes rather than the alert. A second failure leaves
      it to the person the thread has already told.
- [ ] **Tests in `scripts/alert-watcher/src/watcher.test.ts`** for: a pane
      not at its prompt holds the queue; a run that never went busy posts
      once, is retried once, and is not in the ledger; and a run that goes
      busy is recorded as before.

## Decisions

- **Refuse dialogues at the source and check the pane as well.** Either
  alone leaves a gap: flags cannot reach the messages Claude Code shows by
  itself, and reading the pane depends on screen text that a version can
  change. Together, a missed check is caught by the other.
- **Auto mode, not a wider allow list.** Allowing more tools so nothing
  prompts would widen what an unattended run may do. Auto mode keeps the
  allow list as narrow as it is now and decides the rest call by call; a
  call it blocks is reported back to the run, which says so in the
  thread.
