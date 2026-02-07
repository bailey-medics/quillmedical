import type { Patient } from "@/domains/patient";
import NavigationDrawer from "@components/drawers/NavigationDrawer";
import SideNav from "@components/navigation/SideNav";
import TopRibbon from "@components/ribbon/TopRibbon";
import { Box, Flex, Skeleton, Stack, useMantineTheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";

type Props = {
  patient: Patient | null;
  isLoading?: boolean;
  children?: ReactNode;
};

export default function MainLayout({
  patient,
  isLoading = false,
  children,
}: Props) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const theme = useMantineTheme();
  const isSm = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const DRAWER_W = 260;

  return (
    <Flex
      direction="column"
      h="100dvh"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <Box
        component="header"
        pos="sticky"
        top={0}
        bg="white"
        style={{
          zIndex: 100,
          borderBottom: `1px solid ${theme.colors.gray[2]}`,
          flexShrink: 0,
        }}
      >
        <TopRibbon
          onBurgerClick={toggle}
          isLoading={isLoading}
          patient={patient}
          navOpen={opened}
          isNarrow={isSm}
        />
      </Box>

      <Flex flex={1} style={{ overflow: "hidden" }}>
        <NavigationDrawer
          opened={opened}
          onClose={close}
          topOffset={0}
          width={DRAWER_W}
        >
          <div style={{ width: DRAWER_W }}>
            <SideNav showSearch={isSm} onNavigate={close} />
          </div>
        </NavigationDrawer>

        <Flex style={{ flex: 1, height: "100%" }}>
          {!isSm && (
            <Box
              component="aside"
              style={{
                borderRight: `1px solid ${theme.colors.gray[2]}`,
                height: "100%",
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              <SideNav showSearch={false} showIcons={true} />
            </Box>
          )}
          <Box component="main" flex={1} style={{ overflowY: "auto" }} p="md">
            {isLoading ? (
              <Stack gap="md">
                <Skeleton height={50} radius="md" />
                <Skeleton height={200} radius="md" />
                <Skeleton height={150} radius="md" />
                <Skeleton height={100} radius="md" />
              </Stack>
            ) : (
              children
            )}
          </Box>
        </Flex>
      </Flex>
    </Flex>
  );
}
