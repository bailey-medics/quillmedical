# The audit ledger

Code reaches `main` through its author and the automated checks. The
audit is a third pair of eyes after those two: somebody reads a file as
it stands, and stamps it. The audit ledger is the record of those
stamps: which code has been audited, by whom, and at exactly which
version.

This page says how it works and how to use it well. The short version
for somebody about to stamp their first file is under
[Good practice](#good-practice).

## What a stamp is

A stamp is one line in `audit/ledger.tsv`. It holds:

- **The file's path**, from the root of the repository.
- **A fingerprint of the file's contents**, the forty characters git
  gives any file (`git hash-object`).
- **The date** it was stamped.
- **The auditor's name and email**, as git has them on their machine.

The fingerprint is what makes a stamp worth having. A tick in a list
says "somebody looked at this file once". A fingerprint says "somebody
looked at this version". Change one character and the file no longer
matches, so the stamp stops counting, without anybody having to
remember to take it off.

## The three states

Every file the ledger covers is in one of three states.

- **Audited** - a stamp matches the file as it is now.
- **Changed** - the file was stamped, and has been edited since. What
  needs looking at is the change, not the whole file again.
- **Unaudited** - no stamp.

Several people may stamp the same file, each on a line of their own.
A file counts as audited when anybody's stamp matches it.

## Stamping

From the terminal, in any worktree:

```bash
just r backend/app/deps.py    # stamp a file, or every file in a folder
just rs                       # how much is audited, in two lines
just rs f                     # the same, with changed files and each folder
just rs backend/app           # one folder, file by file, with who audited each
just rd backend/app/deps.py   # what changed since the stamp
just ur backend/app/deps.py   # take your own stamp off
```

Or in VS Code, with the extension in `tools/review-marks/`
(`just review-marks-install`, then reload the window):

- **A green tick** on an audited file, and on a folder that is audited
  all through.
- **An orange mark** on a changed file, and on any folder holding one.
- **A grey bar** in the margin beside each line that is new or changed
  since the stamp.
- **A word in the status bar** for the open file. Click it to stamp
  the file, to see the change side by side, or to take the stamp off.
- **Hover** over any of these to see who stamped the file and when.

The editor keeps no record of its own. It asks the same script the
recipes use, so the two cannot disagree.

## How a stamp reaches everybody

The ledger is a tracked file, so a stamp is a change like any other.

1. You stamp. `audit/ledger.tsv` changes in your worktree, and shows in
   `git status`. Your editor shows the tick at once.
2. You commit it on a branch and open a pull request.
3. When that merges, the stamp counts for everybody.

A stamp made in one worktree does not appear in another until it has
merged. That is the cost of keeping the ledger in git, and what it buys
is worth it: git's history shows who added each stamp, and a damaged
ledger can be got back.

Two people stamping on two branches do not conflict. `.gitattributes`
tells git to merge the ledger by keeping both sides' lines.

## Good practice

- **Stamp a file when it has no uncommitted edits.** A stamp records
  the file as it is on your disk. If it is then edited before it is
  committed, the version you audited was never kept by git, and nobody
  else can see what you looked at. The stamp does no harm, as the file
  simply reads as changed, but the audit is lost.
- **Stamp only what you have read.** A folder is quick to stamp in one
  go, and it stamps every file in it. Stamp a test file because you
  read the test, not because you read the code beside it.
- **For a changed file, read the change and then stamp.** `just rd
  <path>`, or the grey bars, show exactly what is new since the last
  audit. That is the whole of what needs reading. Stamping without
  looking defeats the point of the fingerprint.
- **Land stamps in batches.** Audit through a session, then commit the
  ledger once and open one small pull request, such as "Audit: 12
  files". A pull request for each stamp is noise.
- **Never edit `ledger.tsv` by hand.** The recipes write it. A line
  typed in looks the same as a stamp and means nothing.
- **Keep your worktree up to date before stamping.** An old copy of the
  script may not understand a newer ledger. It will stop and say so,
  changing nothing; bring the worktree up to date with `main` and try
  again.
- **You may audit your own code.** The audit is a third look at the
  code as it stands, after writing it and after the checks. Whoever
  wrote a file may stamp it.
- **When in doubt, leave it unstamped.** An unaudited file costs one
  read later. A wrong stamp says something that is not true.

## What the ledger covers

Code and tests. These are left off, because there is nothing in them
to audit as code:

- **Prose** - Markdown, and everything under `docs/`.
- **Pictures, sounds and lock files.**
- **Generated files** - anything a script writes, such as
  `frontend/src/generated/`.
- **Merged migrations** in `backend/alembic/versions/`. They have
  already run and are never changed; a new one is read when it is
  written, and `check_migrations.py` runs over every one.
- **`api-compatibility/`** - decision files that are frozen once merged.
- **`.vscode/`** and the `audit/` folder itself.

`scripts/audit-stamp.py` holds the list.

## What CI checks, and what it cannot

The `Audit ledger` job runs `python3 scripts/audit-stamp.py verify`
on every push. It fails on a line that is not a stamp:

- a file the ledger does not cover, or that the branch has never held
- a stamp with no name
- a date that is not a date
- a fingerprint that is not forty characters of hexadecimal

It prints, and does not fail, a stamp on a version that was never
committed. See the first point under [Good practice](#good-practice).

It cannot tell a real audit from a line somebody typed in with the
right fingerprint, and it does not pretend to. Nothing in a check
could. What stands behind a stamp is git's history, which says who
added the line and in which pull request.

## Where the grey bars come from

When you stamp a file, the script also asks git to keep a copy of it,
filed under its fingerprint. The bars are the difference between that
copy and the file on disk now.

- For a file stamped at a **committed** version, git has that copy for
  good, and so does everybody else.
- For a file stamped **mid-edit**, the copy is only in your own git
  store. It is never pushed, and git clears such copies after about two
  weeks. After that the script says git no longer holds the file as it
  was, and the file wants reading whole.

That is the practical reason behind stamping only files with no
uncommitted edits.

## When something looks wrong

- **A file I stamped shows no tick.** Reload the VS Code window. If the
  extension is older than the script, run `just review-marks-install`
  and reload again.
- **A tick I made is missing in another worktree.** It has not merged
  yet. Stamps travel with their branch.
- **"Line N is not one this version of audit-stamp.py can read."**
  Your worktree is behind `main`. Nothing was changed. Update it and
  try again.
- **"Git no longer holds this file as it was."** The file was stamped
  mid-edit and git has since cleared its copy. Read the whole file and
  stamp it again.
- **The ledger looks damaged.** Do not repair it by hand. `git log -p
  audit/ledger.tsv` shows every change to it, and `git checkout
  <commit> -- audit/ledger.tsv` brings an earlier one back.

## Where the pieces are

- **`audit/ledger.tsv`** - the ledger.
- **`audit/README.md`** - a short account beside it.
- **`scripts/audit-stamp.py`** - the script that reads and writes it.
- **`scripts/tests/audit-stamp.bats`** - its tests.
- **`tools/review-marks/`** - the VS Code extension.
- **The `r`, `rs`, `rd` and `ur` recipes** in the `Justfile`.
