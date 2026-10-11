#!/usr/bin/env bats
# Tests for review-ledger.py, the audit card of the code.
#
# Each test builds a throwaway repository with one extra worktree and a
# copy of the script, so the card it writes is the throwaway's own and
# nothing here touches the real one.

setup() {
    MAIN="${BATS_TEST_TMPDIR}/main"
    OTHER="${BATS_TEST_TMPDIR}/other"

    git init -q "$MAIN"

    # Who is stamping. Set in the repository and not left to the machine:
    # a CI runner has no name of its own, and a stamp needs one.
    as_reader "Ada Reader" "ada@example.org"
    mkdir -p "${MAIN}/scripts" "${MAIN}/backend/app" "${MAIN}/docs"
    cp "${BATS_TEST_DIRNAME}/../review-ledger.py" "${MAIN}/scripts/"

    printf 'one\ntwo\nthree\n' > "${MAIN}/backend/app/deps.py"
    printf 'a\nb\n' > "${MAIN}/backend/app/security.py"
    printf 'def test():\n    pass\n' > "${MAIN}/backend/app/deps_test.py"
    printf '# Notes\n' > "${MAIN}/docs/notes.md"

    git -C "$MAIN" add -A
    git -C "$MAIN" -c user.name=t -c user.email=t@example.com \
        commit -q -m "start"
    git -C "$MAIN" worktree add -q "$OTHER" -b other

    CARD="$(cd -P "$MAIN" && pwd)/audit/ledger.tsv"
}

# as_reader <name> <email>: make this the person git says is at the keys.
as_reader() {
    git -C "$MAIN" config user.name "$1"
    git -C "$MAIN" config user.email "$2"
}

# ledger <worktree> <args...>: run the script from the root of a worktree.
ledger() {
    local where="$1"
    shift
    (cd "$where" && python3 scripts/review-ledger.py "$@")
}

@test "a file starts unaudited" {
    run ledger "$MAIN" status backend/app
    [ "$status" -eq 0 ]
    [[ "$output" == *"unaudited"*"backend/app/deps.py"* ]]
}

@test "a stamped file reads as audited" {
    ledger "$MAIN" mark backend/app/deps.py

    run ledger "$MAIN" status backend/app
    [[ "$output" == *"audited         3  backend/app/deps.py"* ]]
    [[ "$output" == *"unaudited       2  backend/app/security.py"* ]]
}

@test "a stamped file that is then edited reads as changed" {
    ledger "$MAIN" mark backend/app/deps.py
    echo "four" >> "${MAIN}/backend/app/deps.py"

    run ledger "$MAIN" status f
    [[ "$output" == *"Changed since their audit (1):"* ]]
    [[ "$output" == *"  backend/app/deps.py"* ]]
}

@test "status on its own prints the two headline lines and no more" {
    ledger "$MAIN" mark backend/app/deps.py

    run ledger "$MAIN" status
    [ "$status" -eq 0 ]
    [ "${#lines[@]}" -eq 2 ]
    [[ "${lines[0]}" == Code* ]]
    [[ "${lines[1]}" == Tests* ]]
}

@test "status on its own adds a count when an audited file has changed" {
    ledger "$MAIN" mark backend/app/deps.py
    echo "four" >> "${MAIN}/backend/app/deps.py"

    run ledger "$MAIN" status
    [ "${#lines[@]}" -eq 3 ]
    [ "${lines[2]}" = "Changed since their audit: 1" ]
}

@test "full is spelt f or full" {
    run ledger "$MAIN" status full
    [[ "$output" == *"Lines left to audit, by folder:"* ]]
}

@test "stamping a changed file again makes it audited" {
    ledger "$MAIN" mark backend/app/deps.py
    echo "four" >> "${MAIN}/backend/app/deps.py"
    ledger "$MAIN" mark backend/app/deps.py

    run ledger "$MAIN" status f
    [[ "$output" != *"Changed since their audit"* ]]
}

@test "a folder stamps every file in it" {
    run ledger "$MAIN" mark backend/app
    [ "$status" -eq 0 ]
    [ "${lines[0]}" = "Stamped 3 files, 7 lines, as audited by Ada Reader." ]
}

