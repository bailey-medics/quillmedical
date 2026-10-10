#!/usr/bin/env bats
# Planted failing test. Do not merge.

@test "planted failure: proves a failing shell test fails the build" {
  [ 1 -eq 2 ]
}
