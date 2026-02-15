/**
 * Main Application Entry Point
 *
 * Root module that initializes the React application with routing, authentication,
 * UI framework, and service worker registration. Sets up the entire application
 * component tree including AuthProvider, MantineProvider, and React Router.
 *
 * Architecture:
 * - React Router with base URL support (for /app/ mounting)
 * - Mantine UI for styling and components
 * - Auth context wrapping all routes
 * - Service worker for PWA functionality
 *
 * Route Structure:
 * - Public routes: /login, /register (guest-only)
 * - Protected routes: /, /settings, /about (require authentication)
 * - 404 fallback for unknown paths
 */

// src/main.tsx
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import ReactDOM from "react-dom/client";

import { MantineProvider } from "@mantine/core";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import RootLayout from "./RootLayout";
import About from "./pages/About";
import AdminPage from "./pages/AdminPage";
import Home from "./pages/Home";
import Messages from "./pages/Messages";
import NotFound from "./pages/NotFound";
import Patient from "./pages/Patient";
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
        { path: "/patients/:id", element: <Patient /> },
        { path: "/messages", element: <Messages /> },
        { path: "/admin", element: <AdminPage /> },
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
  { basename },
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </MantineProvider>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const base = import.meta.env.BASE_URL ?? "/"; // usually "/app/"
      const swUrl = `${base}sw.js`; // -> "/app/sw.js"
      console.log("Registering service worker at", swUrl);

      const reg = await navigator.serviceWorker.register(swUrl);
      console.log("SW registered:", reg);

      reg.update();
      setInterval(() => reg.update(), 60 * 60 * 1000);

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("SW controller changed → reloading");
        window.location.reload();
      });

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            reg.waiting?.postMessage("SKIP_WAITING");
          }
        });
      });
    } catch (err) {
      console.error("Service worker registration failed:", err);
    }
  });
}
