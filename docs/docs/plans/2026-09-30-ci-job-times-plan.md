# CI job times plan

A league table of how long each GitHub Actions job takes, longest first, as
a starting point for deciding where to cut CI time.

## Method

- **Sample**: the 289 most recent completed workflow runs, from 29 September
  2026 17:02 UTC to 30 September 2026 17:50 UTC. About a day of activity.
- **Workflows**: CI, Breaking-change gates, Deploy, Documentation and Create
  pull request.
- **Jobs counted**: successful jobs only. Skipped, cancelled and failed jobs
  are left out, so a job that dies early does not drag its average down.
- **Time**: from the job starting on a runner to it finishing. Queue time
  waiting for a runner is not included.
- **Runs**: how many successful runs of that job were in the sample.

## League table

| Rank | Workflow              | Job                                               | Mean   | Median | Slowest | Runs |
| ---- | --------------------- | ------------------------------------------------- | ------ | ------ | ------- | ---- |
| 1    | CI                    | Storybook interaction tests                       | 6m 55s | 6m 53s | 12m 55s | 67   |
| 2    | Deploy                | Build backend                                     | 5m 39s | 5m 39s | 6m 24s  | 2    |
| 3    | CI                    | Python unit                                       | 5m 02s | 5m 09s | 5m 49s  | 75   |
| 4    | CI                    | typescript_checks (unit-test:run)                 | 4m 56s | 5m 12s | 5m 55s  | 72   |
| 5    | CI                    | E2E (Playwright)                                  | 4m 09s | 3m 40s | 13m 09s | 67   |
| 6    | Documentation         | Build documentation                               | 3m 22s | 3m 31s | 3m 51s  | 8    |
| 7    | CI                    | E2E image build                                   | 2m 59s | 3m 18s | 4m 42s  | 68   |
| 8    | Deploy                | Build frontend                                    | 2m 35s | 2m 34s | 3m 47s  | 7    |
| 9    | CI                    | Python pre-commit                                 | 2m 12s | 2m 24s | 3m 15s  | 77   |
| 10   | CI                    | Alembic autogenerate drift check                  | 1m 16s | 1m 16s | 1m 36s  | 78   |
| 11   | Deploy                | Deploy to app                                     | 1m 08s | 0m 42s | 2m 43s  | 8    |
| 12   | Breaking-change gates | API breaking-change check                         | 1m 03s | 1m 03s | 1m 27s  | 58   |
| 13   | CI                    | typescript_checks (storybook:build)               | 0m 53s | 0m 53s | 1m 28s  | 78   |
| 14   | CI                    | Shell and workflow lint                           | 0m 41s | 0m 40s | 1m 11s  | 52   |
| 15   | CI                    | Semgrep (frontend SAST)                           | 0m 32s | 0m 32s | 0m 46s  | 69   |
| 16   | CI                    | typescript_checks (eslint)                        | 0m 29s | 0m 29s | 0m 47s  | 78   |
| 17   | Breaking-change gates | Destructive-migration Slack notification decision | 0m 27s | 0m 27s | 1m 01s  | 58   |
| 18   | CI                    | typescript_checks (typecheck:all)                 | 0m 27s | 0m 26s | 1m 04s  | 78   |
| 19   | CI                    | typescript_checks (prettier)                      | 0m 15s | 0m 14s | 0m 33s  | 78   |
| 20   | CI                    | typescript_checks (stylelint)                     | 0m 15s | 0m 15s | 0m 31s  | 78   |
| 21   | Create pull request   | create-pr                                         | 0m 13s | 0m 11s | 1m 13s  | 48   |
| 22   | Documentation         | Deploy to GitHub Pages                            | 0m 13s | 0m 13s | 0m 22s  | 8    |
| 23   | Breaking-change gates | DB destructive migration check                    | 0m 08s | 0m 08s | 0m 26s  | 58   |
| 24   | CI                    | Competency catalogue check                        | 0m 08s | 0m 08s | 0m 45s  | 69   |
| 25   | CI                    | DB migration immutability check                   | 0m 08s | 0m 09s | 0m 16s  | 69   |
| 26   | CI                    | Detect teaching tooling changes                   | 0m 08s | 0m 08s | 0m 13s  | 48   |
| 27   | Deploy                | Prepare                                           | 0m 08s | 0m 08s | 0m 10s  | 8    |
| 28   | Breaking-change gates | Breaking-change Slack notification decision       | 0m 07s | 0m 07s | 0m 43s  | 58   |
| 29   | CI                    | Version consistency                               | 0m 06s | 0m 06s | 0m 22s  | 52   |

