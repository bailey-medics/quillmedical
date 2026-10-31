/**
 * CompetencyFrameworkTable Storybook Stories
 *
 * One framework's table, as the By competency view of the passport draws
 * it. The choices settled at the Phase 1 review of the passport landing
 * views plan are built in: no signed count, a declined sign-off reads as
 * not asked, and a scoped competency has a row for each site with a
 * sign-off.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Stack } from "@mantine/core";
import { fn } from "storybook/test";
import CompetencyFrameworkTable from "./CompetencyFrameworkTable";
import {
  breastCompetency,
  lungCompetency,
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

/**
 * A competency signed off one tumour site at a time: a row for each site
 * that is signed off or requested, and none for a site with nothing asked.
 */
export const ScopedCompetency: Story = {
  args: {
    framework: sact,
    competencies: [
      lungCompetency,
      { ...breastCompetency, status: "requested", signed_on: null },
      {
        ...lungCompetency,
        scope: { id: "colorectal", name: "Colorectal" },
        status: "requested",
        sign_off: null,
        logbook_entries: 4,
      },
    ],
  },
  render: (args) => (
    <Stack gap="sm">
      <CompetencyFrameworkTable {...args} />
      <StoryNote>
        Review and prescribe systemic anti-cancer therapy is signed off for lung
        and requested for breast. Colorectal has logbook entries and no
        sign-off, so it has no row.
      </StoryNote>
    </Stack>
  ),
};
