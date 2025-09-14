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


alias ef := enter-frontend
# Enter the frontend container shell
enter-frontend:
    #!/usr/bin/env bash
    {{initialise}} "enter-frontend"
    docker exec -it quill_frontend /bin/sh

alias sb := storybook
# Run yarn install in the frontend container
storybook:
    #!/usr/bin/env bash
    {{initialise}} "storybook"
    cd frontend
    yarn storybook
    

alias sd := start-dev
# Start the dev app (build: 'b' will also build the images)
start-dev build="":
    #!/usr/bin/env bash
    {{initialise}} "start-dev"

    echo "Access the frontend at: http://$(ipconfig getifaddr en0)"

    if [ "{{build}}" = "b" ]; then \
        docker compose -f compose.dev.yml down
        docker volume rm -f quillmedical_frontend_node_modules >/dev/null 2>&1 || true
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


alias yi := yarn-install
# Run yarn install in the frontend container
yarn-install:
    #!/usr/bin/env bash
    {{initialise}} "yarn-install"
    cd frontend
    yarn install
    