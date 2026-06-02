# Hardening the teaching assessment

Lock down the assessment experience so candidates can't navigate away, access the sidebar, or use browser back/forward during an active exam. Keep the TopRibbon but disable all navigation elements. Add a "close exam early" button that submits partial results.

## Phase 1 — Exam layout lockdown (ribbon + nav suppression)

1. **Add `examMode` prop to `MainLayout`** — when true: hide burger button, hide SideNav (desktop), disable NavigationDrawer (mobile), hide search/patient info. Show only Quill branding in TopRibbon.
2. **Add `examMode` prop to `TopRibbon`** — when true: hide burger, patient info, search. Show only QuillName logo.
3. **Thread `examMode` through `LayoutCtx`** — `LayoutCtx` (React Router outlet context) already provides shared state between `RootLayout` and child pages (used for `patient`/`setPatient`). Add `examMode`/`setExamMode` to it. `AssessmentAttempt` calls `setExamMode(true)` on mount (and `false` on unmount). `RootLayout` reads `examMode` and passes it as a prop to `MainLayout`, which passes it to `TopRibbon`. Data flow: `AssessmentAttempt` → `setExamMode(true)` → `RootLayout` re-renders → `MainLayout examMode={true}` → `TopRibbon examMode={true}` hides nav.

### Files

- `frontend/src/components/layouts/MainLayout.tsx` — add `examMode` prop
- `frontend/src/components/ribbon/TopRibbon.tsx` — add `examMode` prop
- `frontend/src/RootLayout.tsx` — thread `examMode` through `LayoutCtx`

## Phase 2 — Block browser back/forward navigation

4. **Add `useBlocker`** to `AssessmentAttempt` — block all React Router navigation during active exam. Show a confirmation modal (reusing the `DirtyFormNavigation` pattern): "You have an active exam. Are you sure you want to leave?" Proceeding triggers early submission.
5. **Add `beforeunload` handler** — prevents browser tab close/refresh. Browser shows native "Leave site?" dialog. Standard `event.preventDefault()` pattern.
6. **Add `popstate` interception** — push a dummy history entry on exam start, intercept browser back via `popstate` listener. Re-pushes entry to stay on page. This covers the native browser back button which `useBlocker` alone doesn't fully handle.

### Files

- `frontend/src/features/teaching/pages/AssessmentAttempt.tsx` — add `useBlocker`, `beforeunload`, `popstate`
- `frontend/src/components/warnings/DirtyFormNavigation.tsx` — reuse pattern for exam navigation warning

## Phase 3 — Close exam early component + flow

7. **Create `ExamCloseButton` component** — button + confirmation modal: "Are you sure you want to end this exam early? Unanswered questions will be marked as incorrect." Actions: "Continue exam" / "End exam". New component at `components/teaching/exam-close-button/`.
8. **Wire into QuestionView next to the timer** — the timer is already fixed-position top-right. Place the "End exam" button alongside it in the same exam toolbar area. This keeps exam controls together and avoids threading callbacks through the layout chain. `QuestionView` already receives `onExpire` — add an `onCloseExam` prop. `AssessmentAttempt` provides the handler that calls `POST /complete`.
9. **Backend: verify early completion** — the existing `POST /complete` should already handle partial submissions (scores whatever is answered, unanswered = incorrect). Verify and fix if needed. Likely no changes.

### Files

- `frontend/src/components/teaching/exam-close-button/` — new component (button + confirmation modal)
- `frontend/src/components/teaching/question-view/QuestionView.tsx` — render `ExamCloseButton` next to timer
- `frontend/src/features/teaching/pages/AssessmentAttempt.tsx` — provide `onCloseExam` handler
- `backend/app/features/teaching/router.py` — verify early completion scoring

## Phase 4 — Fullscreen (discussion)

Fullscreen is **not reliably enforceable**:

- **Desktop**: `requestFullscreen()` works but user can exit with Esc/F11 at any time. Browsers explicitly prevent trapping users.
- **iOS Safari**: No Fullscreen API support at all. Only PWA mode is fullscreen.
- **Android Chrome**: API works but same Esc-to-exit applies. Address bar reappears on scroll.
- We _could_ detect fullscreen exit via `fullscreenchange` and show a "please return to fullscreen" prompt, but we cannot force it. This would require storing a "left fullscreen" event for audit purposes.

**Recommendation**: Don't use Fullscreen API. The focused layout from Phase 1 with nav disabled is the practical approach. If actual exam integrity enforcement is needed later (proctoring), that's a fundamentally different architecture (camera monitoring, screen recording, lockdown browser integration).

## Verification

1. `npx tsc --noEmit -p tsconfig.check.json` — zero errors
2. Frontend tests: `docker exec quill_frontend sh -lc "yarn unit-test:run"`
3. Backend tests: `docker exec quill_backend sh -lc "pytest -q -m 'not integration'"`
4. Storybook build: `docker exec quill_frontend sh -lc "yarn storybook:build"`
5. Manual: start exam → burger gone, sidebar hidden, browser back blocked, tab close shows warning, "End exam" submits partial results
6. Manual mobile: only logo in ribbon, no drawer accessible, close button next to timer

## Decisions

- **Keep TopRibbon** — disable nav elements within it rather than replacing layout
- **Close early = submit partial** — unanswered items scored as incorrect
- **Fullscreen**: recommend against, discuss further

## Out of scope

- Proctoring (camera, screen recording)
- Exam PIN / password entry
- IP restrictions
- Multiple-tab detection
- Keyboard shortcut interception (browsers don't allow overriding Ctrl+W)
