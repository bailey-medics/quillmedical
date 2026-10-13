#!/usr/bin/env bats
# Holds the infrastructure to one answer about which environments are
# production.
#
# The database's protections used to ask `var.environment == "prod"`
# wherever they were needed. The environment that is live is called `app`,
# so the answer was always no: on 13 October 2026 App production was found
# with deletion protection off, seven backups kept where thirty were meant
# and point-in-time recovery off. The question is now asked once, as
# local.is_production in infra/main.tf, and this fails if it is ever asked
# again anywhere else.
#
# infra/aws and infra/github are other Terraform roots, with no
# environments of this kind, and are left out.

setup() {
  INFRA="${BATS_TEST_DIRNAME}/../../../infra"
}

# Every comparison of the environment's name with "prod", outside the two
# other roots. A comment that quotes one, to say why it went, is not one.
comparisons_with_prod() {
  grep -rnE '(==|!=)[[:space:]]*"prod"' "$INFRA" --include='*.tf' \
    | grep -vE "/infra/(aws|github)/" \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' || true
}

@test "nothing compares the environment's name with prod" {
  found="$(comparisons_with_prod)"

  [ -z "$found" ] || { echo "ask local.is_production instead: ${found}"; false; }
}

@test "production is worked out in one place, and app is production" {
  line="$(grep -E '^[[:space:]]*is_production[[:space:]]*=[[:space:]]*contains\(' "${INFRA}/main.tf")"

  [ "$(wc -l <<<"$line" | tr -d ' ')" = "1" ]
  [[ "$line" == *'"app"'* ]]
  [[ "$line" == *'"prod"'* ]]
}

@test "every database is told whether it is production" {
  # Three databases, and a module with no default so none can be missed.
  [ "$(grep -cE '^[[:space:]]*is_production[[:space:]]*=[[:space:]]*local\.is_production' "${INFRA}/main.tf")" -ge 4 ]
  run grep -A3 'variable "is_production"' "${INFRA}/modules/cloud-sql/variables.tf"

  [[ "$output" == *"type"*"bool"* ]]
  [[ ! "$output" =~ default[[:space:]]*= ]]
}

@test "the database is guarded three ways" {
  module="${INFRA}/modules/cloud-sql/main.tf"

  grep -qE '^[[:space:]]*deletion_protection[[:space:]]*=[[:space:]]*var\.is_production' "$module"
  grep -qE '^[[:space:]]*deletion_protection_enabled[[:space:]]*=[[:space:]]*var\.is_production' "$module"
  grep -qE '^[[:space:]]*prevent_destroy[[:space:]]*=[[:space:]]*true' "$module"
  grep -qE '^[[:space:]]*retain_backups_on_delete[[:space:]]*=[[:space:]]*true' "$module"
}
