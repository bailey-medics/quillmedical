/**
 * CompetencySummary Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { fn } from "storybook/test";
import CompetencySummary from "./CompetencySummary";
import { competencies } from "./fixtures";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof CompetencySummary> = {
  title: "Passport/Competency summary",
  component: CompetencySummary,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof CompetencySummary>;

/**
 * Without `onSelect` the rows are inert: plain blocks with no hover, no
 * pointer cursor and nothing to click.
 *
 * `onSelect` is set to `undefined` explicitly rather than omitted.
 * `argTypesRegex: "^on[A-Z].*"` in `.storybook/preview.tsx` auto-fills
 * every unset `on*` prop with a spy, so omitting it would hand the
 * component a function and render every row as a button — making this
 * story indistinguishable from `Selectable`.
 */
export const Default: Story = {
  args: { competencies, onSelect: undefined },
  render: (args) => (
    <Stack gap="sm">
      <CompetencySummary {...args} />
      <StoryNote>
        Read-only. Rows have no hover state, because nothing happens if you
        click one.
      </StoryNote>
    </Stack>
  ),
};

/**
 * With `onSelect` each row becomes a button that opens the competency.
 */
export const Selectable: Story = {
  args: {
    competencies,
    onSelect: fn(),
  },
  render: (args) => (
    <Stack gap="sm">
      <CompetencySummary {...args} />
      <StoryNote>
        Rows open the competency. Hover one to see it respond; clicks appear in
        the Actions panel.
      </StoryNote>
    </Stack>
  ),
};

export const Empty: Story = {
  args: { competencies: [] },
};
