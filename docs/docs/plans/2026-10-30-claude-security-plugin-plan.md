<!-- cspell:words SARIF JSONL -->

# Claude Security plugin plan

Quill's security testing has three layers today: defensive programming and
the unit and E2E suites, Semgrep in the CI heavy tier, and the weekly ZAP
scan in `.github/workflows/zap-scan.yml`. Semgrep matches known patterns
and ZAP probes the running app from outside, so neither reasons about the
source the way a reviewer would. That leaves logic flaws: a route that
checks the competency but not the place, a scoped manager reaching past
its `may_grant` list, PHI reaching a log line. `/security-review` reads
the source, but only the current branch's diff, so code already on `main`
is never looked at again.

Anthropic's Claude Security plugin (`claude-security@claude-plugins-official`,
beta since July 2026) fills that gap. It runs a multi-agent scan of a whole
repository, a focused area or a diff inside a Claude Code session, has
independent agents try to disprove every finding before reporting it, and
drafts patches it never applies itself. The outcome of this plan is the
plugin installed for the project, a first round of focused scans over the
code where a flaw would matter most, every confirmed finding fixed in its
own pull request, and a written cadence for scanning again. Docs:
<https://code.claude.com/docs/en/claude-security>. Phase 6 then adds
zizmor, which reads the GitHub Actions workflows for security mistakes:
the one part of the repository none of these layers checks, since
`actionlint` checks only that a workflow is valid.

## Phase 1: Install the plugin for the project

- [x] Check `python3 --version` reports 3.9 or later on every machine that
      will run a scan (this Linux box and the Mac). The plugin's tooling
      uses only the standard library, so nothing else is installed, but the
      `/claude-security` menu warns and stops without it. The Linux box has
      3.14.9; the Mac is still to check before its first scan.

- [x] Install at **project** scope, so the entry lands in
      `.claude/settings.json` and every worktree gets it, rather than at
      user scope on one machine. Done from the shell with `claude plugin
      install claude-security@claude-plugins-official --scope project`,
      which needed `claude plugin marketplace update
      claude-plugins-official` first: the local copy of the catalogue
      predated the plugin and reported it not found. The install adds
      only `"enabledPlugins": {"claude-security@claude-plugins-official":
      true}`. Auto-update is left on: it is in beta and fixes arrive
      through updates. A session started before the install needs
      `/reload-plugins` before `/claude-security` appears.

- [x] Add `CLAUDE-SECURITY-*/` to the root `.gitignore`. Each report folder
      carries its own `.gitignore` already, but a report describes open
      vulnerabilities, and one rule at the root means a deleted inner file
      cannot let it into a commit by accident. Checked with `git
      check-ignore -v` against a scratch folder of that name.

- [x] Document where the plugin sits in `docs/docs/cybersecurity/index.md`.
      That page already names every other layer under "CI/CD security
      pipeline" (Bandit, Semgrep, ZAP, the pentest suite, secret scanning,
      the audit ledger), so a separate "Layers" list would have said it
      twice. Instead a "Source code security scans" subsection after
      "Code audit" covers `/security-review` and the plugin: the gap they
      fill, that neither runs in CI, and where findings go.

## Phase 2: Focused scans of the highest-risk code, at `high`

Scans cost a significant number of tokens and are nondeterministic, so the
first round covers the areas where a flaw is a data breach, one at a time,
at `high` effort, rather than one `medium` pass over the whole tree. Run
each from a clean worktree on current `main` in auto mode, so the report's
revision stamp names a commit with no uncommitted changes in it.

- [x] **Access control** - `backend/app/cbac/` (grants, grant scope,
      practising, positions), `backend/app/deps.py` and
      `backend/app/organisations.py`. The intersection of competency and
      place is the rule the whole app rests on, and its failure mode is
      silent: a request that should be refused succeeds. Scanned
      `backend/app/cbac` on 30 October 2026.

- [x] **Authentication and sessions** - `backend/app/security.py` and the
      auth routes: JWT cookies, refresh, CSRF, TOTP, password reset and
      email verification. Scanned on 30 October 2026, scoped to
      `security.py`, `deps.py`, `main.py`, `rate_limit.py`,
      `registrations.py` and the sign-in modules under `users/`.

