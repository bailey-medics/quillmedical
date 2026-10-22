/**
 * Screenshots for the guide "Join a course".
 *
 * Taken signed out, as the delegate reading the guide is. Nothing is
 * submitted, so nobody is registered.
 */

import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { SEEDED } from "./signIn";

/** The request that checks the clinical lead and names their sites. */
const LEAD_CHECK = "**/api/teaching/public/validate-clinical-lead";

/** A made-up second site, so the lead covers two and the guide's site step shows. */
const SECOND_SITE = {
  site_id: 999_999,
  site_name: "Riverside Community Hospital",
};

/** One site, as the clinical lead check names it. */
interface LeadSite {
  site_id: number;
  site_name: string;
  org_unit_id: number;
}

test("join a course", async ({ page }) => {
  await page.goto("/register");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Register for Quill Teaching",
    }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Teaching module" }).click();
  await page.getByRole("option").first().click();
  await page
    .getByLabel("Clinical lead email address")
    .fill(SEEDED.clinicalLeadEmail);
  await shot(page, "join-a-course/choose-module");

  // The seeded clinical lead holds one site, and the site step shows only
  // for a lead of several. A second is added to what the check answers,
  // for the picture only: it is never chosen, so nothing is sent naming
  // a site that does not exist.
  await page.route(LEAD_CHECK, async (route) => {
    const response = await route.fetch();
    const checked = (await response.json()) as { sites: LeadSite[] };
    const [seeded] = checked.sites;
    const sites = seeded
      ? [seeded, { ...SECOND_SITE, org_unit_id: seeded.org_unit_id }]
      : checked.sites;
    await route.fulfill({ response, json: { ...checked, sites } });
  });

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("radiogroup", { name: /Which site are you joining\?/ }),
  ).toBeVisible();
  // The seeded site, the one the clinical lead really holds, chosen
  // before the picture so it shows a delegate ready to continue.
  await page.getByRole("radio").first().check();
  await shot(page, "join-a-course/choose-site");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.unroute(LEAD_CHECK);
  await expect(
    page.getByRole("heading", { name: "Create an account" }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Lucy Bennett");
  await page.getByLabel("Username").fill("lucy.bennett");
  await page.getByLabel("Email").fill("lucy.bennett@northfield.nhs.uk");
  // Shown only as dots, and the form is never submitted.
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("a-made-up-password");
  await page
    .getByRole("textbox", { name: "Confirm password" })
    .fill("a-made-up-password");
  await shot(page, "join-a-course/create-account");

  await page.goto("/login");
  await expect(page.getByLabel("Username")).toBeVisible();
  // Filled in as Lucy, who registered above. The password shows only as
  // dots, and nothing is submitted.
  await page.getByLabel("Username").fill("lucy.bennett");
  await page
    .getByRole("textbox", { name: "Password" })
    .fill("a-made-up-password");
  await shot(page, "join-a-course/sign-in");
});

// The verification email, as it is really sent. Rendered with sample
// values by `just email-preview` for Storybook, and held true to the
// template by `backend/app/email/previews_test.py`, so this is a
// picture of the real thing with no email sent to take it.
test("the verification email", async ({ page }) => {
  const rendered = path.join(
    "src",
    "stories",
    "emails",
    "rendered",
    "email-verification--quill.html",
  );
  // A page of the app first, so the email's images, which it names from
  // the site's root, have a site to come from.
  await page.goto("/login");
  await page.setContent(fs.readFileSync(rendered, "utf8"), {
    waitUntil: "networkidle",
  });
  await expect(
    page.getByRole("link", { name: "Verify your email" }),
  ).toBeVisible();
  await shot(page, "join-a-course/verification-email");
});
