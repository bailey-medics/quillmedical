/**
 * RegistrationBadge Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import RegistrationBadge from "./RegistrationBadge";
import { declaredRegistration } from "./fixtures";

const meta: Meta<typeof RegistrationBadge> = {
  title: "Passport/Registration badge",
  component: RegistrationBadge,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof RegistrationBadge>;

export const Declared: Story = {
  args: { registration: declaredRegistration },
};

export const OtherRegisteringBody: Story = {
  args: { registration: { body: "NMC", number: "99AB1234" } },
};
