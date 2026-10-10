import { expect, it } from "vitest";

const count: number = "three";

it("passes at run time, and must fail the type check", () => {
  expect(count).toBe("three");
});
