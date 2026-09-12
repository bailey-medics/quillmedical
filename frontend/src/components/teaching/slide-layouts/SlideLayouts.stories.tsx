import { Stack } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { StoryNote } from "@/stories/variants";
import SlideLayoutSectionTitle from "./SlideLayoutSectionTitle";
import SlideLayoutVideo from "./SlideLayoutVideo";
import SlideLayoutTextWithFigure from "./SlideLayoutTextWithFigure";
import SlideLayoutDefault from "./SlideLayoutDefault";
import {
  sectionTitleSlide,
  videoSlide,
  textWithFigureSlide,
  defaultSlide,
  calloutSlide,
  hostedVideoSlide,
} from "./stubSlides";

/**
 * A short clip in `public/teaching/`, served by Storybook's staticDirs.
 *
 * Committed deliberately: the player's controls cannot be styled against
 * a placeholder, and every alternative needs a running backend. Keep it
 * small — it lives in git.
 */
const SAMPLE_VIDEO_BASE = "/teaching/sample";

const meta: Meta = {
  title: "Teaching/Slide layouts",
};

export default meta;
type Story = StoryObj;

export const NewSectionSlide: Story = {
  render: () => <SlideLayoutSectionTitle slide={sectionTitleSlide} />,
};

export const PlainTextSlide: Story = {
  render: () => <SlideLayoutDefault slide={defaultSlide} />,
};

export const YoutubeVideo: Story = {
  render: () => <SlideLayoutVideo slide={videoSlide} />,
};

export const HostedVideo: Story = {
  render: () => (
    <Stack gap="sm">
      <SlideLayoutVideo
        slide={hostedVideoSlide}
        baseUrlOverride={SAMPLE_VIDEO_BASE}
      />
      <StoryNote>
        The base URL is supplied directly here: a grant is a network call, and
        Storybook has no backend to answer it.
      </StoryNote>
    </Stack>
  ),
};

export const HostedVideoLoading: Story = {
  render: () => (
    <Stack gap="sm">
      <SlideLayoutVideo slide={hostedVideoSlide} forceLoading />
      <StoryNote>
        While the access grant is in flight: a skeleton rather than an empty
        frame, so the slide does not look broken on a slow connection. Held open
        deliberately here — in the app it lasts one network call.
      </StoryNote>
    </Stack>
  ),
};

export const HostedVideoAccessDenied: Story = {
  render: () => (
    <Stack gap="sm">
      <SlideLayoutVideo slide={hostedVideoSlide} moduleId="demo-module" />
      <StoryNote>
        What a refused or expired grant shows in place of the player. This is
        the component itself: Storybook has no backend, so the grant request
        genuinely fails and the real refusal is what you see.
      </StoryNote>
    </Stack>
  ),
};

export const FigureWithText: Story = {
  render: () => <SlideLayoutTextWithFigure slide={textWithFigureSlide} />,
};

export const DefaultWithCallout: Story = {
  render: () => <SlideLayoutDefault slide={calloutSlide} />,
};

export const DarkMode: Story = {
  render: () => <SlideLayoutDefault slide={defaultSlide} />,
  globals: { colorScheme: "dark" },
};