@test "a stamp is followed by the running total" {
    run ledger "$MAIN" mark backend/app/deps.py
    [ "$status" -eq 0 ]
    [ "${#lines[@]}" -eq 3 ]
    [ "${lines[0]}" = "Stamped 1 file, 3 lines, as audited by Ada Reader." ]
    [[ "${lines[1]}" == Code*"3 of"*"lines audited"* ]]
    [[ "${lines[2]}" == Tests* ]]
}

@test "a full path is taken as well as a relative one" {
    ledger "$MAIN" mark "$(cd -P "$MAIN" && pwd)/backend/app/deps.py"

    [ "$(cut -f1 "$CARD")" = "backend/app/deps.py" ]
}

@test "the card holds the path, the fingerprint and the date" {
    ledger "$MAIN" mark backend/app/deps.py
    expected="$(git -C "$MAIN" hash-object backend/app/deps.py)"

    [ "$(cut -f2 "$CARD")" = "$expected" ]
    [ "$(cut -f3 "$CARD")" = "$(date +%F)" ]
}

@test "a stamp travels with its branch, and reaches another by merging" {
    ledger "$OTHER" mark backend/app/deps.py

    run ledger "$MAIN" status backend/app
    [[ "$output" == *"unaudited       3  backend/app/deps.py"* ]]

    git -C "$OTHER" add audit/ledger.tsv
    git -C "$OTHER" -c user.name=t -c user.email=t@example.com \
        commit -q -m "audit: deps"
    git -C "$MAIN" -c user.name=t -c user.email=t@example.com \
        merge -q other

    run ledger "$MAIN" status backend/app
    [[ "$output" == *"audited         3  backend/app/deps.py"* ]]
}

@test "two people stamping on two branches merge without a conflict" {
    # What `audit/ledger.tsv merge=union` in .gitattributes is for.
    printf 'audit/ledger.tsv merge=union\n' > "${MAIN}/.gitattributes"
    git -C "$MAIN" add .gitattributes
    git -C "$MAIN" -c user.name=t -c user.email=t@example.com \
        commit -q -m "merge rule"
    git -C "$OTHER" -c user.name=t -c user.email=t@example.com \
        merge -q "$(git -C "$MAIN" branch --show-current)"

    as_reader "Ada Reader" "ada@example.com"
    ledger "$MAIN" mark backend/app/deps.py
    git -C "$MAIN" add audit/ledger.tsv
    git -C "$MAIN" commit -q -m "audit: deps"

    git -C "$OTHER" config user.name "Ben Checker"
    git -C "$OTHER" config user.email "ben@example.com"
    ledger "$OTHER" mark backend/app/security.py
    git -C "$OTHER" add audit/ledger.tsv
    git -C "$OTHER" commit -q -m "audit: security"

    run git -C "$MAIN" merge -q other
    [ "$status" -eq 0 ]

    run ledger "$MAIN" status backend/app
    [[ "$output" == *"audited         3  backend/app/deps.py  (Ada Reader)"* ]]
    [[ "$output" == *"audited         2  backend/app/security.py  (Ben Checker)"* ]]
}

@test "the headline counts code and tests apart" {
    ledger "$MAIN" mark backend/app/deps.py

    run ledger "$MAIN" status
    [[ "${lines[0]}" == Code*"3 of"*"lines audited"* ]]
    [[ "${lines[1]}" == Tests*"0 of         2 lines audited (0%)"* ]]
}

@test "prose is left off the card" {
    run ledger "$MAIN" status f
    [[ "$output" != *"docs"* ]]

    run ledger "$MAIN" mark docs
    [ "$status" -eq 1 ]
    [[ "$output" == *"Nothing to stamp"* ]]
}

@test "editor settings are left off the card" {
    mkdir "${MAIN}/.vscode"
    echo '{}' > "${MAIN}/.vscode/settings.json"

    run ledger "$MAIN" status f
    [[ "$output" != *".vscode"* ]]

    run ledger "$MAIN" mark .vscode
    [ "$status" -eq 1 ]
    [[ "$output" == *"Nothing to stamp"* ]]
}

@test "the api-compatibility decision files are left off the card" {
    mkdir "${MAIN}/api-compatibility"
    echo 'decision: additive' > "${MAIN}/api-compatibility/0001.yaml"

    run ledger "$MAIN" status f
    [[ "$output" != *"api-compatibility"* ]]

    run ledger "$MAIN" mark api-compatibility
    [ "$status" -eq 1 ]
    [[ "$output" == *"Nothing to stamp"* ]]
}

