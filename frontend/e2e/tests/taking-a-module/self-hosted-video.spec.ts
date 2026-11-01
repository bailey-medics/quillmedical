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

  // The 720p rendition the seed wrote as the transcode job would: the
  // stack runs the jobs' gate, so a transcoded video plays from it. The
  // video element names where it came from: Quill's own origin, never
  // YouTube. The grant itself is the backend's to test:
  // teaching_video_and_media_test.py's
  // `test_a_learner_is_granted_one_module_at_their_own_organisation`.
  await page.goto(`/teaching/learn/${MODULE_ID}/slide/${index}`);

  // Quill's player starts it, its clock moves, and it plays to the end.
  const player = page.getByRole("group", { name: "Media player" });
  await player.getByRole("button", { name: "Play" }).click();
  await expect(player.getByRole("button", { name: "Pause" })).toBeVisible({
    timeout: 15_000,
  });
  const video = player.locator("video");
  const source = await video.evaluate(
    (element: HTMLVideoElement) => element.currentSrc,
  );
  expect(source).toMatch(/-720p\.mp4$/);
  expect(new URL(source).origin).toBe(new URL(page.url()).origin);
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
