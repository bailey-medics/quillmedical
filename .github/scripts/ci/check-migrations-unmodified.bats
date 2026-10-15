#!/usr/bin/env bats
# Tests for check-migrations-unmodified.sh
#
# Unlike the other suites here, these build a real throwaway git repo per test
# rather than stubbing the git call. The whole behaviour IS what git reports
# for a given kind of change, so stubbing it would test the stub: whether a
# rename shows as R100, whether a comment-only edit shows as M at all, and
# whether an added file is correctly excluded are exactly the questions worth
# answering.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/check-migrations-unmodified.sh"

  REPO="${BATS_TEST_TMPDIR}/repo"
  mkdir -p "$REPO/backend/alembic/versions"
  cd "$REPO" || return 1
  git init -q -b main .
  git config user.email "t@example.invalid"
  git config user.name "t"

  cat > backend/alembic/versions/0001_first.py <<'EOF'
"""First."""
revision = "0001"


def upgrade() -> None:
    # migration-check: allow-destructive
    # Superseded by the audit table.
    op.drop_column("users", "old")
EOF

  git add -A && git commit -q -m "merged migration"
  git branch -q main-ref
  git checkout -q -b feature
}

@test "a PR that adds a new migration passes" {
  cat > backend/alembic/versions/0002_second.py <<'EOF'
"""Second."""
revision = "0002"
EOF

  git add -A && git commit -q -m "add"

  run main main-ref

  [ "$status" -eq 0 ]
  [[ "$output" == *"No merged migration was modified"* ]]
}

@test "a PR touching no migrations passes" {
  echo "unrelated" > README.md

  git add -A && git commit -q -m "docs"

  run main main-ref

  [ "$status" -eq 0 ]
}

