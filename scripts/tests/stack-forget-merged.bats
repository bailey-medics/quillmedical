#!/usr/bin/env bats
# Tests for which entries stack-forget-merged.py drops from the record.
#
# Each test builds a throwaway repository with a hand-written record in
# .git/gh-stack, so nothing reaches GitHub. `gh` is a stub on PATH that
# answers `gh pr view <number>` from a file, and fails when there is no
# file, which is what "GitHub could not be asked" looks like.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../stack-forget-merged.py"
    REPO="${BATS_TEST_TMPDIR}/repo"
    STUB="${BATS_TEST_TMPDIR}/stub"

    export GIT_AUTHOR_NAME="Test" GIT_AUTHOR_EMAIL="test@example.com"
    export GIT_COMMITTER_NAME="Test" GIT_COMMITTER_EMAIL="test@example.com"

    mkdir -p "${STUB}/bin"
    cat > "${STUB}/bin/gh" <<'GH'
#!/usr/bin/env bash
# gh pr view <number> --json state --jq .state
if [ "$1" = "pr" ] && [ "$2" = "view" ] && [ -f "${STUB}/pr-$3" ]; then
    cat "${STUB}/pr-$3"
    exit 0
fi
exit 1
GH
    chmod +x "${STUB}/bin/gh"
    export STUB PATH="${STUB}/bin:${PATH}"

    git init --quiet --initial-branch main "${REPO}"
    cd "${REPO}"
    commit base
    TRUNK="$(git rev-parse HEAD)"
}

commit() {
    echo "$1" > "$1.txt"
    git add "$1.txt"
    git commit --quiet --message "$1"
}

# Makes a branch off the current one with a commit of its own, and leaves
# it checked out.
branch_with_commit() {
    git switch --quiet --create "$1"
    commit "${1##*/}"
}

# Lands a branch on main the way a pull request does here: a merge commit.
merge_to_main() {
    git switch --quiet main
    git merge --quiet --no-ff --message "Merge $1" "$1"
}

# Writes a record holding one stack. Each argument is one entry, bottom to
# top, as `branch|base|pull request JSON`, the last part optional.
write_record() {
    python3 - "${TRUNK}" "$@" <<'PY'
import json, subprocess, sys

trunk, branches = sys.argv[1], []
for spec in sys.argv[2:]:
    name, base, *rest = spec.split("|")
    head = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", name],
        capture_output=True, text=True,
    ).stdout.strip()
    entry = {"branch": name, "head": head or "0" * 40, "base": base}
    if rest and rest[0]:
        entry["pullRequest"] = json.loads(rest[0])
    branches.append(entry)
record = {
    "schemaVersion": 1,
    "stacks": [{"trunk": {"branch": "main", "head": trunk}, "branches": branches}],
}
open(".git/gh-stack", "w").write(json.dumps(record))
PY
}

# Prints the branches left in the record, bottom to top, one per line.
recorded() {
    python3 -c '
import json
for entry in json.load(open(".git/gh-stack"))["stacks"][0]["branches"]:
    print(entry["branch"])
'
}

# Prints the recorded base of one branch.
base_of() {
    python3 -c '
import json, sys
for entry in json.load(open(".git/gh-stack"))["stacks"][0]["branches"]:
    if entry["branch"] == sys.argv[1]:
        print(entry["base"])
' "$1"
}

@test "a merged entry whose branch is gone is dropped" {
    branch_with_commit feature/a
    merge_to_main feature/a
    write_record 'feature/a|'"${TRUNK}"'|{"number": 1, "merged": true}'
    git branch --quiet -D feature/a

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Forgot 1 finished branch"* ]]
    [ -z "$(recorded)" ]
}

@test "an entry whose branch is gone is dropped whatever its pull request says" {
    branch_with_commit feature/a
    write_record 'feature/a|'"${TRUNK}"'|{"number": 1363}'
    git switch --quiet main
    git branch --quiet -D feature/a

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ -z "$(recorded)" ]
}

@test "a closed and replaced pull request is dropped once its branch is in the trunk" {
    # #1363 was closed and reopened as #1386 on the same branch. The
    # record kept #1363, so the merge of #1386 never reached it.
    branch_with_commit feature/a
    a_tip="$(git rev-parse HEAD)"
    branch_with_commit feature/b
    write_record \
        'feature/a|'"${TRUNK}"'|{"number": 1363}' \
        'feature/b|'"${a_tip}"'|{"number": 1364}'
    merge_to_main feature/a
    git switch --quiet feature/b
    echo "CLOSED" > "${STUB}/pr-1363"

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ "$(recorded)" = "feature/b" ]
}

@test "the branch above a dropped entry is re-chained onto the trunk" {
    branch_with_commit feature/a
    a_tip="$(git rev-parse HEAD)"
    branch_with_commit feature/b
    write_record \
        'feature/a|'"${TRUNK}"'|{"number": 1363}' \
        'feature/b|'"${a_tip}"'|{"number": 1364}'
    merge_to_main feature/a
    git switch --quiet feature/b
    echo "CLOSED" > "${STUB}/pr-1363"

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ "$(base_of feature/b)" = "${TRUNK}" ]
}

@test "a merge gh-stack has not yet seen is left for it to prune" {
    # Dropping this entry first would leave its local branch behind:
    # `gh stack sync --prune` deletes only branches still in the record.
    branch_with_commit feature/a
    write_record 'feature/a|'"${TRUNK}"'|{"number": 7}'
    merge_to_main feature/a
    echo "MERGED" > "${STUB}/pr-7"

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ "$(recorded)" = "feature/a" ]
}

@test "an entry is kept when GitHub cannot be asked about its pull request" {
    branch_with_commit feature/a
    write_record 'feature/a|'"${TRUNK}"'|{"number": 7}'
    merge_to_main feature/a

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ "$(recorded)" = "feature/a" ]
}

@test "a branch recorded as merged and already in the trunk is dropped" {
    branch_with_commit feature/a
    write_record 'feature/a|'"${TRUNK}"'|{"number": 7, "merged": true}'
    merge_to_main feature/a

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ -z "$(recorded)" ]
}

@test "a branch in the trunk with no pull request recorded is dropped" {
    branch_with_commit feature/a
    write_record 'feature/a|'"${TRUNK}"
    merge_to_main feature/a

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ -z "$(recorded)" ]
}

@test "a branch with work that is not in the trunk is kept" {
    branch_with_commit feature/a
    write_record 'feature/a|'"${TRUNK}"'|{"number": 1363}'
    git switch --quiet main
    echo "CLOSED" > "${STUB}/pr-1363"

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ "$(recorded)" = "feature/a" ]
}

@test "the branch checked out is kept even when it is in the trunk" {
    branch_with_commit feature/a
    write_record 'feature/a|'"${TRUNK}"'|{"number": 1363}'
    merge_to_main feature/a
    git switch --quiet feature/a
    echo "CLOSED" > "${STUB}/pr-1363"

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ "$(recorded)" = "feature/a" ]
}

@test "a branch with no commits of its own is kept" {
    # A new branch sits at its base, so it is in the trunk only because
    # nothing has been put on it yet.
    git branch --quiet feature/empty
    write_record 'feature/empty|'"${TRUNK}"

    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ "$(recorded)" = "feature/empty" ]
}

@test "no record is not an error" {
    run python3 "${SCRIPT}"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
}
