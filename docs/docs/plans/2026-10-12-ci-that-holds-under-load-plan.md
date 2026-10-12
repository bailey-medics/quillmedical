# CI that holds under load plan

On 12 October 2026 thirteen stacked pull requests were queued to merge at
once. Six landed. The other seven were thrown out of the merge queue, with
nothing wrong in any of them: a download of Python from GitHub returned 504
three times and failed a Semgrep job, and Amazon's public registry refused
a base image with "too many requests". The queue requires every entry to
be green, so one failed job removed its pull request and the six stacked
on it. The same shape of failure cost fourteen pull requests on 10 October.

That was one person. More people are expected to be coding here soon, and
the load will only grow. The aim is CI that does not fail for reasons
outside the code, however much is pushed at it, by removing the outside
dependencies and not by slowing the queue down.

## Phase 1: Mirror every image CI pulls

- [x] Mirror the base images the Dockerfiles build from: Python
      (`backend/Dockerfile` and `backend/Dockerfile.caption`), and Node
      and Caddy (`frontend/Dockerfile`). All three are pulled from
      `public.ecr.aws` each time an image is built, in `ci.yml`,
      `e2e-image-cache.yml` and `deploy.yml`. The "E2E image build" job
      failed on #1829 because that pull was refused.

      The mirror already exists. `mirror-images.yml` copies the images
      named in `compose.ci.yml` into `ghcr.io/<owner>/mirror/`, through
      `.github/scripts/mirror-images/copy-images.sh`. It only knows about
      the images the end-to-end job runs, Postgres and Caddy. Teach it to
      read the `FROM` lines of the Dockerfiles as well.

      Built a little differently. Each Dockerfile now names its base
      image in an `ARG` ending `_IMAGE`, with the public image as the
      default, and `FROM` reads the argument. `copy-images.sh` copies
      whatever those arguments default to. That one change serves both
      this step and the next: the argument is what lets CI hand a build
      the copy. A developer's build passes no argument and uses the
      public image as before.

- [x] Have the builds pull the copies. A `FROM` line cannot ask whether a
      mirror holds an image, so give each base image a build argument that
      defaults to the public one, and have the workflows pass the mirror's
      when it is there. Follow
      `.github/scripts/ci/use-mirrored-images.sh`, which does this for the
      end-to-end job and falls back to the public image when the mirror
      lacks it. The digests are pinned, and a copy is exact, so the pin
      holds for the copy.

- [x] Keep the fallback, and keep it loud. The mirror is only filled after
      this merges, so the first builds will fall back. `ci.yml` already
      posts to Slack when the end-to-end job uses a public image;
      extend that to the builds.

- [x] Cover `deploy.yml` in the same change. A refused pull there is a
      failed production deploy, not a failed check.

- [ ] Move the one image still named directly in a workflow: the Postgres
      service of the drift check, at `ci.yml` line 144. Pull request #1842,
      open from another worktree on 12 October, does this. Check whether
      it has merged before doing it again.

      Still open when the check below was written, so it is left to that
      pull request and not done twice. The check knows that one image as
      a named exception, and fails once the exception matches nothing, so
      it is removed when #1842 lands and cannot outlive its reason.

- [x] Add a check that fails when a workflow or a Dockerfile names a
      public registry with no mirror behind it, so the next image added
      cannot quietly bring the problem back. Beside
      `check-version-consistency.sh` in `.github/scripts/ci/`, with bats
      tests. `compose.dev.yml` and `compose.migrate.yml` are for a
      developer's machine and are left out.

- [x] Pin the last image named by tag, and drop the mirror's weekly run.
      Postgres in `compose.ci.yml` was `postgres:18-alpine` with no
      digest, and a tag moves when a patch is released, so
      `mirror-images.yml` copied everything again each Monday to keep
      up. It is now pinned to the digest `compose.dev.yml` uses. With
      every image pinned, none changes outside a pull request, that pull
      request makes the copy, and the schedule is gone. Mark's decision,
      12 October, after Phase 6.

      `check-mirrored-images.sh` now refuses an image named by tag alone,
      in the compose file or a Dockerfile's `_IMAGE` argument, so the
      schedule cannot become needed again without a check failing.

