#!/usr/bin/env bash
# Checks that pinned tool versions agree across the single-source config files,
# their Docker consumers, and CI.
#
# Usage: check-version-consistency.sh
#
# Run from the repository root. Compares Python at minor granularity (e.g. 3.13)
# and Node at major granularity (e.g. 24), because the pins live at different
# granularities (.python-version is exact, the Docker tag is minor, etc.).
# Exits 1 and names the offending files if any consumer has drifted.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "check-version-consistency"

fail=0

# ---- Python: minor version must agree everywhere ----
py_source="$(cut -d. -f1,2 < .python-version)"
py_docker="$(grep -oE 'python:[0-9]+\.[0-9]+' backend/Dockerfile | head -1 | cut -d: -f2)"
py_mypy="$(grep -m1 -oE 'python_version = "[0-9]+\.[0-9]+"' backend/pyproject.toml | grep -oE '[0-9]+\.[0-9]+')"

log "Python minor — .python-version: ${py_source:-<none>}, backend/Dockerfile: ${py_docker:-<none>}, mypy: ${py_mypy:-<none>}"
for entry in "backend/Dockerfile=$py_docker" "backend/pyproject.toml (mypy)=$py_mypy"; do
  name="${entry%%=*}"
  value="${entry#*=}"
  if [ "$value" != "$py_source" ]; then
    error "Python minor mismatch: $name is '$value' but .python-version is '$py_source'"
    fail=1
  fi
done

# ---- Node: major version must agree between CI and the Docker image ----
node_ci="$(grep -oE "node-version: '[0-9]+'" .github/workflows/ci.yml | grep -oE '[0-9]+' | sort -u)"
node_docker="$(grep -oE 'node:[0-9]+' frontend/Dockerfile | head -1 | cut -d: -f2)"

if [ "$(printf '%s\n' "$node_ci" | grep -c .)" -ne 1 ]; then
  error "ci.yml has more than one distinct node-version major: $(echo "$node_ci" | tr '\n' ' ')"
  fail=1
fi

log "Node major — .github/workflows/ci.yml: ${node_ci:-<none>}, frontend/Dockerfile: ${node_docker:-<none>}"
if [ "$node_ci" != "$node_docker" ]; then
  error "Node major mismatch: ci.yml is '$node_ci' but frontend/Dockerfile is '$node_docker'"
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  error "Version consistency check failed. Update the mismatched files to match the single source."
  exit 1
fi

log "All pinned versions are consistent."
