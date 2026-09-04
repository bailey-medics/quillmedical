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


alias ii := initial-install
# Clone all *-teaching repos into local dirs (safe to re-run)
initial-install:
    #!/usr/bin/env bash
    {{initialise}} "initial-install"
    set -euo pipefail

    ORG="bailey-medics"

    # --- Teaching content repos ---
    DEST="teaching-repos"
    mkdir -p "$DEST"

    echo "Discovering teaching repos in ${ORG}..."
    REPOS=$(gh repo list "$ORG" --json name --jq '.[].name' | grep -- '-teaching$' || true)

    if [ -z "$REPOS" ]; then
        echo "No *-teaching repos found in ${ORG}."
    else
        for REPO in $REPOS; do
            if [ -d "$DEST/$REPO" ]; then
                echo "✓ $REPO already cloned — pulling latest..."
                git -C "$DEST/$REPO" pull --ff-only || echo "  ⚠ pull failed (check for local changes)"
            else
                echo "Cloning $REPO..."
                gh repo clone "$ORG/$REPO" "$DEST/$REPO"
            fi
        done
    fi

    echo ""
    echo "Done. Teaching repos are in ./teaching-repos/"


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
    cp -r .github/prompts/* docs/docs/llm/prompts/
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


alias gl := gcp-login
# Refresh both GCP credentials: the gcloud one and application default
gcp-login:
    #!/usr/bin/env bash
    {{initialise}} "gcp-login"
    # Two separate credentials that expire independently. `gcloud auth login`
    # covers gcloud commands and direct API calls; application-default covers
    # tools that read Application Default Credentials, Terraform among them.
    # Having one valid and the other expired is the confusing case - terraform
    # fails while gcloud works - so refresh both together.
    gcloud auth login
    gcloud auth application-default login


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


alias vt := validate-teaching
# Validate all teaching content (module.yaml, assessment, images, certificate, MDX)
validate-teaching:
    #!/usr/bin/env bash
    {{initialise}} "validate-teaching"
    set -uo pipefail
    if [ -z "$(docker ps -q -f name=^quill_backend$)" ]; then
        echo "quill_backend is not running. Start it with: just sd"
        exit 1
    fi
    if ! compgen -G "teaching-repos/*/modules" > /dev/null; then
        echo "No teaching repos found. Clone them with: just initial-install"
        exit 1
    fi
    # Version lock compares a branch against origin/main, which is a
    # pull-request concern rather than a local one, so it is skipped here.
    FAILED=0
    for REPO in teaching-repos/*/; do
        NAME=$(basename "${REPO}")
        if [ -d "${REPO}modules" ]; then
            echo "▸ Validating ${NAME}..."
            docker exec quill_backend sh -lc \
                "python -m app.features.teaching.tooling.cli \
                 /teaching-repos/${NAME}/modules --skip-version-lock" \
                || FAILED=1
            echo ""
        fi
    done
    if [ "${FAILED}" -ne 0 ]; then
        echo "✗ Teaching content validation failed."
        exit 1
    fi
    echo "✓ All teaching content valid."


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
    docker exec -e AL_MSG='{{message}}' quill_backend sh -lc '
        set -e
        alembic upgrade head &&
        alembic revision --autogenerate -m "$AL_MSG" &&
        alembic upgrade head
    '


alias pc := pre-commit
# Run pre-commit checks
pre-commit:
    #!/usr/bin/env bash
    {{initialise}} "pre-commit"
    pre-commit run --all-files


alias pb := prune-branches
# Remove local branches whose remote tracking branch is gone, and untracked local branches already merged into main
prune-branches:
    #!/usr/bin/env bash
    {{initialise}} "prune-branches"
    git fetch --prune
    GONE=$(git branch -vv | grep ': gone]' | awk '{print $1}' || true)
    if [ -z "$GONE" ]; then
        echo "No stale tracked branches to remove."
    else
        echo "$GONE" | xargs git branch -D
    fi

    CURRENT=$(git branch --show-current)
    MERGED_UNTRACKED=""
    for branch in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
        if [ "$branch" = "main" ] || [ "$branch" = "$CURRENT" ]; then
            continue
        fi
        if git config --get "branch.$branch.remote" > /dev/null 2>&1; then
            continue
        fi
        if git merge-base --is-ancestor "$branch" origin/main 2>/dev/null; then
            MERGED_UNTRACKED="$MERGED_UNTRACKED $branch"
        fi
    done
    if [ -z "$MERGED_UNTRACKED" ]; then
        echo "No merged untracked branches to remove."
    else
        echo $MERGED_UNTRACKED | xargs git branch -d
    fi


alias rb := rebase
# Rebase current feature branch onto an up-to-date main (or just pull if on main)
rebase:
    #!/usr/bin/env bash
    {{initialise}} "rebase"
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$BRANCH" = "main" ]; then
        echo "On main — pulling latest..."
        git pull
    else
        echo "Updating main and rebasing $BRANCH onto it..."
        git checkout main
        git pull
        git checkout "$BRANCH"
        git rebase main
        git push --force-with-lease
    fi


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
    # The initialise variable sets -x, which would print the token to the
    # terminal and into anything that output is pasted into. Trace off across
    # the export; the command substitution needs to be inside the quiet
    # section too, since bash traces it separately from the assignment.
    set +x
    export GITHUB_TOKEN=$(gh auth token)
    set -x
    terraform init -input=false
    terraform plan -var-file=terraform.tfvars
    read -rp "Apply these changes? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        terraform apply -var-file=terraform.tfvars -auto-approve
    else
        echo "Aborted."
    fi


alias tf := terraform-infra
# Plan/apply the GCP infrastructure via Terraform (Cloud Run, load balancer, monitoring)
terraform-infra env="teaching":
    #!/usr/bin/env bash
    {{initialise}} "terraform-infra"
    set -euo pipefail
    cd infra
    VARS="environments/{{env}}/terraform.tfvars"
    if [ ! -f "$VARS" ]; then
        echo "No tfvars for environment '{{env}}' at infra/$VARS" >&2
        exit 1
    fi
    terraform init -input=false
    terraform plan -var-file="$VARS"
    read -rp "Apply these changes to {{env}}? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        terraform apply -var-file="$VARS" -auto-approve
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
# Start dev without clinical services (FHIR/EHRbase) for teaching work (build: 'b' will also build the images)
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
unit-tests-backend *ARGS:
    #!/usr/bin/env bash
    {{initialise}} "unit-tests-backend"
    docker exec quill_backend sh -lc "pytest -q -m 'not integration' {{ARGS}}"


alias uf := unit-tests-frontend
# Run the frontend unit tests
unit-tests-frontend *ARGS:
    #!/usr/bin/env bash
    {{initialise}} "unit-tests-frontend"
    docker exec quill_frontend sh -lc "yarn unit-test:run {{ARGS}}"


alias ts := test-scripts
# Run the shell script tests (bats)
test-scripts *ARGS:
    #!/usr/bin/env bash
    {{initialise}} "test-scripts"
    bats --recursive .github/scripts {{ARGS}}


alias ee := e2e
# Run the end-to-end tests
e2e:
    #!/usr/bin/env bash
    {{initialise}} "e2e"
    cd frontend && npx playwright test


alias eer := e2e-report
# Run end-to-end tests, then open the Playwright HTML report
e2e-report:
    #!/usr/bin/env bash
    {{initialise}} "e2e-report"
    cd frontend && npx playwright test && npx playwright show-report

alias eeu := e2e-ui
# Run the end-to-end tests in interactive UI mode
e2e-ui:
    #!/usr/bin/env bash
    {{initialise}} "e2e-ui"
    cd frontend && npx playwright test --ui


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
    # Look up the Cloud SQL core database private IP
    echo "Looking up database connection..."
    CORE_DB_HOST=$(gcloud sql instances describe "quill-core-{{env}}" \
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
        --set-env-vars "CORE_DB_HOST=${CORE_DB_HOST},CORE_DB_NAME=quill_core,CORE_DB_USER=quill" \
        --set-secrets "CORE_DB_PASSWORD=core-db-password:latest,JWT_SECRET=jwt-secret:latest" \
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


alias mr := migrate-remote
# Run pending Alembic migrations on a remote environment (teaching/prod do this automatically pre-deploy; use for staging or manual re-runs)
migrate-remote env:
    #!/usr/bin/env bash
    {{initialise}} "migrate-remote ({{env}})"
    set -euo pipefail

    PROJECT=$(just _gcp_env_project "{{env}}")
    REGION="europe-west2"

    echo "Run migrations on ${PROJECT}"
    echo "─────────────────────────────────"

    gcloud run jobs execute "quill-admin-{{env}}" \
        --project="$PROJECT" \
        --region="$REGION" \
        --update-env-vars "ADMIN_ACTION=run-migrations" \
        --wait
