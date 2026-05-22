/**
 * Teaching Layout-Complete Stories
 *
 * Full-page compositions showing teaching components with the
 * TeachingLayout and LearningNav sidebar (no patient demographics,
 * no standard SideNav).
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import TeachingLayout from "@/components/layouts/TeachingLayout";
import PageHeader from "@/components/typography/PageHeader";
import TeachingLearningNav from "@/components/navigation/teaching/TeachingLearningNav";
import VideoPlayer from "./video-player/VideoPlayer";
import SlideViewer from "./slide-viewer/SlideViewer";
import PreviousNextButton from "@/components/button/PreviousNextButton";
import {
  stubSlides,
  videoSlide,
  textWithFigureSlide,
  calloutSlide,
} from "./slide-layouts/stubSlides";

const meta: Meta = {
  title: "Teaching/Layouts/Learning complete",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

/** Build a TeachingLearningNav sidebar for the given slide index */
function learningNav(currentIndex: number, onNavigate?: () => void) {
  return (
    <TeachingLearningNav
      slides={stubSlides}
      currentIndex={currentIndex}
      onNavigate={onNavigate ?? (() => {})}
      onExit={() => {}}
    />
  );
}

export const WithVideoPlayer: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout sidebar={learningNav(1)} footerText="Logged in: dr.jones">
      <PageHeader title="Recorded lecture" />
      <VideoPlayer youtubeId="2OTbDQh3MxM" />
      <Box hiddenFrom="sm">
        <PreviousNextButton
          onPrevious={() => {}}
          onNext={() => {}}
          nextLabel="Next"
        />
      </Box>
    </TeachingLayout>
  ),
};

export const SlideWithTextAndFigure: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout sidebar={learningNav(3)} footerText="Logged in: dr.jones">
      <SlideViewer slide={textWithFigureSlide} />
      <Box hiddenFrom="sm">
        <PreviousNextButton
          onPrevious={() => {}}
          onNext={() => {}}
          nextLabel="Next"
        />
      </Box>
    </TeachingLayout>
  ),
};

export const SlideWithCallout: Story = {
  tags: ["!test"],
  render: () => (
    <TeachingLayout sidebar={learningNav(5)} footerText="Logged in: dr.jones">
      <SlideViewer slide={calloutSlide} />
      <Box hiddenFrom="sm">
        <PreviousNextButton
          onPrevious={() => {}}
          onNext={() => {}}
          nextLabel="Next"
        />
      </Box>
    </TeachingLayout>
  ),
};

export const DarkModeVideo: Story = {
  tags: ["!test"],
  globals: { colorScheme: "dark" },
  render: () => (
    <TeachingLayout sidebar={learningNav(1)} footerText="Logged in: dr.jones">
      <SlideViewer slide={videoSlide} />
      <Box hiddenFrom="sm">
        <PreviousNextButton
          onPrevious={() => {}}
          onNext={() => {}}
          nextLabel="Next"
        />
      </Box>
    </TeachingLayout>
  ),
};
