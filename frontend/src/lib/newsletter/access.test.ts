import { describe, expect, it } from "vitest";
import { mayUseNewsletter } from "./access";

describe("mayUseNewsletter", () => {
  it("lets an operator in", () => {
    expect(mayUseNewsletter({ platform_role: "superadmin" })).toBe(true);
  });

  it("refuses everybody else", () => {
    expect(mayUseNewsletter({ platform_role: "standard" })).toBe(false);
    expect(mayUseNewsletter({ platform_role: undefined })).toBe(false);
    expect(mayUseNewsletter(null)).toBe(false);
    expect(mayUseNewsletter(undefined)).toBe(false);
  });
});
