import type { Meta, StoryObj } from "@storybook/react-vite";
import TeachingMainNav from "./TeachingMainNav";

const meta: Meta<typeof TeachingMainNav> = {
  component: TeachingMainNav,
  title: "Teaching/Nav/Dashboard nav",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof TeachingMainNav>;

export const Default: Story = {
  args: {
    onSettings: () => {},
    onAdmin: () => {},
    onLogout: () => {},
  },
};

export const WithoutAdmin: Story = {
  args: {
    onSettings: () => {},
    onLogout: () => {},
  },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
