/**
 * From the public site into the app, for a teaching admin and a teaching
 * delegate, and nobody else.
 *
 * Stories 1 to 4 of Phase 4 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md. The public
 * site is served by the end-to-end stack on a port of its own; see
 * `fixtures/publicSite.ts`.
 *
 * A teaching admin is `educator` and a teaching delegate is
 * `results_delegate`, both seeded by `backend/scripts/seed_ci.py`.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { createAccount, orgUnitId, send } from "../../fixtures/api";
import {
  LIVE_APP,
  PUBLIC_SITE,
  followIntoTheStack,
} from "../../fixtures/publicSite";
import { PLACES, freshUsername, signIn } from "../../fixtures/signIn";
import { atPhoneWidth } from "../../fixtures/phone";

/** The two people this phase is about, by the name each story uses. */
const PEOPLE = [
  { who: "a teaching admin", username: "educator" },
  { who: "a teaching delegate", username: "results_delegate" },
] as const;

/** The public pages a delegate meets on the way in. */
const PUBLIC_PAGES = [
  { path: "/", heading: /Clinical learning and assessment/ },
  {
    path: "/optical-diagnosis-polyps",
    heading: /Optical diagnosis accreditation/,
  },
] as const;

/** Fill in the login form and return the status the API answered with. */
async function tryToSignIn(
  page: Page,
  username: string,
  password: string,
): Promise<number> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(password);

  const answered = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();

  return (await answered).status();
}

test.describe("The public site", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { path, heading } of PUBLIC_PAGES) {
    test(`anybody lands on ${path}`, async ({ page, scanPage }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      const response = await page.goto(`${PUBLIC_SITE}${path}`);

      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      expect(errors).toEqual([]);

      await scanPage(
        `public${path === "/" ? "-home" : path.replace("/", "-")}`,
      );
    });
  }
});

test.describe("From the public site into the app", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 90_000 });

  for (const { who, username } of PEOPLE) {
    test(`${who} follows Log in and signs in`, async ({ page, context }) => {
      await followIntoTheStack(context);
      await page.goto(`${PUBLIC_SITE}/optical-diagnosis-polyps`);

      // In the header, the menu and the page itself: every one goes to
      // the live app. The page's own is followed. At a phone's width the
      // header's own is hidden, and the menu and the page's show.
      const logIns = page.getByRole("link", { name: "Log in" });
      await expect(logIns).toHaveCount(atPhoneWidth(page) ? 2 : 3);
      for (const link of await logIns.all()) {
        await expect(link).toHaveAttribute("href", LIVE_APP);
      }
      await page
        .locator("#main-content")
        .getByRole("link", { name: "Log in" })
        .click();
      await expect(page.getByLabel("Username")).toBeVisible();

      await signIn(page, username);
      await expect(page).toHaveURL(/\/teaching/);
    });
  }
});

test.describe("Signing in without valid credentials", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { who, username } of PEOPLE) {
    test(`${who}'s username with the wrong password is refused`, async ({
      page,
    }) => {
      expect(await tryToSignIn(page, username, "not-the-password")).toBe(400);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("a username nobody has is refused", async ({ page }) => {
    expect(await tryToSignIn(page, "nobody_has_this_name", "anything123")).toBe(
      400,
    );
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("A deactivated account", () => {
  test.describe.configure({ timeout: 90_000 });

  const professions = [
    { who: "a teaching admin", profession: "teaching_admin" },
    { who: "a teaching delegate", profession: "teaching_delegate" },
  ] as const;

  for (const { who, profession } of professions) {
    test(`belonging to ${who} cannot sign in`, async ({
      page,
      browser,
    }, testInfo) => {
      const username = freshUsername("closed", testInfo.project.name);
      const password = `${username}Pass123!`;

      // Made and closed by the seeded teaching admin, through the API.
      const id = await createAccount(page, {
        username,
        name: "Closed Account",
        profession,
        orgUnitIds: [await orgUnitId(page, PLACES.organisation)],
        password,
      });
      const closed = await send(page, "POST", `/users/${id}/deactivate`, {});
      expect(closed.status(), await closed.text()).toBe(200);

      const theirs = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const them = await theirs.newPage();
      expect(await tryToSignIn(them, username, password)).toBe(400);
      await expect(them).toHaveURL(/\/login/);
      await theirs.close();
    });
  }
});
