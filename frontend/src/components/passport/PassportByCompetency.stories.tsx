/**
 * PassportByCompetency Storybook Stories
 *
 * The By competency view of the passport page, under the page's title, as
 * the holder would see it. Drawn here to be agreed before the page is
 * switched over: see the passport landing views plan.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import PassportByCompetency from "./PassportByCompetency";
import { oncologyCompetencies, oncologyFrameworks } from "./fixtures";
import { PageHeader } from "@/components/typography";

// The Gloucestershire radiotherapy record only: the SACT framework is left
// out of this view's stories.
const gloucestershire = oncologyFrameworks.filter(
  (framework) => framework.id === "ghnft_radiotherapy_record",
);

const meta: Meta<typeof PassportByCompetency> = {
  title: "Passport/By competency view",
  component: PassportByCompetency,
  parameters: { layout: "padded" },
  args: {
    frameworks: gloucestershire,
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
 * radiotherapy record.
 */
export const Default: Story = {};

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
