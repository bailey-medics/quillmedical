# Tmux does not inherit Owl's restrictions plan

`sudo` fails in every tmux pane on the devbox with "The 'no new
privileges' flag is set", found on 7 November 2026. `quill-owl.service`
runs with `NoNewPrivileges=true`, which is right for Owl. But since
4 November `scripts/owl/start-session.sh` starts the tmux server with
`systemd-run --user --scope`, so that restarting Owl never closes the
sessions people work in, and a scope runs its command inside the
caller's own process. So the server Owl starts at boot carries Owl's
flag (`NoNewPrivs: 1` in its `/proc/<pid>/status`), and every session on
it inherits the flag: nobody can `sudo` in tmux, Mark included.

The fix starts the tmux server in a way that inherits nothing from Owl,
while keeping the 4 November guarantee that it lives outside Owl's
process group. Owl itself keeps `NoNewPrivileges=true`.

## Phase 1: Start the server as a transient service

- [x] **Drop `--scope` from `start_tmux` in
      `scripts/owl/start-session.sh`.** Call
      `systemd-run --user --unit=quill-tmux-server --collect
      --property=Type=forking tmux new-session -d ...` instead, which asks
      the user manager to spawn tmux itself. A process the user manager
      spawns inherits nothing from Owl, so the server has no flag, and it
      still lives outside `quill-owl.service`'s group. It is still one
      command with no ordering between units. `Type=forking` because
      `tmux new-session -d` starts the server and the client exits; check
      systemd tracks the server as the unit's main process
      (`systemctl --user status quill-tmux-server.service`) and that
      `--collect` does not reap it when the client exits. The check that
      a running server or active unit is not asked for again stays,
      pointed at the service rather than the scope.
      - **Tried on the box on 7 November 2026, from inside a tmux pane
        whose own flag reads 1**, on a throwaway socket
        (`tmux -L quill-probe`) so the shared server was not touched,
        and stopped afterwards with `systemctl --user stop`.
        `Type=forking` held: the client exited 0, systemd took
        `tmux: server` as the main PID, the unit stayed active in its
        own cgroup under `app.slice`, and `--collect` did not reap it.
        The server's `NoNewPrivs` read 0. So the fallback below is not
        needed.

- [ ] **If `Type=forking` will not track the server cleanly, use a unit
      file instead.** A `quill-tmux.service` running `tmux -D` (tmux in
      the foreground, 3.2 and later), installed by `scripts/owl/install.sh`
      beside `quill-owl.service`, which both `quill-owl.service` and
      `quill-sessions.service` `Wants=` and order `After=`. Record under
      Decisions why the one-command shape did not hold.

- [x] **Do the same in `~/.local/bin/quill-sessions`**, which starts the
      server through the same scope when it happens to run first at
      boot. `quill-sessions.service` has no `NoNewPrivileges`, so today
      the flag depends on which of the two wins the race; both must start
      the server the same way. If the script is installed from this
      repository, change it here; if it lives only on the box, say so in
      `scripts/owl/README.md` and give the line to change.
      - **It lives only on the box**: no file of that name is tracked in
        this repository. So it is changed by hand, as on 4 November, and
        the README carries the line.
      - **Changed by hand on the box on 7 November 2026**, with the same
        `start_tmux` as `start-session.sh`, and the old file kept beside
        it as `quill-sessions.before-2026-11-07`.

- [x] **Owl keeps its flag.** `NoNewPrivileges=true` stays in
      `scripts/owl/quill-owl.service`: Owl's process, its watcher and
      anything it runs directly still cannot gain privileges. Only the
      tmux server, and so the sessions people and Claude work in, stop
      inheriting it. A Claude session can then run `sudo`, which asks for
      a password it does not have; that is the box's ordinary position.

## Phase 2: Tests and docs

- [x] **`scripts/tests/owl-start-session.bats`** asserts the
      `systemd-run` call carries `--unit=quill-tmux-server` and
      `Type=forking` and no `--scope`, and keeps the tests that an active
      unit is not asked for again and that a running session starts no
      unit.

- [x] **`scripts/owl/README.md`** says the server is a transient service
      named `quill-tmux-server`, why a scope was not enough, and that
      the server's `NoNewPrivs` should read 0. The check asks systemd for
      the server's process ID,
      `systemctl --user show -p MainPID --value quill-tmux-server.service`,
      because `pgrep -f "tmux: server"` found nothing on the box: `-f`
      matches the command line, which still reads `tmux new-session ...`.

## Phase 3: Restart the server once, by a person

- [x] **From a plain SSH session, not attached to tmux**, after the
      change is merged and installed: `tmux kill-server`,
      `systemctl --user daemon-reload`,
      `systemctl --user restart quill-owl quill-sessions`, then check the
      flag reads 0 and that `sudo -v` asks for a password in a tmux pane.
      This ends every Claude session on the box, so it is Mark's, at a
      quiet moment, and never run from a Claude session.
      - **Done by Mark on 7 November 2026, before the merge**, restarting
        `quill-sessions` first so the already-changed sessions script
        started the server, then `quill-owl`, which joined it. The unit
        was active with `tmux: server` as its main process, all seven
        sessions came back, and both the server's flag and a pane's read
        0. `sudo -v` in a pane asked for a password rather than refusing.

## Decisions

- **A transient service, not a scope** - a scope runs in its caller's
  process and inherits its caller's restrictions; a transient service is
  spawned by the user manager and inherits none. The 4 November choice
  of a scope was made to avoid a separate unit file and its ordering, and
  a transient service keeps both of those.
