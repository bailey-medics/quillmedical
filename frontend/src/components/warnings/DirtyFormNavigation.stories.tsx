/**
 * DirtyFormNavigation Storybook Stories
 *
 * Interactive example of the navigation blocker modal warning users
 * about unsaved changes when attempting to navigate away.
 */
import { Button } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import type { Location } from "react-router-dom";
import DirtyFormNavigation from "./DirtyFormNavigation";

const mockLocation: Location = {
  pathname: "/admin/users/new",
  search: "",
  hash: "",
  state: null,
  key: "default",
};

const meta = {
  title: "Warnings/DirtyFormNavigation",
  component: DirtyFormNavigation,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Modal that warns users when attempting to navigate away from a page with unsaved form changes. Uses React Router's useBlocker functionality.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DirtyFormNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Interactive story showing the modal when navigation is blocked.
 * Click "Leave dirty form" to trigger the modal.
 */
export const Interactive: Story = {
  render: () => {
    const [isBlocked, setIsBlocked] = useState(false);

    const blocker = isBlocked
      ? {
          state: "blocked" as const,
          reset: () => setIsBlocked(false),
          proceed: () => setIsBlocked(false),
          location: mockLocation,
        }
      : {
          state: "unblocked" as const,
          reset: undefined,
          proceed: undefined,
          location: undefined,
        };

    return (
      <div style={{ padding: "2rem" }}>
        <h3>DirtyFormNavigation Modal Demo</h3>
        <p>
          Click the button below to simulate attempting to navigate away from a
          form with unsaved changes.
        </p>
        <Button onClick={() => setIsBlocked(true)}>Leave dirty form</Button>
        <DirtyFormNavigation blocker={blocker} />
      </div>
    );
  },
  // @ts-expect-error: Custom render function doesn't use args
  args: {},
};
