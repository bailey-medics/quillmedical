# Remote dev machine plan

Work on Quill stops whenever the laptop is shut: a Claude Code session runs on the laptop, so closing the lid ends it, and GitHub Codespaces, the obvious always-on alternative, is expensive at the size this project needs and cannot do the job anyway. The 2019 Intel MacBook Pro (8-core i9, 32 GB, 1 TB) is also seven years old, and every option looked at here is at least twice as fast.

The outcome wanted is one always-on Linux machine at home, reached through VS Code Remote-SSH from the laptop and through Claude's Remote Control from the phone, that holds several git worktrees, runs the whole Docker stack and the test recipes, and keeps Claude Code sessions running after the laptop closes. Renting a server was costed in full first and rejected on price (see Decisions). The prices were gathered on 19 October 2026 and are a snapshot: DDR5 memory and Hetzner's prices both moved sharply in 2026.

## Phase 1: Buy the machine

- [ ] Buy a Minisforum AI X1 Pro-370 with 32 GB and 1 TB, £1,087 including VAT on Amazon UK, dispatched from Amazon and sold by Micro Computer (HK) Tech Limited, which is Minisforum's legal name; Minisforum's own UK store has it at £1,079 but Amazon's 30-day return is worth the £8. AMD Ryzen AI 9 HX 370 (12 cores, 24 threads, Zen 5): about 1.8 times the 2019 MacBook's speed on one core and well over twice across all cores (Geekbench 6 roughly 2,800 and 14,500 against 1,500 and 6,800), without the i9's throttling; two DDR5 SO-DIMM slots up to 128 GB, three M.2 slots, a built-in power supply, 65 W maximum and 45 dB at full load. Chosen over the 8-core Minisforum UM890 Pro (£895) for 50 percent more cores on a 2025 platform, and over the GEEKOM A9 Max (same chip, 2 TB, three-year warranty, £1,199 on GEEKOM's UK store) because it was not confirmed in stock. Buy from a UK seller with easy returns, because Minisforum has more early-failure reports (power board capacitors, internal power supply) than Beelink, offset by a two-year warranty and well-regarded repairs. The alternatives seen on 19 October 2026, all including VAT:

  - **Minisforum UM890 Pro** - Ryzen 9 8945HS (8 cores), 32 GB, 1 TB, £895, or 64 GB for £1,229. Same two memory slots and the value choice if 8 cores are enough.

  - **Beelink SER9 Pro** - Ryzen 7 H 255, 32 GB, 1 TB, £739. The cheapest 8-core option, fewer failure reports, but the memory is soldered at 32 GB for life and its "Restore on AC Power Loss" setting is reported as patchy.

  - **ASUS NUC 15 Pro** - Intel Core 7 240H (10 cores), 32 GB, 1 TB, £999, a big-name three-year warranty, somewhat slower on all-core work.

  - **Minisforum AI X1 Pro-370 or Beelink SER10 MAX** - Ryzen AI 9 HX 370 or HX 470, 32 GB, 1 TB, £1,079 to £1,189. Faster, but not needed for this work.

  - **Mac mini** - the M4 is discontinued; the M6 starts at £899 for 16 GB and 256 GB, the M5 Pro at £1,699 for 24 GB and 512 GB, and the 32 GB, 1 TB configurations cost well over £1,500. Apple UK's refurbished store had none. Rejected in Decisions.

  - **Self-build** - a Ryzen 7 9700X desktop with 64 GB and 2 TB comes to about £1,250 to £1,700, mostly because a 64 GB DDR5 kit is now £550 to £1,100, and it idles at several times a mini PC's power.

- [ ] Stay at 32 GB rather than paying £300 to £800 more for 64 GB. 32 GB is comfortable for the dev stack, a unit-test container and one E2E run at once; it gets tight only when several worktrees run E2E stacks with the clinical profile together, because HAPI FHIR and EHRbase each default to a quarter of host RAM and the compose files set no limit on either. Running one E2E stack at a time is already the rule, since `just e2e` and Storybook tests saturate a machine. The X1 Pro-370 has two SO-DIMM slots, so it can go to 64 GB or more later if memory prices fall; that upgrade path is why the Beelink, whose 32 GB is soldered, was ruled out.

- [ ] Optionally add a UPS, the APC BX500MI at about £63, so a brief power cut does not reboot the box mid-run. Skip it at first and add it only if power cuts turn out to interrupt work.

- [ ] Budget the running cost at about £40 a year: the Ofgem cap for October to December 2026 is 26.32p per kWh, VAT-free until 31 March 2027, so 10 W around the clock is £23 a year, plus a few hours a day under load. Replacing the machine every two to three years brings the whole cost to about £300 to £350 a year, against about £730 a year for the cheapest suitable rented server.

## Phase 2: Build the machine