## Observations

- **E2E is the real critical path, not Storybook.** `E2E (Playwright)` needs
  `E2E image build` first, so the pair runs back to back: about 7m 08s on
  average, just ahead of Storybook's 6m 55s. Every other CI job runs in
  parallel with them.
- **The two slowest jobs have long tails.** Storybook and E2E both have a
  slowest run near 13 minutes, about double their median. Worth finding out
  whether that is flaky retries or a slow runner.
- **The fast tier is bounded by the unit suites.** `Python unit` and
  `typescript_checks (unit-test:run)` both sit at about 5 minutes. Everything
  else in the fast tier finishes inside 2m 30s.
- **Deploy numbers are thin.** Build backend ran only twice in the sample,
  because the deploy skips a build when its side has not changed. Treat its
  place in the table as a rough guide.
- **Teaching content sweep is missing** because it did not run successfully
  in the sample; it only runs when teaching tooling changes.

## Phase 1: warm the Playwright browser cache on main

The browser cache always misses. "Install Playwright browsers" takes 40 to
62s on every run. A pull request can only reuse a cache saved on its own
branch or on `main`, and the E2E job never runs on `main`. So each new
branch downloads the browsers again. Saving the cache from a run on `main`
would cut about 50s from every run.

- [x] Save the `ms-playwright` cache from a run on `main`, under the same
      key the E2E job restores, without running the E2E tests there.
      `.github/workflows/playwright-cache.yml` warms both the E2E and the
      Storybook keys on a push to `main` that touches the frontend
      dependencies, weekly, and by hand
