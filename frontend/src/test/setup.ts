/**
 * Vitest Test Setup
 *
 * Global test configuration and setup for all test files.
 * Automatically loaded before each test file via vitest.config.ts.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import { act } from "react";

/**
 * How long `findBy*` and `waitFor` keep looking.
 *
 * Testing Library gives up after 1000ms unless told otherwise, and
 * nothing here had told it. `testTimeout` in vitest.config.ts had
 * already been raised to fifteen seconds for a busy machine, so a test
 * had fifteen seconds to run and one second to see each thing appear.
 * With two suites running at once, a page that loads in a tenth of a
 * second alone took longer than that second, and tests that wait
 * properly failed with `Unable to find role="heading"` on a heading
 * that arrived a moment later. `Settings` and `AssessmentResultPage`
 * were the ones seen, and never the same tests twice.
 *
 * A passing test is no slower for this: a wait ends the moment the
 * thing appears. Only a test that is going to fail takes longer to say
 * so.
 *
 * Five seconds is a third of `testTimeout` on purpose. A wait that runs
 * out is then reported as the thing it could not find, with the page
 * as it stood, and not as a bare `Test timed out in 15000ms` that says
 * nothing about where. Raise the two together or not at all.
 *
 * This does nothing for a test that reads the page once with `getBy*`
 * before it is ready. That test is wrong at any speed and needs
 * changing to wait.
 */
configure({ asyncUtilTimeout: 5000 });

/**
 * Timers still pending when a test ends.
 *
 * Mantine's `Transition` schedules `setStatus` on the transition
 * duration - 100ms or more - from inside two nested
 * `requestAnimationFrame` callbacks, so the timer does not even exist
 * until two frames after the transition starts. It clears itself on
 * unmount, but only once React runs that cleanup.
 *
 * When a suite ends while a transition is mid-flight, the timer can
 * outlive the jsdom environment. It then fires against a torn-down
 * `window`, React tries to schedule an update, and vitest reports
 * `ReferenceError: window is not defined` as an unhandled error. Every
 * test passes and the run still exits non-zero, which is how this
 * arrived: a repository-wide failure attributed to whichever file
 * happened to be running.
 *
 * Waiting the duration out in `afterEach` would add that delay to every
 * one of thousands of tests, so the pending ids are tracked and any
 * that survive cleanup are cleared instead.
 */
const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

type SetTimeout = typeof globalThis.setTimeout;
type ClearTimeout = typeof globalThis.clearTimeout;

const realSetTimeout: SetTimeout = globalThis.setTimeout;
const realClearTimeout: ClearTimeout = globalThis.clearTimeout;

// Cast through `unknown`: the wrapper takes and returns what the real
// one does, but `setTimeout` carries overloads and a `__promisify__`
// member that a plain arrow function cannot satisfy structurally.
globalThis.setTimeout = ((
  handler: TimerHandler,
  timeout?: number,
  ...args: unknown[]
) => {
  const id = realSetTimeout(
    (...called: unknown[]) => {
      pendingTimers.delete(id);
      if (typeof handler === "function") {
        (handler as (...a: unknown[]) => void)(...called);
      }
    },
    timeout,
    ...args,
  );
  pendingTimers.add(id);
  return id;
}) as unknown as SetTimeout;

globalThis.clearTimeout = ((id?: ReturnType<SetTimeout>) => {
  if (id !== undefined) {
    pendingTimers.delete(id);
  }
  realClearTimeout(id);
}) as unknown as ClearTimeout;

// Cleanup after each test automatically
afterEach(async () => {
  // Cleanup React components. Unmounting is what gives Mantine's own
  // `useEffect` cleanup the chance to clear its transition timers.
  cleanup();

  // Let unmount effects and resolved promises run, so anything that
  // clears itself gets the chance to.
  await act(async () => {
    await new Promise((resolve) => realSetTimeout(resolve, 0));
  });

  // Anything still scheduled would fire after this environment is gone.
  for (const id of pendingTimers) {
    realClearTimeout(id);
  }
  pendingTimers.clear();
});

// Mock scrollIntoView (required for Mantine Select/Combobox)
window.HTMLElement.prototype.scrollIntoView = () => {};

// Mock window.matchMedia (used by Mantine components)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock IntersectionObserver (used by some Mantine components)
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as unknown as typeof IntersectionObserver;

// Mock ResizeObserver (used by some Mantine components)
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock document.fonts (used by Mantine Textarea autosize to recalculate
// height once web fonts finish loading; jsdom does not implement the
// FontFaceSet API at all)
Object.defineProperty(document, "fonts", {
  writable: true,
  value: {
    addEventListener: () => {},
    removeEventListener: () => {},
  },
});
