/**
 * Email mock-up content
 *
 * Three emails chosen to stretch the base layout in different directions:
 * a short transactional message with one button, a cold invitation to
 * somebody who has never heard of Quill, and a long newsletter. Wording
 * for the first two follows what the backend sends today.
 *
 * Each builder takes a theme, because buttons, panels and headings carry
 * the theme's colours inline: email clients ignore stylesheets often
 * enough that inline is the only thing to rely on.
 */

import type { EmailTheme } from "./themes";

export type EmailMockupName =
  "passwordReset" | "passportInvite" | "certificate" | "newsletter";

export interface EmailMockup {
  subject: string;
  /** The line an inbox shows after the subject */
  preheader: string;
  /** Overrides the theme's sender name in the inbox preview */
  senderName?: string;
  /** Where a reply goes, when it is not the sender */
  replyTo?: string;
  /** The partner strip under the header, for emails sent for a partner */
  partnerStrip?: string;
  body: string;
  footer: string;
}

export interface MockupOptions {
  /** Show the partner's logo; without it the strip shows their name */
  partnerLogo: boolean;
}

/** A partner Quill runs an assessment or course for. */
interface Partner {
  name: string;
  /** For the sender line: "EoEETA via Quill Medical" */
  shortName: string;
  /** What the email is about, in the partner's words */
  context: string;
  replyTo: string;
  /** The logo at its display size; the file is 2x */
  logo: { src: string; width: number; height: number };
}

const EOEETA: Partner = {
  name: "East of England Endoscopy Training Academy",
  shortName: "EoEETA",
  context: "Optical diagnosis accreditation",
  replyTo: "coordinator@eoeeta.example",
  logo: { src: "/email/partners/eoeeta-email.png", width: 162, height: 72 },
};

/**
 * The partner strip: a white band under the header naming who the email
 * is for. White because most partners' logos are drawn for white, and
 * would vanish on the navy header. With no logo, the name stands in.
 *
 * It stays white in dark mode too: partners' logos have transparent
 * backgrounds drawn for white, and would be lost on a dark card.
 */
function partnerStrip(t: EmailTheme, p: Partner, withLogo: boolean): string {
  // The logo carries the partner's name, so its alt text does too
  const mark = withLogo
    ? // Nudged in 8px: the logo's own lettering starts flush with the
      // image edge, and looked further left than the body text below
      `<td style="padding: 0 24px 0 8px; vertical-align: middle">` +
      `<img src="${p.logo.src}" width="${p.logo.width}" ` +
      `height="${p.logo.height}" alt="${p.name}" ` +
      `style="width: ${p.logo.width}px; height: ${p.logo.height}px" /></td>`
    : "";
  const words = withLogo
    ? `<p style="margin: 0">${p.context}</p>`
    : `<p style="margin: 0; font-weight: 700; color: ${t.heading}">` +
      `${p.name}</p><p style="margin: 0">${p.context}</p>`;
  return (
    `<tr><td class="em-pad" style="padding: 20px 40px; ` +
    `background-color: #ffffff; border-bottom: 1px solid ${t.border}">` +
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    mark +
    `<td style="vertical-align: middle; ` +
    `font-family: ${t.fontFamily}; font-size: 19px; line-height: 1.4; ` +
    `color: ${t.muted}">${words}</td>` +
    `</tr></table></td></tr>`
  );
}

/**
 * Words wrapped in `*asterisks*` become italic in the theme's accent
 * colour, as `PublicTitle` does on the public site.
 */
function accented(t: EmailTheme, text: string): string {
  return text.replace(
    /\*([^*]+)\*/g,
    `<em style="font-style: italic; color: ${t.headingAccent}">$1</em>`,
  );
}

function heading(t: EmailTheme, text: string): string {
  return (
    `<h1 style="margin: 0 0 20px; font-family: ${t.headingFontFamily}; ` +
    `font-size: ${t.h1Size}; line-height: 1.2; ` +
    `font-weight: ${t.headingWeight}; color: ${t.heading}">` +
    `${accented(t, text)}</h1>`
  );
}

function subheading(
  t: EmailTheme,
  text: string,
  colour: string = t.heading,
): string {
  return (
    `<h2 style="margin: 0 0 8px; font-family: ${t.headingFontFamily}; ` +
    `font-size: ${t.h2Size}; line-height: 1.25; ` +
    `font-weight: ${t.headingWeight}; color: ${colour}">` +
    `${accented(t, text)}</h2>`
  );
}

