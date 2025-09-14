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
    <AppShell header={{ height: HEADER_H }} padding="md" withBorder={false}>
      <AppShell.Header>
        <TopRibbon
          onBurgerClick={toggle}
          isLoading={isLoading}
          patient={patient}
          navOpen={opened}
          isNarrow={isSm}
        />
      </AppShell.Header>

      {/* Inline drawer below the header (works for desktop and narrow widths alike) */}
      <div
        style={{
          position: "relative",
          minHeight: `calc(100vh - ${HEADER_H}px)`,
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

        <AppShell.Main>
          <div style={{ display: "flex", height: "100%" }}>
            {!isSm && (
              <div style={{ borderRight: "1px solid #e0e0e0" }}>
                <SideNav showSearch={false} showIcons={true} />
              </div>
            )}
            {children}
          </div>
        </AppShell.Main>
      </div>
    </AppShell>
  );
}
