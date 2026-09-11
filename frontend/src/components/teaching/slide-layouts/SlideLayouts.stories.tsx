import { Stack } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ErrorState from "@/components/error-state/ErrorState";
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

export const Video: Story = {
  render: () => <SlideLayoutVideo slide={videoSlide} />,
};

export const HostedVideo: Story = {
  render: () => (
    <SlideLayoutVideo slide={hostedVideoSlide} moduleId="demo-module" />
  ),
};

export const HostedVideoLoading: Story = {
  render: () => (
    <Stack gap="sm">
      <SlideLayoutVideo slide={hostedVideoSlide} moduleId="demo-module" />
      <StoryNote>
        While the access grant is in flight. A skeleton rather than an empty
        frame, so the slide does not look broken on a slow connection.
      </StoryNote>
    </Stack>
  ),
};

export const HostedVideoAccessDenied: Story = {
  render: () => (
    <Stack gap="sm">
      <ErrorState
        variant="inline"
        title="Video unavailable"
        message={
          "This video is not available — your access may have expired. " +
          "Try reloading the page."
        }
        action={{ label: "Reload page", onClick: () => {} }}
      />
      <StoryNote>
        What a refused or expired grant shows in place of the player. Rendered
        directly here, since the state depends on a failed network call the
        story cannot make.
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
