import { beforeEach, describe, expect, it } from "vitest";
import {
  getBreadcrumbs,
  normaliseApiPath,
  recordApi,
  recordAuth,
  recordRoute,
  resetBreadcrumbsForTests,
} from "./breadcrumbs";

beforeEach(() => {
  resetBreadcrumbsForTests();
});

describe("reducing an API path to a pattern", () => {
  it("keeps ordinary path segments", () => {
    expect(normaliseApiPath("/auth/login")).toBe("/auth/login");
    expect(normaliseApiPath("/analytics/client-errors")).toBe(
      "/analytics/client-errors",
    );
  });

  it("replaces anything that is not an ordinary word", () => {
    // By allowlist: a segment survives only if it is lowercase letters and
    // hyphens, so an identifier is removed by not being a word rather than by
    // being recognised as an identifier.
    expect(normaliseApiPath("/patients/abc123/letters")).toBe(
      "/patients/:id/letters",
    );
    expect(normaliseApiPath("/users/42")).toBe("/users/:id");
    expect(
      normaliseApiPath("/patients/3f2504e0-4f89-11d3-9a0c-0305e82c3301"),
    ).toBe("/patients/:id");
  });

  it("removes a query string, which can carry anything", () => {
    expect(normaliseApiPath("/search?nhs=9434765919&name=Jane")).toBe(
      "/search",
    );
  });

  it("removes an identifier shaped like nothing in particular", () => {
    // The case a shape-matching rule would miss.
    const out = normaliseApiPath("/patients/Jane_Doe_1974");

    expect(out).toBe("/patients/:id");
  });
});

describe("recording events", () => {
  it("records a route change as its pattern", () => {
    recordRoute("/patients/:id");

    expect(getBreadcrumbs()).toEqual([
      { type: "route", ms: expect.any(Number), pattern: "/patients/:id" },
    ]);
  });

  it("records an API call as method, pattern and status", () => {
    recordApi("get", "/patients/abc123", 500);

    const [crumb] = getBreadcrumbs();
    expect(crumb).toMatchObject({
      type: "api",
      method: "GET",
      pattern: "/patients/:id",
      status: 500,
    });
  });

  it("records an authentication transition", () => {
    recordAuth("expired");

    expect(getBreadcrumbs()[0]).toMatchObject({
      type: "auth",
      event: "expired",
    });
  });

  it("keeps events in the order they happened", () => {
    recordAuth("login");
    recordRoute("/patients/:id");
    recordApi("GET", "/patients/abc", 200);

    expect(getBreadcrumbs().map((c) => c.type)).toEqual([
      "auth",
      "route",
      "api",
    ]);
  });
});

describe("what will not be recorded", () => {
  it("drops a method the server would reject", () => {
    recordApi("TRACE", "/patients", 200);
    recordApi("", "/patients", 200);

    expect(getBreadcrumbs()).toHaveLength(0);
  });

  it("drops a status that is not an HTTP code", () => {
    recordApi("GET", "/patients", 0);
    recordApi("GET", "/patients", 999);

    expect(getBreadcrumbs()).toHaveLength(0);
  });

  it("keeps every age within what the server accepts", () => {
    recordRoute("/a");
    recordApi("GET", "/b", 200);
    recordAuth("login");

    for (const crumb of getBreadcrumbs()) {
      expect(crumb.ms).toBeGreaterThanOrEqual(0);
      expect(crumb.ms).toBeLessThanOrEqual(86_400_000);
    }
  });
});

describe("the ring buffer", () => {
  it("keeps only the most recent twenty", () => {
    // An unbounded trail on a page left open all day is a memory leak with no
    // diagnostic value; the events just before the error are what explain it.
    for (let i = 0; i < 50; i += 1) recordRoute(`/page-${i}`);

    const crumbs = getBreadcrumbs();
    expect(crumbs).toHaveLength(20);
  });

  it("discards the oldest, not the newest", () => {
    for (let i = 0; i < 25; i += 1) recordRoute(`/p/${i}`);

    const patterns = getBreadcrumbs().map((c) =>
      c.type === "route" ? c.pattern : "",
    );
    expect(patterns.at(-1)).toContain("24");
    expect(patterns.some((p) => p.includes("/p/0"))).toBe(false);
  });

  it("hands out a copy, so a caller cannot edit the trail", () => {
    recordRoute("/patients/:id");

    getBreadcrumbs().length = 0;

    expect(getBreadcrumbs()).toHaveLength(1);
  });
});
