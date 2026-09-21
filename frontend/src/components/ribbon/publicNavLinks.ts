export type NavIconName = "teaching" | "book" | "pricing" | "database" | "mail";

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
 */
const publicNavLinks: PublicNavLink[] = [
  { label: "About", href: "/about", icon: "book" },
  { label: "Pricing", href: "/pricing", icon: "pricing" },
  { label: "Contact", href: "/contact", icon: "mail" },
];

/** Where "Log in" sends a visitor: the application, not a public page. */
export const LOGIN_URL = "https://app.quill-medical.com";

export default publicNavLinks;
