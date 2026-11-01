# Home and dev set-up details stay out of the repository

The repository is public, and the docs site publishes every page under
`docs/docs/`, plans included. Anything written here can be read by
anyone, and stays readable in git history after it is deleted. So
nothing that locates or reaches the machines Quill is built on goes into
code, docs, comments, commit messages or pull requests:

- **Addresses** - on the home network or the tailnet, IPv4 or IPv6.
- **The tailnet's name** - the `<name>.ts.net` that Tailscale gives it.
  The bare suffix `.ts.net` names nothing and is fine.
- **Device names** - the hostnames of laptops, phones and the dev box's
  peers, and their MAC addresses.
- **The network itself** - the router's make or model, the Wi-Fi name,
  the ISP.
- **The place** - an address, a town, anything that says where the
  machines are.

**A plan that has to refer to one says it in angle brackets**:
`<the box's LAN address>`, `<the Mac's Tailscale name>`. The step is
about which machine could reach what, not about the value, and reads
just as well.

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
refuses a line, read the line in the editor; do not paste it into a
commit message, a pull request or a comment to ask about it.

The hostname `devbox` and the username in paths are not refused: they
say there is a box, not how to reach it, and `scripts/notification.sh`
needs `devbox` to find its window.

Recorded on 1 November 2026, after a security review found the dev
box's addresses and the Mac's hostname published in a plan. See
`docs/docs/plans/2026-11-01-home-details-stay-out-of-the-repository-plan.md`.
