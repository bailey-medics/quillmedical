/**
 * Email mock-up themes
 *
 * The colours, fonts and header of each brand's email, copied by hand for
 * the design phase of the email branding plan. Phase 2 of the plan moves
 * these into `shared/brand.yaml` once the design is signed off.
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
  /** Page behind the card */
  background: string;
  card: string;
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
function googleFonts(families: [name: string, axes: string][]): string {
  const params = families.map(
    ([name, axes]) => `family=${name.replaceAll(" ", "+")}:${axes}`,
  );
  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap`;
}

export const emailThemes: Record<EmailThemeName, EmailTheme> = {
  quill: {
    senderName: "Quill Medical",
    fontLink: googleFonts([
      ["Atkinson Hyperlegible Next", "wght@400;700"],
      ["Cormorant Garamond", "ital,wght@0,700;1,700"],
    ]),
    fontFamily: "'Atkinson Hyperlegible Next', Arial, sans-serif",
    // As PublicTitle; Gmail and Outlook fall back to Georgia
    headingFontFamily: "'Cormorant Garamond', Georgia, serif",
    headingWeight: 700,
    // Cormorant Garamond runs small, so a step up from the app's h1 and
    // h3, as the site's own 2.5rem titles are
    h1Size: "40px",
    h2Size: "30px",
    // secondary.6, 3.8:1 on white. The site's secondary.5 is 2.7:1 on
    // white, fine on the site's navy but too faint here.
    headingAccent: "#a87b2f",
    background: "#f1f3f5",
    card: "#ffffff",
    border: "#dee2e6",
    // Brand navy, primary.8
    header: "#001a36",
    // Brand amber, secondary.5
    headerRule: "4px solid #c8963e",
    headerContent:
      '<img src="/email/quill-wordmark.png" width="240" height="40" alt="Quill Medical" style="width: 240px; height: 40px" />',
    heading: "#001a36",
    text: "#212b36",
    // grey.7, 8.2:1 on white
    muted: "#495057",
    // primary.4, 6.9:1 on white
    link: "#245d8f",
    // As PublicButton: amber with --button-text-dark (brand navy), 6.6:1.
    // White on amber would be 2.7:1.
    buttonBackground: "#c8963e",
    buttonText: "#001a36",
    // Mantine 9's default radius, md
    buttonRadius: "8px",
    // As PublicInfoCard: primary.7 with amber at 20%, blended onto it
    panel: "#042340",
    panelBorder: "#2b3a40",
    // gray.0, 15:1; amber links 6.0:1
    panelText: "#f8f9fa",
    panelHeading: "#f8f9fa",
    panelLink: "#c8963e",
    // As PublicFooter: brand navy with a 10% white rule
    footerBackground: "#001a36",
    footerRule: "1px solid #1a314a",
    // gray.4, 11.7:1
    footerText: "#ced4da",
    footerLink: "#ffffff",
    newsletterReason:
      "You are receiving this because you asked to hear from Quill Medical.",
    // primary.9
    darkBackground: "#000d1f",
    // primary.7
    darkCard: "#042340",
    darkHeader: "#001a36",
    // primary.6
    darkBorder: "#0a2f56",
    darkText: "#e9ecef",
    // primary.1, 7.4:1 on the card navy
    darkMuted: "#93b4d9",
    darkLink: "#93b4d9",
    // primary.6, so the panel still stands off the dark card
    darkPanel: "#0a2f56",
    darkFooter: "#001a36",
  },
  ldd: {
    senderName: "Let's Do Digital",
    fontLink:
      "https://fonts.googleapis.com/css2?family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap",
    fontFamily: "'Source Sans 3', 'Source Sans Pro', Arial, sans-serif",
    headingFontFamily: "'Source Sans 3', 'Source Sans Pro', Arial, sans-serif",
    // The site sets its headings at 400
    headingWeight: 400,
    h1Size: "32px",
    h2Size: "24px",
    headingAccent: "#0848a9",
    background: "#f8f9fa",
    card: "#ffffff",
    border: "#dee2e6",
    header: "#ffffff",
    headerRule: "1px solid #dee2e6",
    headerContent:
      '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="padding-right: 14px"><img src="/email/ldd-logo.png" width="56" height="56" alt="" style="width: 56px; height: 56px" /></td>' +
      "<td class=\"em-text\" style=\"font-family: 'Source Sans 3', 'Source Sans Pro', Arial, sans-serif; font-size: 24px; color: #343a40\">Let’s Do Digital</td>" +
      "</tr></table>",
    heading: "#343a40",
    text: "#343a40",
    // 5.8:1 on the footer grey
    muted: "#5c636a",
    // The logo's blue, 8.4:1 on white. The site's #2780e3 is 4.0:1.
    link: "#0848a9",
    buttonBackground: "#0848a9",
    buttonText: "#ffffff",
    // Bootstrap's default, as the site's buttons
    buttonRadius: "6px",
    panel: "#f1f5fc",
    panelBorder: "#dee2e6",
    panelText: "#343a40",
    panelHeading: "#343a40",
    panelLink: "#0848a9",
    footerBackground: "#f8f9fa",
    footerRule: "1px solid #dee2e6",
    footerText: "#5c636a",
    footerLink: "#5c636a",
    newsletterReason:
      "You are receiving this because you came to a Let’s Do Digital event.",
    // The site's own dark mode
    darkBackground: "#212529",
    darkCard: "#2b3035",
    darkHeader: "#2b3035",
    darkBorder: "#495057",
    darkText: "#dee2e6",
    darkMuted: "#adb5bd",
    darkLink: "#6ea8fe",
    darkPanel: "#343a40",
    darkFooter: "#212529",
  },
};
