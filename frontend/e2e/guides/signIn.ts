/**
 * Signs in as one of the people `backend/scripts/seed_guides.py` seeds.
 *
 * Each spec signs in as the person its guide is about, so a screenshot
 * shows what that reader would see: an operator's menu is not a
 * delegate's. The names are the script's, kept here so a spec says who it
 * is and not what their username happens to be.
 */

import type { Page } from "@playwright/test";
import { signIn as signInOnTheForm } from "../fixtures/signIn";

/** The seeded accounts. Each password is the username followed by `123`. */
export const PEOPLE = {
  /** Operates Quill: `superadmin`, with `superadmin_profession`. */
  operator: "morgan.reid",
  /** A teaching admin at the organisation. */
  teachingAdmin: "sarah.mitchell",
  /** Takes a module, and has one passed attempt to show its result. */
  learner: "sam.harding",
  /** Holds a passport with something in each of its parts. */
  passportHolder: "maya.collins",
  /** May keep a passport and has not started one. */
  passportStarter: "owen.price",
  /** Named on the holder's sign-off requests, one of them still waiting. */
  passportAssessor: "helen.marsh",
  /** Runs the passport at the organisation. */
  passportAdmin: "alex.turner",
  /** A safety officer, where the safety mock-up is switched on. */
  safetyOfficer: "jo.fletcher",
  /** A delegate who has passed, for the result and its certificate. */
  passedDelegate: "amy.richardson",
} as const;

/** What the seed calls its places, and the clinical lead's address. */
export const SEEDED = {
  organisation: "Northfield Endoscopy Academy",
  site: "Northfield General Hospital",
  clinicalLeadEmail: "thomas.whitfield@northfield.nhs.uk",
} as const;

export async function signIn(
  page: Page,
  username: (typeof PEOPLE)[keyof typeof PEOPLE],
): Promise<void> {
  // The same form and the same waiting-out of the rate limit as the
  // end-to-end tests.
  await signInOnTheForm(page, username);
}
