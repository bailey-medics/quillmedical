/**
 * OfficerList Storybook Stories
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Container } from "@mantine/core";
import { fn } from "storybook/test";
import OfficerList from "./OfficerList";
import { StoryNote } from "@/stories/variants";
import { SAFETY_CASES } from "@lib/safety";

const meta: Meta<typeof OfficerList> = {
  title: "Safety/Officer list",
  component: OfficerList,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof OfficerList>;

export const Default: Story = {
  args: { officers: SAFETY_CASES[0].officers },
};

export const Editable: Story = {
  args: { officers: SAFETY_CASES[0].officers, onEdit: fn() },
};

/**
 * Two cards sharing a narrow row, as between 640px and about 800px.
 * The email breaks rather than pushing the edit icon out of the card.
 */
export const EditableInANarrowRow: Story = {
  args: { officers: SAFETY_CASES[0].officers, onEdit: fn() },
  render: (args) => (
    <div>
      <Container size={44 * 16} px={0}>
        <OfficerList {...args} />
      </Container>
      <StoryNote mt="xs">
        Constrained to 44rem width, two cards of about 20rem each
      </StoryNote>
    </div>
  ),
};

export const Empty: Story = {
  args: { officers: [] },
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
