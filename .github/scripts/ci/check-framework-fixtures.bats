#!/usr/bin/env bats
# Tests for check-framework-fixtures.sh, which fails when the fixtures
# folder differs from the testing repositories at the commits SOURCE
# records.
#
# The two testing repositories are local git repositories made in each
# test, so nothing reaches the network.

bats_require_minimum_version 1.5.0

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/check-framework-fixtures.sh"
    FIRST="${BATS_TEST_TMPDIR}/first"
    SECOND="${BATS_TEST_TMPDIR}/second"
    FIXTURES="${BATS_TEST_TMPDIR}/fixtures"

    make_repository "${FIRST}" quill_test
    make_repository "${SECOND}" quill_2_test
    mkdir -p "${FIXTURES}"

    cp "${FIRST}/frameworks/quill_test.yaml" "${SECOND}/frameworks/quill_2_test.yaml" "${FIXTURES}/"
    mkdir -p "${FIXTURES}/history/quill_test" "${FIXTURES}/history/quill_2_test"
    cp "${FIRST}/frameworks/quill_test.yaml" "${FIXTURES}/history/quill_test/1.yaml"
    cp "${SECOND}/frameworks/quill_2_test.yaml" "${FIXTURES}/history/quill_2_test/1.yaml"
    write_source "$(head_of "${FIRST}")" "$(head_of "${SECOND}")"
}

framework_text() {
    printf 'framework:\n  id: %s\n  version: %s\n' "$1" "$2"
}

make_repository() {
    local path="$1"
    local framework="$2"

    git init -q -b main "${path}"
    git -C "${path}" config user.email "test@example.com"
    git -C "${path}" config user.name "Test"
    mkdir -p "${path}/frameworks"
    framework_text "${framework}" 1 > "${path}/frameworks/${framework}.yaml"
    commit "${path}" "Add ${framework}"
}

commit() {
    git -C "$1" add -A
    git -C "$1" commit -q -m "$2"
}

head_of() {
    git -C "$1" rev-parse HEAD
}

write_source() {
    printf '# Written by the refresh.\nsource=%s %s\nsource=%s %s\n' \
        "${FIRST}" "$1" "${SECOND}" "$2" > "${FIXTURES}/SOURCE"
}

@test "a copy that matches both recorded commits passes" {
    run bash "$SCRIPT" "$FIXTURES"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Every fixture matches"* ]]
}

@test "each testing repository's framework is a fixture, quill_test included" {
    rm "${FIXTURES}/quill_test.yaml"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"quill_test.yaml is in a testing repository but not here"* ]]
}

@test "a fixture edited here by hand fails, and is named" {
    echo "edited: true" >> "${FIXTURES}/quill_2_test.yaml"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"quill_2_test.yaml differs from its testing repository"* ]]
    [[ "$output" != *"quill_test.yaml differs"* ]]
    [[ "$output" == *"just framework-fixtures-refresh"* ]]
}

@test "a fixture added here and in no repository fails, and is named" {
    echo "framework: {id: extra}" > "${FIXTURES}/extra.yaml"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"extra.yaml is here but in no testing repository"* ]]
}

@test "the same framework in both repositories fails, and is named" {
    cp "${FIRST}/frameworks/quill_test.yaml" "${SECOND}/frameworks/"
    commit "${SECOND}" "Add quill_test here too"
    write_source "$(head_of "${FIRST}")" "$(head_of "${SECOND}")"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"quill_test.yaml is in more than one testing repository"* ]]
}

@test "a merge to a testing repository after the recorded commit changes nothing" {
    framework_text quill_2_test 2 > "${SECOND}/frameworks/quill_2_test.yaml"
    commit "${SECOND}" "Change quill_2_test"

    run bash "$SCRIPT" "$FIXTURES"

    [ "$status" -eq 0 ]
}

