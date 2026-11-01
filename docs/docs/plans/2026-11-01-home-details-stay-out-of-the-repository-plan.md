# Home details stay out of the repository plan

The repository is public and its docs site builds every page under
`docs/docs/`, plans included. A security review on 1 November 2026 found
that the [remote dev machine plan](2026-10-19-remote-dev-machine-plan.md)
records the dev box's address on the home network, its address on the
tailnet and the Mac's hostname, and that nothing would stop the next plan
recording more: the router, the Wi-Fi name. None of those is a credential,
but together they are a map of how to reach the machine that holds the
credentials, published to anyone who looks.

The outcome is that those details are gone from the current tree and from
git history, the addresses no longer point at anything, a check refuses
the kinds of detail a pattern can recognise before they are committed and
again in CI, and a rule tells the people and agents writing here what the
check cannot see.

## Phase 1: Remove what is in the tree

- [x] Replace the three literals in
  `docs/docs/plans/2026-10-19-remote-dev-machine-plan.md`: the LAN
  address on the Docker Engine step becomes `<the box's LAN address>`,
  the tailnet address on the "open the dev app two ways" step becomes
  `<the box's Tailscale address>`, and the Mac's hostname in the
  `QUILL_NOTIFY_SSH_HOST` example on the banner step becomes
  `<the Mac's Tailscale name>`, the placeholder
  `docs/docs/conventions/finished-response-notifications.md` already
  uses. The sentences still make sense: the steps are about which
  address could reach what, not about the values. A search on 1 November
  2026 found no other literal in the tree. `frontend/.env-sample`
  mentions the bare `.ts.net` suffix for Vite's allowed hosts, which
  names no tailnet and stays.

## Phase 2: The check

- [x] Write `scripts/check-home-details.sh`, a grep over the files
  pre-commit hands it (or every tracked text file with `--all`), which
  exits non-zero when a line holds a detail of the kind below. The
  patterns live in the script because they describe a kind of detail,
  not ours, so they are safe in a public repository:
  - **A private or tailnet host address** - `10.x.x.x`,
    `172.16.x.x` to `172.31.x.x`, `192.168.x.x`, and `100.64.0.0/10`,
    the range Tailscale assigns from. A CIDR such as `10.0.0.0/20`
    passes: the subnets in `infra/` are a design, not a place.
  - **A named tailnet** - anything matching `[a-z0-9-]+.ts.net`. The
    bare `.ts.net` passes, for the reason in Phase 1.
  - **A MAC address** - six pairs of hex digits separated by colons or
    hyphens, not part of a longer run such as a certificate fingerprint.

  Two more turned out to be needed while building it, on 1 November
  2026. Tailscale's IPv6 addresses share one prefix, which the script
  refuses too, written with its last colon as `[:]` so that the
  script's own source does not match it. And an address ending `.0`
  passes like a CIDR, because `infra/` names peering ranges that way
  (`address = "10.8.0.0"` with the prefix length beside it).

  Files whose name ends `_test.py`, `.test.ts`, `.test.tsx` or `.bats`
  are skipped: `backend/app/client_address_test.py` and `push_test.py`
  use `10.0.0.x` as fixtures, and a fixture address is made up by
  definition. The hostname `devbox` and the username are not matched:
  `devbox` is functional in `scripts/notification.sh`, which matches it
  in the VS Code window title, and the username is in paths across
  nineteen files. Both say "there is a box", not "here is how to reach
  it", and the rule in Phase 3 covers the rest.

- [x] Have the script also read `local/home-details-denylist`, one
  literal per line, comments with `#`, and refuse any file that holds
  one of them. The literals are the things only a list can know: the
  Mac's hostname, a router model, a Wi-Fi name. They never go in the
  repository, in any file, because the repository is public and a list
  of them would publish what it guards. The script finds the folder
  through `scripts/local-path.sh`, as `just lp` does, so it works from
  any worktree. When the file is missing and `CI` is unset, the script
  creates it with a comment header saying what belongs in it and prints
  one line saying it did, the way `just lp` makes the folder when it is
  missing; otherwise it would exist on no machine to start with. Under
  `CI` nothing is created and the patterns alone run. A second
  developer keeps a list for their own home, or none, and gets the CI
  behaviour on their machine until they do.

