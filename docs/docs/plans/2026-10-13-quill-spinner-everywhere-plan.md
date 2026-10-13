# Quill spinner everywhere plan

Opening Quill shows a blank white page for between one and six seconds
before the sign-in screen appears. Nothing is wrong during that wait: the
browser is fetching the app and then asking who is signed in. But a blank
page reads as broken, and the two longest parts of the wait, before any
JavaScript has run and while `GuestOnly` checks the session, show nothing
at all. Everywhere else a wait shows Mantine's ring, which says "loading"
and nothing about whose app it is.

`QuillSpinner`, the Quill feather turning about its shaft, replaces both
the blank page and the ring, in all nineteen places a wait is shown. The
outcome is one spinner from the first paint to the first screen, turning
without a restart as one part of the app hands over to the next, and the
same spinner wherever a page or a part of one is loading afterwards.

Each phase is one branch of the `spinner` stack and one pull request.

## Phase 1: the spinner itself

- [x] Build `QuillSpinner` in
      `frontend/src/components/loading-spinner/`, with its story and
      tests. Landed as pull request 1928. It animates only `transform`
      and `opacity`, on HTML boxes, so it keeps turning while the page's
      main thread is busy, which is exactly when a start-up spinner
      shows. The reasoning is in the comments of
      `QuillSpinner.module.css`.

## Phase 2: one whole-page spinner, turning in step

- [x] Add `PageSpinner` beside `QuillSpinner`, with a story and tests:
      `<Center mih="60dvh">` around `<QuillSpinner size="8rem" />`,
      taking the same `label`. Nine places below hand-write that
      `Center` today, each with its own copy of `mih="60dvh"`. They
      must all put the quill in exactly the same spot at exactly the
      same size, or it jumps as one hands over to the next, so the
      position and size are written once. 8rem is the size Mark chose
      in the "Loading Quill app" story.

- [x] Keep the spin in step from one spinner to the next. Each
      `QuillSpinner` starts its animation when it mounts, so a reload
      that passes through the router fallback, `RequireAuth` and
      `RequireCompetency` would show the quill snapping back to face on
      three times. Add `quillSpinnerClock.ts` beside the component,
      which holds one starting moment for the page, and have
      `QuillSpinner` set a negative `animation-delay` from it through a
      CSS variable (Mantine's `__vars`, since inline styles are not
      allowed), so every spinner is at the angle the first one would
      have reached by now. The starting moment is the start of the
      document's timeline until Phase 3 gives it something better.
      jsdom has no `document.timeline`, so the clock answers zero
      there. Test that two spinners mounted a second apart get delays a
      second apart.

- [x] Measure it in a running Storybook with headless Playwright, as
      Phase 1 was: mount one spinner, wait, mount a second, and read
      both `transform` values. A unit test cannot see an animation.
      Measured on 13 October 2026 with the "Handing over" story of
      `PageSpinner`, which swaps in a new spinner every 0.7 seconds:
      across four swaps no animation was more than 33ms from the page
      clock, about five degrees of the turn. The gap is the time
      between React reading the clock and the browser starting the
      animation, and it does not add up from one swap to the next.

## Phase 3: starting the app

The four places somebody passes through before the first screen. They
land together because the wait is only one spinner once all four show
it.

- [x] **1. `frontend/index.html`, before any JavaScript.** Put the
      spinner inside `<div id="root">`, as plain markup with an inline
      `<style>`. The browser paints it as soon as the HTML arrives and
      React replaces it on its first render. No script is involved, so
      `script-src 'self'` is not in the way, and both content security
      policies (`caddy/prod/Caddyfile` and
      `infra/modules/load-balancer/main.tf`) already allow inline
      styles. Details that are easy to get wrong:

  - Draw the feather's outline once, as the `<path>` of the first
    layer, and show it in the other two with `<use>`. Three copies of the path
    would add about 6KB to every first load.
  - Write the colours out as plain values. The theme's CSS
    variables are set by `MantineProvider`, which has not run yet.
  - Set the page background too, for dark mode. `colour-scheme.js`
    has already put `data-mantine-color-scheme` on `<html>`, but
    the navy body colour comes from the theme. Without it the
    splash is a navy-palette quill on whatever Mantine's stylesheet
    defaults to. Measure what a production build paints first, in
    both schemes, before choosing the rule. Found: Mantine's
    stylesheet sets `--mantine-color-body` to its own dark grey until
    the theme loads, so the splash's stylesheet sets that variable to
    navy for a dark page.
  - Place and size it as `PageSpinner` does, so nothing moves when
    React takes over.
  - Include the visually hidden `role="status"` saying "Loading",
    and the reduced motion rule.

