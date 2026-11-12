#!/usr/bin/env bats
# Tests for start-app-args.sh, which sorts what `just sa` was given into a
# brand and whether to build. The order must not matter, and `just sa b`
# must keep meaning what it always has.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../start-app-args.sh"
}

@test "nothing given is Quill, without a build" {
    run bash "${SCRIPT}"

    [ "$status" -eq 0 ]
    [ "$output" = "quill no" ]
}

@test "b alone still builds Quill" {
    run bash "${SCRIPT}" b

    [ "$status" -eq 0 ]
    [ "$output" = "quill yes" ]
}

@test "a brand alone runs as that brand without a build" {
    run bash "${SCRIPT}" ldd

    [ "$status" -eq 0 ]
    [ "$output" = "ldd no" ]
}

@test "a brand then b builds that brand" {
    run bash "${SCRIPT}" ldd b

    [ "$status" -eq 0 ]
    [ "$output" = "ldd yes" ]
}

@test "b then a brand means the same" {
    run bash "${SCRIPT}" b ldd

    [ "$status" -eq 0 ]
    [ "$output" = "ldd yes" ]
}

@test "an unknown brand is refused, naming the known ones" {
    run bash "${SCRIPT}" nowhere

    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown brand 'nowhere': quill or ldd."* ]]
}

@test "two brands are refused" {
    run bash "${SCRIPT}" quill ldd

    [ "$status" -eq 1 ]
    [[ "$output" == *"One brand at a time"* ]]
}
