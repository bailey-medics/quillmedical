import { test, expect } from "../fixtures/axe";

test("planted failure: proves a failing spec fails the build", async ({
  page,
}) => {
  await page.goto("/login");

  expect(1).toBe(2);
});