- [x] Test that the splash and the component cannot drift. The splash
      is a hand-written copy, because nothing of the app is loaded when
      it shows. A unit test reads `index.html` and
      `QuillSpinner.module.css` as text and compares the feather's
      outline, the turn's length, every `cubic-bezier` and the colours
      (the splash's plain values against `shared/brand.yaml`).

- [x] Start the clock from the splash. Before `createRoot` in
      `frontend/src/main.tsx`, read when the splash's turn began
      (`getAnimations()` on the splash element) and give that to
      `quillSpinnerClock`. React's first spinner then carries on from
      the angle the splash had reached.

- [x] **2. `frontend/src/main.tsx`, the router's
      `hydrateFallbackElement`.** Replace the `Center` and
      `LoadingSpinner` with `PageSpinner`, and update the comment above
      it, which describes handing over to `RequireAuth`'s spinner.

- [x] **3. `frontend/src/auth/GuestOnly.tsx`.** Return `PageSpinner`
      while `state.status === "loading"`, where it returns `null`
      today. This is the blank moment straight before the sign-in
      screen. Leave the `null` for `"authenticated"`: that is a
      redirect already under way. Add the test `GuestOnly` lacks for
      the loading state.

- [x] **4. `frontend/src/auth/RequireAuth.tsx`.** Replace with
      `PageSpinner`. `RequireAuth.test.tsx` names the old spinner;
      bring it into line.

- [x] Add an end-to-end test that the splash shows with no JavaScript
      at all: load `/login` with every script request blocked and
      expect the "Loading" status and the feather. This is the only
      test that can prove the first paint, and it runs against the
      production build, where the content security policy is real.

## Phase 4: checking somebody may open a page

On a reload these run straight after `RequireAuth`, so a different
spinner here would flick from quill to ring and back. Each is the same
change: the hand-written `Center` and `LoadingSpinner` become
`PageSpinner`.

- [x] **5. `frontend/src/auth/RequireCompetency.tsx`**, and
      `RequireCompetency.test.tsx`, which names the old spinner.
- [x] **6. `frontend/src/auth/RequireFeature.tsx`**, and
      `frontend/src/features/teaching/RequireFeature.test.tsx`.
- [x] **7. `frontend/src/auth/RequireOperator.tsx`.**
- [x] **8. `frontend/src/auth/RequirePassport.tsx`.**
- [x] **9. `frontend/src/auth/RequireNewsletter.tsx`.**

`RequireFeature` and `RequirePassport` turned out to centre their ring in
`h="100vh"`, not `mih="60dvh"`, so they already drew it lower on the page
than the guard before them. `PageSpinner` puts all five in one place.

## Phase 5: a whole page of content loading

- [x] **10. `frontend/src/pages/guides/GuideShell.tsx`.** Already a
      `Center mih="60dvh"`: becomes `PageSpinner`.
- [x] **11 and 12. `frontend/src/features/teaching/pages/AssessmentAttempt.tsx`.**
      "Loading assessment" and "Submitting your exam" become
      `PageSpinner` with the same labels. Neither is centred today, so
      this also moves them to the middle of the page. An exam is the
      one place a learner is anxious about a wait, so check the
      submitting state by eye in its story. Found: the page has no
      story, so this was not looked at by eye. It is one for whoever
      reviews the pull request.
- [x] **13. `frontend/src/pages/MessageThread.tsx`** and
      **14. `frontend/src/pages/PatientMessages.tsx`.** "Loading
      messages", each returned bare from the page: `PageSpinner` with
      the same label.
- [x] **15. `frontend/src/pages/PatientMessageThread.tsx`.** A bare
      Mantine `Loader`, which a screen reader cannot hear at all.
      `PageSpinner` with the label "Loading messages" fixes that as it
      changes the look.

## Phase 6: part of a page loading

These sit inside a page that is already showing, so they use
`QuillSpinner` itself at its default 4rem, not `PageSpinner`: a quill
8rem tall in the middle of a form would push everything else away.

- [x] **16. `frontend/src/pages/NewPatientPage.tsx`.** "Loading
      patient". It passes `size="lg"`, which is a Mantine `Loader`
      size and means nothing to `QuillSpinner`; drop it.
- [x] **17. `frontend/src/pages/UserInfoUpdatePage.tsx`.** Another
      bare `Loader` with no label. Give it "Loading user".
- [x] **18. `frontend/src/components/documents/Document.tsx`** and
      **19. `frontend/src/components/documents/PdfPages.tsx`.**
      "Loading" and the document's name. Check both stories at a
      narrow width, where the document frame is short. Looked at on 13
      October 2026, 360px wide, with the PDF held back: the `Document`
      story shows the quill 4rem square under the title with nothing
      pushed off the page. `PdfPages` shows its wait only inside
      `Document`'s, so that one view covers both.

## Phase 7: retire the ring

- [ ] Delete `LoadingSpinner`, its story and its tests, and take it out
      of the folder's `index.ts`. After Phase 6 nothing imports it.
      Leaving it would give the next page two spinners to choose from,
      and the ring would come back one page at a time. The small
      `Loader` inside a button (`SubmitButton`, `ButtonPairRed`) stays:
      a quill cannot be read at that size, and the button already says
      what is happening.
- [ ] Move `QuillSpinner` and `PageSpinner` to be the folder's default
      and named exports, and search the docs and `.claude/rules/` for
      `LoadingSpinner` by name. Merged plans are history and are left
      alone.
- [ ] Add a lint rule, or extend the one that already warns on
      `ActionIcon`, so importing Mantine's `Loader` outside the two
      button components is a warning. Two of the nineteen places were
      bare `Loader`s with no label, which is how they went unheard.
- [ ] Name the accessibility journeys this touches. All four journeys
      in `docs/docs/frontend/accessibility/journeys.md` begin by
      opening Quill and signing in, so all four pass through the new
      start-up wait; Journey 1 passes through `GuestOnly` twice and
      Journey 3 through the assessment's two spinners. Add "Journeys 1
      to 4 again, for the quill spinner at start-up" to the "Not yet
      run" list in `testing-log.md`. What a screen reader should hear
      is one "Loading", not one for each spinner the wait passes
      through, and only a person listening can tell.

## Decisions

- **Every wait gets the quill, not only start-up** - the first
  suggestion was the quill for "Quill is starting" (places 1 to 9) and
  the ring for "this part is loading". Mark chose all nineteen on 13
  October 2026. One spinner is also one thing to keep accessible, and
  Phase 7 can then remove the other.

- **The splash is a hand-written copy held by a test, not generated at
  build time** - a Vite plugin could write the splash into `index.html`
  from the component's own source, and there would then be one copy.
  But it would be build machinery for forty lines of markup that change
  perhaps once a year, and a reader of `index.html` would no longer see
  what the first paint is. The test in Phase 3 fails the moment the two
  differ, which is the property that matters.

- **Each spinner reads a shared clock, and none is kept mounted** - the
  other way to avoid a restart is one spinner high in the tree that the
  guards switch on and off. That couples seven guards and the router to
  a shared piece of state for the sake of an animation. A negative
  `animation-delay` gets the same picture with each spinner still
  owning itself.

- **No minimum time on screen** - on a fast connection the quill will
  show for a fraction of a second and go. Holding it longer so it can
  be seen would make Quill slower in order to show that it is loading.

- **Two sizes, and no others** - 8rem for a wait that is the whole
  page, 4rem inside a page. The `size` prop stays for stories, but a
  third size in the app would bring back the jump that `PageSpinner`
  exists to prevent.
