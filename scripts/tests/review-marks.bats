#!/usr/bin/env bats
# Tests for tools/review-marks/extension.ts, the VS Code extension that
# shows the audit stamps in the editor.
#
# Only the two parts with no editor in them: reading the ledger's output
# into marks for files and folders, and reading a diff into the lines to
# mark. The extension asks for the `vscode` module as it loads, which
# exists only inside VS Code, so a stand-in with just enough in it is put
# where node will find it. The tests run the JavaScript `install.sh`
# makes from the TypeScript, so they test what VS Code loads. Every test
# is skipped where node is not installed; CI installs it.

setup() {
    command -v node >/dev/null 2>&1 || skip "node is not installed"

    # shellcheck source=../../tools/review-marks/install.sh
    source "${BATS_TEST_DIRNAME}/../../tools/review-marks/install.sh"
    compile_extension "$BATS_TEST_TMPDIR"
    EXTENSION="${BATS_TEST_TMPDIR}/extension.js"
    MODULES="${BATS_TEST_TMPDIR}/node_modules"
    mkdir -p "${MODULES}/vscode"

    cat > "${MODULES}/vscode/index.js" <<'JS'
class EventEmitter {
  constructor() {
    this.event = () => {};
  }
  fire() {}
}
module.exports = {
  EventEmitter,
  window: { createOutputChannel: () => ({ appendLine() {} }) },
};
JS
}

# marks <states output>: prints "state<TAB>path" for every mark, sorted,
# with a trailing slash on a folder.
marks() {
    NODE_PATH="$MODULES" node -e '
const { marksFrom } = require(process.argv[1]);
const found = marksFrom(process.argv[2], "/repo");
const rows = [...found].map(([key, mark]) =>
  `${mark.state}\t${key.replace("/repo/", "")}${mark.folder ? "/" : ""}`);
console.log(rows.sort().join("\n"));
' "$EXTENSION" "$1"
}

# lines <diff>: prints what to mark, as JSON.
lines() {
    NODE_PATH="$MODULES" node -e '
const { linesToMark } = require(process.argv[1]);
console.log(JSON.stringify(linesToMark(process.argv[2])));
' "$EXTENSION" "$1"
}

# row <state> <date> <fingerprint> <path> [readers]: one line of the
# ledger's output, as it is written now.
row() {
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$1" "10" "$2" "$3" "code" "${5-Ada Reader}" "$4"
}

# readers <states output> <path>: who the mark for one file says audited it.
readers() {
    NODE_PATH="$MODULES" node -e '
const { marksFrom } = require(process.argv[1]);
const mark = marksFrom(process.argv[2], "/repo").get("/repo/" + process.argv[3]);
console.log(mark.readers);
' "$EXTENSION" "$1" "$2"
}

@test "a file keeps the state the ledger gave it" {
    run marks "$(row audited 2026-10-10 abc backend/app/deps.py)"

    [ "$status" -eq 0 ]
    [[ "$output" == *"audited"$'\t'"backend/app/deps.py"* ]]
}

@test "a folder is audited when every file beneath it is audited" {
    run marks "$(row audited 2026-10-10 abc backend/app/a.py)
$(row audited 2026-10-10 def backend/app/b.py)"

    [[ "$output" == *"audited"$'\t'"backend/app/"* ]]
    [[ "$output" == *"audited"$'\t'"backend/"* ]]
}

@test "a folder is unaudited when one file beneath it is unaudited" {
    run marks "$(row audited 2026-10-10 abc backend/app/a.py)
$(row unaudited '' '' backend/app/b.py)"

    [[ "$output" == *"unaudited"$'\t'"backend/app/"* ]]
}

@test "a folder is changed when one file beneath it has changed, whatever the rest are" {
    run marks "$(row audited 2026-10-10 abc backend/app/a.py)
$(row unaudited '' '' backend/app/b.py)
$(row changed 2026-10-10 def backend/app/c.py)"

    [[ "$output" == *"changed"$'\t'"backend/app/"* ]]
}

