import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installGlobalErrorReporting } from "./globalHandlers";
import { resetReportingStateForTests } from "./report";

/** Reads back the report handed to sendBeacon. */
async function lastBody(
  beacon: ReturnType<typeof vi.fn>,
): Promise<Record<string, unknown>> {
  const blob = beacon.mock.calls.at(-1)?.[1] as Blob;
  return JSON.parse(await blob.text()) as Record<string, unknown>;
}

/**
 * Dispatches an event with default handling suppressed.
 *
 * Without this the test runner sees a genuinely unhandled error and reports it
 * against the run, even though raising it is the whole point of the test. The
 * suppression is the test harness's, not the application's — the real
 * listeners deliberately do not call `preventDefault`, so the browser still
 * logs what it would have.
 */
function dispatchUnhandled(event: Event): void {
  const swallow = (e: Event): void => e.preventDefault();
  window.addEventListener(event.type, swallow);
  window.dispatchEvent(event);
  window.removeEventListener(event.type, swallow);
}

/** A rejection event whose promise is settled, so nothing leaks from a test. */
function rejectionEvent(reason: unknown): PromiseRejectionEvent {
  return new PromiseRejectionEvent("unhandledrejection", {
    promise: Promise.resolve(),
    reason,
  } as PromiseRejectionEventInit);
}

let beacon: ReturnType<typeof vi.fn>;
let uninstall: () => void;

beforeEach(() => {
  resetReportingStateForTests();
  beacon = vi.fn().mockReturnValue(true);
  vi.stubGlobal("navigator", { sendBeacon: beacon, userAgent: "test" });
  uninstall = installGlobalErrorReporting();
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
});

describe("unhandled promise rejections", () => {
  it("reports a rejected promise the boundary would never see", async () => {
    // The common failure in an API-driven app: an await with no catch. An
    // error boundary cannot see this at all.
    dispatchUnhandled(rejectionEvent(new Error("api call failed")));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect((await lastBody(beacon))["source"]).toBe("unhandledrejection");
  });

  it("survives a rejection whose reason is not an Error", async () => {
    dispatchUnhandled(rejectionEvent("just a string"));

    expect(beacon).toHaveBeenCalledTimes(1);
    expect((await lastBody(beacon))["name"]).toBe("Error");
  });
});

describe("errors thrown outside React's tree", () => {
  it("reports a thrown error", async () => {
    dispatchUnhandled(
      new ErrorEvent("error", { error: new Error("timer blew up") }),
    );

    expect(beacon).toHaveBeenCalledTimes(1);
    expect((await lastBody(beacon))["source"]).toBe("window");
  });

  it("ignores a resource that failed to load", () => {
    // A broken image or a stylesheet that 404s fires the same event with no
    // error object. A stack trace would say nothing, and there would be many.
    dispatchUnhandled(new ErrorEvent("error", { message: "404" }));

    expect(beacon).not.toHaveBeenCalled();
  });
});

describe("installation", () => {
  it("does not double-report when installed twice", () => {
    const second = installGlobalErrorReporting();

    dispatchUnhandled(
      new ErrorEvent("error", { error: new Error("once only") }),
    );

    expect(beacon).toHaveBeenCalledTimes(1);
    second();
  });

  it("stops reporting once uninstalled", () => {
    uninstall();
    uninstall = (): void => {};

    dispatchUnhandled(
      new ErrorEvent("error", { error: new Error("after uninstall") }),
    );

    expect(beacon).not.toHaveBeenCalled();
  });
});
