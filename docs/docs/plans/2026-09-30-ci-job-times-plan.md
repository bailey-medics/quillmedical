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
      run against today's 7. The estimate is 2m 30s to 3m per leg. First
      reading, from the one run on #1319 once it was marked ready: the
      legs took 3m 12s, 3m 08s and 2m 17s, and the job that carries the
      required name took 5s. That is one run, not the day asked for.
      In the merge queue on 1 October, the eight runs after the split had
      legs of 2m 37s to 3m 26s, against a single job of 4m 39s to 7m 07s
      in the six runs before it. The whole run did not get shorter, 6m 02s
      to 7m 11s against 6m 08s to 7m 11s, because the E2E pair and the
      unit suites then set the finish time. Two of the eight had one leg
      stall on the package install, at 5m 42s and 6m 32s, which is what
      Phase 4 removes. Each run now spends about 9 runner minutes on these
      tests where it spent 5 to 7

## Phase 4: run the Storybook tests in the Playwright image

Storybook has the stall E2E had. Of the 25 runs since Phase 1, two spent
317s and 366s on "Install Playwright system dependencies" and took 12m 05s
and 12m 31s; the other 23 took 14 to 51s. Phase 3 makes this three times
as likely per run, since every leg installs the packages, which is why
this follows it directly.

- [x] Run `test-storybook` in `mcr.microsoft.com/playwright:v<version>-noble`
      with `docker run --network host`, as `heavy_e2e` does, against a
      Storybook still started on the runner. That keeps Yarn 4 and the dev
      server out of the container, which was the fiddly part: only the
      test runner and its browser move. The "Cache Playwright browsers"
      step and both install steps go. Done in
      `.github/scripts/ci/run-storybook-tests-in-image.sh`, which starts
      Storybook, waits for it, runs the tests in the image and stops
      Storybook again. That is `storybook:test:ci` done by hand: its
      `concurrently` wrapper could not put only one of its two halves in
      a container. The leg now hands its shard to the script as an
      argument, so CI no longer reads `SB_SHARD`; `storybook:test` keeps
      it for a local run
- [x] Delete `.github/workflows/playwright-cache.yml`. The Storybook key
      was the last thing it warmed
- [ ] Measure and record here. Expect a normal run to be about 9s slower
      per leg, a 27s image pull in place of an 18s install, and the
      12 minute runs to stop. The second is the point. First reading, from
      the one run on #1324 once it was marked ready: the legs took 3m 18s,
      3m 09s and 3m 11s, against 3m 12s, 3m 08s and 2m 17s on #1319 before
      the image. So the container path works, and costs about what was
      expected. In the merge queue, #1324's own run had legs of 2m 29s,
      2m 47s and 3m 23s, and the next, #1328, 3m 12s to 3m 23s. Neither
      stalled, and nor did the three runs after them. Five runs is too
      few to call the stall gone, since it showed in 2 of 25 before

## Phase 5: test a built Storybook, not the dev server

A trial, kept only if the numbers say so. `storybook:test:ci` starts
`storybook dev`, which compiles each story the first time a test asks for
it, so the tests wait on Vite as well as on the browser. A static build
has done that work up front.

- [x] In each leg, run `storybook build` and serve the output, then point
      `test-storybook` at it with `--url`. The fast tier's
      `typescript_checks (storybook:build)` takes 53s, but it runs on the
      push event and the heavy tier on the pull request event, so its
      output cannot simply be handed over: each leg builds its own, and
      the build has to save more than 53s of test time to pay for itself.
      The `frontend/node_modules/.vite` cache the job already restores
      should shorten it. Done in `run-storybook-tests-in-image.sh`: it
      runs `yarn storybook:build`, the same build the fast tier does, and
      serves the output with `python3 -m http.server`, which the runner
      already has, so no package is added for it. Two things to watch on
      the first run. `.storybook/main.ts` swaps `react-player` for a stub
      in a production build, so a story that plays video is tested
      against the stub here where the dev server used the real player.
      And the test runner reads its list of stories from the build's
      `index.json`, not from the story files. The first run on #1325 was
      red for exactly the first reason: eight tests in three video story
      files failed the colour contrast check, all on the stub's own
      placeholder text, `#666` on `#1a1a1a` at about 3:1. The text is now
      `#ccc`. Nothing else failed. Those stories are tested against the
      placeholder from here on, not the real player
