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

- [ ] Add a check that fails when a workflow or a Dockerfile names a
      public registry with no mirror behind it, so the next image added
      cannot quietly bring the problem back. Beside
      `check-version-consistency.sh` in `.github/scripts/ci/`, with bats
      tests. `compose.dev.yml` and `compose.migrate.yml` are for a
      developer's machine and are left out.

## Phase 2: Stop downloading tools on every job

- [ ] Find every job that installs Python or Node afresh. Ten workflow
      and action files use `setup-python` or `setup-node`. With the exact
      version from `.python-version`, 3.14.7, the runner's own copy does
      not match and `setup-python` downloads it from GitHub's releases on
      every run. That download is what returned 504 and failed Semgrep on
      #1830 and #1831.

- [ ] Run Semgrep without installing Python at all. It only needs a
      Python to run Semgrep on, not the project's. Use Semgrep's published
      container image, mirrored under Phase 1, or the Python already on
      the runner.

- [ ] For the jobs that do need the project's exact Python, stop each one
      fetching it. Decide between caching the installed Python across runs
      and running those jobs inside the backend dev image, which CI
      already builds and which holds the right Python and every
      dependency. Research which GitHub supports reliably before choosing,
      and record what was found here.

- [ ] Do the same for Node in `.github/actions/setup-frontend/action.yml`.

## Phase 3: Retry what is flaky, once

- [ ] Wrap each remaining outside call in one retry: a registry pull, a
      package install, a tool download. A 504 or a 429 that clears in
      thirty seconds should cost thirty seconds, not a pull request.

- [ ] Retry inside the step, not by re-running the job, so a real failure
      is not run twice and reported late. Only for a failure to reach
      something. A test that fails is never retried.

## Phase 4: Do not let one flake empty the queue

- [ ] Tell an infrastructure failure from a code failure. A job that
      failed before any test ran, at checkout, setup or a pull, did not
      fail on the code. Give each such step a recognisable exit, or read
      the failed step's name from the run.

- [ ] Put a pull request back in the queue when it was removed for an
      infrastructure failure. A workflow on the queue's removal event,
      which reads why, re-queues once, and says so on the pull request.
      Once only: a second removal is left for a person.

      The queue's rule that every entry must be green stays. It is what
      stops broken code reaching `main`. This only stops a 504 being
      counted as broken code.

- [ ] Research first whether GitHub lets a workflow add a pull request to
      a merge queue, and with what permission. If it does not, the
      fallback is a Slack message naming the pull requests to re-queue and
      the reason, which is still better than finding out by looking.

## Phase 5: Build each image once and reuse it

- [ ] Share one built backend image and one frontend image across every
      job that needs them for a commit. The end-to-end job and the
      Storybook job already pull images built earlier in the same run;
      extend that to every job that builds its own, so a commit is built
      once. Fewer builds is fewer base image pulls and less time.

- [ ] Where the deploy builds the same commit CI has just built and
      tested, look at whether it can promote that image and not build
      again. Only if what is deployed stays exactly what was tested.

## Phase 6: Skip what a change cannot affect

- [ ] Let a pull request that touches only documentation, or only
      `infra/`, skip the frontend and backend heavy tiers. The required
      checks must still report, so a skipped job has to count as passed,
      as the draft-skipped jobs already do.

- [ ] Decide by what a path can affect, not by a list somebody has to keep
      up. `shared/` reaches both sides, and a workflow file reaches
      everything.

## Phase 7: Measure it

- [ ] Record, for each queue run: how long it waited, how long it ran,
      whether it passed, and when it failed whether the cause was the code
      or something outside. Use the infrastructure marker from Phase 4.

- [ ] Show it somewhere that gets looked at. The aim is to see the next
      limit coming. GitHub also limits how many jobs an account runs at
      once; reaching that makes jobs wait, not fail, and this is what
      would show it.

## Phase 8: Alert on infrastructure failures

- [ ] Post to Slack, through `slack-notify.yml`, when a job fails for a
      reason outside the code, naming the service that refused and the
      pull requests affected. Today a queue failure is found by noticing
      that pull requests have gone.

## Phase 9: Write the limits down

- [ ] Add a page to `docs/docs/cicd/` listing every outside service CI
      depends on, the limit it has, and what covers it: the registries,
      GitHub's tool downloads, the package indexes, the account's
      concurrent job limit. Written from the workflows once Phases 1 to 4
      are done, so it describes what is true.

## Decisions

- **No cap on how much the queue builds at once** - lowering it was
  considered and rejected by Mark on 12 October. It reduces load by
  slowing everybody down, which is the opposite of what more people need.
  Phases 1 to 4 remove the causes, and with them gone there is nothing for
  a cap to protect.

- **Phases 1 to 4 first** - they remove the failures of 10 and 12
  October. Phases 5 to 9 are what keep it steady as more people join, and
  can follow at leisure.

- **A standalone pull request off `main`, not the bottom of a stack** -
  the queue tests each entry merged with current `main`, so once a fix is
  on `main` every later run has it, wherever that pull request sat.
  Putting it under an open stack would rebuild every branch above, which
  is the load that tripped the limits.
