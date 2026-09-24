/**
 * InboxButton Component Stories
 *
 * The count is the whole point of the component, so the stories are
 * mostly about what it looks like at each size of queue.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import { StoryNote, VariantRow, VariantStack } from "@/stories/variants";
import InboxButton from "./InboxButton";

const meta: Meta<typeof InboxButton> = {
  title: "Passport/Inbox button",
  component: InboxButton,
  parameters: {
    layout: "padded",
  },
  args: {
    onClick: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof InboxButton>;

export const Default: Story = {
  args: {
    count: 3,
  },
  decorators: [
    (Story) => (
      <Stack gap="md">
        <StoryNote>
          The way into the assessor&apos;s queue, with how many requests are
          waiting
        </StoryNote>
        <Story />
      </Stack>
    ),
  ],
};

export const Counts: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="nothing waiting — no badge">
        <InboxButton count={0} onClick={() => {}} />
      </VariantRow>
      <VariantRow label="one">
        <InboxButton count={1} onClick={() => {}} />
      </VariantRow>
      <VariantRow label="nine">
        <InboxButton count={9} onClick={() => {}} />
      </VariantRow>
      <VariantRow label="ten and above — capped">
        <InboxButton count={42} onClick={() => {}} />
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...Counts,
  globals: { colorScheme: "dark" },
};
