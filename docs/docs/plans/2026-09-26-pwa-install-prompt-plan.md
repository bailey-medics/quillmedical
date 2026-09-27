# PWA install prompt plan

Quill can already be installed as an app: `frontend/public/manifest.webmanifest`
asks for standalone display, `frontend/src/sw.ts` is registered in
`frontend/src/main.tsx`, and `index.html` carries the iOS meta tags fixed in
[the iOS standalone brief](2026-08-16-ios-pwa-standalone-brief.md). But nothing
in the app tells anyone this. The browser's own install signals are easy to
miss: an icon in Chrome's address bar, a menu item in Safari's share sheet.
An installed Quill opens full screen, has its own icon, and is the only way
iOS allows web push. So people who would benefit from installing it never find
out they can.

The result is a modal that asks a signed-in user once they have used Quill for
a day, and once more at seven days, if they still have not installed it. It
never asks again after that. Where the browser lets a web page start the
install (Chrome, Edge and Samsung Internet, through `beforeinstallprompt`), a
"yes" hands straight over to the browser's own install confirmation. Where it
does not (Safari on iPhone, iPad and Mac, Firefox on Android), the modal
explains the steps for that platform. Where installing is not possible at all,
it does not ask. The same process is also on the Settings page, as an "Install
app" action card shown on any device where Quill is not yet installed, so
someone can install it whenever they choose.

## Phase 1: Work out what this device can do

- [x] **Capture `beforeinstallprompt` as soon as the page loads**, in a new
      `frontend/src/lib/pwa/installPromptEvent.ts`. Chromium fires it once,
      often before React has mounted, and it is lost unless something is
      already listening. So the listener is added from `main.tsx` at module
      load, next to `wirePreloadErrorRecovery`, not from a hook. It calls
      `preventDefault()` to hold back Chrome's own mini-infobar on Android,
      so that the schedule in Phase 2 decides when anyone is asked. The
      address-bar install icon is not affected and stays available. The
      module keeps the event and exposes `getDeferredPrompt()` plus a
      `subscribe()` for a late arrival. It also listens for `appinstalled`,
      which marks the prompt finished (Phase 2) however the install happened,
      including through the browser's own menu. TypeScript's DOM library has
      no type for the event, so the module declares a small
      `BeforeInstallPromptEvent` interface with `prompt()` and `userChoice`
      rather than casting. The store is made by a factory,
      `createInstallPromptCapture()`, so each test gets its own, and
      `wire()` takes an `onInstalled` callback that Phase 2 points at the
      schedule's `finished` flag.

- [x] **Classify the device into one install route**, as a pure function
      `detectInstallRoute(env)` in `frontend/src/lib/pwa/installRoute.ts`.
      It takes an `env` object (user agent, `maxTouchPoints`, whether the
      deferred event exists, the `display-mode` media query result,
      `navigator.standalone`) rather than reading globals, so every branch
      can be unit tested without a browser. It returns a union type:

      - **`installed`** — running in `display-mode: standalone`, or
        `navigator.standalone` on iOS. Already installed; never ask.
      - **`prompt`** — a deferred `beforeinstallprompt` event is held. Quill
        can start the install itself. Chrome and Edge on desktop and
        Android, and Samsung Internet.
      - **`ios`** — iPhone or iPad, in any browser. Since iOS 16.4, Chrome,
        Edge and Firefox on iOS can add to the home screen through the share
        sheet as Safari does, so one set of steps covers them. iPadOS reports
        itself as a Mac, so a "Macintosh" user agent with
        `maxTouchPoints > 1` counts as iPad.
      - **`macos-safari`** — Safari 17 or later on a Mac: File, then "Add to
        Dock".
      - **`android-firefox`** — Firefox on Android: the menu, then "Add app
        to Home screen". Mozilla's help says the same item reads "Install"
        on some sites, so the steps name both.
      - **`windows-firefox`** — Firefox 143 or later on Windows: "Add tab to
        taskbar" in the address bar. Added while building: Firefox 143
        (September 2025) brought back web apps on Windows only, as "taskbar
        tabs", so Firefox on Windows is no longer `unsupported`. Firefox on
        a Mac or Linux still is.
      - **`chromium-manual`** — a Chromium browser with no deferred event.
        That happens when the user dismissed Chrome's own prompt recently, or
        Chrome's engagement rules have not been met. The browser menu still
        offers "Install Quill", so the modal explains that instead.
      - **`unsupported`** — Firefox on a Mac or Linux, which cannot install
        web apps, Safari before 17 on a Mac, and in-app browsers (a link
        opened inside Gmail, Outlook or Teams), which cannot either. In-app
        browsers are recognised by Android's `; wv)` web view marker, by an
        app naming itself (`FBAN`, `Instagram`, `GSA/` for the Google app),
        or on iOS by the missing `Safari/` token that every real iOS browser
        sends. An app that opens links in Apple's `SFSafariViewController`
        sends Safari's own user agent and cannot be told apart, so it gets
        the iOS steps; that is accepted. The automatic ask is not shown and
        none is used up, so someone who later opens Quill in a browser that
        can install it is still asked.

      Feature detection is preferred to user agent parsing wherever a feature
      exists to test. The user agent is used only to tell apart the manual
      routes, where no feature gives the answer.

