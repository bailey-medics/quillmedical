---
description: Sync Copilot instructions and prompts from .github into the .claude structure, reporting drift since the last run
argument-hint: "[apply|dry-run] (default: dry-run)"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(ls:*), Bash(find:*), Bash(shasum:*), Bash(mkdir:*), Bash(cat:*)
---

# Context

Repository root: !`pwd`

Copilot config present:
!`find .github -maxdepth 2 \( -name 'copilot-instructions.md' -o -name '*.instructions.md' -o -name '*.prompt.md' -o -name '*.chatmode.md' \) 2>/dev/null | sort`

Existing Claude config:
!`find .claude CLAUDE.md -maxdepth 3 -type f 2>/dev/null | sort`

Existing sync manifest:
!`cat .claude/sync-manifest.json 2>/dev/null || echo 'NONE - this is a first run'`

# Task

You are synchronising this repository's GitHub Copilot configuration into the Claude Code configuration structure. The `.github` files remain the source of truth. Your job is to produce or update their Claude-side equivalents, and to tell me what changed since the last run.

`$ARGUMENTS` controls behaviour. If it contains `apply`, write files. Otherwise operate in dry-run mode: report exactly what you would do and write nothing at all, including the manifest.

## Mapping

Apply these mappings. Where a target already exists, merge rather than overwrite.

| Source | Target | Notes |
|---|---|---|
| `.github/copilot-instructions.md` | `CLAUDE.md` | Create it if absent; merge into it if present. Never truncate it. |
| `.github/instructions/*.instructions.md` | `.claude/rules/<name>.md` | Convert the `applyTo` frontmatter string to a `paths` array. |
| `.github/prompts/*.prompt.md` | `.claude/commands/<name>.md` | Body becomes the command prompt. |
| `.github/chatmodes/*.chatmode.md` | `.claude/agents/<name>.md` | Only if such files exist; skip silently otherwise. |

## Conversion rules

**Frontmatter.** Copilot instruction files use `applyTo: "glob"` as a single string. Claude rules use `paths:` as a YAML array. A file with `applyTo: "**/*.tsx"` becomes `paths: ["**/*.tsx"]`. A comma-separated Copilot glob string must be split into separate array entries. If a source file has no `applyTo`, omit `paths` entirely rather than writing `paths: ["**"]`.

**Prompt files.** Copilot prompt files may carry `mode`, `model`, `tools` or `description` frontmatter. Carry `description` across unchanged. Drop `mode`. Do not invent an `allowed-tools` value: if the source declared tools, list them in your report as something for me to decide on, and leave the frontmatter field out.

**Body text.** Preserve the wording. Do not rewrite, tighten, summarise or "improve" my instructions. The only edits permitted are: rewriting references to Copilot-specific paths so they point at the Claude equivalent, and rewriting references to Copilot-specific features that have no Claude counterpart. Flag each such edit in your report rather than making it silently.

**CLAUDE.md, first run.** If `CLAUDE.md` does not exist, create it from `.github/copilot-instructions.md`. Carry the content across essentially verbatim under a heading that records where it came from, then leave a short empty section beneath it headed `## Claude-specific` for me to fill in by hand later. Do not pad that section with content you have invented.

**CLAUDE.md, later runs.** If `CLAUDE.md` already exists, read it first. Add only content from `copilot-instructions.md` that is not already present in substance, and do not duplicate a rule that is already stated in different words. Never remove, reorder, or reword content I wrote by hand, and never write into the `## Claude-specific` section.

## Drift detection

Maintain `.claude/sync-manifest.json`. For each synced source file record: the source path, the target path, a SHA-256 of the source file at time of sync, and an ISO date. On each run, compare current source hashes against the manifest and classify every file as one of:

- **new** — source exists, no manifest entry
- **changed** — source hash differs from the manifest
- **unchanged** — hashes match, no action needed
- **orphaned** — manifest entry exists but the source file is gone
- **diverged** — the target has been hand-edited since sync, detectable because it no longer matches what the recorded source would have produced

Never delete an orphaned or diverged target. Report it and let me decide.

## Safety constraints

- Do not touch anything under `.github/`. It is read-only for this command.
- Do not delete any file under `.claude/` or `CLAUDE.md`.
- Do not create `.claude/settings.local.json` or modify any settings file.
- If `.claude/` does not exist, create only the subdirectories you actually need.
- If a target file would end up empty, skip it and say so.

## Output

Finish with a short report in this shape, and nothing else:

```
Mode: dry-run | applied
New:        <count>  <paths>
Changed:    <count>  <paths>
Unchanged:  <count>
Orphaned:   <count>  <paths>
Diverged:   <count>  <paths>
Decisions needed: <bullet list, or "none">
```

If everything is unchanged, say so in one line and stop. Do not produce a summary of what the files contain.
