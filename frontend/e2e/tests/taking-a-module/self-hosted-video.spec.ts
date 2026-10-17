/**
 * The self-hosted video plays, from Quill's own server, to its end.
 *
 * Phase 17 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * The respiratory module's "Lungs in motion" slide holds
 * `<Video ref="lungs-video">`, an eight-second clip kept beside the
 * content as `learning/lungs-video.mp4`, which `seed_ci.py` uploads for
 * CI Teaching Hospital as an admin would. Unlike the YouTube lecture, it
 * comes from Quill: granted through `/video-access`, then fetched from the
 * address that grant gives, which in this stack is the backend reading
 * the file off disk and in production is the CDN.
 */

import { test, expect } from "../../fixtures/axe";
import { MODULE_ID } from "../../fixtures/answers";
import { knownSlides } from "../../fixtures/learning";
import { makeLearner } from "../../fixtures/people";
import { freshUsername, signIn } from "../../fixtures/signIn";

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

test("plays the self-hosted video to its end", async ({
  page,
  browser,
}, testInfo) => {
  const index = knownSlides().findIndex(
    (slide) => slide.title === "Lungs in motion",
  );
  expect(index, "the module has its self-hosted video slide").toBeGreaterThan(
    -1,
  );

  const username = freshUsername("video", testInfo.project.name);
  await makeLearner(browser, username, "teaching_delegate");
  await signIn(page, username);

  // Granted first, then fetched from where the grant says, on Quill's
  // own origin: never YouTube.
  const granted = page.waitForResponse((response) =>
    response.url().includes(`/teaching/modules/${MODULE_ID}/video-access`),
  );
  // The 720p rendition the seed wrote as the transcode job would: the
  // stack runs the jobs' gate, so a transcoded video plays from it.
  // Watched as a request, and its answer fetched again by the test:
  // WebKit on Linux hands video to its own media pipeline, and the
  // response Playwright sees for it there has status 0.
  const asked = page.waitForRequest((request) =>
    request.url().endsWith("-720p.mp4"),
  );
  await page.goto(`/teaching/learn/${MODULE_ID}/slide/${index}`);
  expect((await granted).status()).toBe(200);
  const address = (await asked).url();
  expect(new URL(address).origin).toBe(new URL(page.url()).origin);
  const file = await page.request.get(address, {
    headers: { Range: "bytes=0-1023" },
  });
  expect([200, 206]).toContain(file.status());
  expect(file.headers()["content-type"]).toContain("video/mp4");

  // Quill's player starts it, its clock moves, and it plays to the end.
  const player = page.getByRole("group", { name: "Media player" });
  await player.getByRole("button", { name: "Play" }).click();
  await expect(player.getByRole("button", { name: "Pause" })).toBeVisible({
    timeout: 15_000,
  });
  const video = player.locator("video");
  await expect
    .poll(
      () => video.evaluate((element: HTMLVideoElement) => element.currentTime),
      {
        timeout: 15_000,
      },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.ended), {
      timeout: 30_000,
    })
    .toBe(true);
});
