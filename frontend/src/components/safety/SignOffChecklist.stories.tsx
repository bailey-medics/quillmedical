/**
 * SignOffChecklist Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import SignOffChecklist from "./SignOffChecklist";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof SignOffChecklist> = {
  title: "Safety/Sign-off checklist",
  component: SignOffChecklist,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof SignOffChecklist>;

export const PartlySigned: Story = {
  args: { items: SAFETY_CASES[0].sign_off },
};

export const FullySigned: Story = {
  args: { items: SAFETY_CASES[1].sign_off },
};

export const DarkMode: Story = {
  ...PartlySigned,
  globals: { colorScheme: "dark" },
};
