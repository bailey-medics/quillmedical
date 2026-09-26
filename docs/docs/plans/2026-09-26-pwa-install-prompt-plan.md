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
it does not ask.

## Phase 1: Work out what this device can do

- [ ] **Capture `beforeinstallprompt` as soon as the page loads**, in a new
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
      rather than casting.

- [ ] **Classify the device into one install route**, as a pure function
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
      - **`android-firefox`** — Firefox on Android: the menu, then "Install".
      - **`chromium-manual`** — a Chromium browser with no deferred event.
        That happens when the user dismissed Chrome's own prompt recently, or
        Chrome's engagement rules have not been met. The browser menu still
        offers "Install Quill", so the modal explains that instead.
      - **`unsupported`** — Firefox on desktop, which cannot install web
        apps, and in-app browsers (a link opened inside Gmail, Outlook or
        Teams), which cannot either. The modal is not shown and no ask is
        used up, so someone who later opens Quill in a browser that can
        install it is still asked.

      Feature detection is preferred to user agent parsing wherever a feature
      exists to test. The user agent is used only to tell apart the manual
      routes, where no feature gives the answer.

- [ ] **Unit test both modules**, in `installRoute.test.ts` and
      `installPromptEvent.test.ts` beside them. Cover one realistic user agent
      per route, including iPadOS on a desktop-class user agent, an in-app
      browser, and a Chromium user agent with and without the deferred event.
      Also cover the event module: `preventDefault` called, a late event
      reaching subscribers, and `appinstalled` marking the prompt finished.
      Run with `just uf src/lib/pwa`.

## Phase 2: Decide when to ask

- [ ] **Store the schedule on the device**, in
      `frontend/src/lib/pwa/installPromptSchedule.ts`, under one
      `localStorage` key, `quill.installPrompt`. It holds a small versioned
      object: `firstSeenAt`, `asksShown` (0, 1 or 2), `lastAskedAt` and
      `finished`. Follow `frontend/src/lib/page-views/optOut.ts` for the
      shape: every read and write in `try`/`catch`, and a module comment
      saying why the value is stored on the device. The value is checked on
      read, and anything malformed is treated as a new device. This is
      per-device, not per-user, on purpose: installing is something a device
      does. A user who installed on their phone should still be asked on
      their laptop.

- [ ] **Encode the rule as a pure function** `isAskDue(state, now)` beside
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

- [ ] **Fail closed when storage is unavailable.** A private window or blocked
      site data means `localStorage` throws. Without somewhere to record that
      an ask was shown, "ask twice, then never" becomes "ask on every page
      load". So if the schedule cannot be read, or the first-seen timestamp
      cannot be written, the modal is never shown.

- [ ] **Unit test the schedule** in `installPromptSchedule.test.ts`: the
      boundaries at exactly 24 hours and exactly seven days, the late
      returner above, a malformed stored value, storage that throws on read
      and on write, and `finished` winning over everything. Run with
      `just uf src/lib/pwa`.

## Phase 3: Build the modal, and show it for review

- [ ] **Build `InstallAppModal`** in
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

      The copy is in sentence case and British English. The platform steps
      are data, a map from route to steps, not branches in the JSX, so adding
      a platform is one entry.

- [ ] **Write `InstallAppModal.stories.tsx` and `InstallAppModal.test.tsx`.**
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

## Phase 4: Show it in the app

- [ ] **Add a `useInstallPrompt` hook** in `frontend/src/lib/pwa/` that ties
      Phases 1 and 2 together. It records `firstSeenAt` on first use, works
      out the route, and returns `opened`, `route`, `install()` and
      `dismiss()`. It marks the schedule `finished` and never opens when the
      route is `installed`. It does not open for `unsupported`. It waits
      about three seconds after mounting before deciding, so a
      `beforeinstallprompt` that arrives just after load is used and the
      user does not get the manual steps by mistake. `install()` records
      the ask, runs the browser prompt, and sets `finished` if the outcome
      is `accepted`. Test it with `renderHook` against a mocked
      `localStorage` and a fake deferred event.

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

- [ ] **Check it on real devices** before leaving draft, because
      `beforeinstallprompt` cannot be driven from Playwright in any useful
      way. Set `firstSeenAt` back by hand in devtools to make an ask due.
      Then go through Chrome on Android, Chrome and Edge on desktop, Safari
      on iPhone and iPad, and Safari on a Mac: the modal appears, "Install"
      or the steps work, and neither shows again once installed. Record
      what was checked in the PR description.

## Phase 5: Accessibility and documentation

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
      the routes, how to force an ask in development, and the
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

- **Open question: storage consent** — `optOut.ts` records that Quill claims
  the Privacy and Electronic Communications Regulations exemption for storing
  on the device only for settings that are strictly necessary. The
  `quill.installPrompt` value contains no identifier and never leaves the
  device. But it supports a nudge, not a service the user asked for, so it
  may not qualify for that exemption. Whoever owns Quill's cookie and storage
  position should decide before Phase 2 is merged. The fallback is to keep
  the schedule in `sessionStorage` plus the one `finished` flag. That would
  weaken the "seven days" rule, which is why the question is asked first.
