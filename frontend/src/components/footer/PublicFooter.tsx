import { Anchor, Container, Group, MantineProvider, Text } from "@mantine/core";
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
      { label: "Messaging", link: "/clinical-messaging.html" },
      { label: "Records", link: "/structured-records.html" },
      { label: "Modules", link: "/modular-deployment.html" },
      { label: "Access", link: "/competency-access.html" },
      { label: "Referrals", link: "/external-referrals.html" },
      { label: "Teaching", link: "/clinical-teaching.html" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", link: "/about.html" },
      { label: "Contact", link: "/contact.html" },
      { label: "Careers", link: "/careers.html" },
      { label: "Information", link: "/company-information.html" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", link: "/privacy-policy.html" },
      { label: "Terms of service", link: "/terms-of-service.html" },
      { label: "Cookie policy", link: "/cookie-policy.html" },
    ],
  },
];

export default function PublicFooter() {
  const groups = data.map((group) => {
    const links = group.links.map((link) => (
      <a key={link.label} className={classes.link} href={link.link}>
        {link.label}
      </a>
    ));

    return (
      <div className={classes.wrapper} key={group.title}>
        <div className={classes.title}>{group.title}</div>
        {links}
      </div>
    );
  });

  return (
    <MantineProvider forceColorScheme="dark">
      <footer className={classes.footer}>
        <Container className={classes.inner} size="lg">
          <div className={classes.logo}>
            <img
              src="/quill-name-long-white-amber.png"
              alt="Quill Medical"
              className={classes.logoImage}
            />
            <Text size="xs" c="dimmed">
              A modern, secure platform for patients and clinics to communicate
              seamlessly.
            </Text>
          </div>
          <div className={classes.groups}>{groups}</div>
        </Container>
        <Container className={classes.afterFooter} size="lg">
          <Text size="sm" c="dimmed">
            © {new Date().getFullYear()} Quill Medical. All rights reserved.
          </Text>
          <Group gap="xs" className={classes.social} justify="flex-end">
            <Anchor
              href="mailto:info@quill-medical.com"
              size="sm"
              underline="hover"
              c="dimmed"
            >
              info@quill-medical.com
            </Anchor>
          </Group>
        </Container>
      </footer>
    </MantineProvider>
  );
}
