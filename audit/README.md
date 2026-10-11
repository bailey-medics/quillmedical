# Audit ledger

`ledger.tsv` is the record of which code has been audited, by whom, and
at which version.

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
looked at is the change. Several people may stamp the same file, each on
a line of their own.

## Stamping

```bash
just r backend/app/deps.py    # stamp a file, or a folder, as audited by you
just rs                       # how much is audited
just rs backend/app           # one folder, file by file, with who audited each
just rd backend/app/deps.py   # what changed since the stamp
just ur backend/app/deps.py   # take your own stamp off
```

Or in the editor, with the extension in `tools/review-marks/`: a tick on
an audited file, a mark on a changed one, and a click to stamp.

Never edit `ledger.tsv` by hand. The scripts write it.

CI runs `python3 scripts/review-ledger.py verify` on every push, as the
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

## What is on the card

Code and tests. Prose, pictures, lock files, generated files, merged
migrations and the frozen `api-compatibility/` decisions are left off:
`scripts/review-ledger.py` holds the list and the reasons.
