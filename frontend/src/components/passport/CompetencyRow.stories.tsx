/**
 * CompetencyRow Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import CompetencyRow from "./CompetencyRow";
import {
  declinedCompetency,
  lungCompetency,
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

/**
 * Every read-only story sets `onSelect: undefined` explicitly rather than
 * omitting it. `argTypesRegex: "^on[A-Z].*"` in `.storybook/preview.tsx`
 * auto-fills any unset `on*` prop with a spy, so an omitted `onSelect`
 * would render the row as a button with a hover - exactly what these
 * stories exist to show it is not.
 */
export const SignedOff: Story = {
  args: { competency: signedOffCompetency, onSelect: undefined },
};

export const Requested: Story = {
  args: { competency: requestedCompetency, onSelect: undefined },
};

/** Signed off at a different level from the one asked for, with why. */
export const SignedAtADifferentLevel: Story = {
  args: {
    competency: {
      ...signedOffCompetency,
      requested_level: { id: "teach", name: "Can teach others" },
      level_change_reason: "Not yet teaching it; independent, yes.",
    },
    onSelect: undefined,
  },
};

export const Declined: Story = {
  args: { competency: declinedCompetency, onSelect: undefined },
};

export const Selectable: Story = {
  args: {
    competency: signedOffCompetency,
    onSelect: fn(),
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

/** One scope of a competency signed off scope by scope. */
export const WithAScope: Story = {
  args: { competency: lungCompetency, onSelect: undefined },
};
