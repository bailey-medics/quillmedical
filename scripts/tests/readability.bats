#!/usr/bin/env bats
# Tests for readability.py, the two Flesch scores of a pull request body.
#
# Each test writes a body into the test's own folder and scores it. Nothing
# in the working tree is read but the script.

bats_require_minimum_version 1.5.0

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../readability.py"
    BODY="${BATS_TEST_TMPDIR}/body.md"
}

# scored <file>: run the script on a body file and keep its output.
scored() {
    run python3 "$SCRIPT" "$1"
}

# ease <output>: the reading ease number from the first line.
ease() {
    sed -n -E 's/^Flesch reading ease: (-?[0-9]+).*/\1/p' <<< "$1"
}

@test "prints the two scores and the counts behind them" {
    printf 'Quill sends a link. The user clicks it.\n' > "$BODY"

    scored "$BODY"

    [ "$status" -eq 0 ]
    [[ "${lines[0]}" == "Flesch reading ease: "*" (aim 70 to 80)" ]]
    [[ "${lines[1]}" == "Flesch-Kincaid grade: "*" (aim about 5)" ]]
    [ "${lines[2]}" = "8 words in 2 sentences" ]
}

@test "reads the body from standard input when no file is given" {
    run python3 "$SCRIPT" < <(printf 'Quill sends a link. The user clicks it.\n')

    [ "$status" -eq 0 ]
    [ "${lines[2]}" = "8 words in 2 sentences" ]
}

@test "short sentences score easier than one long sentence" {
    printf 'Quill sends a link. The user clicks it. The page opens.\n' > "$BODY"
    scored "$BODY"
    short="$(ease "$output")"

    printf 'Quill sends a link which the user clicks so that the page opens.\n' > "$BODY"
    scored "$BODY"
    long="$(ease "$output")"

    [ "$short" -gt "$long" ]
}

@test "code spans, URLs, the marker and the triage labels are not scored" {
    cat > "$BODY" <<'EOF'
**Size:** small. Two files.
**Look hardest at:** `backend/app/security.py`.
**Check for me:** nothing in particular.

Quill reads `GCP_DEPLOY_SERVICE_ACCOUNT` from https://github.com/x/y/blob/main/a.md now.

<!-- crp:pr-summary -->
EOF
    scored "$BODY"
    with_markup="$output"

    cat > "$BODY" <<'EOF'
small. Two files.
.
nothing in particular.

Quill reads from now.
EOF
    scored "$BODY"

    [ "$with_markup" = "$output" ]
}

@test "a fenced code block is not scored" {
    printf 'Quill sends a link.\n\n```bash\ngh pr edit 1 --body-file body.md\n```\n' > "$BODY"

    scored "$BODY"

    [ "${lines[2]}" = "4 words in 1 sentences" ]
}

@test "every bullet and heading counts as a sentence of its own" {
    cat > "$BODY" <<'EOF'
## What has changed

- **Quill sends a link** to the new address
- **The user clicks it**
EOF
    scored "$BODY"

    [[ "${lines[2]}" == *" in 3 sentences" ]]
}

@test "a body with no words is refused" {
    printf '```\ncode only\n```\n' > "$BODY"

    scored "$BODY"

    [ "$status" -eq 2 ]
    [[ "$output" == *"no words to score"* ]]
}

@test "the script reads as its own docstring says" {
    run python3 "$SCRIPT" "$SCRIPT"

    [ "$status" -eq 0 ]
    [[ "${lines[0]}" == "Flesch reading ease: "* ]]
}
