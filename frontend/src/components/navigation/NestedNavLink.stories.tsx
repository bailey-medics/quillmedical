/**
 * NestedNavLink Component Stories
 *
 * Demonstrates the recursive navigation link component with various configurations:
 * - Single navigation items
 * - Parent items with children
 * - Deeply nested navigation hierarchies
 * - Active state variations
 * - Icon display options
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import NestedNavLink, { type NavItem } from "./NestedNavLink";
import { Stack, Title, Text } from "@mantine/core";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import React from "react";
import { MantineProvider } from "@mantine/core";

/**
 * Simple page component that shows the current route
 */
function RoutePage() {
  const location = useLocation();
  return (
    <div style={{ padding: "2rem" }}>
      <Title order={2}>You arrived at:</Title>
      <Text size="xl" mt="md" c="blue">
        {location.pathname}
      </Text>
    </div>
  );
}

/**
 * Creates a decorator with a complete router setup for the given initial path
 */
function withNavigation(initialPath: string) {
  return (Story: React.ComponentType) => {
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: (
            <div style={{ display: "flex", gap: "1rem", minHeight: "100vh" }}>
              <div
                style={{
                  minWidth: 300,
                  borderRight: "1px solid #dee2e6",
                  padding: "1rem",
                }}
              >
                <Story />
              </div>
              <div style={{ flex: 1 }}>
                <RoutePage />
              </div>
            </div>
          ),
        },
      ],
      { initialEntries: [initialPath] },
    );

    return (
      <MantineProvider>
        <RouterProvider router={router} />
      </MantineProvider>
    );
  };
}

const meta = {
  title: "Navigation/NestedNavLink",
  component: NestedNavLink,
  parameters: {
    layout: "fullscreen",
    // Disable Storybook's default router decorator to avoid nesting routers
    disableDefaultRouter: true,
    docs: {
      story: {
        inline: false,
        iframeHeight: 500,
      },
    },
  },
} satisfies Meta<typeof NestedNavLink>;
export default meta;

type Story = StoryObj<typeof meta>;

// Sample navigation data
const singleItem: NavItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: "home",
};

const itemWithChildren: NavItem = {
  label: "Patients",
  href: "/patients",
  icon: "user",
  children: [
    { label: "All Patients", href: "/patients/all" },
    { label: "New Patient", href: "/patients/new" },
    { label: "Recent", href: "/patients/recent" },
  ],
};

const itemWithNestedChildren: NavItem = {
  label: "Settings",
  href: "/settings",
  icon: "settings",
  children: [
    { label: "Profile", href: "/settings/profile" },
    {
      label: "Security",
      href: "/settings/security",
      children: [
        { label: "Password", href: "/settings/security/password" },
        { label: "Two-Factor", href: "/settings/security/2fa" },
      ],
    },
    { label: "Preferences", href: "/settings/preferences" },
  ],
};

const multipleItems: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: "home",
  },
  {
    label: "Messages",
    href: "/messages",
    icon: "message",
  },
  {
    label: "Documents",
    href: "/documents",
    icon: "file",
    children: [
      { label: "Templates", href: "/documents/templates" },
      { label: "Archive", href: "/documents/archive" },
    ],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: "settings",
    children: [
      { label: "Profile", href: "/settings/profile" },
      { label: "Security", href: "/settings/security" },
    ],
  },
];

/**
 * Single navigation item without children.
 * Basic usage showing a simple navigation link.
 */
export const SingleItem: Story = {
  decorators: [withNavigation("/dashboard")],
  args: {
    item: singleItem,
    showIcons: false,
  },
};

/**
 * Single navigation item with icon.
 * Shows how icons are displayed alongside labels.
 */
export const SingleItemWithIcon: Story = {
  decorators: [withNavigation("/dashboard")],
  args: {
    item: singleItem,
    showIcons: true,
  },
};

/**
 * Parent item with child links.
 * Children are shown because we're on a child route (/patients/all).
 */
export const ItemWithChildren: Story = {
  decorators: [withNavigation("/patients/all")],
  args: {
    item: itemWithChildren,
    showIcons: false,
  },
};

/**
 * Parent item with child links and icons.
 * Demonstrates icon display in a hierarchical navigation.
 */
export const ItemWithChildrenAndIcons: Story = {
  decorators: [withNavigation("/patients/new")],
  args: {
    item: itemWithChildren,
    showIcons: true,
  },
};

