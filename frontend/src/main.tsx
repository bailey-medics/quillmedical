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

function RootLayout() {
  const [opened, { toggle }] = useDisclosure(false);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [patient, setPatient] = useState<Patient | null>(null);

  return (
    <MantineProvider defaultColorScheme="light">
      <Notifications />
      <AppShell
        header={{ height: 88 }} // 56 top row + ~32 demographics ribbon
        navbar={{
          width: 260,
          breakpoint: "sm",
          collapsed: { mobile: !opened }, // sidebar auto-collapses on small screens
        }}
        padding="md"
        withBorder={false}
      >
        <AppShell.Header>
          <TopRibbon
            onBurgerClick={toggle}
            isMobile={isMobile}
            patient={patient}
            showBurger={isMobile} // hide burger on desktop where sidebar is present
          />
        </AppShell.Header>

        <AppShell.Navbar>
          {/* On mobile, search lives in the sidebar; on desktop it’s in the header */}
          <SideNav showSearch={isMobile} />
        </AppShell.Navbar>

        <AppShell.Main>
          {/* Share patient + setter to child routes without Context */}
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
