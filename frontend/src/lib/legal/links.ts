/**
 * The legal pages, as they are linked from a form that creates an account.
 *
 * One copy, so every form that links them links the same pages in the same
 * words. The pages live on the public site, not in the app, so the
 * addresses are absolute and the same in every environment: the dev stack
 * does not serve the public pages, and the policy somebody reads should be
 * the published one wherever they read it from.
 */

/** The public site, where the legal pages are published. */
const PUBLIC_SITE = "https://quill-medical.com";

/** The terms somebody agrees to by creating an account. */
export const TERMS_OF_SERVICE_URL = `${PUBLIC_SITE}/terms-of-service`;

/** How the terms are named inside a sentence. */
export const TERMS_OF_SERVICE_LABEL = "terms of service";

/** The notice of what is collected at registration, and why. */
export const PRIVACY_POLICY_URL = `${PUBLIC_SITE}/privacy-policy`;

/** How the privacy policy is named inside a sentence. */
export const PRIVACY_POLICY_LABEL = "privacy policy";
