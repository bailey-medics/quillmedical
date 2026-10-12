#!/usr/bin/env bats
# Holds every job that sets up the project's exact Python to keeping the
# installed copy between runs.
#
# .python-version names an exact version, which the runner does not carry,
# so setup-python downloads it from GitHub's releases unless a kept copy is
# restored first. That download returning 504 took pull requests out of the
# merge queue on 12 October 2026. The steps that keep the copy are in
# .github/actions/setup-python, and written out again in the two workflows
# that cannot use that action. Nothing else stops a third place being added
# without them, or one of the three drifting to a key of its own.

setup() {
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  KEY='key: python-install-${{ runner.os }}-${{ runner.arch }}-${{ steps.python_version.outputs.image }}-${{ steps.python_version.outputs.version }}'
}

# The workflow and action files that ask setup-python for the version in a
# .python-version file.
files_setting_up_python() {
  grep -rl --include='*.yml' --include='*.yaml' 'python-version-file:' \
    "${ROOT}/.github/workflows" "${ROOT}/.github/actions"
}

@test "at least the three known places are found" {
  # A search that finds nothing would pass every test below.
  [ "$(files_setting_up_python | wc -l)" -ge 3 ]
}

@test "every place that sets up the exact Python restores the kept copy first" {
  while IFS= read -r file; do
    cache_line="$(grep -n 'name: Cache the installed Python' "$file" | head -1 | cut -d: -f1)"
    setup_line="$(grep -n 'python-version-file:' "$file" | head -1 | cut -d: -f1)"

    [ -n "$cache_line" ] || { echo "${file} sets up Python with no kept copy"; false; }
    [ "$cache_line" -lt "$setup_line" ] || { echo "${file} restores the copy after setting Python up"; false; }
  done < <(files_setting_up_python)
}

@test "every place uses the one key, so a runner image shares one copy" {
  while IFS= read -r file; do
    grep -qF "$KEY" "$file" || { echo "${file} keeps Python under a key of its own"; false; }
  done < <(files_setting_up_python)
}

@test "every place keeps the folder setup-python looks in" {
  while IFS= read -r file; do
    grep -qF 'path: ${{ runner.tool_cache }}/Python/${{ steps.python_version.outputs.version }}' "$file" \
      || { echo "${file} keeps a different folder"; false; }
  done < <(files_setting_up_python)
}
