import type { Meta, StoryObj } from "@storybook/react-vite";
import NavIcon from "./NavIcon";

const meta = {
  title: "Components/Icons/NavIcon",
  component: NavIcon,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    name: {
      description: "The name of the icon to display",
      control: "select",
      options: [
        "home",
        "settings",
        "logout",
        "user",
        "bell",
        "message",
        "file",
      ],
    },
    size: {
      description: "The size preset for the icon",
      control: "select",
      options: ["xs", "sm", "md", "lg", "xl"],
    },
  },
} satisfies Meta<typeof NavIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default navigation icon with home icon
 */
export const Home: Story = {
  args: {
    name: "home",
    size: "lg",
  },
};

/**
 * Navigation icon with settings icon
 */
export const Settings: Story = {
  args: {
    name: "settings",
    size: "lg",
  },
};

/**
 * Navigation icon with logout icon
 */
export const Logout: Story = {
  args: {
    name: "logout",
    size: "lg",
  },
};

/**
 * Navigation icon with user icon
 */
export const User: Story = {
  args: {
    name: "user",
    size: "lg",
  },
};

/**
 * Navigation icon with bell/notification icon
 */
export const Notification: Story = {
  args: {
    name: "bell",
    size: "lg",
  },
};

/**
 * Navigation icon with larger icon size
 */
export const LargerIcon: Story = {
  args: {
    name: "home",
    size: "xl",
  },
};

/**
 * Multiple navigation icons shown together
 */
export const AllIcons: Story = {
  args: {
    name: "home",
  },
  render: () => (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <NavIcon name="home" />
      <NavIcon name="settings" />
      <NavIcon name="user" />
      <NavIcon name="bell" />
      <NavIcon name="logout" />
    </div>
  ),
};
