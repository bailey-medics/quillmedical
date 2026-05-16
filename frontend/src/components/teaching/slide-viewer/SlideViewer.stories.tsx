import type { Meta, StoryObj } from "@storybook/react-vite";
import SlideViewer from "./SlideViewer";
import { VariantRow, VariantStack } from "@/stories/variants";
import {
  sectionTitleSlide,
  videoSlide,
  imageSlide,
  textWithFigureSlide,
  defaultSlide,
  calloutSlide,
} from "@/components/teaching/slide-layouts/stubSlides";

const meta: Meta<typeof SlideViewer> = {
  title: "Teaching/Slide viewer",
  component: SlideViewer,
};

export default meta;
type Story = StoryObj<typeof SlideViewer>;

export const SectionTitle: Story = {
  args: { slide: sectionTitleSlide },
};

export const Video: Story = {
  args: { slide: videoSlide },
};

export const Image: Story = {
  args: { slide: imageSlide },
};

export const TextWithFigure: Story = {
  args: { slide: textWithFigureSlide },
};

export const Default: Story = {
  args: { slide: defaultSlide },
};

export const WithCallout: Story = {
  args: { slide: calloutSlide },
};

export const AllLayouts: Story = {
  render: () => (
    <VariantStack>
      <VariantRow label="Section title" horizontal={false}>
        <SlideViewer slide={sectionTitleSlide} />
      </VariantRow>
      <VariantRow label="Video" horizontal={false}>
        <SlideViewer slide={videoSlide} />
      </VariantRow>
      <VariantRow label="Image" horizontal={false}>
        <SlideViewer slide={imageSlide} />
      </VariantRow>
      <VariantRow label="Text with figure" horizontal={false}>
        <SlideViewer slide={textWithFigureSlide} />
      </VariantRow>
      <VariantRow label="Default" horizontal={false}>
        <SlideViewer slide={defaultSlide} />
      </VariantRow>
      <VariantRow label="Default with callout" horizontal={false}>
        <SlideViewer slide={calloutSlide} />
      </VariantRow>
    </VariantStack>
  ),
};

export const DarkMode: Story = {
  ...Default,
  globals: { colorScheme: "dark" },
};
