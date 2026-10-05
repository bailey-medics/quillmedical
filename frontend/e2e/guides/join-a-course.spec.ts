/**
 * Screenshots for the guide "Join a course".
 *
 * Taken signed out, as the delegate reading the guide is. Nothing is
 * submitted, so nobody is registered.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { SEEDED } from "./signIn";

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

  // On to the second step the way a delegate gets there: the clinical
  // lead is in post at the seeded site, so the first step accepts them.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Create an account" }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Sam Sample");
  await page.getByLabel("Username").fill("sam.sample");
  await page.getByLabel("Email").fill("sam.sample@example.org");
  await shot(page, "join-a-course/create-account");

  await page.goto("/login");
  await expect(page.getByLabel("Username")).toBeVisible();
  await shot(page, "join-a-course/sign-in");
});
