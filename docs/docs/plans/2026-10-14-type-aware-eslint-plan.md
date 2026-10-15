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

- [x] Turn the rest back on and fix the findings in app code and stories:
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
      at the call site. One branch. Done on 15 October 2026: 52
      findings in 19 files, where each `any` traced to one of a few
      springs. Two packages declare themselves as `any`:
      `postcss-preset-mantine` ships `declare module` and nothing more,
      so `src/types/postcss-preset-mantine.d.ts` now says what its
      default export is, and `qrcode` was shimmed the same way in
      `src/types/qrcode.d.ts`, which is deleted since `@types/qrcode`
      has been installed all along. Three forms read their values
      through an untyped `useFormContext()`, now given their values
      type. `res.json()` in `api.ts` and `event.data.json()` in `sw.ts`
      are read as `unknown` and as the payload shape. The Storybook
      decorator in `.storybook/preview.tsx` was typed `(Story: any,
      context: any)` and is now a `Decorator`, reading globals and
      parameters as unknown and narrowing. The `unbound-method`
      findings were `InstallPromptCapture` declaring its functions as
      methods while every implementation is a closure; the interface
      now says function-typed properties, which is what they are. A
      `String(obj)` fallback in `LoginPage` for a body that will not
      serialise, which could only ever say "[object Object]", returns
      no message instead. `BaseProfessionId | ""` loses the `""`,
      because the id type is `string` from JSON and the union said
      nothing. The rest are the mechanical shapes of Phase 4.

## Phase 6: Remove the scaffolding

- [x] Delete the Phase 1 scaffolding block from `frontend/eslint.config.js`
      and check that `yarn eslint` passes with nothing turned off but the
      `no-misused-promises` attribute check. Delete the `// New: React XSS
      guard` comment's `New:` while there, since it is not new. Update the
      frontend conventions in `.github/copilot-instructions.md` with one
      line saying the lint is type-aware and a promise is awaited, caught
      or marked `void` with a reason, and run `/sync-copilot-config`.
      Done on 15 October 2026. The Phase 4 block went with it, since the
      `no-unsafe` rules are on for every file through the main config.
      What stays turned off, each with its reason in the config: the
      attribute check of `no-misused-promises`, `require-await` in tests
      and stories, and `no-floating-promises` for a `navigate(...)` call.

- [x] Found while landing Phase 5, folded into the Phase 2 pages branch:
      `navCoverage.test.tsx` renders every page under a stand-in for
      `RootLayout` that had no `PageMessageProvider`, so the two thread
      pages, which ask for one since Phase 2, rendered nothing there and
      the test failed. The stand-in now provides it, as `MainLayout`
      does. The lesson for the next unit of this kind: a page that
      starts using `usePageMessage` is covered by `navCoverage`, so run
      that test too.

- [x] Found when CI ran the Phase 4 branches, folded into the Phase 1
      branch: the `eslint` script in `package.json` now runs
      `yarn generate:types` first, as `typecheck:all` does.
      `src/generated/*.json` is gitignored and CI's lint job never
      produced it, so on CI every type built from it in
      `src/types/cbac.ts` was the error type, and the `no-unsafe` rules
      reported a `BaseProfessionId` spread as a spread of `any`. Locally
      the files were there from the last type check, which is why the
      lint passed here and failed there. Nothing fired while those rules
      were scaffolded off, so the branch that turned them on for tests
      was the first to show it.

## Phase 7: Exemptions that lift one restriction, not the rule

A review of `eslint.config.js` from another worktree on 15 October 2026
found that every exemption block sets `no-restricted-imports` to `off`,
which lifts all four restrictions at once. Verified here by linting a
probe through `--stdin`: `src/main.tsx` importing `ActionIcon`, `Loader`
and a `@/stories/` helper produced no finding, and so did
`IconButton.tsx` importing `Loader`. Each block's comment promises one
exception; the config gives all of them, to every file in the three lists
and to every story.

