#!/bin/bash
set -euo pipefail

# Load dev environment guard rails
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev-scripts/_guard.sh
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_guard.sh"

# Script to create 5 random patients via FastAPI API
# Requires: curl, jq (for JSON parsing)

# Enable debug mode with: DEBUG=1 ./script.sh
DEBUG="${DEBUG:-0}"

# Configuration
# Default to Caddy proxy on port 80 (not direct backend on 8000)
API_BASE="${API_BASE:-http://localhost/api}"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Sample data for random generation
FIRST_NAMES=("James" "Mary" "John" "Patricia" "Robert" "Jennifer" "Michael" "Linda" "William" "Barbara" "David" "Elizabeth" "Richard" "Susan" "Joseph" "Jessica" "Thomas" "Sarah" "Christopher" "Karen" "Daniel" "Nancy" "Matthew" "Lisa" "Anthony" "Betty" "Mark" "Margaret" "Donald" "Sandra" "Steven" "Ashley" "Andrew" "Emily" "Joshua" "Kimberly" "Kevin" "Donna" "Brian" "Michelle")

LAST_NAMES=("Smith" "Johnson" "Williams" "Brown" "Jones" "Garcia" "Miller" "Davis" "Rodriguez" "Martinez" "Hernandez" "Lopez" "Gonzalez" "Wilson" "Anderson" "Thomas" "Taylor" "Moore" "Jackson" "Martin" "Lee" "Thompson" "White" "Harris" "Clark" "Lewis" "Robinson" "Walker" "Hall" "Young" "Allen" "King" "Wright" "Scott" "Torres" "Nguyen" "Hill" "Flores" "Green" "Adams")

# Functions
error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    exit 1
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

info() {
    echo -e "${YELLOW}→ $1${NC}"
}

debug() {
    if [ "$DEBUG" = "1" ]; then
        echo -e "${YELLOW}[DEBUG] $1${NC}" >&2
    fi
}

