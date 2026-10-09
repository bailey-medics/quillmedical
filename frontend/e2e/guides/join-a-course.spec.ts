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
