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
    title: "Product",
    links: [
      { label: "Features", link: "/features" },
      { label: "Pricing", link: "#" },
      { label: "Security", link: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", link: "#" },
      { label: "Contact", link: "#" },
      { label: "Careers", link: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", link: "#" },
      { label: "Terms of service", link: "#" },
      { label: "Cookie policy", link: "#" },
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
              style={{ height: "1.5rem" }}
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
              href="mailto:Email address coming soon"
              size="sm"
              underline="hover"
              c="dimmed"
            >
              Email address coming soon
            </Anchor>
          </Group>
        </Container>
      </footer>
    </MantineProvider>
  );
}
