# Session hooks

`session-start.sh` runs at the start of every Claude Code session. It exits
immediately unless `CLAUDE_CODE_REMOTE` is `true`, so it only ever does work in
[Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web);
a local checkout already has its `.env` files, its tooling and its Docker
daemon.

## What runs where

Two mechanisms set a cloud session up, and the split matters because they have
different lifetimes.

| | Setup script | `session-start.sh` |
| --- | --- | --- |
| Configured in | The environment dialog at [claude.ai/code](https://claude.ai/code) | This repository |
| Runs | Once per environment, before Claude Code launches | Every session, after Claude Code launches |
| Survives into later sessions | Yes, as a filesystem snapshot | No |

After the setup script finishes, the filesystem is snapshotted and reused as the
starting point for later sessions. The snapshot keeps **files** — installed
packages, pulled images, built layers — but not **processes**. So anything that
has to be downloaded belongs in the setup script, and anything that has to be
running belongs in the hook.

That is why `session-start.sh` starts `dockerd` and runs `docker compose up`
every time: no init system runs in the session container, and a snapshot of a
running stack is still just a snapshot of its files.

## Tooling the hook installs

Three tools are missing from the base image and are installed on demand, each
skipped when it is already present:

| Tool | Why | Source |
| --- | --- | --- |
| `pre-commit` | Commits made in a session run the same checks as CI | PyPI |
| `bats` | Runs the shell suites the way CI does | npm |
| `just` | Every command in `CLAUDE.md` is a just recipe | PyPI (`rust-just`) |

`just` comes from PyPI rather than from its upstream installer on purpose. The
session's GitHub proxy serves release assets only for repositories attached to
the session, so fetching the `casey/just` release returns a 403.

## Allowed domains

Docker Hub serves image manifests from `registry-1.docker.io` and the image
blobs themselves from a CDN. The **Trusted** network access level allows the
former but names only `production.cloudflare.docker.com` for the latter, and
Docker Hub now redirects blob requests to `production.cloudfront.docker.com`.
Every pull therefore authenticates, resolves the manifest, and then fails on the
first blob with `Forbidden` — including `docker pull hello-world`.

Because every image this repository uses comes from Docker Hub — `python`,
`node`, `caddy`, `postgres`, `hapiproject/hapi` and `ehrbase/ehrbase` — nothing
containerised works until that host is allowed. In practice that means no
`just ub` and no `just uf`, since both run inside `quill_backend` and
`quill_frontend`.

To fix it, open the environment settings at [claude.ai/code](https://claude.ai/code),
set **Network access** to **Custom**, tick **Also include default list of common
package managers**, and add:

```text
production.cloudfront.docker.com
```

Changing the allowed hosts makes the setup script run again and rebuilds the
snapshot, which is what you want here: the rebuild is where the images get
pulled.

## Setup script

Paste this into the environment's **Setup script** field so images land in the
snapshot rather than being pulled during a session.

```bash
#!/bin/bash
set -uo pipefail

REPO=/home/user/quillmedical
cd "$REPO" || exit 0

# No init system runs in the container, so start the daemon before pulling.
# dockerd inherits HTTPS_PROXY and the CA bundle from this script.
if ! docker info >/dev/null 2>&1; then
    dockerd >/tmp/dockerd-setup.log 2>&1 &
    for _ in $(seq 1 30); do
        docker info >/dev/null 2>&1 && break
        sleep 1
    done
fi

docker compose -f compose.dev.yml pull --quiet || true

exit 0
```

Two constraints shape that script. It must exit zero, or sessions in the
environment fail to start, which is why every fallible step ends in `|| true`.
And it should finish inside roughly five minutes, or the snapshot never gets
built and each session pays the download cost again.

Adding `docker compose -f compose.dev.yml build` pulls the first session's build
cost into the snapshot too, but a cold `yarn install` in the frontend image can
push the script past that five-minute budget. Add it only if the snapshot still
builds.

The `clinical` profile services — HAPI FHIR, EHRbase and their databases — are
excluded on purpose. They are the slowest images by a wide margin and the unit
tests do not touch them. Prefix the pull with `COMPOSE_PROFILES=clinical` if you
want them cached as well.

## Checking it worked

From a session, the daemon and the stack should both already be up:

```bash
docker info >/dev/null && echo "daemon up"
docker compose -f compose.dev.yml ps
just ub -k test_health
```

If the stack did not start, the hook says so and leaves the full Compose output
in `/tmp/compose-up.log`; daemon startup failures land in `/tmp/dockerd.log`.
A `Forbidden` on a `production.cloudfront.docker.com` URL in the first of those
means the allowed-domains change above has not been applied to this environment.
