# Review marks

A small VS Code extension that shows, in the editor, which code has been
stamped as read and what has changed since.

It is the picture that goes with `scripts/review-ledger.py`. The script
keeps the card and answers in the terminal (`just r`, `just rs`,
`just rd`). This draws the same answers where the code is.

## What it shows

- **A green tick** beside a file that has been read, in the explorer and
  on its tab. A folder gets one when every file in it is read.
- **An orange mark** beside a file that has changed since it was read,
  and beside any folder holding one.
- **A grey bar** in the margin, left of the line numbers, beside each
  line that is new or changed since the file was stamped. A dashed line
  marks where lines were taken out. Both show in the scrollbar too.
- **A word in the status bar** for the open file: Read, Changed since
  read, or Unread.
- **Who read it.** Hover over a tick, a mark or the status bar word to
  see who stamped the file and when. More than one person may stamp the
  same file.

Nothing is shown for a file that has never been stamped.

## What it does

- **Click the status bar word** to stamp the open file, to see what
  changed side by side, or to take the stamp off.
- **Right-click a file or folder** in the explorer for the same.
- A stamp saves the file first, so unsaved edits are never missed.

The marks update on their own when a file is stamped or saved.

## Installing

```bash
just review-marks-install
```

Then run "Developer: Reload Window" in each VS Code window. Run it again
after changing `extension.js` or `package.json`.

## How it works

It keeps no record of its own. Every answer comes from
`python3 scripts/review-ledger.py states`, run in the folder that is
open, so the editor and the recipes cannot disagree. A window on a branch
without that script shows no marks.

The bars come from `git diff -U0` between the version that was stamped,
which git still holds, and the file on disk. So they follow the saved
file: a bar appears on save, not while typing.

The card itself, `review-ledger.tsv`, is in the `local/` folder and is
never in the repository. See `CLAUDE.md` for `local/`.

## Tests

`scripts/tests/review-marks.bats` tests the two parts with no editor in
them: reading the ledger's output into marks for files and folders, and
reading a diff into the lines to mark. The drawing is checked by eye.
