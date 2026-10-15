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
      `python3 scripts/audit-stamp.py verify` with no Python set up, so
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
      `audit-stamp.py`, `shell-test-coverage.py` and
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

- [x] Read which Python the runner ships from the "Say which Python the
      runner ships" step in an `audit_ledger` run, record it here, and
      take the step out of `ci.yml`. It was added in Phase 1 to be read
      once.

      Python 3.12.3, on `ubuntu-24.04`. The same run restored the pinned
      one from the cache ("Cache hit for:
      python-install-Linux-X64-ubuntu24-3.14.7"), so setting Python up
      in these jobs downloaded nothing.

- [x] Extend `scripts/check-python-version.sh` to compare the `python3`
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

      Done, with one addition: `check-python-version.sh host` checks
      `python3` and nothing else. The full check asks Poetry which Python
      the backend's environment is on, which takes a second or more and
      fails where there is no environment. A stack recipe needs neither,
      and `just stack-log` is meant to be instant. The host check takes
      about a tenth of a second.

      The message blames a virtual environment only when `python3` is
      inside the one that is active. On 13 October `VIRTUAL_ENV` still
      named a deleted environment while `python3` came from elsewhere,
      and saying "deactivate" there would have been wrong.

- [x] Call the check from the stack recipes that run a Python script
      (`stack-log`, `stack-log-long`, `stack-fresh`, `stack-sync`), by
      the same `@bash scripts/check-python-version.sh` line the Justfile
      uses already. A failed check must stop the recipe: a stack command
      that half runs is worse than one that refuses.

      Wider than the four named: every recipe that runs a script from
      `scripts/` on the host calls a new private recipe,
      `_host-python-guard`. That is the fifteen stack recipes,
      `_stack-guard`, and `review-diff`, `review-status`, `reviewed` and
      `unreviewed`. Any of them fails the same way on an older Python, so
      guarding four would have left the rest to the bare error.

      The call sits before `stack_repo` changes directory. With
      `STACK_REPO` set the recipe moves into a teaching repository,
      which has no Justfile to find the guard in and no
      `.python-version` to read.

- [x] Check what `python3` is in a Claude Code on the web session, and
      record the answer here. The stack scripts and the audit ledger hook
      run there too, and nothing in this repository chooses that
      container's Python. If it is older than 3.14, have
      `.claude/hooks/session-start.sh` report it at session start, so the
      first sign is a sentence and not a syntax error.

      Not checked: this was built in a local session, and there was no
      web session to ask. So the hook does not depend on the answer. It
      runs `check-python-version.sh host` at session start and prints
      the message when the check fails, with a line naming the recipes
      that will refuse to run. When `python3` is right it says nothing.
      The first web session after this lands is where the answer shows.

- [x] Update `scripts/tests/check-python-version.bats` for the new
      comparison: a matching `python3` passes, an older one fails with
      the fix named, and a missing one fails.

      `python3` is stubbed onto the `PATH` as Poetry already was, so the
      tests do not depend on the Python of the machine running them.
      Three tests in `.claude/hooks/session-start.bats` cover the hook.

- [x] Say in `docs/docs/worktrees/index.md`, under "Which Python the
      environment is built on", that the bare `python3` is checked too,
      which recipes check it, and that an editor's activated environment
      is the usual cause.

- [x] Give the two shell test images the pinned Python. Found while
      writing the tests above: `.github/Dockerfile`, which `just ts`
      runs the bats suites in, and `.github/Dockerfile.coverage`, which
      `just test-coverage` uses, both install `python3` from Ubuntu
      24.04's own packages, which is 3.12. The suites under
      `scripts/tests` run `stack-status.py` and the other root scripts
      for real. So after Phase 4 `just ts` would fail on a developer's
      machine with the syntax error this plan is about, while CI, fixed
      in Phase 1, passed.

      Ubuntu 24.04 has no package for 3.14, so it has to come from
      somewhere else, and the image has no build context to read
      `.python-version` from: the Dockerfile goes in on standard input.
      So the version is an `ARG` in the Dockerfile, and
      `check-version-consistency.sh` holds it to `.python-version` in
      Phase 5.

      One file to change, not two: `Dockerfile.coverage` builds on the
      image the other makes. `.github/Dockerfile` now builds on
      `python:3.14-slim`, the image `backend/Dockerfile` builds on, by
      the same digest. The image reports Python 3.14.7, the same as CI,
      and `just ts` passes on it: all three targets, 999 tests.

      That makes the image Debian and not Ubuntu 24.04, so it is no
      longer a copy of the runner. It was built that way to catch what a
      Mac gets wrong: another bash, another coreutils, another
      `sha256sum`. Debian has GNU's versions of all three as Ubuntu
      does, and CI runs the suite on the runner itself.

      The base ships a real `python` beside `python3`. The tests put a
      stand-in for `python` on the `PATH`, and with no real one a test
      that forgot its stand-in fails at once. So the Dockerfile removes
      it, and the build fails if it is still there.

      Four ways to get the Python were weighed. The first was built and
      then replaced, on 13 October, because it added something to keep
      up to date:

      - **The Python image the backend already builds on, which was
        chosen** - nothing new to watch: the same image, digest and
        Renovate rule, and the backend's own patch release.
      - **uv, built first** - two lines, but a second image to pin and
        update, a download from a new place, and 3.14.3 where CI had
        3.14.7, because it installs the newest release it knew of when
        it was published.
      - **The deadsnakes package archive** - the usual way on Ubuntu,
        but adding an archive and its signing key by hand is longer than
        the rest of the Dockerfile, and its releases trail.
      - **The build CI's `setup-python` downloads** - the closest to the
        runner, but its address holds a run number that has to be looked
        up in a manifest, and its installer fetches `pip` as it goes.

      Poetry and pip were asked about too. pip installs packages into a
      Python and cannot install one. Poetry can, but needs a Python to
      run on first and fetches the same builds uv does.

## Phase 4: Move Ruff and Black to the backend's Python

- [x] Change both `target-version` lines in `backend/pyproject.toml` from
      `py313` to `py314`, and remove the comment above `[tool.ruff]` that
      explains why they were held back. Phases 1 and 3 are what make that
      comment untrue.

      The comment is rewritten, not removed: it now says what moving the
      targets requires of every place the files run, and points here.

- [x] Run the Ruff and Black hooks over every file and commit what they
      change, in a pull request holding nothing else. On 13 October that
      was 22 files: `except` clauses losing their brackets, and return
      types losing their quotes. Three of them are in the root `scripts/`
      folder, because the Black hook passes
      `--config=backend/pyproject.toml` for every Python file in the
      repository. A reformat mixed with a real change hides the change.

      Twenty files this time, and the pull request does hold something
      else, because the reformat could not pass its own hooks without
      it. Two more tools read a file with the Python they run on, and
      neither was on the pinned one:

      - **The "mypy (tests and tooling)" hook** - named no Python, so
        pre-commit built its environment on its own, 3.11 on the machine
        this was built on. It reported each reformatted `except` in the
        root scripts as a syntax error. It now has
        `language_version: python3.14`, as the Black hook has.
      - **The "bandit (backend)" hook** - the same, and worse, because
        it did not fail. Bandit leaves out a file it cannot parse, counts
        the rest and passes. Twelve backend files were not scanned,
        `deps.py` and `security.py` among them, with the line count still
        five times the floor `run-bandit.sh` checks. The hook now names
        Python 3.14, and `run-bandit.sh` fails when Bandit's report says
        it skipped any file, printing which and why.

      `check-python-version.sh` already fails a hook whose
      `language_version` is not the pinned one, so both are held to
      `.python-version` from here on. It does not fail a hook that names
      none, which is how these two were missed: see Decisions.

- [x] Run the full backend unit suite, `just ub`, and the script tests,
      `bash .github/scripts/ci/run-shell-tests.sh scripts/tests`, before
      pushing. A change of syntax across this many modules is the wide
      blast radius the test tiers make an exception for.

      Both pass: `just ub` with no filter, and `just ts`, which runs the
      script tests in the image Phase 3 moved to the pinned Python.

- [ ] Confirm the Semgrep job reads the reformatted files, on the first
      pull request from this plan to leave draft. Semgrep runs in the
      heavy tier, on the runner's own Python, with its own parser for
      Python, and was not run locally. If that parser does not know an
      `except` without brackets, it may skip those files as Bandit did.
      `ci.yml` already fails a scan that opened too few files; check the
      count it prints has not dropped, and that no file is reported as
      not parsed.

## Phase 5: Hold the Ruff and Black targets to `.python-version`

- [x] Add both targets to `check_python` in
      `.github/scripts/ci/check-version-consistency.sh`. Read
      `target-version = "py314"` under `[tool.ruff]` and
      `target-version = ["py314"]` under `[tool.black]`, turn `py314`
      into `3.14`, and compare each with `.python-version` as the Docker
      tag and mypy's version are compared now. The function reads mypy's
      version from the same file and stops there, which is how the
      targets stayed a release behind without failing anything.

      Last, because it fails until Phase 4 has landed.

      Each target is read from under its own heading, so a file with one
      target cannot have it counted for both tools.

- [x] Hold the shell test image to `.python-version` in the same
      function. `.github/Dockerfile` builds on the backend's Python
      image since Phase 3, so the version is read from its `FROM` line,
      as it is from the `python:` tag in `backend/Dockerfile`.

- [x] Fail when the two Dockerfiles name different images. The shell
      test image was moved onto the backend's so that there would be one
      Python to keep up to date and not two, and that only holds while
      `FROM` in `.github/Dockerfile` and `ARG PYTHON_IMAGE` in
      `backend/Dockerfile` are the same registry, tag and digest. The
      same tag at another digest passes the version check, so this
      compares the whole line. Renovate changes both in one pull
      request; this is what notices if one is ever changed alone.

- [x] Fail when a target line is missing, and say which. An absent line
      reads as an empty string, and an empty string must not be allowed
      to match.

      The message is "Python minor not found", naming the place, and it
      now covers the Docker tag and mypy's version as well as the three
      new places. Before, a missing one of those two was reported as a
      mismatch with an empty value.

- [x] Add cases to `check-version-consistency.bats`: both targets
      matching (passes), Ruff behind (fails, naming Ruff), Black behind
      (fails, naming Black), and a target line removed (fails).

      Eleven cases, with the shell test image's four among them. The case
      for one tool's target being taken for the other's was first
      written so that it could not fail: Ruff's heading came before
      Black's, and a reader with no sense of headings gave the same
      answer. Breaking the script showed that, and the fixture now puts
      Black's heading first.

- [x] Say in the "Python version" row of the single-source section of
      `docs/docs/conventions/index.md` that the Docker tag, mypy's
      `python_version` and the Ruff and Black targets each repeat the
      version, and that `check-version-consistency.sh` is what holds them
      to `.python-version`. The page says a version is "a one-line edit
      in one place", which has not been true of Python: moving to a new
      one means changing each of those lines in the same pull request,
      and the check failing is how a missed one is found.

      Written as a note beside the one for Node, which the page already
      calls a known exception, and not into the table: the row has room
      for one sentence and this needs a list.

## Decisions

- **A hook that names no Python is not yet refused** - the two hooks
  fixed in Phase 4 were wrong by saying nothing, which
  `check-python-version.sh` cannot see: it compares the
  `language_version` lines that exist. Failing every Python hook without
  one would close that, but it needs to know which hooks are Python at
  all, and the config does not say: a hook's language comes from the
  repository it is fetched from. Left for now. The bandit script failing
  on a skipped file, and mypy failing loudly by nature, cover the two
  hooks known to read Python source.

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
