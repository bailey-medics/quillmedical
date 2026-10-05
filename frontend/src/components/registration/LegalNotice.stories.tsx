import type { Meta, StoryObj } from "@storybook/react-vite";
import LegalNotice from "./LegalNotice";

const meta: Meta<typeof LegalNotice> = {
  title: "Registration/Legal notice",
  component: LegalNotice,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof LegalNotice>;

export const Default: Story = {};

export const DarkMode: Story = {
  globals: { colorScheme: "dark" },
};
