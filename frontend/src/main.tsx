// src/main.tsx
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import ReactDOM from "react-dom/client";

import { MantineProvider } from "@mantine/core";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";

import RootLayout from "./RootLayout";
import About from "./pages/About";
import Home from "./pages/Home";

// NEW: auth imports
import { AuthProvider } from "./auth/AuthContext";
import GuestOnly from "./auth/GuestOnly";
import RequireAuth from "./auth/RequireAuth";
import LoginPage from "./pages/LoginPage";

const router = createBrowserRouter([
  // Public login route
  {
    path: "/login",
    element: (
      <GuestOnly>
        <LoginPage />
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
      { path: "/about", element: <About /> },
    ],
  },

  // Fallback
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MantineProvider defaultColorScheme="light">
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </MantineProvider>
);
