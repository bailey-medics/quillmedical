# VS Code tunnel plan

The [remote dev machine plan](2026-10-19-remote-dev-machine-plan.md) gives the
phone two ways onto `devbox`: Claude's Remote Control, which shows one Claude
session and nothing else, and an SSH app over Tailscale as the fallback.
Neither one is the editor. Running a command, reading its output, opening a
file next to the terminal it came from: all of that waits until the laptop is
open, or gets asked of Claude instead. Mark wants the whole VS Code experience
when away from the desk. He accepts that a phone screen is cramped, and plugs
the phone into a large screen when it really matters.

The outcome is VS Code in the phone's browser at `vscode.dev`, reaching the
box through a VS Code tunnel. It has the file tree, the editor and the
integrated terminal, with the same worktrees and tmux sessions that
Remote-SSH from the laptop reaches. An SSH app over Tailscale was the other
choice and is still the fallback. It gives a terminal only, not the editor.

## Phase 1: Install and sign in

- [x] Install the standalone VS Code CLI into `~/.local/bin`, without `sudo`, as Terraform and the AWS CLI were. The `code` in a Remote-SSH terminal is only a helper for that window, and `~/.vscode-server/` holds servers, not a CLI that can run a tunnel. Checked on 31 October 2026: `which -a code` found nothing on the box's own path. The box is `x86_64`, so the build is `cli-alpine-x64`, a static binary that runs on Ubuntu too: `curl -L 'https://code.visualstudio.com/sha/download?build=stable&os=cli-alpine-x64' -o ~/vscode_cli.tar.gz`, then `tar -xzf ~/vscode_cli.tar.gz -C ~/.local/bin` and remove the tarball. Claude Code's safety check had refused a tarball install into the home folder for the Google Cloud CLI on 26 October 2026, but allowed this one on 31 October 2026, unpacked through a fresh temporary folder: VS Code CLI 1.144.0.

- [x] Run `code tunnel --accept-server-license-terms --name devbox` once, from a plain terminal or a tmux pane, and sign in with GitHub. The box has no browser, so the CLI prints a device link and a code to open on the laptop or the phone, the same flow as `gh` and `just gl`. Use the GitHub account that owns the tailnet, so one identity guards both ways in. Press Ctrl+C once the CLI says the tunnel is ready. Mark entered the code himself, since it proves the account is his; Claude ran the CLI. Done on 31 October 2026, in a tmux session started for it: the CLI reported `Creating tunnel with the name: devbox`, and the session was then stopped for the service to take over.

- [x] Run `code tunnel service install` so the tunnel runs as a systemd user service and comes back at boot with nobody logged in. Linger is already on for `markbailey` from Phase 2 of the remote dev machine plan, so a user service is enough and nothing goes under `/etc`. Check it with `systemctl --user status code-tunnel` or `code tunnel status`, and read its log with `code tunnel service log`. Done on 31 October 2026: the unit is `code-tunnel.service`, enabled and running, and `code tunnel status` reports `Connected`. Whether it comes back after a reboot has not been tried yet.

## Phase 2: Use it from the phone

- [x] Open `https://vscode.dev/tunnel/devbox` on the iPhone and sign in with the same GitHub account. Use File, Open Folder for a worktree under `~/github/`. Check that the integrated terminal opens a shell on the box and that `just c` attaches to that worktree's tmux session. The phone does not need Tailscale for this, because the tunnel goes out through Microsoft's relay. Connected from the iPhone on 31 October 2026. The tunnel runs its own copy of the VS Code server under `~/.vscode/cli/servers/`, beside the Remote-SSH ones in `~/.vscode-server/cli/servers/`, at the same build (`2c33b50b`). Whether the terminal and `just c` work from the phone is still to be confirmed.

- [ ] Install the Claude Code extension into the tunnel's remote if it is missing. An extension installed through Remote-SSH may not show up in a tunnel window. Record whether it carried over, so the next rebuild knows.

- [ ] Keep long jobs in tmux, not in the tunnel's integrated terminal. A browser tab on a phone gets dropped when the screen locks or Safari reclaims memory, and a terminal started there dies with it, the same as a VS Code terminal over Remote-SSH (the tmux step of the remote dev machine plan). `just c` from the integrated terminal is the way in to Claude, and the next step gives a shell of its own.

