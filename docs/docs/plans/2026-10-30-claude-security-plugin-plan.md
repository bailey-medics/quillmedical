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

- [ ] **Access control** - `backend/app/cbac/` (grants, grant scope,
      practising, positions), `backend/app/deps.py` and
      `backend/app/organisations.py`. The intersection of competency and
      place is the rule the whole app rests on, and its failure mode is
      silent: a request that should be refused succeeds.

- [ ] **Authentication and sessions** - `backend/app/security.py` and the
      auth routes: JWT cookies, refresh, CSRF, TOTP, password reset and
      email verification.

- [ ] **Clinical data paths** - `backend/app/fhir_client.py`,
      `backend/app/ehrbase_client.py` and the patient routes, looking for
      a patient reachable outside the caller's org units and for PHI in
      logs or error messages.

- [ ] **Uploads and job callbacks** - the upload routes and the `/api/ci/`
      job routes, the surface the upload safety and job callbacks plans
      hardened, to check that work from the outside.

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

## Phase 4: Decide the cadence

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
