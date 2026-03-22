#!/bin/bash
set -euo pipefail

# Load dev environment guard rails
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=dev-scripts/_guard.sh
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_guard.sh"

# Seed teaching data for local development
# Creates: teaching organisation, educator + learner users, sample question bank
# Requires: curl, jq, docker

# Enable debug mode with: DEBUG=1 ./script.sh
DEBUG="${DEBUG:-0}"

API_BASE="${API_BASE:-http://localhost/api}"
COOKIE_JAR=$(mktemp)
EDUCATOR_COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$EDUCATOR_COOKIE_JAR"' EXIT

# Colours
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

error() { echo -e "${RED}ERROR: $1${NC}" >&2; exit 1; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
info() { echo -e "${YELLOW}→ $1${NC}"; }
debug() {
    if [ "$DEBUG" = "1" ]; then
        echo -e "${YELLOW}[DEBUG] $1${NC}" >&2
    fi
}

# Helper: make an authenticated API call
api_call() {
    local method="$1"
    local path="$2"
    local data="${3:-}"
    local jar="${4:-$COOKIE_JAR}"

    local csrf_token
    csrf_token=$(grep XSRF-TOKEN "$jar" | awk '{print $7}')

    local args=(-s -b "$jar" -w "\n%{http_code}")
    args+=(-X "$method")
    args+=(-H "Content-Type: application/json")
    if [ -n "$csrf_token" ]; then
        args+=(-H "X-CSRF-Token: $csrf_token")
    fi
    if [ -n "$data" ]; then
        args+=(-d "$data")
    fi

    curl "${args[@]}" "${API_BASE}${path}"
}

# Helper: parse response (body + status code)
parse_response() {
    local response="$1"
    HTTP_CODE=$(echo "$response" | tail -n1)
    RESPONSE_BODY=$(echo "$response" | sed '$d')
}

# ──────────────────────────────
# Prerequisites
# ──────────────────────────────

if [ -z "${BASH_VERSION:-}" ]; then
    error "This script requires bash"
fi
command -v curl >/dev/null 2>&1 || error "curl is required"
command -v jq >/dev/null 2>&1 || error "jq is required (brew install jq)"
command -v docker >/dev/null 2>&1 || error "docker is required"

echo ""
echo "=== Seed Teaching Data ==="
echo ""

# Check backend is running
info "Checking backend is running..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$API_BASE/auth/me" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "000" ]; then
    error "Backend is not running at $API_BASE\nRun: just start-dev"
fi
success "Backend is running"
echo ""

# ──────────────────────────────
# Step 1: Login as admin
# ──────────────────────────────

info "Log in as an admin/superadmin user to create the teaching data."
read -r -p "Admin username: " ADMIN_USERNAME
read -r -s -p "Admin password: " ADMIN_PASSWORD
echo ""

