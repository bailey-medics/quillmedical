#!/usr/bin/env bash
set -euo pipefail

# Load dev environment guard rails
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev-scripts/_guard.sh
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_guard.sh"

# Enable debug mode if DEBUG=1
DEBUG="${DEBUG:-0}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}✗ $1${NC}" >&2
    exit 1
}

success() {
    echo -e "${GREEN}$1${NC}"
}

info() {
    echo -e "${YELLOW}→ $1${NC}"
}

debug() {
    if [ "$DEBUG" = "1" ]; then
        echo -e "${YELLOW}[DEBUG] $1${NC}" >&2
    fi
}

# Check if running with correct shell
if [ -z "${BASH_VERSION:-}" ]; then
    echo -e "${RED}Error: This script requires bash, not sh${NC}"
    echo "Please run: ./dev-scripts/delete-all-patient-data.sh"
    exit 1
fi

# Check dependencies
command -v docker >/dev/null 2>&1 || error "docker is required but not installed"

echo ""
echo "=== Quill Medical - Delete All Patient Data ==="
echo ""
echo -e "${RED}WARNING: This will DELETE ALL patients from the FHIR server!${NC}"
echo -e "${RED}This action cannot be undone.${NC}"
echo ""
read -r -p "Are you sure you want to continue? (type 'yes' to confirm): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

echo ""

# Check if backend container is running
info "Checking if backend container is running..."
if ! docker ps --filter "name=quill_backend" --format "{{.Names}}" 2>/dev/null | grep -q "quill_backend"; then
    error "Backend container is not running\nPlease start the dev environment: just start-dev"
fi
success "✓ Backend container is running"
echo ""

# Step 1: Get list of all patients by executing Python in container
info "Fetching list of all patients..."

PATIENT_IDS=$(docker exec quill_backend python3 -c "
import sys
sys.path.insert(0, '/app')
from app.fhir_client import list_fhir_patients

try:
    patients = list_fhir_patients()
    patient_ids = [p.get('id') for p in patients if p.get('id')]
    for pid in patient_ids:
        print(pid)
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1)

if echo "$PATIENT_IDS" | grep -q "ERROR:"; then
    error "Failed to fetch patients: $PATIENT_IDS"
fi

if [ -z "$PATIENT_IDS" ]; then
    success "✓ No patients found to delete"
    exit 0
fi

PATIENT_COUNT=$(echo "$PATIENT_IDS" | wc -l | tr -d ' ')
success "✓ Found $PATIENT_COUNT patients to delete"
echo ""

# Step 2: Delete each patient by executing Python in container
info "Deleting patients..."
echo ""

DELETED_COUNT=0
FAILED_COUNT=0

while IFS= read -r PATIENT_ID; do
    if [ -z "$PATIENT_ID" ]; then
        continue
    fi

    info "Deleting patient: $PATIENT_ID"

    DELETE_RESULT=$(docker exec quill_backend python3 -c "
import sys
sys.path.insert(0, '/app')
from app.fhir_client import delete_fhir_patient

try:
    success = delete_fhir_patient('$PATIENT_ID')
    if success:
        print('SUCCESS')
    else:
        print('NOT_FOUND')
except Exception as e:
    print(f'ERROR: {e}', file=sys.stderr)
" 2>&1)

    if [ "$DELETE_RESULT" = "SUCCESS" ]; then
        success "  ✓ Deleted: $PATIENT_ID"
        DELETED_COUNT=$((DELETED_COUNT + 1))
    elif [ "$DELETE_RESULT" = "NOT_FOUND" ]; then
        echo -e "${RED}  ✗ Failed: $PATIENT_ID (not found)${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    else
        echo -e "${RED}  ✗ Failed: $PATIENT_ID ($DELETE_RESULT)${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
done <<< "$PATIENT_IDS"

echo ""
echo "=== Summary ==="
echo "Deleted: $DELETED_COUNT patients"
if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED_COUNT patients${NC}"
    exit 1
fi

echo ""
success "✓ ✓ All patient data has been deleted!"
