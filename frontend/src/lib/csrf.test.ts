import { afterEach, describe, expect, it } from "vitest";
import { csrfHeader, csrfToken } from "./csrf";

function clearCookies() {
  for (const entry of document.cookie.split("; ")) {
    const name = entry.split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

describe("csrfToken", () => {
  afterEach(clearCookies);

  it("is undefined when nobody is signed in", () => {
    expect(csrfToken()).toBeUndefined();
  });

  it("reads the token from the XSRF-TOKEN cookie", () => {
    document.cookie = "XSRF-TOKEN=abc123; path=/";

    expect(csrfToken()).toBe("abc123");
  });

  it("finds the token among other cookies", () => {
    document.cookie = "theme=dark; path=/";
    document.cookie = "XSRF-TOKEN=abc123; path=/";
    document.cookie = "other=1; path=/";

    expect(csrfToken()).toBe("abc123");
  });

  it("decodes a token that was encoded for the cookie", () => {
    document.cookie = `XSRF-TOKEN=${encodeURIComponent("a b+c")}; path=/`;

    expect(csrfToken()).toBe("a b+c");
  });

  it("keeps an equals sign inside the token", () => {
    // A signed token is often base64, which pads with "=".
    document.cookie = "XSRF-TOKEN=abc.def==; path=/";

    expect(csrfToken()).toBe("abc.def==");
  });

  it("is not fooled by a cookie whose name only ends the same", () => {
    document.cookie = "NOT-XSRF-TOKEN=wrong; path=/";

    expect(csrfToken()).toBeUndefined();
  });
});

describe("csrfHeader", () => {
  afterEach(clearCookies);

  it("is empty when there is no token", () => {
    expect(csrfHeader()).toEqual({});
  });

  it("carries the token as X-CSRF-Token", () => {
    document.cookie = "XSRF-TOKEN=abc123; path=/";

    expect(csrfHeader()).toEqual({ "X-CSRF-Token": "abc123" });
  });
});
