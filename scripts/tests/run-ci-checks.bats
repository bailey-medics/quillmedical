#!/usr/bin/env bats
# Tests for ensure_playwright_browser in run-ci-checks.sh, which installs
# the Chromium the checkout's Playwright needs.
#
# A Playwright bump used to leave the old browser build in place and the
# new one missing, because the script only checked that the cache folder
# existed. `npx` is a stub here, so nothing is downloaded.

setup() {
	bin="${BATS_TEST_TMPDIR}/bin"
	mkdir -p "${bin}"

	cat >"${bin}/npx" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"${BATS_TEST_TMPDIR}/npx.log"
EOF
	chmod +x "${bin}/npx"

	export PATH="${bin}:${PATH}"
	export HOME="${BATS_TEST_TMPDIR}/home"
	mkdir -p "${HOME}"

	# shellcheck source=../run-ci-checks.sh
	source "${BATS_TEST_DIRNAME}/../run-ci-checks.sh"
}

@test "installs the browser even when an older build is cached" {
	mkdir -p "${HOME}/.cache/ms-playwright/chromium-1248"

	run ensure_playwright_browser

	[ "$status" -eq 0 ]
	[ "$(cat "${BATS_TEST_TMPDIR}/npx.log")" = "playwright install chromium" ]
}

@test "adds the system packages on a machine with no browsers at all" {
	run ensure_playwright_browser

	[ "$status" -eq 0 ]
	[ "$(cat "${BATS_TEST_TMPDIR}/npx.log")" = "playwright install --with-deps chromium" ]
}

@test "sourcing the script runs none of the checks" {
	run bash -c "source '${BATS_TEST_DIRNAME}/../run-ci-checks.sh' && echo sourced"

	[ "$status" -eq 0 ]
	[ "$output" = "sourced" ]
}
