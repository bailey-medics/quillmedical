/**
 * The passport admin's grants, a passport gone read-only, and the gates.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * stories 17 to 21. Every change to a person is made by the passport
 * admin on their admin pages, as it would be in a trust, never by the
 * operator, and every refusal is checked as the person meets it on
 * screen (Phase 7).
 */

import { test, expect } from "../../fixtures/axe";
import {
  FRAMEWORK_NAMES,
  REFER_PALLIATIVE,
  addOnTheForm,
  asPassportAdmin,
  createPassport,
  makeAssessor,
  makeHolder,
  openUntil,
  passportEmailOf,
  removeFromThePassportSite,
  toggleFrameworks,
  togglePassportWrite,
  userIdFromTheList,
} from "../../fixtures/passport";
import { PEOPLE, freshUsername, signIn } from "../../fixtures/signIn";
import { searchRow } from "../../fixtures/tables";

test.describe("Running the passport, and a read-only passport", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 120_000 });

  test("29. a passport admin adds somebody to the passport, who starts their record", async ({
    page,
    browser,
  }, testInfo) => {
    // The first thing a trust does with the passport: its passport admin
    // adds a person on the add-user form, with writing, and that person
    // signs in with the password given and creates their passport.
    const username = freshUsername("ph", testInfo.project.name);
    const admin = await asPassportAdmin(browser);
    await addOnTheForm(admin, username, passportEmailOf(username), true);
    await expect(admin).toHaveURL(/\/admin\/users\/\d+$/);
    await expect(admin.getByText(username).first()).toBeVisible();
    await admin.context().close();

    await signIn(page, username);
    await createPassport(page, ["clinical"]);
  });

  test("17. a passport admin gives passport_write to a member of their place", async ({
    page,
    browser,
  }, testInfo) => {
    // Somebody at the passport site who may not yet write: the page
    // offers a passport, and refuses to make it. The API's refusal is
    // router_test.py's
    // `test_somebody_without_passport_write_cannot_create_one`.
    const member = await makeAssessor(browser, testInfo.project.name);
    await signIn(page, member.username);
    await page.goto("/passport");
    await toggleFrameworks(page, ["clinical"]);
    await page.getByRole("button", { name: "Create my passport" }).click();
    await expect(
      page.getByText("Your passport could not be created"),
    ).toBeVisible();

    // The passport admin grants it on the member's edit page.
    await togglePassportWrite(browser, member.id);

    // Now they can.
    await page.goto("/passport");
    await toggleFrameworks(page, ["clinical"]);
    await page.getByRole("button", { name: "Create my passport" }).click();
    await expect(
      page.getByRole("heading", { name: FRAMEWORK_NAMES.clinical }),
    ).toBeVisible();
  });

  test("27. a passport admin is offered only the passport's professions and competencies, and no platform role", async ({
    browser,
  }, testInfo) => {
    // What the edit page offers is what the passport admin may give. The
    // API's half is manage_passport_user_routes_test.py's
    // `TestWhatAPassportAdminMayNotDo`, `test_create_an_operator` and
    // `test_make_a_delegate_an_operator` among them.
    const member = await makeAssessor(browser, testInfo.project.name);
    const admin = await asPassportAdmin(browser);
    const next = admin.getByRole("button", { name: "Next", exact: true });
    const save = admin.getByRole("button", { name: "Update user" });
    const profession = admin.getByRole("combobox", { name: "Base profession" });
    const held = admin.getByRole("combobox", {
      name: "Held beyond the profession",
    });

    await admin.goto(`/admin/users/${member.id}/edit`);
    await expect(profession).toBeVisible();
    await profession.click();
    expect((await admin.getByRole("option").allTextContents()).sort()).toEqual([
      "Passport admin",
      "Passport clinical lead",
      "Passport delegate",
      "Passport external assessor",
    ]);
    await admin.keyboard.press("Escape");

    // Every step on the way to saving, and none offers a platform role.
    while (!(await held.isVisible())) {
      await expect(admin.getByText("Platform role")).toHaveCount(0);
      await next.click();
    }
    // Beyond the profession: only passport competencies, less any the
    // profession already gives, as a delegate's gives the sign-off one.
    await held.click();
    const offered = await admin.getByRole("option").allTextContents();
    expect(offered).toContain("Hold and Write a Clinician Passport");
    for (const option of offered) {
      expect([
        "Hold and Write a Clinician Passport",
        "Manage the Clinician Passport",
        "Sign Off Clinician Passport Competencies",
      ]).toContain(option);
    }
    await admin.keyboard.press("Escape");

    while (!(await save.isVisible())) {
      await expect(admin.getByText("Platform role")).toHaveCount(0);
      await next.click();
    }
    await expect(admin.getByText("Platform role")).toHaveCount(0);
    await admin.context().close();
  });

  test("18. a passport admin cannot give passport_write outside their places", async ({
    browser,
  }) => {
    // The seeded teaching admin works at "CI Teaching Hospital", where
    // this passport admin runs nothing. Their id is found as the operator
    // finds anybody, which is a lookup, not setting anything up.
    const outsider = await userIdFromTheList(browser, PEOPLE.teachingAdmin);

    // They are not on the passport admin's list to choose, and their edit
    // page shows nothing of them. The API's refusal is
    // manage_passport_user_routes_test.py's `test_not_to_somebody_at_another_trust`.
    const admin = await asPassportAdmin(browser);
    await admin.goto("/admin/users");
    await expect(admin.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(admin.getByText(PEOPLE.teachingAdmin)).toHaveCount(0);

    await admin.goto(`/admin/users/${outsider}/edit`);
    await expect(admin.getByText("Error loading user")).toBeVisible();
    await expect(
      admin.getByRole("combobox", { name: "Held beyond the profession" }),
    ).toHaveCount(0);
    await admin.context().close();
  });

  test("19. a holder whose writing is withdrawn is warned, and can still read and download", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    await togglePassportWrite(browser, holder.id);

    await signIn(page, holder.username);
    await page.goto("/passport");
    await expect(page.getByText("Your passport is read-only")).toBeVisible();

    await page.goto(`/passport/competencies/${REFER_PALLIATIVE.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: REFER_PALLIATIVE.name }),
    ).toBeVisible();
    // Nothing offers a way to write. The API's refusal is
    // passport_api_contract_test.py's
    // `test_they_cannot_add_to_their_own_passport`.
    await expect(
      page.getByRole("button", { name: "Add an entry" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Ask for a sign-off" }),
    ).toHaveCount(0);

    await page.goto("/passport/download");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("20. a read-only holder can still change their home page view", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    await togglePassportWrite(browser, holder.id);

    await signIn(page, holder.username);
    await page.goto("/settings");
    await page.getByRole("radio", { name: "By record" }).check();
    await openUntil(page, "/passport", async () => {
      await expect(
        page.getByRole("button", { name: "Open sign-offs" }),
      ).toBeVisible({ timeout: 3_000 });
    });
    await expect(page.getByText("Your passport is read-only")).toBeVisible();
  });

  test("21. a holder taken off every passport place can still open their passport", async ({
    page,
    browser,
  }, testInfo) => {
    // Belonging to no org_unit is a state of its own (Phase 10). The
    // passport admin is warned on the Review step before saving, inside
    // `removeFromThePassportSite`.
    const holder = await makeHolder(browser, testInfo.project.name);
    await removeFromThePassportSite(browser, holder.id);

    await signIn(page, holder.username);
    await page.goto("/passport");
    await expect(
      page.getByRole("heading", { level: 1, name: "My passport" }),
    ).toBeVisible();
    await expect(
      page.getByTestId("competency-framework-table").first(),
    ).toBeVisible();
    await page.goto(`/passport/competencies/${REFER_PALLIATIVE.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: REFER_PALLIATIVE.name }),
    ).toBeVisible();

    // Writing stays behind the feature gate: nothing offers it. The API's
    // refusal is router_test.py's `test_they_cannot_write_to_it`.
    await expect(
      page.getByRole("button", { name: "Add an entry" }),
    ).toHaveCount(0);

    // They still take their passport with them.
    await page.goto("/passport/download");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

    // The operator finds them among the people at no organisation.
    const operator = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const operatorPage = await operator.newPage();
    await signIn(operatorPage, PEOPLE.superuser);
    await operatorPage.goto("/admin/users");
    await operatorPage.getByLabel("Filter users").click();
    await operatorPage.getByRole("combobox").click();
    await operatorPage
      .getByRole("option", { name: "Not at any organisation" })
      .click();
    await operatorPage.keyboard.press("Escape");
    await searchRow(operatorPage, holder.username);
    await expect(
      operatorPage.getByText(holder.username, { exact: true }).first(),
    ).toBeVisible();
    await operator.close();

    // The passport admin no longer finds them at all.
    const admin = await asPassportAdmin(browser);
    await admin.goto("/admin/users");
    await searchRow(admin, holder.username);
    await expect(admin.getByText("No users found")).toBeVisible();
    await admin.context().close();
  });
});
