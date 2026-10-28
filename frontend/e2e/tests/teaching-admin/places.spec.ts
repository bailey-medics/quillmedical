/**
 * The organisation and sites a teaching admin keeps in order, and the
 * teaching pages of admin they see.
 *
 * Items 10 to 23 of Phase 3 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md. Runs as
 * `educator`, the seeded teaching admin every browser project starts
 * signed in as, who is staff at "CI Teaching Hospital" and its site "CI
 * Teaching Centre".
 *
 * A refusal is checked at the API as well as on the screen: a hidden
 * button proves nothing if the request behind it still succeeds. Sites
 * and accounts a test changes are made by that test, named for the
 * browser project and the time, so the two browsers never meet.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { createAccount, orgUnitId, send } from "../../fixtures/api";
import { PLACES, freshUsername } from "../../fixtures/signIn";
import { searchRow } from "../../fixtures/tables";

const NOT_FOUND = "404 - Page not found";
const TAKE_MODULES = "Take Teaching Modules";

test.describe.configure({ timeout: 120_000 });

/** Open the teaching organisation's page. */
async function openOrganisation(page: Page): Promise<void> {
  await page.goto(
    `/admin/organisations/${await orgUnitId(page, PLACES.organisation)}`,
  );
  await expect(
    page.getByRole("heading", { name: PLACES.organisation, level: 1 }),
  ).toBeVisible();
}

/** The card holding one of a page's tables, by its heading. */
function card(page: Page, heading: string) {
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: heading, level: 2 }) })
    .last();
}

/** Make a site inside the teaching organisation, through the API. */
async function createSite(page: Page, name: string): Promise<number> {
  const response = await send(page, "POST", "/org-units", {
    name,
    type: "site",
    parent_id: await orgUnitId(page, PLACES.organisation),
  });
  expect(response.status(), await response.text()).toBe(200);

  return ((await response.json()) as { id: number }).id;
}

/** Find somebody on an add-staff page; the lookup chooses them. */
async function findAndPick(page: Page, username: string): Promise<void> {
  await page.getByLabel("Username or email address").fill(username);
  await page.getByRole("button", { name: "Find" }).click();
  // Anchored at the start: the lookup's own help text says "already has
  // a Quill account" too.
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(
    page.getByText(new RegExp(`^${escaped}.*already has a Quill account`)),
  ).toBeVisible();
}

test.describe("A teaching admin and the organisation", () => {
  test("cannot add an organisation", async ({ page }) => {
    await page.goto("/admin/organisations");
    await expect(
      page.getByRole("heading", { name: "Organisations", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /add organisation/i }),
    ).toHaveCount(0);

    await page.goto("/admin/organisations/new");
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();

    const refused = await send(page, "POST", "/org-units", {
      name: "A trust of their own",
      type: "teaching_establishment",
    });
    expect(refused.status()).toBe(403);
  });

  test("cannot change the organisation's details", async ({ page }) => {
    const id = await orgUnitId(page, PLACES.organisation);

    await openOrganisation(page);
    await expect(page.getByLabel("Edit organisation")).toHaveCount(0);

    await page.goto(`/admin/organisations/${id}/edit`);
    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();

    const refused = await send(page, "PUT", `/org-units/${id}`, {
      name: "Renamed by a teaching admin",
    });
    expect(refused.status()).toBe(403);
  });

  test("adds staff to the organisation", async ({ page }, testInfo) => {
    const username = freshUsername("org_staff", testInfo.project.name);
    await createAccount(page, {
      username,
      name: "New Org Staff",
      profession: "teaching_delegate",
      orgUnitIds: [await orgUnitId(page, PLACES.site)],
    });

    await openOrganisation(page);
    await page.getByRole("button", { name: "Add staff" }).click();
    await findAndPick(page, username);
    await page.getByRole("button", { name: "Add staff member" }).click();

    await expect(page).toHaveURL(/\/admin\/organisations\/\d+$/, {
      timeout: 30_000,
    });
    await expect(
      await searchRow(card(page, "Organisation staff members"), username),
    ).toBeVisible();
  });

  test("removes staff from the organisation", async ({ page }, testInfo) => {
    const username = freshUsername("org_leaver", testInfo.project.name);
    await createAccount(page, {
      username,
      name: "Leaving Org Staff",
      profession: "teaching_delegate",
      orgUnitIds: [await orgUnitId(page, PLACES.organisation)],
    });

    await openOrganisation(page);
    const staff = card(page, "Organisation staff members");
    await searchRow(staff, username);
    await page.getByLabel(`Actions for ${username}`).click();
    await page.getByText("Remove from organisation").click();
    const dialog = page
      .getByRole("dialog")
      .filter({ hasText: "Remove staff member" });
    // Waited for, so the click does not land while it is still opening:
    // WebKit drops a click on a modal mid-transition.
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Remove" }).click();

    await expect(page.getByText("Staff member removed")).toBeVisible();
    await expect(
      staff.getByRole("row", { name: new RegExp(username) }),
    ).toHaveCount(0);
  });

  test("adds a site on the organisation's page", async ({ page }, testInfo) => {
    const name = freshUsername("Org page site", testInfo.project.name);

    await openOrganisation(page);
    await page.getByRole("button", { name: "Add site" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "Site", exact: true }).click();
    await page.getByRole("button", { name: "Create site" }).click();

    await openOrganisation(page);
    await expect(await searchRow(card(page, "Sites"), name)).toBeVisible();
  });

  // Deleting a site would leave its people belonging nowhere, so a
  // teaching admin deactivates one from its edit page instead (Phase 15).
  test("is not offered deleting a site, and the API refuses it", async ({
    page,
  }, testInfo) => {
    const name = freshUsername("Kept site", testInfo.project.name);
    const id = await createSite(page, name);

    await openOrganisation(page);
    await expect(await searchRow(card(page, "Sites"), name)).toBeVisible();
    await expect(page.getByLabel(`Actions for ${name}`)).toHaveCount(0);

    const refused = await send(page, "DELETE", `/org-units/${id}`);
    expect(refused.status()).toBe(403);
    const kept = await page.request.get(`/api/org-units/${id}`);
    expect(kept.status()).toBe(200);
  });
});

