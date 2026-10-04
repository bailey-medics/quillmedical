/**
 * InboxButton Component Stories
 *
 * The count is the whole point of the component, so the stories are
 * mostly about what it looks like at each size of queue.
 */

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Stack } from "@mantine/core";
import { StoryNote, VariantRow, VariantStack } from "@/stories/variants";
import InboxButton from "./InboxButton";

const meta: Meta<typeof InboxButton> = {
  title: "Inbox/Inbox button",
  component: InboxButton,
  parameters: {
    layout: "padded",
  },
  args: {
    label: "Waiting on me",
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
          An envelope with how many things are waiting behind it. The passport
          page uses it for sign-off requests, and the top ribbon for everything
          waiting on the person signed in
        </StoryNote>
        <Story />
      </Stack>
    ),
  ],
};

export const Counts: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="nothing waiting – no badge">
        <InboxButton label="Waiting on me" count={0} onClick={() => {}} />
      </VariantRow>
      <VariantRow label="one">
        <InboxButton label="Waiting on me" count={1} onClick={() => {}} />
      </VariantRow>
      <VariantRow label="nine">
        <InboxButton label="Waiting on me" count={9} onClick={() => {}} />
      </VariantRow>
      <VariantRow label="ten and above – capped">
        <InboxButton label="Waiting on me" count={42} onClick={() => {}} />
      </VariantRow>
    </VariantStack>
  ),
};

/**
 * A strip of the ribbon's navy for the envelope to sit on. Around the
 * button alone and not the whole story: the row labels beneath are grey
 * text meant for the page, and on navy they fail the contrast check.
 */
function OnRibbon({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--brand-primary)", padding: "0.5rem 1rem" }}>
      {children}
    </div>
  );
}

/** As the top ribbon shows it: a mid grey when idle, amber when waiting. */
export const OnDark: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="nothing waiting">
        <OnRibbon>
          <InboxButton label="Waiting on me" count={0} onDark />
        </OnRibbon>
      </VariantRow>
      <VariantRow label="three waiting">
        <OnRibbon>
          <InboxButton label="Waiting on me" count={3} onDark />
        </OnRibbon>
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...Counts,
  globals: { colorScheme: "dark" },
};