- [x] Measure against Phase 4's figure. If the slowest leg is not faster,
      close the pull request and record the result here, so it is not
      tried again. First reading, from that red run: the legs took
      2m 23s to 2m 26s against 3m 09s to 3m 18s on #1324, with the tests
      themselves at 52 to 67s after a build of about 26s. So it is faster
      by about 45s a leg, on one run. The three merge queue runs with it
      agreed: legs of 2m 30s to 2m 34s on #1325, 2m 35s to 2m 37s on #1327
      and 2m 11s to 2m 40s on #1329, against 3m 12s to 3m 23s on the last
      run without it. The slowest leg is about 40s faster, so it is kept
      and was merged

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

- [x] Build both images on `main` and save the layers under the scopes
      `ci-backend` and `ci-frontend`, in a workflow shaped like
      `playwright-cache.yml`: on a push to `main` that touches a
      Dockerfile or a lock file, weekly, and by hand. Nothing is pushed to
      GHCR from it; only the cache matters. Done as
      `.github/workflows/e2e-image-cache.yml`. Its trigger also lists the
      files each Dockerfile copies in before installing, such as
      `.poetry-version` and `frontend/.yarnrc.yml`, since a change to any
      of them rebuilds the dependency layers. `playwright-cache.yml`
      itself went in Phase 4, so the shape is kept, not the file
- [x] Stop pull request and merge queue runs writing the cache, by
      dropping `cache-to` from both build steps in `heavy_e2e_images`.
      This is where most of the time goes, 107s of the job on a first
      run. The cost is that a second push to the same pull request no
      longer reuses its own build stage, but with the dependency layers
      coming from `main` that stage is `yarn build`, about 22s
- [x] Measure and record here. The estimate is 3m 23s down to about
      1m 30s, which would put the E2E pair near 4m 30s. Not measurable yet.
      #1327 merged at 15:42 on 1 October and `e2e-image-cache.yml` then ran
      on `main` for the first time, finishing at 15:47: 52s for the backend
      image and 2m 19s for the frontend, cache export included. Both
      scopes now exist on `refs/heads/main`. No heavy tier has run since,
      so the first pull request marked ready after that is the first
      reading. The last run without it, #1329's in the queue, built the
      images in 3m 16s and ran the E2E tests in 3m 11s. The allowance is
      still over, 10.65GB across 154 caches, and should fall as the old
      per pull request copies pass seven days unread. Measured on the
      four heavy runs after that, two on pull requests and two in the
      merge queue: the build took 1m 45s to 2m 12s, against 3m 16s to
      4m 23s on the four queue runs before it. The backend image took 6 to
      26s and the frontend about 62s. The E2E pair came to about 4m 15s,
      and the two queue runs finished in 4m 21s and 4m 49s, where the four
      before took 5m 42s to 7m 55s

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
      49s. On #1329's merge queue run the three legs took 1m 28s, 1m 43s
      and 2m 04s, against 5m 07s to 5m 37s for the single job in the runs
      before it
- [ ] Measure `Python unit` over a day of runs. The three merge queue
      runs with `-n auto` took 4m 26s, 4m 07s and 3m 36s for the whole
      job, against a middle value of about 5m 20s across the sixteen
      queue runs before it, which ranged from 4m 36s to 5m 50s. That is
      about a minute, and more than the first run suggested, but the two
      ranges nearly touch

## Phase 8: what is left to speed up

After Phases 3 to 7 a merge queue run takes about 7 minutes and all of it
is the E2E pair: on #1329's run the image build and the E2E tests took
6m 27s between them while everything else had finished inside 4m 30s. If
Phase 6 delivers its estimate, the pair drops to about 4m 30s and sits
level with `Python unit`. These are the candidates found while building,
in the order they would then matter. None is committed to.

