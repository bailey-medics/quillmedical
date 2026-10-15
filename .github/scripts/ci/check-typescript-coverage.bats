#!/usr/bin/env bats
# Tests for check-typescript-coverage.sh
#
# git and yarn are stubbed onto PATH. The git stub names the repository
# root and lists the source files the test says are tracked, relative to
# it; the yarn stub answers `tsc --listFilesOnly` with the files the test
# says each project includes.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/check-typescript-coverage.sh"
  STUBS="${BATS_TEST_TMPDIR}/stubs"
  ROOT="${BATS_TEST_TMPDIR}/repo"
  mkdir -p "$STUBS" "${ROOT}/frontend"

  cat > "${ROOT}/frontend/package.json" <<'JSON'
{ "scripts": { "typecheck:all": "yarn generate:types && tsc --project app.json --noEmit && tsc --project site.json --noEmit" } }
JSON

  # TRACKED: the files git lists, one per line, from the root.
  cat > "${STUBS}/git" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = "rev-parse" ]; then
  echo "$ROOT"
  exit 0
fi
printf '%s\n' "$TRACKED"
STUB

  # COVERED_<project>: the files that project includes, one per line,
  # printed as tsc prints them, with the absolute folder in front.
  cat > "${STUBS}/yarn" <<'STUB'
#!/usr/bin/env bash
project=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "--project" ]; then project="$argument"; fi
  previous="$argument"
done
variable="COVERED_${project%.json}"
while read -r file; do
  [ -n "$file" ] && echo "${ROOT}/${file}"
done <<<"${!variable:-}"
echo "${ROOT}/frontend/node_modules/typescript/lib/lib.dom.d.ts"
STUB
  chmod +x "${STUBS}/git" "${STUBS}/yarn"
  PATH="${STUBS}:${PATH}"
  cd "${ROOT}/frontend"

  # Enough files to clear the floor, all covered by the app project.
  TRACKED="$(for number in $(seq 1 600); do echo "frontend/src/file${number}.ts"; done)"
  COVERED_app="$TRACKED"
  COVERED_site=""
  export ROOT TRACKED COVERED_app COVERED_site
}

@test "passes when every file is TypeScript in a project typecheck:all runs" {
  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
  [[ "$output" == *"all 600 source files"* ]]
}

@test "reads the projects from typecheck:all, so a second one counts" {
  TRACKED="${TRACKED}"$'\n'"frontend/site/page.tsx"
  COVERED_site="frontend/site/page.tsx"

  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
}

@test "fails on a JavaScript file and names it" {
  TRACKED="${TRACKED}"$'\n'"frontend/public/stray.js"
  COVERED_app="${COVERED_app}"$'\n'"frontend/public/stray.js"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"JavaScript"* ]]
  [[ "$output" == *"frontend/public/stray.js"* ]]
}

@test "fails on a .cjs or .mjs file too" {
  TRACKED="${TRACKED}"$'\n'"a.cjs"$'\n'"b.mjs"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"a.cjs"* ]]
  [[ "$output" == *"b.mjs"* ]]
}

@test "fails on a TypeScript file no project includes, and names it" {
  TRACKED="${TRACKED}"$'\n'"frontend/nowhere/lost.ts"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"in no project"* ]]
  [[ "$output" == *"frontend/nowhere/lost.ts"* ]]
}

@test "leaves out generated files and declarations" {
  TRACKED="${TRACKED}"$'\n'"frontend/src/generated/brand.ts"$'\n'"frontend/src/vite-env.d.ts"

  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
}

@test "fails when it finds too few files to have looked in the right place" {
  TRACKED="frontend/src/only.ts"
  COVERED_app="frontend/src/only.ts"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"is this the repository?"* ]]
}

@test "fails on a JavaScript file outside frontend/ too" {
  TRACKED="${TRACKED}"$'\n'"tools/marks/extension.js"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"tools/marks/extension.js"* ]]
}

@test "fails on a TypeScript file outside frontend/ that no project includes" {
  TRACKED="${TRACKED}"$'\n'"tools/marks/extension.ts"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"in no project"* ]]
  [[ "$output" == *"tools/marks/extension.ts"* ]]
}

@test "passes a TypeScript file outside frontend/ that a project includes" {
  TRACKED="${TRACKED}"$'\n'"tools/marks/extension.ts"
  COVERED_site="tools/marks/extension.ts"

  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
}

@test "runs the same from the repository root" {
  cd "$ROOT"

  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
}