/**
 * Deeply nested navigation structure.
 * Shows multi-level hierarchy with indentation and font sizing.
 * Currently on /settings/security/password to show all levels expanded.
 */
export const NestedNavigation: Story = {
  decorators: [withNavigation("/settings/security/password")],
  args: {
    item: itemWithNestedChildren,
    showIcons: true,
  },
};

/**
 * Multiple navigation items in a stack.
 * Demonstrates how items work together in a navigation menu.
 * Currently on /documents/templates to show that section expanded.
 */
export const MultipleItems: Story = {
  decorators: [withNavigation("/documents/templates")],
  render: (args) => (
    <Stack gap={0}>
      {multipleItems.map((item) => (
        <NestedNavLink key={item.href} {...args} item={item} />
      ))}
    </Stack>
  ),
  args: {
    item: multipleItems[0],
    showIcons: true,
  },
};

/**
 * Navigation with custom font size.
 * Shows how to adjust the base font size (default is 20px).
 */
export const CustomFontSize: Story = {
  decorators: [withNavigation("/patients/recent")],
  args: {
    item: itemWithChildren,
    showIcons: true,
    baseFontSize: 16,
  },
};

/**
 * Navigation with onNavigate callback.
 * Useful for closing mobile drawers after navigation.
 */
export const WithNavigateCallback: Story = {
  decorators: [withNavigation("/patients/all")],
  args: {
    item: itemWithChildren,
    showIcons: true,
    onNavigate: () => {
      alert("Navigation event fired");
    },
  },
};

/**
 * Complete navigation menu example.
 * Shows a real-world navigation structure with multiple items and nesting.
 * Currently on /settings/security/password to demonstrate deep nesting.
 */
export const CompleteMenuExample: Story = {
  args: {
    item: singleItem,
  },
  decorators: [
    () => {
      const router = createMemoryRouter(
        [
          {
            path: "*",
            element: (
              <div style={{ display: "flex", gap: "1rem", minHeight: "100vh" }}>
                <div
                  style={{
                    minWidth: 300,
                    borderRight: "1px solid #dee2e6",
                    padding: "1rem",
                  }}
                >
                  <Stack gap={0}>
                    <NestedNavLink
                      item={{
                        label: "Dashboard",
                        href: "/dashboard",
                        icon: "home",
                      }}
                      showIcons
                    />
                    <NestedNavLink
                      item={{
                        label: "Messages",
                        href: "/messages",
                        icon: "message",
                      }}
                      showIcons
                    />
                    <NestedNavLink
                      item={{
                        label: "Patients",
                        href: "/patients",
                        icon: "user",
                        children: [
                          { label: "All Patients", href: "/patients/all" },
                          { label: "New Patient", href: "/patients/new" },
                          { label: "Recent", href: "/patients/recent" },
                        ],
                      }}
                      showIcons
                    />
                    <NestedNavLink
                      item={{
                        label: "Documents",
                        href: "/documents",
                        icon: "file",
                        children: [
                          { label: "Templates", href: "/documents/templates" },
                          { label: "Upload", href: "/documents/upload" },
                          { label: "Archive", href: "/documents/archive" },
                        ],
                      }}
                      showIcons
                    />
                    <NestedNavLink
                      item={{
                        label: "Settings",
                        href: "/settings",
                        icon: "settings",
                        children: [
                          { label: "Profile", href: "/settings/profile" },
                          {
                            label: "Security",
                            href: "/settings/security",
                            children: [
                              {
                                label: "Password",
                                href: "/settings/security/password",
                              },
                              {
                                label: "Two-Factor",
                                href: "/settings/security/2fa",
                              },
                            ],
                          },
                          {
                            label: "Preferences",
                            href: "/settings/preferences",
                          },
                        ],
                      }}
                      showIcons
                    />
                    <NestedNavLink
                      item={{
                        label: "Logout",
                        href: "/logout",
                        icon: "logout",
                      }}
                      showIcons
                    />
                  </Stack>
                </div>
                <div style={{ flex: 1 }}>
                  <RoutePage />
                </div>
              </div>
            ),
          },
        ],
        { initialEntries: ["/settings/security/password"] },
      );

      return (
        <MantineProvider>
          <RouterProvider router={router} />
        </MantineProvider>
      );
    },
  ],
};
