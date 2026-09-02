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

Pulling the images is only half of it. Building the `backend` and `frontend`
images reaches for two more hosts that the Trusted list does not cover, and
each one fails the build outright:

| Host | Needed by | Why it is not covered |
| --- | --- | --- |
| `production.cloudfront.docker.com` | Every image pull | The list names the older `production.cloudflare.docker.com` |
| `repo.yarnpkg.com` | Corepack fetching Yarn 4 | The list has `yarnpkg.com` and `registry.yarnpkg.com`, and a bare entry does not match subdomains |
| `deb.debian.org` | `apt-get install git` in the backend dev stage | Not in the list at all |

To allow them, open the environment settings at
[claude.ai/code](https://claude.ai/code), set **Network access** to **Custom**,
tick **Also include default list of common package managers**, and list:

```text
production.cloudfront.docker.com
repo.yarnpkg.com
deb.debian.org
```

Changing the allowed hosts makes the setup script run again and rebuilds the
snapshot, which is what you want here: the rebuild is where the images get
pulled.

## Build containers and the proxy CA

Allowing those hosts is still not enough on its own. The session's egress proxy
re-terminates TLS, and while the session's own shell trusts its CA, a build
container does not: `pip`, Poetry and Corepack all reject every HTTPS request
with `self-signed certificate in certificate chain`, so the images fail to
build even when the hosts are reachable.

`compose.web.yml` handles this. It passes `/root/.ccr/ca-bundle.crt` to the
`backend` and `frontend` builds as a BuildKit secret, and each `Dockerfile`
installs it in an early layer when it is present. A secret is used rather than
a build arg or a bind mount so the certificate is never written into a layer or
recorded in image metadata, and because nothing mounts it outside a web session
the step is a no-op for local and CI builds — no published image is affected.

Two details are worth knowing if this ever needs changing:

- `pip` reads the system trust store, so `update-ca-certificates` satisfies it.
  Poetry goes through `requests`, which uses `certifi` and ignores that store,
  so the bundle is named explicitly through `REQUESTS_CA_BUNDLE`.
- Node ignores the system trust store too, so the frontend build points
  `NODE_EXTRA_CA_CERTS` straight at the copied certificate.

The hook applies the overlay itself whenever the CA exists, so
`docker compose -f compose.dev.yml -f compose.web.yml` is only ever assembled
in a web session. Running Compose by hand there needs both `-f` flags.

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
docker compose -f compose.dev.yml -f compose.web.yml build || true

exit 0
```

Two constraints shape that script. It must exit zero, or sessions in the
environment fail to start, which is why every fallible step ends in `|| true`.
And it should finish inside roughly five minutes, or the snapshot never gets
built and each session pays the download cost again.

The `build` line is the part most likely to run over that budget, because a cold
`yarn install` in the frontend image is slow. It earns its place — without it
every session rebuilds both images from scratch inside the hook — but it is the
first thing to drop if the snapshot stops being built. Both `-f` flags are
needed on it: the build cannot reach PyPI or the Yarn registry without the CA
that `compose.web.yml` supplies.

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