- [x] In `frontend/eslint.config.js`, name each restriction once, as a
      constant above the config: the `MantineProvider` entry, the
      `ActionIcon` entry, the `Loader` entry and the `@/stories/*`
      pattern. Build the main rule from all four. Rewrite each override
      to restate `"no-restricted-imports": ["error", {...}]` with only
      the entries that still apply there: the `MantineProvider` entry
      points keep the other three; the icon-button wrappers keep every
      entry but `ActionIcon`; the two buttons with a ring keep every
      entry but `Loader`; stories keep the three Mantine entries and lose
      only the `@/stories/*` pattern. Fold the two blocks that name
      `src/main.tsx` into one, and the two that name
      `.storybook/preview.tsx`, since a reader looking for what a file is
      excused from should find it in one place. Done on 15 October 2026,
      through a `restrictImports({ paths, patterns })` helper that each
      exemption calls with what it keeps; the level stays `warn` until
      Phase 9. Restating the rule found three stories that had been
      living on the blanket `off`: `ButtonPair.stories.tsx` shows the
      ring a button carries while it works, so it joins the ring list;
      `RouteErrorFallback.stories.tsx` and `PageMessage.stories.tsx`
      supply their own router and so must mount `MantineProvider`, as
      `.claude/rules/components.md` says, and have a block of their own.
      The generic stories block sits before those, since a later block
      wins and each of them excuses one story from one more thing.

- [x] Pin it with a test, since the fault was a comment promising what
      the config did not do. `frontend/src/lint/eslintConfig.test.ts`
      builds an `ESLint` instance from the real config with
      `lintText(code, { filePath })` and checks, for each exempt file and
      one that is not, which of the four imports is reported. The
      type-aware rules make the instance slow to build, about the six
      seconds the pre-commit hook pays, so build it once in `beforeAll`
      and keep the probes few. If it cannot be kept under ten seconds,
      pass `overrideConfig` to turn the type-aware rules off for the
      probes and say so in the test, since what is under test is the
      restriction rule alone. Done on 15 October 2026: six probes, 7.5
      seconds in the container, the first six of them the project
      service loading. The test runs under jsdom like every other, since
      `src/test/setup.ts` needs `window`; ESLint does not mind. Two
      things it taught: the probe's path must be a file the project
      knows, or the project service refuses it; and the rule's own
      prefix comes before the custom message, so a result is matched
      with `includes`, not `startsWith`.

## Phase 8: Plain JavaScript is checked, or not listed

The same review found that the `eslint` script names `js` and `jsx`
files, but the main config block matches only `**/*.{ts,tsx}`, so
`public/colour-scheme.js` is checked with no rules at all: verified with
`--print-config`, which lists none. `public_pages/scripts/generate-pages.cjs`
is not matched by the script's glob either. Both run in production, one in
every browser before the app loads. The `languageOptions` on the TypeScript
block, `ecmaVersion: 2020` and `globals.browser`, does nothing there:
`tseslint.configs.recommended` turns `no-undef` off because TypeScript
makes that check, and the parser ignores `ecmaVersion`. It is what a
JavaScript block would need.

- [x] Add a block for `**/*.{js,cjs,mjs}` extending
      `js.configs.recommended` and `eslintConfigPrettier`, with
      `globals.browser` for `public/**` and `globals.node` for
      `public_pages/scripts/**` and the config files at the root. Move
      `globals.browser` off the TypeScript block and drop
      `ecmaVersion: 2020` from it. Add `cjs` and `mjs` to the script's
      glob in `package.json`. Then read what the two files report and
      fix it; `colour-scheme.js` is a few lines and
      `generate-pages.cjs` has a test beside it.
      Done on 15 October 2026, in one branch with Phase 9, which is a
      few words on its own. Neither file reported anything once checked,
      so there was nothing to fix; the block also carries the three
      `no-eval` family rules the TypeScript block has. The config test
      gained a probe that puts an undefined name in
      `public/colour-scheme.js` and expects `no-undef`, and nothing for
      `document`.

## Phase 9: Say error where it means error

- [x] The `eslint` script runs with `--max-warnings=0`, so every `warn`
      in the config already fails the hook and CI. Change
      `no-restricted-imports`, `no-secrets/no-secrets`, `react/no-danger`
      and the two `regexp` rules to `error`, so a reader does not take
      `warn` for soft. One branch with the step below. Done on 15 October 2026, in the Phase 8 branch.

- [x] Remove `eslint-plugin-prettier` from `devDependencies`. It is
      installed and referenced nowhere: the config uses
      `eslint-config-prettier`, which turns rules off, not the plugin,
      which would run Prettier as a rule. `yarn remove` changes the
      lockfile, so run `just utr` before the unit tests, as `CLAUDE.md`
      says for a `package.json` change. Done on 15 October 2026; `yarn remove` took 40 lines out of the lockfile and nothing else changed.

## Phase 10: No casting an object literal into a type

`{...} as User` tells TypeScript to trust that an object is a `User`
whatever it holds, so a missing or misspelt field passes the type check.
That is how the 24 test fixtures Phase 4 found got past `tsc`: each was
cast, so nobody was told it had three fields of eleven.
`@typescript-eslint/consistent-type-assertions` with
`objectLiteralTypeAssertions: "never"` reports the cast and leaves the
fix to a type annotation (`const user: User = {...}`) or `satisfies`,
both of which do check the fields. Probed on 15 October 2026 against the
finished config: 28 findings, 21 in tests and 7 in app code.

