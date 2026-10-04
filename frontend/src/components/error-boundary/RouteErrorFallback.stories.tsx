/**
 * RouteErrorFallback Stories
 *
 * What the router shows when a route fails before it can render, such as
 * a lazy chunk that could not be fetched. It looks the same as the error
 * boundary's fallback on purpose.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MantineProvider } from "@mantine/core";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { cssVariablesResolver, theme } from "@/theme";
import RouteErrorFallback from "./RouteErrorFallback";

interface FailedRouteProps {
  colorScheme: "light" | "dark";
}

/** A router whose only route fails to load, as a missing chunk does. */
function FailedRoute({ colorScheme }: FailedRouteProps) {
  const router = createMemoryRouter([
    {
      path: "/",
      errorElement: <RouteErrorFallback />,
      lazy: () =>
        Promise.reject(
          new Error("Failed to fetch dynamically imported module"),
        ),
    },
  ]);
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      forceColorScheme={colorScheme}
    >
      <RouterProvider router={router} />
    </MantineProvider>
  );
}

const meta: Meta<typeof RouteErrorFallback> = {
  title: "Error boundary/Route error fallback",
  component: RouteErrorFallback,
  parameters: {
    layout: "padded",
    // It needs a router that holds a route error, so it brings its own,
    // and with it the theme the default router would have supplied.
    disableDefaultRouter: true,
  },
  render: (_args, { globals }) => (
    <FailedRoute
      colorScheme={globals["colorScheme"] === "dark" ? "dark" : "light"}
    />
  ),
};

export default meta;

type Story = StoryObj<typeof RouteErrorFallback>;

export const Default: Story = {};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
