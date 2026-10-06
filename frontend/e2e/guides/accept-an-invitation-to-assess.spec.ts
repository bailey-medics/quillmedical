/**
 * Screenshots for the guide "Accept an invitation to assess".
 *
 * The invitation email, as it is really sent: rendered with sample values
 * by `just email-preview` for Storybook, and held true to the template by
 * `backend/tests/test_email_previews.py`. No picture of the page the
 * email leads to, which needs a real invitation's token to open.
 */

import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";
import { shot } from "./shot";

test("accept an invitation to assess", async ({ page }) => {
  const rendered = path.join(
    "src",
    "stories",
    "emails",
    "rendered",
    "passport-invite--quill.html",
  );
  // A page of the app first, so the email's images, which it names from
  // the site's root, have a site to come from.
  await page.goto("/login");
  await page.setContent(fs.readFileSync(rendered, "utf8"), {
    waitUntil: "networkidle",
  });
  await expect(
    page.getByRole("link", { name: "Accept the invitation" }),
  ).toBeVisible();
  await shot(page, "accept-an-invitation-to-assess/email");
});
