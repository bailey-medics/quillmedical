# Getting started

## Prerequisites

- Docker Desktop (running)
- [just](https://github.com/casey/just) command runner
- [GitHub CLI](https://cli.github.com/) (`gh`) — authenticated with `gh auth login`
- Node.js (for pre-commit hooks)

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

   This discovers all `*-teaching` repos in the `bailey-medics` organisation and clones them into `teaching-repos/`. It also clones `teaching-tooling/` (shared validation and compilation scripts). Safe to re-run at any time — existing repos are pulled, new ones are cloned.

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

## Teaching repos

Teaching content (MCQ question banks and learning modules) lives in separate repos, one per organisation:

| Repo                   | Content                       | Visibility         |
| ---------------------- | ----------------------------- | ------------------ |
| `eoeeta-teaching`      | Colonoscopy optical diagnosis | Private            |
| `respiratory-teaching` | Chest X-ray interpretation    | Public (reference) |

These are cloned into `teaching-repos/` (git-ignored by the parent repo). Each has its own CI/CD that validates and deploys content to GCS.

Shared tooling (validation scripts, MDX compiler, reusable GitHub Actions workflows) lives in [`teaching-tooling/`](https://github.com/bailey-medics/teaching-tooling) — also cloned locally and git-ignored. Edit it alongside the content repos in the same VS Code workspace.

To add a new teaching organisation, create a repo named `<org>-teaching` in `bailey-medics` — `just initial-install` will pick it up automatically.

## Useful commands

Run `just --list` for all available recipes. Key ones:

| Command                  | Alias  | Description                                   |
| ------------------------ | ------ | --------------------------------------------- |
| `just start-teaching`    | `j st` | Start dev (teaching only, no FHIR/EHRbase)    |
| `just start-dev`         | `j sd` | Start dev (full EPR with clinical services)   |
| `just stop`              | `j sc` | Stop all containers                           |
| `just initial-install`   | `j ii` | Clone/pull teaching repos and tooling         |
| `just validate-teaching` | `j vt` | Validate all teaching content locally         |
| `just sync-teaching`     | `j syt`| Sync question banks into the DB               |
| `just uf`                |        | Run frontend unit tests                       |
| `just ub`                |        | Run backend unit tests                        |
| `just docs`              | `j d`  | Rebuild API docs                              |
