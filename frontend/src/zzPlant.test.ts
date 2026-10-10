import { expect, it } from "vitest";

it("planted failure: proves a failing test fails the build", () => {
  expect(1).toBe(2);
});