- [x] Print `path:line: home detail (<rule>)` and never the matched
  text. The repository's CI logs are as public as its files, so a check
  that echoed what it found would publish it in the act of refusing it.

- [x] Seed the list on this box with the Mac's hostname, in both
  spellings it has appeared in. That is a write to a gitignored file on
  this machine, not to the repository. Matching ignores case, so one
  line covers both spellings. Done on 1 November 2026, after the hook's
  first run had made the file with its header.

- [x] Add `scripts/tests/check-home-details.bats`, in the shape of
  `check-python-version.bats`: a temporary repository, the script run
  against named files, `local-path.sh` stubbed to a folder under
  `BATS_TEST_TMPDIR`. Cases: a clean file passes; a LAN host address in
  a `.md` fails; the same literal in a `_test.py` passes; a CIDR passes;
  a named tailnet fails and the bare suffix passes; a MAC address fails;
  a literal from the list fails when the list is present; the list is
  created with its header when absent and `CI` is unset, and not created
  under `CI=1`; the output names the file and line and not the text. Run
  with `just ts scripts/tests`, which runs the shell tests in the
  container CI uses; bats is not installed on the dev box itself. On 1
  November 2026 it ran all 328 tests, 21 of them new, and all passed.

- [x] Add the hook to `.pre-commit-config.yaml` beside
  `check-audit-ledger`: `language: system`, `entry:
  scripts/check-home-details.sh`, `types: [text]`, no `files:` limit.
  This is the whole of the CI wiring: the "Python pre-commit" job in
  `.github/workflows/ci.yml` runs `pre-commit run --all-files`, and the
  merge queue runs it again against current `main`, so the patterns
  gate every push and every merge whoever made them. Only the literal
  list is a local extra, which is what Mark asked for: patterns in CI at
  least, literals at pre-commit.

- [x] Run `pre-commit run check-home-details --all-files` over the
  whole tree. The `172.16-31` range and MAC addresses were not searched
  for when this plan was written, so this is the first look. A slip is
  fixed in place; anything that needs a judgement goes to Mark rather
  than into an exemption. Run on 1 November 2026: the tree passed once
  Phase 1 had landed, and the remote-dev plan as it stood before Phase 1
  was refused on all three lines, the Mac's hostname through this box's
  list.

## Phase 3: The rule

- [x] Write `.claude/rules/home-details.md` with no `paths:` block, so
  it loads in every session. It says that the repository is public and
  the docs site publishes every page, so nothing that locates or reaches
  the home set-up goes into code, docs, comments, commit messages or
  pull requests: addresses on the LAN or the tailnet, the tailnet's
  name, hostnames of personal devices, the router's make, Wi-Fi names,
  the ISP, the physical location. A plan that has to refer to one says
  it in angle brackets, as Phase 1 does. It names the check as what
  enforces the part a grep can see, and `local/home-details-denylist`
  as where a person's own literals go.

- [x] Add a one-line pointer to the rule under `## Claude-specific` in
  `CLAUDE.md`, the only section the Copilot sync leaves alone, so the
  rule is found by somebody reading the project instructions top to
  bottom and not only by the agent that loads the rules folder.

- [x] Phases 1 to 3 go up as one pull request and are merged before
  Phase 4 starts. The rewrite then only has to change old commits: the
  tip of every branch already holds the placeholders, so a correct
  rewrite leaves every branch's final tree exactly as it was, which is
  the check in Phase 4.

## Phase 4: Rewrite git history

A search on 1 November 2026 found the three literals in history and
nowhere else: the two addresses arrived in `e4a5024a` (pull request
#2190, 25 October 2026) and the Mac's hostname in `f86b57a2` (#2207,
26 October 2026). No commit message holds one, there are no tags, and
the repository has no forks. `audit/ledger.tsv` records file content
hashes, not commit hashes, and the remote-dev plan is not in it, so the
rewrite leaves the ledger valid.

