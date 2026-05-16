import type { Meta, StoryObj } from "@storybook/react-vite";
import VideoPlayer from "./VideoPlayer";

const meta: Meta<typeof VideoPlayer> = {
  title: "Teaching/Video player",
  component: VideoPlayer,
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

export const DarkMode: Story = {
  ...YouTube,
  globals: { colorScheme: "dark" },
};
