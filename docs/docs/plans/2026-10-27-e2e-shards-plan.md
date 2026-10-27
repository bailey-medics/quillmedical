# E2E shards plan

`E2E (Playwright)` has become the slowest job in CI by a long way. The
[CI job times plan](2026-09-30-ci-job-times-plan.md) split the frontend unit
tests and Storybook three ways, but left E2E as one job, because then it
ran 43 tests in about 2m 30s. It now runs 374. The teaching E2E coverage
work accounts for most of that. On 27 October 2026 the job took between
11m 15s and 15m 21s across eight successful runs. Every other job in the
fast and heavy tiers had finished inside about 3m 30s. So E2E alone sets how
long a pull request waits once it leaves draft, and how long each merge
queue entry takes.

The aim is to run the E2E tests across several runners at once, the same
way `frontend_unit_shards` and `heavy_storybook_shards` already do. A gate
job keeps the required check's name, so branch protection and
`scripts/stack-status.py` see no change. The estimate is about 5 to 6
minutes with three legs. Each leg still pays roughly 2 minutes to pull
images, start the stack, migrate and seed. Running E2E on the devbox
instead was considered and deferred; see Decisions.

## Phase 1: record the baseline

- [x] Write down the E2E job's times from the last 20 successful runs as
      the baseline: median, slowest, and how long the "Run E2E tests"
      step took on its own. The step time matters because it is the only
      part that sharding divides. The setup steps before it are paid again
      by every leg. Read from the jobs API
      (`gh api repos/{owner}/{repo}/actions/runs/<id>/jobs`), whose steps
      carry their own start and end times. Measured on 27 October 2026,
      over the 20 successful runs from 06:29 to 19:43 UTC that day:

      - **Whole job** - median 14m 46s, slowest 15m 53s, fastest 11m 17s.
      - **"Run E2E tests" step** - median 13m 10s, slowest 14m 14s,
        fastest 9m 20s.
      - **Everything else in the job** - median 1m 43s. That is pulling
        images, starting the stack, migrating, seeding and setting up the
        frontend, and every leg pays it.

      So three legs should come to about 13m 10s / 3 + 1m 43s, near 6
      minutes, and four to near 5. `just e2e` on the devbox ran the same
      374 tests in 2.9 minutes (see the
      [remote dev machine plan](2026-10-19-remote-dev-machine-plan.md)), so
      the tests themselves split cleanly. The runner's 4 cores and 2
      workers are what make them slow.

## Phase 2: split the E2E job into three legs

- [x] Turn `heavy_e2e` in `.github/workflows/ci.yml` into a matrix job,
      `heavy_e2e_shards`, named `E2E (Playwright) (${{ matrix.shard }}/3)`,
      with `fail-fast: false` and `shard: [1, 2, 3]`, copying
      `heavy_storybook_shards`. `fail-fast: false` is there for the same
      reason it is there: a cancelled leg hides whichever failures it had
      not reached. Each leg is its own runner and brings up its own
      `compose.ci.yml` stack, so the legs share no database and no seeded
      member. That is the property that makes this safe, and it is why the
      tests' own `fullyParallel` setting is not the limit here.
- [x] Pass the shard to Playwright: `npx playwright test
      --shard=${{ matrix.shard }}/3` in the "Run E2E tests" step. Nothing in
      `frontend/playwright.config.ts` changes. `retries: 2` and the two CI
      workers stay as they are, per leg.
- [x] Name each leg's report artifact by its shard,
      `playwright-report-${{ matrix.shard }}`. `upload-artifact` refuses a
      second artifact under the same name in one run, so three legs
      uploading `playwright-report` would fail the second and third
      uploads. Leave the reports separate rather than merging them with
      Playwright's blob reporter. A failure is read from the leg that
      failed, and merging adds a job for no gain until someone finds the
      separate reports a nuisance.
- [x] Keep the `mirror_fell_back` output working. A matrix job's outputs
      come from whichever leg wrote last, so a fallback seen by one leg
      can be overwritten by an empty value from another. Done with
      artifacts: a leg that fell back uploads its list as
      `e2e-mirror-fell-back-<shard>`, and the gate downloads them all and
      joins them with `.github/scripts/ci/collect-mirror-fell-back.sh`,
      which drops repeats and writes the gate's own `fell_back` output.
      Per-leg outputs were the other choice, but a job's output names are
      fixed, so each leg would still write all three and the last writer
      would still win. The gate collects before it checks the legs, so the
      list is handed on when a leg failed too, and
      `heavy_e2e_mirror_fell_back` reads the gate's output unchanged.
- [x] Add a gate job, `heavy_e2e`, named `E2E (Playwright)`, that `needs`
      the legs and runs `.github/scripts/ci/require-matrix-success.sh "E2E
      (Playwright)" "${{ needs.heavy_e2e_shards.result }}"`, under
      `always()` plus the legs' own condition, exactly as
      `heavy_storybook_tests` does. Keeping the job id `heavy_e2e` means
      `queue_failure_report` and `heavy_e2e_mirror_fell_back` need no
      change to their `needs`. Keeping the name means
      `infra/github/branch_rules.tf` needs no change. `always()` is the
      part that matters: without it a failed leg leaves the gate skipped,
      and a skipped required check counts as passed.
- [x] Add `"E2E (Playwright) ("` to `HEAVY_CHECK_PREFIXES` in
      `scripts/stack-status.py`, with a case in
      `scripts/tests/stack-status.bats`, so the legs show in the heavy tier
      and not the fast one. The gate's own name is already in
      `HEAVY_CHECKS`.

## Phase 3: measure, and decide whether to go further

- [ ] Re-measure over the first 20 runs after the change, in the same way
      as Phase 1, and record the median and slowest job time here,
      including the gate.
- [ ] If the slowest leg is still well ahead of the next slowest job,
      try four legs, as the CI job times plan suggested for Storybook. Each
      extra leg saves less than the last, because the roughly 2 minutes of
      setup is paid once per leg however few tests it runs. Stop when the
      E2E pair, the image build plus the slowest leg, is level with
      `Python unit`, at about 3m 30s.

## Decisions

- **Shard on GitHub before moving E2E to the devbox** - the devbox runs
  the suite in 2.9 minutes, against about 12 on GitHub, so a self-hosted
  runner there is the bigger saving. It was deferred because the
  repository is public. GitHub advises against self-hosted runners on
  public repositories, because a pull request from a fork can then run
  code on the machine, and the devbox holds AWS and Google Cloud sign-ins
  and the alert watcher. Doing it safely needs a separate unprivileged
  runner user, ephemeral runners, a guard limiting the job to this
  repository's own branches, approval for fork workflows, and a fallback
  to GitHub-hosted runners for when the box is off. Without that fallback
  the merge queue stops. Sharding costs none of that, so it goes first, and
  Phase 3 says whether the box is still worth it.
- **Only E2E, not the fast tier** - the fast tier finishes in about
  3m 30s, much of it setup that any runner pays, so moving it anywhere
  would save a minute at most.
- **Running the checks locally before pushing saves nothing** - the
  required checks run on GitHub whatever ran on the box first, so it adds
  a step without removing one.
- **Three legs to start** - the same starting number as the frontend unit
  tests and Storybook, which keeps the three matrix jobs alike. Phase 3
  says whether a fourth is worth its setup cost.