- [x] **Unit test both modules**, in `installRoute.test.ts` and
      `installPromptEvent.test.ts` beside them. Cover one realistic user agent
      per route, including iPadOS on a desktop-class user agent, an in-app
      browser, and a Chromium user agent with and without the deferred event.
      Also cover the event module: `preventDefault` called, a late event
      reaching subscribers, and `appinstalled` marking the prompt finished.
      Run with `just uf src/lib/pwa`.

## Phase 2: Decide when to ask

- [x] **Store the schedule on the device**, in
      `frontend/src/lib/pwa/installPromptSchedule.ts`, under one
      `localStorage` key, `quill.installPrompt`. It holds a small versioned
      object: `firstSeenAt`, `asksShown` (0, 1 or 2), `lastAskedAt` and
      `finished`. Follow `frontend/src/lib/page-views/optOut.ts` for the
      shape: every read and write in `try`/`catch`, and a module comment
      giving the PECR reasoning recorded under Decisions. The value is checked on
      read, and anything malformed is treated as a new device. This is
      per-device, not per-user, on purpose: installing is something a device
      does. A user who installed on their phone should still be asked on
      their laptop. Times are stored as epoch milliseconds. The module also
      exports `markInstallFinished()`, which `main.tsx` passes to the
      Phase 1 `appinstalled` listener, and `isInstallFinished()`, which the
      Settings card in Phase 4 reads.

- [x] **Encode the rule as a pure function** `isAskDue(state, now)` beside
      it, so the timing is tested with plain dates rather than fake timers:

      - **First ask** — due once `now` is at least 24 hours after
        `firstSeenAt`.
      - **Second ask** — due once `now` is at least seven days after
        `firstSeenAt` and at least 24 hours after `lastAskedAt`. The second
        condition matters for somebody who first comes back on day ten. They
        get the first ask then and the second a day later, never both in
        one sitting.
      - **Never again** — once `asksShown` is 2 or `finished` is set.

      `firstSeenAt` is written the first time a signed-in layout mounts on
      the device. An ask counts when the modal is **shown**, not when it
      falls due, so an ask that could not be shown because the user was
      mid-form waits for a later page. "Not now", the close button, Escape
      and a dismissed browser confirmation all count as an ask. Only a
      completed install, or finding that the app is installed, sets
      `finished`.

- [x] **Fail closed when storage is unavailable.** A private window or blocked
      site data means `localStorage` throws. Without somewhere to record that
      an ask was shown, "ask twice, then never" becomes "ask on every page
      load". So if the schedule cannot be read, or the first-seen timestamp
      cannot be written, the modal is never shown.

