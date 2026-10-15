#!/usr/bin/env bats
# Tests for check-python-is-set-up.sh
#
# Each test writes a small workflow into a temp directory and runs the
# script over it, so a test cannot pass or fail because somebody changed
# a real workflow.
#
# The script exists to break a silence: a job on the runner's own Python
# reports nothing. So the tests care most about the ways it could stay
# quiet when it should not: Python reached through another script, a
# command split over two lines, and a run that read nothing at all.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/check-python-is-set-up.sh"
  WORKFLOWS="${BATS_TEST_TMPDIR}/workflows"
  mkdir -p "$WORKFLOWS"

  # A job that sets Python up and runs it. Every test keeps this one, so
  # that a failure is about the job the test adds and not about the floor.
  cat > "${WORKFLOWS}/good.yml" <<'EOF'
name: Good
on: push
jobs:
  unit:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - name: Set up Python
        uses: ./.github/actions/setup-python
      - name: Run the tests
        run: python -m pytest
EOF
}

# Writes a workflow holding one job, named `subject`, with the given steps.
write_job() {
  local steps="$1"

  cat > "${WORKFLOWS}/subject.yml" <<EOF
name: Subject
on: push
jobs:
  subject:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
${steps}
EOF
}

@test "passes when the only job that runs Python sets it up" {
  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 0 ]
  [[ "$output" == *"Every job that runs Python sets it up"* ]]
}

@test "fails when a job runs python3 with no setup step" {
  write_job "      - name: Check the ledger
        run: python3 scripts/audit-stamp.py verify"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 1 ]
  [[ "$output" == *"subject.yml: job 'subject' runs Python and does not set it up"* ]]
}

@test "passes when the same job sets Python up" {
  write_job "      - name: Set up Python
        uses: ./.github/actions/setup-python
        with:
          install-backend-deps: \"false\"
      - name: Check the ledger
        run: python3 scripts/audit-stamp.py verify"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 0 ]
}

@test "accepts the setup-python action this repository's own one wraps" {
  write_job "      - uses: actions/setup-python@v7.0.0
        with:
          python-version-file: .python-version
      - run: python scripts/dump.py"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 0 ]
}

@test "fails when a job names a .py file without calling python" {
  write_job "      - name: Run the script directly
        run: ./scripts/stack-status.py --check"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 1 ]
  [[ "$output" == *"job 'subject' runs Python"* ]]
}

@test "fails when a job reaches Python through the shell test runner" {
  write_job "      - name: Run shell script tests
        run: |
          bash .github/scripts/ci/run-shell-tests.sh scripts/tests"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 1 ]
  [[ "$output" == *"job 'subject' runs Python"* ]]
}

@test "fails when a job reaches Python through a migration check" {
  write_job "      - name: Check no merged migration was rewritten
        run: bash .github/scripts/ci/check-migrations-unmodified.sh origin/main"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 1 ]
}

@test "leaves alone Python that runs inside a container" {
  write_job "      - name: Seed the database
        run: docker compose -f compose.ci.yml exec -T backend python scripts/seed_ci.py"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 0 ]
}

@test "leaves alone a container command split over two lines" {
  write_job "      - name: Seed the database
        run: |
          docker compose -f compose.ci.yml exec -T backend \\
            python scripts/seed_ci.py"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 0 ]
}

@test "does not take a step's name or a comment for a command" {
  write_job "      # python3 scripts/old.py used to run here
      - name: Tell the python team about review.py
        run: echo done"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 0 ]
}

@test "does not take python-version or a path to an interpreter for a command" {
  write_job "      - uses: actions/setup-node@v6.0.0
        with:
          python-version: 3.14
      - run: .venv/bin/python -m pip install pre-commit"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 0 ]
}

@test "judges each job in a workflow on its own" {
  cat > "${WORKFLOWS}/two.yml" <<'EOF'
name: Two
on: push
jobs:
  first:
    runs-on: ubuntu-24.04
    steps:
      - uses: ./.github/actions/setup-python
      - run: python -m pytest
  second:
    runs-on: ubuntu-24.04
    steps:
      - run: python3 scripts/audit-stamp.py verify
EOF

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 1 ]
  [[ "$output" == *"job 'second' runs Python"* ]]
  [[ "$output" != *"job 'first'"* ]]
}

@test "reads nothing after the jobs end" {
  cat > "${WORKFLOWS}/after.yml" <<'EOF'
name: After
jobs:
  only:
    runs-on: ubuntu-24.04
    steps:
      - run: echo done
defaults:
  run:
    shell: python3 scripts/not-a-job.py
EOF

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 0 ]
}

@test "fails when the directory holds no workflows" {
  rm "${WORKFLOWS}/good.yml"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No workflow files found"* ]]
}

@test "fails when no job anywhere sets Python up" {
  rm "${WORKFLOWS}/good.yml"
  write_job "      - run: echo done"

  run bash "$SCRIPT" "$WORKFLOWS"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No job in"*"sets Python up"* ]]
}

@test "fails when no directory is given" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No workflows directory given"* ]]
}

@test "fails when the directory does not exist" {
  run bash "$SCRIPT" "${BATS_TEST_TMPDIR}/missing"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No such directory"* ]]
}
