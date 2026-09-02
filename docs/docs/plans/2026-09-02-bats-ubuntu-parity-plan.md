# Run the shell tests where they actually run

## Context

`just ts` runs the bats suite on the developer's machine. The scripts it tests run on
`ubuntu-24.04` GitHub runners. Those are different platforms, and the difference has
already produced a false result in both directions.

**A real failure that only appears locally.** Five tests in
`.github/scripts/auto-pr/create-pr.bats` fail on macOS:

```text
create-pr.sh: line 36: ${TYPE}: ${REMAINDER^}: bad substitution
```

`${REMAINDER^}` uppercases the first character. It is **bash 4+ syntax**, and macOS ships
bash **3.2.57** — the version Apple froze in 2007 over GPL v3 licensing. CI runs bash 5, so
the suite is green there and red here. `just ts` currently cannot pass on a Mac, which
trains people to ignore it.

**A pass that proves nothing.** `.github/scripts/ci/detect-teaching-tooling-changes.sh`
hashes with `sha256sum`. On macOS that resolves to `/sbin/sha256sum`, reporting
`sha256sum (Darwin) 1.0` — not GNU coreutils. It passes locally, but against a different
implementation from the one CI uses, so the local run is not evidence about CI.

The repository already applies the principle elsewhere: `CLAUDE.md` requires backend and
frontend unit tests to run inside Docker, for exactly this parity. Shell scripts are the
one suite still tested on the wrong platform.

## Scope

Two independent pieces of work. Either can land without the other, and the first is worth
doing first because it makes the suite green locally.

## Phase 1: Fix the bash 4 dependency

`.github/scripts/auto-pr/create-pr.sh:36` currently reads:

```bash
TITLE="${TYPE}: ${REMAINDER^}"
```

Bash 3.2 supports substring expansion, so this is portable and equivalent:

```bash
TITLE="${TYPE}: $(printf '%s' "${REMAINDER:0:1}" | tr '[:lower:]' '[:upper:]')${REMAINDER:1}"
```

- [ ] Make that replacement. It is the only bash-4-only construct in the whole of
      `.github/scripts` — confirmed by grepping for `^}`, `,,}` and `^^}` across every
      script, which returns this one line.
- [ ] Verify the five failing tests pass: `bats .github/scripts/auto-pr/create-pr.bats`.
      They are `creates a draft pull request against main`, `uses the placeholder body`,
      `ignores a pull request template in the working directory`, `exits cleanly when a
      concurrent run created the pull request`, and `fails when creation fails and no pull
      request appeared`.
- [ ] Check the title still reads correctly for a real branch name. `feature/add-cover-image`
      should give `Feature: Add cover image`, and the empty-remainder case must not error.

## Phase 2: Run the suite in an Ubuntu container

- [ ] Add a `just` recipe — `tsd`, or another name — that runs the same bats invocation
      inside `ubuntu:24.04`, matching the runner image. Keep `just ts` as it is: the fast
      local run stays useful, and this is the one to reach for before pushing.
- [ ] The container needs more than bats. What the suite actually touches:
      - **bats** itself. CI installs it with `bats-core/bats-action@4.0.0`; pin the same
        version in the container so a bats behaviour change cannot differ between them.
      - **git**, called for real in 62 places — `detect-teaching-tooling-changes.bats` builds
        throwaway repositories, and `check-migrations-unmodified.bats` needs history.
      - **python3**, called for real in 8 places to generate test fixtures.
      - **jq**, which `check-version-consistency.sh` calls for real and whose absence it
        reports as its own error.
      - **coreutils**, which is what makes `sha256sum` the GNU one rather than Darwin's.
      - `gh`, `gcloud`, `gsutil` and `python` (as distinct from `python3`) are **stubbed** by
        the tests and must not be installed, or a stub could be shadowed.
- [ ] Run it with `docker run --rm`, one container per invocation. Nothing needs to persist
      between runs, so there is no long-lived container to start, remember or clean up — the
      recipe leaves the machine as it found it.
- [ ] Decide how the image is built, which is the trade-off `--rm` creates. A `Dockerfile`
      under `.github/` pinned by digest matches how `backend/Dockerfile` pins its base and
      means packages are installed once into a cached image; installing them inline in the
      recipe is quicker to write but pays the download on every run, which on a suite this
      fast would dominate.
- [ ] Confirm it catches what prompted this: with Phase 1 reverted, `just ts` should pass in
      the container and fail on the host. That is the whole point, and it is worth
      demonstrating once rather than assuming.

## Verification

- [ ] `just ts` passes on the host — currently impossible, and the measure of Phase 1.
- [ ] The containerised run passes, and its bats version matches CI's.
- [ ] `find .github/scripts -name '*.sh' -exec shellcheck --source-path=SCRIPTDIR {} +`
      stays clean, since `create-pr.sh` changes.
- [ ] CI stays green, confirming the `create-pr.sh` change did not alter behaviour on the
      platform where it already worked.

## Risks and notes

- **The container will not have Docker's daemon inside it.** No current test needs Docker,
  but a future one that does would fail there and pass on the host — the inverse of today's
  problem, and worth noticing early.
- **Docker is not always available.** It is deliberately off when running on battery, so the
  containerised run must be an addition to `just ts`, never a replacement for it. For the
  same reason this plan is meant to be worked through locally rather than in a hosted
  environment where the daemon may not be reachable.
- **Do not "fix" the tests to accommodate bash 3.2.** The scripts run on ubuntu; the
  portable construct is for the developer's benefit, not the runner's. If a future script
  genuinely needs bash 4, the answer is the container, not weakening the script.
- The `create-pr.sh` change is behaviour-preserving on bash 4+, so CI cannot prove it
  correct — only that nothing broke. Phase 1's verification has to happen on the Mac.

## Related

- `.claude/rules/workflows.md` — the shell script and bats conventions this follows
- `CLAUDE.md` — the existing rule that backend and frontend tests run inside Docker, which
  is the same argument applied to a different suite
