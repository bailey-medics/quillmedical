#!/usr/bin/env bats
# Tests for check-no-tests-in-image.sh
#
# Against listings written here, so the suite needs no Docker. What the
# real image holds is what the E2E job finds out.

setup() {
  source "${BATS_TEST_DIRNAME}/check-no-tests-in-image.sh"
}

@test "passes an image holding application code and no tests" {
  run check_listing <<<"/app/app/main.py
/app/app/email/brand.py
/app/app/compat_harness_endpoints.py"

  [ "$status" -eq 0 ]
  [[ "$output" == *"3 Python files in the image, none of them tests"* ]]
}

@test "fails when a test beside its module is in the image" {
  run check_listing <<<"/app/app/main.py
/app/app/email/brand.py
/app/app/email/brand_test.py"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Test code is in the production image"* ]]
  [[ "$output" == *"/app/app/email/brand_test.py"* ]]
}

@test "fails when the shared fixtures file is in the image" {
  run check_listing <<<"/app/app/main.py
/app/conftest.py"

  [ "$status" -eq 1 ]
  [[ "$output" == *"/app/conftest.py"* ]]
}

@test "does not mistake a source file starting with test_ for a test" {
  # The rule is the suffix. A module was once called test_api_endpoints.py.
  run check_listing <<<"/app/app/main.py
/app/app/test_helpers.py
/app/app/contest.py"

  [ "$status" -eq 0 ]
}

@test "fails when it finds no application code to check" {
  # Looking in the wrong place must not read as a clean image
  run check_listing <<<"/somewhere/else.py"

  [ "$status" -eq 1 ]
  [[ "$output" == *"nothing was checked"* ]]
}

@test "fails on an empty listing" {
  run check_listing <<<""

  [ "$status" -eq 1 ]
  [[ "$output" == *"nothing was checked"* ]]
}

@test "main asks for an image when given none" {
  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: check-no-tests-in-image.sh <image>"* ]]
}

@test "main checks what the image lists" {
  list_image_files() {
    echo "/app/app/main.py"
    echo "/app/app/security_test.py"
  }

  run main "some-image"

  [ "$status" -eq 1 ]
  [[ "$output" == *"/app/app/security_test.py"* ]]
}