- [x] Turn the rule on, `["error", { assertionStyle: "as",
      objectLiteralTypeAssertions: "never" }]`, and fix the 28. A test
      fixture becomes an annotated constant or `satisfies`; where a test
      deliberately passes a partial object, it says so with `Partial<>`
      and a helper that fills the rest, as Phase 4 did for logbook
      entries. In app code, read each for why it was cast:
      `cloneElement(icon, {...} as ...)` in `Icon.tsx` and
      `ExtraButton.tsx` is a props object for an element whose props
      type is unknown, so it may need `satisfies` or a narrower type on
      `icon`; `row={{} as T}` in `DataTable.tsx` and
      `DataTableWithResults.tsx` is an empty row for a skeleton, which is
      a real lie about `T` and wants the prop to accept `T | undefined`
      or a placeholder row type; `TopRibbon.tsx`, `Home.tsx` and
      `test-utils.tsx` are to be read. Where a cast is genuinely the
      only way, the rule is turned off for that line with the reason
      beside it. Add a case to `src/lint/eslintConfig.test.ts` that the
      rule reports `{} as User`. One branch with the step below.
      Done on 15 October 2026, 28 of 28. The app code went as follows.
      `Icon.tsx` and `ExtraButton.tsx` narrow the icon element once to
      `ReactElement<TablerIconProps>`, with the reason (every icon in the
      app is a Tabler one), so the props object needs no cast; typing the
      prop itself that way would have rippled through ten callers that
      pass a plain `ReactElement`. The two tables' `row={{} as T}` was a
      `DataCard` with an empty row only so that it would draw its
      skeleton: a new `DataCardSkeleton`, exported beside `DataCard`
      with a story and a test, takes no row at all. `TopRibbon.tsx`
      uses Mantine's own `CSSProperties`, which allows CSS variables,
      instead of casting into React's. `Home.tsx` annotates its
      `Patient`. In the tests: `createMockResponse` in `test-utils.tsx`
      and the fetch stubs in `SideNavContent.test.tsx` build a real
      `Response`, so `ok` follows the status; the `ok` option went from
      `createMockResponse`, its one caller and its two README examples.
      The auth stubs build a real signed-out state, `{ status, user: null }`,
      instead of `{ status } as never`. Two `matchMedia` stubs annotate
      a `MediaQueryList`, which they already supplied in full. Three
      casts stay, each turned off for its line with the reason: two
      stand-ins for browser objects of which one field is read (an
      `IntersectionObserverEntry`, an `Animation`), and in
      `inbox.test.ts` a `malformed()` helper, since an answer of the
      wrong shape is what that test is for.

- [x] Turn on `@typescript-eslint/no-unnecessary-type-arguments`, which
      reports a type argument that only repeats its default. It catches
      repetition rather than mistakes, and is in `strictTypeChecked`, not
      `recommendedTypeChecked`, which is why Phase 1 did not bring it.
      It is here because it costs almost nothing: probed on 15 October
      2026, it found three, all in `src/components/form/Form/Form.tsx`.
      It has an auto-fix; run it and read the diff. Add a case to
      `src/lint/eslintConfig.test.ts` alongside the one above.
      Done on 15 October 2026, by hand rather than the auto-fix: the two
      navigation-blocker components in `Form.tsx` are now generic in the
      form's values, so `control` is `Control<T>`, and the
      `methods.control as unknown as Control<FieldValues>` that fed them
      is gone. That double cast was the third finding.

## Phase 11: The public site is type-checked, strictly, in CI

Asked on 15 October 2026 whether TypeScript is enforced on every file, a
count said no. Of 1,322 tracked source files in `frontend/`, 30 are in no
tsconfig that CI runs: `yarn typecheck:all` reads `tsconfig.check.json`,
`yarn build` runs `tsc -b` over the projects `tsconfig.json` references,
and neither reaches them. Twenty-five are the public site; the other five
are plain JavaScript, which Phase 12 deals with.

The public site's files, everything in `public_pages/src/` plus its
`vite.config.ts` and `scripts/generate-pages.test.ts`, belong only to
`public_pages/tsconfig.json`. Nothing runs it, it is not `strict`, and
run by hand it reports 660 errors. None of them is in a public page: all
are in the `../src` it includes whole, whose `@lib/*` and `@test/*`
aliases it does not map and whose test globals it does not load. Vite
builds the site without type-checking it, so a type error in a public
page reaches the live site unnoticed.

