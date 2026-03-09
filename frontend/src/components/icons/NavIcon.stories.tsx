/**
 * NavIcon Component Stories
 *
 * Demonstrates the navigation icon component:
 * - Different icon types (home, settings, logout, user, bell, message, file, adjustments, building-community)
 * - Size presets (xs, sm, md, lg, xl)
 * - Accessible labeling
 * - Used in navigation menus and buttons
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import NavIcon from "./NavIcon";

const meta = {
  title: "Icons/NavIcon",
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
        "adjustments",
        "building-community",
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
 * Default navigation icon with home icon at default (lg) size
 */
export const Default: Story = {
  args: {
    name: "home",
    size: "lg",
  },
};

/**
 * All available icons at default (lg) size
 */
export const AllIconsDefault: Story = {
  args: {
    name: "home",
  },
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <NavIcon name="home" size="lg" />
      <NavIcon name="settings" size="lg" />
      <NavIcon name="logout" size="lg" />
      <NavIcon name="user" size="lg" />
      <NavIcon name="bell" size="lg" />
      <NavIcon name="message" size="lg" />
      <NavIcon name="file" size="lg" />
      <NavIcon name="adjustments" size="lg" />
      <NavIcon name="building-community" size="lg" />
    </div>
  ),
};

/**
 * All available icons at xs size
 */
export const AllIconsXS: Story = {
  args: {
    name: "home",
  },
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <NavIcon name="home" size="xs" />
      <NavIcon name="settings" size="xs" />
      <NavIcon name="logout" size="xs" />
      <NavIcon name="user" size="xs" />
      <NavIcon name="bell" size="xs" />
      <NavIcon name="message" size="xs" />
      <NavIcon name="file" size="xs" />
      <NavIcon name="adjustments" size="xs" />
      <NavIcon name="building-community" size="xs" />
    </div>
  ),
};

/**
 * All available icons at sm size
 */
export const AllIconsSM: Story = {
  args: {
    name: "home",
  },
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <NavIcon name="home" size="sm" />
      <NavIcon name="settings" size="sm" />
      <NavIcon name="logout" size="sm" />
      <NavIcon name="user" size="sm" />
      <NavIcon name="bell" size="sm" />
      <NavIcon name="message" size="sm" />
      <NavIcon name="file" size="sm" />
      <NavIcon name="adjustments" size="sm" />
      <NavIcon name="building-community" size="sm" />
    </div>
  ),
};

/**
 * All available icons at md size
 */
export const AllIconsMD: Story = {
  args: {
    name: "home",
  },
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <NavIcon name="home" size="md" />
      <NavIcon name="settings" size="md" />
      <NavIcon name="logout" size="md" />
      <NavIcon name="user" size="md" />
      <NavIcon name="bell" size="md" />
      <NavIcon name="message" size="md" />
      <NavIcon name="file" size="md" />
      <NavIcon name="adjustments" size="md" />
      <NavIcon name="building-community" size="md" />
    </div>
  ),
};

/**
 * All available icons at lg size
 */
export const AllIconsLG: Story = {
  args: {
    name: "home",
  },
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <NavIcon name="home" size="lg" />
      <NavIcon name="settings" size="lg" />
      <NavIcon name="logout" size="lg" />
      <NavIcon name="user" size="lg" />
      <NavIcon name="bell" size="lg" />
      <NavIcon name="message" size="lg" />
      <NavIcon name="file" size="lg" />
      <NavIcon name="adjustments" size="lg" />
      <NavIcon name="building-community" size="lg" />
    </div>
  ),
};

/**
 * All available icons at xl size
 */
export const AllIconsXL: Story = {
  args: {
    name: "home",
  },
  render: () => (
    <div
      style={{
        display: "flex",
        gap: "1.25rem",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <NavIcon name="home" size="xl" />
      <NavIcon name="settings" size="xl" />
      <NavIcon name="logout" size="xl" />
      <NavIcon name="user" size="xl" />
      <NavIcon name="bell" size="xl" />
      <NavIcon name="message" size="xl" />
      <NavIcon name="file" size="xl" />
      <NavIcon name="adjustments" size="xl" />
      <NavIcon name="building-community" size="xl" />
    </div>
  ),
};
