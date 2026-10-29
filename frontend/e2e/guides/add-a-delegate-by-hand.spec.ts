/**
 * Screenshots for the guide "Add a delegate by hand".
 *
 * Taken as the seeded teaching admin, starting from the site's Add staff
 * page. A new delegate is walked through the new user form to its review
 * step and never created. One who already has an account, the seeded
 * Oliver Grant, is added to the site for real, since the page that
 * enrols him exists only once he is a member; his enrolment is left
 * unsaved. The stack is thrown away after the run.
 */

import { test, expect, type Page } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, SEEDED, signIn } from "./signIn";

/** Seeded with an account and no site. */
const OLIVER = {
  name: "Oliver Grant",
  email: "oliver.grant@northfield.nhs.uk",
};

/** Open the seeded site's Add staff page, from its staff table. */
async function openAddStaff(page: Page) {
  await page.goto("/admin/sites");
  await page.getByText(SEEDED.site).first().click();
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Add staff to site" }),
  ).toBeVisible();
}

/** Look somebody up by email address on the Add staff page. */
async function find(page: Page, email: string) {
  await page.getByLabel("Username or email address").fill(email);
  await page.getByRole("button", { name: "Find" }).click();
}

test("add a delegate by hand", async ({ page }) => {
  // The stepper's own button, matched whole: a table on a later step
  // pages its rows, and its "next page" button would match a looser name.
  const next = page.getByRole("button", { name: "Next", exact: true });

  await signIn(page, PEOPLE.teachingAdmin);

  // The site's page, with the Add staff icon above its staff table.
  await page.goto("/admin/sites");
  await page.getByText(SEEDED.site).first().click();
  const addStaff = page.getByRole("button", { name: "Add staff" });
  await expect(addStaff).toBeVisible();
  // The staff table's heading near the top, clear of the ribbon, so the
  // table fills most of the picture.
  await page
    .getByRole("heading", { name: "Site specific staff members" })
    .evaluate((heading) => {
      heading.scrollIntoView({ block: "start" });
      window.scrollBy(0, -160);
    });
  await shot(page, "add-a-delegate-by-hand/site");

  // The Add staff page as it opens, before anybody is looked up.
  await openAddStaff(page);
  await expect(page.getByLabel("Username or email address")).toHaveValue("");
  await shot(page, "add-a-delegate-by-hand/add-staff");

  // Somebody new: the lookup finds nobody and offers to create them.
  await find(page, "lucy.bennett@northfield.nhs.uk");
  await expect(page.getByText(/Nobody on Quill uses/)).toBeVisible();
  await shot(page, "add-a-delegate-by-hand/not-found");

  await page.getByRole("button", { name: "Create new user" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Create new user" }),
  ).toBeVisible();
  // The email address came from the lookup.
  await expect(page.getByLabel("Email")).toHaveValue(
    "lucy.bennett@northfield.nhs.uk",
  );
  await page.getByLabel("Full name").fill("Lucy Bennett");
  await page.getByLabel("Username").fill("lucy.bennett");
  await page.getByLabel("Initial password").fill("a-first-password");
  await page.getByRole("combobox", { name: "Base profession" }).click();
  await page
    .getByRole("option", { name: "Teaching delegate", exact: true })
    .click();
  await shot(page, "add-a-delegate-by-hand/basic-details");
  await next.click();

  // The site came from the page the form was opened from.
  await expect(
    page.getByRole("heading", { name: "Organisation/site" }),
  ).toBeVisible();
  await expect(page.getByText(SEEDED.site).first()).toBeVisible();
  await shot(page, "add-a-delegate-by-hand/organisation-site");
  await next.click();

  await expect(
    page.getByRole("heading", { name: "Competency configuration" }),
  ).toBeVisible();
  await next.click();

  // Practice: both learner competencies switched on at the site. Saving
  // a ticked module would do it anyway, but the guide shows the admin
  // what should be on.
  await expect(
    page.getByRole("heading", { name: SEEDED.site, level: 2 }),
  ).toBeVisible();

  for (const competency of [
    "Take Teaching Modules",
    "View Own Teaching Results",
  ]) {
    const toggle = page.getByRole("switch", {
      name: `${competency} at ${SEEDED.site}: may practise here`,
    });
    // The switch's input is visually hidden, so click its track.
    await page
      .locator(`label[for="${await toggle.getAttribute("id")}"]`)
      .click();
    await expect(toggle).toBeChecked();
  }

  await shot(page, "add-a-delegate-by-hand/practice");
  await next.click();

  // Enrolment: the first module the organisation serves.
  await expect(
    page.getByText("Tick each module they are to be enrolled on."),
  ).toBeVisible();
  const module = page.getByRole("checkbox").first();
  // The box itself is visually hidden, so click its label.
  await page.locator(`label[for="${await module.getAttribute("id")}"]`).click();
  await expect(module).toBeChecked();
  await shot(page, "add-a-delegate-by-hand/enrolment");
  await next.click();

  await expect(page.getByRole("button", { name: "Create user" })).toBeVisible();
  await shot(page, "add-a-delegate-by-hand/review");

  // Somebody with an account already: the lookup finds and chooses them.
  await openAddStaff(page);
  await find(page, OLIVER.email);
  await expect(page.getByText(/oliver\.grant \(Oliver Grant\)/)).toBeVisible();
  await page.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Trainee", exact: true }).click();
  await shot(page, "add-a-delegate-by-hand/found");

  await page.getByRole("button", { name: "Add staff member" }).click();
  await page.getByRole("row", { name: new RegExp(OLIVER.name) }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: OLIVER.name }),
  ).toBeVisible();

  // His Teaching card, with the first module ticked and not saved.
  const teaching = page.getByRole("heading", { name: "Teaching" });
  await teaching.scrollIntoViewIfNeeded();
  const enrol = page.getByRole("checkbox").last();
  await page.locator(`label[for="${await enrol.getAttribute("id")}"]`).click();
  await expect(enrol).toBeChecked();
  const save = page.getByRole("button", { name: "Save enrolment" });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeVisible();
  await shot(page, "add-a-delegate-by-hand/teaching");
});
