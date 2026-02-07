/**
 * SideNav Component Stories
 *
 * Demonstrates the side navigation component with various configurations:
 * - Search field visibility
 * - Icon display options
 * - Navigation item variations
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import SideNav from "./SideNav";

const meta = {
  title: "Navigation/SideNav",
  component: SideNav,
} satisfies Meta<typeof SideNav>;
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Navigation with search field at the top.
 * Default configuration showing all navigation items with search enabled.
 */
export const WithSearch: Story = {
  args: { showSearch: true },
};

/**
 * Navigation without search field.
 * Compact version showing only navigation items.
 */
export const WithoutSearch: Story = {
  args: { showSearch: false },
};

/**
 * Navigation with search field and icons.
 * Enhanced version showing icons next to each navigation item.
 */
export const WithSearchIcons: Story = {
  args: { showSearch: true, showIcons: true },
};

/**
 * Navigation without search but with icons.
 * Compact version with visual icon indicators for each item.
 */
export const WithoutSearchIcons: Story = {
  args: { showSearch: false, showIcons: true },
};
