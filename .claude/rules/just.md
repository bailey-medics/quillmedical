---
paths:
  - "Justfile"
---

# Justfile conventions

- Keep recipe blocks in alphabetical order by recipe name. Private recipes
  (those starting `_`) come first, in the same order, after the settings and
  shared variables at the top.
- Use two blank lines between recipe blocks for readability.
- Keep each alias immediately above its recipe comment and recipe body.
- Put a blank line above every comment, inside a recipe as well as above
  one. The one exception is the comment directly under an `alias` line. Only
  the first line of a multi-line comment needs the gap.
- Inside a recipe, put a blank line before and after each `if`, `case`, `for`
  and `while` block, and after a run of variable assignments, so setup,
  checks and the work itself read as separate groups.
- When a recipe that already takes one positional argument needs a second,
  tell them apart by value, not by position, so the old form keeps working:
  `just sa b`, `just sa ldd` and `just sa ldd b` all do what they say.
  Sort them in a script beside its bats test, as `scripts/start-app-args.sh`
  does, rather than inline, so the sorting can be tested.
