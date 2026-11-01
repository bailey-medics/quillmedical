/**
 * The accounts a teaching admin makes and looks after, and the one a
 * superuser makes for them.
 *
 * Items 3 to 9 of Phase 3 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md. The user form
 * is driven step by step where making the account is the journey (items 3
 * to 5). Where the journey is something done to an account, the account is
 * made on the same form first by `makeAccount`, so the test is about the
 * inviting, the deactivating or the editing. Nothing here calls the API:
 * see `.claude/rules/e2e.md`.
 *
 * Every account is new, named for the browser project and the time, so a
 * retry and the other browser never meet one that already exists. Most
 * tests run as `educator`, the seeded teaching admin every browser
 * project starts signed in as.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { linkIn, waitForEmail } from "../../fixtures/mail";
import { deactivate, makeAccount } from "../../fixtures/people";
import {
  PEOPLE,
  PLACES,
  expectRefusedSignIn,
  freshUsername,
  signIn,
} from "../../fixtures/signIn";
import { searchRow } from "../../fixtures/tables";
import {
  choose,
  emailOf,
  fillBasicDetails,
  nextButton,
  nextToTheEndAndCreate,
  nextUntil,
} from "../../fixtures/userForm";

const TEACHING_ADMIN = "Teaching admin";
const TEACHING_DELEGATE = "Teaching delegate";
const TAKE_MODULES = "Take Teaching Modules";

/** The form's first step for a new account named after *username*. */
function detailsFor(username: string, profession: string) {
  return {
    username,
    name: `Made By ${username}`,
    profession,
    password: `${username}Pass123!`,
  };
}

/**
 * Open somebody's admin page from the list of users.
 *
 * Found by searching: the list is paged, and earlier tests' accounts can
 * push a new one off the first page.
 */
async function openUser(page: Page, username: string): Promise<void> {
  await page.goto("/admin/users");
  await (await searchRow(page, username)).click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+$/);
}

test.describe("A superuser making accounts", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 120_000 });

  test("creates a teaching admin for somebody else", async ({
    page,
  }, testInfo) => {
    const username = freshUsername("su_made_ta", testInfo.project.name);

    await signIn(page, PEOPLE.superuser);
    await page.goto("/admin/users/new");
    await fillBasicDetails(page, detailsFor(username, TEACHING_ADMIN));
    await choose(page, /^Organisation/, PLACES.organisation);
    await nextToTheEndAndCreate(page);

    await openUser(page, username);
    await expect(page.getByText(TEACHING_ADMIN).first()).toBeVisible();
  });
});

test.describe("A teaching admin making accounts", () => {
  test.describe.configure({ timeout: 120_000 });

  test("creates a teaching admin for somebody else", async ({
    page,
  }, testInfo) => {
    const username = freshUsername("ta_made_ta", testInfo.project.name);

    await page.goto("/admin/users/new");
    await fillBasicDetails(page, detailsFor(username, TEACHING_ADMIN));
    await choose(page, /^Organisation/, PLACES.organisation);
    await nextToTheEndAndCreate(page);

    await openUser(page, username);
    await expect(page.getByText(TEACHING_ADMIN).first()).toBeVisible();
  });

  test("creates a delegate at a site, practising there and enrolled", async ({
    page,
  }, testInfo) => {
    const username = freshUsername("ta_made_td", testInfo.project.name);
    const site = `${PLACES.organisation} - ${PLACES.site}`;

    await page.goto("/admin/users/new");
    await fillBasicDetails(page, detailsFor(username, TEACHING_DELEGATE));

    // Organisation/site: the organisation and one of its sites.
    await choose(page, /^Organisation/, PLACES.organisation);
    await choose(page, /^Site/, site);
    await nextButton(page).click();

    // Competencies: the profession's own, unchanged.
    await expect(
      page.getByRole("heading", { name: "Competency configuration" }),
    ).toBeVisible();
    await nextButton(page).click();

    // Practice: taking modules switched on at the site.
    const practice = page.getByRole("switch", {
      name: `${TAKE_MODULES} at ${PLACES.site}: may practise here`,
    });
    await expect(practice).not.toBeChecked();
    // The switch's input is visually hidden, so click its track.
    await page
      .locator(`label[for="${await practice.getAttribute("id")}"]`)
      .click();
    await expect(practice).toBeChecked();
    await nextButton(page).click();

    // Enrolment: the organisation serves the pinned module.
    const module = page
      .getByRole("checkbox", {
        name: new RegExp(` at ${PLACES.organisation}$`),
      })
      .first();
    await module.check();
    await expect(module).toBeChecked();
    await nextToTheEndAndCreate(page);

    // Their page at the site shows both.
    await page.goto("/admin/sites");
    await page.getByRole("row", { name: new RegExp(PLACES.site) }).click();
    await (await searchRow(page, username)).click();
    await expect(page).toHaveURL(/\/admin\/sites\/\d+\/members\/\d+$/);
    await expect(
      page.getByRole("switch", { name: `${TAKE_MODULES}: may practise here` }),
    ).toBeChecked();
    await expect(
      page
        .getByRole("checkbox", {
          name: new RegExp(` at ${PLACES.organisation}$`),
        })
        .first(),
    ).toBeChecked();
  });
});

