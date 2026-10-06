/**
 * Screenshots for the guide "Read and edit a safety document".
 *
 * The safety cases are a mock-up whose data lives in the browser, so
 * nothing is seeded for these but the officer who signs in.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

// The fullest of the mock-up's five cases: every hazard status, three
// incidents, and sections both signed and waiting.
const CASE = "/safety/sc-003";

test("read and edit a safety document", async ({ page }) => {
  await signIn(page, PEOPLE.safetyOfficer);

  await page.goto(`${CASE}/documentation`);
  await expect(page.getByText("Clinical risk management plan")).toBeVisible();
  await shot(page, "read-and-edit-a-safety-document/documents");

  // By clicking, not by address: an edit lives in memory, and a fresh
  // load of the page would be a fresh copy of the case.
  await page.getByText("Clinical risk management plan").click();
  const edit = page.getByText("Edit document");
  await expect(edit).toBeVisible();
  await shot(page, "read-and-edit-a-safety-document/document");

  await edit.click();
  await expect(page.getByLabel("Document")).toBeVisible();
  await shot(page, "read-and-edit-a-safety-document/edit");
});
