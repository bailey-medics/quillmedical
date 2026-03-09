import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../src/styles/typography.css";
import type { Preview } from "@storybook/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import React, { useEffect } from "react";
import { theme } from "../src/theme";

// Mock the API to prevent real backend calls in Storybook
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = async (url: string) => {
  console.log("[Storybook Mock] Fetch called for:", url);
  // Mock /auth/me endpoint to return authenticated user
  if (url.includes("/auth/me")) {
    console.log("[Storybook Mock] Returning authenticated user");
    const mockUser = {
      id: "1",
      username: "mark.bailey",
      email: "mark.bailey@example.com",
      name: "Mark Bailey",
      roles: ["Clinician"],
      system_permissions: "superadmin",
    };
    return new Response(JSON.stringify(mockUser), {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
  // Mock other endpoints as needed
  console.log("[Storybook Mock] No mock for URL, returning 404");
  return new Response(null, { status: 404, statusText: "Not Found" });
};

// Import real AuthProvider after mocking fetch
import { AuthProvider, useAuth } from "../src/auth/AuthContext";

// Wrapper to ensure auth is available (renders immediately, auth loads in background)
// eslint-disable-next-line react-refresh/only-export-components
function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();

  useEffect(() => {
    console.log("[AuthWrapper] Auth state:", state.status);
  }, [state.status]);

  // Always render immediately - don't block on auth loading
  console.log("[AuthWrapper] Rendering (auth status:", state.status + ")");
  return <>{children}</>;
}

const decorators = [
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Story: any, context: any) => {
    // Allow stories to opt out of the default router wrapper
    // by setting parameters.disableDefaultRouter = true
    if (context.parameters.disableDefaultRouter) {
      return <Story />;
    }

    // Create a memory router with a single route for the story
    // This supports useBlocker and other data router features
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <AuthProvider>
            <MantineProvider theme={theme}>
              <AuthWrapper>
                <div style={{ padding: 0 }}>{Story()}</div>
              </AuthWrapper>
            </MantineProvider>
          </AuthProvider>
        ),
      },
    ]);

    return <RouterProvider router={router} />;
  },
];

const preview: Preview = {
  decorators,
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: { expanded: true },
    layout: "padded",
    // Ensure stories are sorted alphabetically in the sidebar
    options: {
      storySort: {
        method: "alphabetical",
        locales: "en-US",
      },
    },
  },
};

export default preview;
