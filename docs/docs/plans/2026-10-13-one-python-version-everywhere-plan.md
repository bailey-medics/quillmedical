# One Python version everywhere plan

`.python-version` says 3.14.7, and three things already hold other places
to it: `check-version-consistency.sh` compares it with the Docker tag and
mypy's `python_version`, `check-python-version.sh` compares it with the
backend's Poetry environment on a developer's machine, and the
`setup-python` action installs it in every job that calls the action. All
three compare places that name a Python. On 13 October 2026 two places
turned out to name none, and so were checked by nothing: two CI jobs run
Python scripts on whatever the runner ships, and Ruff and Black were
still targeting 3.13 a release after the backend moved to 3.14.

The two gaps met when the targets were moved to `py314` by hand. Both
tools rewrote `except (A, B):` without its brackets, which no Python
before 3.14 can read, and `scripts/stack-status.py` stopped with a syntax
error on a machine whose `python3` was 3.13. The change was undone. The
aim here is one Python version in every place the repository's Python
runs, and a check on each place that could drift from it again.

## Phase 1: Set Python up in the CI jobs that run it bare

- [x] Add the `.github/actions/setup-python` step to the `audit_ledger`
      job in `.github/workflows/ci.yml`. The job runs
      `python3 scripts/review-ledger.py verify` with no Python set up, so
      it gets the `ubuntu-24.04` runner's own, which is 3.12. That figure
      is from the runner image and not from a log: neither job prints a
      version, so the first run after this step should print
      `python3 --version` once to confirm what it replaced.

      This comes first because Phase 4 breaks the job otherwise. The
      [CI that holds under load](2026-10-12-ci-that-holds-under-load-plan.md)
      plan took Python installs out of jobs that did not need the
      project's own, to stop a failed download failing a merge queue run.
      That reasoning does not apply here: these jobs run the project's
      scripts, and the action now keeps the installed Python between runs
      with `actions/cache`, so the cost is a cache restore and not a
      download. Pass whatever input stops the action installing Poetry:
      neither job needs it.

      Done with `install-backend-deps: "false"`. The job has a step
      before the setup, "Say which Python the runner ships", that prints
      `python3 --version`. It is there to be read once and is removed in
      Phase 3, where the answer is recorded.

- [x] Add the same step to the `shell_checks` job. It runs
      `run-shell-tests.sh scripts/tests`, and the bats suites there call
      `stack-status.py`, `stack-relink.py`, `stack-forget-merged.py`,
      `review-ledger.py`, `shell-test-coverage.py` and
      `trim-question-image-frames.py`. The Python is one step removed from
      the workflow file, which is why reading the workflow did not show it.

- [x] Add it to two more jobs, found while writing Phase 2's check by
      reading which scripts under `.github/scripts` run a Python file.
      Both reach Python through a shell script, as `shell_checks` does:

      - **`heavy_db_migration_immutability_check`** in `ci.yml` - calls
        `check-migrations-unmodified.sh`, which runs
        `backend/scripts/compare_migration_code.py`.
      - **`db_destructive_migration_check`** in `gate-breaking.yml` -
        calls `detect-destructive-migrations.sh`, which runs
        `backend/scripts/check_migrations.py`.

      The first carried a comment saying it had no setup step on purpose:
      the comparer needs nothing installed, and the runner ships a
      `python3`. That was true and is not the point any more. Both files
      are in `backend/`, so Phase 4 formats them for 3.14, and the first
      of these jobs runs in the merge queue. The day either file gains an
      `except` naming two exceptions, every pull request would fail a
      required check with a syntax error. The comment is rewritten to say
      so.

## Phase 2: Fail a CI job that runs Python without setting it up

