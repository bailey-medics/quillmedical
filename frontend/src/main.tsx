// src/main.tsx
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import ReactDOM from "react-dom/client";

import { MantineProvider } from "@mantine/core";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import RootLayout from "./RootLayout";
import About from "./pages/About";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import RegisterPage from "./pages/RegisterPage";
import TotpSetup from "./pages/TotpSetup";

// NEW: auth imports
import { AuthProvider } from "./auth/AuthContext";
import GuestOnly from "./auth/GuestOnly";
import RequireAuth from "./auth/RequireAuth";
import LoginPage from "./pages/LoginPage";

// Use Vite's BASE_URL so the client router knows it's served under `/app/`.
// `import.meta.env.BASE_URL` typically ends with a trailing slash (e.g. '/app/'),
// so normalize it to a form acceptable as a basename (no trailing slash, or
// undefined for root).
const rawBase = (import.meta.env.BASE_URL as string) || "/";
const basename = rawBase === "/" ? undefined : rawBase.replace(/\/$/, "");

const router = createBrowserRouter(
  [
    // Public routes (login, register) — placed before protected routes so
    // they are matched directly and not captured by the authenticated
    // parent route.
    {
      path: "/login",
      element: (
        <GuestOnly>
          <LoginPage />
        </GuestOnly>
      ),
    },
    {
      path: "/register",
      element: (
        <GuestOnly>
          <RegisterPage />
        </GuestOnly>
      ),
    },

    // Everything below here requires auth
    {
      element: (
        <RequireAuth>
          <RootLayout />
        </RequireAuth>
      ),
      children: [
        { path: "/", element: <Home /> },
        {
          path: "/settings",
          element: import("./pages/Settings").then((m) => <m.default />),
        },
        { path: "/settings/totp", element: <TotpSetup /> },
        { path: "/about", element: <About /> },
      ],
    },

    // Fallback -> show 404 page instead of redirecting to home
    { path: "*", element: <NotFound /> },
  ],
  { basename }
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </MantineProvider>
);
