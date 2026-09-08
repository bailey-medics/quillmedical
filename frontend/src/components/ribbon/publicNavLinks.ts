export type NavIconName = "teaching" | "book" | "pricing" | "database" | "mail";

export interface PublicNavLink {
  label: string;
  href: string;
  icon: NavIconName;
  disabled?: boolean;
}

/** Navigation links shared between the top ribbon and mobile drawer. */
const publicNavLinks: PublicNavLink[] = [
  {
    label: "Teaching",
    href: "https://teaching.quill-medical.com",
    icon: "teaching",
  },
  { label: "About", href: "/about", icon: "book" },
  { label: "Pricing", href: "/pricing", icon: "pricing" },
  { label: "EPR", href: "#", icon: "database", disabled: true },
  { label: "Contact", href: "/contact", icon: "mail" },
];

export default publicNavLinks;