- [ ] Pick a quiet moment. Nothing in the merge queue, no deploy
  running, and every worktree on the box and the Mac clean, with its
  commits pushed: a local commit that was never pushed is left on the
  old history and has to be moved by hand. Open pull requests (nine on
  1 November 2026) need not be merged first, because the rewrite
  carries their branches across with everything else.

- [ ] Make a fresh `git clone --mirror` in the scratch folder, never in
  a worktree, and run `git filter-repo --replace-text` over it, with
  each literal mapped to the Phase 1 placeholder. The expressions file
  holds the literals, so it lives in `local/` and is deleted after.
  `filter-repo` also rewrites any short commit hash quoted in a commit
  message to the new one, so cross-references inside history survive.

- [ ] Check the result before anything is pushed. `git log --all -S`
  for each literal finds nothing. For every branch, `git diff
  <old tip> <new tip>` is empty, because Phase 1 already changed the
  tip; any branch where it is not empty still held a literal and is
  looked at by hand. `git rev-list --all --count` is unchanged.

- [ ] Mark lifts the `protected-branches` ruleset on `main`, whose
  `non_fast_forward` rule refuses the force-push: in the GitHub UI, set
  its enforcement to disabled. The ruleset is managed by Terraform in
  `infra/github/branch_rules.tf`, so this is drift for the length of
  the push, and the next step puts it back.

- [ ] Force-push every branch from the mirror with `git push --force
  origin 'refs/heads/*:refs/heads/*'`, not `--mirror`: GitHub refuses
  writes to the `refs/pull/*` refs a mirror carries, and the push would
  fail part-way. Then Mark sets the ruleset back to active, and a `terraform
  plan` in `infra/github` shows no change.

- [ ] Bring every worktree on the box and the Mac across: `git fetch`,
  then `git reset --hard origin/<branch>` on each branch that was clean
  and pushed, and delete local branches that no longer exist on the
  remote. Then check that `just stl` still draws each stack, because
  the stack tooling records which branch sits on which. The shared
  stash stack points at old commits and is left alone.

- [ ] Mark asks GitHub Support to remove cached views of the old
  commits, naming #2190 and #2207. A pull request keeps its own
  reference to the commits it was opened with, and its diff stays
  readable on GitHub until Support removes it; the force-push cannot
  reach either. GitHub's guide to removing sensitive data from a
  repository describes the request.

## Phase 5: Make the old values stale

- [ ] Mark gives the box a new tailnet address in the Tailscale admin
  console (Machines, the box, Edit machine IPv4) and a new DHCP
  reservation on the router, then renews the lease or reboots the box.
  Peers learn the new tailnet address on their own. Anything that
  copied the old values before Phase 4, a search cache or somebody's
  clone, then points at nothing. This does not depend on the other
  phases and can be done at any time; it is last only because it is
  the one with no repository work in it.

- [ ] While in the router, Mark turns UPnP off. The review saw the
  router answer UPnP and NAT-PMP requests, which lets any device or
  container on the LAN open a port to the internet.

## Decisions

- **History is rewritten, not just the tree** - decided by Mark on 1
  November 2026, after the cost was laid out: a relaxed ruleset for
  the length of a force-push, every branch rewritten, every worktree
  reset, and a request to GitHub Support. The values involved are not
  credentials and are being changed in Phase 5, but a public history
  that keeps them is the same map the rest of this plan takes down.

- **Plans keep being published** - excluding `docs/docs/plans/` from
  the docs site was offered and declined on 1 November 2026. The fix is
  to write plans that are safe to publish, which is what the check and
  the rule are for.

- **No GitHub secret for the literal list** - a repository secret would
  let CI check literals too, but it is a third copy of how to find the
  house, held somewhere that does not need it, and any pushed branch can
  print a repository secret with a workflow of its own. CI checking the
  patterns is enough; the literals are each developer's own, at
  pre-commit.
