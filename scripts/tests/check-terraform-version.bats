#!/usr/bin/env bats
# Tests for check-terraform-version.sh, which keeps every Terraform
# version in the repository equal to the one in .terraform-version.
#
# Each test builds a small repository holding a pin, two configurations
# and a workflow, all agreeing, then breaks the one thing it is about.
# `terraform` is stubbed onto PATH, so the host check does not pass or
# fail on the Terraform of the machine it runs on.

bats_require_minimum_version 1.5.0

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../check-terraform-version.sh"
    REPO="${BATS_TEST_TMPDIR}/repo"
    STUBS="${BATS_TEST_TMPDIR}/stubs"
    mkdir -p "${REPO}/infra/aws" "${REPO}/infra/github" "${REPO}/.github/workflows" "$STUBS"

    echo "1.15.8" > "${REPO}/.terraform-version"
    floor_in infra/aws/main.tf ">= 1.15.8"
    floor_in infra/github/branch_rules.tf ">= 1.15.8"
    workflow_with '${{ steps.terraform-version.outputs.version }}'

    # HOST_TERRAFORM is the version `terraform` on the PATH is. It starts
    # on the pinned one. Set to `none`, there is no terraform to ask.
    cat > "${STUBS}/terraform" <<'EOF'
#!/usr/bin/env bash
if [ "${HOST_TERRAFORM:-}" = "none" ]; then
    exit 127
fi
echo "Terraform v${HOST_TERRAFORM:-1.15.8}"
echo "on linux_amd64"
EOF
    chmod +x "${STUBS}/terraform"
    PATH="${STUBS}:${PATH}"

    cd "$REPO" || return
}

# Writes a configuration whose terraform block asks for the floor given.
floor_in() {
    local file="$1"
    local floor="$2"

    cat > "${REPO}/${file}" <<EOF
terraform {
  required_version = "${floor}"
}
EOF
}

# Writes a workflow whose setup-terraform step is given the version given.
workflow_with() {
    local version="$1"

    cat > "${REPO}/.github/workflows/terraform.yml" <<EOF
jobs:
  plan:
    steps:
      - name: Set up Terraform
        uses: hashicorp/setup-terraform@v4
        with:
          terraform_version: ${version}
EOF
}

@test "passes, and says nothing, when everything matches the pin" {
    run bash "$SCRIPT"

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "refuses a floor below the pin, and names the file and the fix" {
    floor_in infra/github/branch_rules.tf ">= 1.6.4"

    run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"infra/github/branch_rules.tf:2"* ]]
    [[ "$output" == *'required_version = ">= 1.15.8"'* ]]
}

@test "refuses a floor written another way, even for the same version" {
    floor_in infra/aws/main.tf "~> 1.15.8"

    run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"infra/aws/main.tf"* ]]
}

@test "skips the provider downloads under .terraform" {
    mkdir -p "${REPO}/infra/aws/.terraform/modules"
    floor_in infra/aws/.terraform/modules/main.tf ">= 0.12"

    run bash "$SCRIPT"

    [ "$status" -eq 0 ]
}

@test "refuses an infra folder with no floor at all" {
    rm "${REPO}/infra/aws/main.tf" "${REPO}/infra/github/branch_rules.tf"

    run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *"No required_version was found"* ]]
}

@test "refuses a workflow that pins a version of its own" {
    workflow_with '"1.15.8"'

    run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *".github/workflows/terraform.yml:7"* ]]
    [[ "$output" == *"steps.terraform-version.outputs.version"* ]]
}

@test "refuses when there is no .terraform-version" {
    rm "${REPO}/.terraform-version"

    run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *".terraform-version is not here"* ]]
}

@test "refuses a .terraform-version that is not a version" {
    echo "latest" > "${REPO}/.terraform-version"

    run bash "$SCRIPT"

    [ "$status" -eq 1 ]
    [[ "$output" == *'holds "latest"'* ]]
}

@test "refuses an unknown argument" {
    run bash "$SCRIPT" everything

    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown argument: everything"* ]]
}

@test "host: passes on the pinned Terraform" {
    run bash "$SCRIPT" host

    [ "$status" -eq 0 ]
    [ -z "$output" ]
}

@test "host: passes on a newer patch release of the pinned Terraform" {
    HOST_TERRAFORM=1.15.9 run bash "$SCRIPT" host

    [ "$status" -eq 0 ]
}

@test "host: refuses an older Terraform, and says which" {
    HOST_TERRAFORM=1.15.7 run bash "$SCRIPT" host

    [ "$status" -eq 1 ]
    [[ "$output" == *"is Terraform 1.15.7"* ]]
    [[ "$output" == *"pinned to 1.15.8"* ]]
}

@test "host: refuses a newer minor Terraform" {
    HOST_TERRAFORM=1.17.1 run bash "$SCRIPT" host

    [ "$status" -eq 1 ]
    [[ "$output" == *"is Terraform 1.17.1"* ]]
}

@test "host: refuses when there is no terraform" {
    HOST_TERRAFORM=none run bash "$SCRIPT" host

    [ "$status" -eq 1 ]
    [[ "$output" == *"There is no terraform on the PATH"* ]]
}

@test "host: does not look at the floors" {
    floor_in infra/aws/main.tf ">= 1.6.4"

    run bash "$SCRIPT" host

    [ "$status" -eq 0 ]
}
