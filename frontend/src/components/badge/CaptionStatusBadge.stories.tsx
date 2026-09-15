import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import CaptionStatusBadge from "./CaptionStatusBadge";
import { StoryNote } from "@/stories/variants";

const meta: Meta<typeof CaptionStatusBadge> = {
  title: "Badge/Caption status badge",
  component: CaptionStatusBadge,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof CaptionStatusBadge>;

export const Reviewed: Story = {
  args: { status: "reviewed" },
  render: (args) => (
    <Stack gap="sm" align="flex-start">
      <CaptionStatusBadge {...args} />
      <StoryNote>
        Someone has read the transcript and saved it. Set by saving the
        captions, not by a separate button — a control that only claims review
        is a box to tick without looking.
      </StoryNote>
    </Stack>
  ),
};

export const NotReviewed: Story = {
  args: { status: "unreviewed" },
  render: (args) => (
    <Stack gap="sm" align="flex-start">
      <CaptionStatusBadge {...args} />
      <StoryNote>
        Still Whisper's transcription. Amber rather than neutral: these captions
        are already being served to learners who cannot hear the audio, so a
        misheard drug name reaches the person least able to catch it.
      </StoryNote>
    </Stack>
  ),
};

export const Loading: Story = {
  args: { status: "reviewed", isLoading: true },
};

export const DarkMode: Story = {
  ...NotReviewed,
  globals: { colorScheme: "dark" },
};
