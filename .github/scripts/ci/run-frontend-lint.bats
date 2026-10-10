#!/usr/bin/env bats
# Tests for run-frontend-lint.sh
#
# yarn is stubbed onto PATH, so nothing lints anything. The stub writes
# the report a tool would have written, for as many files as the test
# says it looked at, and exits as the test tells it.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-frontend-lint.sh"
  STUBS="${BATS_TEST_TMPDIR}/stubs"
  CALLS="${BATS_TEST_TMPDIR}/calls"
  mkdir -p "$STUBS" "$CALLS"

  # FILES is how many files the tool looked at, TOOL_EXIT how it ended,
  # FAULTY how many of them it found a fault in.
  cat > "${STUBS}/yarn" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "${CALLS}/yarn.args"
tool="$1"
files="${FILES:-0}"
faulty="${FAULTY:-0}"

report=""
previous=""
for argument in "$@"; do
  if [ "$previous" = "-o" ]; then report="$argument"; fi
  previous="$argument"
done

case "$tool" in
  eslint)
    jq -n --argjson files "$files" --argjson faulty "$faulty" \
      '[range(0; $files) | {filePath: "src/file\(.).ts", messages: (if . < $faulty then [{line: 3, ruleId: "prefer-const", message: "use const"}] else [] end)}]' \
      > "$report"
    ;;
  stylelint)
    jq -n --argjson files "$files" --argjson faulty "$faulty" \
      '[range(0; $files) | {source: "src/file\(.).css", warnings: (if . < $faulty then [{line: 2, rule: "color-no-invalid-hex", text: "bad colour"}] else [] end)}]' \
      | tee "$report"
    ;;
  prettier)
    for number in $(seq 1 "$files"); do
      echo "[debug] resolve config from '/repo/src/file${number}.ts'"
    done
    for number in $(seq 1 "$faulty"); do
      echo "[warn] src/file${number}.ts"
    done
    ;;
esac

exit "${TOOL_EXIT:-0}"
EOF
  chmod +x "${STUBS}/yarn"
  export CALLS
  PATH="${STUBS}:${PATH}"
}

@test "ESLint passes when it checked the whole frontend and found nothing" {
  FILES=1268 run bash "$SCRIPT" eslint

  [ "$status" -eq 0 ]
  [[ "$output" == *"ESLint checked 1268 files and found nothing"* ]]
}

@test "ESLint fails when it checked only a few files, though it passed them" {
  # What the pattern */*.ts did: 25 files of 1,200, and green.
  FILES=25 run bash "$SCRIPT" eslint

  [ "$status" -eq 1 ]
  [[ "$output" == *"ESLint checked 25 files"* ]]
  [[ "$output" == *"missing the source folders"* ]]
}

@test "ESLint fails on a fault, and says where" {
  FILES=1268 FAULTY=1 TOOL_EXIT=1 run bash "$SCRIPT" eslint

  [ "$status" -eq 1 ]
  [[ "$output" == *"src/file0.ts:3 prefer-const use const"* ]]
  [[ "$output" == *"ESLint found faults in 1268 files"* ]]
}

@test "ESLint fails when it wrote no report" {
  cat > "${STUBS}/yarn" <<'EOF'
#!/usr/bin/env bash
exit 2
EOF

  run bash "$SCRIPT" eslint

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not say how many files"* ]]
}

@test "stylelint passes when it checked every style sheet and found nothing" {
  FILES=73 run bash "$SCRIPT" stylelint

  [ "$status" -eq 0 ]
  [[ "$output" == *"stylelint checked 73 files and found nothing"* ]]
}

@test "stylelint fails when it checked no files, though it passed" {
  # What the pattern */*.css did, with --allow-empty-input to keep it quiet.
  FILES=0 run bash "$SCRIPT" stylelint

  [ "$status" -eq 1 ]
  [[ "$output" == *"stylelint checked 0 files"* ]]
}

@test "stylelint fails on a fault, and says where" {
  FILES=73 FAULTY=1 TOOL_EXIT=2 run bash "$SCRIPT" stylelint

  [ "$status" -eq 1 ]
  [[ "$output" == *"src/file0.css:2 color-no-invalid-hex bad colour"* ]]
}

@test "stylelint's own printed report is kept out of the log" {
  FILES=73 run bash "$SCRIPT" stylelint

  [[ "$output" != *'"source"'* ]]
}

@test "Prettier passes when it checked the whole frontend and all is formatted" {
  FILES=1408 run bash "$SCRIPT" prettier

  [ "$status" -eq 0 ]
  [[ "$output" == *"Prettier checked 1408 files and all are formatted"* ]]
}

@test "Prettier fails when it checked only a few files, though it passed them" {
  FILES=12 run bash "$SCRIPT" prettier

  [ "$status" -eq 1 ]
  [[ "$output" == *"Prettier checked 12 files"* ]]
}

@test "Prettier fails on an unformatted file, names it, and says how to fix it" {
  FILES=1408 FAULTY=2 TOOL_EXIT=1 run bash "$SCRIPT" prettier

  [ "$status" -eq 1 ]
  [[ "$output" == *"[warn] src/file1.ts"* ]]
  [[ "$output" == *"[warn] src/file2.ts"* ]]
  [[ "$output" == *"yarn prettier:fix"* ]]
}

@test "each tool is started through its package.json script" {
  FILES=1268 run bash "$SCRIPT" eslint
  FILES=73 run bash "$SCRIPT" stylelint
  FILES=1408 run bash "$SCRIPT" prettier

  [[ "$(sed -n 1p "${CALLS}/yarn.args")" == eslint* ]]
  [[ "$(sed -n 2p "${CALLS}/yarn.args")" == stylelint* ]]
  [[ "$(sed -n 3p "${CALLS}/yarn.args")" == prettier* ]]
}

@test "fails on a tool it does not know" {
  run bash "$SCRIPT" tslint

  [ "$status" -eq 1 ]
  [[ "$output" == *"Unknown tool 'tslint'"* ]]
}

@test "fails without a tool" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}
