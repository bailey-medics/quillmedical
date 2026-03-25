import "@/styles/colours.css";
import NavigationDrawer from "@/components/drawers/NavigationDrawer";
import PublicFooter from "@/components/footer/PublicFooter";
import PublicNavIcon from "@/components/icons/PublicNavIcon";
import { colours } from "@/styles/colours";
import publicNavLinks from "@/components/ribbon/publicNavLinks";
import PublicTopRibbon from "@/components/ribbon/PublicTopRibbon";
import { Box, Flex, NavLink, Stack, useMantineTheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";

interface PublicLayoutProps {
  /** Page content */
  children: ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const theme = useMantineTheme();
  const isNarrow = useMediaQuery(
    `(max-width: ${theme.breakpoints.sm})`,
    undefined,
    {
      getInitialValueInEffect: false,
    },
  );
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <Stack gap={0} style={{ minHeight: "100dvh", background: colours.navy }}>
      <Box component="header">
        <PublicTopRibbon
          isNarrow={isNarrow}
          navOpen={opened}
          onBurgerClick={toggle}
        />
      </Box>

      <Flex flex={1} style={{ overflow: "hidden", position: "relative" }}>
        <NavigationDrawer opened={opened} onClose={close}>
          <Stack component="nav" gap="xs" aria-label="Primary">
            <NavLink
              label="Home"
              href="/"
              component="a"
              onClick={close}
              leftSection={<PublicNavIcon name="home" />}
              style={{ fontSize: "1.25rem" }}
              styles={{ label: { fontSize: "1.25rem" } }}
            />
            {publicNavLinks.map((link) => (
              <NavLink
                key={link.label}
                label={link.label}
                href={link.href}
                component="a"
                onClick={close}
                leftSection={<PublicNavIcon name={link.icon} />}
                style={{
                  fontSize: "1.25rem",
                }}
                styles={{
                  label: { fontSize: "1.25rem" },
                }}
              />
            ))}
          </Stack>
        </NavigationDrawer>

        <Box component="main" flex={1} style={{ overflowY: "auto" }}>
          {children}
        </Box>
      </Flex>

      <PublicFooter />
    </Stack>
  );
}