- [ ] Install Ubuntu Server 24.04 LTS, not the desktop edition, which suspends when idle. VS Code Remote-SSH needs x86_64 or arm64 Linux with glibc 2.28 or later (Ubuntu 24.04 ships 2.39) and refuses Alpine. An x86 box matches CI, which has only ever run on `ubuntu-24.04` x64.

- [ ] In the BIOS, set it to power on when power returns ("Restore on AC Power Loss"), then test it by pulling the plug and putting it back. Minisforum's setting is reported to work reliably, but if it does not, return the machine within the returns window: a box that stays off after a power cut while the house is empty is the one failure that strands everything until somebody is home.

- [ ] Put it on Tailscale and never open a port on the home router. Tailscale's Personal plan (6 users, unlimited devices since 8 April 2026) includes Tailscale SSH (`tailscale set --ssh`), and needs no port forwarding and no static IP, so it works even behind the carrier-grade NAT that some UK ISPs use. In `sshd_config` turn off password and keyboard-interactive authentication (both are on by default) and bind sshd to the Tailscale address only. Put Tailscale on the phone as well, so an SSH app is a fallback if Remote Control is not working.

- [ ] Install Docker Engine from Docker's apt repository with the compose plugin. Docker Engine on Linux is Apache 2.0 licensed, so no Docker Desktop subscription question arises. Add the user to the `docker` group knowing that group is root-equivalent. Published container ports bypass `ufw`, so check the compose port bindings bind to localhost or the Tailscale address, not every interface on the home network.

- [ ] Turn on `unattended-upgrades` (security updates only by default) and set `KillUserProcesses=no` in `/etc/systemd/logind.conf` explicitly, so tmux sessions survive the SSH session that started them. Debian ships that default; Ubuntu's was not confirmed.

- [ ] Do not add quiet hours or a nightly suspend. The box idles at 7 to 10 W, about £8 a year, and an 8-hour run flat out at 65 W is 0.52 kWh, about 14p; even a full-load run every night of the year is about £50. With solar panels, shifting a run from night to day saves only the export rate on that half a kilowatt-hour, a few pence. Against that, overnight runs while asleep are the point of the machine, and a timer that stops Docker or suspends the box would kill them. Leave everything on, keep the CPU governor at its `powersave` default, and start long runs in the morning when convenient; revisit only if the bill says otherwise.

- [ ] Install the host-side tools the `just` recipes expect: `just`, Node 24 with Yarn 4 through corepack, Playwright and its browser dependencies (`just e2e` runs Playwright on the host against a per-worktree stack), git and the GitHub CLI. The backend and frontend themselves run in containers, so no Python or Poetry on the host. `gh` falls back to a plain-text token file on a headless box, so prefer an SSH key for git and give `gh` a fine-grained token with the minimum scopes.

- [ ] Recreate the worktree layout exactly as on the laptop: the main checkout (`quillmedical`) and its numbered worktrees side by side under `~/github/`, then `just initialise-repo` for the hooks. The recipes already keep worktrees apart, and nothing changes on Linux: `just ub` and `just uf` run a throwaway container per worktree (compose project `quill-test-<dir>`), `just e2e` brings up `quill-e2e-<dir>` on a free port, `just migrate` uses `quill-migrate-<dir>`, and `just sa` refuses outside the main checkout. The `local/` folder is per machine and gitignored, so copy over by hand only what the box needs, into the main checkout only.

## Phase 3: Connect the laptop and the phone

- [ ] Connect VS Code Remote-SSH to the box's Tailscale hostname, one window per worktree. VS Code Server installs under the user on the remote, workspace extensions run there, and the Claude Code extension sets no `extensionKind`, so it runs on the box with its bundled `claude` binary. Install the standalone `claude` CLI on the box as well for the integrated terminal. Headless login is the documented copy-URL, paste-code flow for SSH sessions; credentials land in `~/.claude/.credentials.json` with mode 0600.

- [ ] Run every long Claude Code job inside `tmux`, one session per worktree, never in a VS Code terminal. Anthropic's own docs say to start `claude` inside tmux or screen on a remote machine; a VS Code terminal and the extension's panel both die when the window disconnects.

- [ ] Run `/rc` (Remote Control) inside each tmux session to direct it from the phone or claude.ai when out. It is a window onto the running process, not a keep-alive, which is why tmux comes first; it needs outbound HTTPS only, survives network drops, works on Pro and Max but not on API keys, and needs the directory trusted interactively once before it can be used.

- [ ] Run one full cycle from the main checkout and from a worktree before relying on it: `just sa`, `just ub -k "..."`, `just uf src/...`, `just e2e`, `just sbt`, and a `just migrate` dry run.