@test "the copy is compared with the recorded commit, not the latest" {
    framework_text quill_2_test 2 > "${SECOND}/frameworks/quill_2_test.yaml"
    commit "${SECOND}" "Change quill_2_test"
    cp "${SECOND}/frameworks/quill_2_test.yaml" "${FIXTURES}/"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"quill_2_test.yaml differs"* ]]
}

@test "a commit on a branch that has not merged is read" {
    git -C "${SECOND}" switch -q -c feature/next
    framework_text quill_2_test 2 > "${SECOND}/frameworks/quill_2_test.yaml"
    commit "${SECOND}" "Raise quill_2_test"
    git -C "${SECOND}" switch -q main
    git -C "${SECOND}" show feature/next:frameworks/quill_2_test.yaml > "${FIXTURES}/quill_2_test.yaml"
    cp "${FIXTURES}/quill_2_test.yaml" "${FIXTURES}/history/quill_2_test/2.yaml"
    write_source "$(head_of "${FIRST}")" "$(git -C "${SECOND}" rev-parse feature/next)"

    run bash "$SCRIPT" "$FIXTURES"

    [ "$status" -eq 0 ]
}

@test "every version in a repository's history is expected under history/" {
    framework_text quill_test 2 > "${FIRST}/frameworks/quill_test.yaml"
    commit "${FIRST}" "Raise quill_test"
    cp "${FIRST}/frameworks/quill_test.yaml" "${FIXTURES}/"
    write_source "$(head_of "${FIRST}")" "$(head_of "${SECOND}")"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"history/quill_test/2.yaml is in a testing repository but not here"* ]]
    [[ "$output" != *"history/quill_test/1.yaml"* ]]
}

@test "a version's history keeps the first text it appeared with" {
    framework_text quill_test 1 > "${FIRST}/frameworks/quill_test.yaml"
    echo "# A comment, so the same version has a second text" >> "${FIRST}/frameworks/quill_test.yaml"
    commit "${FIRST}" "Comment on quill_test"
    cp "${FIRST}/frameworks/quill_test.yaml" "${FIXTURES}/"
    write_source "$(head_of "${FIRST}")" "$(head_of "${SECOND}")"

    run bash "$SCRIPT" "$FIXTURES"

    [ "$status" -eq 0 ]
}

@test "a version edited by hand in history/ fails, and is named" {
    echo "edited: true" >> "${FIXTURES}/history/quill_test/1.yaml"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"history/quill_test/1.yaml differs from its testing repository"* ]]
}

@test "a missing SOURCE fails and says how to make it" {
    rm "${FIXTURES}/SOURCE"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"SOURCE is missing"* ]]
    [[ "$output" == *"just framework-fixtures-refresh"* ]]
}

@test "a SOURCE naming no repository fails" {
    printf '# Nothing here.\n' > "${FIXTURES}/SOURCE"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"names no testing repository"* ]]
}

@test "a source line with no commit fails" {
    printf 'source=%s\n' "${FIRST}" > "${FIXTURES}/SOURCE"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"no repository or no commit"* ]]
}

@test "SOURCE's comment lines are not read as a source" {
    run bash -c "source '$SCRIPT' && source_entries '${FIXTURES}/SOURCE'"

    [ "$status" -eq 0 ]
    [ "${#lines[@]}" -eq 2 ]
    [ "${lines[0]}" = "${FIRST} $(head_of "${FIRST}")" ]
}

@test "the committed SOURCE names both testing repositories, each with a full commit" {
    local source_file="${BATS_TEST_DIRNAME}/../../../shared/framework-fixtures/SOURCE"

    run bash -c "source '$SCRIPT' && source_entries '${source_file}'"

    [ "$status" -eq 0 ]
    [ "${#lines[@]}" -eq 2 ]
    [[ "${lines[0]}" =~ ^https://github\.com/bailey-medics/quill-medical-framework-testing\.git\ [0-9a-f]{40}$ ]]
    [[ "${lines[1]}" =~ ^https://github\.com/bailey-medics/quill-medical-2-framework-testing\.git\ [0-9a-f]{40}$ ]]
}
