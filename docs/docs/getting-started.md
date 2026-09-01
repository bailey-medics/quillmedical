# Getting started

## Prerequisites

- Docker Desktop (running)
- [just](https://github.com/casey/just) command runner
- [GitHub CLI](https://cli.github.com/) (`gh`) — authenticated with `gh auth login`
- Node.js (for pre-commit hooks)
- [ShellCheck](https://www.shellcheck.net/) (optional) — only needed to lint the GitHub Actions shell scripts locally; `brew install shellcheck`
- [bats](https://github.com/bats-core/bats-core) (optional) — only needed to run the GitHub Actions shell script tests locally (`just test-scripts`); `brew install bats-core`

## Initial setup

1. Clone the repository:

   ```bash
   git clone https://github.com/bailey-medics/quillmedical.git
   cd quillmedical
   ```

2. Clone the teaching content repos and tooling:

   ```bash
   just initial-install
   ```

   This discovers all `*-teaching` repos in the `bailey-medics` organisation and clones them into `teaching-repos/`. Safe to re-run at any time — existing repos are pulled, new ones are cloned.

3. Start the Docker stack:

   ```bash
   just start-teaching   # teaching-only (no FHIR/EHRbase) — alias: j st
   just start-dev        # full EPR with clinical services — alias: j sd
   ```

   Both accept a `b` argument to rebuild images: `just st b`

4. Create a superadmin user:

   ```bash
   just create-super-user
   ```

## Claude Code on the web

Web sessions start from a fresh, empty container: `.env` files are git-ignored so
they're not part of the clone, and the dev Docker stack isn't running yet.
`.claude/hooks/session-start.sh` handles this automatically on every session —
it materialises `.env`, `backend/.env` and `frontend/.env` from the committed
`.env-sample` files (skipping any that already exist) and runs
`docker compose -f compose.dev.yml up -d --wait`. There's nothing to configure
for this to work.

To make that hook fast, pair it with an environment **Setup script** (set in
the environment dialog at [claude.ai/code](https://claude.ai/code)) that
pre-builds/pulls the images so the session-start hook only has to start
already-built containers:

```bash
#!/bin/bash
cd "$CLAUDE_PROJECT_DIR"
(cd backend && poetry install --with dev --no-interaction --no-ansi) || true
(cd frontend && corepack enable && corepack install && yarn install --immutable) || true
docker compose -f compose.dev.yml build backend frontend || true
docker compose -f compose.dev.yml pull postgres-core caddy || true
```

Don't add `.env-sample` copying to the Setup script — the session-start hook
already does it, and the Setup script runs before it, when the checkout it
would be copying from isn't guaranteed to be in place yet (that's what caused
`cp: .env-sample: No such file or directory` failures). Setup scripts must
also exit zero or the session fails to start, hence the `|| true` guards — see
[Setup scripts](https://code.claude.com/docs/en/cloud-environments#setup-scripts)
in the Claude Code docs.

## Teaching repos

Teaching content (MCQ question banks and learning modules) lives in separate repos, one per organisation:

| Repo                   | Content                       | Visibility         |
| ---------------------- | ----------------------------- | ------------------ |
| `eoeeta-teaching`      | Colonoscopy optical diagnosis | Private            |
| `respiratory-teaching` | Chest X-ray interpretation    | Public (reference) |

These are cloned into `teaching-repos/` (git-ignored by the parent repo). Each has its own CI/CD that validates and deploys content to GCS.

The validator and the reusable pipeline those repos run live in Quill, under `backend/app/features/teaching/tooling/` and `.github/workflows/teaching-pipeline.yml`. Nothing extra needs cloning.

To add a new teaching organisation, create a repo named `<org>-teaching` in `bailey-medics` — `just initial-install` will pick it up automatically.

## Useful commands

Run `just --list` for all available recipes. Key ones:

| Command                  | Alias   | Description                                 |
| ------------------------ | ------- | ------------------------------------------- |
| `just start-teaching`    | `j st`  | Start dev (teaching only, no FHIR/EHRbase)  |
| `just start-dev`         | `j sd`  | Start dev (full EPR with clinical services) |
| `just stop`              | `j sc`  | Stop all containers                         |
| `just initial-install`   | `j ii`  | Clone/pull teaching repos and tooling       |
| `just validate-teaching` | `j vt`  | Validate all teaching content locally       |
| `just sync-teaching`     | `j syt` | Sync question banks into the DB             |
| `just seed-teaching`     | `j sdt` | Seed fresh DB with teaching data            |
| `just uf`                |         | Run frontend unit tests                     |
| `just ub`                |         | Run backend unit tests                      |
| `just docs`              | `j d`   | Rebuild API docs                            |