- [x] **Org units and users** - `backend/app/org_units`,
      `backend/app/users` and `backend/app/organisations.py`. Added after
      the first two scans: their findings led into these modules, which
      neither scan had read whole. Scanned on 30 October 2026.

- [ ] **Clinical data paths** - `backend/app/fhir_client.py`,
      `backend/app/ehrbase_client.py` and the patient routes, looking for
      a patient reachable outside the caller's org units and for PHI in
      logs or error messages. Set aside on 30 October 2026: clinical
      services are not deployed to a live service, so this waits until
      EHR production is in view.

- [x] **Uploads and job callbacks** - the upload routes and the `/api/ci/`
      job routes, the surface the upload safety and job callbacks plans
      hardened, to check that work from the outside. Scanned on
      30 October 2026.

- [ ] **Frontend** - `frontend/src/auth/` guards and `frontend/src/lib/api.ts`.
      Lower priority, since the API is what refuses, but a guard that
      shows a page it should 404 still leaks that the page exists.

## Phase 3: Triage and fix

- [ ] Triage each finding in a draft GitHub private security advisory
      (the repository's Security tab, "Report a vulnerability" as a
      maintainer), one advisory per finding, never in a commit. The
      repository is public and each finding carries an exploit scenario
      against App production, so a report in git is a disclosure that
      history, clones and forks keep after the file is deleted. A draft
      advisory is visible to maintainers only, gives a tracked record that
      can be shared with a collaborator, and is published or closed once
      decided. Record the decision in it: fix, accept with a reason, or
      false positive. The report folder itself stays in the worktree,
      ignored, and is deleted once its findings are all in advisories.

- [ ] Fix each confirmed finding on its own branch and pull request, as the
      plugin's docs recommend. Use "Suggest patches" for a draft if it
      helps, but treat the patch as a starting point: write a test that
      fails against current `main` first, then make it pass, so the fix
      is held by the suite and not by one scan's say-so.

      Word the branch, commit and pull request plainly until the fix is
      deployed: `feature/harden-<area>`, "tighten checks in grant scope",
      not "fix privilege escalation in may_grant". In a public repository
      a precise title points at the flaw while App production still has
      it. The detail lives in the advisory, linked once it is published.

      For a finding severe enough that even the diff should not be public
      before the deploy, build the fix in the advisory's temporary private
      fork instead. Actions do not run there, so the unit suites are run
      locally with `just ub` and `just uf` before it merges, and CI runs
      on `main` afterwards. Keep this for the rare case: everything else
      goes through the normal CI and merge queue.

- [ ] Once a fix is deployed, publish its advisory (or close it, for a
      finding accepted or found false), and record it in
      `docs/docs/cybersecurity/` in one line: the class of flaw and a link
      to the published advisory, with no exploit detail.

## Phase 4: Fixes from the first round of scans

Six fixes, each its own unit and pull request, built with `/f`. The
repository is public, so each step names only the area it hardens until
its code is in place; then the step is rewritten to say what was wrong
and what changed, in the same commit as the fix. The detail to build
from is in the private notes in `local/` (`just lp`),
`2026-10-30-security-fixes-private-notes.md`, under the same fix
numbers. A unit that turns out too large for one review splits into
consecutive units, as the notes suggest for fixes 3, 5 and 7.