@test "migrations are left off the card" {
    mkdir -p "${MAIN}/backend/alembic/versions"
    echo 'def upgrade(): pass' > "${MAIN}/backend/alembic/versions/a1.py"
    echo 'config = 1' > "${MAIN}/backend/alembic/env.py"

    run ledger "$MAIN" status backend/alembic
    [[ "$output" != *"versions"* ]]
    [[ "$output" == *"backend/alembic/env.py"* ]]
}

@test "the summary says how many lines each folder has left" {
    ledger "$MAIN" mark backend/app/deps.py

    run ledger "$MAIN" status f
    [[ "$output" == *"Lines left to audit, by folder:"* ]]
    [[ "$output" == *"backend/app"*"4"* ]]
}

@test "diff shows only what changed since the stamp" {
    ledger "$MAIN" mark backend/app/deps.py
    echo "four" >> "${MAIN}/backend/app/deps.py"

    run ledger "$MAIN" diff backend/app/deps.py
    [ "$status" -eq 0 ]
    [[ "$output" == *"+four"* ]]
    [[ "$output" != *"+one"* ]]
}

@test "diff works on a file stamped before it was committed" {
    echo "draft" > "${MAIN}/backend/app/new.py"
    ledger "$MAIN" mark backend/app/new.py
    echo "more" >> "${MAIN}/backend/app/new.py"

    run ledger "$MAIN" diff backend/app/new.py
    [ "$status" -eq 0 ]
    [[ "$output" == *"+more"* ]]
    [[ "$output" != *"+draft"* ]]
}

@test "diff says so when nothing changed" {
    ledger "$MAIN" mark backend/app/deps.py

    run ledger "$MAIN" diff backend/app/deps.py
    [ "$status" -eq 0 ]
    [[ "$output" == *"has not changed since"* ]]
}

@test "diff refuses a file that was never stamped" {
    run ledger "$MAIN" diff backend/app/deps.py
    [ "$status" -eq 1 ]
    [[ "$output" == *"has not been stamped"* ]]
}

@test "a path outside the worktree is refused" {
    run ledger "$MAIN" mark "${OTHER}/backend/app/deps.py"
    [ "$status" -ne 0 ]
    [[ "$output" == *"is not inside this worktree"* ]]
}

@test "a stamp is a change to the card, and to nothing else" {
    # The card is tracked, so a stamp shows up to be committed. The lock
    # the script holds while it writes must not.
    ledger "$MAIN" mark backend/app

    [ "$(git -C "$MAIN" status --short --untracked-files=all)" = "?? audit/ledger.tsv" ]
}

@test "the card itself is left off the card" {
    ledger "$MAIN" mark backend/app

    run ledger "$MAIN" status f
    [[ "$output" != *"audit"$'\n'* ]]

    run ledger "$MAIN" mark audit
    [ "$status" -eq 1 ]
    [[ "$output" == *"Nothing to stamp"* ]]
}

@test "a stamp can be taken off again" {
    ledger "$MAIN" mark backend/app

    run ledger "$MAIN" unmark backend/app/deps.py
    [ "$status" -eq 0 ]
    [ "${lines[0]}" = "Took your stamp off 1 file." ]

    run ledger "$MAIN" status backend/app
    [[ "$output" == *"unaudited       3  backend/app/deps.py"* ]]
    [[ "$output" == *"audited         2  backend/app/security.py"* ]]
}

@test "taking the stamp off a folder takes it off every file in it" {
    ledger "$MAIN" mark backend/app

    run ledger "$MAIN" unmark backend/app
    [ "${lines[0]}" = "Took your stamp off 3 files." ]
    [ ! -s "$CARD" ] || [ -z "$(tr -d '\n' < "$CARD")" ]
}

@test "a folder name does not take the stamp off a neighbour that starts the same" {
    mkdir "${MAIN}/backend/application"
    echo "x" > "${MAIN}/backend/application/a.py"
    ledger "$MAIN" mark backend/application backend/app

    ledger "$MAIN" unmark backend/app

    [ "$(cut -f1 "$CARD")" = "backend/application/a.py" ]
}

@test "the stamp comes off a file that has since been deleted" {
    ledger "$MAIN" mark backend/app/deps.py
    rm "${MAIN}/backend/app/deps.py"

    run ledger "$MAIN" unmark backend/app/deps.py
    [ "$status" -eq 0 ]
    [ "${lines[0]}" = "Took your stamp off 1 file." ]
}

