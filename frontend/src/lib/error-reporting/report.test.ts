import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordApi,
  recordAuth,
  recordRoute,
  resetBreadcrumbsForTests,
} from "./breadcrumbs";
import { resetCurrentRouteForTests, setCurrentRoute } from "./currentRoute";
import { reportError, resetReportingStateForTests } from "./report";

/** Reads back what was handed to sendBeacon, as the server would see it. */
async function sentBodies(
  beacon: ReturnType<typeof vi.fn>,
): Promise<Record<string, unknown>[]> {
  const bodies: Record<string, unknown>[] = [];
  for (const call of beacon.mock.calls) {
    const blob = call[1] as Blob;
    bodies.push(JSON.parse(await blob.text()) as Record<string, unknown>);
  }
  return bodies;
}

let beacon: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetReportingStateForTests();
  resetCurrentRouteForTests();
  resetBreadcrumbsForTests();
  beacon = vi.fn().mockReturnValue(true);
  vi.stubGlobal("navigator", {
    sendBeacon: beacon,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sending a report", () => {
  it("posts to the ingest endpoint", async () => {
    reportError(new Error("boom"), "window");

    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0]?.[0]).toBe("/api/analytics/client-errors");
  });

  it("sends JSON, so the server parses it as a body", async () => {
    reportError(new Error("boom"), "window");

    const blob = beacon.mock.calls[0]?.[1] as Blob;
    expect(blob.type).toBe("application/json");
  });

  it("uses the field names the server accepts", async () => {
    // The server rejects unknown fields outright, so a camelCase key would
    // lose the whole report rather than just that field.
    reportError(
      Object.assign(new Error("boom"), { error_code: "X_FAILED", status: 404 }),
      "boundary",
      { componentStack: "in Row", route: "/patients/:id" },
    );

    const [body] = await sentBodies(beacon);
    expect(Object.keys(body ?? {}).sort()).toEqual(
      [
        "component_stack",
        "error_code",
        "message",
        "name",
        "release",
        "route",
        "session_id",
        "source",
        "stack",
        "status",
        "user_agent",
        "viewport",
        "breadcrumbs",
      ].sort(),
    );
  });

  it("carries the context the caller supplies", async () => {
    reportError(new Error("boom"), "boundary", {
      componentStack: "in PatientCard",
      route: "/patients/:id",
    });

    const [body] = await sentBodies(beacon);
    expect(body?.["route"]).toBe("/patients/:id");
    expect(body?.["component_stack"]).toContain("in PatientCard");
    expect(body?.["source"]).toBe("boundary");
  });

  it("omits the status when there is not one", async () => {
    // Sending `undefined` would serialise to null and be rejected as a type
    // error, where an absent key falls back to the server's default.
    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    expect("status" in (body ?? {})).toBe(false);
  });
});

