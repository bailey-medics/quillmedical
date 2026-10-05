/**
 * Screenshots for the guide "Join a course".
 *
 * Taken signed out, as the delegate reading the guide is. Nothing is
 * submitted, so nobody is registered.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";

test.use({ storageState: { cookies: [], origins: [] } });

test("join a course", async ({ page }) => {
  await page.goto("/register");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Register for Quill Teaching",
    }),
  ).toBeVisible();
  await page
    .getByLabel("Clinical lead email address")
    .fill("clinical.lead@example.org");
  await shot(page, "join-a-course/choose-module");

  // The second step, opened directly: the form is the same however it is
  // reached, and getting here through the first would need a clinical
  // lead the seed does not have.
  await page.goto("/teaching/register/module");
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
