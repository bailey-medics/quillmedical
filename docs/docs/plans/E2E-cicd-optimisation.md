# E2E CI CD optimisation plan

## Objective

Reduce the end to end Playwright job duration by removing avoidable setup work, while keeping reliability and traceability.

## Baseline from recent successful run

- Total E2E job duration: about 4m 32s
- Playwright test execution: about 44s
- Non-test overhead: about 3m 48s

Largest observed step durations in the E2E lane:

- Build frontend image: about 76s
- Build backend image: about 55s
- Run E2E tests: about 44s
- Install deps: about 20s
- Start CI stack: about 20s
- Install Playwright browsers: about 16s

## What we have now

- Docker layer caching is enabled in image build steps via Buildx `cache-from` and `cache-to`
- Full image reuse has been introduced with a dedicated `heavy_e2e_images` job that pushes images to GHCR
- The `heavy_e2e` job now pulls and applies local tags to those images before starting `compose.ci.yml`

This gives us both:

- Faster rebuilds when images must be rebuilt
- No duplicate image builds in the E2E execution job

## Optimisation plan

## 1. Keep E2E execution as pull only for app images

Why

- App image builds are the largest single cost block

Action

- Keep all backend and frontend image builds in `heavy_e2e_images`
- Keep `heavy_e2e` strictly as pull, apply local tags, start stack, seed, test
- Add a guardrail review check to prevent accidental reintroduction of build steps into `heavy_e2e`

Expected gain

- About 2m to 2m 20s compared with previous in-job builds

## 2. Install Playwright browsers only on cache miss

Why

- Browser install still costs around 10s to 16s even with caching configured

Action

- Capture cache step output from `actions/cache`
- Run `npx playwright install --with-deps chromium` only when `cache-hit` is not true

Expected gain

- About 10s to 16s on warm cache runs

## 3. Tighten frontend dependency install path

Why

- `yarn install --immutable` is still around 20s in E2E

Action

- Keep lockfile-based cache keys stable
- Ensure no unnecessary files are included in key invalidation
- Verify that `frontend/node_modules` and Yarn cache restore consistently in PR runs

Expected gain

- About 5s to 15s depending on cache hit quality

## 4. Reduce CI stack startup overhead

Why

- Stack startup is consistently around 20s

Action

- Confirm only required services are started for E2E
- Tune health checks and wait conditions to reduce idle wait time without sacrificing determinism

Expected gain

- About 5s to 15s

## 5. Optimise test runtime only after setup gains are locked

Why

- Test runtime is not currently the top bottleneck

Action

- Maintain current stability first
- Evaluate selective parallelism only if flakes remain controlled

Expected gain

- About 10s to 20s in best case

## Delivery order

- [x] Confirm pull only image flow remains in place in CI
- [x] Add conditional Playwright browser install on cache miss
- [ ] Tune dependency cache behaviour and validate with two consecutive PR runs
- [ ] Trim stack startup overhead
- [ ] Re-evaluate test parallelism once reliability remains stable

Progress note:

- Pull only flow verified in `.github/workflows/branch-ci.yml` using `heavy_e2e_images` + `needs: [heavy_e2e_images]` + explicit pull and local tag step
- Conditional Playwright install implemented in `.github/workflows/branch-ci.yml` using cache step output `steps.cache_playwright.outputs.cache-hit`
- E2E dependency install now runs only on exact Yarn cache miss in `.github/workflows/branch-ci.yml` using `steps.cache_yarn.outputs.cache-hit`; two consecutive PR-run validations are still pending
- Latest validation run failed in E2E login tests because assertions waited for submit button `aria-disabled` to become false; tests were updated to submit the form directly via `requestSubmit()` after field-value assertions

## Success criteria

- E2E median job duration reduced from about 4m 32s to under 3m
- No increase in flaky failures across at least 10 consecutive non-draft PR runs
- No regression in failure diagnostics or artefact uploads
- Clear timing trend visible in workflow step durations week over week

## Risks and mitigations

- Cache misses due to runner variance or eviction
  - Mitigation: keep deterministic keys and restore keys, and track hit rate in run logs
- Hidden dependency on full browser install
  - Mitigation: conditional install fallback on cache miss only
- Over-optimised health checks causing transient start failures
  - Mitigation: apply small changes and validate over repeated runs

## Validation approach

For each change, compare at least two consecutive successful runs:

- Before timing
- After timing
- Delta by step
- Any pass rate or flake change

Do not merge additional optimisation changes into the same PR until the previous change has timing evidence.
