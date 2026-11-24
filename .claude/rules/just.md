---
paths:
  - "Justfile"
---

# Quill's additions to the justfile rule

These add to the shared `just.md` rule in Mark's mark-house-style
repository, which sets the layout of every recipe. Read the two together.

- **Quill's arguments told apart by value**: `just sa b`, `just sa ldd`
  and `just sa ldd b` all do what they say. Sort them in a script beside
  its bats test, as `scripts/start-app-args.sh` does, rather than inline,
  so the sorting can be tested.
