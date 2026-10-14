/**
 * Storybook a11y settings for any story that renders `VideoPlayerV10`.
 *
 * Video.js draws the time toggle itself: it shows "0:21" and names it
 * "21 seconds remaining", which axe 4.14 refuses under
 * label-content-name-mismatch. That markup is not ours to change, so
 * only that element is let off that one rule; every other check still
 * runs on it, and the rule still runs on everything else.
 */
export const VIDEOJS_STORY_A11Y = {
  config: {
    rules: [
      {
        id: "label-content-name-mismatch",
        selector: "*:not(.media-time-toggle)",
      },
    ],
  },
};
