#!/usr/bin/env bats
# Tests for framework-fixtures-refresh.sh, which copies the fixtures from
# the testing repository's main and records the commit in SOURCE.
#
# The testing repository is a local git repository made in each test, so
# nothing reaches the network.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../framework-fixtures-refresh.sh"
    CHECK="${BATS_TEST_DIRNAME}/../../.github/scripts/ci/check-framework-fixtures.sh"
    TESTING="${BATS_TEST_TMPDIR}/testing"
    FIXTURES="${BATS_TEST_TMPDIR}/fixtures"

    git init -q -b main "${TESTING}"
    git -C "${TESTING}" config user.email "test@example.com"
    git -C "${TESTING}" config user.name "Test"
    mkdir -p "${TESTING}/frameworks" "${FIXTURES}"

    echo "framework: {id: clinical}" > "${TESTING}/frameworks/clinical.yaml"
    echo "framework: {id: quill_test}" > "${TESTING}/frameworks/quill_test.yaml"
    git -C "${TESTING}" add -A
    git -C "${TESTING}" commit -q -m "Add the fixtures"

    echo "# What the fixtures folder says about itself" > "${FIXTURES}/README.md"
}

@test "each fixture is copied, and SOURCE records the commit" {
    run bash "$SCRIPT" "$TESTING" "$FIXTURES"

    [ "$status" -eq 0 ]
    cmp "${TESTING}/frameworks/clinical.yaml" "${FIXTURES}/clinical.yaml"
    grep -qx "repository=${TESTING}" "${FIXTURES}/SOURCE"
    grep -qx "commit=$(git -C "${TESTING}" rev-parse HEAD)" "${FIXTURES}/SOURCE"
}

@test "quill_test, the testing repository's own framework, is not copied" {
    run bash "$SCRIPT" "$TESTING" "$FIXTURES"

    [ "$status" -eq 0 ]
    [ ! -e "${FIXTURES}/quill_test.yaml" ]
}

@test "a fixture the testing repository no longer holds is removed here" {
    echo "framework: {id: gone}" > "${FIXTURES}/gone.yaml"

    run bash "$SCRIPT" "$TESTING" "$FIXTURES"

    [ "$status" -eq 0 ]
    [ ! -e "${FIXTURES}/gone.yaml" ]
    [[ "$output" == *"Removed gone.yaml"* ]]
}

@test "the folder's README is left alone" {
    run bash "$SCRIPT" "$TESTING" "$FIXTURES"

    [ "$status" -eq 0 ]
    grep -q "What the fixtures folder says" "${FIXTURES}/README.md"
}

@test "a refreshed copy passes the CI check" {
    bash "$SCRIPT" "$TESTING" "$FIXTURES"

    run bash "$CHECK" "$FIXTURES"

    [ "$status" -eq 0 ]
}

@test "its messages carry its own name" {
    run bash "$SCRIPT" "$TESTING" "$FIXTURES"

    [[ "$output" == *"[framework-fixtures-refresh]"* ]]
}

@test "a missing fixtures folder is refused" {
    run bash "$SCRIPT" "$TESTING" "${BATS_TEST_TMPDIR}/nowhere"

    [ "$status" -eq 1 ]
    [[ "$output" == *"does not exist"* ]]
}
