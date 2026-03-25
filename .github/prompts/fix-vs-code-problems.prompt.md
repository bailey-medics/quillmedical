---
agent: "agent"
name: fix-vs-code-problems
description: Fix problems in VS Code
---

# Fix VS Code problems

1. Use the `get_errors` tool to retrieve **all** current diagnostics from the VS Code PROBLEMS panel
2. For each problem, determine whether it is:
   - **Fixable**: a genuine error or warning that can be resolved by editing code or config
   - **False positive**: a linting rule triggering on valid code (e.g. MkDocs admonition indentation flagged as MD046, Terraform templatefile variables flagged as SC2154, `.git/COMMIT_MSG` flagged by markdownlint)
   - **Upstream/unfixable**: an issue outside our control (e.g. base Docker image vulnerabilities from Debian)
3. Fix all fixable problems — edit the source files directly
4. For false positives, either:
   - Add targeted inline suppression comments (e.g. `# shellcheck disable=SC2154`)
   - Update the relevant ignore file or linting config (e.g. `.markdownlintignore`, `.markdownlint.json`)
5. For upstream/unfixable issues, report them but take no action
6. After all fixes, run `get_errors` again to confirm the PROBLEMS list is clear (or only contains known upstream issues)

Report a summary of what was fixed, what was suppressed, and what remains unfixable.
