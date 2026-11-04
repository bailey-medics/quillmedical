<!-- cspell:words boto fileexists -->
# The alert watcher is called Owl plan

The alert watcher posts in `#quill-medical-cicd` as Owl, and that is the
name Mark knows it by. The repository calls it the alert watcher
everywhere: `scripts/alert-watcher/`, `quill-alert-watcher.service`,
`QUILL_ALERT_WATCHER`, the `awi` and `uaw` recipes. So a person who
knows it from Slack has to be told that the two are the same thing
before they can find it, and each conversation about it starts with that
translation.

This plan renames it to Owl in everything the repository controls, and
moves the live service on the home box across in one step, so that the
repository and the box never disagree for longer than it takes to run
one recipe. Names that live in Google Cloud keep their old values, for
the reasons given in Phase 2, but their Terraform names and descriptions
say Owl.

## Phase 1: Rename the code, and move the box with it

These land as one unit, because each half breaks without the other. The
service on the box is linked from worktree 5's checkout, so once the
renamed code reaches `main`, the next alert run's `just stack-fresh`
removes `scripts/alert-watcher/quill-alert-watcher.service` from under
the running service. The install recipe in this unit is what moves the
box onto the new names, and it has to exist the moment the old paths
stop.

- [x] **Move `scripts/alert-watcher/` to `scripts/owl/`** with `git mv`,
      so history follows the files. The package in `package.json`
      becomes `quill-owl`, and the comments say "Owl, the alert watcher"
      the first time in each file, then Owl.
- [x] **Rename the service to `quill-owl.service`**, with its
      `ExecStartPre`, `ExecStart` and `WorkingDirectory` pointing at
      `scripts/owl/`.
- [x] **Rename the environment and the paths it reads.**
      `QUILL_ALERT_WATCHER` becomes `QUILL_OWL`, and the overrides
      `QUILL_ALERT_WATCHER_STATE`, `QUILL_ALERT_WATCHER_ENV`,
      `ALERT_WATCHER_TMUX_TARGET`, `ALERT_WATCHER_WORKTREE` and
      `ALERT_WATCHER_CERTIFICATE` become `OWL_STATE`, `OWL_ENV`,
      `OWL_TMUX_TARGET`, `OWL_WORKTREE` and `OWL_CERTIFICATE`. The state
      folder becomes `~/.local/state/quill-owl` and the config folder
      `~/.config/quill-owl`, rather than a bare `owl`, which another
      program could just as well use. Also renamed:
      `ALERT_WATCHER_CHANNEL` (a key in the env file on the box) and
      `ALERT_WATCHER_RECORD_EVENTS` become `OWL_CHANNEL` and
      `OWL_RECORD_EVENTS`. The changes are in `src/config.ts`, `src/certificate.ts`,
      `start-session.sh`, `scripts/slack-reply.sh` and the busy hook.
- [x] **Rename the busy hook** to `.claude/hooks/owl-busy.sh`, with its
      test, and point the two hooks in `.claude/settings.json` at it.
- [x] **Rename the recipes.** `alert-watcher-install` (`awi`) becomes
      `owl-install` (`owi`), and `unit-tests-alert-watcher` (`uaw`)
      becomes `unit-tests-owl` (`uow`). The `alert-watcher` service in
      `compose.unit-tests.yml` becomes `owl`, with its volume.
- [x] **Make `owl-install` move the box across.** It runs
      `scripts/owl/install.sh`, which takes the branching the recipe
      body holds now, plus the move: if `quill-alert-watcher.service` is
      installed, stop it, disable it and remove its link; move
      `~/.local/state/quill-alert-watcher` to `~/.local/state/quill-owl`
      and `~/.config/quill-alert-watcher` to `~/.config/quill-owl`; then link, enable and start `quill-owl.service`.
      Moving the folders keeps the ledger, the env file with the Slack
      tokens, the gcloud settings and the certificate and its key, so
      nothing has to be made again. A folder present under both names
      is refused, before anything is stopped, since one of them is not
      what it looks like. Two things in the moved folder name the old
      one, found by reading the box's copy: gcloud wrote the folder's
      absolute path into `gcloud/certificate_config.json` and a `.boto`
      file under `legacy_credentials`, so every text file under the new
      folder has the old path rewritten, its `logs` left alone as
      history; and the env file's `ALERT_WATCHER_CHANNEL` is renamed. A
      q5 started before the move still has `QUILL_ALERT_WATCHER`, so the
      script says to start it again when it has moved anything. Tests in
      `scripts/tests/owl-install.bats` stub `systemctl` and check each
      case: first install, a move from the old names, a second run that
      changes nothing, both names present, the gcloud path and env key
      rewrites, and an env file others can read.
