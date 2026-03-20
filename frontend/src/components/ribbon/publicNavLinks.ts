export interface PublicNavLink {
  label: string;
  href: string;
}

/** Navigation links shared between the top ribbon and mobile drawer. */
const publicNavLinks: PublicNavLink[] = [
  { label: "Teaching", href: "https://teaching.quill-medical.com" },
  { label: "About", href: "/about.html" },
  { label: "Pricing", href: "/pricing.html" },
  { label: "EPR", href: "https://staging.quill-medical.com" },
  { label: "Contact", href: "/contact.html" },
];

export default publicNavLinks;
