import { beforeEach, describe, expect, it } from "vitest";
import {
  getCurrentRoute,
  resetCurrentRouteForTests,
  setCurrentRoute,
  toRoutePattern,
} from "./currentRoute";

beforeEach(() => {
  resetCurrentRouteForTests();
});

describe("rebuilding the pattern from the router's params", () => {
  it("replaces a captured value with the name that captured it", () => {
    expect(toRoutePattern("/patients/abc123", { id: "abc123" })).toBe(
      "/patients/:id",
    );
  });

  it("replaces every captured value, not just the first", () => {
    expect(
      toRoutePattern("/patients/abc123/letters/l-9", {
        patientId: "abc123",
        letterId: "l-9",
      }),
    ).toBe("/patients/:patientId/letters/:letterId");
  });

  it("leaves a path with no params alone", () => {
    expect(toRoutePattern("/admin/users", {})).toBe("/admin/users");
    expect(toRoutePattern("/", {})).toBe("/");
  });

  it("collapses a splat that spans several segments", () => {
    expect(
      toRoutePattern("/docs/guides/getting-started", {
        "*": "guides/getting-started",
      }),
    ).toBe("/docs/:splat");
  });

  it("ignores params the router captured as empty", () => {
    expect(toRoutePattern("/patients", { id: undefined })).toBe("/patients");
    expect(toRoutePattern("/patients", { id: "" })).toBe("/patients");
  });

  it("does not leave an identifier behind when it repeats in the path", () => {
    // The value appears twice; both are the same captured identifier, and
    // neither may survive.
    const out = toRoutePattern("/abc123/patients/abc123", { id: "abc123" });

    expect(out).not.toContain("abc123");
  });

  it("removes an NHS-number-shaped value because the router captured it", () => {
    // The point of rebuilding from params rather than filtering: this is
    // removed because the router said it was a parameter, not because
    // anything recognised the shape.
    const out = toRoutePattern("/patients/943 476 5919", {
      id: "943 476 5919",
    });

    expect(out).toBe("/patients/:id");
  });
});

describe("the recorded route", () => {
  it("starts empty, before anything has rendered", () => {
    expect(getCurrentRoute()).toBe("");
  });

  it("returns whatever was last recorded", () => {
    setCurrentRoute("/patients/:id");

    expect(getCurrentRoute()).toBe("/patients/:id");
  });
});