@test "taking off a stamp that is not there says so" {
    run ledger "$MAIN" unmark backend/app/deps.py
    [ "$status" -eq 1 ]
    [[ "$output" == *"None of those had a stamp."* ]]
}

@test "states prints one line a file, for a program to read" {
    ledger "$MAIN" mark backend/app/deps.py backend/app/security.py
    echo "four" >> "${MAIN}/backend/app/deps.py"
    fingerprint="$(cut -f2 "$CARD" | sed -n 2p)"
    tab="$(printf '\t')"

    run ledger "$MAIN" states
    [ "$status" -eq 0 ]
    [[ "$output" == *"changed${tab}4${tab}$(date +%F)${tab}"*"${tab}code${tab}Ada Reader${tab}backend/app/deps.py"* ]]
    [[ "$output" == *"audited${tab}2${tab}$(date +%F)${tab}${fingerprint}${tab}code${tab}Ada Reader${tab}backend/app/security.py"* ]]
    [[ "$output" == *"unaudited${tab}2${tab}${tab}${tab}test${tab}${tab}backend/app/deps_test.py"* ]]
}

# ---------------------------------------------------------------------
# Who made a stamp
# ---------------------------------------------------------------------

@test "a stamp carries the name and email of whoever made it" {
    ledger "$MAIN" mark backend/app/deps.py

    [ "$(cut -f4 "$CARD")" = "Ada Reader" ]
    [ "$(cut -f5 "$CARD")" = "ada@example.org" ]
}

@test "a second reviewer's stamp sits beside the first, not over it" {
    ledger "$MAIN" mark backend/app/deps.py
    as_reader "Ben Checker" "ben@example.org"
    ledger "$MAIN" mark backend/app/deps.py

    [ "$(wc -l < "$CARD" | tr -d ' ')" -eq 2 ]
    [ "$(cut -f4 "$CARD" | sort | tr '\n' ',')" = "Ada Reader,Ben Checker," ]
}

@test "stamping again replaces your own stamp and nobody else's" {
    ledger "$MAIN" mark backend/app/deps.py
    as_reader "Ben Checker" "ben@example.org"
    ledger "$MAIN" mark backend/app/deps.py
    ledger "$MAIN" mark backend/app/deps.py

    [ "$(wc -l < "$CARD" | tr -d ' ')" -eq 2 ]
}

@test "one person is one reviewer, however the email is capitalised" {
    ledger "$MAIN" mark backend/app/deps.py
    as_reader "Ada Reader" "Ada@Example.org"
    ledger "$MAIN" mark backend/app/deps.py

    [ "$(wc -l < "$CARD" | tr -d ' ')" -eq 1 ]
}

@test "a file is audited when anybody's stamp matches it" {
    ledger "$MAIN" mark backend/app/deps.py
    echo "four" >> "${MAIN}/backend/app/deps.py"
    as_reader "Ben Checker" "ben@example.org"
    ledger "$MAIN" mark backend/app/deps.py

    run ledger "$MAIN" status backend/app
    [[ "$output" == *"audited         4  backend/app/deps.py  (Ben Checker)"* ]]
}

@test "the listing names everybody who has audited the file as it is" {
    ledger "$MAIN" mark backend/app/deps.py
    as_reader "Ben Checker" "ben@example.org"
    ledger "$MAIN" mark backend/app/deps.py

    run ledger "$MAIN" status backend/app
    [[ "$output" == *"backend/app/deps.py  (Ada Reader, Ben Checker)"* ]]
}

@test "a changed file names who audited the earlier version" {
    ledger "$MAIN" mark backend/app/deps.py
    echo "four" >> "${MAIN}/backend/app/deps.py"

    run ledger "$MAIN" status backend/app
    [[ "$output" == *"changed         4  backend/app/deps.py  (Ada Reader)"* ]]
}

@test "the full status keeps no score of who has audited how much" {
    # Who audited one file is on the record. A total for each person is
    # not: reading is not a race.
    ledger "$MAIN" mark backend/app/deps.py backend/app/security.py

    run ledger "$MAIN" status f
    [[ "$output" != *"Ada Reader"* ]]
}

