/**
 * The accounts a teaching admin makes and looks after, and the one a
 * superuser makes for them.
 *
 * Items 3 to 9 of Phase 3 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md. The user form
 * is driven by hand where making the account is the journey (items 3 to
 * 5). Where the journey is something done to an account, the account is
 * made through the API first, so the test is about the inviting, the
 * deactivating or the editing and not the form again.
 *
 * Every account is new, named for the browser project and the time, so a
 * retry and the other browser never meet one that already exists. Most
 * tests run as `educator`, the seeded teaching admin every browser
 * project starts signed in as.
 */

import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import {
  createAccount,
  emailOf,
  orgUnitId,
  read,
  send,
} from "../../fixtures/api";
import { linkIn, waitForEmail } from "../../fixtures/mail";
import { PEOPLE, PLACES, freshUsername, signIn } from "../../fixtures/signIn";
import { searchRow } from "../../fixtures/tables";

const TEACHING_ADMIN = "Teaching admin";
const TEACHING_DELEGATE = "Teaching delegate";
const TAKE_MODULES = "Take Teaching Modules";

/** The stepper's own button, matched whole: tables page with "next". */
function nextButton(page: Page) {
  return page.getByRole("button", { name: "Next", exact: true });
}

/** Fill the user form's first step: who they are. */
async function fillBasicDetails(
  page: Page,
  username: string,
  profession: string,
): Promise<void> {
  await page.getByLabel("Full name").fill(`Made By ${username}`);
  await page.getByLabel("Email").fill(emailOf(username));
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Initial password").fill(`${username}Pass123!`);
  await page.getByRole("combobox", { name: "Base profession" }).click();
  await page.getByRole("option", { name: profession, exact: true }).click();
  await nextButton(page).click();
}

/** Choose one option in a multi-select, then close its list. */
async function choose(page: Page, field: RegExp, option: string) {
  await page.getByRole("combobox", { name: field }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  // The list stays open over the button below for more choices.
  await page.keyboard.press("Escape");
}

/**
 * Press Next until the button that finishes the form shows.
 *
 * Which steps there are depends on who is asking: an operator has a
 * Platform role step, and the Enrolment step needs a teaching place. Each
 * press waits for the stepper to move on, so a Next still on screen from
 * the step before is never pressed twice.
 */
async function nextUntil(page: Page, finish: Locator): Promise<void> {
  const current = page.locator(".mantine-Stepper-step[data-progress]");

  for (let step = 0; step < 8 && !(await finish.isVisible()); step += 1) {
    const before = await current.innerText();
    await nextButton(page).click();
    await expect(current).not.toHaveText(before);
  }
}

/** Press Next through whatever steps are left, then create the account. */
async function nextToTheEndAndCreate(page: Page): Promise<void> {
  const create = page.getByRole("button", { name: "Create user" });

  await nextUntil(page, create);
  await create.click();
  // Hashing the password is slow on purpose, and slower again with the
  // other browser's tests running beside this one.
  await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 30_000 });
  await expect(page.getByText("User created")).toBeVisible();
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
    await fillBasicDetails(page, username, TEACHING_ADMIN);
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
    await fillBasicDetails(page, username, TEACHING_ADMIN);
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
    await fillBasicDetails(page, username, TEACHING_DELEGATE);

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

    await createAccount(page, {
      username,
      name: "Invited Delegate",
      profession: "teaching_delegate",
      orgUnitIds: [await orgUnitId(page, PLACES.site)],
    });
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
    page,
    browser,
  }, testInfo) => {
    const username = freshUsername("deactivated", testInfo.project.name);

    await createAccount(page, {
      username,
      name: "Leaving Delegate",
      profession: "teaching_delegate",
      orgUnitIds: [await orgUnitId(page, PLACES.site)],
    });
    await openUser(page, username);
    await page.getByRole("button", { name: "Deactivate" }).click();
    const dialog = page
      .getByRole("dialog")
      .filter({ hasText: "no longer be able to log in" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Deactivate user" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 30_000 });

    // Their own sign-in, in a browser of their own, is refused.
    const theirs = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const them = await theirs.newPage();
    await them.goto("/login");
    await them.getByLabel("Username").fill(username);
    await them
      .getByRole("textbox", { name: "Password" })
      .fill(`${username}Pass123!`);
    const answered = them.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await them.getByRole("button", { name: "Sign in" }).click();
    expect((await answered).status()).toBe(400);
    await expect(them).toHaveURL(/\/login/);
    await theirs.close();
  });

  test("changes somebody's name and email", async ({ page }, testInfo) => {
    const username = freshUsername("renamed", testInfo.project.name);
    const newEmail = `${username}.new@example.test`;

    const id = await createAccount(page, {
      username,
      name: "Before Rename",
      profession: "teaching_delegate",
      orgUnitIds: [await orgUnitId(page, PLACES.site)],
    });
    await page.goto(`/admin/users/${id}/edit`);
    await page.getByLabel("Full name").fill("After Rename");
    await page.getByLabel("Email").fill(newEmail);
    await nextToTheEndAndSave(page);

    const saved = await read<{ name: string; email: string }>(
      page,
      `/users/${id}`,
    );
    expect(saved).toMatchObject({ name: "After Rename", email: newEmail });
  });

  test("cannot move a delegate to an organisation they are not in", async ({
    page,
    browser,
  }, testInfo) => {
    const username = freshUsername("kept_in", testInfo.project.name);
    const siteId = await orgUnitId(page, PLACES.site);

    const id = await createAccount(page, {
      username,
      name: "Kept In Place",
      profession: "teaching_delegate",
      orgUnitIds: [siteId],
    });

    // The form offers only their own places.
    await page.goto(`/admin/users/${id}/edit`);
    await nextButton(page).click();
    await page.getByRole("combobox", { name: /^Organisation/ }).click();
    await expect(
      page.getByRole("option", { name: PLACES.otherOrganisation }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: /^Site/ }).click();
    await expect(
      page.getByRole("option", { name: new RegExp(PLACES.otherSite) }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // And the API refuses the move when it is asked for anyway. The other
    // organisation's ids are looked up by somebody who can see them.
    const operator = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const operatorPage = await operator.newPage();
    await signIn(operatorPage, PEOPLE.superuser);
    const elsewhere = [
      await orgUnitId(operatorPage, PLACES.otherOrganisation),
      await orgUnitId(operatorPage, PLACES.otherSite),
    ];
    await operator.close();

    for (const otherId of elsewhere) {
      const moved = await send(page, "PATCH", `/users/${id}`, {
        org_unit_ids: [otherId],
      });
      expect(moved.status(), await moved.text()).toBeGreaterThanOrEqual(400);
    }

    const after = await read<{ org_unit_ids: number[] }>(page, `/users/${id}`);
    expect(after.org_unit_ids).toEqual([siteId]);
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
