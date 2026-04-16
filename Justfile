set shell := ["bash", "-c"]


default:
    just --list


initialise:= 'set -euxo pipefail
    initialise() {
        # Clear the terminal window title on exit
        echo -ne "\033]0; \007"
    }
    trap initialise EXIT
    just _terminal-description'


_terminal-description message=" ":
    echo -ne "\033]0;{{message}}\007"


alias aj := abbreviate-just
# Set up the description for terminal windows
abbreviate-just:
    #!/usr/bin/env bash
    {{initialise}} abbreviate-just
    alias_definition="alias j='just'"

    if grep -Fxq "$alias_definition" ~/.zshrc
    then
        echo "Alias already exists in ~/.zshrc"
    else
        echo "$alias_definition" >> ~/.zshrc
        echo "Alias added to ~/.zshrc"
    fi

    echo "Please run the following command to apply the changes to this terminal:"
    echo "source ~/.zshrc"


alias cu := create-user
# Create a new user in the database
create-user:
    #!/usr/bin/env bash
    {{initialise}} "create-user"
    docker exec -it quill_backend sh -lc "cd scripts && python create_user.py"


alias csu := create-super-user
# Create a superadmin user locally (for dev setup)
create-super-user:
    #!/usr/bin/env bash
    {{initialise}} "create-super-user"
    docker exec -it quill_backend sh -lc "cd scripts && python create_superuser.py"


alias cur := create-user-with-role
# Create a new user with role assignment (supports Clinician role)
create-user-with-role:
    #!/usr/bin/env bash
    {{initialise}} "create-user-with-role"
    docker exec -it quill_backend sh -lc "cd scripts && python create_user_with_role.py"