@test "taking a stamp off takes only your own" {
    ledger "$MAIN" mark backend/app/deps.py
    as_reader "Ben Checker" "ben@example.org"
    ledger "$MAIN" mark backend/app/deps.py

    run ledger "$MAIN" unmark backend/app/deps.py
    [ "${lines[0]}" = "Took your stamp off 1 file." ]
    [ "$(cut -f4 "$CARD")" = "Ada Reader" ]
}

@test "you cannot take off a stamp somebody else made" {
    ledger "$MAIN" mark backend/app/deps.py
    as_reader "Ben Checker" "ben@example.org"

    run ledger "$MAIN" unmark backend/app/deps.py
    [ "$status" -eq 1 ]
    [[ "$output" == *"None of those had a stamp of yours."* ]]
    [ "$(cut -f4 "$CARD")" = "Ada Reader" ]
}

@test "diff compares against your own stamp where you have one" {
    ledger "$MAIN" mark backend/app/deps.py
    echo "four" >> "${MAIN}/backend/app/deps.py"
    as_reader "Ben Checker" "ben@example.org"
    ledger "$MAIN" mark backend/app/deps.py
    echo "five" >> "${MAIN}/backend/app/deps.py"
    as_reader "Ada Reader" "ada@example.org"

    run ledger "$MAIN" diff backend/app/deps.py
    [[ "$output" == *"+four"* ]]
    [[ "$output" == *"+five"* ]]
}

@test "a card from before stamps carried a name is still read" {
    mkdir -p "$(dirname "$CARD")"
    printf '%s\t%s\t%s\n' "backend/app/deps.py" \
        "$(git -C "$MAIN" hash-object backend/app/deps.py)" "2026-10-09" \
        > "$CARD"

    run ledger "$MAIN" status backend/app
    [[ "$output" == *"audited         3  backend/app/deps.py"* ]]
    [[ "$output" != *"backend/app/deps.py  ("* ]]
}

@test "adopt puts your name on stamps that have none, keeping their date" {
    mkdir -p "$(dirname "$CARD")"
    printf '%s\t%s\t%s\n' "backend/app/deps.py" \
        "$(git -C "$MAIN" hash-object backend/app/deps.py)" "2026-10-09" \
        > "$CARD"

    run ledger "$MAIN" adopt
    [ "$status" -eq 0 ]
    [ "$output" = "Put the name Ada Reader on 1 stamp that had none." ]
    [ "$(cut -f3 "$CARD")" = "2026-10-09" ]
    [ "$(cut -f4 "$CARD")" = "Ada Reader" ]
    [ "$(cut -f5 "$CARD")" = "ada@example.org" ]
}

@test "adopt leaves a named stamp alone" {
    ledger "$MAIN" mark backend/app/deps.py
    as_reader "Ben Checker" "ben@example.org"

    run ledger "$MAIN" adopt
    [ "$output" = "Every stamp already has a name on it." ]
    [ "$(cut -f4 "$CARD")" = "Ada Reader" ]
}

@test "stamping a file that has a nameless stamp replaces it with yours" {
    mkdir -p "$(dirname "$CARD")"
    printf '%s\t%s\t%s\n' "backend/app/deps.py" "0000" "2026-10-09" > "$CARD"

    ledger "$MAIN" mark backend/app/deps.py

    [ "$(wc -l < "$CARD" | tr -d ' ')" -eq 1 ]
    [ "$(cut -f4 "$CARD")" = "Ada Reader" ]
}

@test "stamping fails, and says why, when git has no name for you" {
    git -C "$MAIN" config --unset user.name

    # No name from the machine's own settings either.
    GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
        run ledger "$MAIN" mark backend/app/deps.py

    [ "$status" -ne 0 ]
    [[ "$output" == *"Git has no name for you"* ]]
    [ ! -e "$CARD" ]
}

@test "a card with a line this version cannot read is left alone" {
    # A version from before stamps carried a name once read a card full
    # of named stamps, understood none, and wrote back only its own.
    ledger "$MAIN" mark backend/app/deps.py
    printf 'backend/app/security.py\tabc\t2026-10-10\tAda\tada@example.com\tsigned\textra\n' >> "$CARD"
    before="$(cat "$CARD")"

    run ledger "$MAIN" mark backend/app/deps_test.py
    [ "$status" -ne 0 ]
    [[ "$output" == *"Line 2 of"*"written by a"*"newer one"* ]]
    [[ "$output" == *"Nothing has been changed"* ]]
    [ "$(cat "$CARD")" = "$before" ]
}

