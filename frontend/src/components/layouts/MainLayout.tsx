import type { Patient } from "@/domains/patient";
import NavigationDrawer from "@components/drawers/NavigationDrawer";
import SideNav from "@components/navigation/SideNav";
import TopRibbon from "@components/ribbon/TopRibbon";
import { AppShell, useMantineTheme } from "@mantine/core";
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

  const HEADER_H = 88;
  const DRAWER_W = 260;

  return (
    <AppShell header={{ height: HEADER_H }} padding={0} withBorder={false}>
      <AppShell.Header>
        <TopRibbon
          onBurgerClick={toggle}
          isLoading={isLoading}
          patient={patient}
          navOpen={opened}
          isNarrow={isSm}
        />
      </AppShell.Header>

      <AppShell.Main
        style={{
          height: `calc(100vh - ${HEADER_H}px)`,
          overflow: "hidden",
        }}
      >
        <NavigationDrawer
          opened={opened}
          onClose={close}
          topOffset={HEADER_H}
          width={DRAWER_W}
        >
          <div style={{ width: DRAWER_W }}>
            <SideNav showSearch={isSm} onNavigate={close} />
          </div>
        </NavigationDrawer>

        <div style={{ display: "flex", height: "100%" }}>
          {!isSm && (
            <div
              style={{
                borderRight: "1px solid #e0e0e0",
                height: "100%",
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              <SideNav showSearch={false} showIcons={true} />
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
            {children}
          </div>
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
