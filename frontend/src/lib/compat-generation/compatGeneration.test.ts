import { afterEach, describe, expect, it } from "vitest";
import {
  _resetReloadPendingForTests,
  checkCompatGeneration,
  isReloadPending,
  markReloadPending,
} from "./compatGeneration";

describe("checkCompatGeneration", () => {
  it("returns compatible when client and server generations match", () => {
    expect(checkCompatGeneration(3, "3")).toBe("compatible");
  });

  it("returns client-behind when the client generation is lower", () => {
    expect(checkCompatGeneration(2, "3")).toBe("client-behind");
  });

  it("returns server-behind when the client generation is higher", () => {
    expect(checkCompatGeneration(3, "2")).toBe("server-behind");
  });

  it("returns unknown when the header is missing", () => {
    expect(checkCompatGeneration(3, null)).toBe("unknown");
  });

  it("returns unknown when the header is not a valid integer", () => {
    expect(checkCompatGeneration(3, "not-a-number")).toBe("unknown");
    expect(checkCompatGeneration(3, "3.5")).toBe("unknown");
    expect(checkCompatGeneration(3, "")).toBe("unknown");
  });
});

describe("reload pending flag", () => {
  afterEach(() => {
    _resetReloadPendingForTests();
  });

  it("starts false", () => {
    expect(isReloadPending()).toBe(false);
  });

  it("becomes true after markReloadPending", () => {
    markReloadPending();
    expect(isReloadPending()).toBe(true);
  });
});
