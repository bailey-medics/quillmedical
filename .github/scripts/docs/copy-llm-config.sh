#!/usr/bin/env bash
# Copies the Claude Code configuration into the docs tree, so the MkDocs site
# publishes the instructions the assistant actually works from.
#
# Usage: copy-llm-config.sh <source-root> <output-dir>
#
# Copies CLAUDE.md, every rule, every skill and the hooks README. A skill is a
# directory holding a file that is always called SKILL.md, so each one is
# flattened to <skill-name>.md to give its page a name of its own.
#
# The output is generated and gitignored. Everything this script owns there
# is removed first, so a rule or skill deleted from the repository does not
# linger as a page. Anything else in the output directory is left alone.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "copy-llm-config"

#: What this script writes into the output directory. `prompts` is the copy
#: of .github/prompts this replaced: listed so a checkout that built the docs
#: before the change does not keep publishing it.
OWNED_PATHS=(
  "claude.md"
  "hooks.md"
  "prompts"
  "rules"
  "skills"
)

# Remove the previous run's output. Args: <output-dir>.
clear_output() {
  local output_dir="$1"
  local owned

  for owned in "${OWNED_PATHS[@]}"; do
    rm -rf "${output_dir:?}/${owned}"
  done
}

# Copy every rule under its own name. Args: <source-root> <output-dir>.
copy_rules() {
  local source_root="$1"
  local output_dir="$2"
  local rule

  mkdir -p "${output_dir}/rules"

  for rule in "${source_root}"/.claude/rules/*.md; do
    cp "$rule" "${output_dir}/rules/"
  done
}

# Copy each skill's SKILL.md as <skill-name>.md. Args: <source-root> <output-dir>.
copy_skills() {
  local source_root="$1"
  local output_dir="$2"
  local skill_file
  local skill_name

  mkdir -p "${output_dir}/skills"

  for skill_file in "${source_root}"/.claude/skills/*/SKILL.md; do
    skill_name="$(basename "$(dirname "$skill_file")")"

    cp "$skill_file" "${output_dir}/skills/${skill_name}.md"
  done
}

# Copy the hooks README, if there is one. Args: <source-root> <output-dir>.
copy_hooks_readme() {
  local source_root="$1"
  local output_dir="$2"
  local readme="${source_root}/.claude/hooks/README.md"

  if [ -f "$readme" ]; then
    cp "$readme" "${output_dir}/hooks.md"
  fi
}

main() {
  local source_root="${1:-}"
  local output_dir="${2:-}"

  if [ -z "$source_root" ] || [ -z "$output_dir" ]; then
    error "Usage: copy-llm-config.sh <source-root> <output-dir>"
    exit 1
  fi

  if [ ! -f "${source_root}/CLAUDE.md" ]; then
    error "No CLAUDE.md in ${source_root}; is that the repository root?"
    exit 1
  fi

  # A folder with no rules or no skills copies nothing, rather than handing
  # cp the unexpanded pattern.
  shopt -s nullglob

  mkdir -p "$output_dir"
  clear_output "$output_dir"

  cp "${source_root}/CLAUDE.md" "${output_dir}/claude.md"
  copy_rules "$source_root" "$output_dir"
  copy_skills "$source_root" "$output_dir"
  copy_hooks_readme "$source_root" "$output_dir"

  log "Copied the Claude configuration into ${output_dir}"
}

# Only run when executed, not when sourced, so tests can load the
# functions above without the script running itself.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
