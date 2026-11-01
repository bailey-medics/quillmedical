/**
 * Screenshots for the guide "Deactivate a site".
 *
 * Walks to the confirmation for the seeded site as the seeded teaching
 * admin and cancels it: deactivating that site would deactivate the
 * accounts the other guides photograph. The picture of the result comes
 * from a spare site made here with nobody at it.
 */

import { test, expect } from "@playwright/test";
import { addSite } from "../fixtures/people";
import { shot } from "./shot";
import { PEOPLE, SEEDED, signIn } from "./signIn";

/** A site made only to be deactivated, so the seeded one stays as it is. */
const SPARE_SITE = "Westgate Clinic";

/** How many accounts the confirmation says will go, in the picture. */
const ACCOUNTS_SHOWN = 124;

/** The request behind that count. */
const DEACTIVATION_COUNT = "**/api/org-units/*/deactivation";

/** The request that deactivates, whose answer the result message shows. */
const DEACTIVATE = "**/api/org-units/*/deactivate";

test("deactivate a site", async ({ page }) => {
  await signIn(page, PEOPLE.teachingAdmin);
  await page.goto("/admin/sites");
  await expect(
    page.getByRole("heading", { level: 1, name: "Sites" }),
  ).toBeVisible();
  // A seeded site's row, not any row: the loading skeleton is drawn as
  // rows too, and would be photographed in place of the list.
  const site = page.getByRole("row", { name: new RegExp(SEEDED.site) });
  await expect(site).toBeVisible();
  await shot(page, "deactivate-a-site/sites");

  await site.click();
  await expect(
    page.getByRole("heading", { level: 1, name: SEEDED.site }),
  ).toBeVisible();
  const edit = page.getByRole("button", { name: "Edit site" });
  await expect(edit).toBeVisible();
  await shot(page, "deactivate-a-site/site");
  await edit.click();

  // The card is below the site's details, so it is brought into view.
  const deactivate = page.getByRole("button", {
    name: "Deactivate site",
    exact: true,
  });
  await deactivate.scrollIntoViewIfNeeded();
  await expect(deactivate).toBeInViewport();
  await shot(page, "deactivate-a-site/edit");

  // The seed puts a handful of people at the site, and a real site has
  // many more, so the count the message gives is set to a believable one.
  // Only the picture sees it: nothing is deactivated.
  await page.route(DEACTIVATION_COUNT, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      json: { ...body, accounts: ACCOUNTS_SHOWN },
    });
  });

  await deactivate.click();
  const confirm = page.getByRole("dialog", { name: "Deactivate site" });
  await expect(confirm).toBeVisible();
  // The number of accounts arrives after the message opens.
  await expect(confirm).toContainText(
    `${ACCOUNTS_SHOWN} accounts will be deactivated`,
  );
  await shot(page, "deactivate-a-site/confirm");

  // Left as it was.
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await page.unroute(DEACTIVATION_COUNT);

  // The result needs a site really deactivated, so it is one made here
  // with nobody at it, and the seeded site is left alone.
  // Made on the sites page, as the teaching admin would.
  const spareId = await addSite(
    page.context(),
    SPARE_SITE,
    SEEDED.organisation,
  );

  await page.goto(`/admin/sites/${spareId}/edit`);
  await page
    .getByRole("button", { name: "Deactivate site", exact: true })
    .click();
  const confirmSpare = page.getByRole("dialog", { name: "Deactivate site" });
  await expect(confirmSpare).toContainText("will be deactivated");

  // The spare site has nobody at it, so the answer is changed to the
  // count the confirmation showed, and the two pictures agree. The site
  // itself is really deactivated.
  await page.route(DEACTIVATE, async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      json: { ...body, accounts: ACCOUNTS_SHOWN },
    });
  });
  await confirmSpare.getByRole("button", { name: "Deactivate" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: SPARE_SITE }),
  ).toBeVisible();
  await expect(
    page.getByText(`${ACCOUNTS_SHOWN} accounts were deactivated`),
  ).toBeVisible();
  await shot(page, "deactivate-a-site/deactivated");
  await page.unroute(DEACTIVATE);
});
