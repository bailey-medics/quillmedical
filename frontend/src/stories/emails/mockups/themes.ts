/**
 * Email mock-up themes
 *
 * The colours, fonts and header of each brand's email, copied by hand for
 * the design phase of the email branding plan. Quill's values come from
 * `theme.ts`; Let's Do Digital's from letsdodigital.org. Phase 2 of the
 * plan moves these into `shared/brand.yaml` once the design is signed off.
 *
 * Every colour pair used for text has been checked against WCAG AA
 * (4.5:1 for body text) in both light and dark schemes.
 */

export type EmailThemeName = "quill" | "ldd";

export interface EmailTheme {
  /** Display name, used for the inbox preview's sender */
  senderName: string;
  /** Stylesheet URL for the theme's web font */
  fontLink: string;
  /** Font stack; Gmail and Outlook fall back to Arial */
  fontFamily: string;
  headingWeight: number;
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
  footerBackground: string;
  /** Soft panel for callouts and newsletter sections */
  panel: string;
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
}

export const emailThemes: Record<EmailThemeName, EmailTheme> = {
  quill: {
    senderName: "Quill Medical",
    fontLink:
      "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&display=swap",
    fontFamily: "'Atkinson Hyperlegible Next', Arial, sans-serif",
    headingWeight: 700,
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
    // Navy on amber is 6.6:1; white on amber would be 2.7:1
    buttonBackground: "#c8963e",
    buttonText: "#001a36",
    footerBackground: "#f8f9fa",
    // secondary.0, a warm wash
    panel: "#fdf6ec",
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
    // primary.6
    darkPanel: "#0a2f56",
  },
  ldd: {
    senderName: "Let's Do Digital",
    fontLink:
      "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap",
    fontFamily: "'Source Sans 3', 'Source Sans Pro', Arial, sans-serif",
    // The site sets its headings at 400
    headingWeight: 400,
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
    footerBackground: "#f8f9fa",
    panel: "#f1f5fc",
    newsletterReason:
      "You are receiving this because you came to a Let\u2019s Do Digital event.",
    // The site's own dark mode
    darkBackground: "#212529",
    darkCard: "#2b3035",
    darkHeader: "#2b3035",
    darkBorder: "#495057",
    darkText: "#dee2e6",
    darkMuted: "#adb5bd",
    darkLink: "#6ea8fe",
    darkPanel: "#343a40",
  },
};