describe("never becoming the problem it reports", () => {
  it("does nothing when the browser cannot send beacons", () => {
    vi.stubGlobal("navigator", {});

    expect(() => reportError(new Error("boom"), "window")).not.toThrow();
  });

  it("does not throw when sendBeacon itself throws", () => {
    vi.stubGlobal("navigator", {
      sendBeacon: () => {
        throw new Error("beacon exploded");
      },
      userAgent: "test",
    });

    expect(() => reportError(new Error("boom"), "window")).not.toThrow();
  });

  it("does not throw on a thrown value that is not an Error", () => {
    expect(() => reportError("just a string", "window")).not.toThrow();
    expect(() => reportError(undefined, "window")).not.toThrow();
    expect(() => reportError(null, "unhandledrejection")).not.toThrow();
  });

  it("reports a repeating fault once, not once per occurrence", () => {
    // A render loop can raise the same error many times a second, and the
    // second one says nothing the first did not.
    for (let i = 0; i < 50; i += 1) {
      reportError(new Error("same failure"), "boundary");
    }

    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("still reports genuinely different errors", () => {
    reportError(new Error("first"), "window");
    reportError(new Error("second"), "window");

    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it("stops after the per-page cap, leaving allowance for other tabs", () => {
    // The server's limit is per address, so one looping tab must not spend
    // the whole allowance and silence every other tab behind it.
    for (let i = 0; i < 100; i += 1) {
      reportError(new Error(`distinct failure ${i}`), "window");
    }

    expect(beacon).toHaveBeenCalledTimes(20);
  });
});

describe("the session identifier", () => {
  it("is the same for every report from one page load", async () => {
    reportError(new Error("first"), "window");
    reportError(new Error("second"), "window");

    const bodies = await sentBodies(beacon);
    expect(bodies[0]?.["session_id"]).toBe(bodies[1]?.["session_id"]);
    expect(bodies[0]?.["session_id"]).toBeTruthy();
  });

  it("matches the shape the server will accept", async () => {
    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    // The server constrains it to an opaque identifier of at most 64
    // characters, so anything else is rejected as a malformed report.
    expect(String(body?.["session_id"])).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("is never written to browser storage", () => {
    // Storing it would be storage on the user's device, which needs consent
    // that error reporting cannot claim to be exempt from.
    const setItem = vi.fn();
    vi.stubGlobal("sessionStorage", { setItem, getItem: () => null });
    vi.stubGlobal("localStorage", { setItem, getItem: () => null });

    reportError(new Error("boom"), "window");

    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("the environment fields", () => {
  it("sends the viewport in the shape the server accepts", async () => {
    vi.stubGlobal("window", { innerWidth: 390, innerHeight: 844 });

    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    expect(body?.["viewport"]).toBe("390x844");
  });

  it("drops a viewport that cannot be read sensibly", async () => {
    // A window being torn down reports zero, which the server would reject.
    vi.stubGlobal("window", { innerWidth: 0, innerHeight: 0 });

    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    expect(body?.["viewport"]).toBe("");
  });

  it("sends the user agent", async () => {
    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    expect(String(body?.["user_agent"])).toContain("Macintosh");
  });
});

describe("sanitisation is not optional", () => {
  it("cannot send a patient-shaped value that reaches it", async () => {
    reportError(new Error("failed for 943 476 5919"), "window");

    const [body] = await sentBodies(beacon);
    expect(JSON.stringify(body)).not.toContain("943 476 5919");
  });

  it("never sends the email api.ts attaches to some errors", async () => {
    const thrown = Object.assign(new Error("registration failed"), {
      error_code: "EMAIL_ALREADY_REGISTERED",
      status: 409,
      email: "jane.doe@example.nhs.uk",
    });

    reportError(thrown, "window");

    const [body] = await sentBodies(beacon);
    expect(JSON.stringify(body)).not.toContain("jane.doe");
  });
});

describe("the route a report carries", () => {
  it("falls back to whatever the router last recorded", async () => {
    // What the error boundary and the window listeners rely on: neither can
    // be handed a route, because neither can use a hook.
    setCurrentRoute("/patients/:id");

    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    expect(body?.["route"]).toBe("/patients/:id");
  });

  it("prefers a route the caller supplies", async () => {
    setCurrentRoute("/patients/:id");

    reportError(new Error("boom"), "boundary", { route: "/admin/users" });

    const [body] = await sentBodies(beacon);
    expect(body?.["route"]).toBe("/admin/users");
  });

  it("sends an empty route before anything has rendered", async () => {
    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    expect(body?.["route"]).toBe("");
  });

  it("redacts a route that reached it with an identifier still in it", async () => {
    // Should not happen — the pattern is rebuilt from the router's params —
    // but the route crosses the wire, so it gets the same backstop as every
    // other field rather than being trusted.
    setCurrentRoute("/patients/943 476 5919");

    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    expect(String(body?.["route"])).not.toContain("943 476 5919");
  });
});

describe("the breadcrumb trail a report carries", () => {
  it("sends the events leading up to the error, oldest first", async () => {
    recordAuth("login");
    recordRoute("/patients/:id");
    recordApi("GET", "/patients/abc123", 500);

    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    const crumbs = body?.["breadcrumbs"] as Record<string, unknown>[];
    expect(crumbs.map((c) => c["type"])).toEqual(["auth", "route", "api"]);
  });

  it("sends an empty trail when nothing has happened yet", async () => {
    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    expect(body?.["breadcrumbs"]).toEqual([]);
  });

  it("never carries an identifier from an API path", async () => {
    recordApi("GET", "/patients/9434765919/letters", 500);

    reportError(new Error("boom"), "window");

    const [body] = await sentBodies(beacon);
    expect(JSON.stringify(body)).not.toContain("9434765919");
  });
});
