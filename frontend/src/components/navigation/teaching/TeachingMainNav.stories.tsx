import type { Meta, StoryObj } from "@storybook/react-vite";
import TeachingMainNav from "./TeachingMainNav";

const meta: Meta<typeof TeachingMainNav> = {
  component: TeachingMainNav,
  title: "Teaching/Nav/Dashboard nav",
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof TeachingMainNav>;

export const Default: Story = {};

export const WithModuleName: Story = {
  args: {
    moduleName: "Colonoscopy optical diagnosis",
    moduleHref: "/teaching/colonoscopy-optical-diagnosis-test",
  },
};

export const DarkMode: Story = {
  globals: { colorScheme: "dark" },
};
