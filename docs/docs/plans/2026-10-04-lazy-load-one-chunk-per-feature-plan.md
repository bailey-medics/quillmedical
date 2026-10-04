# Lazy load one chunk per feature plan

Quill is now several products in one bundle: clinical, teaching, admin,
passport and safety. Almost every page is a static import in
`frontend/src/main.tsx`, so every visitor downloads all of them, including
the ones their deployment has switched off. The teaching environment on GCP
runs with clinical content off, and still ships every patient page. Passport
and safety are loaded on demand already, but one chunk per page: thirty-one
small files, each a live network fetch on every navigation inside the
feature, since JavaScript is not in the service worker's precache.

The outcome is one rule, applied everywhere: **a feature is one lazy chunk,
and there are no per-page chunks.** Clinical, admin and teaching each become
one chunk, and passport and safety are refactored from per-page chunks to
one each. Entering a feature costs one fetch and nothing after it, so
nothing is fetched in the middle of an exam or a half-written message. The
saving in bytes is expected to be modest, because roughly seventy per cent
of the entry chunk is Mantine, React and React Router; the point is that a
deployment downloads only the products it uses. Once the first page is up
and the browser is idle, the other features a person can open are fetched
quietly in the background, so the smaller first load does not cost a wait
on the first click into each one.

## Phase 1: Measurement and the shared helper

- [x] **Add a `just` recipe that builds the frontend and reports chunk
      sizes**, following `.claude/rules/just.md`. No recipe does this today:
      `yarn build` runs only inside `frontend/Dockerfile`. It should run the
      production build in the unit-test container from
      `compose.unit-tests.yml`, so it works from any worktree, and print
      each file in `dist/assets` with its raw and gzipped size, and whether
      `dist/index.html` references it. Every later phase is proved with this
      recipe, not with the diff: a `lazy` that defers nothing looks
      identical in review.
- [x] **Record the baseline here before changing anything.** The last
      figure is from 14 September: entry chunk 1,016.57 kB raw, 280.38 kB
      gzipped. Safety has been split out and a good deal of code added
      since, so re-measure. Quote the **entry chunk gzipped**; the 930 kB
      figure in the `keepNames` comment in `vite.config.ts` counts the whole
      build and is not comparable.
      - **Measured 4 October, with `just frontend-chunks` (`just fc`).**
        First load is no longer one file. The bundler now cuts shared
        code into chunks of its own (`page-header`, `form`, `DataTable`
        and so on) and `index.html` preloads them, so there are **34
        first-load files: 1,645.81 kB raw, 434.96 kB gzipped**. Of that,
        JavaScript is 1,361.75 kB raw and **391.44 kB gzipped**; the
        largest single file, `index`, is 209.77 kB gzipped. The 280 kB
        figure from September was one file and is not the same measure.
      - **So every later phase compares the first-load total**, which is
        what the recipe prints, not one chunk's size. A page moved out of
        `index` but still preloaded by `index.html` has saved nothing,
        and only the total shows that.
      - **On demand today: 65 files, 672.40 kB gzipped**, nearly all of
        it the video player's three libraries (`dash`, `hls` and one
        more: 568 kB gzipped between them), which were already split.
        Passport and safety account for the 31 per-page chunks plus a
        dozen small shared ones.
      - **A 5 kB `passport` chunk is in first load.** Something every
        visitor loads imports passport code, most likely the navigation.
        Phase 4 should find out what, and whether it belongs there.
- [x] **Add `lazyFrom` in `frontend/src/lib/lazyRoute.ts`, with a test.**
      It takes a loader and the name of one export, and returns what React
      Router's `lazy` wants:

      ```ts
      // frontend/src/featureChunks.ts
      export const loadAdmin = () => import("./pages/admin/adminChunk");

      // frontend/src/main.tsx
      { path: "users", lazy: lazyFrom(loadAdmin, "AdminUsersPage") }
      ```

      The loaders live together in `frontend/src/featureChunks.ts`, one
      added per phase, because Phase 7 calls the same functions to warm a
      feature in the background.

      Type the name as a key of the loaded module, so a misspelt page is a
      compile error. Every route in a feature shares one loader, which is
      what makes it one chunk: Rollup cuts a chunk per `import()` target,
      and there is now one target per feature. This is still a deferred
      import. The form `todo.md` warns against is
      `element: import(...).then(...)`, which fires at module evaluation.

      One trap to cover in the test: when the recovery handler in
      `swUpdateGate.ts` calls `preventDefault()` on `vite:preloadError`, the
      failed `import()` resolves to `undefined` instead of rejecting. The
      page is about to reload, but `lazyFrom` must not throw "cannot read
      properties of undefined" on the way, which is the crash recorded
      there on 24 September.