@test "rewriting a merged migration's DDL fails" {
  sed -i.bak 's/"old"/"other"/' backend/alembic/versions/0001_first.py
  rm -f backend/alembic/versions/*.bak
  git add -A && git commit -q -m "edit"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"0001_first.py"* ]]
  [[ "$output" == *"its code changed"* ]]
}

@test "editing a merged migration's docstring fails" {
  # The docstring is part of the AST, and check_migrations.py validates it as
  # the migration's description - so it is code for this purpose, not prose.
  sed -i.bak 's/"""First."""/"""First, restated."""/' \
    backend/alembic/versions/0001_first.py
  rm -f backend/alembic/versions/*.bak
  git add -A && git commit -q -m "reword the docstring"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"its code changed"* ]]
}

@test "deleting a merged migration fails" {
  git rm -q backend/alembic/versions/0001_first.py
  git commit -q -m "delete"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"deleted: backend/alembic/versions/0001_first.py"* ]]
}

@test "renaming a merged migration fails" {
  # The filename carries the revision id and ordering, so a rename rewrites
  # the record as surely as an edit does.
  git mv backend/alembic/versions/0001_first.py backend/alembic/versions/0001_renamed.py
  git commit -q -m "rename"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"backend/alembic/versions/0001_first.py"* ]]
}

@test "rewording a marker's rationale passes" {
  # Matches the api-compatibility rule, where `reason` stays editable after
  # merge while the decision itself is frozen. A rationale that reads badly
  # can be fixed in place rather than needing a no-op migration.
  sed -i.bak 's/Superseded by the audit table./Superseded by the audit table in 0002./' \
    backend/alembic/versions/0001_first.py
  rm -f backend/alembic/versions/*.bak
  git add -A && git commit -q -m "clarify the rationale"

  run main main-ref

  [ "$status" -eq 0 ]
  [[ "$output" == *"Comments only, allowed"* ]]
}

@test "adding a comment to a merged migration passes" {
  echo '# A later note.' >> backend/alembic/versions/0001_first.py
  git add -A && git commit -q -m "annotate"

  run main main-ref

  [ "$status" -eq 0 ]
}

@test "removing the allow-destructive marker fails" {
  # The marker is a comment, so nothing but the marker vector distinguishes
  # this from the allowed case above. Stripping it from an approved migration
  # must not be quietly possible.
  sed -i.bak '/allow-destructive/d' backend/alembic/versions/0001_first.py
  rm -f backend/alembic/versions/*.bak
  git add -A && git commit -q -m "strip the marker"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"marker was added or removed"* ]]
}

@test "shortening the marker fails, since it no longer reads as the marker" {
  # The realistic version of stripping a marker: someone "tidies" its wording
  # while editing the rationale beside it. check_migrations.py matches the
  # marker as a literal substring, so dropping the prefix stops it covering
  # the call. (A marker with something appended still matches, by the same
  # substring rule - so this asserts the prefix, not exact equality.)
  sed -i.bak 's/# migration-check: allow-destructive/# allow-destructive/' \
    backend/alembic/versions/0001_first.py
  rm -f backend/alembic/versions/*.bak
  git add -A && git commit -q -m "tidy the marker"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"marker was added or removed"* ]]
}

@test "a blank line between marker and call is not a detachment" {
  # _marker_attached_to skips blank lines when walking back from the call, so
  # reformatting cannot silently uncover an approved operation. Asserted here
  # because the opposite would be a plausible-looking bug.
  sed -i.bak 's/^    # Superseded by the audit table\.$//' \
    backend/alembic/versions/0001_first.py
  rm -f backend/alembic/versions/*.bak
  git add -A && git commit -q -m "reformat"

  run main main-ref

  [ "$status" -eq 0 ]
}

@test "adding one migration while rewriting another still fails" {
  # The add must not mask the modification.
  sed -i.bak 's/"old"/"other"/' backend/alembic/versions/0001_first.py
  rm -f backend/alembic/versions/*.bak
  cat > backend/alembic/versions/0002_second.py <<'EOF'
"""Second."""
revision = "0002"
EOF
  git add -A && git commit -q -m "add and edit"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"0001_first.py"* ]]
  [[ "$output" != *"0002_second.py"* ]]
}

@test "the failure message says what to do instead" {
  # A check that blocks with no route forward invites a --no-verify shrug.
  sed -i.bak 's/"old"/"other"/' backend/alembic/versions/0001_first.py
  rm -f backend/alembic/versions/*.bak
  git add -A && git commit -q -m "edit"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"adding a NEW"* ]]
  [[ "$output" == *"Comments may be edited"* ]]
}

@test "describe_status maps git's letters to plain words" {
  run describe_status "M"
  [ "$output" = "modified" ]

  run describe_status "D"
  [ "$output" = "deleted" ]

  # git reports renames with a similarity score appended.
  run describe_status "R100"
  [ "$output" = "renamed" ]
}

@test "describe_status falls back rather than losing an unknown status" {
  run describe_status "T"
  [ "$output" = "changed (T)" ]
}

@test "is_comparable_status only accepts a modification" {
  run is_comparable_status "M"
  [ "$status" -eq 0 ]

  run is_comparable_status "D"
  [ "$status" -ne 0 ]

  run is_comparable_status "R100"
  [ "$status" -ne 0 ]
}

# A squash: the one deletion allowed. Every merged migration goes and one
# baseline arrives under the old head's revision id, so a database at that
# head already records the baseline and nothing runs against it.

second_merged_migration() {
  # A chain of two on main-ref, with the feature branch cut from it. One
  # migration is not a chain to squash, so the squash tests need this.
  git checkout -q main-ref
  cat > backend/alembic/versions/0002_second.py <<'EOF2'
"""Second."""
revision = "0002"
down_revision = "0001"
EOF2
  git add -A && git commit -q -m "second merged migration"
  git checkout -q -B feature main-ref
}

squash_baseline() {
  # A baseline that resembles a deleted migration closely enough for git to
  # pair the two as a rename, which is what --no-renames is there to ignore.
  # git rm takes the directory with the last file, hence the mkdir.
  mkdir -p backend/alembic/versions
  cat > backend/alembic/versions/0001_baseline.py <<EOF2
"""Baseline."""
revision = "$1"
down_revision = $2


def upgrade() -> None:
    # migration-check: allow-destructive
    # Superseded by the audit table.
    op.drop_column("users", "old")
EOF2
}

@test "a squash that keeps the old head's revision id passes" {
  second_merged_migration
  git rm -q backend/alembic/versions/0001_first.py backend/alembic/versions/0002_second.py
  squash_baseline "0002" None
  git add -A && git commit -q -m "squash"

  run main main-ref

  [ "$status" -eq 0 ]
  [[ "$output" == *"Squash accepted"* ]]
  [[ "$output" == *"0001_baseline.py"* ]]
  [[ "$output" == *"old head's id 0002"* ]]
}

@test "a squash under a new revision id fails" {
  # A database at the old head would then hold an id the chain no longer
  # knows, and the next deploy's upgrade would fail to locate it.
  second_merged_migration
  git rm -q backend/alembic/versions/0001_first.py backend/alembic/versions/0002_second.py
  squash_baseline "9999" None
  git add -A && git commit -q -m "squash under a new id"

  run main main-ref

  [ "$status" -eq 1 ]
  # git pairs the look-alike baseline with 0001 as a rename on this path,
  # which is refused just the same; 0002 shows as the plain deletion it is.
  [[ "$output" == *"backend/alembic/versions/0001_first.py"* ]]
  [[ "$output" == *"deleted: backend/alembic/versions/0002_second.py"* ]]
}

@test "a squash whose baseline has a down_revision fails" {
  # A baseline points at nothing below it; one that does is a replacement
  # of the chain's last link, not of the chain.
  second_merged_migration
  git rm -q backend/alembic/versions/0001_first.py backend/alembic/versions/0002_second.py
  squash_baseline "0002" '"0001"'
  git add -A && git commit -q -m "squash onto something"

  run main main-ref

  [ "$status" -eq 1 ]
}

@test "deleting part of the chain and adding a baseline fails" {
  # The PR deletes only the head and adds a baseline under its id. That is
  # not a squash, so the deletion is refused as usual.
  second_merged_migration
  git rm -q backend/alembic/versions/0002_second.py
  squash_baseline "0002" None
  git add -A && git commit -q -m "partial"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"deleted: backend/alembic/versions/0002_second.py"* ]]
}

@test "deleting the chain and adding two migrations fails" {
  second_merged_migration
  git rm -q backend/alembic/versions/0001_first.py backend/alembic/versions/0002_second.py
  squash_baseline "0002" None
  cat > backend/alembic/versions/0003_third.py <<'EOF2'
"""Third."""
revision = "0003"
down_revision = "0002"
EOF2
  git add -A && git commit -q -m "squash and add"

  run main main-ref

  [ "$status" -eq 1 ]
}

@test "replacing a chain of one under its own id is a rename, not a squash" {
  # A lone baseline moved to a new filename would otherwise pass as a
  # squash of itself. One migration is nothing to squash.
  git rm -q backend/alembic/versions/0001_first.py
  squash_baseline "0001" None
  git add -A && git commit -q -m "move the only migration"

  run main main-ref

  [ "$status" -eq 1 ]
}

@test "the failure message names the squash as the one deletion allowed" {
  git rm -q backend/alembic/versions/0001_first.py
  git commit -q -m "delete"

  run main main-ref

  [ "$status" -eq 1 ]
  [[ "$output" == *"The one deletion allowed is a"* ]]
  [[ "$output" == *"old head's revision id"* ]]
}

@test "revision_values reads the quoted id and skips None" {
  run revision_values revision <<'EOF2'
"""Doc."""
revision: str = "abc123"
down_revision: str | None = None
EOF2
  [ "$output" = "abc123" ]

  run revision_values down_revision <<'EOF2'
revision = "abc123"
down_revision = None
EOF2
  [ -z "$output" ]

  run revision_values down_revision <<'EOF2'
down_revision = "def456"
EOF2
  [ "$output" = "def456" ]
}

@test "head_revision_at finds the one revision nothing revises" {
  second_merged_migration

  run head_revision_at main-ref

  [ "$output" = "0002" ]
}

@test "head_revision_at prints nothing when the chain has two heads" {
  git checkout -q main-ref
  cat > backend/alembic/versions/0002_other.py <<'EOF2'
"""Other."""
revision = "0002"
EOF2
  git add -A && git commit -q -m "a second base"

  run head_revision_at main-ref

  [ -z "$output" ]
}
