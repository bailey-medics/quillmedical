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
<https://code.claude.com/docs/en/claude-security>.

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

- [ ] **Fix 5: changing the account email.** Hardening of the profile
      email change. Detail in the private notes.

- [ ] **Fix 6: the clinical lead check.** Hardening of the public
      clinical lead lookup used by self-registration. Detail in the
      private notes.

- [ ] **Fix 7: content and upload scanning.** Hardening of the teaching
      content pipeline's malware scan and of the upload scan handoff.
      Detail in the private notes.

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
