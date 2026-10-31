/**
 * CompetencyFrameworkTable Storybook Stories
 *
 * The variants marked "to decide" are the open questions in the passport
 * landing views plan, drawn side by side so they can be judged by eye.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Stack } from "@mantine/core";
import { fn } from "storybook/test";
import CompetencyFrameworkTable from "./CompetencyFrameworkTable";
import {
  antiemeticsCompetency,
  oncologyCompetencies,
  oncologyFrameworks,
} from "./fixtures";
import { StoryNote } from "@/stories/variants";

const [radiotherapy, sact] = oncologyFrameworks;

const meta: Meta<typeof CompetencyFrameworkTable> = {
  title: "Passport/Competency framework table",
  component: CompetencyFrameworkTable,
  parameters: { layout: "padded" },
  args: {
    framework: radiotherapy,
    competencies: oncologyCompetencies,
    onSelect: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof CompetencyFrameworkTable>;

/** Every state a row can be in, in the Gloucestershire radiotherapy record. */
export const Default: Story = {
  render: (args) => (
    <Stack gap="sm">
      <CompetencyFrameworkTable {...args} />
      <StoryNote>
        Signed off, requested (waiting on an assessor) and not asked. Refer for
        radical radiotherapy has logbook entries and no sign-off, so it is not
        asked with a count.
      </StoryNote>
    </Stack>
  ),
};

/** A long framework: the SACT prescriber competencies, mostly not started. */
export const LongFramework: Story = {
  args: { framework: sact },
};

/** A holder with nothing recorded yet sees every item as not asked. */
export const NothingRecorded: Story = {
  args: { competencies: [] },
};

/** On a phone each row becomes a card. */
export const Phone: Story = {
  render: (args) => (
    <Stack gap="sm">
      <Box maw="23.4375rem">
        <CompetencyFrameworkTable {...args} />
      </Box>
      <StoryNote>Constrained to a 375 pixel phone width.</StoryNote>
    </Stack>
  ),
};

/** To decide: a signed count under the framework's name, or none. */
export const SignedCountToDecide: Story = {
  render: (args) => (
    <Stack gap="lg">
      <Stack gap="sm">
        <CompetencyFrameworkTable {...args} showSignedCount />
        <StoryNote>With a count under the name.</StoryNote>
      </Stack>
      <Stack gap="sm">
        <CompetencyFrameworkTable {...args} />
        <StoryNote>Without one, as built by default.</StoryNote>
      </Stack>
    </Stack>
  ),
};

/** To decide: a declined latest sign-off as not asked, or as declined. */
export const DeclinedToDecide: Story = {
  args: { framework: sact },
  render: (args) => (
    <Stack gap="lg">
      <Stack gap="sm">
        <CompetencyFrameworkTable {...args} />
        <StoryNote>
          Declined shown as not asked, as built by default. See the antiemetic
          requirements row.
        </StoryNote>
      </Stack>
      <Stack gap="sm">
        <CompetencyFrameworkTable {...args} showDeclined />
        <StoryNote>Declined as a state of its own.</StoryNote>
      </Stack>
    </Stack>
  ),
};

/** To decide: a competency signed off one tumour site at a time. */
export const ScopesToDecide: Story = {
  args: {
    framework: sact,
    competencies: oncologyCompetencies.filter(
      (state) => state.id !== antiemeticsCompetency.id,
    ),
  },
  render: (args) => (
    <Stack gap="lg">
      <Stack gap="sm">
        <CompetencyFrameworkTable {...args} />
        <StoryNote>
          One row, at its strongest scope, as built by default. See review and
          prescribe systemic anti-cancer therapy.
        </StoryNote>
      </Stack>
      <Stack gap="sm">
        <CompetencyFrameworkTable {...args} rowPerScope />
        <StoryNote>A row for each tumour site.</StoryNote>
      </Stack>
    </Stack>
  ),
};