- [x] **Run `just uf src/lib/lazyRoute.test.ts`** and `yarn typecheck:all`.
      Nothing wider.
      - The size report is `frontend/scripts/chunkSizes.ts`, tested beside
        it as `computeCompatGeneration.ts` is. There is no recipe for
        `yarn typecheck:all`, so it was run in the same test container by
        hand; `just fc` also type-checks the app, since `yarn build` runs
        `tsc -b` first.

## Phase 2: Clinical

First because it is the furthest from use: the teaching environment has
clinical content off, so a mistake here reaches no one even once delegates
arrive.

- [x] **Create `frontend/src/pages/clinical/clinicalChunk.ts`** re-exporting the
      eleven pages routed under `<RequireClinical>`: `Patient`,
      `PatientLetters`, `PatientLetterView`, `PatientMessages`,
      `PatientMessageThread`, `PatientDocuments`, `PatientDocumentView`,
      `PatientNotes`, `PatientAppointments`, `Messages` and `MessageThread`.
      The page files stay where they are in `pages/`; moving them is a
      separate tidy-up and would bury this change in renames.
- [x] **Switch the clinical subtree in `main.tsx` to `lazyFrom`** and delete
      the eleven static imports. Each `handle` stays on the route object
      exactly as it is: `isRouteSafeForReload` reads it synchronously,
      before the chunk has loaded. The four message routes stay without
      `safeForReload`, and the `handle: { clinical: true }` on the subtree
      root is untouched. One chunk matters here for the same reason it does
      in teaching: opening a message thread must not need a fetch that can
      fail on a route that cannot safely reload.
- [x] **Leave `NewPatientPage` out.** It lives beside the patient pages but
      is routed only under `/admin/patients`, so it belongs to Phase 3.
- [x] **Measure with the Phase 1 recipe and record the result here**: one
      clinical chunk exists, `index.html` does not reference it, no
      per-page clinical chunks exist, the entry chunk is smaller, and the
      build prints no "dynamically imported but also statically imported"
      warning for any of the eleven. Rollup may also cut a shared chunk for
      components that two lazy features use and the entry chunk does not.
      That is fine: it loads with the feature, not mid-flow.
      - **Measured 4 October.** One `clinicalChunk` file on demand,
        41.64 kB raw and 11.83 kB gzipped, with a 0.15 kB stylesheet, and
        no per-page clinical chunk. `index.html` references neither.
        First load fell from 434.96 to **425.87 kB gzipped**, 9.09 kB
        less. No "also statically imported" warning.
      - **The module is `clinicalChunk.ts`, not `chunk.ts`.** The bundler
        names a chunk after the file it starts from, so five features
        each with a `chunk.ts` would build five files all called
        `chunk-<hash>.js`, and the size report could not tell them apart.
        Every later phase names its module after its feature for the
        same reason.
      - **First load went from 34 files to 39.** Moving the pages changed
        which components are shared between first load and a lazy chunk,
        so the bundler cut `ErrorState`, `MultiSelectField`,
        `SolidSwitch` and `message-cards` into files of their own. They
        are still first load and are counted in the total above.
      - **A guard test, `frontend/src/featureChunks.test.ts`**, reads
        `main.tsx` and fails if a page in a chunk is also imported there
        statically, or if the chunk module is imported any way but
        through its loader. Each later phase adds its chunk to the list.
- [ ] **Open a patient and a message thread on the dev stack** with clinical
      services on, to see the chunk fetched once and the pages render.
      Not done in the unattended run that built this phase: it needs a
      browser and a dev stack with clinical services on, and the E2E
      stack runs with them off. Left for a human before merging.

## Phase 3: Admin