- [x] Write `.github/scripts/ci/check-python-is-set-up.sh`. It reads
      every file in `.github/workflows/` and fails, naming the file and
      the job, when a job runs Python on the runner and has no step using
      `.github/actions/setup-python`.

      A job runs Python on the runner when a `run:` line calls `python`
      or `python3`, or names a path ending `.py`. A line that runs Python
      inside a container does not count, since the container brings its
      own: `docker compose ... exec`, `docker compose ... run` and
      `docker run`. `guide-screenshots.yml` seeds its database that way
      and is correct as it is.

      Python reached through another script cannot be seen in the
      workflow, and that is the case that hid `shell_checks`. So the
      script keeps a short list of commands known to run Python, starting
      with `run-shell-tests.sh`, and treats a job calling one as running
      Python. A list and not a search through every script a job calls:
      following calls from shell into shell is where a check like this
      becomes something nobody trusts. The list is where the next
      indirect runner is added, and its comment says so.

      Built as described, with four things settled along the way:

      - **The list has three entries** - `run-shell-tests.sh`,
        `check-migrations-unmodified.sh` and
        `detect-destructive-migrations.sh`, the last two from the jobs
        added to Phase 1.
      - **`actions/setup-python@` counts as setting Python up** - two
        jobs call the upstream action directly, with
        `python-version-file: .python-version`, and are correct.
      - **Two uses of Python are left out on purpose** -
        `python3 -m http.server` in `run-storybook-tests-in-image.sh` and
        the inline script in `statement-review.sh`. Neither runs a file
        from this repository, so neither is formatted by Black, and
        neither is on the list.
      - **The workflows are read as text, by indentation** - a job is a
        key two spaces in under `jobs:`. There is no YAML reader on the
        runner without installing one, every workflow here is written
        that way, and actionlint already fails one that is not valid.

      Run over the workflows as they were before Phase 1, it names all
      four jobs. Run over them now, it reads 23 files and passes.

- [x] Give the script a floor, as every "check all" here has: it fails if
      it found no workflow files, or found no job that sets Python up. A
      check that reads nothing passes, and `audit_ledger` passing on the
      runner's Python for weeks is the same fault in another place.

- [x] Add `check-python-is-set-up.bats` beside it, with fixture workflows
      for: a job running `python3` with no setup (fails), the same job
      with the setup step (passes), Python inside `docker compose exec`
      (passes), a job calling `run-shell-tests.sh` with no setup (fails),
      and an empty workflows folder (fails on the floor).

      Seventeen cases. The ones that assert the script stays quiet were
      each proved able to fail, by breaking the script three ways in a
      copy: with container detection removed, with step names read as
      commands, and with lines no longer joined across a backslash.

- [x] Run it in the `version_consistency` job in `ci.yml`, after
      `check-version-consistency.sh`. It belongs with the other check
      that compares versions across files. That job runs on every push
      and not in the merge queue, which is enough: the check reads the
      workflow files, and a pull request cannot change those without
      pushing.

## Phase 3: Say so when the machine's own Python is the wrong one

- [ ] Read which Python the runner ships from the "Say which Python the
      runner ships" step in an `audit_ledger` run, record it here, and
      take the step out of `ci.yml`. It was added in Phase 1 to be read
      once.

- [ ] Extend `scripts/check-python-version.sh` to compare the `python3`
      on the `PATH` with `.python-version`, at the same two-part
      granularity it uses now. Today it checks the backend's Poetry
      environment and the hooks' `language_version`, and not the bare
      `python3` that `just stack-log`, `just reviewed` and the audit
      ledger hook run their scripts with.

      This has to land before Phase 4. After the targets move, a script
      meeting an older Python fails at the first line it cannot read,
      before any guard inside the file can run, and the message is a bare
      `SyntaxError`. The check runs first, from the "local Python matches
      CI" hook and from the recipes, and names the command that fixes it.

      On 13 October the stale `python3` was an orphaned Poetry
      environment in the cache, on 3.13, that the editor had activated in
      its terminals. The message should say that an activated virtual
      environment can be the cause, since `python3 --version` on a fresh
      shell looked correct throughout.

