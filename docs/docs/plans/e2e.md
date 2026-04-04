# End-to-end testing with Playwright

Add `@playwright/test` to the frontend, create a Playwright config targeting the Docker Compose stack via Caddy on `localhost:80`, and write a simple login e2e test using the seeded `educator` user. Add `just e2e` commands for developer experience.

## Phase 1: Install and configure Playwright

### 1. Add `@playwright/test` dependency

Run `yarn add -D @playwright/test` in `frontend/`. The existing `playwright` dep (v1.58.2) is the browser engine for Storybook's test runner; `@playwright/test` is the actual test framework that wraps it.

### 2. Create `frontend/playwright.config.ts`

- `testDir: "./e2e/tests"`
- `baseURL: "http://localhost"` (Caddy on port 80 — routes `/api/*` to backend, rest to frontend)
- A `setup` project for auth, and a `chromium` project that depends on it with `storageState`
- Trace on first retry, screenshot on failure
- No `webServer` — Docker Compose stack is already running

### 3. Add `.gitignore` entries

Add `e2e/.auth/`, `playwright-report/`, `test-results/` to `frontend/.gitignore`.

### 4. Add package.json scripts

Add `"e2e"` and `"e2e:headed"` scripts to `frontend/package.json`.

## Phase 2: Write the login test

### 5. Create `frontend/e2e/auth.setup.ts`

Playwright setup file that:

- Navigates to `/login`
- Fills "Username" with `educator`, "Password" with `educator123` (from `seed-teaching-data.sh`)
- Clicks "Sign in"
- Waits for navigation away from `/login`
- Saves `storageState` to `e2e/.auth/user.json`

### 6. Create `frontend/e2e/tests/login.spec.ts`

Test that:

- Asserts login page renders correctly
- Fills credentials, submits
- Asserts redirect to authenticated page
- Asserts authenticated content is visible

## Phase 3: Justfile and developer experience

### 7. Add `just e2e`

Runs `cd frontend && npx playwright test` (follows existing Justfile patterns).

### 8. Add `just e2e-ui`

Runs `cd frontend && npx playwright test --ui` for interactive visual mode.

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

## Further considerations

### CI integration

Not in scope for this initial setup. When ready: start Docker Compose in GitHub Actions, wait for health checks, run tests, upload `playwright-report/` as artifact.

### Test data isolation

Currently relies on seeded data. For more tests, consider API-based seeding in `beforeAll` hooks or a dedicated test fixtures system.
