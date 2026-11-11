# Stack watch expands the current branch plan

<!-- cspell:ignore numstat xpand resh -->

`just stack-watch` (`just stw`) redraws the stack every minute, with
each pull request's state, and takes single keys: `a` readies every
pull request, `s` syncs, `b` rebases, `f` refreshes, and a number moves
to that branch. It does not say what a branch changes. To review the unit
being worked on, the reviewer leaves the watch for `just stack-files`,
which prints every branch's `--stat` at once, or for the editor's own
compare views, which know nothing about the stack's parents.

This adds an `e` key that expands the branch currently checked out: its
changed files, against its own parent, listed under it in the drawing.
Each line ends with the path of that file's diff, and ctrl-click in VS
Code's terminal opens it. It lands as one branch from `main`, merged on its
own, and reaches the Turva stack in `quillmedical-4` by the next
`just stack-rebase` rather than by amending the stack's first branch.

## Phase 1: List one branch's files in `stack-status.py`

- [x] **Add an `--expand BRANCH` option to `scripts/stack-status.py`.**
      With it, the drawing that `--prs --numbered` already makes gains,
      under *BRANCH* only, one line per file from
      `git diff --name-status <base>..<branch>`: a letter for added,
      modified, deleted or renamed, the path, and the added and removed
      line counts from `--numstat`. `<base>` is the entry's `base` in the
      stack JSON, the parent commit, as `draw_files` already uses, so a
      branch high in the stack shows only the unit it adds rather than
      replaying everything below it. A branch with no changes says
      "no changes", as `draw_files` does. An `--expand` naming a branch
      not in the stack draws nothing extra and exits 0, so the watch
      never fails a redraw over it.

- [x] **Write each file's changes to a diff file the link can open.**
      Clicking can only follow a link, not run a command, so the changes
      have to exist as a file before the line is drawn. Write
      `git diff <base>..<branch> -- <path>` for each file to
      `$(git rev-parse --git-dir)/stack-watch/<branch>/<path>.diff`,
      clearing that branch's folder first so a file the branch no longer
      changes leaves nothing behind. Under the worktree's own git
      directory because it is never committed, needs no cleanup on
      ctrl-c, and is per worktree, so two watches never share one. VS
      Code shows a `.diff` file with its additions and removals coloured,
      which is the view wanted; the side-by-side editor needs a command,
      and is under "Decisions".

- [x] **Make each path a link to its diff file with `Palette.link`.**
      The OSC 8 helper already draws the pull request numbers as links,
      and is already off when stdout is not a terminal or `--no-colour`
      is passed, so piped output stays plain. The URL is `file://` and
      the diff file's absolute path. Do not use `vscode://file/`: over
      Remote SSH it names a path on the local machine, not the box.

- [x] **Test it in `scripts/tests/stack-status.bats`**, calling the
      new functions directly as the existing tests do, in a throwaway
      repository whose branch adds, changes, deletes and renames a file
      (the rename with spaces in both names): the expanded branch lists
      its files with their letters and counts; only that branch is
      expanded; a branch's files are measured against its parent, not
      the trunk; a branch with no changes says so; each diff file is
      written and holds that file's change; a stale diff file is
      removed; and with no colour the path has no escape sequence in it.
      The unknown branch drawing nothing is in `main()`, which reads
      `gh stack view` and so has no bats test, like the rest of
      `main()`; it is a loop that finds no match.

## Phase 2: The `e` key in `just stack-watch`

- [x] **Add `e` to the keys `stack-watch` reads, in the `Justfile`.**
      An `expanded` flag, off at the start, flips on each `e` and redraws
      at once, as `f` does. While it is on, the fetch at the top of the
      loop passes `--expand "$(git branch --show-current)"`, read afresh
      each time, so moving branch with a number moves the expansion with
      it. Add `e|E` to the `case` that ends the key wait, beside
      `a|A|s|S|[1-9]|b|B|f|F`. The option is held in an array passed as
      `${expand[@]+"${expand[@]}"}`, because a bare `"${expand[@]}"` of
      an empty array stops a Mac's bash 3.2 under the recipes' `set -u`.