- [x] Check that Renovate can see every pin. Pinning hands the job of
      keeping an image patched to Renovate, and a pin Renovate cannot
      see never moves, with nothing failing. Renovate reads these
      images through two forms it could lose: a compose image that is a
      variable's default, and a base image named in an `ARG`.

      `renovate-tracks-images.yml` runs Renovate over the checkout with
      `--platform=local --dry-run=extract`, which writes a report and
      changes nothing, and `check-renovate-tracks-images.sh` fails when
      an image the mirror copies is not in it with its digest. Only on a
      pull request that changes one of those files or `renovate.json`,
      and never in the merge queue, because it pulls Renovate's image.

      Run by hand on 12 October with Renovate 44.151.5: it found all six
      images, in both forms. So the `ARG` form from the first step of
      this phase is read, which had not been seen until then.

## Phase 2: Stop downloading tools on every job

- [x] Find every job that installs Python or Node afresh. Ten workflow
      and action files use `setup-python` or `setup-node`. With the exact
      version from `.python-version`, 3.14.7, the runner's own copy does
      not match and `setup-python` downloads it from GitHub's releases on
      every run. That download is what returned 504 and failed Semgrep on
      #1830 and #1831.

      Found, from the log of a green run on 12 October. Python is
      downloaded by every job that sets it up: the log reads "Version
      3.14.7 was not found in the local cache", then a download from
      `actions/python-versions`. Those jobs are the Semgrep job, the
      teaching validation job and the three uses of the shared action in
      `ci.yml`, plus `docs.yml`, `dependency-audit.yml`,
      `security-pentest.yml`, `gate-breaking.yml` and
      `teaching-pipeline.yml`. Node is not downloaded at all: see the
      last step.

- [x] Run Semgrep without installing Python at all. It only needs a
      Python to run Semgrep on, not the project's. Use Semgrep's published
      container image, mirrored under Phase 1, or the Python already on
      the runner.

      The runner's Python. `pipx` is on the runner and builds Semgrep's
      environment from the Python beside it, so the `setup-python` step
      is simply gone. The container image was the other choice and was
      not taken: the job runs `run-semgrep.sh`, which needs `bash` and
      `jq` beside Semgrep, and a second image to mirror and keep in step
      with the pinned version buys nothing the runner does not give.

- [x] For the jobs that do need the project's exact Python, stop each one
      fetching it. Decide between caching the installed Python across runs
      and running those jobs inside the backend dev image, which CI
      already builds and which holds the right Python and every
      dependency. Research which GitHub supports reliably before choosing,
      and record what was found here.

      Caching. `setup-python`'s own documentation says it looks in the
      runner's tool folder first and downloads only when the version is
      not there, and that its builds are made to live in the runner's
      tool folder and cannot be moved. So
      `.github/actions/setup-python` now keeps that folder's
      `Python/<version>` between runs with
      `actions/cache`, restored to the same place, and `setup-python`
      finds it. The key holds the version and the runner image. No
      published recipe for this on GitHub's own runners was found, so
      the proof is the log of the first run after the cache is saved:
      it should read "Found in cache".

      It fails soft. A missing or unreachable cache leaves the download
      as it was. The cache is a different GitHub service from the
      releases download, so this does not remove an outside call, it
      swaps a large download that has failed for a smaller one with a
      fallback behind it.

      Running the jobs in the dev image was rejected. It would mean
      every fast job waits for an image build, or pulls an image that
      must exist for the commit, and the fast tier runs on every push.

      The teaching validation job in `ci.yml` now uses the shared
      action too, without the backend's dependencies.

- [ ] Do the same for the two that cannot use the shared action:
      `gate-breaking.yml`, which checks the pull request out into `pr/`
      and has no workspace root to read an action from, and
      `teaching-pipeline.yml`, which runs in the content repositories.
      Wait for the log above to show the cache working before copying
      the steps into either.