- [ ] Call the check from the stack recipes that run a Python script
      (`stack-log`, `stack-log-long`, `stack-fresh`, `stack-sync`), by
      the same `@bash scripts/check-python-version.sh` line the Justfile
      uses already. A failed check must stop the recipe: a stack command
      that half runs is worse than one that refuses.

- [ ] Check what `python3` is in a Claude Code on the web session, and
      record the answer here. The stack scripts and the audit ledger hook
      run there too, and nothing in this repository chooses that
      container's Python. If it is older than 3.14, have
      `.claude/hooks/session-start.sh` report it at session start, so the
      first sign is a sentence and not a syntax error.

- [ ] Update `scripts/tests/check-python-version.bats` for the new
      comparison: a matching `python3` passes, an older one fails with
      the fix named, and a missing one fails.

## Phase 4: Move Ruff and Black to the backend's Python

- [ ] Change both `target-version` lines in `backend/pyproject.toml` from
      `py313` to `py314`, and remove the comment above `[tool.ruff]` that
      explains why they were held back. Phases 1 and 3 are what make that
      comment untrue.

- [ ] Run the Ruff and Black hooks over every file and commit what they
      change, in a pull request holding nothing else. On 13 October that
      was 22 files: `except` clauses losing their brackets, and return
      types losing their quotes. Three of them are in the root `scripts/`
      folder, because the Black hook passes
      `--config=backend/pyproject.toml` for every Python file in the
      repository. A reformat mixed with a real change hides the change.

- [ ] Run the full backend unit suite, `just ub`, and the script tests,
      `bash .github/scripts/ci/run-shell-tests.sh scripts/tests`, before
      pushing. A change of syntax across this many modules is the wide
      blast radius the test tiers make an exception for.

## Phase 5: Hold the Ruff and Black targets to `.python-version`

- [ ] Add both targets to `check_python` in
      `.github/scripts/ci/check-version-consistency.sh`. Read
      `target-version = "py314"` under `[tool.ruff]` and
      `target-version = ["py314"]` under `[tool.black]`, turn `py314`
      into `3.14`, and compare each with `.python-version` as the Docker
      tag and mypy's version are compared now. The function reads mypy's
      version from the same file and stops there, which is how the
      targets stayed a release behind without failing anything.

      Last, because it fails until Phase 4 has landed.

- [ ] Fail when a target line is missing, and say which. An absent line
      reads as an empty string, and an empty string must not be allowed
      to match.

- [ ] Add cases to `check-version-consistency.bats`: both targets
      matching (passes), Ruff behind (fails, naming Ruff), Black behind
      (fails, naming Black), and a target line removed (fails).

- [ ] Say in the "Python version" row of the single-source section of
      `docs/docs/conventions/index.md` that the Docker tag, mypy's
      `python_version` and the Ruff and Black targets each repeat the
      version, and that `check-version-consistency.sh` is what holds them
      to `.python-version`. The page says a version is "a one-line edit
      in one place", which has not been true of Python: moving to a new
      one means changing each of those lines in the same pull request,
      and the check failing is how a missed one is found.

## Decisions

- **One target for every Python file, not one for the backend and one
  for the root scripts** - a split would have let the backend move to
  `py314` with no change to CI. It was turned down because it writes the
  drift into the configuration: the root scripts would be formatted for a
  Python the repository does not otherwise name, and the Black hook would
  need a second config and a rule for which file gets which. One version,
  with a check on each place it runs, is less to hold in mind.

- **Python is set up in the two jobs, not the scripts written for an
  older Python** - keeping the root scripts readable by 3.12 would mean a
  standing rule that those nine files may not use what the rest of the
  codebase does, enforced by nothing. Setting Python up costs a cache
  restore per job.

- **The new CI check keeps a list of indirect runners** - it does not
  follow calls through shell scripts to find Python. That would catch
  more and be right less often. The cost is that a new script which runs
  Python on the runner has to be added to the list by hand, and Phase 2's
  test for `run-shell-tests.sh` is the reminder of what that looks like.
