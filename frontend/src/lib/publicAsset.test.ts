import { afterEach, describe, expect, it, vi } from "vitest";
import { publicAsset } from "@lib/publicAsset";

describe("publicAsset", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leaves a root-absolute path unchanged under the app's base", () => {
    vi.stubEnv("BASE_URL", "/");
    expect(publicAsset("/quill-logo.png")).toBe("/quill-logo.png");
  });

  it("makes the path relative under Storybook's relative base", () => {
    vi.stubEnv("BASE_URL", "./");
    expect(publicAsset("/quill-logo.png")).toBe("./quill-logo.png");
  });

  it("adds a missing trailing slash to the base", () => {
    vi.stubEnv("BASE_URL", "/sub");
    expect(publicAsset("storybook/a.png")).toBe("/sub/storybook/a.png");
  });

  it("accepts a path without a leading slash", () => {
    vi.stubEnv("BASE_URL", "/");
    expect(publicAsset("quill-name.png")).toBe("/quill-name.png");
  });
});
