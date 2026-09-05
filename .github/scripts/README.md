# .github/scripts

Shell scripts called by GitHub Actions workflows.

## Structure

- `shared/` — helpers sourced by scripts across multiple workflows
- `<workflow-name>/` — scripts for a specific workflow (e.g. `auto-pr/`)

## Testing

Scripts with non-trivial logic have a `.bats` test file alongside them (e.g.
`deploy/resolve-commit.bats` next to `deploy/resolve-commit.sh`). Tests use
[bats-core](https://github.com/bats-core/bats-core).

- Run locally: `just test-scripts` — runs the suite in `ubuntu:24.04`, matching CI
- `bats --recursive .github/scripts` works on the host, but tests a different bash
  and coreutils from the runners, so its result says little about CI
- CI runs the suite on every push via the shell script job in `ci.yml`
