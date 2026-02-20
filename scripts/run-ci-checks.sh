#!/usr/bin/env bash
set -e

# Run all CI checks from non-main.yml workflow locally
# This script mimics the GitHub Actions workflow to help debug CI issues
# Usage: ./scripts/run-ci-checks.sh [check_name]
#   No args: Run all checks
#   check_name: Run specific check (python-styling, python-unit, eslint, prettier, etc.)
#
# Note: For running actual GitHub Actions workflows in Docker containers, use:
#   ./scripts/run-github-actions-locally.sh
# That script uses 'act' to run the exact workflows defined in .github/workflows/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Track results
FAILED_CHECKS=()
PASSED_CHECKS=()

# Print section header
print_header() {
  echo ""
  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}${BOLD}  $1${NC}"
  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

# Print result
print_result() {
  local name=$1
  local result=$2
  if [ "$result" = "PASS" ]; then
    echo -e "${GREEN}✓ $name${NC}"
    PASSED_CHECKS+=("$name")
  else
    echo -e "${RED}✗ $name${NC}"
    FAILED_CHECKS+=("$name")
  fi
}

# Run a check and handle errors
run_check() {
  local name=$1
  shift
  echo -e "${YELLOW}Running: $name${NC}"
  if "$@"; then
    print_result "$name" "PASS"
    return 0
  else
    print_result "$name" "FAIL"
    return 1
  fi
}

# ---------- Python Checks ----------
run_python_styling() {
  print_header "Python Styling (pre-commit)"

  # Ensure venv exists
  if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
  fi

  # Ensure pre-commit is installed
  if ! .venv/bin/python -m pip show pre-commit &>/dev/null; then
    echo "Installing pre-commit..."
    .venv/bin/python -m pip install -U pip pre-commit
  fi

  # Warm pre-commit hooks
  .venv/bin/pre-commit install-hooks

  # Run pre-commit
  run_check "python-styling" .venv/bin/pre-commit run --all-files --show-diff-on-failure --color=always
}

run_python_unit() {
  print_header "Python Unit Tests"

  cd backend

  # Ensure Poetry is installed
  if ! command -v poetry &>/dev/null; then
    echo "Installing Poetry..."
    python3 -m pip install --user poetry
  fi

  # Configure Poetry to use in-project venv
  poetry config virtualenvs.in-project true

  # Install dependencies
  echo "Installing backend dependencies..."
  poetry install --with dev --no-interaction --no-ansi

  # Run tests
  run_check "python-unit" poetry run pytest -q -m "not integration and not e2e" --maxfail=1 --disable-warnings

  cd ..
}

run_python_checks() {
  run_python_styling || true
  run_python_unit || true
}

# ---------- TypeScript Checks ----------
ensure_node_deps() {
  cd frontend

  # Check if node_modules exists
  if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies..."
    yarn install --immutable
  fi

  cd ..
}

run_eslint() {
  print_header "ESLint"
  ensure_node_deps
  cd frontend
  run_check "eslint" yarn eslint
  cd ..
}

run_prettier() {
  print_header "Prettier"
  ensure_node_deps
  cd frontend
  run_check "prettier" yarn prettier
  cd ..
}

run_stylelint() {
  print_header "Stylelint"
  ensure_node_deps
  cd frontend
  run_check "stylelint" yarn stylelint
  cd ..
}

run_typecheck() {
  print_header "TypeScript Type Checking"
  ensure_node_deps
  cd frontend
  run_check "typecheck" yarn typecheck:all
  cd ..
}

run_unit_tests() {
  print_header "Frontend Unit Tests"
  ensure_node_deps
  cd frontend
  run_check "unit-tests" yarn unit-test:run
  cd ..
}

run_storybook_build() {
  print_header "Storybook Build"
  ensure_node_deps
  cd frontend

  # Generate types first
  echo "Generating types from YAML..."
  yarn generate:types

  run_check "storybook-build" yarn storybook:build
  cd ..
}

run_storybook_tests() {
  print_header "Storybook Tests"
  ensure_node_deps
  cd frontend

  # Install Playwright if needed
  if [ ! -d "$HOME/.cache/ms-playwright" ]; then
    echo "Installing Playwright browsers..."
    npx playwright install --with-deps chromium
  fi

  run_check "storybook-tests" yarn storybook:test:ci
  cd ..
}

run_typescript_checks() {
  run_eslint || true
  run_prettier || true
  run_stylelint || true
  run_typecheck || true
  run_unit_tests || true
  run_storybook_build || true
  run_storybook_tests || true
}

