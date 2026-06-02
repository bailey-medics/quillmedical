# End-to-end testing with Playwright

Add `@playwright/test` to the frontend, create a Playwright config targeting the Docker Compose stack via Caddy on `localhost:80`, and write a simple login e2e test using the seeded `educator` user (but will need different users from staff, admin, superadmin, and for the EPR we will need patient, doctor, nurse,etc). Add `just e2e` commands for developer experience.

## Phase 1: Install and configure Playwright

### 1. Add `@playwright/test` dependency

Run `yarn add -D @playwright/test` in `frontend/`. The existing `playwright` dep (v1.58.2) is the browser engine for Storybook's test runner; `@playwright/test` is the actual test framework that wraps it.

**Version alignment**: `@playwright/test` and the existing `playwright` package share browser binaries. They must be on the same major.minor version to avoid conflicts. Pin `@playwright/test` to match (currently ^1.58.2).

### 2. Create `frontend/playwright.config.ts`

- `testDir: "./e2e"` (root e2e directory — setup files live here alongside `tests/`)
- `baseURL: "http://localhost"` (Caddy on port 80 — routes `/api/*` to backend, rest to frontend)
- A `setup` project with `testMatch: /.*\.setup\.ts/` for auth
- A `chromium` project with `testDir: "./e2e/tests"` that depends on setup, using `storageState`
- Trace on first retry, screenshot on failure
- No `webServer` — Docker Compose stack is already running

### 3. Add `.gitignore` entries

Add `e2e/.auth/`, `playwright-report/`, `test-results/`, `blob-report/` to `frontend/.gitignore`.

### 4. Add package.json scripts

Add `"e2e"` and `"e2e:headed"` scripts to `frontend/package.json`.

## Phase 2: Write the login test

### 5. Create `frontend/e2e/auth.setup.ts`

Playwright setup file that:

- Navigates to `/login`
- Fills "Username" with `educator`, "Password" with `educator123` (from `seed-teaching-data.sh`)
- TOTP is not enabled for this seeded user, so no authenticator code is needed
- Clicks "Sign in"
- Waits for `window.location.assign()` to complete — the app uses full page navigation (not React Router) after login, so use `page.waitForURL('**/teaching')` rather than waiting for a route change
- The `educator` user has `clinical_services_enabled: false`, so the redirect target is `/teaching`
- Saves `storageState` to `e2e/.auth/user.json`

### 6. Create `frontend/e2e/tests/login.spec.ts`

Test that:

- Asserts login page renders correctly (heading "Sign in to Quill", Username/Password fields)
- Fills credentials, submits via "Sign in" button
- Asserts redirect to `/teaching` (full page reload via `window.location.assign`)
- Asserts teaching page content is visible

## Phase 3: Justfile and developer experience

### 7. Add `just e2e` (alias `ee`)

Follows existing Justfile conventions (`#!/usr/bin/env bash`, `{{initialise}}`):

```just
alias ee := e2e
# Run the end-to-end tests
e2e:
    #!/usr/bin/env bash
    {{initialise}} "e2e"
    cd frontend && npx playwright test
```

Runs on the host (not in Docker) — same pattern as `storybook`, `docs`, `frontend-update`.

### 8. Add `just e2e-ui` (alias `eeu`)

```just
alias eeu := e2e-ui
# Run the end-to-end tests in interactive UI mode
e2e-ui:
    #!/usr/bin/env bash
    {{initialise}} "e2e-ui"
    cd frontend && npx playwright test --ui
```

### 9. One-time browser install

Run `npx playwright install chromium` on the host after adding the dependency.

## Relevant files

| File                               | Action                                    |
| ---------------------------------- | ----------------------------------------- |
| `frontend/package.json`            | Add `@playwright/test`, add `e2e` scripts |
| `frontend/playwright.config.ts`    | New — Playwright config                   |
| `frontend/e2e/auth.setup.ts`       | New — login setup saving auth state       |
| `frontend/e2e/tests/login.spec.ts` | New — login e2e test                      |
| `frontend/.gitignore`              | Add Playwright artifact paths             |
| `Justfile`                         | Add `e2e` and `e2e-ui` commands           |

## Verification

1. Start the stack with `just sd` or `just st`
2. `just e2e` — login test passes in headless Chromium
3. `just e2e-ui` — Playwright UI opens, run the test visually
4. Open `frontend/playwright-report/index.html` for the HTML report
5. Break the test intentionally (wrong password) and confirm trace/screenshot captures the failure

## Decisions

### Playwright runs on the host, not in Docker

Playwright needs a real browser with display access. It hits the stack via `localhost:80` (Caddy). This matches how a developer actually interacts with the app.

### `localhost:80` (Caddy) as baseURL

Tests through the full reverse proxy, matching production routing for `/api/*`.

### Seeded `educator`/`educator123` user

Avoids new test infrastructure; `seed-teaching-data.sh` already creates this user.

### Chromium only to start

Multi-browser can be added later.

### `storageState` pattern for auth

Log in once in a setup project, reuse cookies across all tests. This is Playwright's recommended approach and avoids logging in at the start of every test.

### Version alignment with Storybook's `playwright`

The `playwright` package (used by `@storybook/test-runner`) and `@playwright/test` share the same browser binaries. They must stay on the same version to avoid downloading duplicate browsers or version mismatch errors. Use a single Playwright version across both.

### Full page navigation after login

The app uses `window.location.assign()` after login (not React Router `navigate()`). This causes a full page reload, meaning Playwright should wait for URL change via `waitForURL` rather than waiting for a React route transition.

## Further considerations

### CI integration

Not in scope for this initial setup. When ready: start Docker Compose in GitHub Actions, wait for health checks, run tests, upload `playwright-report/` as artifact.

### Test data isolation

Currently relies on seeded data. For more tests, consider API-based seeding in `beforeAll` hooks or a dedicated test fixtures system.
