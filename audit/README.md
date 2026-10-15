# Audit ledger

`ledger.tsv` is the record of which code has been audited, by whom, and
at which version. The full account, with good practice, is in
`docs/docs/conventions/audit-ledger.md`.

Code reaches `main` through its author and the automated checks. The
audit is a third pair of eyes after those two: somebody reads a file as
it stands and stamps it. Anybody working on Quill may audit, and may
audit code they wrote themselves.

## What a stamp says

One line a stamp, with tabs between: the file's path, the fingerprint
git gives its contents (`git hash-object`), the date, and the auditor's
name and email as git has them.

The fingerprint is the point. A file edited after its audit no longer
matches, so it shows as changed and not as audited, and what has to be
looked at is the change.

A file has one stamp. Stamping it again, whoever does it, replaces the
stamp that was there. The earlier ones are in git's history.

## Stamping

```bash
just r backend/app/deps.py    # stamp a file, or a folder, as audited by you
just rs                       # how much is audited
just rs backend/app           # one folder, file by file, with who audited each
just rd backend/app/deps.py   # what changed since the stamp
just ur backend/app/deps.py   # take the stamp off
```

Or in the editor, with the extension in `tools/review-marks/`: a tick on
an audited file, a mark on a changed one, and a click to stamp.

Never edit `ledger.tsv` by hand. The scripts write it.

CI runs `python3 scripts/audit-stamp.py verify` on every push, as the
`Audit ledger` job. It fails on a line that is not a stamp: a file the
card does not cover or the branch never held, a missing name, a date or
a fingerprint that is not one. It cannot tell a real audit from a line
typed in with the right fingerprint, and does not pretend to: git's
history says who added each line.

## How a stamp reaches everybody

The ledger is a tracked file, so a stamp is a change like any other. It
shows in the worktree it was made in, is committed on a branch, and
counts for everybody once that branch merges. Stamp through a session,
then land the lot as one small pull request.

Git's history is the proof of who added each stamp, and the way back
from a mistake. `.gitattributes` merges this file by keeping both sides'
lines, so two people stamping at once do not conflict.

## Two stamps on one file

Where two branches both stamped the same file, that merge leaves two
lines for it. Nothing stops the merge. The check that follows does:

```bash
python3 scripts/audit-stamp.py check
```

It runs in the pre-commit hooks, and so in CI and in the merge queue,
and names each file with more than one stamp. Audit the file as it is
now and stamp it again with `just r`, which leaves one stamp, or take
the stamp off with `just ur`.

## What is on the card

Code and tests. Prose, pictures, lock files, generated files, merged
migrations and the frozen `api-compatibility/` decisions are left off:
`scripts/audit-stamp.py` holds the list and the reasons.