@test "a card it cannot read stops a status too, and does not read as empty" {
    mkdir -p "$(dirname "$CARD")"
    printf 'one\ttwo\n' > "$CARD"

    run ledger "$MAIN" status
    [ "$status" -ne 0 ]
    [[ "$output" != *"0 of"* ]]
}

@test "a blank line on the card is not a fault" {
    ledger "$MAIN" mark backend/app/deps.py
    printf '\n' >> "$CARD"

    run ledger "$MAIN" status backend/app
    [ "$status" -eq 0 ]
    [[ "$output" == *"audited         3  backend/app/deps.py"* ]]
}

# commit_all: commit whatever is in the main worktree.
commit_all() {
    git -C "$MAIN" add -A
    git -C "$MAIN" -c user.name=t -c user.email=t@example.com \
        commit -q -m "more"
}

@test "verify passes a card of real stamps" {
    as_reader "Ada Reader" "ada@example.com"
    ledger "$MAIN" mark backend/app

    run ledger "$MAIN" verify
    [ "$status" -eq 0 ]
    [ "$output" = "All 3 stamps hold up." ]
}

@test "verify passes an empty card" {
    run ledger "$MAIN" verify
    [ "$status" -eq 0 ]
    [ "$output" = "All 0 stamps hold up." ]
}

@test "verify still passes when a stamped file has since been edited and committed" {
    as_reader "Ada Reader" "ada@example.com"
    ledger "$MAIN" mark backend/app/deps.py
    echo "four" >> "${MAIN}/backend/app/deps.py"
    commit_all

    run ledger "$MAIN" verify
    [ "$status" -eq 0 ]
}

@test "verify fails a line for a file the branch never held" {
    as_reader "Ada Reader" "ada@example.com"
    ledger "$MAIN" mark backend/app/deps.py
    sed -i.bak 's|^backend/app/deps.py|backend/app/nothing.py|' "$CARD" && rm "${CARD}.bak"

    run ledger "$MAIN" verify
    [ "$status" -eq 1 ]
    [[ "$output" == *"backend/app/nothing.py: no such file in this branch's history"* ]]
    [[ "$output" == *"1 of 1 stamps do not hold up"* ]]
}

@test "verify fails a line whose fingerprint is not one" {
    as_reader "Ada Reader" "ada@example.com"
    ledger "$MAIN" mark backend/app/deps.py
    printf 'backend/app/security.py\tnot-a-hash\t2026-10-10\tAda Reader\tada@example.com\n' >> "$CARD"

    run ledger "$MAIN" verify
    [ "$status" -eq 1 ]
    [[ "$output" == *"backend/app/security.py: 'not-a-hash' is not a fingerprint"* ]]
}

@test "verify fails a line with no name or with a date that is not one" {
    fingerprint="$(git -C "$MAIN" hash-object backend/app/deps.py)"
    mkdir -p "$(dirname "$CARD")"
    printf 'backend/app/deps.py\t%s\tyesterday\t\t\n' "$fingerprint" > "$CARD"

    run ledger "$MAIN" verify
    [ "$status" -eq 1 ]
    [[ "$output" == *"a stamp with no name on it"* ]]
    [[ "$output" == *"'yesterday' is not a date"* ]]
}

@test "verify fails a line for a file that is left off the card" {
    mkdir -p "$(dirname "$CARD")"
    printf 'docs/notes.md\t%s\t2026-10-10\tAda Reader\tada@example.com\n' \
        "$(git -C "$MAIN" hash-object docs/notes.md)" > "$CARD"

    run ledger "$MAIN" verify
    [ "$status" -eq 1 ]
    [[ "$output" == *"docs/notes.md: this file is left off the card"* ]]
}

@test "verify says so, and passes, when a file was stamped at a version never committed" {
    # Stamped, then edited before the commit: honest, and harmless, as
    # the file reads as changed until it is stamped again.
    as_reader "Ada Reader" "ada@example.com"
    echo "draft" >> "${MAIN}/backend/app/deps.py"
    ledger "$MAIN" mark backend/app/deps.py
    echo "final" >> "${MAIN}/backend/app/deps.py"
    commit_all

    run ledger "$MAIN" verify
    [ "$status" -eq 0 ]
    [[ "$output" == *"backend/app/deps.py: stamped at a version that was never committed"* ]]
    [[ "$output" == *"All 1 stamps hold up."* ]]
}
