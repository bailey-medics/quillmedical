/**
 * NavigationDrawer Component Stories
 *
 * Demonstrates the mobile navigation drawer:
 * - Slide-out panel with navigation items
 * - Open/close animations
 * - Overlay backdrop
 * - Touch-friendly navigation on mobile
 * - Auto-closes on navigation selection
 */
// src/components/navigation/InlineDrawer.stories.tsx
import { Stack } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { StoryNote } from "@/stories/variants";
import AddButton from "../button/AddButton";
import SideNavContent from "../navigation/SideNavContent";
import NavigationDrawer from "./NavigationDrawer";

const meta: Meta<typeof NavigationDrawer> = {
  title: "Drawers/NavigationDrawer",
  component: NavigationDrawer,
  parameters: {
    layout: "fullscreen",
  },
  // Provide a positioned demo surface so Overlay/Paper can absolutely position
  decorators: [
    (Story, ctx) => {
      const top = (ctx.args.topOffset as number) ?? 0;
      return (
        <div
          style={{
            position: "relative",
            height: "70dvh",
            background:
              "repeating-linear-gradient(45deg, var(--mantine-color-body), var(--mantine-color-body) 10px, var(--mantine-color-primary-light) 10px, var(--mantine-color-primary-light) 20px)",
          }}
        >
          {/* Fake header to visualize topOffset */}
          {top > 0 && (
            <div
              style={{
                position: "absolute",
                inset: `0 0 auto 0`,
                height: top,
                background: "var(--mantine-color-body)",
                borderBottom: "1px solid var(--mantine-color-default-border)",
                display: "flex",
                alignItems: "center",
                padding: "0 1rem",
                zIndex: 10,
              }}
            >
              <Text fw={600}>Header (topOffset {top}px)</Text>
            </div>
          )}

          {/* Page content behind the drawer */}
          <div
            style={{
              padding: 24,
              paddingTop: top ? top + 16 : 24,
              color: "var(--mantine-color-text)",
            }}
          >
            <Story />
          </div>
        </div>
      );
    },
  ],
  argTypes: {
    opened: { control: "boolean" },
    width: { control: "text" },
    topOffset: { control: "number" },
  },
  args: {
    opened: false,
    width: "16.25rem",
    topOffset: 0,
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

// Little menu to render inside the drawer
function DrawerContent() {
  return <SideNavContent showIcons />;
}

export const Interactive: Story = {
  render: (args) => {
    const [open, setOpen] = useState(!!args.opened);
    return (
      <>
        <Stack gap="md" mb="sm">
          <StoryNote>Press the button to toggle the drawer.</StoryNote>
          <div style={{ maxWidth: 80 }}>
            <AddButton label="Press" onClick={() => setOpen((v) => !v)} />
          </div>
        </Stack>

        <NavigationDrawer
          {...args}
          opened={open}
          onClose={() => setOpen(false)}
        >
          <DrawerContent />
        </NavigationDrawer>
      </>
    );
  },
};

export const DarkMode: Story = {
  ...Interactive,
  globals: { colorScheme: "dark" },
};
