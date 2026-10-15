# Review marks

A small VS Code extension that shows, in the editor, which code has been
audited and what has changed since.

Code reaches `main` through its author and the automated checks. The
audit is a third pair of eyes after those two: somebody reads a file as
it stands, and stamps it. The stamp records the file, the exact version,
the date and who audited it, so an edit made afterwards shows up as a
change still to be looked at, and never hides behind an old tick.

This is the picture that goes with `scripts/review-ledger.py`. The script
keeps the audit card and answers in the terminal (`just r`, `just rs`,
`just rd`). This draws the same answers where the code is.

## What it shows

- **A green tick** beside a file that has been audited, in the explorer
  and on its tab. A folder gets one when every file in it is audited.
- **An orange mark** beside a file that has changed since its audit, and
  beside any folder holding one.
- **A grey bar** in the margin, left of the line numbers, beside each
  line that is new or changed since the file was stamped. A dashed line
  marks where lines were taken out. Both show in the scrollbar too.
- **A word in the status bar** for the open file: Audited, Changed since
  audit, or Not audited.
- **Who audited it.** Hover over a tick, a mark or the status bar word
  to see who stamped the file and when. More than one person may stamp
  the same file.

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
after changing `extension.ts` or `package.json`.

## How it works

It keeps no record of its own. Every answer comes from
`python3 scripts/review-ledger.py states`, run in the folder that is
open, so the editor and the recipes cannot disagree. A window on a branch
without that script shows no marks.

The bars come from `git diff -U0` between the version that was stamped,
which git still holds, and the file on disk. So they follow the saved
file: a bar appears on save, not while typing.

The card itself is `audit/ledger.tsv`, a tracked file: see
`audit/README.md`. A stamp made here is a change to that file, to be
committed and merged like any other, and git's history is the record of
who added it. The script refuses to write a card it cannot fully read.

## Where this is going

The card is an audit trail a clinical safety assessor could use: who
looked at which version of which file, and when. Anybody working on
Quill may audit, their own code included.

## Tests

`scripts/tests/review-marks.bats` tests the two parts with no editor in
them: reading the ledger's output into marks for files and folders, and
reading a diff into the lines to mark. The drawing is checked by eye.
