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
!`find .claude CLAUDE.md -maxdepth 4 -type f 2>/dev/null | sort`

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
| `.github/prompts/*.prompt.md` | `.claude/skills/<name>/SKILL.md` | Body becomes the skill's instructions. The target is a directory containing `SKILL.md`, not a single file — see Skill naming below. |
| `.github/chatmodes/*.chatmode.md` | `.claude/agents/<name>.md` | Only if such files exist; skip silently otherwise. |

### Skill naming

A skill's invocable name (`/name`) comes from its **directory name**, never from the `SKILL.md` filename (which is always literally `SKILL.md`) and never from a `name:` field in personal/project skills (that field only sets a display label). Derive `<name>` for the target directory as follows:

- Default: the source file's basename with `.prompt.md` stripped (e.g. `run-all-tests.prompt.md` → `.claude/skills/run-all-tests/`).
- If the Copilot prompt's own frontmatter declares a `name:` that differs from its filename, use that `name:` value as the directory name instead, so the invoked command matches what the prompt was actually authored to be called (e.g. `commit-rebase-push.prompt.md` with `name: crp` → `.claude/skills/crp/`). Record this as `targetRenamed: true` in the manifest, same as before.
- Never leave stale directories behind: if a previous sync created `.claude/skills/<old-name>/` for a source that has since been renamed, flag it as **orphaned** (see Drift detection) rather than silently leaving two directories for one source.

## Conversion rules

**Frontmatter.** Copilot instruction files use `applyTo: "glob"` as a single string. Claude rules use `paths:` as a YAML array. A file with `applyTo: "**/*.tsx"` becomes `paths: ["**/*.tsx"]`. A comma-separated Copilot glob string must be split into separate array entries. If a source file has no `applyTo`, omit `paths` entirely rather than writing `paths: ["**"]`.

**Prompt files.** Copilot prompt files may carry `mode`, `model`, `tools`, `agent` or `description` frontmatter. Carry `description` across unchanged. Drop `mode` and `agent`. Do not invent an `allowed-tools` value: if the source declared tools, list them in your report as something for me to decide on, and leave the frontmatter field out.

**When to add `disable-model-invocation: true`.** Skills (unlike the old bare command files) genuinely support Claude auto-invoking them from conversational judgement, so this field is meaningful — it stops that and leaves the skill runnable only by typing `/name`. Copilot's `mode: agent` vs `mode: ask` doesn't map cleanly onto this; decide instead on what the prompt does:

- Any prompt whose steps commit, push, or otherwise mutate git history or a remote (e.g. the `crp` skill) must get `disable-model-invocation: true`. This is a hard rule — it mirrors CLAUDE.md's "NEVER auto-commit/push — always ask permission first", and a skill Claude can silently trigger from a vague request would undermine that.
- A prompt that only reads, reports, or explains (e.g. `e`, `read-project-instructions`) does not need it — leave model-invocation on unless the prompt's own body says otherwise.
- Otherwise, preserve whatever the existing target already has; don't flip it without a reason tied to the prompt's actual behaviour, and call out the reasoning in your report if you do change it.

**Body text.** Preserve the wording. Do not rewrite, tighten, summarise or "improve" my instructions. The only edits permitted are: rewriting references to Copilot-specific paths so they point at the Claude equivalent, and rewriting references to Copilot-specific features that have no Claude counterpart. Flag each such edit in your report rather than making it silently.

**CLAUDE.md, first run.** If `CLAUDE.md` does not exist, create it from `.github/copilot-instructions.md`. Carry the content across essentially verbatim under a heading that records where it came from, then leave a short empty section beneath it headed `## Claude-specific` for me to fill in by hand later. Do not pad that section with content you have invented.

**CLAUDE.md, later runs.** If `CLAUDE.md` already exists, read it first. Add only content from `copilot-instructions.md` that is not already present in substance, and do not duplicate a rule that is already stated in different words. Never remove, reorder, or reword content I wrote by hand, and never write into the `## Claude-specific` section.

## Drift detection

Maintain `.claude/sync-manifest.json`. For each synced source file record: the source path, the target path (for prompts, the `.claude/skills/<name>/SKILL.md` path), a SHA-256 of the source file at time of sync, and an ISO date. On each run, compare current source hashes against the manifest and classify every file as one of:

- **new** — source exists, no manifest entry
- **changed** — source hash differs from the manifest
- **unchanged** — hashes match, no action needed
- **orphaned** — manifest entry exists but the source file is gone, or (for prompts) the source still exists but its resolved skill name changed and the old `.claude/skills/<old-name>/` directory is still present
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
