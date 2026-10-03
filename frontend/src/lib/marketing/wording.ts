/**
 * The marketing question, as it is put to somebody registering.
 *
 * One copy, so every form that asks it asks the same thing. Registration
 * is an opt-out: the sentence says news will be sent, and the box is how
 * to refuse. The box is never pre-ticked.
 *
 * If these words change, bump `MARKETING_WORDING_VERSION` in
 * `backend/app/marketing/preferences.py`: each recorded answer names the
 * wording that was on screen when it was given.
 */

/** What the box does when ticked. */
export const MARKETING_OPT_OUT_LABEL =
  "I would rather not get news and updates";

/** What happens if it is left alone. */
export const MARKETING_OPT_OUT_DESCRIPTION =
  "We'll email you news and updates about Quill Medical from time to time. Tick this box if you would rather not get them.";
