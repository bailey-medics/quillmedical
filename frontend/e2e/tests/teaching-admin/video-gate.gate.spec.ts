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
 * Its own Playwright project, `video-gate`, which every browser project
 * waits for: the module is missing at CI Second Hospital until this has
 * run, and the leak tests expect it there.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { MODULE_ID } from "../../fixtures/answers";
import { read, send } from "../../fixtures/api";
import { knownSlides } from "../../fixtures/learning";
import {
  LUNGS_VIDEO,
  finishTranscode,
  finishWithNoSpeech,
} from "../../fixtures/mediaJobs";
import { asTeachingAdminOf, makeLearnerAt } from "../../fixtures/people";
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

/** A module's video at one organisation, as its admin card reads it. */
interface Media {
  references: {
    key: string;
    asset: {
      asset_id: string;
    } | null;
  }[];
}

/** A page signed in as *username*, in a context of its own. */
async function signedIn(browser: Browser, username: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signIn(page, username);

  return page;
}

/** Whether the module is listed for, and opens for, the person on *page*. */
async function expectModule(page: Page, shown: boolean): Promise<void> {
  const listed = await read<{ module_id: string }[]>(page, "/teaching/modules");
  expect(listed.map((row) => row.module_id).includes(MODULE_ID)).toBe(shown);

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
  // From the module's own list of organisations: the org_unit list is
  // scoped to where the caller belongs, and this one is not theirs.
  const running = await read<
    { org_unit_id: number; organisation_name: string }[]
  >(page, `/teaching/admin/banks/${MODULE_ID}/organisations`);
  const second = running.find(
    (row) => row.organisation_name === PLACES.secondOrganisation,
  )?.org_unit_id;
  if (second === undefined) {
    throw new Error(`${PLACES.secondOrganisation} does not run the module`);
  }
  const media = `/teaching/admin/modules/${MODULE_ID}/media?org_unit_id=${second}`;

  // From nothing uploaded, so a retry after an upload starts where the
  // first try did.
  for (const reference of (await read<Media>(page, media)).references) {
    if (reference.asset === null) continue;
    const removed = await send(
      page,
      "DELETE",
      `/teaching/admin/modules/${MODULE_ID}/media/${reference.asset.asset_id}?org_unit_id=${second}`,
    );
    expect(removed.ok(), await removed.text()).toBe(true);
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

  // The superadmin uploads the video in that organisation's card.
  await page.goto(`/admin/teaching/modules/${MODULE_ID}`);
  const card = cardTitled(page, `Videos for ${PLACES.secondOrganisation}`);
  await card.locator('input[type="file"]').setInputFiles(LUNGS_VIDEO);
  await expect(card.getByText("lungs-video.mp4")).toBeVisible({
    timeout: 30_000,
  });
  let assetId = "";
  await expect
    .poll(
      async () => {
        assetId =
          (await read<Media>(page, media)).references[0]?.asset?.asset_id ?? "";
        return assetId;
      },
      {
        // The name shows as soon as the file starts going up; the upload
        // is recorded once it has all arrived, which on a busy runner
        // takes longer than the default five seconds.
        timeout: 30_000,
      },
    )
    .not.toBe("");
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
  const fetched = tdPage.waitForResponse((response) =>
    response.url().includes(`${assetId}-720p.mp4`),
  );
  await tdPage.goto(`/teaching/learn/${MODULE_ID}/slide/${index}`);
  expect([200, 206]).toContain((await fetched).status());
  await expect(
    tdPage.getByRole("main").getByRole("group", { name: "Media player" }),
  ).toBeVisible();

  await tdPage.context().close();
  await taPage.context().close();
});
