# Quill's additions to the home-details rule

These add to the shared `home-details.md` rule in Mark's mark-house-style
repository, which says what stays out of the repository and why. Read
the two together.

**The docs site publishes every page under `docs/docs/`, plans
included**, so a plan is as public as the code.

**The dev box's private network is a Tailscale tailnet.** Its name, the
`<name>.ts.net` that Tailscale gives it, stays out. The bare suffix
`.ts.net` names nothing and is fine. A plan names a machine in angle
brackets, such as `<the box's LAN address>` or `<the Mac's Tailscale
name>`.

**`scripts/check-home-details.sh` enforces what a pattern can see.** It
runs as the `check-home-details` pre-commit hook, and CI runs it over
every file through the pre-commit job and again in the merge queue. It
refuses private and tailnet addresses, tailnet names, Tailscale's IPv6
prefix and MAC addresses. A CIDR and an address ending `.0` pass,
because a subnet is a design, not a place, and test files are skipped
because their addresses are made-up fixtures.

**The literals only a list can know go in `local/home-details-denylist`**,
one per line, matched without regard to case: device hostnames, the
router, the Wi-Fi name. The hook makes the file, with a header, the
first time it runs on a machine. It is never committed and never copied
anywhere else, a GitHub secret included: a list of the details would
publish what it guards, and any pushed branch can print a repository
secret. Each developer keeps their own.

**The check never prints what it matched**, only the file, the line and
the rule's name, because CI logs are as public as the files. When it
refuses a line, read the line in the editor.

The hostname `devbox` is not refused: it says there is a box, not how to
reach it.

Recorded on 1 November 2026, after a security review found a
developer's machine addresses and hostnames published in a plan.
