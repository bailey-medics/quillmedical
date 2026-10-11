# Assurance before the EoEETA release plan

EoEETA goes live on the teaching materials in the autumn of 2026. Code
reaches `main` through a pull request and a set of automated checks, and
both were trusted to be doing their job. Then one of them was found not
to be: Bandit, the Python security scanner, had been handed its
arguments with a typo, scanned nothing, and passed every commit. A check
that scans nothing passes, and nothing about a green tick says which
kind it is. So before the release, every check is made to prove it is
live, every route is held to its guard by a test, and the code is
audited: a third pair of eyes after the author and the checks, reading
file by file and recording what was read, by whom, and at which version.

The order follows the risk. Teaching holds no clinical data, so what is
at stake is personal data and the account system. A fault in the tooling
multiplies risk, because it switches a safety net off for the whole
codebase, where a fault in a feature only adds to it. So the tooling
comes first, then the routes, then the security paths, and the audit
carries on from there as a standing part of how Quill is built.

## Phase 1: An audit ledger

- [x] Add `scripts/review-ledger.py` holding a ledger at
      `review-ledger.tsv` in the shared `local/` folder, which it finds
      through `scripts/local-path.sh`, one line per file: path, the git
      blob hash of the file when it was audited, and the date. The hash
      is what git already computes (`git hash-object`), so a file edited
      after its audit stops matching and shows as changed, rather than
      staying ticked. A tick on its own cannot say that. Whole files,
      not line ranges: a changed file shows its diff, and the diff is
      what gets read again. Three commands to begin with. `mark <paths>`
      records the current hash for each path, expanding a folder to its
      files, and stores the contents in git so a file stamped before it
      was committed can still be compared later. `status` prints lines
      and files audited out of the total, code and tests counted apart,
      then the files changed since their audit, then each folder in tree
      order; with a folder it lists that folder file by file.
      `diff <path>` shows what changed since the stamp. Prose, pictures,
      lock files and generated files are left off the card. Tests in
      `scripts/tests/review-ledger.bats`. The card began as a working
      record on the auditor's machine and moved into the repository on
      11 October 2026: see the step below.

- [x] Add the recipes to the `Justfile`: `reviewed` (alias `r`),
      `review-status` (alias `rs`), `review-diff` (alias `rd`) and
      `unreviewed` (alias `ur`), which takes a stamp off a file marked by
      mistake. `just rs` prints two lines, code and tests; `just rs f`
      adds the files changed since their audit and a line for each
      folder. The ledger is one file in the main checkout, so every
      worktree stamps the same card. Landed in pull request #1689.

- [x] Show the card in the editor. A VS Code extension at
      `tools/review-marks/`, installed with `just review-marks-install`,
      puts a green tick on an audited file, its tab and any folder that
      is audited all through, and an orange mark on a file changed since
      its audit, with a grey bar in the margin beside each changed line.
      The status bar says Audited, Changed since audit or Not audited
      for the open file, and a click stamps it or shows the change side
      by side. It keeps no
      record of its own: every answer comes from
      `scripts/review-ledger.py states`, so the editor and the recipes
      cannot disagree.

- [x] Record who made each stamp. Done on 10 October 2026. A line on
      the card ends with the auditor's name and email, taken from the
      name git is set up with, so nothing is typed. Several people may
      stamp the same file, each on a line of their own, and a file
      counts as audited when anybody's stamp matches what it holds now.
      `just r` stamps as you and replaces only your own earlier stamp;
      `just ur` takes off only your own. `just rs <folder>` and the
      editor's hover say who audited each file. There are no totals for
      a person, on purpose: Mark, "it is not a race. It is about who
      reviewed a single file, that is all". This is a record
      a clinical safety assessor could use.

- [x] Never let a write lose the card. On 11 October 2026 a worktree
      still holding the first version of the script, from before stamps
      carried a name, stamped one file. It could not read the named
      lines, skipped them, and wrote the card back with only its own
      stamp on it. The card is not in git, so there was nothing to
      restore it from. The script now stops, changing nothing, at any
      line it cannot read, and says the worktree is behind. A daily
      copy of the card was added too, and taken out again the same day
      when the card moved into git.

- [x] Keep the card in the repository, so more than one person can
      audit. Done on 11 October 2026, at Mark's request. The card is
      `audit/ledger.tsv`, one file for everybody, with
      `audit/README.md` beside it. A stamp is now a change like any
      other: made in a worktree, committed on a branch, and counted for
      everybody once that branch merges, so stamps from a session land
      together as one small pull request. Git's history says who added
      each stamp, which a typed name could not, and is the way back
      from a bad write, so the daily copy added two steps above is gone
      again. `.gitattributes` merges the card by keeping both sides'
      lines, so two people stamping on two branches do not conflict.
      Anybody working on Quill may audit, and may audit their own code:
      Mark, "yes you can self-audit". One file and not one for each
      auditor, also Mark's call. Still to do: a CI check that every
      stamp names a version of its file that git holds.

- [x] Keep one stamp for each file. Done on 11 October 2026, the same
      day, and it replaces "several people may stamp the same file"
      two steps above. Mark: "one stamp per file, full stop. git can
      show us the history of who stamped what and when". Stamping a
      file replaces whatever stamp was there, whoever made it, and
      `just ur` takes the stamp off whoever made it. `adopt` is gone:
      no stamp on the card was without a name. Two branches that both
      stamp one file still merge without a conflict, because the merge
      keeps both lines, and that leaves the file with two. Mark chose
      to let the merge through and fail afterwards, over a plain git
      conflict, which would also fire for two files that sit next to
      each other on the card. `scripts/review-ledger.py check` fails
      and names each such file, from a hook in
      `.pre-commit-config.yaml`, so it runs at commit, in the required
      `Python pre-commit` check and in the merge queue. Stamping the
      file again leaves one stamp. Not changed: a stamp taken off on
      one branch can still come back in a merge, when the other branch
      changed a line beside it.

