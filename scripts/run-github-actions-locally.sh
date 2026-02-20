#!/usr/bin/env bash
set -e

# Run GitHub Actions workflows locally using act
# This script provides shortcuts for running non-main.yml and main.yml workflows
# Usage: ./scripts/run-github-actions-locally.sh [workflow] [job]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

show_usage() {
  echo -e "${BOLD}GitHub Actions Local Runner (using act)${NC}"
  echo ""
  echo "Usage: $0 [workflow] [job]"
  echo ""
  echo -e "${BOLD}Workflows:${NC}"
  echo "  non-main              Run non-main.yml workflow (all jobs)"
  echo "  main                  Run main.yml workflow (all jobs)"
  echo ""
  echo -e "${BOLD}Specific Jobs (non-main):${NC}"
  echo "  python-styling        Run Python styling checks"
  echo "  python-unit           Run Python unit tests"
  echo "  ts-eslint             Run TypeScript ESLint"
  echo "  ts-prettier           Run TypeScript Prettier"
  echo "  ts-stylelint          Run TypeScript Stylelint"
  echo "  ts-typecheck          Run TypeScript type checking"
  echo "  ts-unit               Run TypeScript unit tests"
  echo "  ts-storybook-build    Build Storybook"
  echo "  ts-storybook-test     Run Storybook tests"
  echo "  semgrep               Run Semgrep security scan"
  echo "  docs                  Build documentation"
  echo ""
  echo -e "${BOLD}Examples:${NC}"
  echo "  $0 non-main                    # Run all non-main checks"
  echo "  $0 non-main ts-unit            # Run only TypeScript unit tests"
  echo "  $0 non-main python-styling     # Run only Python styling checks"
  echo ""
  echo -e "${BOLD}Notes:${NC}"
  echo "  - Requires Docker to be running"
  echo "  - First run downloads container images (may be slow)"
  echo "  - Secrets are not available in local runs"
  echo "  - Uses ubuntu-latest container by default"
  echo ""
  exit 1
}

check_docker() {
  if ! docker info &>/dev/null; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker Desktop and try again"
    exit 1
  fi
}

run_workflow() {
  local workflow=$1
  local job=$2

  echo -e "${BLUE}${BOLD}Running GitHub Actions workflow: $workflow${NC}"
  echo ""

  check_docker

  # Build act command
  local act_cmd="act"

  # Determine event type based on workflow
  if [ "$workflow" = "non-main" ]; then
    act_cmd="$act_cmd push"
    workflow_file=".github/workflows/non-main.yml"
  elif [ "$workflow" = "main" ]; then
    act_cmd="$act_cmd push"
    workflow_file=".github/workflows/main.yml"
  else
    echo -e "${RED}Unknown workflow: $workflow${NC}"
    show_usage
  fi

  # Add workflow file
  act_cmd="$act_cmd -W $workflow_file"

  # Add specific job if provided
  if [ -n "$job" ]; then
    echo -e "${YELLOW}Running specific job: $job${NC}"
    act_cmd="$act_cmd -j $job"
  fi

  # Add flags for better output
  # Use medium image (much smaller/faster than full-latest)
  act_cmd="$act_cmd --container-architecture linux/amd64"
  act_cmd="$act_cmd -P ubuntu-latest=catthehacker/ubuntu:act-latest"
  act_cmd="$act_cmd --verbose"

  echo -e "${BLUE}Command: $act_cmd${NC}"
  echo ""

  # Run act
  eval "$act_cmd"
}

# Map friendly job names to actual job IDs
map_job_name() {
  local job=$1

  case "$job" in
    python-styling)
      echo "python_checks"
      ;;
    python-unit)
      echo "python_checks"
      ;;
    ts-eslint)
      echo "typescript_checks"
      ;;
    ts-prettier)
      echo "typescript_checks"
      ;;
    ts-stylelint)
      echo "typescript_checks"
      ;;
    ts-typecheck)
      echo "typescript_checks"
      ;;
    ts-unit)
      echo "typescript_checks"
      ;;
    ts-storybook-build)
      echo "typescript_checks"
      ;;
    ts-storybook-test)
      echo "typescript_checks"
      ;;
    semgrep)
      echo "frontend_security"
      ;;
    docs)
      echo "docs_build"
      ;;
    *)
      echo "$job"
      ;;
  esac
}

# Main
main() {
  local workflow="${1:-}"
  local job="${2:-}"

  if [ -z "$workflow" ] || [ "$workflow" = "-h" ] || [ "$workflow" = "--help" ]; then
    show_usage
  fi

  # Map friendly job name to actual job ID
  if [ -n "$job" ]; then
    job=$(map_job_name "$job")
  fi

  run_workflow "$workflow" "$job"
}

main "$@"
