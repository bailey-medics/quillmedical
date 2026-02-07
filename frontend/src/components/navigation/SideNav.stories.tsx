// SideNav.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import SideNav from "./SideNav";

const meta = {
  title: "Navigation/SideNav",
  component: SideNav,
} satisfies Meta<typeof SideNav>;
export default meta;

type Story = StoryObj<typeof meta>;

export const WithSearch: Story = {
  args: { showSearch: true },
};

export const WithoutSearch: Story = {
  args: { showSearch: false },
};

export const WithSearchIcons: Story = {
  args: { showSearch: true, showIcons: true },
};

export const WithoutSearchIcons: Story = {
  args: { showSearch: false, showIcons: true },
};