- [x] Rewrite `public_pages/tsconfig.json` to extend the app's strict
      settings and include only `src`, `scripts` and `vite.config.ts`,
      letting module resolution follow the imports into `../src` rather
      than including that folder whole, so the shared code is checked as
      the public site uses it and the app's tests are not dragged in. Map
      every alias the shared code it imports uses. Then fix what strict
      mode reports in the public pages themselves, and record the count.
      Done on 15 October 2026. It extends `tsconfig.app.json`, which
      brings `strict` and every alias from `tsconfig.json`, and includes
      the site's own files plus `../src/**/*.d.ts` for the declarations
      the shared code relies on. Strict mode reports nothing: none of the
      660 was ever in a public page. `tsc --listFilesOnly` shows all 26
      of the site's files and the 41 shared files they import, and a
      planted type error in a public page is now reported. One thing
      found on the way: the `postcss-preset-mantine` declaration Phase 5
      added only takes effect when it is read before the package's own
      bare `declare module`, so the declarations are listed first in
      `include`, with the reason in the declaration file itself, since the pre-commit `check-json` hook refuses comments in a tsconfig.

- [x] Run it in CI. Add it to `typecheck:all`, and decide whether it also
      joins the references in `frontend/tsconfig.json`: `tsc -b` there
      runs in the app's Docker build, which has no need to wait on the
      public site, so `typecheck:all` alone is the expectation; record
      the choice here. Read `.github/workflows/public-site.yml`, which
      builds and deploys the site, and make sure a type error fails CI
      before that workflow can publish it.
      Done on 15 October 2026: `typecheck:all` runs it after
      `tsconfig.check.json`, and it is not in `tsconfig.json`'s
      references, so the app's Docker build does not wait on the public
      site. `public-site.yml` publishes on a push to `main`, and nothing
      reaches `main` without the merge queue re-running the
      `typecheck:all` leg of `ci.yml`, so a type error in a public page
      fails before it can be published. Phase 12's guard is what pins
      the site's files as covered.

## Phase 12: No JavaScript files, and a guard that keeps it so

The five plain JavaScript files in `frontend/` are type-checked by
nothing: `public/colour-scheme.js`, `public_pages/scripts/generate-pages.cjs`,
`eslint.config.js`, `postcss.config.cjs` and `test-runner-jest.config.js`.
Agreed on 15 October 2026: convert them to TypeScript rather than check
them in place with `checkJs`, because "there are no `.js` files" is a rule
a guard can enforce and a reader can trust, where a JavaScript file with
JSDoc types is one more thing to remember. Four need nothing converted
back, because the tool that runs each reads TypeScript itself; only
`colour-scheme` must be served as JavaScript and needs a build step.

- [x] `public_pages/scripts/generate-pages.cjs` becomes
      `generate-pages.ts`, run by `tsx` in `pages:gen`, as
      `generate:types` already is. Its test imports it directly rather
      than through `createRequire`. Check `public-site.yml` and the dev
      scripts still run it.
      Done on 15 October 2026, run by Node itself rather than `tsx`:
      `tsx` is a dependency of the frontend workspace, not of
      `public_pages`, so Yarn does not put it on that workspace's path,
      and Node 24, which CI's `setup-frontend` installs, strips types by
      default. The pages it writes are byte for byte the same.

- [x] `eslint.config.js` becomes `eslint.config.ts`. Find out whether
      ESLint 10 reads a TypeScript config on its own with the pinned
      Node, or needs `jiti` as a dependency, and record which here. Type
      the helper and the constants Phase 7 added.
      Done on 15 October 2026. ESLint 10 needs `jiti` to load a
      TypeScript config; its native loader is behind a flag named
      `unstable_native_nodejs_ts_config`, which the editor's ESLint would
      not pass, so `jiti` is a dev dependency. The config is in
      `tsconfig.node.json`, which `typecheck:all` now runs as well, since
      until now only `tsc -b` in `yarn build` did. Storybook's flat config
      is cast to ESLint's `Linter.Config[]`: the plugin types its rules
      on typescript-eslint's `RuleModule`, which ESLint's config type
      does not accept though ESLint runs them.

