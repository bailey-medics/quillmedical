export type NavIconName =
  | "teaching"
  | "learning"
  | "assessments"
  | "educators"
  | "book"
  | "pricing"
  | "database"
  | "mail";

export interface PublicNavLink {
  label: string;
  href: string;
  icon: NavIconName;
  disabled?: boolean;
}

/**
 * Navigation links shared between the top ribbon and mobile drawer.
 *
 * These are pages of the public site. The way in to the application is not
 * one of them: it is a "Log in" action, rendered on the right of the ribbon
 * rather than among the links, because it goes somewhere else entirely and
 * is what a returning visitor is looking for.
 *
 * Four links, the product pages first. About and Pricing live in the
 * footer: five links and "Log in" do not fit on one line between the
 * `sm` breakpoint, where the ribbon replaces the burger, and a tablet held
 * upright, and the ribbon wraps onto a second line.
 */
const publicNavLinks: PublicNavLink[] = [
  { label: "Learning", href: "/learning", icon: "learning" },
  { label: "Assessments", href: "/assessments", icon: "assessments" },
  { label: "For educators", href: "/for-educators", icon: "educators" },
  { label: "Contact", href: "/contact", icon: "mail" },
];

/** Where "Log in" sends a visitor: the application, not a public page. */
export const LOGIN_URL = "https://app.quill-medical.com";

export default publicNavLinks;