- [x] **Add `e` to the key line**, with the `e` in bold bright blue as
      the others are: `${k}e${n}xpand`, between `re${k}f${n}resh` and
      `${k}ctrl-c${n}`. It stays `expand` while expanded, rather than
      turning into "collapse", whose key letters would clash with `a`
      and `s`; the file list on screen shows the state. Keep the line
      inside the
      `cspell:disable` block, since splitting a word at its key letter
      reads to the spelling check as fragments.

- [x] **Say what `e` does in the recipe's comment**, where it lists the
      other keys (`a is stack-ready, s is stack-sync ...`), and in the
      recipe's one-line description above it, which `just --list` shows.

## Phase 3: Document it, and try it where it is used

- [x] **Add the `e` key to `docs/docs/cicd/stacked-branches.md`**, in
      the paragraph of "The life of a stack" that describes
      `stack-log-long` and `stack-files`: one sentence on what it
      expands, that it measures against the parent, and that ctrl-click
      opens a file's changes.

- [x] **Try it by hand in VS Code's terminal, locally and over Remote
      SSH to the dev box**, since the link is the part no test sees. A
      ctrl-click should open the `.diff` file in the editor in both. If
      Remote SSH does not open a `file://` link, record what it does here
      and fall back to printing the diff file's path plain, which VS Code
      makes clickable by itself.
      - **Over Remote SSH, on 10 November 2026, the `file://` link
        failed** with "url not found", from a window on either worktree.
        VS Code opens a `file://` link on the machine in front of you,
        and the diff is on the dev box. Not tried locally, since the work
        is done on the box.

- [x] **Print each diff's path plain, and keep it short**, as the step
      above falls back to. `expanded_lines` drops the OSC 8 link and ends
      each line with the diff's path, which VS Code's terminal finds by
      itself and opens on the machine the terminal runs on. `Palette.link`
      stays for the pull request numbers, which are web addresses. A path
      printed in full has to be short to read, so `write_diffs` moves the
      files from the git directory to
      `~/.cache/stack-watch/<worktree>/<n>-<file name>.diff`: one folder
      per worktree, numbered for the file's place in the list so two
      files of one name stay apart, and the branch left out because one
      branch is expanded at a time. In the home folder rather than
      `/tmp`, so nobody else on the machine can read the diffs. The bats
      tests point `HOME` at their own folder and check the path is plain
      with colour on or off.

- [ ] **Ctrl-click a plain path in `just stw` over Remote SSH**, and
      record here that it opens the diff. A plain path typed with `echo`
      and then `find` was the test before the change; the watch's own
      line is the one that matters.

## Phase 4: Land it, then bring it into the Turva stack

- [x] **Build it in a worktree level with `origin/main`** (`just wc`),
      not in `quillmedical-4`, whose stack must not be pushed until the
      Turva team sign off. Put it up with `/crpd` as its own pull request.

- [ ] **Once it has merged, run `just stack-rebase` in
      `quillmedical-4`.** The recipe then reaches the Turva stack through
      `main`, the way the offline fix (#2430) did on 10 November 2026,
      and only one copy ever exists. Do not add it to the stack's first
      branch: that means amending the bottom of a 41-branch stack and
      replaying every branch above it, the riskiest edit a stack has.

## Decisions

- **A link to a `.diff` file, not the side-by-side diff** - a terminal
  can follow a link on a click but cannot run a command, and VS Code's
  side-by-side view (`code --diff`) needs one. A key per file could run
  it, but the files would need letters that do not clash with `a`, `s`,
  `b`, `f` and `e`, and `code` is on the path only inside VS Code's own
  terminal, not in a tmux session elsewhere. The coloured patch is the
  same change, and needs nothing but the terminal. The key per file can
  be added later beside the paths if the patch view proves too plain.

- **A plain path, not a `vscode://vscode-remote/ssh-remote+<host>/…`
  link** - a remote link would keep the short label, but it needs the
  host as the local VS Code names it, kept in a setting, and it breaks
  when the watch is not run over Remote SSH. A plain path works in both.

- **The current branch only, not every branch** - `just stack-files`
  already prints every branch's summary. The watch is for the unit in
  hand, and one branch's files keep the drawing short enough to stay on
  one screen above a tall stack.
