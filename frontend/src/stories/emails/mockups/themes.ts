/**
 * Email mock-up themes
 *
 * The colours, fonts and header of each brand's email, read from
 * `shared/brand.yaml`, which the backend's email renderer reads too. The
 * reasons for each value are noted there.
 *
 * Quill's email follows the public site (`public_pages/`) more than the
 * app: navy header and footer, Cormorant Garamond headings with amber
 * italic accents, navy callout panels like `PublicInfoCard`, and the
 * `PublicButton` amber button. The one deliberate difference is a white
 * body, where the site is navy throughout. Let's Do Digital's values come
 * from letsdodigital.org.
 *
 * Every colour pair used for text has been checked against WCAG AA:
 * 4.5:1 for body text, 3:1 for headings, which are all large text.
 */

import brand from "@/generated/brand.json";
import { resolveColour } from "@/lib/brand/brandPalette";

export type EmailThemeName = "quill" | "ldd";

export interface EmailTheme {
  /** Display name, used for the inbox preview's sender */
  senderName: string;
  /** Stylesheet URL for the theme's web fonts */
  fontLink: string;
  /** Body font stack; Gmail and Outlook fall back to Arial */
  fontFamily: string;
  /** Heading font stack */
  headingFontFamily: string;
  headingWeight: number;
  h1Size: string;
  h2Size: string;
  /** Colour for `*accented*` words in a heading, set in italic */
  headingAccent: string;
  /**
   * Page behind the card. White, not grey: webmail readers such as
   * Proton and Gmail on the web put their own white margin round an
   * email, and a grey page then shows as a grey box inside a white frame.
   * On white, the card's border and navy bands carry the edge instead.
   */
  background: string;
  card: string;
  /**
   * The card's outline. On a white page it is the only edge the card
   * has between the navy bands, so it is a step darker than `border`.
   */
  cardBorder: string;
  border: string;
  header: string;
  /** CSS `border-bottom` value under the header band */
  headerRule: string;
  /** Header band content: logo, and name where the logo lacks one */
  headerContent: string;
  heading: string;
  text: string;
  muted: string;
  link: string;
  buttonBackground: string;
  buttonText: string;
  buttonRadius: string;
  /** Callout panel for asides and newsletter sections */
  panel: string;
  panelBorder: string;
  panelText: string;
  panelHeading: string;
  panelLink: string;
  footerBackground: string;
  /** CSS `border-top` value above the footer */
  footerRule: string;
  footerText: string;
  footerLink: string;
  /** Mark's newsletter avatar: the brand's logo in a circle, as one image */
  avatarImage: string;
  /** Why the recipient is on the mailing list, for the newsletter footer */
  newsletterReason: string;
  darkBackground: string;
  darkCard: string;
  darkHeader: string;
  darkBorder: string;
  darkText: string;
  darkMuted: string;
  darkLink: string;
  darkPanel: string;
  darkFooter: string;
}

/**
 * A Google Fonts stylesheet URL for several families at once.
 *
 * Built from parts because the finished URL, written out as one string,
 * is long and varied enough for the no-secrets lint rule to take it for
 * a key.
 */
function googleFonts(families: { family: string; axes: string }[]): string {
  const params = families.map(
    ({ family, axes }) => `family=${family.replaceAll(" ", "+")}:${axes}`,
  );
  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap`;
}

type EmailThemeSource = (typeof brand.email_themes)[EmailThemeName];

/**
 * The header band's content: the logo, and the name beside it where the
 * logo has no words of its own.
 */
function headerContent(source: EmailThemeSource, text: string): string {
  const logo = source.header_logo;
  const image =
    `<img src="${logo.src}" width="${logo.width}" height="${logo.height}" ` +
    `alt="${logo.alt}" style="width: ${logo.width}px; ` +
    `height: ${logo.height}px" />`;
  if (!source.header_name) {
    return image;
  }
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="padding-right: 14px">${image}</td>` +
    `<td class="em-text" style="font-family: ${source.font_family}; ` +
    `font-size: 24px; color: ${text}">${source.header_name}</td>` +
    `</tr></table>`
  );
}

/** Turn one theme from shared/brand.yaml into the values the layout uses. */
function toEmailTheme(source: EmailThemeSource): EmailTheme {
  const c = resolveColour;
  return {
    senderName: source.sender_name,
    fontLink: googleFonts(source.fonts),
    fontFamily: source.font_family,
    headingFontFamily: source.heading_font_family,
    headingWeight: source.heading_weight,
    h1Size: source.h1_size,
    h2Size: source.h2_size,
    headingAccent: c(source.heading_accent),
    background: c(source.background),
    card: c(source.card),
    cardBorder: c(source.card_border),
    border: c(source.border),
    header: c(source.header),
    headerRule: `${source.header_rule_width} solid ${c(source.header_rule)}`,
    headerContent: headerContent(source, c(source.heading)),
    heading: c(source.heading),
    text: c(source.text),
    muted: c(source.muted),
    link: c(source.link),
    buttonBackground: c(source.button_background),
    buttonText: c(source.button_text),
    buttonRadius: source.button_radius,
    panel: c(source.panel),
    panelBorder: c(source.panel_border),
    panelText: c(source.panel_text),
    panelHeading: c(source.panel_heading),
    panelLink: c(source.panel_link),
    footerBackground: c(source.footer_background),
    footerRule: `1px solid ${c(source.footer_rule)}`,
    footerText: c(source.footer_text),
    footerLink: c(source.footer_link),
    avatarImage: source.avatar,
    newsletterReason: source.newsletter_reason,
    darkBackground: c(source.dark.background),
    darkCard: c(source.dark.card),
    darkHeader: c(source.dark.header),
    darkBorder: c(source.dark.border),
    darkText: c(source.dark.text),
    darkMuted: c(source.dark.muted),
    darkLink: c(source.dark.link),
    darkPanel: c(source.dark.panel),
    darkFooter: c(source.dark.footer),
  };
}

export const emailThemes: Record<EmailThemeName, EmailTheme> = {
  quill: toEmailTheme(brand.email_themes.quill),
  ldd: toEmailTheme(brand.email_themes.ldd),
};
