import type { Meta, StoryObj } from "@storybook/react-vite";
import { VariantRow, VariantStack } from "@/stories/variants";
import SlideLayoutSectionTitle from "./SlideLayoutSectionTitle";
import SlideLayoutVideo from "./SlideLayoutVideo";
import SlideLayoutImage from "./SlideLayoutImage";
import SlideLayoutTextWithFigure from "./SlideLayoutTextWithFigure";
import SlideLayoutDefault from "./SlideLayoutDefault";
import {
  sectionTitleSlide,
  videoSlide,
  imageSlide,
  textWithFigureSlide,
  defaultSlide,
  calloutSlide,
} from "./stubSlides";

const meta: Meta = {
  title: "Teaching/SlideLayouts",
};

export default meta;
type Story = StoryObj;

export const SectionTitle: Story = {
  render: () => <SlideLayoutSectionTitle slide={sectionTitleSlide} />,
};

export const Video: Story = {
  render: () => <SlideLayoutVideo slide={videoSlide} />,
};

export const ImageSlide: Story = {
  render: () => <SlideLayoutImage slide={imageSlide} />,
};

export const TextWithFigure: Story = {
  render: () => <SlideLayoutTextWithFigure slide={textWithFigureSlide} />,
};

export const Default: Story = {
  render: () => <SlideLayoutDefault slide={defaultSlide} />,
};

export const DefaultWithCallout: Story = {
  render: () => <SlideLayoutDefault slide={calloutSlide} />,
};

export const AllLayouts: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="Section title" horizontal={false}>
        <SlideLayoutSectionTitle slide={sectionTitleSlide} />
      </VariantRow>
      <VariantRow label="Video" horizontal={false}>
        <SlideLayoutVideo slide={videoSlide} />
      </VariantRow>
      <VariantRow label="Image" horizontal={false}>
        <SlideLayoutImage slide={imageSlide} />
      </VariantRow>
      <VariantRow label="Text with figure" horizontal={false}>
        <SlideLayoutTextWithFigure slide={textWithFigureSlide} />
      </VariantRow>
      <VariantRow label="Default" horizontal={false}>
        <SlideLayoutDefault slide={defaultSlide} />
      </VariantRow>
      <VariantRow label="Default with callout" horizontal={false}>
        <SlideLayoutDefault slide={calloutSlide} />
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="Section title" horizontal={false}>
        <SlideLayoutSectionTitle slide={sectionTitleSlide} />
      </VariantRow>
      <VariantRow label="Default with callout" horizontal={false}>
        <SlideLayoutDefault slide={calloutSlide} />
      </VariantRow>
    </VariantStack>
  ),
  globals: { colorScheme: "dark" },
};