- [x] **Create `frontend/src/pages/admin/adminChunk.ts`** re-exporting every
      page routed under `/admin`: `AdminPage`, the users, patients,
      organisations, sites, members and feedback pages, the five
      `pages/admin/teaching/` pages, and the two that live outside the
      folder but are routed only here, `NewPatientPage` and
      `UserInfoUpdatePage`. Teaching's admin pages go with admin, not with
      the learner chunk: a learner should not download them, and somebody
      administering teaching is already in Admin.
- [x] **Switch the `/admin` subtree to `lazyFrom`** and delete the static
      imports. The nested `RequireCompetency` and `RequireOperator`
      wrappers are guards, not pages, and stay as static imports with their
      `<Outlet />`. Handles stay on the route objects; the wizard and edit
      routes stay unsafe for reload.
      - **Ten admin routes wrap their page in a guard of their own**,
        inline: `element: <RequireCompetency …><EditSitePage /></…>`. Two
        of those also pass a prop (`<OrgFeaturesPage parentPath="sites" />`).
        A bare `lazy` cannot express either. Nesting the page under a
        guard route would, but it makes the page's route the leaf, and
        `isRouteSafeForReload` reads `handle` off the leaf only, so every
        `handle` would have had to move with it. Instead `lazyFrom` takes
        an optional third argument, a function given the loaded page and
        returning what the route renders:
        `lazyFrom(loadAdmin, "EditSitePage", (Page) => <Guard><Page /></Guard>)`.
        The route tree is unchanged, one route for one route. Without the
        third argument the page must need no props, checked at compile
        time.
      - **The guard now renders after the chunk has loaded**, because the
        router resolves a route's `lazy` before it renders anything. So
        somebody without the competency who types an admin address
        downloads the admin chunk and then sees the 404. That is how
        passport has behaved since it was split, the code holds no
        secrets, and the API refuses the data either way.
- [x] **Measure and record**, as in Phase 2. Admin is the largest area, 31
      page files, so this is where the entry chunk should move most.
      - **Measured 4 October.** One `adminChunk` file on demand, 145.21 kB
        raw and 35.89 kB gzipped, holding 33 pages. First load fell from
        425.87 to **384.46 kB gzipped**, 41.41 kB less, and 50.50 kB less
        than the baseline. `index` itself is now 159.03 kB gzipped, from
        209.77 kB. No "also statically imported" warning.
      - **Nine more small files appeared on demand**, 78 from 69. They are
        components shared by admin and another lazy feature but not by
        first load, and they are fetched with the feature that needs
        them, not one per page.
- [ ] **Walk the admin area on the dev stack** as a `manage_users` holder
      and as a `manage_teaching` holder, since the scoped manager sees a
      different subset of the same chunk.
      Not walked by hand in the unattended run. In its place,
      `just e2e member-practice user-form-practice navigation` ran against
      a production build of this branch and passed, 11 tests. Those open
      `/admin/users/new`, a plain lazy route, and
      `/admin/organisations/:id/members/:userId`, one whose guard is
      passed to `lazyFrom`, in a real browser. The walk as a
      `manage_teaching` holder is still to do.

## Phase 4: Passport and safety become one chunk each

- [x] **Create `frontend/src/pages/passport/passportChunk.ts`** re-exporting each
      page's `Component` under its own name
      (`export { Component as PassportPage } from "./PassportPage"`), and
      point all sixteen passport routes at it with `lazyFrom`. Include
      `CpdDateRangesPage` from `pages/settings/`, which is routed inside the
      passport block and is the only other per-page chunk in the app. The
      pages keep exporting `Component`, so their tests do not change.
- [x] **Include the two public routes, `/passport/assessors/accept` and
      `/passport/verify/:signOffId`**, in the same chunk. See Decisions.
- [x] **Do the same for safety** in `frontend/src/pages/safety/safetyChunk.ts`,
      for its fourteen routes. It is a throwaway mock-up, but leaving it
      per page would leave the one counter-example somebody copies next.
- [x] **Rewrite the passport comments in `main.tsx`** that call it "the
      pilot for code splitting" and "the app's first lazily-loaded
      subtree". Keep the warning that `handle` stays on the route object.