- [x] **Update everything else that names it**: the `ci.yml` step and
      `dependabot.yml` directory, `frontend/package.json`'s
      `typecheck:all`, `scripts/claude-session.sh` (which refuses to
      start `q5` while the service is enabled, and names the restart
      command), `scripts/tmux-window.sh`, the comment in
      `infra/modules/monitoring/main.tf`, the `/alert` skill, the README,
      `docs/docs/infrastructure/monitoring.md`, and the
      [alert watcher never types into a dialog plan](2026-11-04-alert-watcher-never-types-into-a-dialog-plan.md),
      whose unbuilt phases name the old paths.
- [x] **Rename the rule in `CLAUDE.md`'s Claude-specific section** to
      "Owl may open a pull request, and nothing more", introducing it as
      "Owl, the alert watcher", with `QUILL_OWL=true` in place of the old
      variable. The rest of that section is not synced from Copilot, so
      the edit survives `/sync-copilot-config`.
- [x] **Building it in worktree 5 moves the running service's files.**
      The service on the box is linked from this checkout, so the moment
      `git mv` ran, its unit file and the busy hook's old name were gone.
      The daemon kept running from what it had loaded, but systemd could
      not restart it, and this session's hooks, now at `owl-busy.sh`,
      look for `QUILL_OWL` and set no flag. Phase 4 is what puts the box
      right, so it should follow straight after the merge.
- [x] **Check nothing is left**: `git grep -iE "alert[-_ ]?watcher"`
      should find only the places listed under Decisions as kept.

## Phase 2: Terraform says Owl, and Google Cloud keeps its IDs

- [x] **Move `infra/alert-watcher.tf` to `infra/owl.tf`**, renaming the
      resource addresses (`google_service_account.alert_watcher_logs` to
      `google_service_account.owl_logs`, and so on) with a `moved` block
      for each, so Terraform sees the same resources under new names
      rather than destroying and creating them. The two `import` blocks
      that first adopted the pool and its provider point at the new
      addresses; with the resources already in the state they do
      nothing. The certificate authority moves with it, from
      `infra/environments/app/alert-watcher-ca.pem` to `owl-ca.pem`. That
      path matters more than it looks: the pool's `count` is
      `fileexists()` on it, so a path left pointing at the old name
      would destroy the pool. `terraform validate` passes on the
      result.
- [x] **Keep every ID Google Cloud holds.** The service account's
      `account_id` (`alert-watcher-logs`), the workload identity pool's
      ID (`alert-watcher`) and the certificate's subject
      (`quill-alert-watcher`) all stay. Each one is part of an identity:
      changing the account ID makes a new account with a new email, a
      deleted pool's ID cannot be used again for 30 days, and the
      subject is what the IAM binding admits, so changing it means
      issuing a new certificate. `display_name` and `description` can
      change in place, so those say Owl.
- [x] **Confirm the plan is in place only.** The Terraform plan in the
      pull request must show the moves and the in-place description
      changes, and no destroy. A destroy means a `moved` block is
      missing, and the pull request is not ready until it is fixed.
      CI's plan comment on #2376 read "Plan: 0 to add, 2 to change, 0 to
      destroy": the four moves, and the new display name and description
      on the service account and the pool.

## Phase 3: A recipe to restart Owl

- [x] **Add `just owl-restart` (`owr`)**, running
      `scripts/owl/restart.sh`, which restarts Owl and its Claude Code
      session in `q5`. It refuses anywhere but worktree 5 on the home
      box, as `owl-install` does. It refuses while the busy flag is set,
      unless given `force`, except when it is run from inside `q5`,
      where the flag belongs to the turn running it.
- [x] **Run the restart detached**, with `systemd-run --user --collect`:
      stop `quill-owl.service`, `tmux kill-session -t =q5`, clear the
      busy flag, start the service. Killing `q5` kills whatever shell
      ran the recipe inside it, so a restart run in place would stop
      after the kill and before the start, leaving no Owl at all.
