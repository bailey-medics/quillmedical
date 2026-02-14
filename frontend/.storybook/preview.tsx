import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import type { Preview } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import React, { useEffect, useState } from "react";

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

// Wrapper to ensure auth loads before rendering stories
// eslint-disable-next-line react-refresh/only-export-components
function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { state } = useAuth();
  const [minDelayPassed, setMinDelayPassed] = useState(false);

  useEffect(() => {
    console.log("[AuthWrapper] Auth state:", state.status);
    // Minimum delay to ensure auth has time to initialize
    const timer = setTimeout(() => setMinDelayPassed(true), 50);
    return () => clearTimeout(timer);
  }, [state.status]);

  // Wait for both: minimum delay passed AND auth is authenticated or unauthenticated (not loading)
  if (!minDelayPassed || state.status === "loading") {
    console.log(
      "[AuthWrapper] Waiting... minDelayPassed:",
      minDelayPassed,
      "status:",
      state.status,
    );
    return null;
  }

  console.log("[AuthWrapper] Ready! Status:", state.status);
  return <>{children}</>;
}

const decorators = [
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Story: any) => (
    <AuthProvider>
      <MantineProvider defaultColorScheme="light">
        <MemoryRouter>
          <AuthWrapper>
            <div style={{ padding: 0 }}>{Story()}</div>
          </AuthWrapper>
        </MemoryRouter>
      </MantineProvider>
    </AuthProvider>
  ),
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
