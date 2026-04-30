import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "../src/styles/colours.css";
import "../src/styles/typography.css";
import type { Preview } from "@storybook/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import React, { useEffect } from "react";
import { theme, cssVariablesResolver } from "../src/theme";

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
  // Mock /auth/refresh to prevent the api client from redirecting to login
  if (url.includes("/auth/refresh")) {
    return new Response(null, { status: 401, statusText: "Unauthorised" });
  }
  // Mock /patients endpoint for NewMessageModal
  if (url.includes("/patients")) {
    return new Response(
      JSON.stringify({
        patients: [
          { id: "p-1", name: [{ given: ["James"], family: "Green" }] },
          { id: "p-2", name: [{ given: ["Sarah"], family: "Mitchell" }] },
          { id: "p-3", name: [{ given: ["Robert"], family: "Chen" }] },
          { id: "p-4", name: [{ given: ["Emily"], family: "Okonkwo" }] },
          { id: "p-5", name: [{ given: ["David"], family: "Patel" }] },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
  // Mock /users endpoint for NewMessageModal
  if (url.includes("/users")) {
    return new Response(
      JSON.stringify({
        users: [
          { id: 1, username: "Dr Corbett" },
          { id: 2, username: "Nurse Adams" },
          { id: 3, username: "Dr Patel" },
          { id: 4, username: "Dr Okonkwo" },
          { id: 5, username: "Nurse Williams" },
          { id: 6, username: "Dr Chen" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
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

    // Create a memory router with a catch-all route for the story.
    // Stories can set parameters.routerPath to simulate a specific URL
    // (e.g. "/patients/p1/messages" to trigger patient nav items).
    const initialPath: string =
      (context.parameters.routerPath as string) ?? "/";
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: (
            <AuthProvider>
              <MantineProvider
                theme={theme}
                cssVariablesResolver={cssVariablesResolver}
              >
                <AuthWrapper>
                  <div style={{ padding: 0 }}>{Story()}</div>
                </AuthWrapper>
              </MantineProvider>
            </AuthProvider>
          ),
        },
      ],
      { initialEntries: [initialPath] },
    );

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
