/**
 * A module is hidden at an organisation until its video is ready there.
 *
 * Phase 17 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * The respiratory module's "Lungs in motion" slide names a video, and a
 * video is uploaded once for each organisation running the module.
 * `seed_ci.py` uploads it at "CI Teaching Hospital" and leaves
 * "CI Second Hospital" without one, so the module is hidden there. The
 * superadmin uploads it on the module's admin page, and the transcode and
 * caption jobs are stood in for (`fixtures/mediaJobs.ts`). The video is
 * silent, so the caption job reports no speech rather than captions for a
 * person to read; only then do the teaching admin and a delegate there
 * see the module, and its video play.
 *
 * Nothing here calls the API but the two jobs' reports, the one call a
 * test may make (`.claude/rules/e2e.md`): what a person sees is checked on
 * the learning page and the module's own address.
 *
 * Its own Playwright project, `video-gate`, which every browser project
 * waits for: the module is missing at CI Second Hospital until this has
 * run, and the leak tests expect it there.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { MODULE_ID } from "../../fixtures/answers";
import { knownSlides } from "../../fixtures/learning";
import {
  LUNGS_VIDEO,
  finishTranscode,
  finishWithNoSpeech,
  newUpload,
  uploadsOnDisk,
} from "../../fixtures/mediaJobs";
import { asTeachingAdminOf, makeLearnerAt } from "../../fixtures/people";
import { openFromTheList } from "../../fixtures/places";
import {
  PEOPLE,
  PLACES,
  TEACHING_SITES,
  freshUsername,
  signIn,
} from "../../fixtures/signIn";
import { cardTitled } from "../../fixtures/tables";

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 240_000 });

/** The module's title, as `module.yaml` gives it. */
const MODULE_TITLE = "Chest X-ray Interpretation";

/** The name the uploaded video is shown by in its card. */
const UPLOADED = "lungs-video.mp4";

/** A page signed in as *username*, in a context of its own. */
async function signedIn(browser: Browser, username: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signIn(page, username);

  return page;
}

/**
 * Whether the module is listed on the learning page for the person on
 * *page*, and opens at its own address.
 */
async function expectModule(page: Page, shown: boolean): Promise<void> {
  await page.goto("/teaching/learn");
  // The heading is drawn once the list has loaded: a skeleton stands in
  // for both until then.
  await expect(
    page.getByRole("heading", { name: "Learning materials" }),
  ).toBeVisible();
  await expect(page.getByText(MODULE_TITLE, { exact: true })).toHaveCount(
    shown ? 1 : 0,
  );

  await page.goto(`/teaching/${MODULE_ID}`);

  if (shown) {
    await expect(
      page.getByRole("button", { name: "Start learning" }),
    ).toBeVisible();
  } else {
    await expect(page.getByText("Module not found")).toBeVisible();
  }
}

test("the module is hidden at an organisation until its video is uploaded, transcoded and its captions dealt with", async ({
  page,
  browser,
}, testInfo) => {
  await signIn(page, PEOPLE.operator);

  // From nothing uploaded, so a retry after an upload starts where the
  // first try did. Deleted in the organisation's card, as the superadmin
  // would.
  await page.goto(`/admin/teaching/modules/${MODULE_ID}`);
  const card = cardTitled(page, `Videos for ${PLACES.secondOrganisation}`);
  await expect(card).toBeVisible();
  const actions = card.getByLabel(`Actions for ${UPLOADED}`);

  for (let left = await actions.count(); left > 0; left -= 1) {
    await actions.first().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const confirm = page
      .getByRole("dialog")
      .filter({ hasText: "Delete this video?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(confirm).toBeHidden();
    await expect(actions).toHaveCount(left - 1);
  }

  // A teaching admin and a delegate there see no module, and its address
  // does not open.
  const delegate = freshUsername("gate_td", testInfo.project.name);
  await makeLearnerAt(
    browser,
    delegate,
    "teaching_delegate",
    TEACHING_SITES.secondCentre,
  );
  const tdPage = await signedIn(browser, delegate);
  const taPage = await (
    await asTeachingAdminOf(browser, TEACHING_SITES.secondCentre)
  ).newPage();
  await expectModule(tdPage, false);
  await expectModule(taPage, false);

  // The organisation's id, from where its teaching admin opens it: the
  // job reports name the organisation by it. The superadmin's own list
  // shows only the places they belong to.
  const second = await openFromTheList(
    taPage,
    "/admin/organisations",
    PLACES.secondOrganisation,
    /\/admin\/organisations\/(\d+)$/,
  );

  // The superadmin uploads the video in that organisation's card. It is
  // recorded once the card offers actions for it, and the transcode job is
  // handed the file the upload wrote.
  const before = uploadsOnDisk();
  await page.goto(`/admin/teaching/modules/${MODULE_ID}`);
  await card.locator('input[type="file"]').setInputFiles(LUNGS_VIDEO);
  await expect(actions).toBeVisible({ timeout: 30_000 });
  const assetId = await newUpload(before);
  const upload = { orgId: second, assetId };

  // Still hidden: there is no rendition until the transcode finishes.
  await expectModule(tdPage, false);

  // The transcode finishes. Still hidden: the caption job has not said
  // whether there is anything to caption.
  await finishTranscode(page.request, upload);
  await expectModule(tdPage, false);

  // The caption job finds no speech, as the video is silent, so there are
  // no captions for anybody to read. The card says so.
  await finishWithNoSpeech(page.request, upload);
  await page.reload();
  await expect(
    card.getByText("Ready - no speech, so no captions needed"),
  ).toBeVisible();

  // Now the teaching admin and the delegate see the module and open it.
  await expectModule(tdPage, true);
  await expectModule(taPage, true);

  // And the video comes from Quill, as the transcode's 720p rendition.
  const index = knownSlides().findIndex(
    (slide) => slide.title === "Lungs in motion",
  );
  await tdPage.goto(`/teaching/learn/${MODULE_ID}/slide/${index}`);
  const player = tdPage
    .getByRole("main")
    .getByRole("group", { name: "Media player" });
  await expect(player).toBeVisible();
  const video = player.locator("video");
  await expect
    .poll(() =>
      video.evaluate((element: HTMLVideoElement) => element.currentSrc),
    )
    .toMatch(new RegExp(`${assetId}-720p\\.mp4$`));

  await tdPage.context().close();
  await taPage.context().close();
});
