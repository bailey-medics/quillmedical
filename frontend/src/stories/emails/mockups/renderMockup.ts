/**
 * Render an email mock-up to a complete HTML document
 *
 * Fills `base.html`'s `{{placeholders}}` from a theme and an email. This is
 * the design-phase stand-in for the Jinja2 renderer in Phase 3 of the email
 * branding plan: same base layout, same slots, so the approved mock-up can
 * move across as it is.
 */

import baseHtml from "./base.html?raw";
import { emailMockups, type EmailMockupName } from "./content";
import { emailThemes, type EmailThemeName } from "./themes";

export interface RenderOptions {
  /** Show the partner's logo in the partner strip, where there is one */
  partnerLogo?: boolean;
  /**
   * Force the dark scheme. Rewrites the `prefers-color-scheme: dark` media
   * query to always apply, so the preview does not depend on the viewer's
   * own setting.
   */
  dark?: boolean;
}

export interface RenderedMockup {
  subject: string;
  preheader: string;
  senderName: string;
  replyTo?: string;
  html: string;
}

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export function renderMockup(
  themeName: EmailThemeName,
  emailName: EmailMockupName,
  options: RenderOptions = {},
): RenderedMockup {
  const theme = emailThemes[themeName];
  const email = emailMockups[emailName](theme, {
    partnerLogo: options.partnerLogo ?? true,
  });

  const values: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(theme).map(([key, value]) => [key, String(value)]),
    ),
    subject: email.subject,
    preheader: email.preheader,
    body: email.body,
    footer: email.footer,
    partnerStrip: email.partnerStrip ?? "",
  };

  let html = baseHtml.replace(PLACEHOLDER, (match: string, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`Email mock-up has no value for ${match}`);
    }
    return value;
  });

  if (options.dark) {
    html = html.replace("@media (prefers-color-scheme: dark)", "@media all");
  }

  return {
    subject: email.subject,
    preheader: email.preheader,
    senderName: email.senderName ?? theme.senderName,
    replyTo: email.replyTo,
    html,
  };
}