- [x] Add `just tmux-window` (alias `tw`), which takes the terminal to a plain shell in tmux for this worktree, so a command run from the phone, such as `just sb`, outlives the browser tab. Once there, any command can be run, and `just tw` again comes back to it. Mark asked for it to start tmux and nothing more, rather than taking a recipe to run, so it runs nothing itself. Each worktree gets its own session, `t1` for `~/github/quillmedical` and `t2` to `t5` for `quillmedical-2` to `-5`, matching `just c`'s `q1` to `q5`. It is created in the worktree's folder when missing, attached from outside tmux, and switched to from inside it, so tmux never nests. A separate session rather than a second window in `q1` to `q5` was chosen for two reasons. `just c` keeps landing straight on Claude. And the alert watcher types into `tmux send-keys -t q5` (`scripts/alert-watcher/src/session.ts`), which means whichever window in `q5` is active, so a shell window left active there would receive `/clear` and `/alert` meant for Claude. A session of its own is outside that target, so worktree 5 needs no refusal. The script goes in `scripts/tmux-window.sh`, with bats tests under `scripts/tests/`, the way `just c` was built in `scripts/claude-session.sh`. The worktree-to-name mapping is the same in both. It was copied rather than shared, with a comment naming `claude-session.sh`, because no script in `scripts/` sources a shared helper and six lines did not earn the first one. Built through `/f` on 31 October 2026: `scripts/tmux-window.sh`, ten tests in `scripts/tests/tmux-window.bats`, and the recipe beside `test-shell-scripts` in the `Justfile`. `just ts scripts/tests` ran all 307 tests, which passed.

- [x] Let `just tw` and `just c` work in worktrees past 5. On 1 November 2026 `just tw` refused `quillmedical-6`, because both `scripts/tmux-window.sh` and `scripts/claude-session.sh` matched only `quillmedical-[2-5]`. Both now take any number from 2 to 99, so `quillmedical-6` gets `t6` and `q6`. The boot service still starts only `q1` to `q5`; `just c` starts a later one when it is first asked for. A test in each bats file covers worktrees 6 and 12. `just ts scripts/tests` ran all 340 tests: none failed and 26 were skipped. At the same time the tab title in `~/.tmux.conf`, outside the repository, which named every session "Claude", was made to read "Tmux T6" for the `t` sessions and keep "Claude Q6" for the `q` ones.

- [x] Let `just tw` take a number for a second shell in the same worktree. `just tw 2` in `quillmedical-6` starts or reaches `t6-2`, beside `t6`, in the same way, and `just tw` with no number is unchanged. Mark asked for it on 1 November 2026, preferring a session of its own to a second window in `t6`. The number runs from 2 to 99, and anything else is refused before tmux is asked, so the name is never built from free text. It still runs nothing in the shell: the number picks which shell, not what runs there. The tab reads "Tmux T6-2" with no change to `~/.tmux.conf`, since the name still starts with `t`. Four tests in `scripts/tests/tmux-window.bats`; `just ts scripts/tests` ran all 344: none failed.

- [ ] Point the alert watcher at `q5`'s first window, not at whichever window is active, so a window opened there by hand cannot catch an alert's keystrokes. Found on 31 October 2026 while planning the step above. It is a change in `scripts/alert-watcher/`, so it is a pull request of its own, not part of this plan's work.

- [ ] Open the dev app at `http://devbox` in a second tab with the Tailscale app on, rather than through the tunnel's port forwarding. The tunnel's forwarded ports go through a public `devtunnels.ms` address, and the dev stack is kept off everything except the tailnet on purpose.

- [ ] Try it with the phone plugged into a large screen and a keyboard, the use Mark named, and note anything that does not work there: keyboard shortcuts the browser takes for itself, and whether the layout uses the whole screen.

## Phase 3: Record it

- [x] Add a line about the tunnel to the remote dev machine plan's Phase 3, linking here, so somebody rebuilding the box from that plan finds the tunnel too.

## Decisions

- **A VS Code tunnel, not code-server on the tailnet** - code-server would keep every way in behind Tailscale. But it is not Microsoft's build, it installs from Open VSX rather than the Visual Studio Marketplace, and it is one more server to keep patched. A tunnel is Microsoft's own VS Code, the same as the laptop's, updated by the CLI, so it gives the "VS Code experience" Mark asked for.

- **It is a second way in that does not go through Tailscale, and that is accepted** - the tunnel opens no port on the home router: the box connects out to Microsoft's relay. But anyone signed in to vscode.dev as the GitHub account reaches the box. Tailscale SSH already trusts that same identity, with its two-factor, so the guard is no weaker. There is one more door, though, and Microsoft's relay is now in the path. `code tunnel service uninstall` closes it.

- **The SSH app stays as the fallback** - it needs only Tailscale and a terminal, so it still works when GitHub or Microsoft's relay is down. The tunnel depends on both.
