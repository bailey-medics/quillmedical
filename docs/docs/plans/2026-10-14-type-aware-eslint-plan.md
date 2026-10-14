# Type-aware ESLint plan

The frontend's ESLint config extends `tseslint.configs.recommended`, which
checks code without reading its types. So the rules that need types are
not running, and the most useful of them for this app,
`no-floating-promises`, is off: an `api.post(...)` with no `await` and no
`.catch` fails silently, and the person using the app thinks something was
saved when it was not. The React hooks rules are also on
`recommended-latest`, which in `eslint-plugin-react-hooks` 7 means the
experimental compiler rules, so a minor upgrade can add rules and fail CI
with no change to the code.

Switching to `recommendedTypeChecked` on 14 October 2026 found 581
findings in 256 files, and 47 files that no tsconfig covers, so the switch
cannot land in one branch. The aim is the type-aware rule set on, in full,
with every finding fixed or excused for a written reason, landed as a
series of branches each of which leaves `yarn eslint` passing.

## Phase 1: Turn the rules on without breaking lint

- [x] In `frontend/eslint.config.js`, replace
      `reactHooks.configs.flat["recommended-latest"]` with
      `reactHooks.configs.flat.recommended`, and
      `...tseslint.configs.recommended` with
      `...tseslint.configs.recommendedTypeChecked`, with
      `parserOptions.projectService: true` and
      `tsconfigRootDir: import.meta.dirname` under `languageOptions`. Done
      on 14 October 2026 in the working tree, on top of the branch that
      moved the config to `defineConfig` (pull request #1989). The stable
      hooks set added no findings. The type-aware set added 581: 295 in
      app code, 223 in tests, 16 in stories, plus 47 parsing errors.

- [x] Cover the 47 files no tsconfig includes, so the project service can
      read them. They are `e2e/**`, `playwright.config.ts`,
      `playwright.guides.config.ts`, `vitest.config.ts`,
      `public_pages/scripts/generate-pages.test.ts` and
      `public_pages/vite.config.ts`. Done on 14 October 2026, not as
      first written. The Playwright files and the three config files
      went into the `include` of `tsconfig.check.json` rather than a new
      `tsconfig.e2e.json` referenced from `tsconfig.json`: the references
      there are what `tsc -b` builds in `yarn build`, which the Docker
      image runs, so a new referenced project would have had the
      production build type-checking the end-to-end tests. `typecheck:all`
      already reads `tsconfig.check.json`, and is the right place; it
      found one real error, `e2e/auth.setup.ts` typing `page` as
      `Parameters<typeof setup>[0]["page"]`, which is the test title's
      type, now `Page`. `public_pages/tsconfig.json` is nearest for the
      two files under it, so its `include` gained `scripts` and
      `vite.config.ts`. Its `moduleResolution` also moved from `node`
      (node10, deprecated in TypeScript 6) to `bundler`, because node10
      cannot read vite's `exports` and every type in `vite.config.ts` came
      back unresolved, 49 findings on its own; `baseUrl` went with it,
      deprecated too, and `paths` resolve against the tsconfig's folder
      the same. Noted and left: `tsc -p public_pages/tsconfig.json`
      reports `@lib/*` and `@test/*` unresolved from the `../src` it
      includes, because its `paths` list only four aliases. Nothing runs
      it. The alternative, `allowDefaultProject` on the project service,
      lints those files with no types, so the type-aware rules would be
      quietly off for exactly the end-to-end tests, which are where a
      missed `await` costs the most time to find.

- [x] Narrow `no-misused-promises` so it stops reporting an `async`
      handler passed to a JSX attribute: `onClick={async () => ...}` and
      the like are 115 of its 121 findings. Set
      `checksVoidReturn: { attributes: false }` and keep the rest of the
      rule, which still catches an `async` function passed where a plain
      callback is expected in code, such as `array.forEach(async ...)`.
      React ignores the promise a handler returns, and the fix the rule
      wants, wrapping every handler in `void (async () => ...)()`, says
      nothing a reader needs. Done on 14 October 2026. Seven findings of
      the kept kind remain, six in app code and one in
      `public_pages/vite.config.ts`, so the rule is in the scaffolding
      until the last step of Phase 2.

- [x] Apply the automatic fixes. `no-unnecessary-type-assertion` has 60
      findings and an auto-fix that removes a pointless `as`. Run
      `eslint --fix` and read the diff; of the rules firing it is the
      only one with an auto-fix. Done on 14 October 2026. Eight could
      not be auto-fixed, being the kind the rule calls "specify the type
      arguments instead": six `screen.getByRole(...) as HTMLInputElement`
      in tests, now `screen.getByRole<HTMLInputElement>(...)`, and two
      `methods.getValues() as SomeValues`, fixed by making
      `useFormContext` in `src/components/form/Form/FormContext.tsx`
      generic in the form's values type, so `useFormContext<SomeValues>()`
      types `getValues()` at the source.

- [x] Add an override block, marked `// Phase 1 scaffolding: removed as
      each phase lands`, that turns off every rule still firing, so lint
      passes at the end of this phase: `no-floating-promises`,
      `no-misused-promises`, `require-await`, `no-unsafe-return`,
      `no-unsafe-member-access`, `no-unsafe-assignment`,
      `no-unsafe-call`, `no-unsafe-argument`, `unbound-method`,
      `no-base-to-string`, `no-redundant-type-constituents`,
      `prefer-promise-reject-errors` and `restrict-template-expressions`.
      For `no-floating-promises` turn it off per folder, in three
      `files:` blocks for `src/pages/**`, `src/features/**` and
      `src/components/**` plus `src/sw.ts`, so that Phase 2 can remove one
      block per branch and the rule guards the rest of the tree from the
      first branch on. Each later phase deletes its line from this block;
      Phase 6 deletes the block. Done on 14 October 2026, and `yarn
      eslint` passes.

- [x] Measure what type-aware linting costs where it runs, and record the
      figures here. Three places pay it: the `eslint` job in
      `.github/workflows/ci.yml`, the `lint-staged` entry in
      `frontend/package.json` that runs `eslint --fix` on staged files in
      the pre-commit hook, and the editor. Measured on 14 October 2026
      on the Mac: the whole tree takes 52 seconds of wall time (77 of
      CPU), against a few seconds before. One file, run exactly as the
      hook runs it (`eslint --fix --max-warnings=0 src/lib/api.ts`),
      takes 6.5 seconds, nearly all of it the project service loading the
      project once, so it does not grow with the files staged. Under the
      ten seconds that would have moved the hook to CI, so the hook
      stays.

- [x] Decide what to do with `--cache` in the `eslint` script, and record
      it here. ESLint's cache keys on each file's own content, but a
      type-aware finding in `a.ts` can change when only `b.ts` changes,
      so a cached entry for `a.ts` can be stale. The CI cache key in
      `ci.yml` hashes every TypeScript file, so any change makes a new
      key, but `restore-keys` then restores the previous cache and ESLint
      trusts its entries. Done on 14 October 2026:
      `.github/scripts/ci/run-frontend-lint.sh` runs `yarn eslint
      --no-cache`, with the reason beside it, and the `Cache ESLint` step
      in `ci.yml` that saved `.eslintcache` between runs is gone, since
      nothing would read it. The local `yarn eslint` keeps its cache,
      where a stale entry costs nothing a push will not catch.

## Phase 2: Promises nobody waits for

`no-floating-promises` has 105 findings in app code, all of them a promise
that is neither awaited nor given a `.catch`: 74 under `src/pages`, 19
under `src/features`, 11 under `src/components` and one in `src/sw.ts`.
Each one is a decision, so this phase is read file by file, not
auto-fixed. The three answers are:

- **`await` it**, when the caller is already `async` and the result
  matters to what happens next.
- **Give it a `.catch`** that tells the person something went wrong,
  through the notifications the surrounding page already uses, when the
  call is a save or a send and the caller cannot wait.
- **Mark it `void`** with a comment saying why the result does not
  matter, for genuine fire-and-forget such as a prefetch. `useEffect`
  cannot take an `async` function, so `useEffect(() => { void load(); },
  [])` is the established shape for a load on mount, where `load` itself
  handles its errors.

- [x] `src/pages/**`. Remove the `src/pages` block from the Phase 1
      scaffolding, fix the 74 findings, and run the unit tests of each
      page touched with `just uf`. A page whose test does not cover the
      failure path gets a test for it where the fix added a `.catch`.
      Done on 14 October 2026. The 74 were of four kinds. Thirty-six were
      `navigate(...)` from React Router, whose promise settles when the
      navigation does and whose errors go to the route's `errorElement`;
      rather than `void` on every call, the rule's
      `allowForKnownSafeCalls` names `NavigateFunction` from
      `react-router` in `eslint.config.js`, with the reason, and that
      covers the whole tree. Thirty-five were a fetch-on-mount in a
      `useEffect`, each calling a local `async` function with its own
      `try`/`catch`, now `void fetchX()`. Three had no handler at all and
      gained a `.catch` and a test: the first load of the question banks
      in `AdminTeachingPage`, which left a blank page on failure and now
      says "Could not load the question banks"; and sending in
      `MessageThread` and `PatientMessageThread`, which showed the
      message as sent whatever happened and now take it back and say
      "Message not sent", through `usePageMessage`.

- [x] `src/features/**`. The same for the 19 findings. Done on 14
      October 2026, in one branch with the two steps below: once
      `navigate` was excused by the step above, ten findings were left
      here, every one a load on mount with its own `catch`, now `void`.
      Ten one-word changes are not a pull request on their own.

- [x] `src/components/**` and `src/sw.ts`. The same for the last 12. At
      the end of this branch the rule is on across the tree and the
      scaffolding holds no `no-floating-promises` line. Done on 14
      October 2026, in the same branch. Eight were left: four loads in
      `SideNavContent` and the confirm path in `Form`, each with a
      `catch`, now `void`; the two `async` immediately-invoked functions
      in `PdfPages` that draw a page and open a document, each with a
      `catch`, now `void (async () => ...)()`; and
      `self.skipWaiting()` in `sw.ts`, whose promise the service worker
      has no use for, now `void`.

- [x] Turn `no-misused-promises` back on, by deleting its scaffolding
      line, and fix the seven findings Phase 1 left: an `async` function
      passed where a plain callback is expected, six in app code and one
      in `public_pages/vite.config.ts`, where a dev-server middleware is
      `async`. The answers are the same three as above, chosen per call.
      Done on 14 October 2026, in the same branch. Four were an arrow
      returning `navigate(...)` where a `() => void` was wanted, from an
      object property or a `setTimeout`, which the attribute exemption
      does not reach; each is now a block body, so the excused call
      stands on its own. `MultiStepForm` passed its `async nextStep` as
      `() => void`; `StepContentProps.nextStep` now says
      `() => Promise<void>`, which is what it is, and no consumer calls
      it outside a JSX attribute. Two `async` listeners whose whole body
      is inside a `try`, the dev-server middleware in
      `public_pages/vite.config.ts` and the service-worker registration
      in `src/main.tsx`, keep the rule off for that one line with the
      reason beside it: connect and the browser ignore what a listener
      returns, and re-indenting thirty lines into a `void` wrapper would
      say the same thing less clearly.

## Phase 3: Functions marked async that never wait

- [x] Turn `require-await` back on and fix its 80 findings: 65 in tests,
      11 in stories, 3 in app code and 1 in `e2e/`. Done on 14 October
      2026, and not as expected. Only 22 were a test body marked `async`
      with nothing to wait for. The other 57 were `async () => value`,
      a stub for something that returns a promise: a form's `onSubmit`
      in a test or a story, a mocked `fetch` response's `json()`, a
      `vi.fn(async () => true)`. The rule's fix for those is
      `() => Promise.resolve(value)`, which says the same thing less
      clearly, and the rule's purpose, an `async` function that forgot
      its `await`, does not apply to a stub. So the rule is off for
      tests, stories, `src/test/` and `e2e/`, with the reason in
      `eslint.config.js`, and on for app code, where the three findings
      were real: `chooseSite` in `RegisterPage` and `handleToggleActive`
      in `EditSitePage` were `async` for no reason and are now plain
      functions, which meant letting `Form`'s `onSubmit` return a
      `FormSubmitResult` as well as a promise of one (its `Promise.race`
      takes either); and `viteFinal` in `.storybook/main.ts` returned
      its config through an `async` it did not need.

## Phase 4: Mocks that lose their types

The `no-unsafe-*` rules have 119 findings in tests, and the choice was to
keep the rules on in tests rather than switch them off there. Most come
from two patterns, and the typed replacement for each is shorter and
catches a mock going stale: an untyped mock keeps passing after the real
function changes its signature, which is the main way a frontend test
suite stops meaning anything.

- **An untyped `vi.fn()`**, such as `const uploadEvidence = vi.fn();`
  with the wrapper `(...args: unknown[]) => uploadEvidence(...args)` in a
  `vi.mock` factory. It returns `any`, which is the 69 `no-unsafe-return`
  findings. The replacement is `vi.fn<typeof uploadEvidence>()`, typed
  from the real function.
- **A cast to reach a mock's methods**, such as
  `(apiLib.api.get as any).mockResolvedValueOnce(...)`, which is the 11
  `no-unsafe-call` and most of the 27 `no-unsafe-member-access` findings.
  The replacement is `vi.mocked(apiLib.api.get).mockResolvedValueOnce(...)`.
- **A genuine `any`**, such as `JSON.parse` of the manifest in
  `src/__tests__/pwaManifest.test.ts`. A handful. Give the value a small
  type for the shape being read, or where the `any` is real, a one-line
  `eslint-disable-next-line` with the reason.

- [x] Turn `no-unsafe-return`, `no-unsafe-member-access`,
      `no-unsafe-assignment`, `no-unsafe-call` and `no-unsafe-argument`
      back on for test files only, by a `files:` block that overrides
      the scaffolding, scoped to `src/pages/**/*.test.*` and
      `src/features/**/*.test.*` until the next step widens it, and fix
      the findings there. Run each test file touched with `just uf`.
      Done on 14 October 2026: 96 findings in 26 files. The untyped
      `vi.fn()` wrappers became `vi.hoisted` blocks of
      `vi.fn<typeof passportLib.fetchMyPassport>()` and the like, typed
      from the real module through `import type * as passportLib`, with
      the `vi.mock` factory naming them directly, which is what
      `vi.hoisted` is for. Typing them found 24 fixtures that did not
      match the real shape: a `detail()` with a two-field `Passport`, a
      `SignOffResult` with no `status` or `commit`, logbook entries with
      three fields of eleven. Each is now the real type, built by a
      small helper where the same partial was written five times. Two
      `useAuth` stubs are typed as a `Partial<User>` under a status, the
      shape those tests actually set. `(api.get as any).mock...` and
      `(api.get as Mock)` became `vi.mocked(api.get)`. The three
      `expect.objectContaining(...)` assigned into a literal, which come
      back as `any`, are named once as `unknown` first.

- [x] The same for the rest of `src`: `src/components`, `src/auth`,
      `src/lib`, `src/__tests__` and `src/test`, and for `e2e/`, which
      the type-aware rules reach since Phase 1 covered it: six findings
      in `e2e/tests/pdf-pages.spec.ts`, where a fixture read from JSON
      is `any`. Done on 15 October 2026: 29 findings in 15 files, the
      same kinds as the step above and a few more. The two tests that
      set `BASE_URL` through `(import.meta.env as any)` use
      `vi.stubEnv` and `vi.unstubAllEnvs`, which is what they are for.
      A `JSON.parse` of the web manifest, and the signed-in user read
      back from `/api/auth/me` in the Playwright test, are each read
      `as` the few fields the test looks at. The `onCarryOut` mock in
      `RetentionDecisionList.test.tsx` is typed as the prop it stands in
      for, and `getDocument`'s first argument in `PdfPages.test.tsx` is
      read as pdf.js's `DocumentInitParameters`, which the package
      exports only from `pdfjs-dist/types/src/display/api`. The
      `restrict-template-expressions` finding in `keyboard.spec.ts` is
      a different rule and stays for Phase 5. The Phase 4 block in
      `eslint.config.js` now covers every test file; Phase 6 folds it
      away with the scaffolding.

## Phase 5: The remaining findings in app code

- [ ] Turn the rest back on and fix the findings in app code and stories:
      `no-unsafe-assignment` (17 app, 2 stories), `no-unsafe-member-access`
      (12), `no-unsafe-call` (4, and 1 in `public_pages/vite.config.ts`),
      `no-unsafe-argument` (3),
      `unbound-method` (5), `no-base-to-string` (1 app, 3 tests),
      `no-redundant-type-constituents` (2) and
      `prefer-promise-reject-errors` (1). Each `any` in app code is read
      for where it came from: a response from `api.ts` typed as `any` is
      fixed at the call that reads it, with the interface the page already
      has for the response. An `unbound-method` finding is a class method
      passed as a callback and losing `this`; the fix is an arrow function
      at the call site. One branch.

## Phase 6: Remove the scaffolding

- [ ] Delete the Phase 1 scaffolding block from `frontend/eslint.config.js`
      and check that `yarn eslint` passes with nothing turned off but the
      `no-misused-promises` attribute check. Delete the `// New: React XSS
      guard` comment's `New:` while there, since it is not new. Update the
      frontend conventions in `.github/copilot-instructions.md` with one
      line saying the lint is type-aware and a promise is awaited, caught
      or marked `void` with a reason, and run `/sync-copilot-config`.

## Decisions

- **Type-aware rules stay on in tests** - the question was whether to
  switch the `no-unsafe-*` rules off for test files, where mocks are typed
  loosely. No: the loose typing is the fault the rules find. A mock typed
  from the real function fails the test when the function changes shape,
  and an untyped one does not. With `--max-warnings=0` in the `eslint`
  script a warning fails CI the same as an error, so the choice was on or
  off, and on costs one phase of mechanical fixes.

- **`no-misused-promises` skips JSX attributes** - an `async` event
  handler is the ordinary way to write one in React, React discards the
  promise, and the wrapping the rule asks for adds nothing a reader
  needs. The rule stays on for everything else it checks.

- **A tsconfig for the uncovered files, not `allowDefaultProject`** - the
  default project lints with no types, which would leave the end-to-end
  tests, the Playwright and Vitest configs and `public_pages` under the
  old rule set with no sign of it in the output.

- **Rules are turned off and back on one at a time, by folder for the
  largest** - so that every branch leaves lint passing and each pull
  request is one rule, or one folder of one rule, that a person can read.
  The scaffolding block makes the state of the plan visible in the config
  itself: what is still off is what is still to do.

- **The stable hooks rule set, not `recommended-latest`** - in
  `eslint-plugin-react-hooks` 7 the name means the experimental compiler
  rules, which the plugin's own README calls bleeding edge. A rule set
  that changes under a minor upgrade is not a rule set CI can depend on.
  Nothing in the code tripped the change.

- **One branch per step** - 256 files cannot be reviewed on one pull
  request, and the fixes in Phase 2 are each a judgement about what
  should happen when a call fails, which is what review is for.