- [x] Do the same for Node in `.github/actions/setup-frontend/action.yml`.

      Nothing to do. It asks for Node `24`, any release of it, and the
      runner carries one: every job's log reads "Found in cache" with
      Node 24.21.0. An exact Node version
      would bring the download back, so leave it as a major version.

## Phase 3: Retry what is flaky, once

- [x] Wrap each remaining outside call in one retry: a registry pull, a
      package install, a tool download. A 504 or a 429 that clears in
      thirty seconds should cost thirty seconds, not a pull request.

      `.github/scripts/shared/retry-once.sh` runs a command and, if it
      fails, waits thirty seconds and runs it once more. It is put in
      front of each call that reaches out, in `ci.yml`, the two setup
      actions, `dependency-audit.yml` and `guide-screenshots.yml`: the
      `pip`, `pipx`, Poetry, Corepack and Yarn installs, the hooks
      `pre-commit` fetches, and every `docker pull`. The three scripts
      that download a tool with `curl` use `curl`'s own `--retry 1`,
      which retries a timeout, a 429 and a 5xx and nothing else.

      A second try writes a warning onto the run's summary, so a run
      that needed one does not look like a run where nothing happened.
      That warning is also the first thing Phase 9 can count.

      Not wrapped, because a step cannot be: the base image pulls
      inside `docker/build-push-action`, which Phase 1 moved to the
      mirror, and `setup-python`'s download, which Phase 2 keeps
      between runs. Not wrapped yet: `gate-breaking.yml` and
      `teaching-pipeline.yml`, for the reason given in Phase 2.

- [x] Retry inside the step, not by re-running the job, so a real failure
      is not run twice and reported late. Only for a failure to reach
      something. A test that fails is never retried.

      The script's header says so, and no test, linter or build of our
      own code is wrapped. An install that fails for a real reason, a
      package that does not exist, is tried twice and costs thirty
      seconds. That is the price of not reading each tool's error text.

## Phase 4: Do not let one flake empty the queue

- [x] Research first whether GitHub lets a workflow add a pull request to
      a merge queue, and with what permission. If it does not, the
      fallback is a Slack message naming the pull requests to re-queue and
      the reason, which is still better than finding out by looking.

      Moved to the top of the phase, because the answer decided the
      rest. A workflow can add a pull request to the queue, through the
      `enqueuePullRequest` call, but not usefully with its own token.
      GitHub starts no workflow from anything its built-in token did, and
      several projects report the result: the entry gets no checks and
      waits for ever. One counted eighteen pull requests, and those
      queued by the built-in token got no run at all. GitHub's own pages
      do not mention the case. The fix those projects used is a GitHub
      App, or a personal token, for that one call.

      So the fallback is what is built here, and the App is left as a
      step of its own below. Nothing in this repository holds a token of
      that kind today.

- [x] Tell an infrastructure failure from a code failure. A job that
      failed before any test ran, at checkout, setup or a pull, did not
      fail on the code. Give each such step a recognisable exit, or read
      the failed step's name from the run.

      `.github/scripts/ci/report-queue-failure.sh` reads the log of each
      failed job in a queue run. It looks at the thirty lines leading up
      to the first error and calls the failure outside the code when
      they carry the mark of a refused or unreachable service: a 429, a
      5xx, a name that cannot be looked up, a dropped connection, a lost
      runner, or the line `retry-once.sh` from Phase 3 prints when a
      call fails twice. That last one is the recognisable exit. Only
      those lines, because a test's own output may mention a 504.

      It is a reading of a log and can be wrong, so its message says
      "looks like". A job whose log cannot be fetched counts as a real
      failure.

- [x] Say so in Slack, naming the pull request and the reason. Two jobs
      at the foot of `ci.yml` run in the merge queue when any job
      failed, and post one of three messages: removed by a fault outside
      the code, so add it to the queue again; removed by a failed check;
      or some of each. This is Phase 5 as well, done here because it is
      the same message.

