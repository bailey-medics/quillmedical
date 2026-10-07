/**
 * PassportLeadFrameworksCard Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import PassportLeadFrameworksCard from "./PassportLeadFrameworksCard";
import { FRAMEWORK_OPTIONS } from "@lib/passport/frameworks";

const meta: Meta<typeof PassportLeadFrameworksCard> = {
  title: "Passport/Passport lead frameworks card",
  component: PassportLeadFrameworksCard,
  parameters: { layout: "padded" },
  args: { options: FRAMEWORK_OPTIONS, onChange: fn() },
};

export default meta;
type Story = StoryObj<typeof PassportLeadFrameworksCard>;

/** No leads: the organisation's people see the list alphabetically. */
export const Default: Story = {
  args: { value: [] },
};

/** An oncology department putting the framework its trainees work to first. */
export const WithLeads: Story = {
  args: { value: ["uk_sact_board_2023"] },
};

/** A saved lead whose file has since been withdrawn. */
export const LeadNoLongerOffered: Story = {
  args: { value: ["withdrawn_sheet"] },
};

export const Loading: Story = {
  args: { value: [], disabled: true },
};
