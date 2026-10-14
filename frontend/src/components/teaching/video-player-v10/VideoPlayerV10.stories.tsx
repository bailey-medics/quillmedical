/**
 * VideoPlayerV10 Stories.
 *
 * The same cases as the `VideoPlayer` stories, so the two players can be
 * checked against each other one behaviour at a time. The point of v10 is
 * the control bar: `react-player` hands playback to the browser, which
 * draws controls CSS cannot reach, and v10 builds them from ordinary
 * elements.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack } from "@mantine/core";
import VideoPlayerV10 from "./VideoPlayerV10";
import VideoPlayer from "@/components/teaching/video-player/VideoPlayer";
import { Heading } from "@/components/typography";
import { StoryNote } from "@/stories/variants";
import publicAsset from "@lib/publicAsset";

/** The sample clip in `public/teaching/`, served by Storybook's staticDirs. */
const SAMPLE = "/teaching/sample/ltd-transition.mp4";

/** Captions written for the sample clip, including a two-line cue. */
const SAMPLE_CAPTIONS = "/teaching/sample/ltd-transition.vtt";

const meta: Meta<typeof VideoPlayerV10> = {
  title: "Teaching/Video player v10",
  component: VideoPlayerV10,
  parameters: {
    layout: "padded",
    a11y: {
      config: {
        rules: [
          {
            // Video.js draws the time toggle itself: it shows "0:21" and
            // names it "21 seconds remaining", which axe 4.14 refuses.
            // That markup is not ours to change, so only this element is
            // let off this one rule.
            id: "label-content-name-mismatch",
            selector: "*:not(.media-time-toggle)",
          },
        ],
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof VideoPlayerV10>;

export const YouTube: Story = {
  args: { youtubeId: "2OTbDQh3MxM" },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>
        Teaching slides carry both YouTube and hosted video through one
        component. YouTube plays in its own frame, under the same control bar as
        a hosted video.
      </StoryNote>
    </Stack>
  ),
};

export const WithResumePosition: Story = {
  args: { src: SAMPLE, resumeAt: 8 },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>
        Opens eight seconds in, where a returning learner left off, and does not
        jump back there when they seek.
      </StoryNote>
    </Stack>
  ),
};

export const HostedWithQualitySwitch: Story = {
  // The query string makes the second source a different address, so
  // the switch reloads the video as it does between two real files.
  args: { src: SAMPLE, src1080p: `${SAMPLE}?rendition=1080p` },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>
        The control appears only because a 1080p rendition exists. Switching
        keeps the playback position, so changing quality part-way through a
        lecture does not start it again. Both sources are the same clip here -
        the switch is what is being shown, not the difference in picture.
      </StoryNote>
    </Stack>
  ),
};

export const HostedSingleRendition: Story = {
  args: { src: SAMPLE },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>
        No quality control at all, rather than one with a single option. The
        controls in the bar are ordinary elements with class names, so colours,
        shapes and order are ours to change.
      </StoryNote>
    </Stack>
  ),
};

export const WithPoster: Story = {
  args: {
    src: SAMPLE,
    posterUrl: publicAsset("/teaching/colonoscopy-optical-diagnosis-test.png"),
  },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>The still shown before playback begins.</StoryNote>
    </Stack>
  ),
};

export const WithCaptions: Story = {
  args: { src: SAMPLE, captionsUrl: SAMPLE_CAPTIONS },
  render: (args) => (
    <Stack gap="sm">
      <VideoPlayerV10 {...args} />
      <StoryNote>
        Captions start switched off and are turned on with the captions button
        in the bar. The second cue runs over two lines, which is the case the
        cue background has to get right.
      </StoryNote>
    </Stack>
  ),
};

export const SideBySideWithReactPlayer: Story = {
  render: () => (
    <Stack gap="lg">
      <Stack gap="xs">
        <Heading>Video.js v10</Heading>
        <VideoPlayerV10 src={SAMPLE} captionsUrl={SAMPLE_CAPTIONS} />
      </Stack>
      <Stack gap="xs">
        <Heading>react-player</Heading>
        <VideoPlayer src={SAMPLE} captionsUrl={SAMPLE_CAPTIONS} />
      </Stack>
      <StoryNote>
        The same clip in the same frame, so any difference is the player's
        doing. The lower one delegates to the browser, which is why its controls
        look different in Chrome, Safari and Firefox - and why they cannot be
        restyled.
      </StoryNote>
    </Stack>
  ),
};

export const DarkMode: Story = {
  ...HostedSingleRendition,
  globals: { colorScheme: "dark" },
};