- [x] Call it what it is. The words the tool prints, the editor shows
      and the recipes describe changed from "read" to "audited", and
      the three states are audited, changed and unaudited.

- [x] Bring earlier audit work onto the card. Files audited before the
      ledger existed are stamped only where the auditor is sure of them,
      and a test file beside a module is stamped only when it has been
      read itself. A doubtful file is left for the audit to reach in its
      turn, which costs a second read and is cheaper than a wrong tick.

## Phase 2: Prove every check is live

- [x] Land the Bandit fix, which is on its own stack as pull request
      #1683, "Tests: turn the security scan on and fix what it finds". Its
      arguments in `.pre-commit-config.yaml` were `r backend -x
backend/tests`: `r` without the dash is a target, not the recurse
      flag, so Bandit was handed a directory it would not descend into and
      scanned nothing while passing every commit for a year. That pull
      request turns it on, adds timeouts and query parameters in
      `ehrbase_client.py`, marks 43 false alarms each with a reason, and
      runs the hook through `.github/scripts/ci/run-bandit.sh`, which
      fails when Bandit reports fewer than 10,000 lines scanned. Nothing
      to do here but see it merge; it is listed so the order is right.

- [x] Give the other scanners the same floor. The line-count guard in
      `run-bandit.sh` is the general answer to "is this tool reading
      anything": a tool that reports how much it scanned is held to a
      minimum, so a path typo fails the check instead of passing it.
      Done for Semgrep on 10 October 2026:
      `.github/scripts/ci/run-semgrep.sh` runs the scan as JSON, counts
      `paths.scanned` and fails under 500 files, and the CI job calls it
      in place of a bare `semgrep`. A real run scans 1,249 files. Not
      done for cspell, on purpose: pre-commit hands it the files in
      batches, so no one run knows the total, and a floor on a batch
      would fail a commit of one file. mypy and Ruff are handed files the
      same way. All three are covered by the planted violations below.

- [x] Look at the files Semgrep cannot read all the way through. Found
      while building the floor: of the 1,249 files, 50 come back with a
      `PartialParsing` warning, every one a `.tsx` file and most of them
      tests, on syntax such as `vi.fn<...>()`. Semgrep scans such a file
      up to the line it did not understand and skips the rest. The job
      sets `SEMGREP_LOG_LEVEL: error`, so nothing reported it until
      `run-semgrep.sh` began printing the count. Seen with Semgrep
      1.138 on the Mac; CI pins 1.172, which may read more of them, so
      read the count from the CI log first. If it is still high, the
      choices are a newer Semgrep, or a ceiling in the script so the
      number cannot grow unseen.
      **Looked at on 11 October 2026, and it is less than it sounded.**
      CI's 1.172 gives the same 50. Semgrep does not stop at the line it
      cannot read: the report gives the span it skipped, and each is a
      few characters, with the rest of the file scanned. Fifty of the
      files are tests and one story, almost all on
      `importOriginal<typeof import("...")>()`. One is source,
      `MessagingTriagePayment.tsx`, a demo, where the skipped spans are
      JSX text holding `&` and `$`. No rule looks at any of that. So no
      ceiling: it would fail a pull request for writing `&` in a
      sentence. The script now names the source files among them in the
      job log, so a new one is seen.

