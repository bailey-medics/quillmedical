set shell := ["bash", "-c"]


default:
    just --list


# Read SB_MAX_WORKERS out of the root .env, if it is set there.
#
# Scoped deliberately rather than `set dotenv-load`: that would export
# every line of .env — the Postgres and EHRbase credentials included —
# into the environment of every recipe. One tuning knob does not justify
# handing eight secrets to recipes that have no use for them.
#
# Unset means the flag is never passed and jest picks its own worker
# count, which is what CI gets: a GitHub runner has no .env at all.
sb_workers := 'if [ -f .env ]; then
        _sb=$(sed -n "s/^SB_MAX_WORKERS=[[:space:]]*\([0-9][0-9]*\).*/\1/p" .env | tail -1)
        if [ -n "$_sb" ]; then
            export SB_MAX_WORKERS="$_sb"
            echo "Storybook workers capped at $SB_MAX_WORKERS (SB_MAX_WORKERS in .env)"
        fi
    fi'

initialise:= 'set -euxo pipefail
    initialise() {
        # Clear the terminal window title on exit
        echo -ne "\033]0; \007"
    }
    trap initialise EXIT
    just _terminal-description'


_terminal-description message=" ":
    echo -ne "\033]0;{{message}}\007"


# Compose project name for this worktree's throwaway test containers.
#
# Derived from the worktree directory, so every worktree gets its own
# node_modules volumes under compose.unit-tests.yml and none of them collides with
# the dev stack. Lower-cased and stripped to [a-z0-9-], which is all compose
# accepts in a project name.
_test-project:
    @basename "{{justfile_directory()}}" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-' | sed 's/^/quill-test-/'


# Compose project name for this worktree's throwaway migration database
# (compose.migrate.yml). Per worktree for the same reason as `_test-project`.
_migrate-project:
    @basename "{{justfile_directory()}}" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-' | sed 's/^/quill-migrate-/'


# Compose project name for this worktree's end-to-end stack (compose.ci.yml).
# Per worktree for the same reason as `_test-project`: several can run at once.
_e2e-project:
    @basename "{{justfile_directory()}}" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-' | sed 's/^/quill-e2e-/'


# Bring up this worktree's end-to-end stack the way CI does, and print its URL.
#
# Same file, same images and same seed as the CI job, so a local run rehearses
# what CI will do rather than driving the dev stack and whatever state its
# database is in. E2E_PORT=0 has Docker pick a free host port, which is what
# lets worktrees run side by side; the URL is read back and printed on stdout
# (everything else goes to stderr) so `_e2e-run` can capture it.
_e2e-up:
    #!/usr/bin/env bash
    set -euo pipefail
    project=$(just _e2e-project)
    compose="docker compose -p ${project} -f compose.ci.yml"
    # The module seed_ci.py syncs, pinned so a local run tests what CI does
    .github/scripts/ci/fetch-e2e-teaching.sh >&2
    E2E_PORT=0 ${compose} up --build --wait --wait-timeout 120 >&2
    # The prod image does not migrate on start-up, so the fresh database
    # needs the schema applied before it is seeded — as in ci.yml.
    ${compose} exec -T backend alembic upgrade head >&2
    ${compose} exec -T backend python scripts/seed_ci.py >&2
    port=$(${compose} port caddy 80 | sed 's/.*://')
    echo "http://localhost:${port}"


# Tear down this worktree's end-to-end stack, database included.
_e2e-down:
    #!/usr/bin/env bash
    docker compose -p "$(just _e2e-project)" -f compose.ci.yml \
        down --volumes --remove-orphans


# Run Playwright against a fresh end-to-end stack, tearing it down afterwards.
_e2e-run *ARGS:
    #!/usr/bin/env bash
    set -euo pipefail
    # Runs on failure too, so a red run never leaves a stack behind. The exit
    # status Playwright produced survives the trap.
    trap 'just _e2e-down' EXIT
    base_url=$(just _e2e-up)
    echo "End-to-end stack is up at ${base_url}" >&2
    cd frontend && E2E_BASE_URL="${base_url}" npx playwright test {{ARGS}}


# Refuse to run when this worktree is not the one the container serves.
#
# The dev stack is owned by whichever worktree ran `just sd`: the containers
# bind-mount that checkout, and their names are fixed in compose.dev.yml, so
# `docker exec` from a second worktree silently acts on the first one's code.
# A user-creation script would write to the wrong database.
#
# Only recipes that genuinely need the live stack call this. The tests and
# migrations do not: `just ub` and `just uf` run in throwaway containers
# that mount the current worktree (compose.unit-tests.yml), `just migrate`
# uses a throwaway database (compose.migrate.yml), and `just e2e` brings up
# its own per-worktree stack (compose.ci.yml), so all work from any worktree.
#
# The owning path is read from Docker rather than hard-coded, so renaming or
# moving the root worktree needs no change here.
_worktree-guard container:
    #!/usr/bin/env bash
    set -uo pipefail
    # Parsed with jq rather than `docker inspect --format`: a Go template
    # needs its braces doubled to survive just's own interpolation, which is
    # easy to get subtly wrong and leaks stray braces into the path.
    # `.Mounts? // empty` keeps a missing container quiet: docker inspect
    # yields no object, and the empty result is reported below as "not
    # running" rather than as a jq iteration error.
    mount=$(docker inspect {{container}} 2>/dev/null \
        | jq -r '.[0].Mounts? // empty | .[] | select(.Destination == "/app") | .Source')
    if [ -z "${mount}" ]; then
        echo "{{container}} is not running. Start it with: just sd" >&2
        exit 1
    fi
    owner=$(dirname "${mount}")
    # Docker Desktop reports a bind mount's source with a `/host_mnt`
    # prefix — the path as the VM sees it, not as the host wrote it. The
    # two name the same directory, so a raw string comparison refused
    # every guarded recipe on a Mac with the stack serving this very
    # worktree.
    owner="${owner#/host_mnt}"
    here="{{justfile_directory()}}"
    if [ "${owner}" != "${here}" ]; then
        echo "" >&2
        echo "✗ Refusing to run: {{container}} serves a different worktree." >&2
        echo "" >&2
        echo "    this worktree: ${here}" >&2
        echo "    container serves: ${owner}" >&2
        echo "" >&2
        echo "  Running here would act on the other worktree's code." >&2
        echo "  Either run this from ${owner}, or restart the stack" >&2
        echo "  from this worktree: just sc && just sd" >&2
        echo "" >&2
        exit 1
    fi


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
    REPOS=$(gh repo list "$ORG" --json name --jq '.[].name' | grep -E -- '-teaching(-testing)?$' || true)

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
    just _worktree-guard quill_backend
    docker exec -it quill_backend sh -lc "cd scripts && python create_user.py"


alias csl := create-superadmin-local
# Create a superadmin user locally (for dev setup)
create-superadmin-local:
    #!/usr/bin/env bash
    {{initialise}} "create-superadmin-local"
    just _worktree-guard quill_backend
    docker exec -it quill_backend sh -lc "cd scripts && python create_superuser.py"


alias cur := create-user-with-role
# Create a new user with role assignment (supports Clinician role)
create-user-with-role:
    #!/usr/bin/env bash
    {{initialise}} "create-user-with-role"
    just _worktree-guard quill_backend
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


alias ebx := email-export
# Export the newsletter layout for Resend, as email-broadcast-<theme>.html
email-export theme="quill":
    #!/usr/bin/env bash
    {{initialise}} "email-export"
    # Rendered in the backend unit-test container, printed, and written here
    # at the repository root (gitignored). Paste the file into a Resend
    # broadcast's HTML editor, then replace the marked campaign content.
    out="email-broadcast-{{theme}}.html"
    docker compose -p "$(just _test-project)" -f compose.unit-tests.yml \
        run --rm -T backend sh -lc "python -m app.email.broadcast {{theme}}" > "$out"
    echo "Wrote $out"


