#!/usr/bin/env bats
# Tests for how stack-status.py reads CI checks into its two marks.
#
# These call `best_conclusion_per_check` directly with a hand-built
# statusCheckRollup, so nothing reaches GitHub. The file name has a hyphen,
# so the module is loaded by path rather than imported.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../stack-status.py"
}

# Prints the kind stack-status gives one check name, from a JSON rollup.
kind_of() {
    python3 - "$SCRIPT" "$1" "$2" <<'PY'
import importlib.util, json, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
# Registered first: its dataclasses look their own module up by name.
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

best = module.best_conclusion_per_check(json.loads(sys.argv[3]))
print(best[sys.argv[2]][0])
PY
}

@test "a cancelled run superseded by one still going reads as pending" {
    # Two pushes a second apart start two runs and CI cancels the older.
    # GitHub hides that run; this showed ✗ ✗ while the real one ran.
    run kind_of "E2E (Playwright)" '[
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "CANCELLED"},
        {"name": "E2E (Playwright)", "status": "IN_PROGRESS", "conclusion": ""}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "pending" ]
}

@test "a cancelled run superseded by one that passed reads as passing" {
    run kind_of "E2E (Playwright)" '[
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "CANCELLED"},
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "SUCCESS"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "passing" ]
}

@test "a cancellation with nothing to replace it is still a failure" {
    # GitHub reads a cancelled required check as a failure, so this must
    # still draw the eye.
    run kind_of "E2E (Playwright)" '[
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "CANCELLED"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "failing" ]
}

@test "a real failure beside a pass still reads as failing" {
    run kind_of "Python unit" '[
        {"name": "Python unit", "status": "COMPLETED", "conclusion": "SUCCESS"},
        {"name": "Python unit", "status": "COMPLETED", "conclusion": "FAILURE"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "failing" ]
}

@test "a draft run's skip is outranked by the ready run's pass" {
    run kind_of "E2E (Playwright)" '[
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "SKIPPED"},
        {"name": "E2E (Playwright)", "status": "COMPLETED", "conclusion": "SUCCESS"}
    ]'
    [ "$status" -eq 0 ]
    [ "$output" = "passing" ]
}

# Prints "heavy" or "fast" for one check name.
tier_of() {
    python3 - "$SCRIPT" "$1" <<'PY'
import importlib.util, sys

spec = importlib.util.spec_from_file_location("stack_status", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules["stack_status"] = module
spec.loader.exec_module(module)

print("heavy" if module.is_heavy(sys.argv[2]) else "fast")
PY
}

@test "a leg of the sharded Storybook job counts as heavy" {
    # ci.yml fans the job out, so it reports as "… (2/3)" beside the gate
    # job that keeps the plain name. Read as fast, a draft's skipped legs
    # would sit in the fast mark.
    run tier_of "Storybook interaction tests (2/3)"
    [ "$status" -eq 0 ]
    [ "$output" = "heavy" ]
}

@test "the Storybook gate job still counts as heavy" {
    run tier_of "Storybook interaction tests"
    [ "$status" -eq 0 ]
    [ "$output" = "heavy" ]
}

@test "the Storybook build, in the fast tier, is not caught by the prefix" {
    run tier_of "typescript_checks (storybook:build)"
    [ "$status" -eq 0 ]
    [ "$output" = "fast" ]
}
