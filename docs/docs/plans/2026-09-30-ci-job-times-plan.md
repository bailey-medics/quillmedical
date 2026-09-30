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
- [ ] Confirm on a new pull request that "Install Playwright browsers" is
      skipped and only the system dependencies step runs
- [ ] Re-measure the E2E job and record the new average here
