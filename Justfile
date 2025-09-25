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

alias d := docs
# Open the documentation in the browser
docs:
    #!/usr/bin/env bash
    {{initialise}} "docs"
    mkdocs serve -f docs/mkdocs.yml & sleep 2
    open http://127.0.0.1:8000


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


alias m := migrate
# Run the database migrations
migrate message:
    #!/usr/bin/env bash
    {{initialise}} "migrate - {{message}}"
    just eb
    alembic revision -m "{{message}}" --autogenerate
    alembic upgrade head


alias pc := pre-commit
# Run pre-commit checks
pre-commit:
    #!/usr/bin/env bash
    {{initialise}} "pre-commit"
    pre-commit run --all-files


alias pi := poetry-install
# Install the poetry dependencies
poetry-install:
    #!/usr/bin/env bash
    {{initialise}} "poetry-install"
    cd backend
    poetry lock
    poetry install


alias pp := poetry-path
# Show the poetry path
poetry-path:
    #!/usr/bin/env bash
    {{initialise}} "poetry-path"
    cd backend
    poetry env info -p
    echo "To activate the poetry environment, open the Command Palette (Cmd+Shift+P) type in 'Python: Select Interpreter' and then select 'Enter interpreter path's. Then paste the path above."


alias sb := storybook
# Run yarn install in the frontend container
storybook:
    #!/usr/bin/env bash
    {{initialise}} "storybook"
    cd frontend
    yarn storybook


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

    echo "Access the frontend at: http://$(ipconfig getifaddr en0)"

    if [ "{{build}}" = "b" ]; then \
        docker compose -f compose.dev.yml down
        docker volume rm -f quillmedical_frontend_node_modules >/dev/null 2>&1 || true
        cd frontend && yarn install && cd ..
        cd backend && poetry lock && poetry install && cd ..
        docker compose -f compose.dev.yml up --build; \
    else \
        docker compose -f compose.dev.yml up; \
    fi

alias sp := start-prod
# Start the dev app (build: 'b' will also build the images)
start-prod build="":
    #!/usr/bin/env bash
    {{initialise}} "start-prod"
    if [ "{{build}}" = "b" ]; then \
        docker compose -f compose.yml -f compose.prod.yml up --build; \
    else \
        docker compose -f compose.yml -f compose.prod.yml up; \
    fi

alias sc := stop
# Stop the containers
stop:
    #!/usr/bin/env bash
    {{initialise}} "stop"
    docker compose -f compose.yml -f compose.dev.yml down
    docker compose -f compose.yml -f compose.prod.yml down

alias ub := unit-tests-backend
# Run the backend unit tests
unit-tests-backend:
    #!/usr/bin/env bash
    {{initialise}} "unit-tests-backend"
    cd backend
    poetry run pytest -q


alias yi := yarn-install
# Run yarn install in the frontend container
yarn-install:
    #!/usr/bin/env bash
    {{initialise}} "yarn-install"
    cd frontend
    yarn install
