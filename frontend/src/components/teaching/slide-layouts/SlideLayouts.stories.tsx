import type { Meta, StoryObj } from "@storybook/react-vite";
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