- [ ] Open the dev app in a browser two ways and fix what the second one shows. First through VS Code's port forwarding, which makes `localhost` on the laptop reach the box, so everything behaves as it does today. Then by the box's Tailscale address from the phone. The frontend calls `/api` relatively through Caddy (`caddy/dev/Caddyfile`), so nothing in the browser path hard-codes `localhost`, but two things will: Vite blocks any `Host` header that is not `localhost` or an IP address, and `frontend/vite.config.ts` sets no `server.allowedHosts`, so `http://devbox` gets a 403 from Vite while `http://100.x.y.z` works; and `FRONTEND_URL` in `backend/app/config.py` defaults to `http://localhost`, which is only used to build the links in verification and reset emails. The fixes are `allowedHosts` (or the `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` environment variable in `compose.dev.yml`) and `FRONTEND_URL=http://devbox` in the box's `backend/.env`; the Vite one is a code change needing `implement`.

## Phase 4: Review after the first month

- [ ] Decide whether it is working: the felt speed, the typing latency over Remote-SSH from outside the house, whether a job started on the box and directed from the phone finished as expected, and whether any outage or power cut stranded one.

- [ ] Tidy the two bits of code that exist only for the old Intel and Apple Silicon laptops, as a separate change needing `implement`: the Rosetta JIT workaround on the `fhir` service in `compose.dev.yml` (lines 141 to 143, `-XX:TieredStopAtLevel=1`) is only needed under Rosetta on Apple Silicon, and the `--platform linux/amd64` on the image build at `Justfile:457` is a no-op on an x86 box. Both are harmless until then.

## Decisions

- **Buy for home, do not rent** - the cheapest suitable rented server was Hetzner's EX44-1-LTD (14-core i5-13500, 64 GB, two 512 GB NVMe) at EUR 57.30 a month plus EUR 1.70 for an IPv4 address, about £61 with UK VAT, or about £730 a year. A £1,087 mini PC replaced every two to three years, plus electricity, is about £400 to £580 a year, and the old one keeps some resale value; the £739 8-core alternative would be about £300 to £350. Renting's two advantages were weighed and do not justify double the cost. Home internet dropping out one or two days a year is about 1 day in 150 and acceptable, because a stranded job is restarted when the connection is back. And the hardware ageing is answered by the replacement cycle. The rented options, all seen on 19 October 2026 and excluding VAT, for the record:

  - **OVHcloud RISE-S** - EUR 64.99, Ryzen 7 9700X, 64 GB DDR5, two 512 GB NVMe, northern France only, a one-month setup fee unless committed for 12 months.

  - **Hetzner AX42-1** - EUR 97.30 plus EUR 49 setup, Ryzen 7 PRO 8700GE, 64 GB DDR5, two 512 GB NVMe.

  - **Hostinger KVM 8** - £18.99 a month on a 24-month prepaid term, renewing at £39.99: 8 shared vCPUs, 32 GB, 400 GB. The cheapest rental, but shared CPUs, and about £456 up front.

  - **UK-hosted dedicated servers** - Fasthosts £115 on a 1-year minimum, Clouvider £124, Mythic Beasts £130 in Cambridge or £210 in London.

  - **Cloud VMs in London with 1 TB** - AWS Lightsail $164 flat (640 GB), Hetzner CCX33 plus a volume EUR 196, GCP e2-standard-8 about $372, Azure D8as v5 about $376, AWS m6a.2xlarge about $387. Stopping a VM when idle does not close the gap: a 1 TB disk alone is $120 a month on GCP.

  - **GitHub Codespaces** - $0.72 an hour for 8 cores and 32 GB, about $530 always on, and unable to do the job at any price: a 64 GB disk, and a hard 12-hour lifetime that applies even while it is in use.

- **Linux mini PC, not a Mac mini** - every pinned image in the compose files publishes linux/arm64, so a Mac would run the stack, but only inside the Linux VM that Docker Desktop, OrbStack or Colima provide, with the extra memory that costs; OrbStack is $8 a month for any commercial use. A Mac mini with 32 GB and 1 TB also costs more than the X1 Pro-370 for 8 fewer cores, and Tailscale SSH on macOS needs the open-source `tailscaled` rather than the App Store app. A Linux x86 box matches CI exactly.

- **Ubuntu Server, not Ubuntu Desktop** - the box could double as the desk computer, with the monitor, keyboard and trackpad plugged straight in and VS Code running on it natively, and the desktop edition costs only 1 to 2 GB of memory and almost no CPU when idle. Rejected anyway: it is a dev server first, Server never suspends and patches quietly through `unattended-upgrades`, and setting up a headless server is worth learning. The laptop stays the screen, over Remote-SSH, even at the desk.

- **tmux keeps sessions alive, Remote Control directs them** - Remote Control mirrors a running process to the phone or browser; it is not a keep-alive. Claude Code on the web (`claude --cloud`) was considered and rejected as the main route: its VMs are 4 vCPU, 16 GB, 30 GB disk with Docker preinstalled and no extra charge beyond plan usage, but they start from the pushed branch rather than the worktree, give no shell, pause when idle, and its commits carry a `Claude-Session:` trailer unless `attribution.sessionUrl` is set to false. It stays useful as a stopgap on the days the home connection is down.
