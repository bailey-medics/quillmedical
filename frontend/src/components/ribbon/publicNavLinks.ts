export interface PublicNavLink {
  label: string;
  href: string;
}

/** Navigation links shared between the top ribbon and mobile drawer. */
const publicNavLinks: PublicNavLink[] = [
  { label: "Teaching", href: "/clinical-teaching" },
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing" },
  { label: "EPR", href: "https://staging.quill-medical.com" },
  { label: "Contact", href: "/contact" },
];

export default publicNavLinks;