test.describe("A teaching admin looking after accounts", () => {
  test.describe.configure({ timeout: 120_000 });

  test("sends a join invite, and its link sets a password", async ({
    page,
    browser,
  }, testInfo) => {
    const username = freshUsername("invited", testInfo.project.name);
    const password = `${username}Joined1!`;

    await makeAccount(browser, { username, profession: "teaching_delegate" });
    await openUser(page, username);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sent" })).toBeVisible();

    const email = await waitForEmail(emailOf(username));
    const link = linkIn(email, "/reset-password");

    // The invited person, in a browser of their own.
    const theirs = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const invited = await theirs.newPage();
    await invited.goto(link);
    await invited.getByLabel("New password").fill(password);
    await invited.getByLabel("Confirm password").fill(password);
    await invited.getByRole("button", { name: "Reset password" }).click();
    await expect(invited).toHaveURL(/\/login/);

    await signIn(invited, username, password);
    await theirs.close();
  });

  test("deactivates an account, which can then no longer sign in", async ({
    browser,
  }, testInfo) => {
    const username = freshUsername("deactivated", testInfo.project.name);

    await makeAccount(browser, { username, profession: "teaching_delegate" });
    await deactivate(browser, username);

    // Their own sign-in, in a browser of their own, is refused. The
    // backend test `test_login_inactive_user` makes the refusal itself.
    const theirs = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    await expectRefusedSignIn(
      await theirs.newPage(),
      username,
      `${username}123`,
    );
    await theirs.close();
  });

  test("changes somebody's name and email", async ({
    page,
    browser,
  }, testInfo) => {
    const username = freshUsername("renamed", testInfo.project.name);
    const newEmail = `${username}.new@example.test`;

    await makeAccount(browser, { username, profession: "teaching_delegate" });
    await openUser(page, username);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/admin\/users\/\d+\/edit$/);
    await page.getByLabel("Full name").fill("After Rename");
    await page.getByLabel("Email").fill(newEmail);
    await nextToTheEndAndSave(page);

    // Their page shows the new name and address.
    await openUser(page, username);
    await expect(page.getByText("After Rename", { exact: true })).toBeVisible();
    await expect(page.getByText(newEmail, { exact: true })).toBeVisible();
  });

  test("is offered only their own places when moving a delegate", async ({
    page,
    browser,
  }, testInfo) => {
    const username = freshUsername("kept_in", testInfo.project.name);

    await makeAccount(browser, { username, profession: "teaching_delegate" });
    await openUser(page, username);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page).toHaveURL(/\/admin\/users\/\d+\/edit$/);
    await nextButton(page).click();

    // Their own organisation is offered, the other one is not. The backend
    // test `test_an_org_unit_outside_the_callers_reach_is_refused_the_same_way`
    // refuses a move there when it is asked for anyway.
    await page.getByRole("combobox", { name: /^Organisation/ }).click();
    await expect(
      page.getByRole("option", { name: PLACES.organisation, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: PLACES.otherOrganisation }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: /^Site/ }).click();
    await expect(
      page.getByRole("option", { name: new RegExp(PLACES.otherSite) }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
});

/** Press Next through the edit form's steps, then save. */
async function nextToTheEndAndSave(page: Page): Promise<void> {
  const save = page.getByRole("button", { name: "Update user" });

  await nextUntil(page, save);
  await save.click();
  await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 30_000 });
  await expect(page.getByText("User updated")).toBeVisible();
}
