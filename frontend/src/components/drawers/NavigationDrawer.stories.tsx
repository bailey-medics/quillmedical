// src/components/navigation/InlineDrawer.stories.tsx
import { Button, Group, Text } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import SideNavContent from "../navigation/SideNavContent";
import NavigationDrawer from "./NavigationDrawer";

const meta: Meta<typeof NavigationDrawer> = {
  title: "NavigationDrawer",
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
              "repeating-linear-gradient(45deg,#f8fafc,#f8fafc 10px,#f1f5f9 10px,#f1f5f9 20px)",
          }}
        >
          {/* Fake header to visualize topOffset */}
          {top > 0 && (
            <div
              style={{
                position: "absolute",
                inset: `0 0 auto 0`,
                height: top,
                background: "white",
                borderBottom: "1px solid #e5e7eb",
                display: "flex",
                alignItems: "center",
                padding: "0 16px",
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
              color: "#334155",
            }}
          >
            <Text mb="sm">Main body content will go here</Text>
            <Story />
          </div>
        </div>
      );
    },
  ],
  argTypes: {
    opened: { control: "boolean" },
    width: { control: "number" },
    topOffset: { control: "number" },
  },
  args: {
    opened: false,
    width: 260,
    topOffset: 0,
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

// Little menu to render inside the drawer
function DrawerContent() {
  return <SideNavContent />;
}

export const Interactive: Story = {
  render: (args) => {
    const [open, setOpen] = useState(!!args.opened);
    return (
      <>
        <Group mb="sm">
          <Button onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Open"} drawer
          </Button>
        </Group>

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
