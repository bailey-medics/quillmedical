/**
 * The guides' one lazy chunk: every page routed under `/guides` in
 * `routes.tsx`, and with them the words of every guide.
 *
 * The routes all load this module through `loadGuides` in
 * `featureChunks.ts`: one download on the way in and none after. Each
 * page file still exports `Component`, which is what its tests import. A
 * page added to the guides is exported from here, never given a `lazy` of
 * its own.
 */

export { Component as GuidePage } from "./GuidePage";
export { Component as GuidesPage } from "./GuidesPage";
