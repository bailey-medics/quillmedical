#!/usr/bin/env bats
# Tests for check-framework-fixtures.sh, which fails when the fixtures
# folder differs from the testing repository at the commit SOURCE records.
#
# The testing repository is a local git repository made in each test, so
# nothing reaches the network.

bats_require_minimum_version 1.5.0

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/check-framework-fixtures.sh"
    TESTING="${BATS_TEST_TMPDIR}/testing"
    FIXTURES="${BATS_TEST_TMPDIR}/fixtures"

    git init -q -b main "${TESTING}"
    git -C "${TESTING}" config user.email "test@example.com"
    git -C "${TESTING}" config user.name "Test"
    mkdir -p "${TESTING}/frameworks" "${FIXTURES}"

    echo "framework: {id: clinical}" > "${TESTING}/frameworks/clinical.yaml"
    echo "framework: {id: ruh_sact_passport}" > "${TESTING}/frameworks/ruh_sact_passport.yaml"
    echo "framework: {id: quill_test}" > "${TESTING}/frameworks/quill_test.yaml"
    commit_testing "Add the fixtures"

    cp "${TESTING}/frameworks/clinical.yaml" "${TESTING}/frameworks/ruh_sact_passport.yaml" "${FIXTURES}/"
    write_source "$(git -C "${TESTING}" rev-parse HEAD)"
}

commit_testing() {
    git -C "${TESTING}" add -A
    git -C "${TESTING}" commit -q -m "$1"
}

write_source() {
    printf '# Written by the refresh.\nrepository=%s\ncommit=%s\n' "${TESTING}" "$1" > "${FIXTURES}/SOURCE"
}

@test "a copy that matches the recorded commit passes" {
    run bash "$SCRIPT" "$FIXTURES"

    [ "$status" -eq 0 ]
    [[ "$output" == *"Every fixture matches"* ]]
}

@test "quill_test, the testing repository's own framework, is not expected here" {
    run bash "$SCRIPT" "$FIXTURES"

    [ "$status" -eq 0 ]
    [[ "$output" != *"quill_test"* ]]
}

@test "a fixture edited here by hand fails, and is named" {
    echo "edited: true" >> "${FIXTURES}/clinical.yaml"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"clinical.yaml differs from the testing repository"* ]]
    [[ "$output" != *"ruh_sact_passport.yaml"* ]]
    [[ "$output" == *"just framework-fixtures-refresh"* ]]
}

@test "a fixture added here and not there fails, and is named" {
    echo "framework: {id: extra}" > "${FIXTURES}/extra.yaml"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"extra.yaml is here but not in the testing repository"* ]]
}

@test "a fixture missing here fails, and is named" {
    rm "${FIXTURES}/ruh_sact_passport.yaml"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"ruh_sact_passport.yaml is in the testing repository but not here"* ]]
}

@test "a merge to the testing repository after the recorded commit changes nothing" {
    echo "framework: {id: clinical, changed: true}" > "${TESTING}/frameworks/clinical.yaml"
    commit_testing "Change clinical"

    run bash "$SCRIPT" "$FIXTURES"

    [ "$status" -eq 0 ]
}

@test "the copy is compared with the recorded commit, not the latest" {
    echo "framework: {id: clinical, changed: true}" > "${TESTING}/frameworks/clinical.yaml"
    commit_testing "Change clinical"
    cp "${TESTING}/frameworks/clinical.yaml" "${FIXTURES}/"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"clinical.yaml differs"* ]]
}

@test "a missing SOURCE fails and says how to make it" {
    rm "${FIXTURES}/SOURCE"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"SOURCE is missing"* ]]
    [[ "$output" == *"just framework-fixtures-refresh"* ]]
}

@test "a SOURCE with no commit fails" {
    printf 'repository=%s\n' "${TESTING}" > "${FIXTURES}/SOURCE"

    run ! bash "$SCRIPT" "$FIXTURES"

    [[ "$output" == *"names no repository or no commit"* ]]
}

@test "SOURCE's comment lines are not read as the commit" {
    run bash -c "source '$SCRIPT' && source_value '${FIXTURES}/SOURCE' commit"

    [ "$status" -eq 0 ]
    [ "$output" = "$(git -C "${TESTING}" rev-parse HEAD)" ]
}

@test "the committed SOURCE names the testing repository and a full commit" {
    local source_file="${BATS_TEST_DIRNAME}/../../../shared/framework-fixtures/SOURCE"

    run bash -c "source '$SCRIPT' && source_value '${source_file}' repository && source_value '${source_file}' commit"

    [ "$status" -eq 0 ]
    [ "${lines[0]}" = "https://github.com/bailey-medics/quill-medical-framework-testing.git" ]
    [[ "${lines[1]}" =~ ^[0-9a-f]{40}$ ]]
}
