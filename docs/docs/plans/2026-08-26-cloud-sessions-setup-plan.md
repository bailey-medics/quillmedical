# Cloud sessions setup plan

The user wants to delegate large, long-running LLM-driven dev tasks to
run unattended while travelling with no internet connection, then pick
up the results later. An earlier attempt at this with a different
tool (GitHub Copilot's cloud agent) produced poor results, seemingly
from missing context. This session investigated what Claude Code
cloud sessions actually are, verified the mechanics directly (both
against official docs and by testing from inside a running session),
and set up the standalone CLI, then iterated from repo-level skills to
Justfile recipes, so cloud sessions are easy to start, monitor, and
pull back down on this project.

## Phase 1: Establish what's actually available (findings)

- [x] Confirm the VS Code extension bundles a private copy of the
      `claude` CLI for its own chat panel only — it is not on PATH,
      and terminal-only commands like `/tasks` are unavailable from
      that chat surface (confirmed directly: `/tasks isn't available
      in this environment`)
- [x] Test the `Agent` tool's `isolation: "remote"` option from inside
      a chat session — it silently fell back to a local git worktree
      on the user's own machine rather than a real cloud VM. Cloud
      execution is not driveable from inside this chat surface itself
- [x] Verify official cloud session mechanics against
      `code.claude.com/docs`: `claude --cloud "<task>"` (starts a
      session, clones the GitHub remote at the current branch — not
      the local working tree), `claude -p "<msg>" --cloud <session-id>`
      (queue a follow-up), `claude --teleport [<session-id>]` (pull a
      cloud session down locally), `/tasks` (progress, inside an
      interactive terminal session), `claude agents --json --all`
      (scriptable listing of local sessions only)
- [x] Confirm billing model: cloud sessions share the same rate-limit
      pool as ordinary Claude Code usage — no separate per-VM compute
      charge. Requires Pro, Max, Team, or Enterprise (research
      preview) and claude.ai account auth; API-key-only auth or a
      third-party provider (Bedrock/Vertex/Foundry) blocks
      `--cloud`/`--teleport` entirely
- [x] Trace two previously-run cloud sessions, found via `git log
      --all`, back to real work already merged into `main` — see
      [Core DB Auto-Commit](2026-08-25-core-db-auto-commit-plan.md),
      five commits run end-to-end in under an hour. Confirms cloud/
      background sessions work well on this repo when backed by a
      committed, self-contained plan doc, contrary to the earlier
      Copilot cloud experience

## Phase 2: Install and verify the standalone CLI

- [x] Install natively: `curl -fsSL https://claude.ai/install.sh | bash`
- [x] Verify: `claude --version` → `2.1.246`, resolved on PATH via
      `~/.local/bin/claude`
- [x] Verify auth: `claude auth status` → already logged in via
      claude.ai (shared with the VS Code extension's own login),
      `mark.allan.bailey@googlemail.com`, **Max** subscription —
      eligible for cloud sessions with no extra login step needed

## Phase 3: Scaffold repo-level skills for driving cloud sessions

- [x] `.claude/skills/cloud-start/SKILL.md` — checks the current
      branch is committed and pushed (via injected `git status` /
      `git log @{u}..HEAD` output), warns and asks before proceeding
      if not, then runs `claude --cloud "$ARGUMENTS"` and reports the
      session ID and claude.ai URL
- [x] `.claude/skills/cloud-status/SKILL.md` — lists local sessions
      via `claude agents --json --all`; there is no CLI-level listing
      of cloud sessions, so it points the user to `/tasks` (in a real
      terminal session) or claude.ai/code instead
- [x] `.claude/skills/cloud-teleport/SKILL.md` — deliberately
      guidance-only, not auto-executed: hands back the exact
      `claude --teleport` command for the user to run themselves
- [x] Commit the three `SKILL.md` files
- [x] Restart this Claude Code session — turned out unnecessary in
      practice; the skill directory loaded live without a restart

## Phase 4: Verify end to end

- [ ] Run `/cloud-status` and confirm it correctly lists local
      sessions (superseded — see Phase 5)
- [x] Attempted to run `claude --cloud "<task>"` directly via the Bash
      tool from inside `/cloud-start` — failed:
      `--cloud requires an interactive terminal`. Confirmed a faked
      pseudo-TTY (`script -q /dev/null claude --cloud ...`) gets past
      that specific check, but then blocks on the CLI's first-run
      onboarding wizard (theme selection), which needs real keystrokes
      no automated tool call can supply. No working automated path was
      found — see the corresponding Decision below
- [x] Redesigned `/cloud-start` to hand back the exact
      `claude --cloud "..."` command for the user to run themselves in
      a real terminal, rather than attempting to run it via Bash —
      matching the `/cloud-teleport` pattern
- [ ] User runs the handed-back command in a real terminal, confirms a
      genuine cloud session starts (session ID + claude.ai URL
      returned) (superseded — see Phase 5)
- [ ] Monitor the session via claude.ai/code or the Claude mobile app
      while offline, then pull it back locally with
      `/cloud-teleport <session-id>` once reconnected (superseded —
      see Phase 5)

## Phase 5: Replace skills with `just` recipes

The user pointed out this is pure deterministic shell logic (a git
status check, then printing or running a fixed command) with no need
for an LLM to interpret instructions each time. Skills also added real
fragility for no benefit — a stale rendered-content race after editing
the file, and a user-typed argument with a stray unmatched quote
breaking `$ARGUMENTS` substitution — both hit during Phase 4 testing.
A `just` recipe run directly by the user in their own terminal also
sidesteps the TTY problem from Phase 4 entirely: unlike a skill
invoked through Claude's Bash tool, the human's own terminal already
has a real TTY, so `claude-cloud-start` and `claude-cloud-teleport`
can run `claude --cloud`/`claude --teleport` directly instead of
merely printing the command back.

- [x] Add `cloud-start`, `cloud-status`, `cloud-teleport` recipes to
      the `Justfile` under a new "Claude Code cloud sessions" section,
      in alphabetical order per `.claude/rules/just.md`
- [x] Verify `just --list` parses the Justfile correctly and shows all
      three new recipes with their descriptions
- [x] Test `just cloud-status` end to end — correctly lists local
      sessions via `claude agents --json --all`
- [x] Test `just cloud-start`'s git-status guard against a real
      uncommitted change (the Justfile edit itself) — correctly caught
      it and exited before attempting `claude --cloud`
- [x] Remove the three superseded `.claude/skills/cloud-*` directories
- [x] Rename the recipes to a `claude-` prefix (`claude-start`,
      `claude-status`, `claude-teleport`) to avoid ambiguity with the
      existing GCP "Cloud Run Admin Job" recipes further down the
      `Justfile`, and add short aliases (`clst`, `clss`, `cltp`)
      matching the file's convention
- [x] Rename again to `claude-cloud-*` (`claude-cloud-start`,
      `claude-cloud-status`, `claude-cloud-teleport`) — keeps both
      "claude" and "cloud" in the name for clarity, still distinct from
      the GCP Cloud Run recipes. Aliases (`clst`, `clss`, `cltp`) stay
      unchanged, since they were already short mnemonics rather than
      literal abbreviations of the full name
- [ ] User runs `just claude-cloud-start "<task>"` for real in their
      own terminal (a genuine TTY, unlike any tool-driven invocation),
      confirms a cloud session actually starts
- [ ] Monitor the session via claude.ai/code or the Claude mobile app
      while offline, then pull it back locally with
      `just claude-cloud-teleport <session-id>` once reconnected

## Decisions

- **`cloud-teleport` is guidance-only, not auto-executed (superseded by Phase 5 — see below):**
  teleporting switches the working directory's git branch and needs an
  interactive TTY to handle the stash prompt; running it headlessly
  from a skill could leave the repo in a confusing state. Considered
  having the skill run `claude --teleport` directly via Bash, but
  rejected it — there's no TTY inside a skill invocation for the
  stash/branch prompts to attach to.
- **`cloud-start` checks git status before handing back the `claude --cloud` command:**
  the cloud VM clones the GitHub remote at the current branch, not the
  local working tree, so uncommitted or unpushed changes are otherwise
  silently invisible to the cloud session. Considered skipping the
  check and letting a mismatch surface only once the cloud session
  started work on stale code — rejected as a silent-failure risk not
  worth the saved step. Superseded by Phase 5's
  `just claude-cloud-start`, which keeps this same check.
- **`cloud-start` hands back the `claude --cloud` command rather than running it (superseded by Phase 5 — see below):**
  confirmed by direct testing that `claude --cloud` refuses to run
  without a real interactive terminal, erroring with `--cloud requires
  an interactive terminal`. Considered forcing a pseudo-TTY via
  `script`/`expect` to work around this — tried it, and it does get
  past that specific check, but then blocks on the CLI's first-run
  onboarding wizard (theme selection), which needs real keystrokes.
  Rejected piling on further automation to fight through onboarding
  too, in favour of matching the `cloud-teleport` pattern: hand the
  user the exact command to run themselves.
- **Skills scaffolded at project level (`.claude/skills/`), not personal (`~/.claude/skills/`) (superseded by Phase 5 — see below):**
  committing them to the repo makes them available to every session
  working on this project, and to cloud sessions themselves, which
  load project skills from the cloned repo. Personal skills would
  follow the user across unrelated projects but wouldn't ship with the
  repo or reach cloud sessions.
- **Installed the standalone CLI rather than relying on the VS Code extension's bundled copy:**
  the extension's bundled CLI isn't on PATH and doesn't expose
  `--cloud`/`--teleport`/`agents` — those require the standalone
  install. No way was found to expose the extension's private CLI copy
  on PATH instead, so a separate install was the only option.
- **Replaced the `cloud-start`/`cloud-status`/`cloud-teleport` skills with `just` recipes:**
  these are pure deterministic shell logic — a git status check, then
  printing or running a fixed command — with no need for an LLM to
  interpret instructions on every invocation. The skill-based version
  added real fragility for no benefit: a stale rendered-content race
  after editing the file, and a user-typed argument with a stray
  unmatched quote breaking `$ARGUMENTS` substitution, both hit during
  Phase 4 testing. A `just` recipe run directly by the user in their
  own terminal also sidesteps the Phase 4 TTY problem entirely — the
  human's own terminal already has a real TTY, so `claude-cloud-start`
  and `claude-cloud-teleport` can run `claude --cloud`/
  `claude --teleport` directly instead of merely printing the command
  back. Considered keeping the skills as a documentation layer even
  after adding the recipes, but rejected it — two ways to do the same
  thing invites them drifting out of sync.
- **Renamed the recipes from `cloud-*` to `claude-cloud-*` (via an intermediate `claude-*`), and added short aliases:**
  the `Justfile` already has an unrelated "Cloud Run Admin Job" section
  further down for GCP Cloud Run environments — a bare `cloud-*` prefix
  on these Claude-specific recipes courted confusion between the two.
  First renamed to `claude-*`, then to `claude-cloud-*` to keep both
  "claude" and "cloud" in the name for clarity while staying distinct
  from the GCP recipes. Added `clst`, `clss`, `cltp` aliases to match
  the short-alias convention every other recipe in the file follows,
  checked against the full existing alias list for collisions before
  picking them — these stayed unchanged across both renames, since
  they were short mnemonics rather than literal abbreviations of the
  full name.