# ---------- Security Checks ----------
run_semgrep() {
  print_header "Semgrep Security Scan"

  # Install semgrep if not present
  if ! command -v semgrep &>/dev/null; then
    echo "Installing Semgrep via pipx..."
    if ! command -v pipx &>/dev/null; then
      echo "Installing pipx..."
      python3 -m pip install --user pipx
      # Note: You may need to restart your shell or add ~/.local/bin to PATH
    fi
    pipx install semgrep
  fi

  cd frontend
  export SEMGREP_LOG_LEVEL=error
  export SEMGREP_DISABLE_ANALYTICS=1
  export SEMGREP_NO_VERSION_CHECK=1
  run_check "semgrep" semgrep --config .semgrep.yml --error
  cd ..
}

# ---------- Documentation Build ----------
run_docs_build() {
  print_header "Documentation Build"

  # Frontend docs
  echo "Building frontend docs (TypeDoc)..."
  ensure_node_deps
  cd frontend
  yarn generate:types
  yarn docs:build
  cd ..

  # Backend docs
  echo "Building backend docs (MkDocs)..."
  cd backend

  if ! poetry --version &>/dev/null; then
    python3 -m pip install --user poetry
  fi

  poetry config virtualenvs.in-project true
  poetry install --with dev --no-interaction --no-ansi

  # Export OpenAPI
  poetry run python scripts/dump_openapi.py --dev

  cd ..

  # Copy prompts
  mkdir -p docs/docs/llm/prompts
  cp -r .github/prompts/* docs/docs/llm/prompts/

  # Build MkDocs
  cd backend
  run_check "docs-build" poetry run mkdocs build -f ../docs/mkdocs.yml -d ../site
  cd ..
}

# ---------- Print Summary ----------
print_summary() {
  echo ""
  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}${BOLD}  SUMMARY${NC}"
  echo -e "${BLUE}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  if [ ${#PASSED_CHECKS[@]} -gt 0 ]; then
    echo -e "${GREEN}${BOLD}Passed Checks (${#PASSED_CHECKS[@]}):${NC}"
    for check in "${PASSED_CHECKS[@]}"; do
      echo -e "${GREEN}  ✓ $check${NC}"
    done
    echo ""
  fi

  if [ ${#FAILED_CHECKS[@]} -gt 0 ]; then
    echo -e "${RED}${BOLD}Failed Checks (${#FAILED_CHECKS[@]}):${NC}"
    for check in "${FAILED_CHECKS[@]}"; do
      echo -e "${RED}  ✗ $check${NC}"
    done
    echo ""
    echo -e "${RED}${BOLD}Some checks failed!${NC}"
    exit 1
  else
    echo -e "${GREEN}${BOLD}All checks passed! ✓${NC}"
    echo ""
  fi
}

# ---------- Main ----------
show_usage() {
  echo "Usage: $0 [check_name]"
  echo ""
  echo "Available checks:"
  echo "  all                 Run all checks (default)"
  echo "  python              Run all Python checks"
  echo "  python-styling      Run Python pre-commit checks"
  echo "  python-unit         Run Python unit tests"
  echo "  typescript          Run all TypeScript checks"
  echo "  eslint              Run ESLint"
  echo "  prettier            Run Prettier"
  echo "  stylelint           Run Stylelint"
  echo "  typecheck           Run TypeScript type checking"
  echo "  unit-tests          Run frontend unit tests"
  echo "  storybook-build     Build Storybook"
  echo "  storybook-tests     Run Storybook tests"
  echo "  semgrep             Run Semgrep security scan"
  echo "  docs                Build documentation"
  echo ""
  exit 1
}

main() {
  local check="${1:-all}"

  echo -e "${BOLD}CI Checks Runner (mimics non-main.yml workflow)${NC}"

  case "$check" in
    all)
      run_python_checks
      run_typescript_checks
      run_semgrep || true
      run_docs_build || true
      ;;
    python)
      run_python_checks
      ;;
    python-styling)
      run_python_styling
      ;;
    python-unit)
      run_python_unit
      ;;
    typescript)
      run_typescript_checks
      ;;
    eslint)
      run_eslint
      ;;
    prettier)
      run_prettier
      ;;
    stylelint)
      run_stylelint
      ;;
    typecheck)
      run_typecheck
      ;;
    unit-tests)
      run_unit_tests
      ;;
    storybook-build)
      run_storybook_build
      ;;
    storybook-tests)
      run_storybook_tests
      ;;
    semgrep)
      run_semgrep
      ;;
    docs)
      run_docs_build
      ;;
    -h|--help|help)
      show_usage
      ;;
    *)
      echo -e "${RED}Unknown check: $check${NC}"
      echo ""
      show_usage
      ;;
  esac

  print_summary
}

main "$@"
