/**
 * PassportByCompetency Storybook Stories
 *
 * The By competency view of the passport page, under the page's title, as
 * the holder would see it. Drawn here to be agreed before the page is
 * switched over: see the passport landing views plan.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Stack } from "@mantine/core";
import { fn } from "storybook/test";
import PassportByCompetency from "./PassportByCompetency";
import { oncologyCompetencies, oncologyFrameworks } from "./fixtures";
import { PageHeader } from "@/components/typography";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof PassportByCompetency> = {
  title: "Passport/By competency view",
  component: PassportByCompetency,
  parameters: { layout: "padded" },
  args: {
    frameworks: oncologyFrameworks,
    competencies: oncologyCompetencies,
    onSelectCompetency: fn(),
    onOpen: fn(),
  },
  render: (args) => (
    <Stack gap="lg">
      <PageHeader title="My passport" />
      <PassportByCompetency {...args} />
    </Stack>
  ),
};

export default meta;
type Story = StoryObj<typeof PassportByCompetency>;

/**
 * A clinical oncology registrar working to the Gloucestershire
 * radiotherapy record and the SACT prescriber competencies.
 */
export const Default: Story = {};

/** One framework only. */
export const OneFramework: Story = {
  args: { frameworks: [oncologyFrameworks[0]] },
};

/** A new passport with nothing recorded: every competency is not asked. */
export const NothingRecorded: Story = {
  args: { competencies: [] },
};

/**
 * No frameworks chosen. The page says where to choose them above this, so
 * the view itself is only the cards.
 */
export const NoFrameworks: Story = {
  args: { frameworks: [] },
};

/** On a phone, tables become cards and the section cards stack. */
export const Phone: Story = {
  render: (args) => (
    <Stack gap="sm">
      <Box maw="23.4375rem">
        <Stack gap="lg">
          <PageHeader title="My passport" />
          <PassportByCompetency {...args} />
        </Stack>
      </Box>
      <StoryNote>
        Constrained to a 375 pixel phone width. The tables become cards here,
        but the section cards follow the width of the browser window, so narrow
        the window to see them stack.
      </StoryNote>
    </Stack>
  ),
};

/** To decide: with a signed count under each framework's name. */
export const WithSignedCount: Story = {
  args: { showSignedCount: true },
};
