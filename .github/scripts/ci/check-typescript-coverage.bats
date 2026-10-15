#!/usr/bin/env bats
# Tests for check-typescript-coverage.sh
#
# git and yarn are stubbed onto PATH. The git stub lists the source files
# the test says are tracked; the yarn stub answers `tsc --listFilesOnly`
# with the files the test says each project includes.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/check-typescript-coverage.sh"
  STUBS="${BATS_TEST_TMPDIR}/stubs"
  WORK="${BATS_TEST_TMPDIR}/frontend"
  mkdir -p "$STUBS" "$WORK"

  cat > "${WORK}/package.json" <<'JSON'
{ "scripts": { "typecheck:all": "yarn generate:types && tsc --project app.json --noEmit && tsc --project site.json --noEmit" } }
JSON

  # TRACKED: the files git lists, one per line.
  cat > "${STUBS}/git" <<'STUB'
#!/usr/bin/env bash
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
  [ -n "$file" ] && echo "${PWD}/${file}"
done <<<"${!variable:-}"
echo "${PWD}/node_modules/typescript/lib/lib.dom.d.ts"
STUB
  chmod +x "${STUBS}/git" "${STUBS}/yarn"
  PATH="${STUBS}:${PATH}"
  cd "$WORK"

  # Enough files to clear the floor, all covered by the app project.
  TRACKED="$(for number in $(seq 1 600); do echo "src/file${number}.ts"; done)"
  COVERED_app="$TRACKED"
  COVERED_site=""
  export TRACKED COVERED_app COVERED_site
}

@test "passes when every file is TypeScript in a project typecheck:all runs" {
  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
  [[ "$output" == *"all 600 source files"* ]]
}

@test "reads the projects from typecheck:all, so a second one counts" {
  TRACKED="${TRACKED}"$'\n'"site/page.tsx"
  COVERED_site="site/page.tsx"

  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
}

@test "fails on a JavaScript file and names it" {
  TRACKED="${TRACKED}"$'\n'"public/stray.js"
  COVERED_app="${COVERED_app}"$'\n'"public/stray.js"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"JavaScript"* ]]
  [[ "$output" == *"public/stray.js"* ]]
}

@test "fails on a .cjs or .mjs file too" {
  TRACKED="${TRACKED}"$'\n'"a.cjs"$'\n'"b.mjs"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"a.cjs"* ]]
  [[ "$output" == *"b.mjs"* ]]
}

@test "fails on a TypeScript file no project includes, and names it" {
  TRACKED="${TRACKED}"$'\n'"nowhere/lost.ts"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"in no project"* ]]
  [[ "$output" == *"nowhere/lost.ts"* ]]
}

@test "leaves out generated files and declarations" {
  TRACKED="${TRACKED}"$'\n'"src/generated/brand.ts"$'\n'"src/vite-env.d.ts"

  run bash "$SCRIPT"

  [ "$status" -eq 0 ]
}

@test "fails when it finds too few files to have looked in the right place" {
  TRACKED="src/only.ts"
  COVERED_app="src/only.ts"

  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"run this from frontend/"* ]]
}
