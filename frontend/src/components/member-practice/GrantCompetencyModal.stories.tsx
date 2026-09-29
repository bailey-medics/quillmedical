/**
 * Grant competency modal stories.
 *
 * Opened by the "Grant competency" button on the member practice page,
 * or by "Grant" on a row authorised here but not held.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote } from "@/stories/variants";
import GrantCompetencyModal from "./GrantCompetencyModal";

const options = [
  { id: "certify_death", name: "Certify Death" },
  { id: "manage_users", name: "Manage User Accounts" },
  { id: "perform_venepuncture", name: "Perform Venepuncture" },
];

const meta: Meta<typeof GrantCompetencyModal> = {
  title: "Cards/Member practice/Grant competency modal",
  component: GrantCompetencyModal,
  parameters: { layout: "padded" },
  args: {
    opened: true,
    onClose: () => {},
    onGrant: async () => {},
    options,
    username: "a.patel",
    orgUnitName: "Ward A",
  },
};
export default meta;

type Story = StoryObj<typeof GrantCompetencyModal>;

/** Opened from "Grant competency": nothing chosen yet. */
export const Default: Story = {};

/** Opened from a row authorised here but not held. */
export const WithChoice: Story = {
  args: { initial: "manage_users" },
  render: (args) => (
    <>
      <GrantCompetencyModal {...args} />
      <StoryNote>
        The row&apos;s competency starts chosen, so granting it is one click.
      </StoryNote>
    </>
  ),
};