- [x] **Fix 2: request throttling.** The rate limits keyed on
      `get_remote_address`, and the production image runs uvicorn with
      `--forwarded-allow-ips *`, so the address was the leftmost
      `X-Forwarded-For` entry: the one the client writes. Every limit was
      per request rather than per client. A wrong two-factor code was not
      counted per account either, and a login naming no account answered
      before any Argon2 work, so the time taken said which usernames
      exist.

      Research before choosing: Google's documentation gives the header
      the load balancer forwards as
      `<supplied-value>,<client-ip>,<load-balancer-ip>` and says it "does
      not verify any IP addresses that precede" that pair
      ([external Application Load Balancer overview](https://docs.cloud.google.com/load-balancing/docs/https)).
      It does not document whether Cloud Run's own front end appends more
      after it, so counting entries from the right was a guess, and a wrong
      count would put every user in one bucket. A custom request header the
      load balancer writes is not a guess: "Headers added by the load
      balancer overwrite any existing headers that have the same name"
      ([custom headers](https://docs.cloud.google.com/load-balancing/docs/https/custom-headers-global)).
      Cloud Run ingress is `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`, so
      nothing outside the VPC reaches the backend without it.

      So the backend service sets `X-Quill-Client-IP: {client_ip_address}`
      (`infra/modules/load-balancer/main.tf`), the backend is told to trust
      it through `TRUSTED_CLIENT_IP_HEADER` (`infra/main.tf`), and
      `backend/app/client_address.py` reads it for the limiter and the
      access log, falling back to the peer address when it is unset or
      missing. Either half deploying first is safe: without the setting the
      header is ignored, and without the header the peer is used.

      `backend/app/users/totp.py` now counts wrong codes per account, as
      RFC 6238 section 5.1 asks: three in a row lock two-factor sign-in and
      enrolment for 15 minutes, answered with a 429 and `totp_locked`, and
      a right code clears the count. The count is committed before the
      route raises, since the rollback would otherwise take it too.
      Migration `70429248cf95` adds the two columns. A login naming no
      account now checks the password against a stand-in hash
      (`spend_password_check` in `security.py`). The login page shows the
      lockout message.

- [x] **Fix 3a: sessions end when an administrator changes how somebody
      signs in.** Sessions, and reset and setup links, are revoked only by
      a change to `token_version`. The self-service change-password and
      reset routes moved it; an administrator setting a password, email or
      username through `PATCH /api/users/{id}`, or deactivating and
      reactivating an account, did not. So a session an attacker already
      held outlived the very reset meant to end it, for up to the 7-day
      refresh lifetime. The same route also let an administrator set their
      own password or email with no current password, round the check the
      profile routes make.

      `change_identity` in `backend/app/users/identity.py` now ends every
      session when the username, email or password actually changes (a
      name change does not), through a new `end_sessions`, and
      `deactivate_account` and `reactivate_account` call it too.
      `update_account` refuses a caller's own password or a new email with
      `OwnSignInOnProfile`, pointing them at the profile page; an email
      sent unchanged, as the user form always sends it, is not refused.

- [x] **Fix 3b: sessions name the account by id, not by username.**
      Access and refresh tokens carried the username in `sub`, the CSRF
      token was signed for the username, and `get_current_user` and
      `/auth/refresh` looked the account up by it. Every new account starts
      at `token_version` 0, so once a username was freed by a rename, a
      refresh token made for it opened whichever account was given the
      name next, with no password and no second factor.

      Tokens now carry the id in a new required `uid` claim, with `sub`
      the same id as a string (RFC 7519 wants a string there), and the CSRF
      token is signed for the id. Accounts are looked up with `db.get` by
      id in `backend/app/deps.py` and the refresh route. `uid` is
      required, rather than `sub` re-read as a number, because an old
      token's `sub` is a username, and a username of digits would read as
      somebody's id. Old tokens have no `uid`, so they are refused, and
      everybody signed in to App production signs in once more after this
      deploys, as agreed before the run. A token whose `sub` and `uid`
      disagree is refused too.

- [x] **Fix 4: two-factor enrolment.** `POST /api/auth/totp/setup`
      reused whatever secret was stored and returned it in the
      `otpauth://` URI, even once two-factor was on. Anybody holding a
      session, for a few minutes at an unlocked machine, could read the
      live second factor and make valid codes for good, though turning
      two-factor off asks for the password for exactly that reason.

      Setup now answers 409 with `totp_already_enabled` while two-factor is
      on; a new authenticator goes through turning it off first, which
      asks for the password. Until a code is verified the secret is not
      yet a factor, so it is still reused rather than made afresh on each
      call: a fresh one each time would let a page that asks twice, as
      React does in development, show the QR code for a secret that is no
      longer stored. The setup page shows the backend's message.

- [x] **Fix 5a: a new email waits for a link sent to it (expand).**
      `PATCH /api/auth/profile` replaced the account's email at once, with
      no current password, no link to the new address and no word to the
      old one, and a password reset then went to the new, unproven
      address. So anybody holding a session could move the account to an
      address they owned and reset its password.

      A new email is now held in `users.pending_email` (migration
      `772b1a92d9dd`) and a link is sent to it; `email` changes only when
      that link is followed, through the existing `/auth/verify-email`
      route, which tells the new link from a verification link by its own
      salt. The link names the account by id, the address, and the
      account's `token_version`, so a later change or a password change
      stops an older link, and following it ends the account's sessions.
      The current address is told a change was asked for. The account page
      sends `current_password` with a new email, and the backend checks it
      when it is sent. It is optional for now, by expand then contract
      (`.claude/rules/backend.md`), so a page loaded before this deploy
      still works. The page changes the password before asking for the
      new email when both are saved together, since a password change
      would otherwise stop the link just sent.

- [x] **Fix 6: the clinical lead check.** `clinical_lead_site` in
      `backend/app/users/register.py` found the lead with
      `User.email.ilike(email)`, on an address typed by somebody not
      signed in, through the public
      `POST /api/teaching/public/validate-clinical-lead` and
      `POST /api/auth/register`. In a LIKE pattern `%` and `_` match
      anything, so a stranger could pass the "you must know your clinical
      lead's address" rule without knowing it, join the site as a trainee,
      and, since the check answers with the site, recover a lead's address
      a letter at a time. Live in App production, where self-registration
      is on.

      It now compares with `User.email == normalise_email(email)`.
      Addresses are held in lower case, so that is already
      case-insensitive, and `email` is unique, so it finds one account at
      most. The request fields stay plain strings rather than becoming
      `EmailStr`: equality already refuses a pattern, and narrowing the
      accepted input would be an API change for no further gain.

- [x] **Fix 7a: the teaching content pipeline's malware scan.** Two
      gaps in the check every teaching repository's pull request must pass.
      The workflow installed the `clamav-mirror` image's `.deb` as root
      with no check against the checksum pinned in `backend/Dockerfile.scan`,
      though the scan image's own build does check it, so a mirror that had
      been overwritten could run anything on the runner and pass any scan.
      And `scan-content.sh` ran `clamscan` with ClamAV's default limits
      (25 MB, 100 MB, two minutes), past which a file is skipped and
      reported clean, so a large enough file reached the teaching bucket
      without being scanned; the app's own scanner already raises them.

      `fetch-mirror.sh` now checks both packages against
      `CLAMAV_SHA256_AMD64` and `CLAMAV_SHA256_ARM64`, and the mirror's
      `VERSION` against `CLAMAV_VERSION`, before anything uses them, so
      the teaching pipeline, `deploy.yml` and `clamav-mirror.yml` all get
      the check. `scan-content.sh` passes the limits `scan_cli.py` uses,
      with `--alert-exceeds-max=yes` and `--alert-encrypted=yes`, and
      fails on `Heuristics.Limits.Exceeded` with its own message. The
      mirror is still pulled by tag, not digest: the tag moves daily with
      the definitions, and the package, the part that runs as root, is now
      checked whatever the tag points at.

- [x] **Fix 7b: an uploaded file cannot be swapped after its scan.** The
      clean verdict on a teaching upload is recorded against its object
      key, and `after_scan` in `backend/app/features/teaching/ci_media.py`
      then starts the transcode, which reads whatever is at that key. The
      signed upload URL lasts six hours and can open any number of
      sessions, so a `manage_teaching` holder could upload a harmless file,
      let it be scanned, then finish a second upload at the same key, and
      FFmpeg would read a file never scanned.

      The private notes suggested recording the object generation and
      pinning the transcode's read to it. A narrower fix closes the same
      gap: `create_resumable_upload_url` in `storage.py` now signs the URL
      with `x-goog-if-generation-match: 0`, so Google Cloud Storage lets an
      upload finish only while nothing is stored at the key. Every upload
      already gets a fresh `asset_id`, so nothing legitimate writes a key
      twice, and once the first file lands the URL cannot replace it,
      during the scan or after. The browser sends the header, which the
      signature covers, and the source bucket's CORS rule allows it.

- [x] **Fix 5b: the current password is required for a new email
      (contract).** `PATCH /api/auth/profile` now refuses a new email that
      comes without `current_password`, with "Enter your current password
      to change your email", so a session alone cannot ask for the account
      to move. The same address sent unchanged, as the account page sends
      it on every save, is not refused. The field stays optional in the
      schema, because a name change alone does not need it, so `oasdiff`
      sees no change and no `api-compatibility/` decision file is needed.
      What it does need is time: its pull request merges only after fix
      5a has been deployed for at least a release, so no open page still
      sends a new email without the password. Built last in this phase,
      at the top of the stack, so waiting for it holds back no other fix.

## Phase 5: Decide the cadence

- [ ] After Phase 3, run one whole-repository scan at `medium` and compare
      it with the focused results. If it finds nothing the focused scans
      missed, the focused areas are the right unit for repeat runs; if it
      does, add the area it found to Phase 2's list for next time.

- [ ] Write the cadence into `docs/docs/cybersecurity/index.md`: a focused
      `high` scan before any DTAC or procurement submission and after any
      change to `backend/app/cbac/` or `security.py`, and a change scan
      (`/claude-security scan my branch at high`) on branches that touch
      those modules, in place of `/security-review` there.

## Phase 6: Check the workflows with zizmor

zizmor (<https://docs.zizmor.sh>, 1.31.1 on 30 October 2026) is a static
checker for GitHub Actions: code injection through `${{ }}` expansion,
permissions wider than a job needs, secrets passed on in bulk, and
actions referenced by a tag that can be moved. That last one is how the
`tj-actions/changed-files` compromise of March 2025 spread: the
attacker moved the action's version tags to a commit that printed the
runner's secrets into public build logs, and every repository asking for
the tag ran it. A trial run on 30 October 2026, offline, over all 25
workflows reported 525 findings: 153 tag pins, 65 checkout credentials
left on disk, 40 secrets passed on in bulk, 16 permissions wider than
needed, 8 template injections, and the rest style or informational. The
steps below go in this order so that the check is green before it gates
anything, and each step is a unit of its own.

- [x] **Install it locally, with its settings file.** zizmor 1.31.1 from
      `zizmorcore/zizmor-pre-commit` in `.pre-commit-config.yaml`, so a
      staged workflow, action or Dependabot file is checked on commit,
      and `just check-workflows` (`just cw`), which runs that same hook
      over every file it reads. Both run `--offline`, since the audits
      that call GitHub need a token and CI has one, and
      `--min-severity=low`, which leaves out the 35 template expansions
      zizmor itself rates informational, such as
      `${{ github.repository }}`. Both pass `--config`: zizmor looks for
      `.github/zizmor.yml` from the repository root, and does not
      recognise a worktree's root until 1.32. The settings file:
  - **`artipacked` off.** It flags `actions/checkout` keeping its token
    on disk; zizmor itself rates that lower from checkout v6, and every
    workflow here is on v7.
  - **`unpinned-uses` set to `"*": ref-pin`**, allowing tags until the
    last step of this phase pins by commit.
  - **Each audit a later step fixes is switched off, and that step
    switches it back on.** Found while building: the hook checks every
    finding in a staged file, not only the lines staged, so the unit
    fixing the injections in `ci.yml` would have been blocked by
    `ci.yml`'s permission findings, which a later unit fixes. Starting
    from a baseline keeps every commit green, and each pull request's
    diff shows its own audit returning.
  - **`self-repository` off too (34).** It asks for GitHub's
    `uses: $/...` form for an action or workflow in this repository,
    introduced in July 2026: it cannot load a file a previous step
    wrote, and counts as pinned. It belongs with the commit pins, below.

- [x] **Fix the template injections (8, and one more).**
      `auto-pr.yml`, `teaching-pipeline.yml`, `ci.yml`,
      `gate-breaking.yml` and `merged-outside-main.yml` pasted a value
      such as `github.ref_name` or `github.event.pull_request.base.ref`
      straight into a `run:` block, so a branch named to contain shell
      would run as shell, in a job holding `GH_TOKEN`. Only
      collaborators can push here, but `teaching-pipeline.yml` is called
      from the teaching repositories, where content authors push, and
      `CLAUDE.md` already treats them as less trusted. Where the runner
      already sets the value as an environment variable
      (`GITHUB_REF_NAME`, `GITHUB_REF`, `GITHUB_REPOSITORY`,
      `GITHUB_RUN_ID`, `GITHUB_ACTOR`) the script reads that; the event
      fields go into the step's `env:`. The scripts take the same
      arguments, so their bats tests are unchanged.

      Found while fixing them: the destructive-migration gate in
      `gate-breaking.yml` pasted `outputs.report`, which quotes the pull
      request's own migrations, into a `cat <<'REPORT'` heredoc, and into
      two script calls. A migration with a line reading `REPORT` would
      have ended the heredoc and run what followed. zizmor rates a step
      output only informational, below `--min-severity=low`, so the other
      34 informational expansions were read by hand: they are SHAs,
      versions, GitHub usernames and registry names, none of which a pull
      request writes. The report moved into `env:` too.

- [x] **Narrow the permissions (16).** Thirteen workflows granted a
      write permission at the top of the file, so every job in them held
      it. Each top-level block is now read-only, and the write moves onto
      the jobs that use it, worked out from what each job's steps and
      scripts do with the token rather than from the job names: Workload
      Identity (`id-token: write`) onto the jobs that sign in to Google
      Cloud, `issues: write` onto the jobs that open issues (the two hold
      checks and the ZAP scan), `pull-requests: write` onto the jobs that
      comment (the two gate comment jobs and the Terraform plan), and
      `packages: write` onto `heavy_e2e_images`, the one CI job that
      pushes an image. A job's block replaces the workflow's rather than
      adding to it, so each one restates the reads it needs.

      Two things turned up. `ci.yml` granted `pull-requests: write` to
      all 23 jobs and none used it: the two that comment or read runs
      already carried their own block. And the docs build's
      `configure-pages` reads the Pages settings, so the build job keeps
      `pages: read`. Its own README does not say what it needs, and
      reading the settings should need no more than read, but that is
      unconfirmed: if the docs deploy fails after this merges, this is
      the first thing to check.
      `teaching-pipeline.yml`'s Slack job had no block at all, so it took
      the calling repository's default, and `slack-notify.yml` had none
      either. Both now say `contents: read`, which is all the Slack
      workflow needs, to check out Quill's scripts.

- [x] **Pass secrets by name (18 of 40).** All 18 `secrets: inherit`
      calls went to `slack-notify.yml`, which reads one secret,
      `SLACK_WEBHOOK_URL`. It now declares that secret under
      `workflow_call.secrets`, and every caller passes it by name, so a
      Slack job no longer receives every secret its caller holds. That
      includes the call from `teaching-pipeline.yml`, which runs in the
      content repositories: they still hand the pipeline their secrets
      with `inherit`, as `docs/docs/infrastructure/gcp.md` describes, and
      the pipeline now passes on only the webhook.

- [ ] **Decide on GitHub environments for the deploy secrets (22).**
      `deploy.yml` (18) and `terraform.yml` (4) pick each `GCP_*` secret
      by environment name, `secrets[format('GCP_{0}_…',
      matrix.environment)]`. GitHub cannot work out in advance which
      secret an index like that reaches, so it sends the runner every
      secret the repository holds. The fix is a GitHub environment per
      deployment environment (only `app` today), each holding its own
      secrets under one name such as `GCP_PROJECT_ID`, which zizmor's
      `secrets-outside-env` also favours. That changes where the secrets
      are stored, in `infra/github/`, so it is Mark's call and was not
      built in the autonomous run. Until then `.github/zizmor.yml`
      excludes the two files from `overprovisioned-secrets`, with a
      comment pointing here. The alternative is to keep the lookup and
      make that exclusion permanent, with the reason recorded.

- [x] **No Dependabot cooldown: Renovate already has one (6).** Found
      while building: `.github/dependabot.yml` raises vulnerability alerts
      only, with `open-pull-requests-limit: 0` on every ecosystem, and
      Renovate proposes every version bump. Its `minimumReleaseAge` of
      three days in `renovate.json` is the cooldown, so a Dependabot one
      would change nothing. `dependabot-cooldown` is switched off in
      `.github/zizmor.yml` with that reason.

- [x] **Run it in CI.** A step in the `shell_checks` job in `ci.yml`,
      after `actionlint`, so it is in the fast tier on every push and in
      the merge queue with the rest of that job. Installed by
      `.github/scripts/ci/install-zizmor.sh` from the release archive.
      zizmor publishes no checksums file, so the script pins the
      archive's SHA-256 itself, copied from the digest GitHub records
      for the release asset and checked against a download. That is
      stronger than the `actionlint` pattern of a checksums file fetched
      beside the archive: a replaced release cannot bring a matching hash
      with it. Its bats test builds its own archive and runs a copy of
      the script pinned to that archive's hash, and checks the pre-commit
      hook pins the same version. CI runs it online, with
      `GH_TOKEN: ${{ github.token }}`, which adds
      `known-vulnerable-actions`, `impostor-commit` and `ref-confusion`;
      run online on 30 October 2026 it found nothing more. Its output
      goes to the job log only: no SARIF upload, for the same reason as
      Claude Security's in Decisions, and not `zizmorcore/zizmor-action`,
      which uploads SARIF by default. zizmor is added to the tools in
      `docs/docs/cicd/outside-services.md`.

      `.github/instructions/workflows.instructions.md`, and its synced
      copy in `.claude/rules/workflows.md`, told authors to pass
      `"${{ github.ref_name }}"` to a script, the pasted form fixed
      above. They now say to read such values from the environment, to
      grant write permissions on the job, and to pass a reusable
      workflow its secrets by name.

- [x] **Pin every action by commit.** The 152 references to other
      repositories' actions, in the workflows and in `.github/actions/`,
      changed from `@v7.0.1` to the full commit SHA with the version as a
      comment (`@<sha> # v7.0.1`), each SHA looked up from the tag through
      the GitHub API. Two were pinned to a major tag only
      (`setup-gcloud@v3`, `upload-pages-artifact@v5`), and their comments
      name the exact release the SHA belongs to. Renovate, which proposes
      the action bumps here (Dependabot only raises alerts), keeps pins in
      that form current, comment included, through
      `helpers:pinGitHubActionDigests` in `renovate.json`'s `extends`.
      `unpinned-uses` in `.github/zizmor.yml` now requires commit pins,
      checked by turning one back to a tag and seeing zizmor refuse it.

      Two exceptions. `teaching-pipeline.yml` calls
      `bailey-medics/quillmedical/.github/workflows/slack-notify.yml@main`,
      because it runs in the content repositories, and a commit pin there
      would freeze Quill's own Slack workflow; `bailey-medics/quillmedical/*`
      may use a tag or branch. And the 34 `uses: ./...` references stay as
      they are, with `self-repository` still off: the pinned actionlint,
      1.7.8, refuses GitHub's `uses: $/...` form, and so does 1.7.12, the
      newest release on 30 October 2026, which predates the syntax. Switch
      when an actionlint release accepts it.

- [x] Add zizmor to "Static analysis" under "CI/CD security pipeline" in
      `docs/docs/cybersecurity/index.md`, beside Bandit and Semgrep: what
      it checks, where it runs, and that actions are pinned by commit.

## Decisions

- **The plugin, not the managed Claude Security product.** The managed
  service runs recurring scans and tracks fixes, but it is Enterprise plan
  only. The plugin gives the same kind of scan on demand, and the cadence
  in Phase 4 covers the "nobody remembered to run it" risk well enough at
  this size.

- **Not in CI.** A scan needs a Claude Code session left open, costs a
  significant number of tokens, and gives different findings on different
  runs. That suits a deliberate, reviewed run, not a gate on every push.
  Semgrep stays the deterministic check in CI.

- **It adds a layer and replaces none.** ZAP tests the running app,
  Semgrep tests known patterns, and the tests hold the behaviour once a
  fix is made. `/security-review` stays for ordinary branches; the plugin
  takes over only on branches touching access control or auth.

- **No SARIF upload to GitHub code scanning, for now.** The reports come
  with a SARIF file that code scanning reads, but uploading it puts open
  findings on GitHub before they are fixed. Revisit once Phase 3 shows how
  noisy the reports are and who can see the code scanning tab.
