/**
 * DirtyFormNavigation Storybook Stories
 *
 * Interactive examples of the navigation blocker modal warning users
 * about unsaved changes when attempting to navigate away.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "@storybook/test";
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
  title: "Components/Warnings/DirtyFormNavigation",
  component: DirtyFormNavigation,
  parameters: {
    layout: "centered",
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
 * Default state showing the modal when navigation is blocked
 */
export const Blocked: Story = {
  args: {
    blocker: {
      state: "blocked",
      reset: fn(),
      proceed: fn(),
      location: mockLocation,
    },
  },
};

/**
 * Unblocked state - modal is not shown
 */
export const Unblocked: Story = {
  args: {
    blocker: {
      state: "unblocked",
      reset: undefined,
      proceed: undefined,
      location: undefined,
    },
  },
};

/**
 * Interactive story demonstrating user clicking "Stay on Page"
 */
export const StayOnPage: Story = {
  args: {
    blocker: {
      state: "blocked",
      reset: fn(),
      proceed: fn(),
      location: mockLocation,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'When the user clicks "Stay on Page", the blocker.reset() function is called to cancel the navigation and keep the user on the current page.',
      },
    },
  },
};

/**
 * Interactive story demonstrating user clicking "Leave Page"
 */
export const LeavePage: Story = {
  args: {
    blocker: {
      state: "blocked",
      reset: fn(),
      proceed: fn(),
      location: mockLocation,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'When the user clicks "Leave Page", the blocker.proceed() function is called to allow navigation and discard unsaved changes.',
      },
    },
  },
};

/**
 * Story with onProceed callback to demonstrate cleanup before navigation
 */
export const WithOnProceed: Story = {
  args: {
    blocker: {
      state: "blocked",
      reset: fn(),
      proceed: fn(),
      location: mockLocation,
    },
    onProceed: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          "The onProceed callback allows you to perform cleanup operations (like clearing a dirty flag) before navigation proceeds. This is useful for form state management.",
      },
    },
  },
};

/**
 * Story showing modal content and styling
 */
export const Content: Story = {
  args: {
    blocker: {
      state: "blocked",
      reset: fn(),
      proceed: fn(),
      location: mockLocation,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Displays the warning message and action buttons. The modal is centered and includes a title, description, and two action buttons with appropriate styling.",
      },
    },
  },
};