alias d := docs
# Open the documentation in the browser
docs:
    #!/usr/bin/env bash
    {{initialise}} "docs"
    # Copy prompts to docs for inclusion in MkDocs build
    mkdir -p docs/docs/llm/prompts
    cp -r prompts/* docs/docs/llm/prompts/
    cd frontend
    yarn docs:build
    yarn storybook:build
    cd ../backend
    poetry run python scripts/dump_openapi.py --dev
    poetry run mkdocs serve -f ../docs/mkdocs.yml & sleep 2
    cd ..
    open http://127.0.0.1:8000


alias dds := docker-daemon-start
# Start the Docker daemon (Mac only)
docker-daemon-start:
    #!/usr/bin/env bash
    {{initialise}} "docker-daemon-start"
    open /Applications/Docker.app
    while ! docker system info > /dev/null 2>&1; do
        echo "Waiting for Docker to start..."
        sleep 1
    done
    echo "Docker is running."


alias du := db-users
# Show the database users
db-users:
    #!/usr/bin/env bash
    {{initialise}} "db-users"
    docker compose -f compose.dev.yml exec database psql -U quill -d quill -c "\d users"


alias eb := enter-backend
# Enter the backend container shell
enter-backend:
    #!/usr/bin/env bash
    {{initialise}} "enter-backend"
    docker exec -it quill_backend /bin/sh


alias ef := enter-frontend
# Enter the frontend container shell
enter-frontend:
    #!/usr/bin/env bash
    {{initialise}} "enter-frontend"
    docker exec -it quill_frontend /bin/sh


alias fu := frontend-update
# Update frontend dependencies with yarn up
frontend-update:
    #!/usr/bin/env bash
    {{initialise}} "frontend-update"
    cd frontend
    yarn up


alias h32 := hex-32
# Generate a random 32 character hex string
hex-32:
    #!/usr/bin/env bash
    {{initialise}} "hex-32"
    openssl rand -hex 32


alias i := initialise-repo
# Initialise the repository (run this first)
initialise-repo:
    #!/usr/bin/env bash
    {{initialise}} "initialise"
    pre-commit install
    yarn install
    just aj


alias kp := kill-port-8000
# Kill any processes listening on port 8000
kill-port-8000:
    #!/usr/bin/env bash
    {{initialise}} "kill-port-8000"
    lsof -i :8000


alias qbc := question-bank-clone
# Clone the question bank repo into question-bank/
question-bank-clone:
    #!/usr/bin/env bash
    {{initialise}} "question-bank-clone"
    if [ -d "question-bank/.git" ]; then
        echo "question-bank/ already exists — use 'just question-bank-pull' to update"
        exit 1
    fi
    git clone https://github.com/bailey-medics/quill-question-bank.git question-bank
    echo "Cloned into question-bank/"


alias qbpu := question-bank-pull
# Pull the latest question bank content
question-bank-pull:
    #!/usr/bin/env bash
    {{initialise}} "question-bank-pull"
    if [ ! -d "question-bank/.git" ]; then
        echo "question-bank/ not found — run 'just question-bank-clone' first"
        exit 1
    fi
    git -C question-bank pull


alias qbps := question-bank-push
# Push question bank changes
question-bank-push:
    #!/usr/bin/env bash
    {{initialise}} "question-bank-push"
    if [ ! -d "question-bank/.git" ]; then
        echo "question-bank/ not found — run 'just question-bank-clone' first"
        exit 1
    fi
    git -C question-bank push


alias sdt := seed-teaching
# Seed teaching data (org, users, feature, sync) for a fresh DB
seed-teaching:
    #!/usr/bin/env bash
    {{initialise}} "seed-teaching"
    ./dev-scripts/seed-teaching-data.sh


alias syt := sync-teaching
# Sync all local question banks into the DB (no restart needed)
sync-teaching:
    #!/usr/bin/env bash
    {{initialise}} "sync-teaching"
    ./dev-scripts/sync-teaching-data.sh


alias pcert := preview-certificate
# Generate a preview certificate PDF and open it (bank: colonoscopy-optical-diagnosis-test)
preview-certificate bank="colonoscopy-optical-diagnosis-test":
    #!/usr/bin/env bash
    {{initialise}} "preview-certificate"
    docker exec quill_backend python -m scripts.preview_certificate --bank "{{bank}}"
    docker cp quill_backend:/tmp/certificate-preview.pdf .
    open certificate-preview.pdf


alias m := migrate
# Run the database migrations
migrate message:
    #!/usr/bin/env bash
    {{initialise}} "migrate - {{message}}"
    docker exec quill_backend sh -lc '
        set -e
        alembic upgrade head &&
        alembic revision --autogenerate -m "$AL_MSG" &&
        alembic upgrade head
    ' AL_MSG='{{message}}'


alias pc := pre-commit
# Run pre-commit checks
pre-commit:
    #!/usr/bin/env bash
    {{initialise}} "pre-commit"
    pre-commit run --all-files


alias pb := prune-branches
# Remove local branches whose remote tracking branch is gone
prune-branches:
    #!/usr/bin/env bash
    {{initialise}} "prune-branches"
    git fetch --prune
    GONE=$(git branch -vv | grep ': gone]' | awk '{print $1}' || true)
    if [ -z "$GONE" ]; then
        echo "No stale branches to remove."
    else
        echo "$GONE" | xargs git branch -d
    fi


alias rb := rebase
# Rebase current feature branch onto an up-to-date main
rebase:
    #!/usr/bin/env bash
    {{initialise}} "rebase"
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$BRANCH" = "main" ]; then
        echo "Already on main — switch to a feature branch first"
        exit 1
    fi
    echo "Updating main and rebasing $BRANCH onto it..."
    git checkout main
    git pull
    git checkout "$BRANCH"
    git rebase main
    git push --force-with-lease


alias pi := poetry-install
# Install the poetry dependencies
poetry-install:
    #!/usr/bin/env bash
    {{initialise}} "poetry-install"
    cd backend
    poetry lock
    poetry install


alias pop := poetry-path
# Show the poetry path
poetry-path:
    #!/usr/bin/env bash
    {{initialise}} "poetry-path"
    cd backend
    poetry env info -p
    echo "To activate the poetry environment, open the Command Palette (Cmd+Shift+P) type in 'Python: Select Interpreter' and then select 'Enter interpreter path's. Then paste the path above."


alias tf-gh := terraform-github
# Apply GitHub rulesets via Terraform (branch naming, protection rules)
terraform-github:
    #!/usr/bin/env bash
    {{initialise}} "terraform-github"
    set -euo pipefail
    cd infra/github
    export GITHUB_TOKEN=$(gh auth token)
    terraform init -input=false
    terraform plan -var-file=terraform.tfvars
    read -rp "Apply these changes? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        terraform apply -var-file=terraform.tfvars -auto-approve
    else
        echo "Aborted."
    fi


alias pub := public-pages
# Run public pages dev server
public-pages:
    #!/usr/bin/env bash
    {{initialise}} "public-pages"
    cd frontend
    yarn workspace public-pages dev


alias sb := storybook
# Run storybook dev server
storybook:
    #!/usr/bin/env bash
    {{initialise}} "storybook"
    cd frontend
    yarn storybook

alias sbt := storybook-test
# Run storybook tests (requires storybook to be running)
storybook-test:
    #!/usr/bin/env bash
    {{initialise}} "storybook-test"
    cd frontend
    yarn storybook:test

alias sbtci := storybook-test-ci
# Run storybook tests in CI mode (starts storybook, runs tests, stops storybook)
storybook-test-ci:
    #!/usr/bin/env bash
    {{initialise}} "storybook-test-ci"
    cd frontend
    yarn storybook:test:ci


alias sdc := show-dev-containers
# Show the running dev containers
show-dev-containers:
    #!/usr/bin/env bash
    {{initialise}} "show-dev-containers"
    docker compose -f compose.dev.yml ps


alias sd := start-dev
# Start the dev app (build: 'b' will also build the images)
start-dev build="":
    #!/usr/bin/env bash
    {{initialise}} "start-dev"

    just _start-docker-daemon
    echo "Access the frontend at: http://$(ipconfig getifaddr en0)"

    if [ "{{build}}" = "b" ]; then \
        COMPOSE_PROFILES=clinical docker compose -f compose.dev.yml down
        docker volume rm -f quillmedical_frontend_node_modules >/dev/null 2>&1 || true
        cd frontend && yarn install && cd ..
        cd backend && poetry lock && poetry install && cd ..
        COMPOSE_PROFILES=clinical docker compose -f compose.dev.yml up --build --pull missing; \
    else \
        COMPOSE_PROFILES=clinical docker compose -f compose.dev.yml up; \
    fi


# Check if Docker daemon is running, start Docker Desktop if not (macOS)
_start-docker-daemon:
    #!/usr/bin/env bash
    echo "Checking Docker daemon status..."

    # Check if Docker daemon is responsive
    if docker info >/dev/null 2>&1; then
        echo "Docker daemon is running"
        exit 0
    fi

    echo "Docker daemon is not running"

    # Check if we're on macOS and Docker Desktop is available
    if [[ "$OSTYPE" == "darwin"* ]] && [[ -d "/Applications/Docker.app" ]]; then
        echo "Starting Docker Desktop..."
        open -a Docker

        # Wait for Docker daemon to start (with timeout)
        echo "Waiting for Docker daemon to start..."
        for i in {1..60}; do
            if docker info >/dev/null 2>&1; then
                echo "Docker daemon is now running (took ${i} seconds)"
                exit 0
            fi
            echo -n "."
            sleep 1
        done

        echo ""
        echo "Timeout: Docker daemon did not start within 60 seconds"
        echo "Please check Docker Desktop manually"
        exit 1
    else
        echo "Docker Desktop not found or not on macOS"
        echo "Please start Docker manually or install Docker Desktop"
        exit 1
    fi

alias sp := start-prod
# Start the dev app (build: 'b' will also build the images)
start-prod build="":
    #!/usr/bin/env bash
    {{initialise}} "start-prod"
    if [ "{{build}}" = "b" ]; then \
        docker compose -f compose.yml -f compose.prod.yml up --build --pull missing; \
    else \
        docker compose -f compose.yml -f compose.prod.yml up; \
    fi

alias st := start-teaching
# Start dev without clinical services (FHIR/EHRbase) for teaching work
start-teaching build="":
    #!/usr/bin/env bash
    {{initialise}} "start-teaching"

    just _start-docker-daemon
    echo "Access the frontend at: http://$(ipconfig getifaddr en0)"
    echo "Clinical services (FHIR/EHRbase) disabled"

    if [ "{{build}}" = "b" ]; then \
        docker compose -f compose.dev.yml down
        docker volume rm -f quillmedical_frontend_node_modules >/dev/null 2>&1 || true
        cd frontend && yarn install && cd ..
        cd backend && poetry lock && poetry install && cd ..
        CLINICAL_SERVICES_ENABLED=false docker compose -f compose.dev.yml up --build --pull missing; \
    else \
        CLINICAL_SERVICES_ENABLED=false docker compose -f compose.dev.yml up; \
    fi

alias sc := stop
# Stop the containers
stop:
    #!/usr/bin/env bash
    {{initialise}} "stop"
    COMPOSE_PROFILES=clinical docker compose -f compose.dev.yml down


alias ub := unit-tests-backend
# Run the backend unit tests
unit-tests-backend:
    #!/usr/bin/env bash
    {{initialise}} "unit-tests-backend"
    docker exec quill_backend sh -lc "pytest -q -m 'not integration'"


alias uf := unit-tests-frontend
# Run the frontend unit tests
unit-tests-frontend:
    #!/usr/bin/env bash
    {{initialise}} "unit-tests-frontend"
    docker exec quill_frontend sh -lc "yarn unit-test:run"


alias vk := vapid-key
# Generate a new VAPID key pair
vapid-key:
    #!/usr/bin/env bash
    {{initialise}} "vapid-key"
    cd frontend
    yarn dlx web-push generate-vapid-keys


alias yi := yarn-install
# Run yarn install in the frontend container
yarn-install:
    #!/usr/bin/env bash
    {{initialise}} "yarn-install"
    cd frontend
    yarn install


# ── Cloud Run Admin Job (remote environments) ──────────────────────────

_gcp_env_project env:
    #!/usr/bin/env bash
    case "{{env}}" in
        staging)  echo "quill-medical-staging"  ;;
        teaching) echo "quill-medical-teaching" ;;
        prod)     echo "quill-medical-production" ;;
        *)        echo "ERROR: env must be staging, teaching, or prod" >&2; exit 1 ;;
    esac


alias ba := build-admin
# Build and push the admin Docker image to a remote environment (staging/teaching/prod)
build-admin env:
    #!/usr/bin/env bash
    {{initialise}} "build-admin ({{env}})"
    set -euo pipefail

    PROJECT=$(just _gcp_env_project "{{env}}")
    REGION="europe-west2"
    REGISTRY="${REGION}-docker.pkg.dev"
    IMAGE="${REGISTRY}/${PROJECT}/quill/admin:latest"

    echo "Building admin image for ${PROJECT}..."
    gcloud auth configure-docker "$REGISTRY" --quiet

    docker build \
        --target admin \
        --platform linux/amd64 \
        -t "$IMAGE" \
        -f backend/Dockerfile \
        .

    echo "Pushing ${IMAGE}..."
    docker push "$IMAGE"
    echo "✓ Admin image pushed to ${IMAGE}"

    # Deploy the Cloud Run Job (creates if new, updates if existing)
    # Look up the Cloud SQL auth database private IP
    echo "Looking up database connection..."
    AUTH_DB_HOST=$(gcloud sql instances describe "quill-auth-{{env}}" \
        --project="$PROJECT" \
        --format='value(ipAddresses[0].ipAddress)')

    echo "Deploying Cloud Run Job..."
    gcloud run jobs deploy "quill-admin-{{env}}" \
        --project="$PROJECT" \
        --region="$REGION" \
        --image="$IMAGE" \
        --vpc-connector="quill-vpc-cx-{{env}}" \
        --vpc-egress=private-ranges-only \
        --max-retries=0 \
        --task-timeout=300s \
        --set-env-vars "AUTH_DB_HOST=${AUTH_DB_HOST},AUTH_DB_NAME=quill_auth,AUTH_DB_USER=quill" \
        --set-secrets "AUTH_DB_PASSWORD=auth-db-password:latest,JWT_SECRET=jwt-secret:latest" \
        --quiet
    echo "✓ Cloud Run Job deployed"


alias cs := create-superadmin
# Create a superadmin on a remote environment via Cloud Run Job
create-superadmin env:
    #!/usr/bin/env bash
    {{initialise}} "create-superadmin ({{env}})"
    set -euo pipefail

    PROJECT=$(just _gcp_env_project "{{env}}")
    REGION="europe-west2"

    echo "Create superadmin on ${PROJECT}"
    echo "─────────────────────────────────"
    read -rp "Username: " username
    read -rp "Email: " email
    read -rsp "Password: " password
    echo

    gcloud run jobs execute "quill-admin-{{env}}" \
        --project="$PROJECT" \
        --region="$REGION" \
        --update-env-vars "ADMIN_ACTION=create-superadmin,ADMIN_USERNAME=${username},ADMIN_EMAIL=${email},ADMIN_PASSWORD=${password}" \
        --wait


alias up := update-permissions-remote
# Update a user's system permissions on a remote environment
update-permissions-remote env:
    #!/usr/bin/env bash
    {{initialise}} "update-permissions ({{env}})"
    set -euo pipefail

    PROJECT=$(just _gcp_env_project "{{env}}")
    REGION="europe-west2"

    echo "Update permissions on ${PROJECT}"
    echo "─────────────────────────────────"
    read -rp "Username: " username
    echo "Permission levels: patient, staff, admin, superadmin"
    read -rp "Permission: " permission

    gcloud run jobs execute "quill-admin-{{env}}" \
        --project="$PROJECT" \
        --region="$REGION" \
        --update-env-vars "ADMIN_ACTION=update-permissions,ADMIN_USERNAME=${username},ADMIN_PERMISSION=${permission}" \
        --wait


alias ar := add-role-remote
# Add a role to a user on a remote environment
add-role-remote env:
    #!/usr/bin/env bash
    {{initialise}} "add-role ({{env}})"
    set -euo pipefail

    PROJECT=$(just _gcp_env_project "{{env}}")
    REGION="europe-west2"

    echo "Add role on ${PROJECT}"
    echo "─────────────────────────────────"
    read -rp "Username: " username
    echo "Roles: System Administrator, Clinical Administrator, Clinician,"
    echo "       Clinical Support Staff, Patient, Patient Advocate"
    read -rp "Role: " role

    gcloud run jobs execute "quill-admin-{{env}}" \
        --project="$PROJECT" \
        --region="$REGION" \
        --update-env-vars "ADMIN_ACTION=add-role,ADMIN_USERNAME=${username},ADMIN_ROLE=${role}" \
        --wait
