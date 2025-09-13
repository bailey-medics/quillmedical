import ReactDOM from "react-dom/client";

// Mantine v8 styles
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import { AppShell, MantineProvider } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import { useState } from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";

import SideNav from "./components/navigation/SideNav";
import TopRibbon, { type Patient } from "./components/ribbon/TopRibbon";
import About from "./pages/About";
import Home from "./pages/Home";

// Expose layout context shape so pages can read/write patient via useOutletContext<LayoutCtx>()
export type LayoutCtx = {
  patient: Patient | null;
  setPatient: React.Dispatch<React.SetStateAction<Patient | null>>;
};

export default function RootLayout() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [patient, setPatient] = useState<Patient | null>(null);

  return (
    <MantineProvider defaultColorScheme="light">
      <Notifications />

      {/* ⬇️  changes start here */}
      <AppShell
        header={{ height: 88 }}
        navbar={{
          width: 260,
          breakpoint: "sm",
          collapsed: { mobile: !opened },
        }}
        padding="md"
        withBorder={false}
      >
        <AppShell.Header>
          <TopRibbon
            onBurgerClick={toggle}
            isLoading={false}
            patient={patient}
            navOpen={opened}                 {/* new */}
          />
        </AppShell.Header>

        <AppShell.Navbar id="app-navbar">   {/* give it an id */}
          <SideNav
            showSearch={isMobile}
            onNavigate={isMobile ? close : undefined}
          />
        </AppShell.Navbar>

        <AppShell.Main>
          <Outlet context={{ patient, setPatient } satisfies LayoutCtx} />
        </AppShell.Main>
      </AppShell>
      {/* ⬆️  changes end here */}
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