- [x] `postcss.config.cjs` becomes `postcss.config.ts`, typed with
      PostCSS's own config type. Check both the dev server and
      `yarn build` pick it up, and Storybook, whose `main.ts` sets its
      own PostCSS plugins.
      Done on 15 October 2026. Vite loads it; a production build before
      and after gives the same eighteen CSS files with the same content
      hashes, with every `$mantine-breakpoint` variable resolved, so the
      TypeScript config was read and does what the old one did. Vitest
      reads it through Vite, and Storybook's `main.ts` sets its own
      plugins, so neither depends on the file's form.
      Missed at first, and caught by CI: `src/breakpoints.test.ts` loaded
      `postcss.config.cjs` by name through `createRequire`. It now
      imports `postcss.config.ts`, typed, and three comments that named
      the old file were corrected. The full unit suite was run after, as
      `CLAUDE.md` allows when CI is red; it also showed the ESLint config
      test could time out its first case on a busy machine, so the
      project service is now loaded once in `beforeAll`.

- [x] `test-runner-jest.config.js` becomes `.ts` if the Storybook test
      runner will load it; Jest reads a TypeScript config only through
      `ts-node` or similar. If that means a new dependency or a fight,
      keep it JavaScript and check it in place instead: `allowJs`,
      `checkJs` and `strict` in a small tsconfig run from
      `typecheck:all`, with the reason recorded here. It is the one
      exception this phase allows.
      Done on 15 October 2026, with no exception needed: Jest 30 loads a
      TypeScript config through Node's own type stripping when Node
      offers it, which Node 24 does, and the Storybook test runner finds
      `test-runner-jest*` whatever its ending. Loaded through
      `jest-config`, it reads back with the dark-mode accessibility setup
      file in place. Typed with `satisfies Config.InitialOptions`.

- [x] `public/colour-scheme.js` becomes `src/colour-scheme.ts`. It must
      stay a plain blocking `<script>` in the `<head>`, because a module
      script may run after the first paint and bring back the white
      flash it exists to prevent, so Vite's own handling of `index.html`
      scripts will not do. Add a small plugin to `vite.config.ts`, as
      `pdfjsDecoders` is, that compiles it with esbuild to a fixed-name
      `colour-scheme.js`, serves it in dev and emits it in the build;
      `index.html` loads `/colour-scheme.js` as now. Check the content
      security policy in `caddy/prod/Caddyfile` still allows it, and
      add a test that the built file exists and `index.html` loads it as
      a classic script. `e2e/tests/colour-scheme.spec.ts` covers what it
      does.
      Done on 15 October 2026. The plugin, `colourSchemeScript` in
      `scripts/colourSchemeScript.ts`, compiles with Vite's own
      `transformWithOxc` rather than esbuild: Vite 8 is built on Oxc, so
      no other compiler is needed. Departed from the plan in that one
      word. It serves `/colour-scheme.js` in dev and writes it to the
      build under the same name; the built file is the source less its
      types, and `index.html` is unchanged. `colourSchemeScript.test.ts`
      checks the output is a plain script with no module syntax and that
      `index.html` loads it without `type="module"`, `defer` or `async`.
      The content security policy is untouched: the file is still served
      from the site's own origin.

- [x] Add the guard. A script beside `run-frontend-lint.sh` lists every
      tracked `.ts`, `.tsx`, `.js`, `.cjs` and `.mjs` file in `frontend/`
      (less `src/generated/` and `.d.ts`), and fails on two counts: any
      `.js`, `.cjs` or `.mjs` file not on its allow-list, which holds only
      the Jest config if the step above kept it; and any file that no
      project `typecheck:all` runs includes, asked of each project with
      `tsc --listFilesOnly`. Run it in the `typecheck:all` leg of
      `ci.yml`, give it a bats test with a planted `.js` file and a
      planted file outside every project, and record the counts it
      reports.
      Done on 15 October 2026, as
      `.github/scripts/ci/check-typescript-coverage.sh`, run after
      `yarn typecheck:all` in that leg of `ci.yml`. It reads the projects
      from the `typecheck:all` script in `package.json`, so the two
      cannot drift apart, and fails below 500 files, as the lint guard
      does, in case it is run from the wrong folder. It reports all
      1,324 source files covered; the allow-list is empty. Seven bats
      cases plant a `.js`, a `.cjs` and an `.mjs` file and a TypeScript
      file no project includes. With no JavaScript left, the JavaScript
      block in `eslint.config.ts`, its probe in `eslintConfig.test.ts`
      and the `js`, `jsx`, `cjs` and `mjs` in the `eslint` script's glob
      went too, and so did the `globals` package, which only that block
      used.

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

- **Two of the review's findings were already done** - the move from
  `tseslint.config()` to `defineConfig` landed as pull request #1989 the
  day before, and the React hooks rule set moved from `recommended-latest`
  to `recommended` in Phase 1. Three it checked and found fine are left
  as they are: the repeated `@mantine/core` entries all fire, `react/no-danger`
  runs without the "React version not specified" warning, and Storybook's
  config sitting after Prettier is harmless since it has no stylistic rules.
