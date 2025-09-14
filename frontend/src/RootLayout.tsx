import { AppShell, useMantineTheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import { useState } from "react";
import { Outlet } from "react-router-dom";

import NavigationDrawer from "./components/drawers/NavigationDrawer";
import SideNav from "./components/navigation/SideNav";
import TopRibbon, { type Patient } from "./components/ribbon/TopRibbon";

export type LayoutCtx = {
  patient: Patient | null;
  setPatient: React.Dispatch<React.SetStateAction<Patient | null>>;
};

export default function RootLayout() {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const [opened, { toggle, close }] = useDisclosure(false);
  const [patient, setPatient] = useState<Patient | null>(null);

  const HEADER_H = 88;
  const DRAWER_W = 260;

  console.log(opened);

  return (
    <>
      <Notifications />
      <AppShell header={{ height: HEADER_H }} padding="md" withBorder={false}>
        <AppShell.Header>
          <TopRibbon
            onBurgerClick={toggle}
            isLoading={false}
            patient={patient}
            navOpen={opened}
            sticky={true}
          />
        </AppShell.Header>
        <NavigationDrawer
          opened={opened}
          onClose={close}
          topOffset={HEADER_H}
          width={DRAWER_W}
        >
          <div style={{ width: DRAWER_W }}>
            <SideNav showSearch={isMobile} onNavigate={close} />
          </div>
        </NavigationDrawer>

        <AppShell.Main>
          <div style={{ display: "flex", height: "100%" }}>
            {!isMobile && (
              <div style={{ borderRight: "1px solid #e0e0e0" }}>
                <SideNav showSearch={false} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <Outlet context={{ patient, setPatient } satisfies LayoutCtx} />
            </div>
          </div>
        </AppShell.Main>
      </AppShell>
    </>
  );
}
