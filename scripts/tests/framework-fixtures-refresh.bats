#!/usr/bin/env bats
# Tests for framework-fixtures-refresh.sh, which copies the fixtures from
# the testing repositories and records each commit in SOURCE.
#
# The two testing repositories are local git repositories made in each
# test, so nothing reaches the network.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../framework-fixtures-refresh.sh"
    CHECK="${BATS_TEST_DIRNAME}/../../.github/scripts/ci/check-framework-fixtures.sh"
    FIRST="${BATS_TEST_TMPDIR}/first"
    SECOND="${BATS_TEST_TMPDIR}/second"
    FIXTURES="${BATS_TEST_TMPDIR}/fixtures"

    make_repository "${FIRST}" quill_test
    make_repository "${SECOND}" quill_2_test
    mkdir -p "${FIXTURES}"

    echo "# What the fixtures folder says about itself" > "${FIXTURES}/README.md"
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
    git -C "${path}" add -A
    git -C "${path}" commit -q -m "Add ${framework}"
}

@test "each repository's framework is copied, and SOURCE records each commit" {
    run bash "$SCRIPT" "$FIXTURES" "$FIRST" "$SECOND"

    [ "$status" -eq 0 ]
    cmp "${FIRST}/frameworks/quill_test.yaml" "${FIXTURES}/quill_test.yaml"
    cmp "${SECOND}/frameworks/quill_2_test.yaml" "${FIXTURES}/quill_2_test.yaml"
    grep -qx "source=${FIRST} $(git -C "${FIRST}" rev-parse HEAD)" "${FIXTURES}/SOURCE"
    grep -qx "source=${SECOND} $(git -C "${SECOND}" rev-parse HEAD)" "${FIXTURES}/SOURCE"
}

@test "a branch after # is copied from that branch, and its commit recorded" {
    git -C "${FIRST}" switch -q -c feature/next
    framework_text quill_test 2 > "${FIRST}/frameworks/quill_test.yaml"
    git -C "${FIRST}" commit -q -am "Raise quill_test"
    git -C "${FIRST}" switch -q main

    run bash "$SCRIPT" "$FIXTURES" "${FIRST}#feature/next" "$SECOND"

    [ "$status" -eq 0 ]
    grep -q "version: 2" "${FIXTURES}/quill_test.yaml"
    grep -qx "source=${FIRST} $(git -C "${FIRST}" rev-parse feature/next)" "${FIXTURES}/SOURCE"
}

@test "every version is copied into history/, each at its own number" {
    framework_text quill_test 2 > "${FIRST}/frameworks/quill_test.yaml"
    git -C "${FIRST}" commit -q -am "Raise quill_test"

    run bash "$SCRIPT" "$FIXTURES" "$FIRST" "$SECOND"

    [ "$status" -eq 0 ]
    grep -q "version: 1" "${FIXTURES}/history/quill_test/1.yaml"
    grep -q "version: 2" "${FIXTURES}/history/quill_test/2.yaml"
    grep -q "version: 1" "${FIXTURES}/history/quill_2_test/1.yaml"
}

@test "a history/ left over from an earlier refresh is replaced" {
    mkdir -p "${FIXTURES}/history/gone"
    echo "old" > "${FIXTURES}/history/gone/1.yaml"

    run bash "$SCRIPT" "$FIXTURES" "$FIRST" "$SECOND"

    [ "$status" -eq 0 ]
    [ ! -e "${FIXTURES}/history/gone" ]
}

@test "the same framework in two repositories is refused" {
    cp "${FIRST}/frameworks/quill_test.yaml" "${SECOND}/frameworks/"
    git -C "${SECOND}" add -A
    git -C "${SECOND}" commit -q -m "Add quill_test here too"

    run bash "$SCRIPT" "$FIXTURES" "$FIRST" "$SECOND"

    [ "$status" -eq 1 ]
    [[ "$output" == *"quill_test.yaml is in more than one testing repository"* ]]
}

@test "a fixture no repository holds any more is removed here" {
    echo "framework: {id: gone}" > "${FIXTURES}/gone.yaml"

    run bash "$SCRIPT" "$FIXTURES" "$FIRST" "$SECOND"

    [ "$status" -eq 0 ]
    [ ! -e "${FIXTURES}/gone.yaml" ]
    [[ "$output" == *"Removed gone.yaml"* ]]
}

@test "the folder's README is left alone" {
    run bash "$SCRIPT" "$FIXTURES" "$FIRST" "$SECOND"

    [ "$status" -eq 0 ]
    grep -q "What the fixtures folder says" "${FIXTURES}/README.md"
}

@test "a refreshed copy passes the CI check" {
    bash "$SCRIPT" "$FIXTURES" "$FIRST" "$SECOND"

    run bash "$CHECK" "$FIXTURES"

    [ "$status" -eq 0 ]
}

@test "its messages carry its own name" {
    run bash "$SCRIPT" "$FIXTURES" "$FIRST" "$SECOND"

    [[ "$output" == *"[framework-fixtures-refresh]"* ]]
}

@test "a missing fixtures folder is refused" {
    run bash "$SCRIPT" "${BATS_TEST_TMPDIR}/nowhere" "$FIRST" "$SECOND"

    [ "$status" -eq 1 ]
    [[ "$output" == *"does not exist"* ]]
}
