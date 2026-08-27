---
name: fix-vs-code-problems
description: Fix problems reported by the editor and the project linters
disable-model-invocation: true
---

# Fix VS Code problems

1. Retrieve **all** current diagnostics. Use the IDE diagnostics tool
   (`mcp__ide__getDiagnostics`) if it is available in this session. If it is not, say so and
   fall back to running the project's own checks and treating their output as the problem
   list: `just lint` / pre-commit for Python, and ESLint, Prettier, Stylelint and typecheck
   for TypeScript (see `Justfile` and `./scripts/run-ci-checks.sh`)
2. For each problem, determine whether it is:
   - **Fixable**: a genuine error or warning that can be resolved by editing code or config
   - **False positive**: a linting rule triggering on valid code (e.g. MkDocs admonition indentation flagged as MD046, Terraform templatefile variables flagged as SC2154, `.git/COMMIT_MSG` flagged by markdownlint)
   - **Upstream/unfixable**: an issue outside our control (e.g. base Docker image vulnerabilities from Debian)
3. Fix all fixable problems — edit the source files directly
4. For false positives, first inform the user. Suggest either:
   - Adding targeted inline suppression comments (e.g. `# shellcheck disable=SC2154`)
   - Updating the relevant ignore file or linting config (e.g. `.markdownlintignore`, `.markdownlint.json`)
5. For upstream/unfixable issues, report them but take no action
6. After all fixes, re-run whichever check you used in step 1 to confirm the problem list is
   clear (or only contains known upstream issues)

Report a summary of what was fixed, what could be suppressed, and what remains unfixable.