function paragraph(text: string): string {
  return `<p style="margin: 0 0 16px">${text}</p>`;
}

function small(t: EmailTheme, text: string): string {
  return (
    `<p class="em-muted" style="margin: 0 0 12px; font-size: 19px; ` +
    `color: ${t.muted}">${text}</p>`
  );
}

/**
 * A "bulletproof" button: a table cell carrying the colour, so Outlook,
 * which ignores padding on links, still draws a filled button.
 */
function button(t: EmailTheme, label: string, href: string): string {
  return (
    `<table role="presentation" class="em-button" cellpadding="0" ` +
    `cellspacing="0" style="margin: 8px 0 24px; border-collapse: separate">` +
    `<tr><td style="border-radius: ${t.buttonRadius}; ` +
    `background-color: ${t.buttonBackground}">` +
    `<a href="${href}" class="em-button-link" style="display: inline-block; ` +
    `padding: 12px 22px; ` +
    `font-family: ${t.fontFamily}; font-size: 19px; font-weight: 600; ` +
    `line-height: 1; color: ${t.buttonText}; text-decoration: none; ` +
    `border-radius: ${t.buttonRadius}; text-align: center">${label}</a>` +
    `</td></tr></table>`
  );
}

/** A callout, drawn like the public site's `PublicInfoCard`. */
function panel(t: EmailTheme, inner: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" ` +
    // Separate borders, or the base stylesheet's collapse squares the corners
    `cellspacing="0" style="margin: 8px 0 24px; border-collapse: separate">` +
    `<tr><td class="em-panel" style="padding: 24px 28px; border-radius: 8px; ` +
    `border: 1px solid ${t.panelBorder}; background-color: ${t.panel}; ` +
    `color: ${t.panelText}">${inner}</td></tr></table>`
  );
}

function tradingLine(t: EmailTheme): string {
  return `${t.senderName} is a trading name of Bailey Medics Ltd.`;
}

function transactionalFooter(t: EmailTheme, reason: string): string {
  return (
    `<p style="margin: 0 0 8px">${reason}</p>` +
    `<p style="margin: 0">${tradingLine(t)}</p>`
  );
}

const RESET_URL = "https://quill-medical.com/reset-password?token=example";
const INVITE_URL =
  "https://quill-medical.com/passport/assessors/accept?token=example";

export const emailMockups: Record<
  EmailMockupName,
  (t: EmailTheme, o: MockupOptions) => EmailMockup
