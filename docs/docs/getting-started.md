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

2. Clone the teaching content repos:

   ```bash
   just initial-install
   ```

   This discovers all `*-teaching` repos in the `bailey-medics` organisation and clones them into `teaching-repos/`. It is safe to re-run at any time — existing repos are pulled, new ones are cloned.

3. Start the Docker stack:

   ```bash
   docker compose -f compose.dev.yml up -d
   ```

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

To add a new teaching organisation, create a repo named `<org>-teaching` in `bailey-medics` — `just initial-install` will pick it up automatically.

## Useful commands

Run `just --list` for all available recipes. Key ones:

| Command                | Description               |
| ---------------------- | ------------------------- |
| `just initial-install` | Clone/pull teaching repos |
| `just uf`              | Run frontend unit tests   |
| `just ub`              | Run backend unit tests    |
| `just docs`            | Rebuild API docs          |