- [x] **Measure and record.** The entry chunk should not change. What
      should change is the count: thirty-one page chunks become two.
      - **Measured 4 October.** `passportChunk` is 71.22 kB raw and
        18.23 kB gzipped, holding 17 pages; `safetyChunk` is 45.34 kB raw
        and 12.22 kB gzipped, holding 14. No per-page chunk is left
        anywhere in the build.
      - **The entry did change, which this step said it would not.**
        First load fell from 384.46 to **371.49 kB gzipped**, and from 41
        files to 13. On demand fell from 78 files to 28. With thirty-one
        page chunks each sharing a different handful of components, the
        bundler had cut dozens of small shared files and preloaded most
        of them. With four feature chunks there is far less to share
        out, so the fragments collapsed back into a few larger files.
        Fewer requests on first load as well as fewer bytes.
      - **The 5 kB `passport` file in first load, noted in Phase 1, was
        one of those fragments**, not passport pages leaking into first
        load. It is gone. What remains is `specialties`, 4.04 kB gzipped:
        the passport specialties list from `shared/`, which something in
        first load imports. Small, and left alone.
      - **`featureChunks.test.ts` now carries the rule itself**: it fails
        if any route in `main.tsx` has a bare `lazy: () => import(…)`.

## Phase 5: A chunk that cannot load shows the app's error page

Found while preparing teaching, and done first because teaching should
not be split until it holds.

- [x] **Show the app's own error page when a lazy chunk cannot be
      fetched.** The recovery handler in `swUpdateGate.ts` reloads the page
      when the route somebody is on is safe to reload. When it is not, it
      lets the import reject, and its comment says "the nearest
      `ErrorBoundary` shows its fallback". For a route's `lazy` that is
      not what happens. The router catches the rejection itself and
      renders the nearest route's `errorElement`, and no route in
      `main.tsx` had one, so it showed React Router's developer screen,
      "Unexpected Application Error!", in production. A probe test
      confirmed it, with an `<ErrorBoundary>` in the layout's element and
      all. Passport and safety have had this gap since they were split.

      The fix is `RouteErrorFallback` in
      `frontend/src/components/error-boundary/`, set as the `errorElement`
      of the root route beside `RouteTracking`, so every tree inherits it.
      It reads the error with `useRouteError`, reports it as the boundary
      does, and renders the same `ErrorFallback`: the message, "Reload
      page" and "Tell us what happened". Its test pins both halves: with
      it the app's page shows, and without it the developer screen does,
      so the day the router changes this the test says the component is
      no longer needed.
- [x] **Run `just uf src/components/error-boundary`** and
      `yarn typecheck:all`. It has a story, which brings its own router
      because the story needs one that holds a route error.

## Phase 6: Teaching

Last, because it is the area real users will arrive on, and by now the
pattern has been proved four times. Nobody uses Quill yet, but the first
delegates are expected within weeks of 4 October 2026. The aim is to land
this phase and Phase 7 before they do, so the exam path is changed and
tested while a mistake still reaches no one. If they arrive first, the
order holds and the checks in both phases matter more, not less.

- [ ] **Create `frontend/src/features/teaching/teachingChunk.ts`** re-exporting the
      eight learner pages `main.tsx` routes: `TeachingDashboard`,
      `TeachingModuleMain`,
      `LearningDashboard`, `SlideReader`, `AssessmentAttempt`,
      `AssessmentResultPage`, `AssessmentQuestionResultsPage` and
      `SyncStatus`.
- [ ] **Switch the `/teaching` children to `lazyFrom`.** `TeachingLayout`,
      `TeachingMainNav` and `NoAccessLayout` stay static: they are in the
      guard's `fallback`, which renders before any chunk loads.
      `TeachingRegisterPage` stays static too, as a sign-up page outside
      the feature gate.
- [ ] **Leave `assessment/:id` and `assessment/:id/result` unsafe for
      reload.** These two routes are why teaching must be one chunk. With
      per-page chunks, finishing an exam would fetch the result page; if a
      deploy landed during the attempt, that fetch fails on a route the
      recovery handler will not reload, and the result page reads
      `location.state.fromExam`, which a reload loses anyway. With one
      chunk the result page is already in memory when the exam starts.
- [ ] **Check what a first load of `/teaching` shows while the chunk is in
      flight.** The router has no `HydrateFallback`, so a cold load of a
      lazy route renders nothing until the chunk arrives. Passport has
      lived with that; teaching is the front door. Throttle the network in
      the browser and look. If there is a visible blank, add a
      `HydrateFallback` to the root route using an existing loading
      component from the catalogue.