alias ep := email-preview
# Render every email with sample values, for the Storybook email previews
email-preview:
    #!/usr/bin/env bash
    {{initialise}} "email-preview"
    # In the backend unit-test container, which mounts this worktree's
    # frontend/src/stories/emails/rendered/ for the renders to land in.
    # Commit what changes: tests/test_email_previews.py fails while the
    # committed renders are behind the templates.
    docker compose -p "$(just _test-project)" -f compose.unit-tests.yml \
        run --rm backend sh -lc "python -m app.email.previews"


alias eb := enter-backend
# Enter the backend container shell
enter-backend:
    #!/usr/bin/env bash
    {{initialise}} "enter-backend"
    just _worktree-guard quill_backend
    docker exec -it quill_backend /bin/sh


alias ef := enter-frontend
# Enter the frontend container shell
enter-frontend:
    #!/usr/bin/env bash
    {{initialise}} "enter-frontend"
    just _worktree-guard quill_frontend
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
    # Git runs the tracked .husky/pre-commit directly, which itself runs
    # `pre-commit run`. The path is deliberately relative: git resolves it
    # against the root of whichever worktree is committing, so every
    # worktree runs its own branch's hook. An absolute path here would
    # point every worktree at one checkout's copy, and vanish silently if
    # that checkout moved. Not `pre-commit install`: it refuses to run while
    # core.hooksPath is set, and would be redundant anyway.
    git config core.hooksPath .husky
    # The only package.json is the frontend's; the repository root has none.
    (cd frontend && yarn install)
    just aj
    # Without this the Stop-hook banner still works, but shows the
    # default osascript icon, so a failure here is not worth stopping the
    # setup for. macOS only; the script exits cleanly elsewhere.
    just notifier-app || echo "Notifier not built; banners will use the default icon."



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
    just _worktree-guard quill_backend
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
    just _worktree-guard quill_backend
    docker exec quill_backend python -m scripts.preview_certificate --bank "{{bank}}"
    docker cp quill_backend:/tmp/certificate-preview.pdf .
    open certificate-preview.pdf


