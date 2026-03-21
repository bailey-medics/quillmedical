export type NavIconName = "teaching" | "book" | "pricing" | "database" | "mail";

export interface PublicNavLink {
  label: string;
  href: string;
  icon: NavIconName;
}

/** Navigation links shared between the top ribbon and mobile drawer. */
const publicNavLinks: PublicNavLink[] = [
  {
    label: "Teaching",
    href: "https://teaching.quill-medical.com",
    icon: "teaching",
  },
  { label: "About", href: "/about.html", icon: "book" },
  { label: "Pricing", href: "/pricing.html", icon: "pricing" },
  { label: "EPR", href: "https://staging.quill-medical.com", icon: "database" },
  { label: "Contact", href: "/contact.html", icon: "mail" },
];

export default publicNavLinks;
