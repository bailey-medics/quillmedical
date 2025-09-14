// src/main.tsx
import ReactDOM from "react-dom/client";

// Mantine v8 styles
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import NavigationDrawer from "./components/drawers/NavigationDrawer";

import {
  AppShell,
  MantineProvider,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import {
  createBrowserRouter,
  Outlet,
  RouterProvider,
  useLocation,
} from "react-router-dom";

import SideNav from "./components/navigation/SideNav";
import TopRibbon, { type Patient } from "./components/ribbon/TopRibbon";
import About from "./pages/About";
import Home from "./pages/Home";

// Layout context
export type LayoutCtx = {
  patient: Patient | null;
  setPatient: React.Dispatch<React.SetStateAction<Patient | null>>;
};

function RootLayout() {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  const [opened, { open, close }] = useDisclosure(false);
  const [patient, setPatient] = useState<Patient | null>(null);

  // Close drawer on route change
  const location = useLocation();
  useEffect(() => {
    if (opened) close();
  }, [location.pathname, opened, close]);

  const HEADER_H = 88; // your header height
  const DRAWER_W = 260; // rail width

  return (
    <MantineProvider defaultColorScheme="light">
      <Notifications />

      <AppShell header={{ height: 88 }} padding="md" withBorder={false}>
        <AppShell.Header>
          <TopRibbon
            onBurgerClick={() => (opened ? close() : open())}
            isLoading={false}
            patient={patient}
            navOpen={opened}
          />
        </AppShell.Header>

        <NavigationDrawer
          opened={opened}
          onClose={close}
          width={260}
          topOffset={88}
        >
          <SideNav showSearch onNavigate={close} />
        </InlineDrawer>

        <AppShell.Main>
          <Outlet context={{ patient, setPatient } satisfies LayoutCtx} />
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/about", element: <About /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />
);