- [ ] **Measure and record**, then run a full exam on the dev stack with
      the network panel open: one teaching chunk on entry, no JavaScript
      fetched between starting the attempt and seeing the result.

## Phase 7: Warm the other features in the background

Without this, the first click into each feature waits on a fetch. With it,
a teaching delegate who also has a passport lands on teaching and has the
passport chunk in memory before they look for it. It also means a tab that
has been open through a deploy already holds every chunk it can use.

**The rule that governs this whole phase: nothing here may disturb an exam
in progress.** Three separate things each guarantee that, so that no single
mistake can break it. They are the second, third and fourth steps below.

- [ ] **Give each loader in `frontend/src/featureChunks.ts` a "can open"
      test**, so the file is one list of feature, loader and who may reach
      it. Each test mirrors the guard on that feature's routes and reads
      what `/api/auth/me` already returns: `enabled_features` for teaching
      and safety, `useCanReachPassport` plus `assess_clinician_passport`
      for passport, `manage_users` or any of `SCOPED_MANAGER_IDS` for
      admin, `clinical_services_enabled` for clinical. Nobody fetches a
      feature they cannot open. Unit-test each one against its guard's
      conditions, so the two cannot drift apart silently.
- [ ] **Guarantee one: never start a background fetch from a route that is
      not `safeForReload`.** Write the scheduler in
      `frontend/src/lib/prefetchFeatures.ts`. It starts a fetch only when
      all of these hold, checked at the moment it fires and not when it
      was scheduled: the person is signed in; the current route passes
      `isRouteSafeForReload`; the router's navigation state is `idle`; the
      browser is idle (`requestIdleCallback`, with a timer fallback because
      Safari lacks it); the browser is online and does not report data
      saver or a 2G connection. It fetches one chunk at a time and
      re-checks every condition before the next. The exam, the exam
      result, the message threads and every form are unsafe routes, so
      nothing starts while somebody is on one. If they move to an unsafe
      route part-way through the list, it stops and picks up again when
      they are next on a safe one.
- [ ] **Guarantee two: a failed background fetch is ignored by the recovery
      handler.** A failed `import()` fires `vite:preloadError` whether a
      navigation or a background fetch asked for it, and
      `wirePreloadErrorRecovery` in `frontend/src/lib/swUpdateGate.ts`
      answers by reloading the page. An `import()` cannot be cancelled, so
      one that started on a safe route can still fail after the person has
      walked into an exam. The scheduler therefore exposes whether a
      background fetch is in flight, and the handler returns at once when
      one is **and** the router's navigation state is `idle`: no reload, no
      `persist`, no `preventDefault`, and no write to
      `quill-preload-reloaded`. The navigation check is what keeps real
      recovery working: a click that fails while a background fetch
      happens to be in flight is a navigation in the `loading` state, and
      is handled as it is today. Returning before
      `decidePreloadFailureAction` matters, because that function writes
      the loop-guard key, and a key written for a background failure would
      block a genuine recovery for the next minute. Add `navigation` to
      the `RouterLike` type. The scheduler catches the rejection itself and
      reports nothing to the user.
- [ ] **Guarantee three: an unsafe route is never reloaded, whatever asked
      for the chunk.** `decidePreloadFailureAction` already defers when the
      route is unsafe. Pin it with a test named for the exam, so that if
      the first two guarantees are ever broken the exam still survives.
- [ ] **Tests in `swUpdateGate.test.ts` and `prefetchFeatures.test.ts`**,
      each asserting on `reload` being called or not: a background fetch
      failing on a safe route does not reload and does not write the
      loop-guard key; one failing while the route is `assessment/:id` does
      nothing at all; a navigation failing while a background fetch is in
      flight still recovers; the scheduler starts nothing on an unsafe
      route, nothing while a navigation is loading, and nothing for a
      feature the person cannot open.
- [ ] **Mount it as a component that renders nothing, on the pathless root
      route beside `RouteTracking`** in `main.tsx`. That route is the one
      place every tree hangs from, the `/teaching` tree included, and the
      component needs both the router and `useAuth`.