- [x] Key both caches on the installed Playwright version rather than a
      hash of `frontend/package.json` (#1297). `package.json` says
      `^1.60.0` while `yarn.lock` resolves 1.63.0, so a Playwright bump
      that changed only the lock file kept the key, restored the old
      browsers and skipped installing the new ones
- [x] Confirm on a new pull request that "Install Playwright browsers" is
      skipped and only the system dependencies step runs. It was, from the
      #1293 queue run at 19:32 on 30 September onwards: E2E 3m 27s,
      Storybook 4m 48s
- [x] Re-measure the E2E job and record the new average here. Measured on
      1 October over the 371 CI runs since 28 September, successful jobs
      only, grouped by what each job did rather than by date. The 33 runs
      that restored the cache and installed only the system packages had a
      median of 3m 30s against 3m 27s for the 154 that downloaded the
      browsers, and a mean of 4m 10s against 3m 57s. So the cache alone
      bought nothing: the `apt-get` it left behind had a median of 52s, the
      same as the download it replaced, and stalled as badly. Phase 2 is
      what moved the job

## Phase 2: run the E2E tests in the Playwright image

With the browsers cached, the system packages became the slow step.
"Install Playwright system dependencies" is an `apt-get` against Ubuntu's
mirrors on every run: 14 to 49s normally, but 358s and 410s on two of the
first four merge queue runs after Phase 1, which put E2E at 8m 40s and
9m 11s against 3m 30s for the others. Microsoft's Playwright image carries
the browsers and their system packages, so nothing is installed at all.

- [x] Run `npx playwright test` in `mcr.microsoft.com/playwright:v<version>-noble`
      with `docker run --network host`, so `localhost` is still the CI stack.
      The tag is the installed `@playwright/test` version, read by the same
      step that keyed the cache, so a Renovate bump moves the image with it.
      The cache and both install steps go from `heavy_e2e`
- [x] Stop warming the E2E key in `playwright-cache.yml`; nothing reads it
- [x] Time "Pull Playwright image" over a few runs. If it is slow or
      unreliable, mirror the image into GHCR, where the job already pulls
      its own images in about 9s. Over the first 15 runs it had a median of
      27s and a slowest of 38s, so it is neither, and no mirror is needed
- [x] Re-measure the E2E job. Over those 15 runs: median 3m 06s, mean
      3m 04s, slowest 3m 24s, against 3m 27s, 3m 57s and 13m 09s before.
      The gain is the tail, not the typical run. With `E2E image build` in
      front of it the pair has a median of 6m 27s, down from 6m 58s. The
      whole heavy tier on a pull request barely moved, 7m 14s to 7m 05s at
      the median (8m 35s to 7m 34s at the 90th percentile, over only 7
      runs), because Storybook now sets the finish time
- [x] Move `heavy_storybook_tests` the same way if its system dependencies
      step starts stalling too. It did, so this is now Phase 4

## Phase 3: split the Storybook interaction tests across runners

Storybook is the critical path now. Its job has a median of 7m 01s, and
"Run Storybook interaction tests" is about 6m 19s of that, so no amount of
caching around it helps: the browser cache swapped a 25s download for an
18s package install and the job did not move. Each phase from here is one
pull request, so its effect can be read off that pull request's own runs.

- [x] Run the job as a three-way matrix, each leg passing
      `--shard=<n>/3` to `test-storybook`. `storybook:test` in
      `frontend/package.json` already takes `SB_MAX_WORKERS` from the
      environment; add the shard the same way. Three is a starting point:
      each leg repeats about a minute of setup (checkout, `setup-frontend`,
      the system packages, starting the Storybook dev server), so a fourth
      leg buys less than the third did. Done as `heavy_storybook_shards`
      in `ci.yml`, with the shard passed as `SB_SHARD`
- [x] Keep a check named `Storybook interaction tests`. A matrix renames
      the checks to `Storybook interaction tests (1/3)` and so on, and that
      exact name is required by `infra/github/branch_rules.tf` and read by
      `scripts/stack-status.py`. Add a small job with the old name that
      needs the three legs, so nothing in Terraform or the stack tooling
      changes. It must run under `always()` and check each leg's result
      itself: left to the default, a failed leg skips the job that needs
      it, and a required check that is skipped counts as passed. Keep
      today's draft condition alongside, so a draft still skips it. Done as
      `heavy_storybook_tests`, which hands the legs' combined result to
      `.github/scripts/ci/require-matrix-success.sh`. One thing in the
      stack tooling did change: `scripts/stack-status.py` now counts any
      check whose name starts `Storybook interaction tests (` as heavy, or a
      draft's three skipped legs would have shown in the fast-tier mark
- [ ] Measure over a day of runs and record here: the slowest leg, the
      whole heavy tier on a pull request, and the runner minutes spent per
      run against today's 7. The estimate is 2m 30s to 3m per leg

## Phase 4: run the Storybook tests in the Playwright image

Storybook has the stall E2E had. Of the 25 runs since Phase 1, two spent
317s and 366s on "Install Playwright system dependencies" and took 12m 05s
and 12m 31s; the other 23 took 14 to 51s. Phase 3 makes this three times
as likely per run, since every leg installs the packages, which is why
this follows it directly.

- [ ] Run `test-storybook` in `mcr.microsoft.com/playwright:v<version>-noble`
      with `docker run --network host`, as `heavy_e2e` does, against a
      Storybook still started on the runner. That keeps Yarn 4 and the dev
      server out of the container, which was the fiddly part: only the
      test runner and its browser move. The "Cache Playwright browsers"
      step and both install steps go
- [ ] Delete `.github/workflows/playwright-cache.yml`. The Storybook key
      was the last thing it warmed
- [ ] Measure and record here. Expect a normal run to be about 9s slower
      per leg, a 27s image pull in place of an 18s install, and the
      12 minute runs to stop. The second is the point

## Phase 5: test a built Storybook, not the dev server

A trial, kept only if the numbers say so. `storybook:test:ci` starts
`storybook dev`, which compiles each story the first time a test asks for
it, so the tests wait on Vite as well as on the browser. A static build
has done that work up front.

- [ ] In each leg, run `storybook build` and serve the output, then point
      `test-storybook` at it with `--url`. The fast tier's
      `typescript_checks (storybook:build)` takes 53s, but it runs on the
      push event and the heavy tier on the pull request event, so its
      output cannot simply be handed over: each leg builds its own, and
      the build has to save more than 53s of test time to pay for itself.
      The `frontend/node_modules/.vite` cache the job already restores
      should shorten it
- [ ] Measure against Phase 4's figure. If the slowest leg is not faster,
      close the pull request and record the result here, so it is not
      tried again

## Phase 6: let pull requests read the E2E image cache

`E2E image build` has a median of 3m 23s, and once Storybook is down it
is what holds the heavy tier up: `E2E (Playwright)` waits for it. It has
the same fault Phase 1 fixed for the browsers. The Docker layer cache is
`type=gha`, which a run can only read from its own ref or from `main`, and
this job never runs on `main`. So a pull request's first heavy run, and
every merge queue run, starts with nothing: on #1303's first run both
`poetry install` and `yarn install` ran in full, and the job then spent
18s and 89s writing the backend and frontend layers to a cache no other
pull request can read. A later run on #1302, reading its own cache, built
the frontend image in about 60s. The copies also fill the allowance: 326
caches and 10.04GB against a limit of 10GB, so GitHub is already evicting.

- [ ] Build both images on `main` and save the layers under the scopes
      `ci-backend` and `ci-frontend`, in a workflow shaped like
      `playwright-cache.yml`: on a push to `main` that touches a
      Dockerfile or a lock file, weekly, and by hand. Nothing is pushed to
      GHCR from it; only the cache matters
- [ ] Stop pull request and merge queue runs writing the cache, by
      dropping `cache-to` from both build steps in `heavy_e2e_images`.
      This is where most of the time goes, 107s of the job on a first
      run. The cost is that a second push to the same pull request no
      longer reuses its own build stage, but with the dependency layers
      coming from `main` that stage is `yarn build`, about 22s
- [ ] Measure and record here. The estimate is 3m 23s down to about
      1m 30s, which would put the E2E pair near 4m 30s

## Phase 7: consider splitting the unit suites

Not committed to: decide once Phase 6 has been measured. `Python unit` and
`typescript_checks (unit-test:run)` both take about 5 minutes and bound
the fast tier. That has not mattered to a pull request, whose heavy tier
was slower. But the merge queue runs both tiers, so if the phases above
bring the heavy tier to about 4 minutes, these two become what every merge
waits for.

- [x] Decide whether to go ahead, from the heavy tier's time after Phase 6
      and the merge queue's run times. Decided on 1 October, before Phase
      6 was measured: go ahead, and build it while Phases 4 to 6 are being
      merged. The first runs of Phase 3 already put the Storybook legs at
      about 3 minutes, under the unit suites' 5
- [x] If so, the backend first, as it needs no extra runner: "Pytest
      (unit)" has a median of 4m 29s on one process, and `pytest-xdist`
      is not installed. Add it and run with `-n auto`. Check first that
      the in-memory SQLite fixtures in `conftest.py` are safe with one
      database per worker. They are, by construction: `conftest.py` builds
      one `sqlite:///:memory:` engine with a `StaticPool` per process, and
      each xdist worker is a process. The runners have 4 cores, as the
      repository is public. Only CI runs in parallel; `just ub` is
      unchanged, and takes `-n auto` as an argument when wanted. Not run
      in parallel locally: the test image could not be rebuilt with the
      new package because Docker Hub was unreachable, so the pull
      request's own `Python unit` run is the first proof. That run, on
      #1328, passed, but "Pytest (unit)" took 3m 42s: a gain of 47s, not
      the three or four times that four workers suggested. The likely
      reason, not yet confirmed, is password hashing. `security.py` uses
      argon2-cffi's defaults, which hash on four threads, so a serial run
      was already using every core whenever a test made a user. If so,
      the real saving is a cheap hasher for tests, which is a change to
      security code and wants its own decision
- [x] Then the frontend: "Run unit-test:run" has a median of 4m 56s.
      Vitest already uses every core, so this one needs a matrix with
      `--shard`, and the same single named check as Phase 3 if the name
      is required anywhere. It is: `typescript_checks (unit-test:run)` is
      required in `infra/github/branch_rules.tf`. Done as three legs,
      `Frontend unit tests (1/3)` to `(3/3)`, and a job that keeps the
      required name and passes only when all three did, through the same
      `require-matrix-success.sh` as Phase 3. The first leg, run locally
      with `just uf --shard=1/3`, was 103 test files and 1,036 tests in
      49s

## Decisions

- **Sharding goes before the Playwright image** – the stall would be the
  safer thing to fix first, since sharding triples the exposure to it.
  But with one change per pull request, sharding first gives a clean
  reading of the largest saving against today's baseline. The cost is a
  short spell between the two in which a slow run is more likely.

- **The dark-mode accessibility pass stays on every pull request** – axe
  checks each story twice, light and dark, and running the dark pass only
  in the merge queue would shorten the Storybook job. It was left out
  because its share of the 6 minutes has not been measured, and because a
  dark-mode violation would then surface at merge instead of at review.

- **Warm the image cache on `main` instead of moving it to GHCR** – a
  `type=registry` cache is not tied to a ref and would also fix Phase 6.
  Warming on `main` was chosen because it is the pattern Phase 1 already
  proved here, and it takes the build cache out of pull requests
  altogether, which is what frees the allowance.