random_element() {
    local arr=("$@")
    local idx=$((RANDOM % ${#arr[@]}))
    echo "${arr[$idx]}"
}

# Generate random date of birth (between 1940 and 2005)
random_dob() {
    local year=$((1940 + RANDOM % 66))  # 1940-2005
    local month
    month=$(printf "%02d" $((1 + RANDOM % 12)))
    local day
    day=$(printf "%02d" $((1 + RANDOM % 28)))  # Avoid Feb 29 issues
    echo "${year}-${month}-${day}"
}

# Generate random gender
random_gender() {
    local genders=("male" "female" "other")
    random_element "${genders[@]}"
}

# Generate random NHS number (10 digits, format: XXX XXX XXXX)
random_nhs_number() {
    printf "%03d%03d%04d" $((RANDOM % 1000)) $((RANDOM % 1000)) $((RANDOM % 10000))
}

# Generate random MRN (hospital medical record number, format: MRN-XXXXXX)
random_mrn() {
    printf "MRN-%06d" $((RANDOM % 1000000))
}

# Check if running with correct shell
if [ -z "${BASH_VERSION:-}" ]; then
    echo -e "${RED}Error: This script requires bash, not sh${NC}"
    echo "Please run: ./dev-scripts/create-5-patients.sh"
    echo "Not: sh dev-scripts/create-5-patients.sh"
    exit 1
fi

# Check dependencies
command -v curl >/dev/null 2>&1 || error "curl is required but not installed"
command -v jq >/dev/null 2>&1 || error "jq is required but not installed (brew install jq)"

# Prompt for credentials
echo ""
echo "=== Quill Medical Patient Creation ==="
echo ""

# Check if backend is running
info "Checking if backend is running..."
# Backend returns 401 for /auth/me when not authenticated, which is expected
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$API_BASE/auth/me" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "000" ]; then
    error "Backend is not running at $API_BASE\nPlease start the dev environment: just start-dev"
fi
success "Backend is running"
echo ""

read -r -p "Username: " USERNAME
read -r -s -p "Password: " PASSWORD
echo ""
echo ""

# Step 1: Login to get authentication cookies
info "Logging in as $USERNAME..."

set +e
LOGIN_RESPONSE=$(curl -s -c "$COOKIE_JAR" -w "\n%{http_code}" \
    -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
CURL_EXIT=$?
set -e

if [ $CURL_EXIT -ne 0 ]; then
    error "Login request failed (curl exit code $CURL_EXIT). Is the backend running?"
fi

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    error "Login failed (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# Extract CSRF token from cookies
CSRF_TOKEN=$(grep XSRF-TOKEN "$COOKIE_JAR" | awk '{print $7}')
if [ -z "$CSRF_TOKEN" ]; then
    error "Failed to extract CSRF token from cookies"
fi

debug "CSRF Token: $CSRF_TOKEN"
success "Login successful"

# Verify user has Clinician role
info "Checking user permissions..."
USER_INFO=$(curl -s -b "$COOKIE_JAR" "$API_BASE/auth/me")
USER_ROLES=$(echo "$USER_INFO" | jq -r '.roles[]' 2>/dev/null | tr '\n' ',' || echo "")
debug "User roles: $USER_ROLES"

if ! echo "$USER_ROLES" | grep -q "Clinician"; then
    error "User $USERNAME does not have 'Clinician' role (has: ${USER_ROLES:-none})\nOnly users with Clinician role can create patients.\nAdd role using: just create-user-with-role (and select option 3: Clinician)"
fi
success "User has required permissions"
echo ""

# Step 2: Create 5 random patients
info "Creating 5 random patients..."
echo ""

CREATED_COUNT=0
FAILED_COUNT=0

for i in {1..5}; do
    # Generate random patient data
    GIVEN_NAME=$(random_element "${FIRST_NAMES[@]}")
    FAMILY_NAME=$(random_element "${LAST_NAMES[@]}")
    DOB=$(random_dob)
    GENDER=$(random_gender)
    NHS_NUMBER=$(random_nhs_number)
    MRN=$(random_mrn)

    # Calculate age from DOB
    BIRTH_YEAR=${DOB:0:4}
    CURRENT_YEAR=$(date +%Y)
    AGE=$((CURRENT_YEAR - BIRTH_YEAR))

    info "[$i/5] Creating patient: $GIVEN_NAME $FAMILY_NAME"
    info "      DOB: $DOB (Age: $AGE), Gender: $GENDER"
    info "      NHS: $NHS_NUMBER, MRN: $MRN"

    # Create patient via API (disable pipefail temporarily to handle errors)
    set +e
    CREATE_RESPONSE=$(curl -s -b "$COOKIE_JAR" -w "\n%{http_code}" \
        -X POST "$API_BASE/patients" \
        -H "Content-Type: application/json" \
        -H "X-CSRF-Token: $CSRF_TOKEN" \
        -d "{\"given_name\":\"$GIVEN_NAME\",\"family_name\":\"$FAMILY_NAME\",\"birth_date\":\"$DOB\",\"gender\":\"$GENDER\",\"nhs_number\":\"$NHS_NUMBER\",\"mrn\":\"$MRN\"}")
    CURL_EXIT=$?
    set -e

    if [ $CURL_EXIT -ne 0 ]; then
        echo -e "${RED}  ✗ Failed: $GIVEN_NAME $FAMILY_NAME (curl failed with exit code $CURL_EXIT)${NC}"
        echo -e "${RED}    Is the backend running? Check http://localhost:8000/api${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
        continue
    fi

    HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
    RESPONSE_BODY=$(echo "$CREATE_RESPONSE" | sed '$d')

    debug "HTTP Code: $HTTP_CODE"
    debug "Response: $RESPONSE_BODY"

    if [ "$HTTP_CODE" = "200" ]; then
        PATIENT_ID=$(echo "$RESPONSE_BODY" | jq -r '.id // .resourceType // "created"' 2>/dev/null || echo "created")
        success "  ✓ Created: $GIVEN_NAME $FAMILY_NAME (ID: $PATIENT_ID)"
        CREATED_COUNT=$((CREATED_COUNT + 1))
    else
        ERROR_MSG=$(echo "$RESPONSE_BODY" | jq -r '.detail // .' 2>/dev/null || echo "$RESPONSE_BODY")
        echo -e "${RED}  ✗ Failed: $GIVEN_NAME $FAMILY_NAME (HTTP $HTTP_CODE)${NC}"
        echo -e "${RED}    Reason: $ERROR_MSG${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
done

echo ""
echo "=== Summary ==="
echo "Created: $CREATED_COUNT patients"
if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED_COUNT patients${NC}"
    echo ""
    echo -e "${YELLOW}Note: Failures might be due to duplicate names or expired auth${NC}"
fi
echo ""

if [ $CREATED_COUNT -eq 5 ]; then
    success "✓ 5 patients have been successfully added!"
    exit 0
elif [ $CREATED_COUNT -gt 0 ]; then
    echo -e "${YELLOW}⚠ Only $CREATED_COUNT patients were created (expected 5)${NC}"
    exit 0
else
    error "No patients were created"
fi