- [ ] **Add an end-to-end test for the exam**, since this is the failure
      that matters most and a unit test cannot show a real browser not
      reloading. In Playwright, sign in as a delegate who also has another
      feature, start an exam, then abort every request for a feature chunk
      (`page.route` on `/assets/`), wait, answer and submit. Assert the
      page never reloaded, the answers are intact, and the result page
      renders. It runs in the CI heavy tier with the other E2E tests.
- [ ] **Check that a failed background fetch does not poison a later
      click.** Browsers differ on whether a failed dynamic import is
      retried or remembered as failed. Block one chunk in the network
      panel, let the background fetch fail, unblock it, then click into
      that feature, in Chrome, Safari and Firefox. If a browser remembers
      the failure, the click fails as a navigation and the existing
      recovery reloads from the safe route the person is on, which is
      acceptable. Record what each browser did here.
- [ ] **Run a full exam on the dev stack with the network panel open**: no
      JavaScript requested between starting the attempt and seeing the
      result, and the other features' chunks appear only once back on the
      dashboard.
- [ ] **Measure.** The entry chunk and `index.html` must be unchanged by
      this phase: a feature chunk referenced from `index.html` would mean
      it had become part of first load again.

## Phase 8: Record the rule

- [ ] **Add the rule to `.github/instructions/pages.instructions.md`** and
      run `/sync-copilot-config` so it reaches `.claude/rules/pages.md`: a
      new feature gets one `<feature>Chunk.ts`, a loader and a "can open" test in
      `featureChunks.ts`, and its routes use `lazyFrom`; never
      a bare `lazy: () => import("./pages/...")` per page; `handle` stays
      on the route object.
- [ ] **Tick off the code-splitting entry in `docs/docs/plans/todo.md`**,
      pointing at this plan, and note the two items it names that this
      plan leaves alone (see Decisions).
- [ ] **Write the final figures here**: entry chunk gzipped before and
      after, and each feature chunk's size.

## Decisions

- **One chunk per feature, never per page** – per-page chunks save almost
  nothing, because a page is about 1 kB gzipped (passport's first nine
  came to 10.4 kB in total), and each one costs an uncached request on
  every navigation. One chunk also removes a whole class of failure: no
  fetch can fail part-way through a flow. One rule is easier to follow
  than a judgement about which routes can stand a fetch.

- **Admin is one chunk, not one per section** – splitting it into users,
  organisations, sites and teaching was considered, since most visits
  touch one section. It was turned down for the same reason as per-page
  chunks: the saving is a few kilobytes, and the rule stays simple.

- **Passport's two public pages stay in the passport chunk** – an external
  assessor or somebody scanning a printed passport therefore downloads
  the whole feature to see one page. That is accepted for the sake of the
  rule. If the Phase 4 measurement shows the chunk is large enough to
  matter on a phone, a second `passport-public` chunk is the answer, and
  it is still a feature-level chunk, not a per-page one.

- **Chunks are not added to the service worker precache** – precaching
  them would download every feature for everybody on install, which is
  the cost this plan removes. Phase 7 does the selective version: only
  the features this person can open, and only when idle. Quill does not
  offer offline working, so nothing is lost by a chunk not being cached.

- **Background fetching calls the same loader, not a `modulepreload`
  link** – a `<link rel="modulepreload">` fails silently, which would
  avoid the recovery handler altogether. But it needs the hashed file
  name, which only the build knows, and calling the loader is the one
  thing guaranteed to warm exactly what the route will ask for. The cost
  is the handler change in Phase 7, which is small and tested.

- **Three guarantees for the exam, where one would do** – not starting on
  an unsafe route, ignoring background failures, and never reloading an
  unsafe route each cover the case alone. They are kept separate and
  separately tested because losing an attempt is the one outcome here
  that cannot be put right afterwards.

- **`/settings/totp` and the Markdown views are left alone** – `todo.md`
  names them because they pull in `qrcode` and `dompurify`. `TotpSetup` is
  a single page, so splitting it would be a per-page chunk, and
  `dompurify` is imported from `components/typography`, which pages in
  every feature use. Neither fits the rule, and both are small.

- **Page files do not move** – the clinical pages sit flat in `pages/`
  and `NewPatientPage` sits outside `pages/admin/`. A chunk module can
  re-export from anywhere, so tidying the folders is not needed and is
  kept out of these diffs.