> = {
  passwordReset: (t) => ({
    subject: "Reset your Quill password",
    preheader: "The link lasts 30 minutes.",
    body:
      heading(t, "Reset your *password*") +
      paragraph("You requested a password reset for your Quill account.") +
      button(t, "Reset your password", RESET_URL) +
      small(t, "This link expires in 30 minutes.") +
      small(
        t,
        "If you did not ask for this, you can ignore this email. Your " +
          "password will not change.",
      ),
    footer: transactionalFooter(
      t,
      "You are receiving this because a password reset was requested " +
        "for this address on Quill.",
    ),
  }),

  passportInvite: (t) => ({
    subject: "Dr Priya Shah has asked you to assess a competency",
    preheader: "Chest drain insertion, recorded in her clinician passport.",
    body:
      heading(t, "You have been asked to assess a *competency*") +
      paragraph("Dear Dr James Okafor,") +
      paragraph(
        "Dr Priya Shah has asked you to assess <strong>Chest drain " +
          "insertion (Seldinger)</strong> and record the outcome in her " +
          "clinician passport.",
      ) +
      panel(
        t,
        paragraph(
          "A clinician passport is a record of competencies a clinician " +
            "has been assessed as able to perform, signed by the person " +
            "who assessed them.",
        ) +
          `<p style="margin: 0">You will be asked to confirm your ` +
          `professional registration before you sign anything.</p>`,
      ) +
      button(t, "Accept the invitation", INVITE_URL) +
      small(
        t,
        "You can use this link until you accept the invitation. It " +
          "expires in 14 days.",
      ) +
      small(
        t,
        "If you were not expecting this, you can ignore this email and " +
          "nothing will happen.",
      ),
    footer: transactionalFooter(
      t,
      "You are receiving this because Dr Priya Shah entered this address " +
        "when inviting an assessor on Quill.",
    ),
  }),

  certificate: (t, o) => ({
    subject: "Your certificate: optical diagnosis of diminutive polyps",
    preheader: "You passed. Your certificate is attached.",
    senderName: `${EOEETA.shortName} via ${t.senderName}`,
    replyTo: EOEETA.replyTo,
    partnerStrip: partnerStrip(t, EOEETA, o.partnerLogo),
    body:
      heading(t, "Your *certificate*") +
      paragraph("Dear Dr Sam Patel,") +
      paragraph(
        "Congratulations. You have passed the optical diagnosis " +
          "assessment for diminutive colorectal polyps, with a score " +
          "of 92%.",
      ) +
      paragraph(
        "Your certificate is attached as a PDF. Keep it with your " +
          "training records: your accreditation lead may ask to see it.",
      ) +
      button(t, "View your results", "https://app.quill-medical.com") +
      small(
        t,
        `Questions about the assessment go to ${EOEETA.shortName}: reply ` +
          "to this email and it will reach their coordinator.",
      ),
    footer: transactionalFooter(
      t,
      `Sent by ${t.senderName} on behalf of ${EOEETA.name}. You are ` +
        "receiving this because you sat an assessment on Quill.",
    ),
  }),

  newsletter: (t) => ({
    subject: "Autumn update: the clinician passport, and 2027 dates",
    preheader: "What I have been building, and when we meet next.",
    senderName: `Mark at ${t.senderName}`,
    body:
      heading(t, "Autumn *update*") +
      paragraph("Hello,") +
      paragraph(
        "It has been a busy few months. Here is what has changed, and " +
          "what is coming next.",
      ) +
      // Placeholder for a hero image, 1640 by 720 at 2x
      `<table role="presentation" width="100%" cellpadding="0" ` +
      `cellspacing="0" style="margin: 8px 0 24px"><tr>` +
      `<td align="center" style="height: 360px; border-radius: 6px; ` +
      `background-color: ${t.border}; font-family: ${t.fontFamily}; ` +
      `font-size: 19px; color: ${t.muted}">Image, 1640 × 720</td>` +
      `</tr></table>` +
      panel(
        t,
        subheading(t, "The clinician passport is *live*", t.panelHeading) +
          paragraph(
            "Clinicians can now record competencies and ask a colleague " +
              "to sign them off, wherever that colleague works.",
          ) +
          `<p style="margin: 0"><a href="https://quill-medical.com" ` +
          `style="color: ${t.panelLink}; font-weight: 700">Read how it ` +
          `works</a></p>`,
      ) +
      subheading(t, "Let’s Do Digital 2027: save the date") +
      paragraph(
        "The next conference is on Thursday 20 May 2027 in Bristol. " +
          "Talks, workshops and plenty of time to talk to each other.",
      ) +
      button(t, "Register your interest", "https://letsdodigital.org") +
      subheading(t, "One thing to try") +
      paragraph(
        "If your trust has an innovation fund, the deadline is often " +
          "in January. A one-page summary of the problem is usually " +
          "all it takes to start the conversation.",
      ) +
      // Sign-off with Mark's avatar: the brand's logo in a circle, as on
      // his social accounts. The circle is part of the image, because
      // Outlook ignores border-radius and would draw a square.
      `<table role="presentation" cellpadding="0" cellspacing="0" ` +
      `style="margin: 16px 0 0"><tr>` +
      `<td style="padding-right: 16px; vertical-align: middle">` +
      `<img src="${t.avatarImage}" width="56" height="56" alt="" ` +
      `style="width: 56px; height: 56px" /></td>` +
      `<td style="vertical-align: middle">` +
      `<p style="margin: 0; font-weight: 700">Mark Bailey</p>` +
      `<p class="em-muted" style="margin: 0; font-size: 19px; ` +
      `color: ${t.muted}">Bailey Medics</p></td>` +
      `</tr></table>`,
    footer:
      `<p style="margin: 0 0 8px">${t.newsletterReason}</p>` +
      `<p style="margin: 0 0 8px"><a href="#unsubscribe" ` +
      `style="color: ${t.footerLink}; text-decoration: underline">` +
      `Unsubscribe</a> &middot; <a href="#preferences" ` +
      `style="color: ${t.footerLink}; ` +
      `text-decoration: underline">Update your preferences</a></p>` +
      `<p style="margin: 0">${tradingLine(t)} Company number ` +
      `15604352. Brooklands Place, Unit 5, Brooklands Road, Sale, ` +
      `Cheshire, M33 3SD.</p>`,
  }),
};