- [x] **Tests in `scripts/tests/owl-restart.bats`**, stubbing
      `systemctl`, `tmux` and `systemd-run`: refused in another
      worktree; refused while busy, and `force` overrides it; the flag
      ignored from inside `q5`; the four steps handed to `systemd-run`
      in that order; and nothing killed in place.
- [x] **Point the restart instructions at it.** `scripts/claude-session.sh`
      refuses to start a plain Claude in `q5` and says how to start it
      again, and `install.sh` says the same after moving the box across.
      Both now say `just owl-restart`, and the README describes it.

## Phase 4: Move the box across, once Phase 1 merges

For a person on the home box, straight after the merge, before the next
alert arrives. The first step is the state the stack was left in on
4 November 2026, written down because the session that built it can be
cleared by the next alert at any moment.

- [ ] **Know what the stack holds before merging it.** Five draft pull
      requests, one stack with the key `watcher`, in worktree 5, bottom
      first:
      #2372 `feature/watcher-session-never-stops-to-ask` (Phase 1 of the
      [alert watcher never types into a dialog plan](2026-11-04-alert-watcher-never-types-into-a-dialog-plan.md)),
      #2373 `feature/watcher-stack-new-finishes-a-half-made-branch` (a
      fix to `just stack-new`, found while landing #2372),
      #2375 `feature/watcher-the-alert-watcher-is-called-owl` (Phase 1),
      #2376 `feature/watcher-terraform-says-owl` (Phase 2) and
      #2377 `feature/watcher-owl-restart` (Phase 3). Merge them bottom
      first, or enqueue the whole stack. Phases 2 and 3 of the dialog plan
      are not built yet; they belong on top of #2377, and their paths are
      already written as `scripts/owl/`.
- [ ] **Know that Owl is fragile until this phase is done.** Building
      Phase 1 in worktree 5 moved `scripts/alert-watcher/`, so the unit
      file systemd links to is gone and the old daemon runs only from what
      it had loaded: if it stops, systemd cannot start it again. The
      session's hooks, renamed to `owl-busy.sh`, look for `QUILL_OWL` and
      no longer set the flag the old daemon reads, so the flag was written
      by hand at 15:43 into `~/.local/state/quill-alert-watcher/busy`. The
      daemon treats a flag over three hours old as abandoned, so from
      18:43 it may type `/clear` and `/alert` into `q5` again.
- [ ] **Move Owl's packages aside to push the stack.** `just
      stack-submit` rebases every branch, checking out the lower ones,
      where `scripts/owl/` is not tracked. Its `node_modules` and `.yarn`,
      which `scripts/owl/.gitignore` ignores only on the upper branches,
      then show as uncommitted work and the rebase stops part way, holding
      gh-stack's shared lock in `.git/gh-stack-rebase-state` and blocking
      stack commands in every worktree. Move both folders out of
      `scripts/owl/` before `stack-submit`, and back afterwards. If a
      rebase is already stuck, `gh stack rebase --abort` restores every
      branch. This stops mattering once #2375 merges.
- [ ] Run `just stack-fresh` in worktree 5, so it is on `main`.
- [ ] Run `just owl-install`. It stops the old service, moves the
      folders to their `quill-owl` names and starts `quill-owl.service`.
- [ ] Run `tmux kill-session -t q5`, then
      `systemctl --user restart quill-owl`, so the session starts with
      `QUILL_OWL=true`. After Phase 3 merges, `just owl-restart` does
      this.
- [ ] Check `journalctl --user -u quill-owl` shows it connected to Slack.

## Decisions

- **The `/alert` skill keeps its name.** It names what a run does,
  investigate an alert, not who starts it. Owl types `/alert`, as a
  person can by hand.
- **The `q5` session keeps its name.** It is worktree 5's session, which
  `quill-sessions` and `acc` find by that name. Owl borrows it.
- **Earlier plans are left as written.** The plans before this one record
  what was built at the time, under the names it had then. Rewriting them
  would make that history say something that was never true, so only
  this plan and the unbuilt phases of the dialog plan use the new names.
- **Frozen files stay.** `api-compatibility/` decision files are never
  edited, so the rehearsal route's file keeps its name.
- **A clean move, with no fallback to the old names.** The code reads
  only the new paths and variables, and `owl-install` moves the old
  folders once. Reading both would leave two names in the code for good,
  which is the problem this plan exists to remove.
