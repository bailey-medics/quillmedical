import type { Meta, StoryObj } from "@storybook/react-vite";
import VideoPlayer from "./VideoPlayer";

const meta: Meta<typeof VideoPlayer> = {
  title: "Teaching/VideoPlayer",
  component: VideoPlayer,
};

export default meta;
type Story = StoryObj<typeof VideoPlayer>;

export const YouTube: Story = {
  args: {
    youtubeId: "dQw4w9WgXcQ",
  },
};

export const WithResumePosition: Story = {
  args: {
    youtubeId: "dQw4w9WgXcQ",
    resumeAt: 30,
  },
};

export const DarkMode: Story = {
  ...YouTube,
  globals: { colorScheme: "dark" },
};
