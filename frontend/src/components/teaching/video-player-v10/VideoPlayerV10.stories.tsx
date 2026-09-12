/**
 * VideoPlayerV10 Stories — a side-by-side evaluation.
 *
 * The point of these is the control bar. `react-player` hands playback to
 * the browser, which draws controls CSS cannot reach; v10 builds them from
 * ordinary elements. Put the two next to each other and the difference is
 * visible rather than argued.
 *
 * Nothing in the app renders VideoPlayerV10 — see the component for why.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import VideoPlayerV10 from "./VideoPlayerV10";
import VideoPlayer from "@/components/teaching/video-player/VideoPlayer";
import { Heading } from "@/components/typography";
import { StoryNote } from "@/stories/variants";

/** The sample clip in `public/teaching/`, served by Storybook's staticDirs. */
const SAMPLE = "/teaching/sample/ltd-transition.mp4";

const meta: Meta<typeof VideoPlayerV10> = {
  title: "Teaching/Video player v10 (evaluation)",
  component: VideoPlayerV10,
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof VideoPlayerV10>;

export const HostedVideo: Story = {
  args: { src: SAMPLE },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>
        Video.js v10. The controls are ordinary elements with class names, so
        colours, shapes and order are ours to change.
      </StoryNote>
    </Stack>
  ),
};

export const SideBySideWithReactPlayer: Story = {
  render: () => (
    <Stack gap="lg">
      <Stack gap="xs">
        <Heading>Video.js v10</Heading>
        <VideoPlayerV10 src={SAMPLE} />
      </Stack>
      <Stack gap="xs">
        <Heading>react-player (what the app uses)</Heading>
        <VideoPlayer src={SAMPLE} />
      </Stack>
      <StoryNote>
        The same clip in the same frame, so any difference is the player's
        doing. The lower one delegates to the browser, which is why its controls
        look different in Chrome, Safari and Firefox — and why they cannot be
        restyled.
      </StoryNote>
    </Stack>
  ),
};

export const YoutubeVideo: Story = {
  args: { youtubeId: "dQw4w9WgXcQ" },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>
        Teaching slides carry both YouTube and hosted video through one
        component, so v10 has to read both. YouTube arrives via the optional
        `@videojs/youtube-video` source package.
      </StoryNote>
    </Stack>
  ),
};

export const WithPoster: Story = {
  args: {
    src: SAMPLE,
    posterUrl: "/teaching/colonoscopy-optical-diagnosis-test.png",
  },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>
        The still shown before playback begins. `VideoPlayer` accepts a poster
        too but is never given one — the cheapest visual win available without
        changing player at all.
      </StoryNote>
    </Stack>
  ),
};

export const WithCaptions: Story = {
  args: {
    src: SAMPLE,
    captionsUrl: "/teaching/sample/ltd-transition.vtt",
  },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>
        The open question in this evaluation. Captions are a WCAG 2.1 AA
        requirement, and the arrangement `VideoPlayer` arrived at was hard-won.
        No caption file ships yet, so this shows the control rather than real
        subtitles.
      </StoryNote>
    </Stack>
  ),
};