alias m := migrate
# Autogenerate a migration for this worktree's model changes (throwaway database)
migrate message:
    #!/usr/bin/env bash
    {{initialise}} "migrate - {{message}}"
    # Autogenerate compares models against a database at head. This uses a
    # throwaway Postgres from compose.migrate.yml rather than the dev
    # stack's, so it always compares THIS worktree's models with THIS
    # worktree's migrations, and needs neither the stack nor ownership of
    # it. The revision lands in this worktree's alembic/versions.
    compose="docker compose -p $(just _migrate-project) -f compose.migrate.yml"
    trap '${compose} down --volumes --remove-orphans >/dev/null 2>&1' EXIT
    before=$(ls backend/alembic/versions/*.py)
    ${compose} run --rm -e AL_MSG='{{message}}' migrate sh -lc '
        set -e
        alembic upgrade head &&
        alembic revision --autogenerate -m "$AL_MSG" &&
        alembic upgrade head
    '
    # Autogenerate happily writes an empty revision when it finds no
    # difference, and that exits zero. Name the file and say so, rather
    # than leaving a permanent no-op to be discovered in review.
    new=$(comm -13 <(echo "${before}") <(ls backend/alembic/versions/*.py))
    echo ""
    echo "Created: ${new}"
    if sed -n '/^def upgrade/,/^def downgrade/p' "${new}" | grep -vE '^\s*(#|$)' | grep -qE '^\s+pass\s*$'; then
        rm "${new}"
        echo "✗ upgrade() was empty, so the file has been removed." >&2
        echo "  The models already match the migrations: check the model change is saved." >&2
        exit 1
    fi
    echo "Review upgrade() and downgrade() before committing."


alias ml := migrate-local
# Apply pending migrations to this worktree's dev database
migrate-local:
    #!/usr/bin/env bash
    {{initialise}} "migrate-local"
    set -euo pipefail
    # The step `just migrate` deliberately does not do. That recipe
    # compares models against a throwaway database and drops it, so a
    # migration it writes — or one that arrived from `main` — has never
    # touched the database the dev stack is actually serving. Without
    # this the symptom is a column or table that exists in the models
    # and not in Postgres, which surfaces as a 500 far from its cause.
    #
    # `just st` now does this on every start, so running it by hand is
    # for the case where the stack is already up and `main` has moved
    # underneath it.
    just _worktree-guard quill_backend
    just _migrate-running-stack


# Bring the running stack's database to head, and say what happened.
#
# Shared by `migrate-local` and by `start-teaching`, so the two cannot
# drift: one is the same step run on demand rather than at start-up.
# Deliberately without the worktree guard — `start-teaching` has just
# brought this very stack up, so there is nothing to disagree with, and
# `migrate-local` checks before calling this.
_migrate-running-stack:
    #!/usr/bin/env bash
    set -euo pipefail

    before=$(docker exec quill_postgres_core \
        psql -U core_user -d quill_core -tAc \
        "SELECT version_num FROM alembic_version;" 2>/dev/null || echo "none")

    docker exec quill_backend sh -lc 'alembic upgrade head'

    after=$(docker exec quill_postgres_core \
        psql -U core_user -d quill_core -tAc \
        "SELECT version_num FROM alembic_version;" 2>/dev/null || echo "unknown")

    # Said plainly, because "upgrade head" prints nothing when there was
    # nothing to do, and a silent success is indistinguishable from a
    # command that did not run.
    if [ "${before}" = "${after}" ]; then
        echo "Database already at ${after} — nothing to apply."
    else
        echo "Database migrated ${before} → ${after}"
    fi


alias pc := pre-commit
# Run pre-commit checks
pre-commit:
    #!/usr/bin/env bash
    {{initialise}} "pre-commit"
    pre-commit run --all-files


alias wc := worktree-create
# Create a sibling worktree on a new branch, and set up its Python venv
worktree-create branch="":
    #!/usr/bin/env bash
    {{initialise}} "worktree-create"

    if [ -z "{{branch}}" ]; then
        echo "Usage: just wc feature/my-branch"
        echo "Creates the branch, or resumes it if it already exists."
        exit 1
    fi

    # Branch protection rejects anything outside this set, and finding
    # that out after the worktree exists means unpicking it by hand.
    case "{{branch}}" in
        feature/*|hotfix/*|copilot/*|renovate/*) ;;
        *)
            echo "Branch must start with feature/, hotfix/, copilot/ or renovate/"
            exit 1
            ;;
    esac

    ROOT=$(git rev-parse --show-toplevel)
    NAME=$(basename "$ROOT")
    PARENT=$(dirname "$ROOT")

    # Walk up from 2 until a free name appears, rather than counting the
    # existing worktrees: one removed by hand would otherwise make the
    # next number collide with a directory still on disk.
    N=2
    while [ -e "$PARENT/$NAME-$N" ]; do
        N=$((N + 1))
    done
    DEST="$PARENT/$NAME-$N"

    git -C "$ROOT" fetch origin --quiet

    if git -C "$ROOT" show-ref --verify --quiet "refs/heads/{{branch}}"; then
        echo "Branch {{branch}} already exists locally — checking it out."
        git -C "$ROOT" worktree add "$DEST" "{{branch}}"
    elif git -C "$ROOT" show-ref --verify --quiet "refs/remotes/origin/{{branch}}"; then
        # Resuming work that already exists on the remote. Branching from
        # main here would silently discard every commit on it.
        echo "Branch {{branch}} exists on origin — resuming it."
        git -C "$ROOT" worktree add -b "{{branch}}" "$DEST" "origin/{{branch}}"
        git -C "$DEST" branch --set-upstream-to="origin/{{branch}}" "{{branch}}"
    else
        # Branch from origin/main rather than the current HEAD, so a new
        # worktree never inherits half-finished work from wherever you
        # happened to be standing.
        git -C "$ROOT" worktree add -b "{{branch}}" "$DEST" origin/main

        # A new branch made this way tracks main, not itself, so the first
        # bare `git push` would aim at the protected branch. Leave it unset
        # rather than relying on push.default to refuse.
        git -C "$DEST" branch --unset-upstream "{{branch}}" 2>/dev/null || true
    fi

    # .env files are gitignored, so a new worktree starts without any and
    # the stack will not come up. Copied rather than symlinked: a branch
    # may legitimately need a different value, and a symlink would edit
    # the original from inside the worktree without warning.
    for f in .env backend/.env frontend/.env; do
        if [ -f "$ROOT/$f" ]; then
            cp "$ROOT/$f" "$DEST/$f"
            echo "Copied $f"
        fi
    done

    # Each worktree gets its own venv. The env var is what forces it:
    # Poetry keys cached environments on the project name, which is
    # "backend" in every worktree, so without this they all silently
    # share one — and installing a dependency on one branch changes the
    # others, which is exactly what a worktree is meant to prevent.
    echo "Creating the backend virtual environment..."
    # `env -u VIRTUAL_ENV` matters as much as the in-project flag. If a
    # venv is already active in the calling shell — which it is whenever
    # you run this from a worktree you have been working in — Poetry
    # honours that over everything else and installs into it, so the new
    # worktree silently shares its parent's environment.
    (cd "$DEST/backend" \
        && env -u VIRTUAL_ENV POETRY_VIRTUALENVS_IN_PROJECT=1 poetry install)

    # The JavaScript half of the same job. node_modules is gitignored, so
    # Storybook, Playwright and the host-side linters have nothing to run
    # with until it exists. `--immutable` because a fresh worktree has no
    # business rewriting the lockfile: if the install would change it, the
    # branch is what needs fixing.
    echo "Installing the frontend packages..."
    (cd "$DEST/frontend" && yarn install --immutable)

    # No hook setup is needed. core.hooksPath lives in the shared git config
    # and is the relative `.husky`, which git resolves against the root of
    # the worktree that is committing — so this worktree runs its own
    # branch's tracked hook from the moment it exists.
    echo ""
    echo "Worktree ready at $DEST on {{branch}}"
    echo "  cd $DEST"


alias pb := prune-branches
# Remove local branches whose remote tracking branch is gone, and untracked local branches already merged into main. Pass 'a' to prune the teaching content repos too.
prune-branches scope="":
    #!/usr/bin/env bash
    {{initialise}} "prune-branches"

    # One function, called once per repository, so the teaching repos get
    # exactly the same care as Quill rather than a hastily written second
    # copy that skips the worktree check.
    prune_one() {
        cd "$1" || return 0
        git fetch --prune

        # Branch names come from for-each-ref, not `git branch -vv`: that marks
        # the current branch with "*" and a branch checked out in another
        # worktree with "+", and the marker is what `awk '{print $1}'` picks
        # up. Fields are name / upstream / track / worktree path, tab
        # separated.
        REFS=$(git for-each-ref --format='%(refname:short)%09%(upstream)%09%(upstream:track)%09%(worktreepath)' refs/heads/)

        # A branch checked out in another worktree cannot be deleted, so name
        # it rather than failing the whole recipe on it.
        HELD=$(echo "$REFS" | awk -F'\t' '$3 == "[gone]" && $4 != "" { print $1 " (" $4 ")" }')
        if [ -n "$HELD" ]; then
            echo "Stale but checked out in another worktree, skipping:"
            echo "$HELD" | sed 's/^/  /'
        fi

        GONE=$(echo "$REFS" | awk -F'\t' '$3 == "[gone]" && $4 == "" { print $1 }')
        if [ -z "$GONE" ]; then
            echo "No stale tracked branches to remove."
        else
            echo "$GONE" | xargs git branch -D
        fi

        MERGED_UNTRACKED=""
        for branch in $(echo "$REFS" | awk -F'\t' '$2 == "" && $4 == "" { print $1 }'); do
            if [ "$branch" = "main" ]; then
                continue
            fi
            if git merge-base --is-ancestor "$branch" origin/main 2>/dev/null; then
                MERGED_UNTRACKED="$MERGED_UNTRACKED $branch"
            fi
        done
        if [ -z "$MERGED_UNTRACKED" ]; then
            echo "No merged untracked branches to remove."
        else
            # -D, not -d, because the merge check has already been made above
            # and made against the right branch. A branch with no upstream
            # sends `git branch -d` to compare against HEAD instead of main,
            # so pruning from a feature branch made it refuse every branch
            # whose commits main has but that branch does not — which is all
            # of them. It failed the whole recipe on the last one.
            echo $MERGED_UNTRACKED | xargs git branch -D
        fi
    }

    ROOT=$(pwd)
    echo "▸ quillmedical"
    prune_one "$ROOT"

    if [ "{{scope}}" = "a" ]; then
        if ! compgen -G "$ROOT/teaching-repos/*/.git" > /dev/null; then
            echo ""
            echo "No teaching content repos cloned — run 'just clone-teaching' first."
        else
            for REPO in "$ROOT"/teaching-repos/*/; do
                # A directory without .git is content someone dropped in by
                # hand, not a clone, and git commands there would act on
                # Quill's repository instead.
                if [ -d "${REPO}.git" ]; then
                    echo ""
                    echo "▸ $(basename "${REPO}")"
                    prune_one "${REPO}"
                fi
            done
        fi
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
    # -reconfigure: a checkout initialised before the state moved to GCS on
    # 2026-09-25 still records a local backend, and a plain init would stop
    # to ask about migrating it. The state is already in the bucket, so
    # there is nothing to migrate.
    terraform init -input=false -reconfigure
    terraform plan -var-file=terraform.tfvars
    read -rp "Apply these changes? (yes/no): " confirm
    if [ "$confirm" = "yes" ]; then
        terraform apply -var-file=terraform.tfvars -auto-approve
    else
        echo "Aborted."
    fi


alias tf := terraform-infra
# Plan/apply the GCP infrastructure via Terraform (Cloud Run, load balancer, monitoring)
terraform-infra env="app":
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
    # Each environment's state is its own workspace. Without selecting it
    # this planned against the empty default workspace, and so proposed
    # creating every resource that already exists. `select` and not
    # `select -or-create`: a mistyped name must fail, not start a new state.
    terraform workspace select "{{env}}"
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
    {{sb_workers}}
    cd frontend
    yarn storybook:test

alias sbtci := storybook-test-ci
# Run storybook tests in CI mode (starts storybook, runs tests, stops storybook)
storybook-test-ci:
    #!/usr/bin/env bash
    {{initialise}} "storybook-test-ci"
    {{sb_workers}}
    cd frontend
    yarn storybook:test:ci


alias sdc := show-dev-containers
# Show the running dev containers
show-dev-containers:
    #!/usr/bin/env bash
    {{initialise}} "show-dev-containers"
    docker compose -f compose.dev.yml ps


# Prefix a bare name with feature/, leaving an already-prefixed one alone.
#
# Branch protection rejects anything outside feature/*, hotfix/*, copilot/*
# and renovate/*, and it rejects it at creation time — so a stack branch
# named without the prefix fails at the push, once the commits already
# exist. Cheaper to add it here than to unpick a branch by hand.
_stack-branch-name name:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{name}}" in
        feature/*|hotfix/*|copilot/*|renovate/*) echo "{{name}}" ;;
        *) echo "feature/{{name}}" ;;
    esac


# Refuse a stack operation when a stack branch lives in another worktree.
#
# gh-stack keeps its state in $(git rev-parse --git-dir)/gh-stack, which for
# a worktree is .git/worktrees/<name>/gh-stack: worktree-local, invisible to
# the other checkouts, and removed with the worktree. So a stack belongs to
# the worktree that created it.
#
# The guard matters because `gh stack rebase` does not enforce that itself.
# Given a branch checked out elsewhere it prints the git error, skips the
# branch, and still exits 0 (github/gh-stack#35, reproduced here on
# 2026-09-14). Anything chaining `rebase && submit` would then push a stack
# it believed was rebased and was not — the silent-success failure the
# worktree notes in CLAUDE.md already record once.
_stack-guard:
    #!/usr/bin/env bash
    set -uo pipefail
    python3 scripts/stack-status.py --check
    status=$?
    # 1 is "no stack here". The script has already named the recipes and
    # the skill that start or check out one, so stopping here is what makes
    # that the last thing on the screen: without it the recipe carried on
    # into `gh stack rebase`, which answered the same question again in its
    # own words and buried the useful half under the useless one.
    if [ "${status}" -eq 1 ]; then
        exit 1
    fi
    if [ "${status}" -eq 2 ]; then
        echo "✗ Refusing to run: this stack spans more than one worktree." >&2
        echo "  Free the branches above, or run this from the worktree" >&2
        echo "  that owns the stack." >&2
        exit 1
    fi


alias sta := stack-add
# Add a branch on top of the current stack, committing what is staged
stack-add name message:
    #!/usr/bin/env bash
    {{initialise}} "stack-add"
    set -euo pipefail
    just _stack-guard
    branch="$(just _stack-branch-name '{{name}}')"
    # -A stages everything including untracked files, which is what makes
    # this one command rather than three. The commit message is required
    # rather than optional: without -m, gh opens an editor, and a recipe
    # that sometimes opens an editor is a recipe that hangs in a script.
    gh stack add -A -m "{{message}}" "${branch}"
    python3 scripts/stack-status.py


alias stc := stack-checkout
# Check out a stack by number, PR number, PR URL or branch (picker if empty)
stack-checkout target="":
    #!/usr/bin/env bash
    {{initialise}} "stack-checkout"
    set -euo pipefail
    # The recovery path when a stack's local state is gone — a removed
    # worktree takes .git/worktrees/<name>/gh-stack with it. This fetches
    # the stack back from GitHub, which works once two or more pull
    # requests exist. With no argument it opens a picker of every stack.
    gh stack checkout {{target}}
    python3 scripts/stack-status.py


alias stf := stack-files
# List what each branch in the stack changes, against its own parent
stack-files patch="":
    #!/usr/bin/env bash
    set +x
    {{initialise}} "stack-files"
    set +x
    # Against its own parent, not the trunk: a branch three layers up
    # diffed against main replays every change below it, which is the
    # wall of diff that stacking exists to avoid. Pass 'p' for the full
    # patch rather than the per-file summary.
    if [ "{{patch}}" = "p" ]; then
        python3 scripts/stack-status.py --files --patch || true
    else
        python3 scripts/stack-status.py --files || true
    fi


alias sth := stack-help
# List the stack commands, one per line, with their arguments
stack-help:
    #!/usr/bin/env bash
    set +x
    {{initialise}} "stack-help"
    set +x
    # Read back out of `just --list` rather than written out here: a hard-coded
    # list is one more thing to update when a recipe gains an argument, and the
    # copy that goes stale is the one being consulted precisely because someone
    # has forgotten the command.
    #
    # `--list` prints "  name args   # description [alias: x]". Only the part
    # before the comment is wanted — this is a reminder of the exact wording
    # and argument order, not documentation; `just --list` already carries the
    # descriptions for anyone who wants them.
    #
    # Coloured only when stdout is a terminal, so piping or capturing the
    # output does not pick up escape sequences.
    #
    # 206,166,87 as a 24-bit RGB escape rather than an ANSI palette index: it
    # is the colour an editor gives a recipe name in this Justfile, sampled
    # from the screen, and the point is to match it. Palette colour 33
    # ("yellow") renders anywhere from amber to orange depending on the
    # theme, so it could not. A terminal with only 256 colours degrades this
    # to the nearest entry, 179, which is close enough not to detect.
    # The arguments are coloured separately from the name, so the shape of a
    # command — what it is, and what it wants — reads at a glance. The alias
    # takes the recipe colour, because it is the same thing said shorter:
    # colouring it differently would suggest a difference that is not there.
    if [ -t 1 ]; then
        recipe_colour=$'\033[38;2;206;166;87m'
        argument_colour=$'\033[38;2;159;206;253m'
        reset=$'\033[0m'
    else
        recipe_colour=""
        argument_colour=""
        reset=""
    fi

    # Collected into arrays rather than printed as they are read, because the
    # alias column is aligned on the widest signature and that is not known
    # until every line has been seen. A `while read` on the end of a pipe
    # would not do: it runs in a subshell, so the width would not survive.
    signatures=()
    aliases=()
    widest=0
    while IFS= read -r line; do
        # `--list` prints "  name args   # description [alias: x]". The alias
        # lives inside the comment, so it has to be lifted out before the
        # comment is stripped.
        alias_name=""
        case "${line}" in
            *"[alias: "*)
                alias_name="${line##*\[alias: }"
                alias_name="${alias_name%%]*}"
                ;;
        esac
        signature="${line%%#*}"
        signature="${signature%"${signature##*[![:space:]]}"}"

        signatures+=("${signature}")
        aliases+=("${alias_name}")
        [ "${#signature}" -gt "${widest}" ] && widest="${#signature}"
    done < <(
        just --list 2>/dev/null \
            | grep -E '^\s+stack(-[a-z-]+)?( |$)' \
            | sed -E 's/^[[:space:]]+//'
    )

    echo ""
    echo "  Prefix any of these with 'just' or 'j' to run it:"
    echo ""
    for index in "${!signatures[@]}"; do
        signature="${signatures[${index}]}"
        alias_name="${aliases[${index}]}"

        # Everything up to the first space is the recipe name; the rest, if
        # there is any, is its arguments. A recipe that takes none leaves
        # `arguments` empty and prints as just the name.
        name="${signature%% *}"
        arguments="${signature#"${name}"}"
        arguments="${arguments# }"

        if [ -n "${arguments}" ]; then
            rendered="${recipe_colour}${name}${reset} ${argument_colour}${arguments}${reset}"
        else
            rendered="${recipe_colour}${name}${reset}"
        fi

        # Padded on the signature's own length, never on `rendered`: that one
        # carries escape sequences, which take width in the string and none on
        # the screen, so padding it would leave every line short by a
        # different amount.
        padding=$((widest - ${#signature}))
        if [ -n "${alias_name}" ]; then
            printf '  %s%*s   %s%s%s\n' \
                "${rendered}" "${padding}" "" \
                "${recipe_colour}" "${alias_name}" "${reset}"
        else
            printf '  %s\n' "${rendered}"
        fi
    done
    echo ""


alias stl := stack-log
# Show the current stack (fast, local only — no network)
stack-log:
    #!/usr/bin/env bash
    # Trace off before `initialise`, not after: this recipe exists to draw a
    # picture, and even the two trace lines the setup itself emits are
    # enough to push the stack down the terminal. Same reasoning as
    # `terraform-github`, applied one line earlier.
    set +x
    {{initialise}} "stack-log"
    set +x
    # Local flags only: branch order, merged/queued, needs-rebase, and which
    # branches another worktree holds. Instant and works offline. `just stll`
    # is the same picture with pull request and CI state joined on.
    #
    # Exit 1 means "no stack here", which the script has already explained.
    # Passing it through would make just print "Recipe failed", dressing an
    # ordinary answer up as a fault.
    python3 scripts/stack-status.py || true


alias stll := stack-log-long
# Show the current stack with pull request and CI state (one network call)
stack-log-long:
    #!/usr/bin/env bash
    set +x
    {{initialise}} "stack-log-long"
    set +x
    # One `gh pr list` for the whole stack rather than one call per branch,
    # so a six-deep stack is one round trip. This is the view that answers
    # "is this one green yet" without opening a browser.
    #
    # The two tiers are reported as two marks, fast then heavy, always in
    # that order: `✓ –`. They answer different questions — the fast tier
    # runs on every push, while the heavy tier is gated on the pull
    # request not being a draft and so on a stack usually has not run at
    # all. One combined tick would hide that, and a dash is not a failure:
    # it means "not run yet".
    python3 scripts/stack-status.py --prs || true


alias stm := stack-move
# Move about the stack: up, down, top, bottom, trunk, or a picker if empty
stack-move direction="":
    #!/usr/bin/env bash
    {{initialise}} "stack-move"
    set -euo pipefail
    # `gh stack switch` with no argument opens an interactive picker; the
    # named directions are the cheap ones. Wrapped together because they
    # are the same act — going somewhere else in the stack — and because
    # redrawing afterwards is what makes the move legible.
    case "{{direction}}" in
        "")               gh stack switch ;;
        up|u)             gh stack up ;;
        down|d)           gh stack down ;;
        top|t)            gh stack top ;;
        bottom|b)         gh stack bottom ;;
        trunk|main)       gh stack trunk ;;
        *)
            echo "✗ Unknown direction: {{direction}}" >&2
            echo "  Use: up, down, top, bottom, trunk — or none for a picker." >&2
            exit 1
            ;;
    esac
    python3 scripts/stack-status.py


alias stn := stack-new
# Start a new stack: create the bottom branch, commit everything, draw it
stack-new name message:
    #!/usr/bin/env bash
    {{initialise}} "stack-new"
    set -euo pipefail
    branch="$(just _stack-branch-name '{{name}}')"
    # init adopts the branch it creates as the bottom of a new stack, based
    # on the default branch. No guard here: there is no stack to span a
    # worktree yet, and this is the command that creates one.
    #
    # Safe to re-run, as `stack-add` is. A pre-commit hook that stops the
    # commit below leaves the branch created and the stack initialised, so a
    # second run must pick up from the commit rather than fail on
    # `git switch -c` and leave only a hand-made `git commit` to finish it.
    if git show-ref --verify --quiet "refs/heads/${branch}"; then
        if [ "$(git branch --show-current)" != "${branch}" ]; then
            git switch "${branch}"
        fi
    else
        git switch -c "${branch}"
        gh stack init "${branch}"
    fi
    # -A stages everything, untracked files included, to match `stack-add`.
    # Splitting a dirty tree across branches is done by committing what is
    # ready and leaving the rest for the branch above — not by naming files
    # here, which only moved the bookkeeping into the command line.
    git add -A
    git commit -m "{{message}}"
    python3 scripts/stack-status.py


alias strd := stack-ready
# Take every open pull request in this worktree's stack out of draft
stack-ready:
    #!/usr/bin/env bash
    {{initialise}} "stack-ready"
    set -euo pipefail
    just _stack-guard
    # Marking ready is what starts the heavy CI tier (Storybook interaction
    # tests, Semgrep, E2E): it fires on ready_for_review, never on opened. So
    # this starts it on every branch at once — do not run it alongside
    # `just e2e` or `just sbt` locally, which compete for the same machine.
    #
    # Bottom to top, the order `gh stack view` lists them, so the branch
    # nearest main is ready first. Merged branches and branches with no pull
    # request are skipped rather than failed: a stack part-way through
    # merging is normal. This never merges anything; that stays a human act.
    prs="$(gh stack view --json \
        | jq -r '.branches[] | select(.isMerged | not) | .pr.number // empty')"
    if [ -z "${prs}" ]; then
        echo "No open pull requests in this stack."
        exit 0
    fi
    for number in ${prs}; do
        state="$(gh pr view "${number}" --json state,isDraft \
            --jq '"\(.state) \(.isDraft)"')"
        case "${state}" in
            "OPEN true") gh pr ready "${number}" ;;
            "OPEN false") echo "#${number} is already ready for review." ;;
            *) echo "#${number} is not open (${state%% *}); skipped." ;;
        esac
    done
    python3 scripts/stack-status.py --prs


alias str := stack-rebase
# Rebase the whole stack onto an updated trunk, refusing if it spans worktrees
stack-rebase:
    #!/usr/bin/env bash
    {{initialise}} "stack-rebase"
    set -euo pipefail
    just _stack-guard
    gh stack rebase
    # gh stack rebase exits 0 even when it skipped a branch, so the result is
    # verified rather than trusted: `view --json` reports needsRebase
    # correctly for exactly the branch a silent skip leaves behind.
    if python3 scripts/stack-status.py --no-colour | grep -q "needs rebase"; then
        echo "" >&2
        echo "✗ Branches still need a rebase after gh stack rebase." >&2
        echo "  It reports success even when it skips a branch." >&2
        echo "  Run 'just stack-log' to see which." >&2
        echo "" >&2
        echo "  If it instead conflicted in files this branch never" >&2
        echo "  touched, the record's trunk.head is stale: run" >&2
        echo "  'just stack-refresh'. See that recipe for why." >&2
        exit 1
    fi
    python3 scripts/stack-status.py


alias stre := stack-refresh
# Repoint a stale stack record at today's trunk, fixing runaway rebases
stack-refresh:
    #!/usr/bin/env bash
    {{initialise}} "stack-refresh"
    set -euo pipefail
    # The record in .git/gh-stack stores trunk.head: the commit main sat
    # at when the stack was started. `gh stack rebase` works out "your
    # commits" from that point, and nothing refreshes it as the branches
    # below merge. Once it is stale, everything merged into main since
    # then looks like unpushed work of yours, and the rebase replays it
    # onto a main that already has it — conflicting against history in
    # files the branch never touched. Measured here at 75 commits stale
    # on a live stack and 144 on an older one.
    #
    # `stack-sync` does not fix this. It prunes merged branches and
    # redraws, leaving trunk.head exactly as it was; that was tested
    # against a record aged to 79 behind, which stayed at 79. Only
    # unstack-then-init rewrites it.
    #
    # No commit is touched: unstack removes the local record, init
    # adopts the same branches again against today's trunk. Branches
    # that have merged are left out, so a stack part-way through landing
    # rebuilds as the units still in flight, based on main.
    branch="$(git branch --show-current)"
    if [ -z "${branch}" ] || [ "${branch}" = "main" ]; then
        echo "✗ Run this from a branch in the stack, not main." >&2
        exit 1
    fi

    # Bottom to top, which is the order `gh stack init` adopts them in.
    # Naming only the current branch would drop the rest of the stack
    # from the record, which is not a repair.
    branches="$(python3 scripts/stack-status.py --rebuild-order)"
    if [ -z "${branches}" ]; then
        echo "✗ No unmerged branches in this stack to rebuild." >&2
        exit 1
    fi

    # unstack deletes the record, so keep a copy: if init then fails the
    # stack would otherwise be gone with nothing to put back.
    record="$(git rev-parse --git-dir)/gh-stack"
    backup="$(mktemp)"
    cp "${record}" "${backup}"
    restore() {
        if [ ! -s "${record}" ] && [ -s "${backup}" ]; then
            cp "${backup}" "${record}"
            echo "✗ Refresh failed — the stack record was restored." >&2
        fi
        rm -f "${backup}"
    }
    trap restore EXIT

    git fetch origin main --quiet
    echo "Rebuilding the stack record for:"
    echo "${branches}" | sed 's/^/  /'
    gh stack unstack
    # shellcheck disable=SC2086
    gh stack init ${branches}
    python3 scripts/stack-status.py


alias stsu := stack-submit
# Rebase onto the latest trunk, then push and open or update the drafts
stack-submit:
    #!/usr/bin/env bash
    {{initialise}} "stack-submit"
    set -euo pipefail
    # Rebase first, every time. A stack is submitted over and over as the
    # units above it are revised, and trunk moves underneath it while that
    # happens — 22 commits in one afternoon, the first time this was used.
    # Submitting without rebasing pushes branches whose pull requests then
    # sit behind main, which the merge queue has to sort out later.
    #
    # `stack-rebase` rather than a bare `gh stack rebase`: it carries the
    # worktree guard and the after-the-fact check that catches a rebase
    # which reported success and silently skipped a branch. Both belong
    # here too, and are better called than copied.
    just stack-rebase
    # --auto skips the interactive editor and opens every new pull request as
    # a draft, which is what this repository needs: the heavy CI tier and the
    # four gate contexts fire on ready_for_review and synchronize, never on
    # opened, so a pull request created ready never gets them. Do not add
    # --open here; `gh pr ready` or /crp final is how a branch leaves draft.
    gh stack submit --auto
    python3 scripts/stack-status.py --prs


alias stsy := stack-sync
# Drop merged branches, re-target the rest, and redraw the stack. Pass 'a' to sweep every worktree.
stack-sync scope="":
    #!/usr/bin/env bash
    {{initialise}} "stack-sync"
    set -uo pipefail

    # One function, called once per worktree, so a sweep gives each checkout
    # exactly the same treatment as a single run rather than a second, more
    # hastily written copy of it. It returns rather than exits: in a sweep a
    # worktree that has nothing to do must not stop the ones after it.
    sync_one() {
        cd "$1" || return 0

        # Not `just _stack-guard`: that collapses "no stack here" and "this
        # stack spans worktrees" into the same exit 1, which is the right
        # answer for a single run and the wrong one inside a loop. Both are
        # ordinary outcomes of a sweep and each deserves its own line.
        local status=0
        python3 scripts/stack-status.py --check >/dev/null 2>&1 || status=$?
        if [ "${status}" -eq 1 ]; then
            echo "  No stack here — nothing to sync."
            return 0
        fi
        if [ "${status}" -eq 2 ]; then
            echo "  ✗ Skipped: this stack spans more than one worktree." >&2
            echo "    Free the branches above, or sync it from the worktree" >&2
            echo "    that owns it." >&2
            return 0
        fi

        # Run this after a pull request merges: it notices the merge, deletes
        # the branch, cascade-rebases what sat above it and pushes the result.
        #
        # --prune answers the "delete N merged branches?" prompt in advance.
        # Tidying up after a merge is the whole reason this recipe exists, and
        # a merged branch's commits are on main and its pull request is on
        # GitHub, so there is nothing in one to lose.
        if ! gh stack sync --prune; then
            echo "  ✗ gh stack sync failed here; leaving this worktree alone." >&2
            return 1
        fi

        # `--prune` deletes the local branch of a merged pull request, which is
        # the half that frees the name — but it leaves the branch's entry in
        # the stack. Those entries are not only clutter: an entry whose branch
        # is gone costs `gh stack rebase` the base it should be rebasing onto,
        # and it replays the trunk's own history instead. So the record is
        # tidied here, where the branches were just deleted, rather than left
        # to surprise the next rebase.
        #
        # The record is per worktree — stack-forget-merged.py resolves it with
        # `git rev-parse --git-path gh-stack` — so this tidies the checkout it
        # is run from and no other. That is exactly why a sweep has to visit
        # each one rather than tidying up centrally.
        python3 scripts/stack-forget-merged.py || return 1

        # Exit 1 means "no stack here". That is the ordinary ending for a sync
        # — the last branch merging deletes the stack, so the run that tidies
        # it up is the one guaranteed to find nothing left to draw. The
        # script's own message advises starting a new stack, which is not the
        # point here, so its output is held back and the outcome is reported
        # instead. Any other exit code is a real fault.
        local drawn=""
        local draw_status=0
        drawn=$(python3 scripts/stack-status.py --prs --colour 2>&1) || draw_status=$?
        if [ "${draw_status}" -eq 0 ]; then
            printf '%s\n' "${drawn}"
        elif [ "${draw_status}" -eq 1 ]; then
            echo "  Stack fully merged — nothing left to draw."
        else
            printf '%s\n' "${drawn}" >&2
            return "${draw_status}"
        fi
        return 0
    }

    if [ "{{scope}}" != "a" ]; then
        sync_one "$(pwd)"
        exit $?
    fi

    # A sweep. Unlike `prune-branches a`, which only deletes local refs, this
    # cascade-rebases and force-pushes in every worktree it visits, so it says
    # what it is about to do and names each worktree as it goes.
    ROOT=$(git rev-parse --path-format=absolute --git-common-dir)
    ROOT=$(dirname "${ROOT}")
    PARENT=$(dirname "${ROOT}")

    failed=0
    while IFS= read -r WT; do
        # Worktrees outside the checkout's own parent directory are not part
        # of the working set: agent sessions leave detached ones under
        # /private/tmp, and a sweep that force-pushed from one of those would
        # be acting on a checkout nobody is watching.
        case "${WT}" in
            "${PARENT}"/*) ;;
            *) continue ;;
        esac
        echo ""
        echo "▸ $(basename "${WT}")"
        # A subshell, so sync_one's `cd` cannot leak into the next iteration.
        ( sync_one "${WT}" ) || failed=1
    done < <(git worktree list --porcelain | awk '/^worktree /{print $2}')

    if [ "${failed}" -ne 0 ]; then
        echo ""
        echo "✗ At least one worktree did not sync cleanly — see above." >&2
        exit 1
    fi


alias stu := stack-update
# Fold changes into this branch's last commit (message optional, to reword it)
stack-update message="":
    #!/usr/bin/env bash
    {{initialise}} "stack-update"
    set -euo pipefail
    # The counterpart to stack-new and stack-add, which both create a branch.
    # This one revises the branch already checked out — the ordinary case when
    # a review comment, or a second pass over generated code, changes a unit
    # that already exists.
    #
    # It amends rather than adding a commit, because a stacked branch reads
    # best as one commit doing one thing: that is the unit being reviewed. A
    # branch that accumulates "fix: typo" on top of its real change is how a
    # two-unit stack became four branches on the first real run of this
    # tooling. Amending keeps each branch to its single, finished commit.
    #
    # Either way the branches above this one must be rebased afterwards, so
    # amending costs nothing extra: a plain commit leaves them behind just as
    # surely, only less visibly. `stack-rebase` is the repair, and
    # `stack-log` flags what still needs it.
    #
    # No stack guard: amending the branch you have checked out touches nothing
    # another worktree holds. `stack-submit` runs the guard when this work is
    # pushed — and pushes with --force-with-lease, which an amended branch
    # needs and a stack does on every submit anyway.
    if git diff --quiet && git diff --cached --quiet && \
       [ -z "$(git ls-files --others --exclude-standard)" ] && \
       [ -z "{{message}}" ]; then
        echo "Nothing to fold in — the working tree is clean." >&2
        echo "  Pass a message to reword the last commit on its own." >&2
        exit 1
    fi
    # -A to match stack-new and stack-add: all three stage everything,
    # untracked files included, so the three commands cannot differ in what
    # they quietly leave behind.
    git add -A
    if [ -n "{{message}}" ]; then
        git commit --amend -m "{{message}}"
    else
        # --no-edit keeps the existing message rather than opening an editor,
        # which would hang anywhere non-interactive.
        git commit --amend --no-edit
    fi

    # Amending rewrote this branch's commit, so every branch above it now sits
    # on a commit that no longer exists. Rebasing is not optional afterwards —
    # it is the other half of the same operation — so it runs here rather than
    # being left as something to remember. `stack-rebase` carries the worktree
    # guard and the check that catches a rebase which reported success and
    # silently skipped a branch.
    #
    # Skipped when this branch is not in a stack: there is nothing above it to
    # restack, and `stack-rebase` would refuse for want of a stack rather than
    # for any real problem. That also lets this recipe be used on an ordinary
    # branch, which is worth having.
    # --check exits 0 in a stack, 1 when this branch is in none, and 2 when a
    # stack branch is checked out in another worktree. Only 1 means "nothing
    # above to restack"; 2 is a real problem and must still reach the guard
    # inside stack-rebase rather than being quietly taken for "no stack".
    stack_state=0
    python3 scripts/stack-status.py --check >/dev/null 2>&1 || stack_state=$?
    if [ "${stack_state}" -eq 1 ]; then
        echo "  Amended. Not in a stack, so nothing above needs rebasing."
    else
        just stack-rebase
    fi


alias stw := stack-watch
# Redraw the stack with pull request and CI state every minute, until stopped
stack-watch:
    #!/usr/bin/env bash
    set +x
    {{initialise}} "stack-watch"
    set +x
    # `stack-log-long` in a loop. A minute is the cadence because CI state
    # does not change faster than that in any way worth watching, and one
    # `gh pr list` a minute is 60 calls an hour against a 5000-point limit.
    #
    # Not `watch(1)`: macOS does not ship it, and this needs to survive the
    # script exiting non-zero when there is no stack.
    while true; do
        # Fetch first, then clear. Clearing before the ~3s `gh pr list` call
        # left the terminal blank for the whole of it, which read as a hang;
        # capturing the new stack first means the old one stays on screen
        # until the moment it is replaced.
        #
        # `--colour` because capturing makes stdout a pipe, and the script
        # drops colour when it is not a terminal. `|| true` for the same
        # reason `stack-log` has it: "no stack here" is an ordinary answer,
        # and the loop should keep drawing it rather than dying on it.
        drawn=$(python3 scripts/stack-status.py --prs --colour 2>&1 || true)

        # \033[H homes the cursor, \033[2J clears the screen and \033[3J the
        # scrollback. The third matters: without it the previous draw is
        # only pushed up rather than thrown away, so a stack taller than
        # the window leaves the older copy above the new one and the
        # status line scrolls out of sight with it.
        printf '\033[H\033[2J\033[3J'
        echo "  updated $(date '+%H:%M:%S') · every 60s · ctrl-c to stop"
        printf '%s\n' "${drawn}"
        sleep 60
    done


alias sd := start-dev
# Start the dev app (build: 'b' will also build the images)
start-dev build="":
    #!/usr/bin/env bash
    {{initialise}} "start-dev"

    just _start-docker-daemon
    echo "Access the frontend at: http://$(ipconfig getifaddr en0)"

    # Ctrl-C takes the stack down, the same as `just st` and the same as
    # `just sc` would. A foreground `up` already stops the containers on
    # its own, but it leaves them stopped rather than removed, so the
    # next `up` reuses them and a `down` is still owed. Doing it here
    # means one interrupt leaves nothing behind either way.
    #
    # `COMPOSE_PROFILES=clinical` because the clinical services are
    # behind a profile and a `down` without it leaves them running.
    trap 'echo; echo "Stopping the stack..."; \
        COMPOSE_PROFILES=clinical \
        docker compose -f compose.dev.yml down' INT TERM

    build_args=""
    if [ "{{build}}" = "b" ]; then
        COMPOSE_PROFILES=clinical docker compose -f compose.dev.yml down
        docker volume rm -f quillmedical_frontend_node_modules >/dev/null 2>&1 || true
        cd frontend && yarn install && cd ..
        cd backend && poetry lock && poetry install && cd ..
        build_args="--build --pull missing"
    fi

    # Detached first, so the migrations can run before the logs are
    # attached, exactly as `start-teaching` does it. `--wait` holds until
    # every service reports healthy, which is what makes the `alembic`
    # call below safe.
    #
    # Without this step the stack came up against whatever schema the
    # database happened to have. A migration that arrived from `main`, or
    # one written in another worktree, had never touched it, and the
    # symptom was a 500 from a column that exists in the models and not
    # in Postgres, a long way from its cause.
    # shellcheck disable=SC2086
    COMPOSE_PROFILES=clinical docker compose -f compose.dev.yml up \
        --detach --wait --wait-timeout 180 ${build_args}

    just _migrate-running-stack

    # Then follow the logs, which is what a foreground `up` left you
    # with and what anybody running this expects. The trap above turns
    # Ctrl-C back into a full `down`.
    COMPOSE_PROFILES=clinical docker compose -f compose.dev.yml logs --follow


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

    build_args=""
    if [ "{{build}}" = "b" ]; then
        docker compose -f compose.dev.yml down
        docker volume rm -f quillmedical_frontend_node_modules >/dev/null 2>&1 || true
        cd frontend && yarn install && cd ..
        cd backend && poetry lock && poetry install && cd ..
        build_args="--build --pull missing"
    fi

    # Detached first, so the migrations can run before the logs are
    # attached. `--wait` holds until every service reports healthy,
    # which is what makes the `alembic` call below safe: postgres-core
    # has a health check and the backend depends on it.
    #
    # Without this step the stack came up against whatever schema the
    # database happened to have. A migration that arrived from `main`,
    # or one written in another worktree, had never touched it, and the
    # symptom was a 500 from a column that exists in the models and not
    # in Postgres — a long way from its cause.
    # shellcheck disable=SC2086
    CLINICAL_SERVICES_ENABLED=false docker compose -f compose.dev.yml up \
        --detach --wait --wait-timeout 180 ${build_args}

    just _migrate-running-stack

    # Now follow the logs, which is what this recipe looked like before
    # and what anybody running it expects to be left with.
    #
    # Ctrl-C stops the stack, matching `just sd` and matching what a
    # foreground command is expected to do. The containers belong to the
    # Docker daemon rather than to this shell, so nothing here owns them
    # and nothing is cleaned up on the way out: without this trap the
    # log follower died and the stack was left running, which is how a
    # forgotten stack came to serve another worktree.
    #
    # On the trap rather than on `up` in the foreground, because the
    # migrations have to run between the stack becoming healthy and the
    # logs being followed, and a foreground `up` leaves no moment to run
    # them in.
    # `COMPOSE_PROFILES=clinical` for the same reason `just sc` carries
    # it: the clinical services are behind a profile, and a `down`
    # without it leaves them running. This recipe never starts them, but
    # an earlier `just sd` in the same worktree may have.
    trap 'echo; echo "Stopping the stack..."; \
        COMPOSE_PROFILES=clinical \
        docker compose -f compose.dev.yml down' INT TERM

    docker compose -f compose.dev.yml logs --follow

alias sc := stop
# Stop the containers
stop:
    #!/usr/bin/env bash
    {{initialise}} "stop"
    COMPOSE_PROFILES=clinical docker compose -f compose.dev.yml down


alias ub := unit-tests-backend
# Run the backend unit tests (in a throwaway container mounting this worktree)
unit-tests-backend *ARGS:
    #!/usr/bin/env bash
    {{initialise}} "unit-tests-backend"
    # Runs from the shared dev image against THIS worktree's checkout, so it
    # needs neither the dev stack nor ownership of it. `run` builds the image
    # if it is missing. In-memory SQLite: no database service involved.
    docker compose -p "$(just _test-project)" -f compose.unit-tests.yml \
        run --rm backend sh -lc "pytest -q -m 'not integration' {{ARGS}}"


alias uf := unit-tests-frontend
# Run the frontend unit tests (in a throwaway container mounting this worktree)
unit-tests-frontend *ARGS:
    #!/usr/bin/env bash
    {{initialise}} "unit-tests-frontend"
    # As for `ub`: shared image, this worktree mounted, per-worktree
    # node_modules volumes seeded from the image on first use. If a branch
    # changes package.json, `just utr` resets those volumes.
    docker compose -p "$(just _test-project)" -f compose.unit-tests.yml \
        run --rm frontend sh -lc "yarn unit-test:run {{ARGS}}"


alias utr := unit-tests-reset
# Rebuild the test images and drop this worktree's node_modules test volumes
unit-tests-reset:
    #!/usr/bin/env bash
    {{initialise}} "unit-tests-reset"
    # For when a branch changes dependencies: the per-worktree volumes were
    # seeded from an older image and would otherwise keep the old packages.
    docker compose -p "$(just _test-project)" -f compose.unit-tests.yml \
        down --volumes --remove-orphans
    docker compose -f compose.unit-tests.yml build --pull


alias ts := test-scripts
# Run the shell script tests where CI runs them (ubuntu-24.04 container)
test-scripts *ARGS:
    #!/usr/bin/env bash
    {{initialise}} "test-scripts"

    just _start-docker-daemon

    # Nothing from the repository is needed to build the image — it is mounted at
    # run time — so the Dockerfile goes in on stdin with no build context at all.
    # Rebuilds are a cache hit unless the Dockerfile itself changes.
    docker build --quiet --tag quill-shell-tests - < .github/Dockerfile

    # Mounted read-only: a test that writes into the working tree is a bug, and
    # this is where it should surface rather than on someone's machine.
    run_suite() {
        docker run --rm --volume "$PWD:/repo:ro" quill-shell-tests \
            bash .github/scripts/ci/run-shell-tests.sh "$1"
    }

    # With no argument, run exactly what CI runs: both targets, in order.
    if [ -n "{{ARGS}}" ]; then
        run_suite "{{ARGS}}"
    else
        run_suite .github/scripts
        run_suite .claude/hooks
    fi


alias ee := e2e
# Run the end-to-end tests against a fresh CI-identical stack for this worktree
e2e *ARGS:
    #!/usr/bin/env bash
    {{initialise}} "e2e"
    # Playwright runs on the host, but the app it drives is this worktree's
    # own compose.ci.yml stack on a free port — not the dev stack — so this
    # works from any worktree and matches what CI runs. See `_e2e-up`.
    just _e2e-run {{ARGS}}


alias eer := e2e-report
# Run end-to-end tests, then open the Playwright HTML report
e2e-report:
    #!/usr/bin/env bash
    {{initialise}} "e2e-report"
    just _e2e-run && cd frontend && npx playwright show-report


alias eeu := e2e-ui
# Run the end-to-end tests in interactive UI mode
e2e-ui:
    #!/usr/bin/env bash
    {{initialise}} "e2e-ui"
    just _e2e-run --ui


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
    # `app` is the only environment. teaching, staging and production were
    # retired in Batches 8 and 10a of
    # docs/docs/plans/2026-09-18-environment-isolation-and-iap-plan.md; a
    # later dev or ehr environment is a new project, added here when it
    # exists.
    case "{{env}}" in
        app) echo "quill-medical-app" ;;
        *)   echo "ERROR: env must be app" >&2; exit 1 ;;
    esac


alias ba := build-admin
# Build and push the admin Docker image to a remote environment (app)
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


alias bc := build-caption
# Build and push the video caption Docker image (teaching only)
build-caption env:
    #!/usr/bin/env bash
    {{initialise}} "build-caption ({{env}})"
    set -euo pipefail

    if [ "{{env}}" != "app" ]; then
        echo "ERROR: the caption job exists only in app, the environment with the video buckets" >&2
        exit 1
    fi

    PROJECT=$(just _gcp_env_project "{{env}}")
    REGION="europe-west2"
    REGISTRY="${REGION}-docker.pkg.dev"
    IMAGE="${REGISTRY}/${PROJECT}/quill/caption:latest"

    # Its own Dockerfile rather than a target: Whisper pulls torch, which
    # has no business in the image the API serves from. Expect this build
    # to be slow and the image to be several gigabytes.
    echo "Building caption image for ${PROJECT}..."
    gcloud auth configure-docker "$REGISTRY" --quiet

    docker build \
        --platform linux/amd64 \
        -t "$IMAGE" \
        -f backend/Dockerfile.caption \
        .

    echo "Pushing ${IMAGE}..."
    docker push "$IMAGE"
    echo "✓ Caption image pushed to ${IMAGE}"

    # Reads and writes the processed bucket only: the transcode job has
    # usually deleted the master by the time captions are wanted, so the
    # 720p rendition is the input.
    PROCESSED_BUCKET="quill-teaching-videos-processed-{{env}}"

    echo "Deploying Cloud Run Job..."
    gcloud run jobs deploy "quill-caption-{{env}}" \
        --project="$PROJECT" \
        --region="$REGION" \
        --image="$IMAGE" \
        --vpc-connector="quill-vpc-cx-{{env}}" \
        --vpc-egress=private-ranges-only \
        --max-retries=0 \
        --task-timeout=3600s \
        --cpu=4 \
        --memory=10Gi \
        --set-env-vars "TEACHING_VIDEOS_BUCKET=${PROCESSED_BUCKET}" \
        --quiet
    echo "✓ Cloud Run Job deployed"


alias bt := build-transcode
# Build and push the video transcode Docker image (teaching only)
build-transcode env:
    #!/usr/bin/env bash
    {{initialise}} "build-transcode ({{env}})"
    set -euo pipefail

    if [ "{{env}}" != "app" ]; then
        echo "ERROR: the transcode job exists only in app, the environment with the video buckets" >&2
        exit 1
    fi

    PROJECT=$(just _gcp_env_project "{{env}}")
    REGION="europe-west2"
    REGISTRY="${REGION}-docker.pkg.dev"
    IMAGE="${REGISTRY}/${PROJECT}/quill/transcode:latest"

    echo "Building transcode image for ${PROJECT}..."
    gcloud auth configure-docker "$REGISTRY" --quiet

    docker build \
        --target transcode \
        --platform linux/amd64 \
        -t "$IMAGE" \
        -f backend/Dockerfile \
        .

    echo "Pushing ${IMAGE}..."
    docker push "$IMAGE"
    echo "✓ Transcode image pushed to ${IMAGE}"

    # Terraform owns these names and sets the same two variables on the job
    # it manages. Spelled out again here because this recipe deploys the job
    # directly, without reading Terraform state — the naming pattern is fixed
    # in the pipeline module, so the two agree as long as that does.
    SOURCE_BUCKET="quill-teaching-videos-source-{{env}}"
    PROCESSED_BUCKET="quill-teaching-videos-processed-{{env}}"

    echo "Deploying Cloud Run Job..."
    gcloud run jobs deploy "quill-transcode-{{env}}" \
        --project="$PROJECT" \
        --region="$REGION" \
        --image="$IMAGE" \
        --vpc-connector="quill-vpc-cx-{{env}}" \
        --vpc-egress=private-ranges-only \
        --max-retries=0 \
        --task-timeout=1200s \
        --cpu=4 \
        --memory=4Gi \
        --set-env-vars "TEACHING_VIDEOS_SOURCE_BUCKET=${SOURCE_BUCKET},TEACHING_VIDEOS_BUCKET=${PROCESSED_BUCKET}" \
        --quiet
    echo "✓ Cloud Run Job deployed"


alias ccs := check-competency-seeding
# List users who would lose a competency when only their rows count (should list nobody)
check-competency-seeding env:
    #!/usr/bin/env bash
    {{initialise}} "check-competency-seeding ({{env}})"
    set -euo pipefail

    PROJECT=$(just _gcp_env_project "{{env}}")
    REGION="europe-west2"

    echo "Check competency seeding on ${PROJECT}"
    echo "─────────────────────────────────"

    gcloud run jobs execute "quill-admin-{{env}}" \
        --project="$PROJECT" \
        --region="$REGION" \
        --update-env-vars "ADMIN_ACTION=check-competency-seeding" \
        --wait


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
# Run pending Alembic migrations on a remote environment (the deploy does this automatically; use for manual re-runs)
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


alias psd := passport-delete
# Delete a test holder's passport, archived for 30 days (dry run unless confirm is the passport id)
passport-delete env username confirm="":
    #!/usr/bin/env bash
    {{initialise}} "passport-delete ({{env}})"
    set -euo pipefail

    PROJECT=$(just _gcp_env_project "{{env}}")
    REGION="europe-west2"

    # Only holders listed in PASSPORT_DELETABLE_USER_IDS, set in Terraform,
    # can be deleted. Without confirm this only reports, and prints the
    # passport id to pass back. See delete_passport() in
    # backend/scripts/admin_cli.py.
    # Checked here because both go into a comma-separated list of
    # variables, where a stray comma would set something else.
    if ! [[ "{{username}}" =~ ^[A-Za-z0-9._@+-]+$ ]]; then
        echo "✗ '{{username}}' is not a username" >&2
        exit 1
    fi
    if [ -n "{{confirm}}" ] && ! [[ "{{confirm}}" =~ ^[0-9a-f]{32}$ ]]; then
        echo "✗ confirm must be the 32-character passport id from a dry run" >&2
        exit 1
    fi

    VARS="ADMIN_ACTION=delete-passport,ADMIN_USERNAME={{username}}"
    if [ -n "{{confirm}}" ]; then
        VARS="${VARS},CONFIRM={{confirm}}"
        echo "Delete {{username}}'s passport on ${PROJECT}"
    else
        echo "Dry run: {{username}}'s passport on ${PROJECT}"
    fi
    echo "─────────────────────────────────"

    EXECUTION=$(gcloud run jobs execute "quill-admin-{{env}}" \
        --project="$PROJECT" \
        --region="$REGION" \
        --update-env-vars "$VARS" \
        --wait \
        --format='value(metadata.name)') || STATUS=$?

    # The job prints to Cloud Logging rather than to this terminal, so
    # its report is read back from there.
    if [ -n "${EXECUTION:-}" ]; then
        gcloud logging read \
            "resource.type=cloud_run_job AND labels.\"run.googleapis.com/execution_name\"=${EXECUTION}" \
            --project="$PROJECT" \
            --order=asc \
            --freshness=1h \
            --format='value(textPayload)'
    fi
    exit "${STATUS:-0}"


alias na := notifier-app
# Build the Quill-branded macOS notifier used by the Stop-hook banner (macOS only, one-off)
notifier-app:
    #!/usr/bin/env bash
    {{initialise}} "notifier-app"
    set -euo pipefail

    ./scripts/build-notifier-app.sh
