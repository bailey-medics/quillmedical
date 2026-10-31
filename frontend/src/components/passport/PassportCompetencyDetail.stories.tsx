/**
 * PassportCompetencyDetail Storybook Stories
 *
 * One competency's page, as a row of the By competency view opens it.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Stack } from "@mantine/core";
import { fn } from "storybook/test";
import PassportCompetencyDetail from "./PassportCompetencyDetail";
import {
  emptyLogbook,
  oncologyFrameworks,
  prescribePalliativeCompetency,
  prescribePalliativeLogbook,
  prescribePalliativeSignOffs,
} from "./fixtures";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof PassportCompetencyDetail> = {
  title: "Passport/Competency detail",
  component: PassportCompetencyDetail,
  parameters: { layout: "padded" },
  args: {
    competency: {
      id: prescribePalliativeCompetency.id,
      name: prescribePalliativeCompetency.name,
    },
    frameworkName: oncologyFrameworks[0].name,
    signOffs: prescribePalliativeSignOffs,
    logbook: prescribePalliativeLogbook,
    canWrite: true,
    onAskForSignOff: fn(),
    onAddEntry: fn(),
    onSelectSignOff: fn(),
    onSelectEntry: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof PassportCompetencyDetail>;

/** A sign-off waiting on an assessor, and three logbook entries. */
export const Default: Story = {};

/** A competency nobody has been asked to sign, with nothing logged. */
export const NothingYet: Story = {
  args: { signOffs: [], logbook: emptyLogbook },
};

/** A read-only passport: everything can be read, nothing added. */
export const ReadOnly: Story = {
  args: { canWrite: false },
};

/** On a phone. */
export const Phone: Story = {
  render: (args) => (
    <Stack gap="sm">
      <Box maw="23.4375rem">
        <PassportCompetencyDetail {...args} />
      </Box>
      <StoryNote>Constrained to a 375 pixel phone width.</StoryNote>
    </Stack>
  ),
};