- [x] Run the E2E tests on more than one worker. `playwright.config.ts`
      sets `workers: 1` when `CI` is set, so `E2E (Playwright)` runs its
      tests one at a time on a 4 core runner, for about 3 minutes. It also
      sets `retries: 2`. Find out first why it is one: the tests share one
      seeded stack and database, so some may depend on what another left
      behind, and that is what would have to be fixed before the number
      goes up. It was one because that is the default in Playwright's
      starter configuration, not for a reason of ours. The tests already
      allow for running side by side: `fullyParallel` is on, a local run
      uses several workers, each browser project changes its own seeded
      member, and a retry replays cleanly. Set to two in CI, not four,
      because the runner's four cores also carry the stack under test.
      `CI=1 just e2e` passed locally, 43 tests on two workers in 1.2
      minutes with no retries. Only about 1m 40s of the job's 3 minutes
      is the tests, so the most this can save is under a minute. Try
      four once two has held for a while. In CI the "Run E2E tests" step
      took 58s, 59s and 71s on two workers, against 104s on a pull request
      still on one, so the job went from about 3 minutes to about 2m 30s
- [x] Give the backend tests a cheap password hasher, if hashing is what
      limits them. Confirm it first with `pytest --durations=25` on a CI
      run. `security.py` uses argon2-cffi's defaults, 64MB and four
      threads per hash, which is right for production and is the likely
      reason four workers saved only about a minute. This changes how
      security code is configured, so it needs a decision of its own
      before any of it is built. Confirmed, and built without touching
      security code at all. The two slowest tests were the password round
      trips in `test_security_pentest.py`, at 19s and 11s for 400 hashes
      and checks, about 47ms each, and almost every other test makes a
      user. `tests/conftest.py` now swaps the hasher for a cheap one in
      the test process only. `app/security.py` and its settings are
      unchanged, so no switch exists that could weaken a deployment, which
      was the worry behind asking for a decision. `test_security.py` gains
      tests that the hasher production builds is still Argon2id at 64MB,
      three passes and four threads, and that a hash made at full strength
      still verifies. Timed locally on the whole suite, container start
      included: 371s before and 172s after on one process, and 221s before
      and 95s after with `-n auto`. So hashing was a little over half the
      suite, and with it gone the workers from Phase 7 pay off
- [x] Widen what `e2e-image-cache.yml` warms, if Phase 6's reading shows
      the build stage is what remains. It saves only when a dependency
      file changes, so a pull request always rebuilds the application
      layers, `yarn build` at about 22s among them. Warming on every push
      to `main` that touches `frontend/` or `backend/` would let a pull
      request that changes only one side take the other image whole from
      the cache, at the cost of a build on most merges. The reading did
      show it: with the dependencies cached the frontend image still took
      about 62s on every run, and the E2E pair at about 4m 15s is what a
      run waits for once the backend tests are quicker. The trigger now
      lists everything either Dockerfile copies in, and for the backend no
      more than that, so a change to its tests alone builds nothing. The
      cache is only as fresh as the last finished run on `main`, so a pull
      request that follows a merge closely still builds both, as it does
      today
- [ ] Measure the image build on a pull request that leaves the frontend
      alone, once this has merged and warmed. The estimate is about 30s,
      from 1m 45s
- [ ] Decide whether to pay for larger runners, and if so make the runner
      a repository variable. `runs-on: ${{ vars.CI_RUNNER_PY_UNIT ||
      'ubuntu-24.04' }}` leaves a job on the free runner until the
      variable is set, so each job can be switched on its own with
      `gh variable set` and no commit, and a `just ci-speed` recipe could
      set them as a group. The organisation is on the Enterprise plan, so
      larger runners are available once created, in a runner group that
      allows public repositories. On 1 October 2026 GitHub listed Linux
      x64 at $0.022 a minute for 8 cores and $0.042 for 16, with none of
      it free on a public repository, so set a spending limit first. More
      cores help only the jobs that use them: the frontend and Storybook
      legs should scale, the E2E tests will not while they run on one
      worker, and a bigger runner has the same speed per core

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
