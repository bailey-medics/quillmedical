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

- [x] Make that replacement. It is the only bash-4-only construct in the whole of
      `.github/scripts` — confirmed by grepping for `^}`, `,,}` and `^^}` across every
      script, which returns this one line.
- [x] Verify the five failing tests pass: `bats .github/scripts/auto-pr/create-pr.bats`.
      They are `creates a draft pull request against main`, `uses the placeholder body`,
      `ignores a pull request template in the working directory`, `exits cleanly when a
      concurrent run created the pull request`, and `fails when creation fails and no pull
      request appeared`.
- [x] Check the title still reads correctly for a real branch name. `feature/add-cover-image`
      should give `Feature: Add cover image`, and the empty-remainder case must not error.

## Phase 2: Run the suite in an Ubuntu container

**Found while doing Phase 1: `just ts` is not the invocation CI runs.** CI runs
`.github/scripts/ci/run-shell-tests.sh` twice, over `.github/scripts` and over
`.claude/hooks`. `just ts` runs `bats --recursive .github/scripts` and stops there. So the
14 tests in `.claude/hooks/session-start.bats` never run locally, and neither does the
BW01/BW02 warning gate that `run-shell-tests.sh` exists to enforce — an assertion passing
vacuously is caught only in CI. Matching the platform is therefore not enough on its own;
the recipe has to run what CI runs.

**Also found: CI's bats version is not pinned.** `ci.yml:206` uses
`bats-core/bats-action@4.0.0` without a `bats-version` input, and the action then resolves
`latest` from the bats-core releases API at run time — currently 1.14.0. There is no
version to copy into the container, so "pin the same version" needs `ci.yml` to pin one
first. That is a change to a shared workflow and is called out here rather than assumed.

- [x] Add a `just` recipe — `tsd`, or another name — that runs `run-shell-tests.sh` over
      both `.github/scripts` and `.claude/hooks` inside `ubuntu:24.04`, matching what CI
      runs and where it runs it. Keep `just ts` alongside it while the containerised
      recipe earns trust; Phase 3 removes the host one.
- [x] The container needs more than bats. What the suite actually touches:
      - **bats** itself. Pin an explicit version in `ci.yml` and the same one in the
        container, so a bats release cannot change one side without the other. Today CI
        floats on whatever is latest, which is the drift this bullet meant to prevent.
      - **git**, called for real in 62 places — `detect-teaching-tooling-changes.bats` builds
        throwaway repositories, and `check-migrations-unmodified.bats` needs history.
      - **python3**, called for real in 8 places to generate test fixtures.
      - **jq**, which `check-version-consistency.sh` calls for real and whose absence it
        reports as its own error.
      - **coreutils**, which is what makes `sha256sum` the GNU one rather than Darwin's.
      - `gh`, `gcloud`, `gsutil` and `python` (as distinct from `python3`) are **stubbed** by
        the tests and must not be installed, or a stub could be shadowed.
- [x] Run it with `docker run --rm`, one container per invocation. Nothing needs to persist
      between runs, so there is no long-lived container to start, remember or clean up — the
      recipe leaves the machine as it found it.
- [x] Decide how the image is built, which is the trade-off `--rm` creates. A `Dockerfile`
      under `.github/` pinned by digest matches how `backend/Dockerfile` pins its base and
      means packages are installed once into a cached image; installing them inline in the
      recipe is quicker to write but pays the download on every run, which on a suite this
      fast would dominate.
- [x] Confirm it catches what prompted this: with Phase 1 reverted, `just ts` should pass in
      the container and fail on the host. That is the whole point, and it is worth
      demonstrating once rather than assuming.

## Phase 3: Remove `just ts`

Once the containerised run is trusted, the host recipe goes. Two ways to run the same
suite is one too many, and the host one is what produced the false results in both
directions that this plan exists to eliminate — leaving it in place invites reaching for
it out of habit and getting an answer about the wrong platform.

- [ ] Delete the `test-scripts` recipe and its `ts` alias from the `Justfile`
      (`Justfile:567-572`), then rename the Phase 2 recipe to `test-scripts` with the `ts`
      alias, so the familiar name runs the correct thing and no muscle memory is wasted.
- [ ] Drop bats from the optional prerequisites in `docs/docs/getting-started.md:10`. It is
      then needed only inside the container, so `brew install bats-core` stops being
      something a developer has to do at all.
- [ ] Update the three places that present the recipe as a host command:
      `docs/docs/cicd/index.md:69` and `:184`, and `.github/scripts/README.md:17`. Each
      offers a bare `bats --recursive .github/scripts` as an equivalent, and that
      equivalence is exactly what Phase 2 disproves — the wording needs to make the
      container the suite and the bare call a fallback carrying a platform caveat.
- [ ] Leave the finished plans alone. The August alembic plan names `just ts` twice as a
      record of what was run at the time; rewriting that would misreport what happened.

## Verification

- [x] `just ts` passes on the host — currently impossible, and the measure of Phase 1.
- [x] The containerised run passes, and its bats version matches CI's.
- [x] `find .github/scripts -name '*.sh' -exec shellcheck --source-path=SCRIPTDIR {} +`
      stays clean, since `create-pr.sh` changes.
- [ ] CI stays green, confirming the `create-pr.sh` change did not alter behaviour on the
      platform where it already worked.
- [ ] After Phase 3, `grep -rn 'test-scripts' --exclude-dir=.git .` finds only the
      containerised recipe and prose describing it — nothing anywhere still tells a
      developer to run the suite on the host.

## Risks and notes

- **The container will not have Docker's daemon inside it.** No current test needs Docker,
  but a future one that does would fail there and pass on the host — the inverse of today's
  problem, and worth noticing early.
- **Docker is not always available.** It is deliberately off when running on battery, so
  after Phase 3 the suite cannot be run without starting Docker first. That is the accepted
  cost of having one way to run it rather than two; a bare `bats --recursive
  .github/scripts` still works by hand, carrying exactly the platform caveat this plan is
  about. For the same reason this plan is meant to be worked through locally rather than in
  a hosted environment where the daemon may not be reachable.
- **Do not "fix" the tests to accommodate bash 3.2.** The scripts run on ubuntu; the
  portable construct is for the developer's benefit, not the runner's. If a future script
  genuinely needs bash 4, the answer is the container, not weakening the script.
- The `create-pr.sh` change is behaviour-preserving on bash 4+, so CI cannot prove it
  correct — only that nothing broke. Phase 1's verification has to happen on the Mac.

## Related

- `.claude/rules/workflows.md` — the shell script and bats conventions this follows
- `CLAUDE.md` — the existing rule that backend and frontend tests run inside Docker, which
  is the same argument applied to a different suite