test.describe("A teaching admin and the sites", () => {
  test("adds a new site from the list of sites", async ({ page }, testInfo) => {
    const name = freshUsername("Listed site", testInfo.project.name);

    await page.goto("/admin/sites");
    await page.getByRole("button", { name: "Add site" }).click();
    await page.getByRole("combobox", { name: "Organisation" }).click();
    await page.getByRole("option", { name: PLACES.organisation }).click();
    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "Site", exact: true }).click();
    await page.getByRole("button", { name: "Create site" }).click();

    await page.goto("/admin/sites");
    await expect(await searchRow(page, name)).toBeVisible();
  });

  test("edits a site", async ({ page }, testInfo) => {
    const name = freshUsername("Before edit", testInfo.project.name);
    const renamed = name.replace("Before edit", "After edit");
    const id = await createSite(page, name);

    await page.goto(`/admin/sites/${id}`);
    await page.getByRole("button", { name: "Edit site" }).click();
    await page.getByRole("textbox", { name: "Name" }).fill(renamed);
    await page.getByRole("textbox", { name: "Location" }).fill("Floor 2");
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.goto(`/admin/sites/${id}`);
    await expect(
      page.getByRole("heading", { name: renamed, level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Floor 2")).toBeVisible();
  });

  test("adds staff to a site", async ({ page }, testInfo) => {
    const username = freshUsername("site_staff", testInfo.project.name);
    await createAccount(page, {
      username,
      name: "New Site Staff",
      profession: "teaching_delegate",
      orgUnitIds: [await orgUnitId(page, PLACES.organisation)],
    });
    const siteId = await orgUnitId(page, PLACES.site);

    await page.goto(`/admin/sites/${siteId}`);
    await page.getByRole("button", { name: "Add staff" }).click();
    await findAndPick(page, username);
    // Staff, not the first option: that names them clinical lead.
    await page.getByRole("combobox", { name: "Role" }).click();
    await page.getByRole("option", { name: "Staff", exact: true }).click();
    await page.getByRole("button", { name: "Add staff member" }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/sites/${siteId}$`), {
      timeout: 30_000,
    });
    await expect(await searchRow(page, username)).toBeVisible();
  });

  test("removes staff from a site", async ({ page }, testInfo) => {
    const username = freshUsername("site_leaver", testInfo.project.name);
    const siteId = await orgUnitId(page, PLACES.site);
    await createAccount(page, {
      username,
      name: "Leaving Site Staff",
      profession: "teaching_delegate",
      orgUnitIds: [siteId],
    });

    await page.goto(`/admin/sites/${siteId}`);
    await searchRow(page, username);
    await page.getByLabel(`Actions for ${username}`).click();
    await page.getByText("Remove from site").click();
    const dialog = page
      .getByRole("dialog")
      .filter({ hasText: "Remove staff member" });
    // Waited for, so the click does not land while it is still opening:
    // WebKit drops a click on a modal mid-transition.
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Remove" }).click();

    await expect(page.getByText("Staff member removed")).toBeVisible();
    await expect(
      page.getByRole("row", { name: new RegExp(username) }),
    ).toHaveCount(0);
  });

  test("opens somebody at a site and switches their practice off and on", async ({
    page,
  }, testInfo) => {
    const username = freshUsername("site_practice", testInfo.project.name);
    const siteId = await orgUnitId(page, PLACES.site);
    await createAccount(page, {
      username,
      name: "Practising Delegate",
      profession: "teaching_delegate",
      orgUnitIds: [siteId],
    });

    await page.goto(`/admin/sites/${siteId}`);
    await (await searchRow(page, username)).click();
    await expect(page).toHaveURL(/\/admin\/sites\/\d+\/members\/\d+$/);

    const toggle = page.getByRole("switch", {
      name: `${TAKE_MODULES}: may practise here`,
    });
    const track = page.locator(
      `label[for="${await toggle.getAttribute("id")}"]`,
    );

    /** Save the switches and confirm the list of changes. */
    async function saveAndConfirm(outcome: string) {
      await page.getByRole("button", { name: "Save changes" }).click();
      const dialog = page
        .getByRole("dialog")
        .filter({ hasText: "Confirm practice changes" });
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(outcome)).toBeVisible();
    }

    await expect(toggle).not.toBeChecked();
    await track.click();
    await saveAndConfirm(`${TAKE_MODULES} authorised`);
    await expect(toggle).toBeChecked();

    await track.click();
    await saveAndConfirm(`${TAKE_MODULES} withdrawn`);
    await expect(toggle).not.toBeChecked();
  });

  test("opens somebody at a site and enrols them on a module and off again", async ({
    page,
  }, testInfo) => {
    const username = freshUsername("site_enrol", testInfo.project.name);
    const siteId = await orgUnitId(page, PLACES.site);
    await createAccount(page, {
      username,
      name: "Enrolling Delegate",
      profession: "teaching_delegate",
      orgUnitIds: [siteId],
    });

    await page.goto(`/admin/sites/${siteId}`);
    await (await searchRow(page, username)).click();
    await expect(page).toHaveURL(/\/admin\/sites\/\d+\/members\/\d+$/);

    const module = page
      .getByRole("checkbox", {
        name: new RegExp(` at ${PLACES.organisation}$`),
      })
      .first();
    const save = page.getByRole("button", { name: "Save enrolment" });

    await expect(module).not.toBeChecked();
    await module.check();
    await save.click();
    await expect(page.getByText("Enrolment updated")).toBeVisible();

    await page.reload();
    await expect(module).toBeChecked();
    await module.uncheck();
    await save.click();
    await expect(page.getByText("Enrolment updated")).toBeVisible();

    await page.reload();
    await expect(module).not.toBeChecked();
  });
});

test.describe("A teaching admin and the teaching pages", () => {
  test("sees only the all delegates card", async ({ page, scanPage }) => {
    await page.goto("/admin/teaching");

    await expect(
      page.getByRole("heading", { name: "Teaching", level: 1 }),
    ).toBeVisible();
    const cards = page.getByRole("main").getByRole("heading", { level: 2 });
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveText("All delegates");

    await scanPage("admin-teaching");
  });

  test("sees the delegates' totals and each one's result and date", async ({
    page,
    scanPage,
  }) => {
    await page.goto("/admin/teaching");
    await page.getByRole("link", { name: "View delegates" }).click();
    await expect(page).toHaveURL(/\/admin\/teaching\/all-delegates$/);

    for (const stat of ["Total delegates", "Passed", "1st pass rate"]) {
      await expect(page.getByText(stat, { exact: true })).toBeVisible();
    }

    // `results_delegate` is seeded with a pass yesterday.
    const row = await searchRow(page, "results_delegate");
    await expect(row).toContainText("Pass");
    await expect(row).toContainText(PLACES.site);
    await expect(row.getByRole("cell").last()).not.toHaveText("-");

    await page.getByRole("button", { name: "Close search" }).click();
    await scanPage("all-delegates");
  });
});
