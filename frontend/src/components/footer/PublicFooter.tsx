/**
 * PublicFooter Component
 *
 * Footer for public-facing pages with grouped navigation links
 * and copyright information.
 */

import { Container, Group } from "@mantine/core";
import PublicBodyText from "@/components/typography/PublicBodyText";
import classes from "./PublicFooter.module.css";

interface FooterLink {
  label: string;
  link: string;
}

interface FooterGroup {
  title: string;
  links: FooterLink[];
}

const data: FooterGroup[] = [
  {
    title: "Features",
    links: [
      { label: "Messaging", link: "/clinical-messaging" },
      { label: "Records", link: "/structured-records" },
      { label: "Modules", link: "/modular-deployment" },
      { label: "Access", link: "/competency-access" },
      { label: "Referrals", link: "/external-referrals" },
      { label: "Teaching", link: "/clinical-teaching" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", link: "/about" },
      { label: "Contact", link: "/contact" },
      { label: "Careers", link: "/careers" },
      { label: "Information", link: "/company-information" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", link: "/privacy-policy" },
      { label: "Terms of service", link: "/terms-of-service" },
      { label: "Cookie policy", link: "/cookie-policy" },
    ],
  },
];

export default function PublicFooter() {
  const groups = data.map((group) => {
    const links = group.links.map((link) => (
      <PublicBodyText key={link.label}>
        <a className={classes.link} href={link.link}>
          {link.label}
        </a>
      </PublicBodyText>
    ));

    return (
      <div className={classes.wrapper} key={group.title}>
        <div className={classes.title}>{group.title}</div>
        {links}
      </div>
    );
  });

  return (
    <footer className={classes.footer}>
      <Container className={classes.inner} size="lg">
        <div className={classes.logo}>
          <img
            src="/quill-name-long-white-amber.png"
            alt="Quill Medical"
            className={classes.logoImage}
          />
          <PublicBodyText>
            A modern, secure platform for patients and clinics to communicate
            seamlessly.
          </PublicBodyText>
        </div>
        <div className={classes.groups}>{groups}</div>
      </Container>
      <Container className={classes.afterFooter} size="lg">
        <PublicBodyText>
          © {new Date().getFullYear()} Quill Medical. All rights reserved.
        </PublicBodyText>
        <Group gap="xs" className={classes.social} justify="flex-end">
          <PublicBodyText>
            <a href="mailto:info@quill-medical.com" className={classes.link}>
              info@quill-medical.com
            </a>
          </PublicBodyText>
        </Group>
      </Container>
    </footer>
  );
}