- [x] Plant one known violation per tool on a throwaway branch and
      confirm each one fails. Pre-commit: Ruff (an unused import), Black
      (a long line), mypy (an unannotated function), Bandit (a hard-coded
      password or `subprocess` with `shell=True`), cspell (a misspelt
      word in a comment), gitleaks (a fake AWS key in the right shape),
      `check_migrations.py` (a migration with an empty `upgrade()`),
      `check_api_schema_coverage.py` (a route with no schema). CI fast
      tier: `yarn typecheck:all` (an `any` in a story, since bare `tsc`
      skips stories), ESLint, a failing backend unit test, a failing
      frontend unit test. CI heavy tier: Semgrep (a rule from
      `frontend/.semgrep.yml`), a failing Storybook interaction test, a
      failing E2E. Record in this step which ones failed as expected and
      which did not, and fix the ones that did not before going on. This
      is the check that would have found the Bandit typo on the day it
      was made, and it answers the question the typo raised: what does
      each tool actually scan.
      **Pre-commit half done on 10 October 2026**, with one planted file
      a hook, staged and run as a commit runs it, then removed. Ruff,
      Black and cspell failed as they should. Three did not:
      Bandit passed a hard-coded password and `shell=True` (the known
      typo, fixed by #1683). gitleaks passed a staged AWS key and a
      GitHub token. mypy failed a wrong type but passed a function with
      no annotations at all, so it is not running strict. The next three
      steps are what came of that. Planting untracked files proves
      nothing, as pre-commit cannot see a rewrite of a file git does not
      know: stage them. `check_migrations.py` refused a planted
      migration with an empty `downgrade()`, as it should.
      `check_api_schema_coverage.py` passed a planted route returning
      `dict[str, str]`, which is the fourth dead check: see the step
      below.
      **CI half done on 10 October 2026**, after Mark said yes and asked
      for a branch for each check. Thirteen branches were cut from
      `main`, each with one fault, pushed, and closed and deleted once CI
      had reported. Twelve checks failed as they should: the spelling
      check in the pre-commit job, the backend unit tests, the frontend
      unit tests, `typecheck:all`, shellcheck, actionlint, the bats
      tests, the Alembic drift check, the Storybook build, and in the
      heavy tier Semgrep, the Storybook interaction tests and E2E.
      **One did not: ESLint passed a file it should have refused**, which
      is the fifth dead check, in the step below. Two reds were not the
      plant's doing: the type-check plant also failed ESLint and the
      Storybook build, because its file sat one folder down where ESLint
      does look and the build type-checks; and E2E failed on the
      interaction plant because the registry refused a pull for too many
      requests, with thirteen runs going at once. Not planted, as each
      pages a person on Slack for an approval: the API breaking-change
      gate and the destructive-migration gate.

- [x] Make the three frontend lint checks look at every folder. The
      scripts in `frontend/package.json` named their files as
      `*/*.{ts,tsx,js,jsx}`, which reaches one folder down and stops.
      In CI, ESLint checked 25 files of about 1,270, Prettier a similar
      handful, and stylelint none at all, kept quiet by
      `--allow-empty-input`. All three were green on every push. The
      commit hook was never affected, as `lint-staged` hands it the
      staged files by name, which is why almost nothing had slipped:
      with the patterns fixed ESLint found three warnings, Prettier four
      unformatted files and stylelint nothing, all fixed in the same
      change. `.github/scripts/ci/run-frontend-lint.sh` now runs each
      tool for CI and fails if it looked at fewer than 500 files, or 30
      for stylelint, whatever the tool's own verdict.

- [x] Give gitleaks its rules back. `.gitleaks.toml` held one allowlist
      and nothing else, and a gitleaks config file replaces the built-in
      rules unless it carries `[extend] useDefault = true`. So the secret
      scan has run with no rules at all, and passed everything, since
      that file was added. The block is added, with a comment saying
      never to remove it and `scripts/tests/gitleaks-config.bats` failing
      if it goes. The tracked files then showed 26 findings, every one
      looked at and none a live secret: made-up test secrets, the
      published RFC 6238 test key, names of Secret Manager secrets in
      Terraform, a made-up signature in a test, and the password of the
      dev stack's throwaway database. Each kind has its own narrow
      allowlist entry, by value and not by folder.

- [x] Make the API schema check see the routes again. It walked
      `app.routes`, and since the move to FastAPI 0.141.1 on 12 September
      2026 that list holds an included router as one entry and not its
      routes. The walk found none of the 191, reported nothing and
      passed, for four weeks. Nothing slipped through in that time: run
      properly it finds no fault. `backend/app/utils/route_list.py` now
      gives `served_routes(app)`, which asks FastAPI for the routes the
      way it resolves them itself, with the full path and every
      dependency, those given to `include_router` too. The check uses
      it and fails if it finds fewer than 100 routes, and its tests now
      walk the real app, which none did before. **Anything that needs
      every route must use `served_routes`, never `app.routes`**: the
      Phase 4 test above all.

- [ ] Go through what the rules find in the git history. A scan of all
      3,050 commits with the rules on finds 47, most of them the same
      non-secrets as above. Two are worth a look by Mark, neither urgent.
      `cookies.txt`, committed in September 2025 and since deleted, is a
      curl cookie jar from the dev stack on `localhost`, long expired;
      confirm the dev stack's signing secret was never used on a
      deployed environment. The dev database passwords in
      `compose.dev.yml` are in a public file on purpose; confirm they
      were never reused for a real database. The history cannot be cleaned without rewriting it, so
      the answer to either is to rotate, not to delete.

- [x] Scan for secrets in CI. Nothing did. The only gitleaks run was
      the pre-commit hook, whose command is `gitleaks git --staged`, and
      in CI `pre-commit run --all-files` has nothing staged, so the hook
      scans nothing there and passes. A secret pushed from a clone with
      no hooks, such as a web session before its hook is installed, or
      with `--no-verify`, reached the repository unseen. Built on 10
      October 2026: a `Secret scan` job in the fast tier installs
      gitleaks 8.30.1 from its release with the checksum verified, as
      `install-actionlint.sh` does for actionlint, and
      `.github/scripts/ci/run-gitleaks.sh` scans every commit the branch
      adds to `main`. Before scanning it writes a made-up AWS key into a
      scratch folder and checks gitleaks reports it, and fails without
      scanning if it does not, so every run proves its own rules fire.
      Not yet a required check: that is a line in
      `infra/github/branch_rules.tf`, and Mark's to add once the job has
      been seen to run.

- [x] Make mypy strict, which it had not been. `backend/pyproject.toml`
      set `strict = true`, and nothing read it: the hook ran mypy from
      the repository root, where there is no config, with the mirror's
      default arguments, in an environment of its own without FastAPI or
      Pydantic. Run by hand that config did not even load, because it
      named the plugin `sqlalchemy.ext.mypy.plugin`, which SQLAlchemy 2.1
      no longer ships. Done on 10 October 2026. The plugin line is gone.
      A new local hook, "mypy (backend, strict)", runs
      `.github/scripts/ci/run-mypy.sh`, which starts mypy through Poetry
      from `backend/`, so it reads the config and sees the real
      libraries, and fails if mypy checked fewer than 100 files. With
      strict truly on there were 94 errors in 23 files, all fixed, none
      of them a bug: eleven routes in `main.py` that return a
      `DetailResponse` and were annotated `dict[str, str]`, ten query
      results mypy could not type, four lists built as dictionaries
      where a response model was declared, stale `type: ignore`
      comments, and three development scripts with no annotations.
      `app/` and `scripts/` now pass with zero errors, 156 files, which
      is what `CLAUDE.md` has said all along. The old hook stays for the
      tests and tooling, as a basic check, and reports only on its own
      files.

- [x] Bring the basic mypy hook's SQLAlchemy up to the one that runs.
      "mypy (tests and tooling)" pinned `sqlalchemy==2.0.54` in its own
      environment while `backend/poetry.lock` is on 2.1.1, so the tests
      were type-checked against a library they do not run on. Done on 10
      October 2026: the pin is 2.1.1. That made mypy ask for an
      annotation in 24 places. The 19 in tests have one now. The 5 in
      merged migrations cannot be given one, as a merged migration may
      not be edited, so `backend/alembic/versions/` is left out of that
      hook: a finding there could never be acted on.

- [x] Refuse to run the host-side checks on the wrong Python. Found on
      10 October 2026 while landing strict mypy: `.python-version` pins
      3.14.7, which CI and the Docker images use, and two of the four
      worktrees had a backend environment on 3.13, because `just wc` let
      Poetry build on whichever Python it found first. The unit tests
      run in a container and were never affected. What runs on the host
      is the strict mypy hook, the API schema check and the email
      preview hook, which could pass here and fail in CI or the reverse.
      Now `scripts/check-python-version.sh` compares the environment
      with the pin and refuses a mismatch: it is the first local
      pre-commit hook, and `just docs` and `just email-themes` call it.
      `just venv-rebuild` rebuilds the environment on the pinned Python,
      and `just wc` builds on it from the start. An environment built before this change wants
      `just vr` once.

- [x] Note what has no check at all. Semgrep runs on the frontend only,
      from `frontend/.semgrep.yml`, and the backend relies on Bandit.
      Decide whether a backend Semgrep run is wanted before go-live
      (Comment from Mark: yes we do want a Backend Semgrep), and
      whether `pip-audit` and `yarn npm audit` should run in CI for
      known-vulnerable dependencies (Mark: yes again). The recommendation
      is the audits
      yes, as a fast-tier job that fails on high and critical, and
      backend Semgrep no until there is a rule it would enforce that
      Bandit does not.
      **Backend Semgrep built on 11 October 2026**, as Mark asked.
      Research first. Semgrep's published rule packs (`p/python`,
      `p/fastapi`, `p/jwt`, `p/security-audit`, `p/secrets`) were run
      once over `backend/app` and `backend/scripts`, tests left out: 175
      files, five findings. Two say `ehrbase_client.py` parses XML with
      the standard library and not `defusedxml` (EHR production, not the
      teaching release; worth a look by Mark). Three say a script builds
      a URL for `urllib` (the admin, caption and transcode command-line
      tools, which call Google's own addresses). So the packs find
      little Bandit does not. They are also fetched from semgrep.dev on
      every run, and change without a commit here, so a pull request
      could go red for a rule nobody added. Decision: rules kept in the
      repository, as the frontend's are, and only ones Bandit has no
      check for. `backend/.semgrep.yml` holds eight: a token read
      without checking its signature, `jwt.decode` with no algorithms
      list, SQL built from strings, a cookie a script can read, a cookie
      with `secure` or `samesite` left out, any origin with credentials
      in CORS, a secret written to a log, and a signature or token
      compared with `==`. The backend passes all eight; the one cookie
      a script must read, `XSRF-TOKEN`, is marked with its reason.
      **Each rule is proved live on every run**: each folder holds a
      canary file with one line breaking each rule, and
      `run-semgrep.sh` fails when a rule does not find its line. Done
      for the frontend's four rules too. The job is still named
      "Semgrep (frontend SAST)", because the branch rules require it by
      that name and renaming it is a ruleset change for Mark to apply.
      **Audits built on 11 October 2026.** A workflow of its own,
      `dependency-audit.yml`, and not a job in `ci.yml`: an advisory is
      published against code that has not changed, so in `ci.yml` it
      would turn the merge queue red for every pull request on the day
      one appears. It runs on a pull request that changes what is
      installed, every morning against `main` with a Slack message on
      failure, and on demand. Only what ships is gated: the backend's
      production packages with pip-audit, and the frontend's with
      `yarn npm audit --environment production`. pip-audit has no
      severity levels (the Python advisory lists carry none), so "high
      and critical only" is not possible there: any known vulnerability
      fails, and one that does not apply is excused by name with a
      reason in `backend/.pip-audit-ignore`. The script refuses an
      excuse with no reason and fails on one that matches nothing any
      more.
      **What the first run found.** Backend, four packages. `multidict`
      6.9.0, a memory leak a remote caller can drive, fixed in 6.9.1:
      updated in the lock file in the same pull request. A fourth
      was in a test tool's dependency and is not shipped. `python-jose` 3.5.0 and the
      `ecdsa` it brings in: no fixed version of either. Neither applies
      (tokens are HS256 with a shared secret and every decode names its
      algorithms), so both are excused with that reason. **For Mark to
      weigh: python-jose has now had the same key-confusion fault
      reported twice and has no fix out. Moving to PyJWT would retire
      both excuses.** Frontend: nothing against what ships. Among the
      build and test tools, not gated: one critical (`shell-quote` 1.9.0,
      under `concurrently`), two high (`braces`, `source-map-js`) and a
      few moderate. Renovate should raise these; if it has not, they
      want a nudge.

- [x] Switch the skipped new patient page tests back on. There were
      eleven in `frontend/src/pages/NewPatientPage.test.tsx`, not the
      four first counted, all marked `it.skip` in February 2026 on the
      belief that a Mantine `Select` would not open under JSDOM. It
      does. Three things were wrong with the tests and nothing with the
      page: they asked for the Sex field as a `textbox` when it is a
      `combobox`; they found the national number box by a pattern that
      also matched the "National number system" select added since, and
      typed the number into that; and two expected a response shaped
      `{data: {id}}` and a user created by `POST /users`, where
      `api.post` returns the body itself and the page calls
      `/auth/register`. All fourteen in the file now run and pass. A
      skipped test is a check that looks present and runs nothing, the
      same class of fault as the Bandit typo.

- [x] Deal with the sixteen skipped tests in
      `frontend/src/components/admin/Admin.test.tsx`. Looked at on 10
      October 2026, none could be fixed: every one tested something
      `Admin` no longer has. The component is now 84 lines, a title and
      three counts. The action cards, the add-user and add-patient
      modals, the callbacks and the form reset went when their work
      moved to pages of their own, and "link user to patient" is in the
      app nowhere at all. What moved is tested where it went:
      `AdminUsersPage.test.tsx` checks the Add user button goes to
      `/admin/users/new`, `AdminPatientsPage.test.tsx` the same for
      patients, and the new patient form's own tests now run. Mark said
      to delete them, and they are deleted. The fourteen tests that are
      left all run, and no test in the frontend is skipped any more.

- [x] Write the two tests that looking at the admin tests showed were
      missing. `NewPatientPage` has no test of editing an existing
      patient, only of creating one, and `EditUserPage.tsx` has no test
      file at all. Done on 11 October 2026. Found while writing them,
      and left for Mark: `routes.tsx` gives `patients/:patientId/edit`
      to `EditPatientPage` and, further down, `patients/:id/edit` to
      `NewPatientPage`. The two addresses are the same shape, the first
      one listed wins, so the edit mode of `NewPatientPage` cannot be
      reached in the app. One of the two is dead. **Fixed on 11 October
      2026 in pull request #1743**: the address now goes to the working
      form, `EditPatientPage` is only the list to pick from, and
      `routes.test.ts` fails on any two sibling routes with one
      address. `EditPatientPage` and
      `DeactivatePatientPage` have no tests either; both are patient
      pages, so EHR production and not the teaching release.

- [x] Run the thirteen video route tests that never run. Done on
      11 October 2026: the four local media routes moved out of
      `main.py` into `mount_local_media_routes` in
      `backend/app/features/teaching/local_media.py`, and
      `local_media_test.py` mounts them over a folder it makes, with a
      real file on each side of the line. The three image routes had no
      tests at all and now have them too. The
      path-traversal tests of the local video route in
      `backend/app/features/teaching/video_access_test.py` skip
      themselves when that route is not mounted, and it is mounted only
      when a local question bank is present, which is never true in the
      test container or in CI. They need the route mounted for the test,
      not a wait for an environment that has it. The other backend
      skips were looked at and are deliberate: `xfail(strict=True)` for
      behaviour not yet built, and integration tests that need Postgres.

- [x] Fix the test that fails at random in CI. Two tests in
      `.github/scripts/ci/run-storybook-tests-in-image.bats`, "stops the
      server once the tests have passed" and "stops the server when a
      test fails too", failed on pull request #1690 and passed on a
      re-run with no change. `stop_storybook` in
      `run-storybook-tests-in-image.sh` signalled the server's process
      group and returned without waiting, and the test asked at once
      whether the server had gone. A dead process also still answers to
      its number until something collects it. The script now waits for
      the server after the signal, which collects it too, and kills it
      outright after five seconds if it ignores the request, so the wait
      cannot hang a job. A check that fails at random teaches everybody
      to re-run a red build without reading it, which is how a real
      failure gets waved through. The fault could not be made to show
      on the Mac, even asked ten times in a row with the wait taken out,
      so the proof is the reasoning and the CI runs to come, not a test
      seen to go from red to green.

- [ ] Replace `python-jose` with PyJWT. Added on 11 October 2026 at
      Mark's request. `python-jose` 3.5.0 carries CVE-2026-85394, a key
      confusion fault reported for the second time, with no fixed
      version, and brings in `ecdsa`, whose timing fault its authors
      will not fix. Neither applies today (tokens are HS256 with a
      shared secret, and every decode names its algorithms), so both
      are excused in `backend/.pip-audit-ignore`. The fix is to stop
      depending on them. The calls are all in
      `backend/app/security.py`: five `jwt.encode` and three
      `jwt.decode`, plus the exceptions caught around them. PyJWT's
      `encode` and `decode` take the same arguments for HS256; its
      errors are `jwt.InvalidTokenError` and
      `jwt.ExpiredSignatureError` where jose has `JWTError` and
      `ExpiredSignatureError`. Tokens signed by one are read by the
      other, so nobody is signed out by the change. When it lands, take
      both lines out of `.pip-audit-ignore` (the audit fails until they
      go) and check the two Semgrep JWT rules still find their canary
      lines. This changes how sign-in tokens are read, so it is one to
      stop and show Mark before it is committed.

- [ ] Rename the Semgrep job to "SAST". Added on 11 October 2026 at
      Mark's request. It is `Semgrep (frontend SAST)` and now scans the
      backend too. The name is in three places that must change
      together: the job in `.github/workflows/ci.yml`, the required
      check in `infra/github/branch_rules.tf` and the list in
      `scripts/stack-status.py`. The branch rules are applied by hand
      with `just terraform-github`, and a required check that nothing
      reports under blocks every pull request, so the order matters:
      merge the workflow change with the queue switched off or with
      both names required for one merge, then apply the rules. See
      "Breaking the deadlock" in `.claude/rules/ci.md`.

- [ ] Update the three build tools with advisories against them. Found
      by the audit on 11 October 2026; none is shipped, so none is
      gated. `shell-quote` 1.9.0 (critical) is pinned by `concurrently`
      10.0.5, and 10.0.6 pins the fixed 1.12.0: `yarn up concurrently`.
      `source-map-js` 1.2.1 (high) is fixed in 1.2.2, inside the range
      everything asks for: `yarn up -R source-map-js`. `braces` 3.0.3
      (high) is the newest there is, so there is nothing to move to;
      it comes in under `chokidar` and `micromatch`, and the fault needs
      a hostile glob pattern, which nothing here takes from outside.

- [ ] Rerun the pentest and ZAP workflows (`security-pentest.yml`,
      `zap-scan.yml`) against App production once Phase 2 and Phase 4
      have landed, and read the reports rather than the job status.

## Phase 3: Audit the tooling layer in full

Audit each file below in full, and stamp it in the ledger. This is the
layer that decides whether every other safety net runs, so it comes
before any feature.

- [x] Every workflow in `.github/workflows/`. Stamped on 10 October
      2026.
- [x] Everything else under `.github`. Stamped on 10 October 2026. The
      LLM prompts and instructions were last audited in July 2026 and
      are due again.
- [x] `.husky/pre-commit`. Stamped on 10 October 2026.
- [x] The `Justfile`. Stamped on 11 October 2026.
- [ ] `.pre-commit-config.yaml`.
- [ ] `compose.ci.yml`.
- [ ] `compose.dev.yml`.
- [ ] `compose.migrate.yml`.
- [ ] `compose.prod.cloud-run.yml`.
- [ ] `compose.prod.fhir-openehr.yml`.
- [ ] `compose.unit-tests.yml`.
- [ ] `backend/Dockerfile`.
- [ ] `frontend/Dockerfile`.
- [ ] `backend/pyproject.toml`.
- [ ] `frontend/package.json`.
- [ ] `frontend/tsconfig.json`.
- [ ] `frontend/tsconfig.app.json`.
- [ ] `frontend/tsconfig.check.json`.
- [ ] `frontend/tsconfig.node.json`.
- [ ] `frontend/vite.config.ts`.
- [ ] `frontend/eslint.config.js`.

- [ ] Audit `infra/`, the Terraform, for what is exposed: ingress and
      the load balancer, IAM bindings, public buckets, where each secret
      is read from, what the Cloud Run service may reach, and the AWS
      SES part, since it sends mail on Quill's behalf.

## Phase 4: One test that every route is guarded

- [x] Add `backend/tests/every_route_is_guarded_test.py`. It walks
      `served_routes(app)` from `backend/app/utils/route_list.py`, never
      `app.routes`, which no longer lists an included router's routes,
      and for every route goes through the dependency tree with
      `dependency_calls`, looking for a function that settles who the
      caller is: `get_current_user` in `deps.py` or `main.py`, or the
      teaching and passport routers' own lazy wrappers round it.
      `require_operator`, `has_competency` and the rest all depend on
      one of those, so they need no entry of their own. A route with
      none must be in the test's `PUBLIC` list with its reason. Built on
      10 October 2026: 191 routes, 170 guarded, 21 listed as public.
      Planting an unguarded route makes it fail with the method and
      path. This answers "is any endpoint unprotected by accident" for
      `main.py` and every included router at once,
      and keeps answering it for every route added later. Both lists
      fail in both directions: an entry whose route has since been
      guarded or removed fails too, so neither can drift.

- [x] In the same test, hold every route that changes something for a
      signed-in caller to a CSRF check. A public route is left out by
      rule, having no session to ride on. **22 routes failed that when
      the test was written** and were listed in it as `CSRF_NOT_YET`
      until the next step closed them: logout, TOTP setup and verify, `prescriptions/controlled`,
      the two push routes, and 16 teaching routes, among them starting
      an assessment, answering and completing it. The teaching router
      takes its `_require_csrf` on three routes only.

- [x] Close the 22 CSRF gaps. Done on 10 October 2026, after Mark said
      yes. Every one of the 22 now takes the CSRF dependency, and
      `CSRF_NOT_YET` is gone from the test: a route that changes
      something for a signed-in caller checks the token, with no list of
      exceptions to add to. The sixteen teaching routes take the
      router's own `_DEP_REQUIRE_CSRF`; the four in `main.py` take
      `DEP_REQUIRE_CSRF`; the two push routes take a new
      `require_csrf` in `app/deps.py`, the same check, there so a router
      that `main` imports can use it without importing `main` back.
      One caller did not go through `api.ts`: the local media upload in
      `use-module-media.ts` sends the file with `XMLHttpRequest`, to
      show progress, and now sends the token too, from a new
      `frontend/src/lib/csrf.ts`. It is not sent to the bucket, where an
      unexpected header would break the signed URL. Twelve backend
      tests called these routes with no token and were given one, as a
      page would send; five new tests show a request without it is
      refused. The session cookies were `SameSite=Lax` throughout, so
      this was a missing second layer and not an open door.

- [ ] Review the `PUBLIC` list by hand. Each of the 21 entries is a
      route open to anybody, with a reason taken from its docstring, and
      each wants Mark's eye on whether it should be. Three to look at
      first: `POST /api/teaching/public/validate-clinical-lead`, for
      what its answer tells a caller with no session;
      `GET /api/auth/organisations`, for what it lists; and the three
      `/api/ci/teaching/*` routes, which are guarded by a bearer token
      checked inside the route body, where the test cannot see it, so
      read those three bodies. Also:
      `get_current_user` is defined twice, in `backend/app/deps.py` and
      `backend/app/main.py`, 133 routes using one and 44 the other; the
      test accepts both, and the duplication goes on the audit list in
      Phase 5.

## Phase 4a: Split `main.py` into modules

Added on 11 October 2026 at Mark's request, as the next thing to do.
`backend/app/main.py` is over 6,200 lines and holds about 66 routes,
which is too much to hold in mind as one file. Eight routers
already live outside it, so the pattern exists.

It is safe to do now in a way it was not before. The route guard test
and the request-model test walk every served route wherever it is
defined, so a route that loses its guard or its CSRF check in a move
fails the build. Moving the local media routes on 11 October was a
small rehearsal: the one thing it broke was a test that read `main.py`
as text.

A moved file needs a fresh stamp in the ledger, which is a reason to
move a group before its audit and not after.

Rules for every step: one group to a pull request, moved and not
rewritten, with the route addresses, guards and response models
unchanged. A test that reads `main.py` as text is pointed at the new
file in the same pull request.

- [ ] Move the shared pieces first: `get_current_user`, the `DEP_*`
      constants and the cookie helpers go to `backend/app/deps.py`,
      where copies of some already exist. This also settles the Phase 5
      question of why there are two definitions and which the routes
      use. Everything after depends on it.

- [ ] Move the patient routes (18) to a router of their own. First of
      the groups because it is the biggest, and it is behind the
      clinical-services check, so the teaching release is not touched.

- [ ] Move the conversation and messaging routes (9).

- [ ] Move the user administration routes (8), with
      `AdminUserCreateIn` and `AdminUserUpdateIn`, which belong in
      `backend/app/schemas/`.

- [ ] Move the three job callbacks under `/ci/teaching/` to the
      teaching feature, beside the routes they report to.

- [ ] Move what is left that is not sign-in (`/cbac`, `/prescriptions`
      and the odd single routes), each to the module it belongs with.

- [ ] Move the sign-in routes last, **after the EoEETA release**: login,
      logout, refresh, register, password reset, change password, TOTP
      and `/api/auth/me`. Phase 5 audits them where they are, and moving them
      before the release would undo those stamps for no gain.

- [ ] When it is done, `main.py` builds the app, adds the middleware and
      includes the routers, and holds no route of its own.

## Phase 4b: Tighten what a request may carry

Added on 11 October 2026, from what the request-model test and the
dependency audit turned up. Three units, in this order. There are no real users, so no
limit needs checking against stored data first.

### Unit 1: The push subscription

- [ ] The frontend sends only `endpoint`, `expirationTime` and `keys`
      (`p256dh`, `auth`), in both `EnableNotificationsButton.tsx` and
      `Settings.tsx`. Today it passes the browser's whole
      `PushSubscription` through.

- [ ] `PushSubscriptionIn` and `PushKeys` in `backend/app/push.py` get
      `extra="forbid"`, and the `ALLOWS_EXTRA` list in
      `backend/tests/every_request_model_forbids_extra_test.py` is
      emptied.

- [ ] `endpoint` must be an `https` address on a known push host
      (Google, Mozilla, Apple, Microsoft) and at most about 2,000
      characters. The server later sends to this address, so it must be one
      of the push services and nothing else.

- [ ] `p256dh` and `auth` get length limits matching their fixed sizes.

- [ ] A refused address logs its host name only. That is how a browser
      vendor adding or renaming a push host shows itself.

- [ ] A type test pins TypeScript's `PushSubscriptionJSON` to those
      three fields. The standard is how the shape changes; TypeScript's
      description of it is generated from the standard, so a TypeScript
      update that adds a field fails the type check on the pull request
      that brings it. A weekly probe was considered and left: the push
      services only deliver, the browser sets the shape.

- [ ] Tests: each refusal, each allowed host, and that an extra field
      gets a 422.

- [ ] This changes what the API accepts, so Mark approves the
      breaking-change gate.

### Unit 2: A cap on the size of a request body

- [ ] One limit of about 1 MB on every request body, in front of all
      routes. Over it answers 413 with a plain message. It protects
      every unbounded string at once, and does not change the API's
      published shape, so it needs no approval.

- [ ] Check no route rightly sends more. Captions are the largest body;
      uploads go straight to the bucket and never through the API.

- [ ] Tests: just under passes, just over is refused, and a request
      that lies about its length is still stopped.

### Unit 3: Limits on the fields where length matters

- [ ] Add `max_length` to passwords, usernames, emails, full names,
      reset and invite tokens, and TOTP codes. About a dozen of the 130
      unbounded string fields.

- [ ] Leave long free text (reflections, message bodies, notes) to the
      body cap. A tight limit there only gets in the way of somebody
      writing.

- [ ] Match the limits in the frontend forms, so the user is told
      before sending.

- [ ] Extend the request-model test: every field on a named list must
      have a limit.

- [ ] Write the `api-compatibility/` decision files. Mark approves the
      breaking-change gate.

## Phase 5: Audit the security paths by hand

Audit in this order, stamping each in the ledger, and treating anything
found as a bug to fix on its own branch before going on.

- [ ] `backend/app/security.py`: JWT signing and verification, cookie
      flags, CSRF token minting, TOTP, Argon2.

- [ ] `backend/app/deps.py` and the dependency constants and
      `get_current_user` in `backend/app/main.py`, including why there
      are two definitions and which the routes use.

- [ ] The auth routes in `backend/app/main.py`: login, logout, refresh,
      register, password reset, change password, TOTP enrol and verify,
      and `/api/auth/me`. The questions are: can a token be replayed
      after logout, can refresh outlive its seven days, does a reset
      token work twice, is a failed login rate limited
      (`backend/app/rate_limit.py` is 26 lines, so check what it covers).

- [ ] `backend/app/cbac/grants.py` and `backend/app/cbac/grant_scope.py`
      again, this time asking only one question: can a scoped manager
      reach `manage_users` or `passport_write` by any route through
      `update_user`. The folder is already on the card; this is a
      second read with one question.

- [ ] `backend/app/organisations.py` and `backend/app/org_units/`: every
      place a route limits a caller to their own org units, and whether
      any read of a user, a member list or a patient list skips it.
      `test_admin_user_route_scoping.py` and
      `test_admin_routes_ask_membership.py` say what is covered; read
      the routes they do not name.

- [ ] `backend/app/registrations.py`, `backend/app/email_send.py` and
      the rest of `backend/app/email/`: who an email can be sent to, and
      whether any route lets a caller choose the recipient.

- [ ] `backend/app/marketing/` and `backend/app/feedback/`: both take
      input from outside the account system (unsubscribe tokens, the
      Resend webhook, feedback forms), so check signature verification,
      token single use and length limits.

- [ ] `backend/app/features/teaching/`: the write paths only. Enrolment,
      results, certificates, the door and the video access gates. The
      read paths ride on `test_teaching_learner_gates.py`,
      `test_teaching_door.py` and `test_teaching_video_access.py`.

- [ ] `backend/app/schemas/`: that every request model forbids extra
      fields and bounds its strings. A grep for `extra=` and
      `max_length` first, then read the models that lack them.
      **The first half is now a test, 11 October 2026.**
      `backend/tests/every_request_model_forbids_extra_test.py` walks
      every route, collects the 78 models a request body is read into,
      and fails on one that does not forbid extra fields. Twelve did
      not. Ten were teaching models and now do; the frontend and the two
      worker jobs were checked to send only the named fields. Two are
      listed as exceptions with the reason: the push subscription, whose
      shape is the browser's.
      **The second half is Phase 4b**: a cap on the size of a request
      body, and limits on the fields where length matters.

- [ ] Frontend: `frontend/src/auth/` in full and `frontend/src/lib/api.ts`.
      The guards default to a 404, so check nothing renders before the
      guard resolves.

## Phase 6: Automated review, folder by folder

- [ ] Run `/code-review high` over each backend directory in turn
      (`backend/app/features/passport`, `backend/app/inbox`,
      `backend/app/guides`, `backend/app/push.py`, `main.py`) and over
      `frontend/src` by feature folder, and `/security-review` over the
      same. Per directory, not one run over the whole tree, so the
      findings stay readable. This is a further pass beside the audit,
      not in place of it: a machine reads differently from a person and
      finds different things.

- [ ] Triage every finding as fix now, fix after go-live, or not a bug,
      and record the list in this step.

## Phase 7: Describe the controls and release

- [ ] Bring the `docs/docs/cybersecurity/` pages up to date with the
      controls that now exist: the checks proven live in Phase 2, the
      route guard and request-model tests, the dependency audit, and the
      audit ledger. It is the record to answer from if EoEETA or a DTAC
      assessor asks how the code is assured.

- [ ] Release the teaching materials to EoEETA on the agreed date.

## Phase 8: Keep the audit current

- [ ] Carry the audit on through the ledger as a standing practice,
      highest risk first. `just rs` says where it stands.

- [ ] Each time a file changes after its audit, read its diff before
      stamping it again, so a stamp always means the version on disk.

## Decisions

- **Tooling before features** - the fault that started this was a typo
  that switched off a scanner for the whole codebase. A fault in the
  tooling multiplies risk; a fault in a feature adds to it. So the
  checks are proven and the tooling audited before anything else.

- **A ledger of blob hashes, not a comment in each file** - a
  `# reviewed` comment is noise in every file and cannot tell that the
  file changed afterwards. GitHub's "viewed" tick is per pull request and
  does not accumulate. Git notes attach to commits, not files. A hash
  per file in one tracked file is the smallest thing that answers "was
  this version audited, and by whom".

- **Whole files, not line ranges** - a changed file shows its diff, and
  the diff is the granularity actually read again. Ranges would make the
  ledger harder to keep than the audit it records.

- **No dates** - Mark, 10 October 2026: it takes as long as it takes.
  The phases are in the order the work should be done and carry no
  deadlines. What must be finished before the release is said in the
  phases themselves, not by a calendar.

- **Three folders are left off the card** - `.vscode/` is editor
  settings. `api-compatibility/` is 130 frozen decision files that are
  never edited once merged; the Python that reads them is on the card.
  `backend/alembic/versions/` is merged migrations, which have already
  run and are never changed; a new migration is read when it is
  written, and `check_migrations.py` runs over each one. Prose, pictures,
  lock files and generated files were out from the start. Anything git
  ignores is out without being listed.

- **One card, in the repository** - `audit/ledger.tsv` is tracked, so
  anybody can audit, git's history shows who stamped what, and a lost
  card can be got back. It was first kept out of git, in the `local/`
  folder, and was overwritten there on 11 October 2026 with nothing to
  restore it from. One file for everybody, not one for each auditor:
  the union merge in `.gitattributes` takes care of two people stamping
  at once, and a check fails where both stamped the same file.

- **The auditor may be the author** - the audit is a third look at the
  code as it stands, and there is one developer. Whoever wrote a file
  may stamp it.
