// src/components/SideNav.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import SideNav from "./SideNav";

const meta: Meta<typeof SideNav> = {
  title: "Navigation/SideNav",
  component: SideNav,
  args: {
    showSearch: true,
  },
};
export default meta;

type Story = StoryObj<typeof SideNav>;

/** Default sidebar with search visible */
export const WithSearch: Story = {
  args: { showSearch: true },
};

/** Sidebar without search */
export const WithoutSearch: Story = {
  args: { showSearch: false },
};
