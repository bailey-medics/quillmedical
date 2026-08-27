# .github/scripts

Shell scripts called by GitHub Actions workflows.

## Structure

- `shared/` — helpers sourced by scripts across multiple workflows
- `<workflow-name>/` — scripts for a specific workflow (e.g. `auto-pr/`)

## Testing

Scripts with non-trivial logic have a `.bats` test file alongside them (e.g.
`deploy/resolve-commit.bats` next to `deploy/resolve-commit.sh`). Tests use
[bats-core](https://github.com/bats-core/bats-core).

- Install bats locally: `brew install bats-core`
- Run locally: `just test-scripts` (or `bats --recursive .github/scripts`)
- CI runs the suite on every push via the shell script job in `ci.yml`