set +e
LOGIN_RESPONSE=$(curl -s -c "$COOKIE_JAR" -w "\n%{http_code}" \
    -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")
set -e

parse_response "$LOGIN_RESPONSE"
if [ "$HTTP_CODE" != "200" ]; then
    error "Login failed (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi
success "Logged in as $ADMIN_USERNAME"

# Verify admin permissions
USER_INFO=$(curl -s -b "$COOKIE_JAR" "$API_BASE/auth/me")
PERMISSIONS=$(echo "$USER_INFO" | jq -r '.system_permissions // empty')
if [ "$PERMISSIONS" != "admin" ] && [ "$PERMISSIONS" != "superadmin" ]; then
    error "User $ADMIN_USERNAME is not admin/superadmin (has: ${PERMISSIONS:-none})"
fi
success "User has $PERMISSIONS permissions"
echo ""

# ──────────────────────────────
# Step 2: Create teaching organisation
# ──────────────────────────────

info "Creating teaching organisation..."
parse_response "$(api_call POST /organizations '{"name":"Teaching Hospital","type":"teaching","location":"London"}')"

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
    ORG_ID=$(echo "$RESPONSE_BODY" | jq -r '.id')
    success "Created organisation: Teaching Hospital (ID: $ORG_ID)"
elif [ "$HTTP_CODE" = "409" ]; then
    info "Organisation may already exist, checking..."
    parse_response "$(api_call GET /organizations)"
    ORG_ID=$(echo "$RESPONSE_BODY" | jq -r '.organizations[] | select(.name=="Teaching Hospital") | .id')
    if [ -z "$ORG_ID" ]; then
        error "Could not find or create Teaching Hospital organisation"
    fi
    success "Found existing organisation (ID: $ORG_ID)"
else
    error "Failed to create organisation (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# ──────────────────────────────
# Step 3: Enable teaching feature
# ──────────────────────────────

info "Enabling teaching feature on organisation $ORG_ID..."
parse_response "$(api_call PUT "/organizations/${ORG_ID}/features/teaching" '{"enabled":true}')"

if [ "$HTTP_CODE" = "200" ]; then
    STATUS=$(echo "$RESPONSE_BODY" | jq -r '.status')
    success "Teaching feature: $STATUS"
else
    error "Failed to enable teaching feature (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# ──────────────────────────────
# Step 4: Create educator user
# ──────────────────────────────

EDUCATOR_USERNAME="educator"
EDUCATOR_EMAIL="educator@teaching.local"
EDUCATOR_PASSWORD="educator123"

info "Creating educator user..."
parse_response "$(api_call POST /users "{
    \"name\": \"Dr Sarah Educator\",
    \"username\": \"$EDUCATOR_USERNAME\",
    \"email\": \"$EDUCATOR_EMAIL\",
    \"password\": \"$EDUCATOR_PASSWORD\",
    \"base_profession\": \"educator\",
    \"system_permissions\": \"staff\"
}")"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    EDUCATOR_ID=$(echo "$RESPONSE_BODY" | jq -r '.id // .user_id')
    success "Created educator user (ID: $EDUCATOR_ID)"
elif echo "$RESPONSE_BODY" | jq -e '.detail' 2>/dev/null | grep -qi "already exists"; then
    info "Educator user already exists, looking up..."
    parse_response "$(api_call GET /users)"
    EDUCATOR_ID=$(echo "$RESPONSE_BODY" | jq -r '.users[] | select(.username=="educator") | .id')
    if [ -z "$EDUCATOR_ID" ]; then
        error "Could not find educator user"
    fi
    success "Found existing educator user (ID: $EDUCATOR_ID)"
else
    error "Failed to create educator (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# ──────────────────────────────
# Step 5: Create learner user
# ──────────────────────────────

LEARNER_USERNAME="learner"
LEARNER_EMAIL="learner@teaching.local"
LEARNER_PASSWORD="learner123"

info "Creating learner user..."
parse_response "$(api_call POST /users "{
    \"name\": \"Alex Learner\",
    \"username\": \"$LEARNER_USERNAME\",
    \"email\": \"$LEARNER_EMAIL\",
    \"password\": \"$LEARNER_PASSWORD\",
    \"base_profession\": \"learner\",
    \"system_permissions\": \"staff\"
}")"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    LEARNER_ID=$(echo "$RESPONSE_BODY" | jq -r '.id // .user_id')
    success "Created learner user (ID: $LEARNER_ID)"
elif echo "$RESPONSE_BODY" | jq -e '.detail' 2>/dev/null | grep -qi "already exists"; then
    info "Learner user already exists, looking up..."
    parse_response "$(api_call GET /users)"
    LEARNER_ID=$(echo "$RESPONSE_BODY" | jq -r '.users[] | select(.username=="learner") | .id')
    if [ -z "$LEARNER_ID" ]; then
        error "Could not find learner user"
    fi
    success "Found existing learner user (ID: $LEARNER_ID)"
else
    error "Failed to create learner (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# ──────────────────────────────
# Step 6: Add users to organisation
# ──────────────────────────────

info "Adding educator to organisation..."
parse_response "$(api_call POST "/organizations/${ORG_ID}/staff" "{\"user_id\":$EDUCATOR_ID}")"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    success "Educator added to organisation"
elif [ "$HTTP_CODE" = "409" ]; then
    success "Educator already in organisation"
else
    error "Failed to add educator (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

info "Adding learner to organisation..."
parse_response "$(api_call POST "/organizations/${ORG_ID}/staff" "{\"user_id\":$LEARNER_ID}")"
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    success "Learner added to organisation"
elif [ "$HTTP_CODE" = "409" ]; then
    success "Learner already in organisation"
else
    error "Failed to add learner (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# ──────────────────────────────
# Step 7: Verify question bank is mounted
# ──────────────────────────────

BANK_ID="colonoscopy-optical-diagnosis-test"

info "Checking question bank is mounted in container..."
if docker exec quill_backend test -d "/question-banks/$BANK_ID"; then
    success "Question bank '$BANK_ID' found at /question-banks/$BANK_ID"
else
    error "Question bank not found at /question-banks/$BANK_ID\n" \
          "Make sure you have cloned quill-question-bank into question-bank/\n" \
          "  Run: just question-bank-clone\n" \
          "Then restart: just start-dev b"
fi

# ──────────────────────────────
# Step 8: Login as educator and sync items
# ──────────────────────────────

info "Logging in as educator to sync question bank..."
set +e
LOGIN_RESPONSE=$(curl -s -c "$EDUCATOR_COOKIE_JAR" -w "\n%{http_code}" \
    -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$EDUCATOR_USERNAME\",\"password\":\"$EDUCATOR_PASSWORD\"}")
set -e

parse_response "$LOGIN_RESPONSE"
if [ "$HTTP_CODE" != "200" ]; then
    error "Educator login failed (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi
success "Logged in as educator"

info "Syncing question bank..."
parse_response "$(api_call POST /teaching/items/sync "{\"bank_id\":\"$BANK_ID\"}" "$EDUCATOR_COOKIE_JAR")"

if [ "$HTTP_CODE" = "200" ]; then
    SYNC_STATUS=$(echo "$RESPONSE_BODY" | jq -r '.status')
    ITEMS_CREATED=$(echo "$RESPONSE_BODY" | jq -r '.items_created // 0')
    ITEMS_UPDATED=$(echo "$RESPONSE_BODY" | jq -r '.items_updated // 0')
    success "Sync $SYNC_STATUS: $ITEMS_CREATED created, $ITEMS_UPDATED updated"
else
    error "Sync failed (HTTP $HTTP_CODE): $RESPONSE_BODY"
fi

# ──────────────────────────────
# Step 9: Publish all items (direct DB update via container)
# ──────────────────────────────

info "Publishing all synced items..."
docker exec quill_backend python -c "
import os, sys
sys.path.insert(0, '/app')
os.environ['BACKEND_ENV'] = os.environ.get('BACKEND_ENV', 'development')
from app.db import SessionLocal
from app.features.teaching.models import QuestionBankItem
db = SessionLocal()
try:
    items = db.query(QuestionBankItem).filter(
        QuestionBankItem.question_bank_id == '$BANK_ID',
        QuestionBankItem.status == 'draft',
    ).all()
    for item in items:
        item.status = 'published'
    db.commit()
    print(f'Published {len(items)} items')
except Exception as e:
    db.rollback()
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
finally:
    db.close()
"
success "All items published"

# ──────────────────────────────
# Summary
# ──────────────────────────────

echo ""
echo "=== Teaching Seed Data Complete ==="
echo ""
echo "Organisation: Teaching Hospital (ID: $ORG_ID)"
echo "Feature:      teaching (enabled)"
echo "Question bank: $BANK_ID (synced and published)"
echo ""
echo "Users created:"
echo "  Educator: $EDUCATOR_USERNAME / $EDUCATOR_PASSWORD (base_profession: educator)"
echo "  Learner:  $LEARNER_USERNAME / $LEARNER_PASSWORD (base_profession: learner)"
echo ""
echo "To take a test assessment, log in as '$LEARNER_USERNAME' and navigate to /teaching"
