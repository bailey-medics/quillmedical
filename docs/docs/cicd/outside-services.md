# Outside services CI depends on

A CI run reaches several services this repository does not run. When one
refuses or cannot be reached, a job fails with nothing wrong in the code,
and in the merge queue that removes the pull request and every one stacked
on it. This page lists each service, how it has failed, and what stands
between that failure and a lost pull request.

It was written from `.github/workflows/ci.yml`,
`.github/workflows/mirror-images.yml`, `.github/actions/setup-python/`,
`.github/actions/setup-frontend/`, `.github/scripts/shared/retry-once.sh`,
`.github/scripts/ci/check-mirrored-images.sh`,
`.github/scripts/ci/check-renovate-tracks-images.sh`,
`.github/scripts/ci/use-mirrored-base-images.sh` and
`.github/scripts/ci/report-queue-failure.sh`. The reasons are in the
[CI that holds under load plan](../plans/2026-10-12-ci-that-holds-under-load-plan.md).

## The three covers

- **A copy.** The thing is fetched once and kept somewhere GitHub's own,
  so a run does not ask the outside service at all.
- **One retry.** `retry-once.sh` runs a command and, if it fails, waits
  thirty seconds and runs it once more. A second try writes a warning onto
  the run's summary.
- **A message.** When a merge queue run fails, Slack says which pull
  request was removed and whether the fault looks like the code's or an
  outside service's.

## Each service

### Amazon's public registry, `public.ecr.aws`

- **Used for** - the base images the Dockerfiles build on (Python, Node,
  Caddy), the Postgres and Caddy the end-to-end stack runs, and the
  Postgres of the migration drift check.
- **How it failed** - `429 Too Many Requests`, "Data limit exceeded", when
  several jobs pulled at once on 12 October 2026. The allowance is
  Amazon's, for pulls with no account, and is not recorded here.
- **Cover** - a copy. `mirror-images.yml` copies each image to
  `ghcr.io/<owner>/mirror/` and the builds and the end-to-end stack pull
  the copy. An image the mirror does not hold yet falls back to the public
  one and says so in Slack. `check-mirrored-images.sh` fails the build
  when a workflow or Dockerfile names a public image with no way to the
  mirror.

### GitHub's container registry, `ghcr.io`

- **Used for** - the mirror, and the images CI builds for a commit.
- **How it failed** - it has not.
- **Cover** - one retry on each `docker pull`. Pulls are signed in with
  the workflow's own token.
- **Also** - Renovate's own image, pulled by
  `renovate-tracks-images.yml`. That runs only on a pull request that
  changes how an image is written or how Renovate is set up, and never in
  the merge queue.

### GitHub's releases

- **Used for** - the exact Python in `.python-version`, which the runner
  does not carry, and the `actionlint`, `gitleaks`, `oasdiff` and
  `zizmor` tools.
- **How it failed** - 504, three times in a row for Python on 12 October
  2026, and once for `actionlint` the same day.
- **Cover** - for Python, a copy: the shared action keeps the installed
  Python in GitHub's cache, and a run that finds it downloads nothing.
  `gate-breaking.yml` and `teaching-pipeline.yml` cannot use that action
  and carry the same steps written out; `kept-python.bats` holds the
  three to one key.
  The first run on a new runner image or a new Python version still
  downloads. For the tools, `curl --retry 1`.

### GitHub's cache

- **Used for** - the installed Python, and the Poetry, pip, Yarn and
  pre-commit downloads.
- **How it failed** - it has not. A cache that cannot be reached is a
  miss, not a failure, and the job fetches the thing the slow way.
- **Cover** - none needed, for that reason.

### The package indexes

- **Used for** - PyPI, for Poetry, pre-commit, Semgrep and the backend's
  packages; the npm registry, for Yarn itself and the frontend's packages.
- **How it failed** - it has not yet.
- **Cover** - GitHub's cache holds the downloads, so most runs ask for
  little. One retry on every install.

### Microsoft's registry, `mcr.microsoft.com`

- **Used for** - the Playwright image the Storybook and end-to-end jobs
  run in.
- **How it failed** - it has not.
- **Cover** - one retry. It is not mirrored: the version follows
  `@playwright/test` in the frontend's lock file, so there is no fixed
  name to copy ahead of time.

### Google's mirror of Docker Hub, `mirror.gcr.io`

- **Used for** - the BuildKit image `docker buildx` runs builds in.
- **How it failed** - it has not.
- **Cover** - none. It is already a mirror, and the step that pulls it is
  inside an action, where a retry cannot be put.

### The runners themselves

- **Used for** - everything.
- **How it failed** - it has not. GitHub limits how many jobs an account
  runs at once, by plan. Reaching the limit makes jobs wait, it does not
  fail them.
- **Cover** - none. Nothing here measures the wait yet.

## What is not covered

- **Putting a pull request back in the queue.** The Slack message says to
  do it by hand. A workflow cannot do it usefully with its own token: the
  entry gets no checks run and waits for ever.

## Who moves the pins

Every image above is pinned to a digest, so it changes only when Renovate
opens a pull request moving the pin. `renovate-tracks-images.yml` runs
Renovate read-only and `check-renovate-tracks-images.sh` fails when an
image the mirror copies is missing from what Renovate found. Without it, a
pin Renovate had lost sight of would look healthy for ever.

## Adding something CI fetches

- **An image** goes in `compose.ci.yml` or behind an `ARG` ending
  `_IMAGE` in a Dockerfile. The mirror copies it on the pull request that
  adds it.
- **A package install or a download** is run through `retry-once.sh`.
- **Never a test, a linter or a build of our own code.** Those fail
  because of the code, and a second run hides a flaky test.
- **A new job in `ci.yml`** is added to the `needs` of
  `queue_failure_report`, or its failure is not waited for.
