# Tmux survives an alert watcher restart plan

At 13:30:33 on 4 November 2026, `systemctl --user restart
quill-alert-watcher.service` closed every tmux session on the home box,
`q1` to `q6`, and every Claude Code session running in them. Each
terminal printed `[server exited]`, and `just tmux-window` then failed
on line 2996 with exit code 1. The cause is where the tmux server runs:
inside the alert watcher's own systemd process group. At boot,
`scripts/alert-watcher/start-session.sh` runs `tmux new-session -d -s q5`
before anybody has started tmux, so that command starts the tmux server
in the service's group, and every later session joins the same server.
A service's default `KillMode=control-group` kills everything in that
group when it stops, so a restart of the watcher takes the server and
every session with it. systemd said as much at 13:30:35: "Found
left-over process (tmux: server) in control group while starting unit".
The new server is in that group again, so the next restart will do the
same.

The outcome: restarting, stopping or upgrading the alert watcher touches
only the watcher. The tmux server and every session in it, `q5` included,
carry on. Nothing else about how the watcher or the sessions behave
changes.

## Phase 1: Start the tmux server outside the service

- [x] **Confirm the cause on the box before changing anything.** Run
      `systemctl --user status quill-alert-watcher --no-pager` and
      check the `tmux new-session -d -s q5 ...` process, which is the
      tmux server, is listed under the service's `CGroup:`. Then
      `ps -o pid,cgroup -C tmux` names the same group. The journal for
      the restart is `journalctl --user --since "2026-11-04 13:30"
      --until "2026-11-04 13:31"`.
      - **Confirmed on 4 November 2026.** The service's `CGroup:` listed
        the tmux server and, beneath it, every worktree's `claude`,
        including the one doing this work, and the journal had the
        "left-over process" line at 13:30:35.
- [x] **Start the session through `systemd-run --user --scope`** in
      `scripts/alert-watcher/start-session.sh`, where it now runs
      `tmux new-session -d -s "${session}" -c "${worktree}" bash -lc
      "${command}"`. A scope is a process group of its own under the
      user's systemd, so a tmux server started there belongs to no
      service, and stopping the watcher leaves it alone. Give the scope
      a fixed, readable name, such as `--unit=quill-tmux-server`, so
      `systemctl --user status quill-tmux-server.scope` finds it.
      - **Only the first command starts a server.** If a server is
        already running, because a person started tmux first, `tmux
        new-session` only asks it for a new session, and the scope ends
        as soon as the command returns. That is fine: the server is
        already outside the service. So the change is safe whichever
        starts first.
      - **A fixed scope name clashes if a scope of that name is still
        running.** Tried on the box: `systemd-run` refuses with "Unit
        ... was already loaded". Built with the fixed name, and a
        `systemctl --user is-active` check first, rather than a
        generated name nobody could find: while the scope is
        active the server is already in it, so tmux runs as it is.
        `--collect` lets a scope that failed go, so it never holds the
        name.
      - **`systemd-run` needs the user's systemd to be reachable**, which
        it is under the service and in a login shell with lingering on.
        Without `systemd-run` on the `PATH`, tmux runs as it is, so the
        script still works anywhere the tests run it.
- [x] **Do the same in `~/.local/bin/quill-sessions`**, which starts the
      other worktrees' sessions. Whichever starts the first session
      starts the server, so both must use a scope. It runs at boot from
      `quill-sessions.service`, a `Type=oneshot` unit with
      `RemainAfterExit=yes`, so a server it started would sit in that
      service's group and die with it in the same way.
      - **Changed by hand on the box on 4 November 2026**, with the same
        `start_tmux` function as `start-session.sh`, and a copy of the
        old file kept beside it. It stays outside the repository, as the
        remote dev machine plan has it, so a rebuilt box needs the same
        change made again.
- [x] **Read `docs/docs/plans/2026-10-19-remote-dev-machine-plan.md`**
      for how `quill-sessions` and the watcher's unit were meant to work
      together, and record the fix in its watcher phase, so the plan
      says why the server runs in a scope.
- [x] **Decide against `KillMode=process` in the unit file, and say
      why.** It would also stop the restart killing tmux, by killing
      only the watcher's own `node` process. But systemd would then
      leave behind anything else the watcher started, such as a hung
      child, and log a warning about it on every start. The scope fixes
      the cause, that the server was in the wrong group, where
      `KillMode` only hides it.

## Phase 2: Tests and docs

- [x] **Extend `scripts/tests/alert-watcher-start-session.bats`** so it
      checks that the session starts through `systemd-run --user
      --scope` when `systemd-run` is on the `PATH`, and through a plain
      `tmux new-session` when it is not. Stub both commands on the
      `PATH`, as the existing tests stub `tmux`. Run with
      `just ts scripts/tests`.
      - **Every test now stubs `systemd-run` and `systemctl`**, so none
        can reach the real systemd on a host. The test without
        `systemd-run` runs the script on a `PATH` holding only the stub
        `tmux` and the tools the script needs. Two more tests check an
        active scope is not asked for again, and a running session
        starts no scope.
- [ ] **Test it on the box, by hand**, after the change is installed:
      1. Run `tmux kill-server` from outside tmux, so the next start
         makes a new server. That closes every session, so do it when
         nothing is running in them.
      2. Run `systemctl --user restart quill-alert-watcher`, so
         `start-session.sh` starts the server through the scope.
      3. Check `systemctl --user status quill-alert-watcher` no longer
         lists a tmux process under `CGroup:`, and
         `systemctl --user status quill-tmux-server.scope` does.
      4. Open another session with `just tmux-window`.
      5. Run `systemctl --user restart quill-alert-watcher` again, and
         check every session is still there with `tmux ls`.
      - **For a person, from a plain terminal.** Step 1 ends every
        Claude on the box, so it cannot be run from a Claude session.
- [x] **Update `scripts/alert-watcher/README.md`** to say that the tmux
      server runs in a scope of its own, and why: a restart of the
      watcher must never close the sessions people are working in.
- [ ] **Reload systemd after the merge.** systemd also warned on
      4 November that the unit file had changed on disk, because the
      unit is linked from worktree 5 and an alert run had moved that
      worktree to `main`. Running `systemctl --user daemon-reload` clears
      it. The README now says this happens every time worktree 5 moves
      to a commit where the unit file differs, so it is expected.

## Decisions

- **A scope, not a separate tmux service.** A `tmux.service` user unit
  of its own would also work, but then the watcher must order itself
  after it, and a person's own `tmux` command could still start a
  second server first. A scope changes one command and nothing about
  the order things start in.
