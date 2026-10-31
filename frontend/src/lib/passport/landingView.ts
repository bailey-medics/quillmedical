/**
 * Which view the passport home page opens in.
 */

import type { LandingView, Passport } from "./types";

/** The ways the passport home page can lay out the record, in order. */
export const LANDING_VIEWS: readonly LandingView[] = [
  "by_competency",
  "by_record",
];

/**
 * The view a passport opens in: its holder's choice, or By competency
 * when the response does not say, as the server defaults it.
 */
export function landingViewOf(
  passport: Pick<Passport, "landing_view">,
): LandingView {
  return passport.landing_view ?? "by_competency";
}
