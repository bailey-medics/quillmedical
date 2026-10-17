/**
 * An unregistered teaching delegate making an account for themselves.
 *
 * Stories 5 to 9 of Phase 4 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md, and the
 * terms of service and privacy policy of Phase 14. Nobody here
 * is signed in: a teaching admin's account is made by somebody else, as
 * the Phase 3 journeys test, so registering is for a delegate alone.
 */

import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { linkIn, waitForEmail } from "../../fixtures/mail";
import {
  LIVE_APP,
  PUBLIC_SITE,
  followIntoTheStack,
} from "../../fixtures/publicSite";
import { freshUsername, signIn } from "../../fixtures/signIn";

/**
 * The address a new delegate registers with.
 *
 * Not `example.test`, which the accounts an admin makes use: registration
 * checks an address could receive mail, and refuses a reserved name such
 * as `.test`. `example.com` passes, and nothing is sent: the stack only
 * captures email.
 */
function emailOf(username: string): string {
  return `${username}@example.com`;
}

/** The clinical lead `seed_ci.py` appoints at CI Teaching Centre. */
const CLINICAL_LEAD = "ci_lead@ci.local";

/** Choose the module and name the clinical lead: the first view. */
async function chooseModuleAndLead(page: Page, leadEmail: string) {
  await page.getByRole("combobox", { name: "Teaching module" }).click();
  await page.getByRole("option").first().click();
  await page
    .getByRole("textbox", { name: "Clinical lead email address" })
    .fill(leadEmail);
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Fill in the account form and register: the last view. */
async function makeTheAccount(page: Page, username: string, password: string) {
  await page.getByRole("textbox", { name: "Full name" }).fill("New Delegate");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("textbox", { name: "Email" }).fill(emailOf(username));
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(password);
  await page.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/verify-email-pending/, { timeout: 30_000 });
}

/** Register from the login page's link, as a new delegate would. */
async function register(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByRole("link", { name: /Register/ }).click();
  await expect(page).toHaveURL(/\/register$/);
  await chooseModuleAndLead(page, CLINICAL_LEAD);
  await makeTheAccount(page, username, password);
}

/** The live public site, which the form's legal links name. */
const LIVE_PUBLIC_SITE = "https://quill-medical.com";

/**
 * Send the live public site's pages to the stack's own copy of it, the
 * way `followIntoTheStack` sends the live app to the stack's. A page that
 * refreshes to the target rather than a redirect, which Playwright's
 * WebKit cannot follow from a fulfilled route.
 */
