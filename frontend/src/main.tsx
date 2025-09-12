import { Anchor, AppShell, Group, MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import { Notifications } from "@mantine/notifications";
import "@mantine/notifications/styles.css";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";

import About from "./pages/About";
import Home from "./pages/Home";

export function RootLayout() {
  return (
    <MantineProvider defaultColorScheme="light">
      <Notifications />
      <AppShell header={{ height: 56 }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Anchor component={Link} to="/" fw={700}>
              Quill Medical
            </Anchor>
            <Group gap="md">
              <Anchor component={Link} to="/">
                Home
              </Anchor>
              <Anchor component={Link} to="/about">
                About
              </Anchor>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Main>
          {/* Child routes render here */}
          <Outlet />
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
