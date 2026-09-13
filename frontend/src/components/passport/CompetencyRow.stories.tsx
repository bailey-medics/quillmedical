/**
 * CompetencyRow Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import CompetencyRow from "./CompetencyRow";
import {
  declinedCompetency,
  requestedCompetency,
  signedOffCompetency,
} from "./fixtures";
import { StoryNote, VariantStack } from "@/stories/variants";

const meta: Meta<typeof CompetencyRow> = {
  title: "Passport/Competency row",
  component: CompetencyRow,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CompetencyRow>;

export const SignedOff: Story = {
  args: { competency: signedOffCompetency },
};

export const Requested: Story = {
  args: { competency: requestedCompetency },
};

export const Declined: Story = {
  args: { competency: declinedCompetency },
};

export const Selectable: Story = {
  args: {
    competency: signedOffCompetency,
    onSelect: (id: string) => console.log("selected", id),
  },
};

export const AllStates: Story = {
  render: () => (
    <VariantStack>
      <Stack gap="md">
        <CompetencyRow competency={signedOffCompetency} />
        <CompetencyRow competency={requestedCompetency} />
        <CompetencyRow competency={declinedCompetency} />
        <StoryNote>
          The logbook count appears with no target beside it. How many is enough
          is the assessor&rsquo;s judgement, and a progress bar would appear to
          have decided it already.
        </StoryNote>
      </Stack>
    </VariantStack>
  ),
};
