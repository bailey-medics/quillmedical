import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import VideoPlayer from "./VideoPlayer";
import { StoryNote } from "@/stories/variants";

/** The sample clip in `public/teaching/`, served by Storybook's staticDirs. */
const SAMPLE = "/teaching/sample/ltd-transition.mp4";

const meta: Meta<typeof VideoPlayer> = {
  title: "Teaching/Video player",
  component: VideoPlayer,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof VideoPlayer>;

export const YouTube: Story = {
  args: {
    youtubeId: "2OTbDQh3MxM",
  },
};

export const WithResumePosition: Story = {
  args: {
    youtubeId: "2OTbDQh3MxM",
    resumeAt: 30,
  },
};

export const HostedWithQualitySwitch: Story = {
  args: {
    src: SAMPLE,
    src1080p: SAMPLE,
  },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayer {...args} />
      <StoryNote>
        The control appears only because a 1080p rendition exists. Switching
        keeps the playback position, so changing quality part-way through a
        lecture does not start it again. Both sources are the same file here —
        the switch is what is being shown, not the difference in picture.
      </StoryNote>
    </Stack>
  ),
};

export const HostedSingleRendition: Story = {
  args: {
    src: SAMPLE,
  },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayer {...args} />
      <StoryNote>
        No control at all, rather than one with a single option. A source
        shorter than 1080p never gets a second rendition, so there is nothing to
        choose between.
      </StoryNote>
    </Stack>
  ),
};

export const DarkMode: Story = {
  ...YouTube,
  globals: { colorScheme: "dark" },
};
