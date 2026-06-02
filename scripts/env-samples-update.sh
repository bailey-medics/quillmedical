#!/usr/bin/env bash
# env-samples-update.sh — Generate .env-sample files from .env files.
#
# For each .env file found in the repo, creates/updates a .env-sample in the
# same directory with keys preserved and values replaced by placeholders.
# Comments and blank lines are kept intact.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)" # cspell:disable-line

# Find all .env files, excluding common non-project directories
env_files=()
while IFS= read -r f; do
    [[ -n "$f" ]] && env_files+=("$f")
done <<EOF
$(find "$REPO_ROOT" -name ".env" \
    -not -path "*/.git/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/.venv/*" \
    -not -path "*/venv/*" \
    | sort)
EOF

if [[ ${#env_files[@]} -eq 0 ]]; then
    echo "No .env files found."
    exit 0
fi

for env_file in "${env_files[@]}"; do
    sample_file="${env_file}-sample"
    dir="$(dirname "$env_file")"
    rel_path="${env_file#"$REPO_ROOT"/}"

    echo "Processing: $rel_path → ${rel_path}-sample"

    # Process line by line
    output=""
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Preserve blank lines
        if [[ -z "$line" ]]; then
            output+=$'\n'
            continue
        fi

        # Preserve comments
        if [[ "$line" =~ ^[[:space:]]*# ]]; then
            output+="$line"$'\n'
            continue
        fi

        # Match KEY=VALUE (handles optional quotes)
        if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*) ]]; then
            key="${BASH_REMATCH[1]}"
            value="${BASH_REMATCH[2]}"

            # Strip surrounding quotes from value for analysis
            stripped_value="$value"
            stripped_value="${stripped_value#\"}"
            stripped_value="${stripped_value%\"}"
            stripped_value="${stripped_value#\'}"
            stripped_value="${stripped_value%\'}"

            # Determine appropriate placeholder based on key name patterns
            if [[ "$key" =~ (PASSWORD|SECRET|KEY|TOKEN|PRIVATE) ]]; then
                placeholder="CHANGE_ME"
            elif [[ "$key" =~ _PORT$ ]]; then
                # Keep port numbers as-is (not secret)
                placeholder="$value"
            elif [[ "$key" =~ _HOST$ ]]; then
                # Keep hostnames as-is (infrastructure config, not secret)
                placeholder="$value"
            elif [[ "$key" =~ (_URL|_URL$|SERVER_URL) ]]; then
                # Keep URLs as-is (infrastructure config, not secret)
                placeholder="$value"
            elif [[ "$key" =~ (_NAME$|_DB$) ]]; then
                # Keep DB/service names as-is (not secret)
                placeholder="$value"
            elif [[ "$key" =~ (_USER$|_USER) && ! "$key" =~ (PASSWORD|SECRET) ]]; then
                # Keep usernames as-is (not secret in dev)
                placeholder="$value"
            elif [[ "$key" =~ (EMAIL|MAILTO|_FROM$) ]]; then
                placeholder="CHANGE_ME"
            elif [[ "$key" =~ PUBLIC ]]; then
                # Public keys are not secret but are environment-specific
                placeholder="CHANGE_ME"
            else
                placeholder="CHANGE_ME"
            fi

            output+="${key}=${placeholder}"$'\n'
        else
            # Preserve any other lines (e.g. export statements, malformed)
            output+="$line"$'\n'
        fi
    done < "$env_file"

    # Write output (trim trailing newline to match original)
    printf "%s" "$output" > "$sample_file"

    echo "  ✓ Written: ${sample_file#"$REPO_ROOT"/}"
done

echo ""
echo "Done. ${#env_files[@]} .env-sample file(s) updated."