@test "a change deep down marks every folder above it" {
    run marks "$(row changed 2026-10-10 abc backend/app/cbac/grants.py)
$(row audited 2026-10-10 def backend/app/deps.py)"

    [[ "$output" == *"changed"$'\t'"backend/app/cbac/"* ]]
    [[ "$output" == *"changed"$'\t'"backend/app/"* ]]
    [[ "$output" == *"changed"$'\t'"backend/"* ]]
}

@test "one folder's change does not mark its neighbour" {
    run marks "$(row changed 2026-10-10 abc backend/app/cbac/grants.py)
$(row audited 2026-10-10 def backend/app/db/core_db.py)"

    [[ "$output" == *"audited"$'\t'"backend/app/db/"* ]]
}

@test "a file at the top of the repository makes no folder mark" {
    run marks "$(row audited 2026-10-10 abc Justfile)"

    [ "$output" = "audited"$'\t'"Justfile" ]
}

@test "no output makes no marks" {
    run marks ""

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "a file's mark says who audited it" {
    run readers "$(row audited 2026-10-10 abc backend/app/deps.py "Ada Reader, Ben Checker")" \
        backend/app/deps.py

    [ "$output" = "Ada Reader, Ben Checker" ]
}

@test "an unaudited file's mark names nobody" {
    run readers "$(row unaudited '' '' backend/app/deps.py '')" backend/app/deps.py

    [ -z "$output" ]
}

@test "output from before stamps carried a name is still read" {
    # Six columns and not seven: a branch whose ledger script is older
    # than the extension. The path is still the last column.
    local old_line
    old_line="$(printf '%s\t%s\t%s\t%s\t%s\t%s\n' audited 10 2026-10-10 abc code backend/app/deps.py)"

    run marks "$old_line"
    [[ "$output" == *"audited"$'\t'"backend/app/deps.py"* ]]

    run readers "$old_line" backend/app/deps.py
    [ -z "$output" ]
}

@test "one changed line is one line to mark, counted from nought" {
    run lines "@@ -3 +3 @@
-old
+new"

    [ "$output" = '{"changed":[{"first":2,"last":2}],"removedBefore":[]}' ]
}

@test "added lines are marked from the first to the last" {
    run lines "@@ -10,0 +11,3 @@
+a
+b
+c"

    [ "$output" = '{"changed":[{"first":10,"last":12}],"removedBefore":[]}' ]
}

@test "removed lines leave a mark where they were, and no bar" {
    run lines "@@ -5,2 +4,0 @@
-a
-b"

    [ "$output" = '{"changed":[],"removedBefore":[4]}' ]
}

@test "lines removed from the very top are marked at the first line" {
    run lines "@@ -1,2 +0,0 @@
-a
-b"

    [ "$output" = '{"changed":[],"removedBefore":[0]}' ]
}

@test "every hunk is read, with or without text after its header" {
    run lines "@@ -1,0 +1 @@
+first
@@ -40,3 +41,0 @@
-x
@@ -50,2 +48,4 @@ def f():
+y"

    [ "$output" = '{"changed":[{"first":0,"last":0},{"first":47,"last":50}],"removedBefore":[41]}' ]
}

@test "a line of code that looks like a hunk header is not taken for one" {
    run lines "@@ -2 +2 @@
-+++ not a header
++@@ -9 +9 @@ nor this"

    [ "$output" = '{"changed":[{"first":1,"last":1}],"removedBefore":[]}' ]
}

@test "no diff means nothing to mark" {
    run lines ""

    [ "$output" = '{"changed":[],"removedBefore":[]}' ]
}

@test "the JavaScript made from the TypeScript is plain, loadable JavaScript" {
    run node --check "$EXTENSION"

    [ "$status" -eq 0 ]

    run grep -E '^(import|export) |: typeof |^interface |^type ' "$EXTENSION"

    [ "$status" -eq 1 ]
}