async function servePublicSiteFromTheStack(
  context: BrowserContext,
): Promise<void> {
  await context.route(`${LIVE_PUBLIC_SITE}/**`, async (route) => {
    const url = new URL(route.request().url());
    const target = `${PUBLIC_SITE}${url.pathname}${url.search}`;

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<meta http-equiv="refresh" content="0;url=${target}">`,
    });
  });
}

/** Open one of the form's legal links, and hand back the tab it opens. */
async function openInANewTab(
  page: Page,
  name: string,
  path: string,
  heading: RegExp,
): Promise<Page> {
  // Named with what a screen reader is told, which a sighted reader is
  // not: that it opens in a new tab.
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: `${name} (opens in a new tab)`, exact: true })
    .click();
  const tab = await opened;

  await expect(tab).toHaveURL(new RegExp(`${path}$`));
  await expect(
    tab.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible();

  return tab;
}

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 90_000 });

test.describe("Finding the register page", () => {
  test("Register beside Log in on the module's page leads to it", async ({
    page,
    context,
  }) => {
    await followIntoTheStack(context);
    await page.goto(`${PUBLIC_SITE}/optical-diagnosis-polyps`);

    const main = page.locator("#main-content");
    const register = main.getByRole("link", { name: "Register" });
    await expect(register).toHaveAttribute("href", `${LIVE_APP}/register`);
    await register.click();

    await expect(page).toHaveURL(/\/register$/);
    await expect(
      page.getByRole("textbox", { name: "Clinical lead email address" }),
    ).toBeVisible();
  });
});

test.describe("Registering", () => {
  test("from the login page's link, then confirming the address, gets them in", async ({
    page,
  }, testInfo) => {
    const username = freshUsername("joined", testInfo.project.name);
    const password = `${username}Pass123!`;

    await register(page, username, password);

    const email = await waitForEmail(emailOf(username));
    await page.goto(linkIn(email, "/verify-email"));
    await expect(page.getByText("Email verified")).toBeVisible();

    await signIn(page, username, password);
    await expect(page).toHaveURL(/\/teaching/);
  });

  test("reads the terms of service and privacy policy, and comes back to finish", async ({
    page,
    context,
  }, testInfo) => {
    const username = freshUsername("read_terms", testInfo.project.name);
    const password = `${username}Pass123!`;
    await servePublicSiteFromTheStack(context);

    await page.goto("/login");
    await page.getByRole("link", { name: /Register/ }).click();
    await chooseModuleAndLead(page, CLINICAL_LEAD);
    const fields = {
      "Full name": "New Delegate",
      Username: username,
      Email: emailOf(username),
    };
    for (const [name, value] of Object.entries(fields)) {
      await page.getByRole("textbox", { name, exact: true }).fill(value);
    }
    await page
      .getByRole("textbox", { name: "Password", exact: true })
      .fill(password);

    // Both are opened before either is closed: two tabs open over the
    // form is the likeliest way for it to lose what was typed.
    const terms = await openInANewTab(
      page,
      "terms of service",
      "/terms-of-service",
      /terms of service/i,
    );
    const privacy = await openInANewTab(
      page,
      "privacy policy",
      "/privacy-policy",
      /privacy policy/i,
    );

    // Whether the new tab is brought to the front is the browser's to
    // decide, and it does for a link opened by a click. A headless
    // browser cannot say: it reports every tab visible and focused, the
    // form's included. So what is checked is that each link opens a tab
    // of its own, above, which is what a browser brings to the front.

    await privacy.close();
    await terms.close();

    // Back on the form, with everything they typed still there.
    for (const [name, value] of Object.entries(fields)) {
      await expect(
        page.getByRole("textbox", { name, exact: true }),
      ).toHaveValue(value);
    }
    await expect(
      page.getByRole("textbox", { name: "Password", exact: true }),
    ).toHaveValue(password);

    await page
      .getByRole("textbox", { name: "Confirm password" })
      .fill(password);
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page).toHaveURL(/\/verify-email-pending/, { timeout: 30_000 });
    await waitForEmail(emailOf(username));
  });

  test("without following the link in the email, they cannot get in", async ({
    page,
  }, testInfo) => {
    const username = freshUsername("unconfirmed", testInfo.project.name);
    const password = `${username}Pass123!`;

    await register(page, username, password);

    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    const answered = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();

    const response = await answered;
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({
      detail: { error_code: "email_not_verified" },
    });
    await expect(page).not.toHaveURL(/\/teaching/);
    await expect(page.getByText(/verify|confirm/i).first()).toBeVisible();
  });
});

test.describe("Registering with the wrong details", () => {
  test("a clinical lead's address nobody holds is refused", async ({
    page,
  }) => {
    await page.goto("/register");
    await chooseModuleAndLead(page, "not_a_lead@example.com");

    await expect(page.getByText("Clinical lead not found")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Username" })).toHaveCount(
      0,
    );
  });

  test("a module the lead does not serve is refused", async ({
    page,
  }, testInfo) => {
    const username = freshUsername("wrong_module", testInfo.project.name);

    // Only modules open to registration are offered, so a wrong one can
    // only be asked for by hand. The lead is right; the module is not.
    const checked = await page.request.post(
      "/api/teaching/public/validate-clinical-lead",
      { data: { email: CLINICAL_LEAD, bank_id: "not-a-module" } },
    );
    expect(checked.status()).toBe(200);
    expect(await checked.json()).toMatchObject({ valid: false });

    const registered = await page.request.post("/api/auth/register", {
      data: {
        username,
        email: emailOf(username),
        password: `${username}Pass123!`,
        teaching_module_id: "not-a-module",
        clinical_lead_email: CLINICAL_LEAD,
        marketing_opt_out: true,
      },
    });
    expect(registered.status()).toBeGreaterThanOrEqual(400);

    // And no account was made: signing in as them is a stranger's refusal.
    const signedIn = await page.request.post("/api/auth/login", {
      data: { username, password: `${username}Pass123!` },
    });
    expect(signedIn.status()).toBe(400);
  });
});
