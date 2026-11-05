# tmux

Long jobs on the dev box run inside tmux, not in a VS Code terminal. A
VS Code terminal dies when its window disconnects; a tmux session keeps
running, and you attach to it again from wherever you are.

Two recipes take you into tmux for the worktree you are standing in:

- **`just c`** - the `q` session (`q1`, `q2` and so on) running Claude
  Code. It starts the session when it is missing, starts Claude again
  when it has exited, and attaches or switches to it.
- **`just tw`** - the `t` session (`t1`, `t2` and so on), a plain shell
  that runs nothing itself. `just tw 2` gives a second one, `t1-2`.

## The tmux config

tmux reads `~/.tmux.conf` when its server starts. It lives outside the
repository, so each developer keeps their own. This is the one the dev
box uses, if you want the same behaviour:

```tmux
set -g mouse on
set -g history-limit 50000

# Copy on mouse release, and keep the selection on screen
bind -T copy-mode    MouseDragEnd1Pane send -X copy-pipe-no-clear
bind -T copy-mode-vi MouseDragEnd1Pane send -X copy-pipe-no-clear

# Name the terminal tab after the session: "Claude Q3" for the q
# sessions, "Tmux T3" for the plain shells `just tw` opens
set -g set-titles on
set -g set-titles-string "#{?#{m:t*,#{session_name}},Tmux #{s/^t/T/:session_name},Claude #{s/^q/Q/:session_name}}"

# In copy mode, a key with no copy-mode job leaves copy mode and is typed
# at the prompt, so there is no need to press q first
bind -T copy-mode Any send -X cancel \; send-keys

# Free the plain keys copy mode claims, so they reach the prompt too
unbind -T copy-mode Space
unbind -T copy-mode ,
unbind -T copy-mode \;
unbind -T copy-mode F
unbind -T copy-mode N
unbind -T copy-mode P
unbind -T copy-mode R
unbind -T copy-mode T
unbind -T copy-mode X
unbind -T copy-mode f
unbind -T copy-mode g
unbind -T copy-mode n
unbind -T copy-mode q
unbind -T copy-mode r
unbind -T copy-mode t
```

To load a change without restarting anything:

```bash
tmux source ~/.tmux.conf
```

Key bindings belong to the tmux server, not to a session, so one reload
reaches every session at once.

## What each part does

- **Mouse and history** - the mouse wheel scrolls back through output,
  and tmux keeps the last 50,000 lines of it.

- **Copy on release** - dragging over text copies it when you let go of
  the mouse button, and the text stays highlighted.

- **Tab titles** - the terminal tab says which session it is showing,
  so a Claude session and a plain shell are told apart at a glance.

- **Type straight out of copy mode** - scrolling up or selecting text
  puts tmux into copy mode, where keys normally move around the history
  rather than reaching the prompt. With these lines, any ordinary key
  leaves copy mode and is typed at the prompt as well. The binding is on
  tmux's `Any` key, which fires for every key with no more specific
  binding in copy mode, and `send-keys` with no keys sends on the key
  that was pressed.

## What the last part costs

Copy mode's single-letter shortcuts are given up so that the letters
reach the prompt: `n` and `N` for the next and previous search match,
`f`, `F`, `t` and `T` for jumping to a character, `g` for going to a
line, `q` for quitting and Space for starting a keyboard selection.

What still works in copy mode:

- **Scrolling** - the mouse wheel, the arrow keys, Page Up, Page Down,
  Home and End.
- **Leaving without typing** - Escape.
- **The Ctrl and Alt shortcuts** - searching with Ctrl+r and Ctrl+s,
  for example, is unchanged.

The lines are written for the emacs-style copy-mode keys, which are
tmux's default. If your `mode-keys` is set to `vi`, the table is
`copy-mode-vi` and the keys it claims are different: run
`tmux list-keys -T copy-mode-vi` to see them.

## Selecting without tmux

Holding Shift while dragging hands the selection to the terminal itself,
and tmux never enters copy mode. It works with no config at all, but a
selection can then run across split panes.