- [x] **Unit test the schedule** in `installPromptSchedule.test.ts`: the
      boundaries at exactly 24 hours and exactly seven days, the late
      returner above, a malformed stored value, storage that throws on read
      and on write, and `finished` winning over everything. Run with
      `just uf src/lib/pwa`.

## Phase 3: Build the modal, and show it for review

- [x] **Build `InstallAppModal`** in
      `frontend/src/components/install-app-modal/`, composed from the same
      parts as `OfflineModal` and `ConfirmModal`: Mantine `Modal`, `Heading`,
      `BodyText`, `Icon` and `ButtonPair`. No new atomic component is needed.
      It is presentational: `opened`, `route`, `onInstall` and `onClose` come
      from the parent. It looks different for each route:

      - **`prompt`** — "Install Quill on this device?", one sentence on what
        installing gives (opens full screen from its own icon, and gets
        notifications), with "Install" and "Not now" through `ButtonPair`.
        "Install" calls `onInstall`, which runs `prompt()` on the deferred
        event and awaits `userChoice`. The button shows a loading state
        while the browser dialog is open, as `ConfirmModal` does.
      - **Each manual route** — the same heading and sentence, then the steps
        for that platform as a short numbered list, with a single "Got it"
        button. Each step names the control as the platform labels it
        ("Share", "Add to Home Screen", "Add to Dock", "Install"), with its
        icon where Tabler has one. The icons are registered in
        `components/icons/appIcons.ts` first, as the icon rule requires.
      - **`unsupported`** — "This browser cannot install Quill", naming the
        browsers that can (Chrome, Edge, or Safari on Apple devices), with a
        single "Got it" button. The automatic ask never shows this variant,
        but the Settings card in Phase 4 can, because a user who goes looking
        for the option should be told why it is not there rather than find
        nothing.

      The copy is in sentence case and British English. The platform steps
      are data, a map from route to steps, not branches in the JSX, so adding
      a platform is one entry. The map lives in its own `installSteps.tsx`,
      because the React fast-refresh lint rule allows a component file to
      export only components. `IconShare2`, `IconSquarePlus` and
      `IconDotsVertical` are registered for the steps.

      The wording comes from each vendor's current instructions, checked in
      September 2026:

      - **iOS** — since iOS 26, Safari no longer shows the Share button
        straight away: it is inside the "···" menu beside the address bar
        (Apple's iPhone User Guide, "Bookmark a website in Safari on
        iPhone"). The step says it "may be" there, because Chrome and Edge
        on iOS still show Share directly. The add dialog then has an "Open
        as Web App" switch, on by default, which the last step names.
      - **Safari on a Mac** — File, then "Add to Dock", or the Share button
        (Apple Support, "Use Safari web apps on Mac"). Only the menu route
        is given, as it is the one that does not move between versions.
      - **Firefox on Android** — the menu, then "Add app to Home screen";
        Mozilla notes the item reads "Install" on some sites, so both are
        named.
      - **Firefox on Windows** — "Add tab to taskbar" in the address bar,
        from Firefox 143 (Mozilla, "Use web apps in Firefox for Windows").
      - **Chrome and Edge without a prompt** — the browser menu, then
        "Install Quill", or "Add to Home screen" on a phone. Desktop Chrome
        moved it under "Cast, save and share" in 2024, which the step
        mentions.

- [x] **Write `InstallAppModal.stories.tsx` and `InstallAppModal.test.tsx`.**
      One story per route, in light and dark, so every variant goes through
      the Storybook axe checks. Tests cover each route's text and buttons,
      `onInstall` and `onClose` being called, the loading state, and Escape
      closing it.

- [ ] **Put the stories in front of a human before Phase 4.** The component
      rules ask for a new component to be reviewed before it is built into
      pages, and the platform wording is the part most likely to be wrong.
      Check each manual route's steps against a real device at the same
      time. Safari moved the share button behind the "···" menu in iOS 26,
      for example, so the steps have to match the iOS version people
      actually run. Change the steps in the stories until they match what
      the devices show.

      Not done before Phase 4: the plan was built in one unattended run, so
      this review moves to the Phase 3 pull request, before it merges. The
      steps are the only part a review is likely to change, and they are
      data in `installSteps.tsx`, so a change there does not reach into the
      phases built on top.

## Phase 4: Add the install card to Settings

The Settings card comes before the automatic ask because it needs Phases 1
and 3 but not the schedule. Building it first gives the modal a real page to
live on, and every platform's steps can be checked on a device straight away,
without faking dates.

- [x] **Add a `useInstallRoute` hook** in `frontend/src/lib/pwa/` that
      wraps Phase 1 for React. It returns the current `route` and an
      `install()` that runs `prompt()` on the deferred event and resolves to
      the user's choice. It subscribes to `installPromptEvent.ts`, so a
      `beforeinstallprompt` that arrives after the page has rendered moves
      the route from `chromium-manual` to `prompt` without a reload. It also
      reads the `finished` flag from Phase 2 and reports `installed` when it
      is set. That matters in a normal browser tab after installing: Chrome
      stops firing `beforeinstallprompt` once Quill is installed, so without
      the flag the tab would drop to `chromium-manual` and offer steps for
      an install that has already happened. `install()` sets `finished`
      when the outcome is `accepted`. Test it with `renderHook` and a fake
      deferred event, in `useInstallRoute.test.ts`. The store, the
      environment reader and the `finished` flag are passed in as optional
      arguments, defaulting to the real ones, so the tests need no module
      mocks. The prompt store is read through `useSyncExternalStore`.

- [x] **Add an "Install app" `ActionCard` to `pages/Settings.tsx`**, in the
      existing `SimpleGrid` after the Account card. It uses `IconDownload`,
      already registered in `components/icons/appIcons.ts`, the subtitle
      "Open Quill full screen from its own icon, and get notifications", and
      the button label "Install app". It is hidden when `useInstallRoute`
      reports `installed`, and shown for every other route.

      What the button does depends on the route:

      - **`prompt`** — calls `install()` directly, with no modal first.
        Pressing "Install app" is already the user saying yes, and the
        browser's own confirmation follows, so a modal asking "Install Quill
        on this device?" in between would be a third tap asking the same
        question.
      - **Every other route** — opens `InstallAppModal` with that route, so
        the user gets their platform's steps, or the `unsupported` message.

      The card does not touch the Phase 2 schedule and does not count as an
      ask: the user went looking for it. A completed install from the card
      sets `finished`, which stops the automatic ask as well.

- [x] **Cover the card in `pages/Settings.test.tsx`**: hidden when
      installed, shown otherwise, the `prompt` route calling `install()`
      without a modal, a manual route opening the modal with that route's
      steps, and `unsupported` opening the explanation. Run with
      `just uf src/pages/Settings.test.tsx`.

- [ ] **Check the card on real devices**: Chrome on Android, Chrome and Edge
      on desktop, Safari on iPhone and iPad, Safari on a Mac, and Firefox on
      desktop. On each, the card shows, its button installs Quill or shows
      the right steps, and the card is gone when Quill is opened as the
      installed app. One case cannot be fixed and is expected: on iOS, Safari
      and the home-screen app keep separate storage, so a Safari tab still
      shows the card after installing. Its steps then lead to an app the
      user already has, which does no harm.

      Left for a human: the unattended run could not reach a device. Do this
      alongside the Phase 3 step review.

## Phase 5: Ask automatically

- [ ] **Add a `useInstallPrompt` hook** in `frontend/src/lib/pwa/`, built on
      `useInstallRoute` from Phase 4 and the Phase 2 schedule. It records
      `firstSeenAt` on first use, and returns `opened`, `route`, `install()`
      and `dismiss()`. It never opens for `installed` or `unsupported`. It
      waits about three seconds after mounting before deciding, so a
      `beforeinstallprompt` that arrives just after load is used and the
      user does not get the manual steps by mistake. Opening records the
      ask. Test it with `renderHook` against a mocked `localStorage` and a
      fake deferred event.

- [ ] **Only open it on a page where interrupting is safe.** A modal over a
      half-completed form, or during an assessment attempt, costs the user
      something. The routes already flagged `handle.safeForReload` in
      `main.tsx` are exactly the pages where nothing would be lost, and
      `frontend/src/lib/swUpdateGate.ts` already reads that flag to decide
      when an update may reload the page. The hook reads the same flag
      through `useMatches()` instead of creating a second one. It also stays
      closed while `OfflineModal` is open or exam mode is set. So an ask is
      only used up on a calm page.

- [ ] **Mount one `<InstallAppPrompt />` in each signed-in layout**,
      `components/layouts/MainLayout.tsx` and
      `components/layouts/TeachingLayout.tsx`. It is a thin wrapper that
      connects `useInstallPrompt` to `InstallAppModal`. Only one layout
      renders at a time, so the user never sees two modals. Public pages and
      the login flow do not mount it: asking somebody to install Quill before
      they have used it is the thing this plan avoids. Add a case to each
      layout's existing test to show the modal is mounted and stays closed
      when nothing is due.

- [ ] **Check the timing on real devices** before leaving draft, because
      `beforeinstallprompt` cannot be driven from Playwright in any useful
      way. The steps themselves were checked through the Settings card in
      Phase 4, so this is about when the modal appears. Set `firstSeenAt`
      back by hand in devtools to make an ask due, on Chrome on Android and
      Safari on iPhone at least. Check the modal appears once for each ask,
      not at all after the second, and not at all after installing from
      either the modal or the Settings card. Record what was checked in the
      PR description.

## Phase 6: Accessibility and documentation

- [ ] **Add the modal to the accessibility testing list.** It appears inside
      both signed-in layouts, so it can show up in Journey 2 (find and open a
      patient) and Journey 3 (open and complete a teaching lecture) in
      `docs/docs/frontend/accessibility/journeys.md`. Add a line to "Not yet
      run" in `docs/docs/frontend/accessibility/testing-log.md`: "Journeys 2
      and 3 with the install prompt due". The next screen reader round will
      then check that focus moves into the modal and back out again.

- [ ] **Document the behaviour** in a new `docs/docs/frontend/pwa.md`,
      added to the Frontend section of `docs/mkdocs.yml`. There are no
      frontend PWA docs yet, so this page starts them. Cover the schedule,
      the Settings card, the routes, how to force an ask in development, and the
      `quill.installPrompt` key, so support can explain why someone was or
      was not asked.

## Decisions

- **Elapsed time since first use, not a count of days used** — "after one
  day" is read as 24 hours since Quill was first opened on the device, and
  "seven days" the same way. Counting distinct days of use would mean
  somebody who uses Quill once a week is not asked for seven weeks. Elapsed
  time is also one timestamp to store instead of a list. Changing it later
  means only `isAskDue` and its tests.

- **Two asks, however the first is answered** — "Not now" leads to the second
  ask at day seven, as requested. There is no "Don't ask again" button.
  With only two asks in total, that button would save one modal at most,
  and it adds a third choice to a dialog that should be quick to dismiss.

- **Kept on the device, not in the core database** — installing belongs to a
  device, not a person, and the backend has no use for the value. Storing it
  server-side would mean a table, an endpoint and a migration just to record
  something only this browser can act on. The cost is that clearing site data
  resets the schedule, which at worst means two more asks.

- **Storing the schedule counts as strictly necessary** — decided by the
  product owner on 2026-09-27. The Privacy and Electronic Communications
  Regulations (PECR) allow storing on the device without consent only when
  it is strictly necessary, and `optOut.ts` records Quill relying on that
  exemption. Installing Quill as an app is an essential part of using it
  well: it opens full screen from its own icon, and on iOS it is the only
  way to get notifications. The `quill.installPrompt` value is kept as small
  as the rule allows. It holds no identifier, never leaves the device, and
  mostly records the user's own answers ("Not now", installed), which is the
  same footing `optOut.ts` stands on. The module comment in Phase 2 states
  this reasoning so it sits next to the code it covers.