- [ ] Put a pull request back in the queue when it was removed for an
      infrastructure failure. A workflow on the queue's removal event,
      which reads why, re-queues once, and says so on the pull request.
      Once only: a second removal is left for a person.

      The queue's rule that every entry must be green stays. It is what
      stops broken code reaching `main`. This only stops a 504 being
      counted as broken code.

      Waits on two things. A GitHub App installed on this repository,
      allowed to write pull requests and nothing else, for the reason
      above: Mark has to create it. And a week or two of the Slack
      messages, to see that "outside the code" is right every time
      before anything acts on it unattended.

## Phase 5: Alert on infrastructure failures

- [x] Post to Slack, through `slack-notify.yml`, when a job fails for a
      reason outside the code, naming the service that refused and the
      pull requests affected. Today a queue failure is found by noticing
      that pull requests have gone.

      Done in Phase 4, for the merge queue. It names the pull request
      whose run failed. Those stacked on it are removed with it and get
      no message of their own, since their runs are stopped, not failed.

## Phase 6: Write the limits down

- [x] Add a page to `docs/docs/cicd/` listing every outside service CI
      depends on, the limit it has, and what covers it: the registries,
      GitHub's tool downloads, the package indexes, the account's
      concurrent job limit. Written from the workflows once Phases 1 to 4
      are done, so it describes what is true.

      `docs/docs/cicd/outside-services.md`. Written before the three phases after it, since it describes what
      Phases 1 to 4 built and those add no new service. It gives how each service has failed and not a
      number for its limit: Amazon's allowance for pulls with no account
      and the account's job limit were not looked up, and a guessed
      number is worse than none.

      The proof Phase 2 was waiting for came the same day. On 12 October
      the migration drift check, run a second time on #1875, logged
      "Cache hit" for the installed Python, set it up with no download,
      and passed.

## Phase 7: Build each image once and reuse it

- [ ] Share one built backend image and one frontend image across every
      job that needs them for a commit. The end-to-end job and the
      Storybook job already pull images built earlier in the same run;
      extend that to every job that builds its own, so a commit is built
      once. Fewer builds is fewer base image pulls and less time.

- [ ] Where the deploy builds the same commit CI has just built and
      tested, look at whether it can promote that image and not build
      again. Only if what is deployed stays exactly what was tested.

## Phase 8: Skip what a change cannot affect

- [ ] Let a pull request that touches only documentation, or only
      `infra/`, skip the frontend and backend heavy tiers. The required
      checks must still report, so a skipped job has to count as passed,
      as the draft-skipped jobs already do.

- [ ] Decide by what a path can affect, not by a list somebody has to keep
      up. `shared/` reaches both sides, and a workflow file reaches
      everything.

## Phase 9: Measure it

- [ ] Record, for each queue run: how long it waited, how long it ran,
      whether it passed, and when it failed whether the cause was the code
      or something outside. Use the infrastructure marker from Phase 4.

- [ ] Show it somewhere that gets looked at. The aim is to see the next
      limit coming. GitHub also limits how many jobs an account runs at
      once; reaching that makes jobs wait, not fail, and this is what
      would show it.

## Decisions

- **No cap on how much the queue builds at once** - lowering it was
  considered and rejected by Mark on 12 October. It reduces load by
  slowing everybody down, which is the opposite of what more people need.
  Phases 1 to 4 remove the causes, and with them gone there is nothing for
  a cap to protect.

- **Phases 1 to 4 first** - they remove the failures of 10 and 12
  October. The rest keep it steady as more people join, and can follow
  at leisure.

- **A standalone pull request off `main`, not the bottom of a stack** -
  the queue tests each entry merged with current `main`, so once a fix is
  on `main` every later run has it, wherever that pull request sat.
  Putting it under an open stack would rebuild every branch above, which
  is the load that tripped the limits.

- **Phases 7 to 9 wait for the first six to merge** - decided on 12
  October, during the build. Building each image once, skipping by path
  and measuring all change the heavy tier, and the heavy tier has not
  yet run on any pull request of this stack, because they are drafts.
  Building more on top of changes nothing has tested would hide which
  one broke. The phases were also reordered then: the alert and the page
  of limits were built before these three, so they now come first.
