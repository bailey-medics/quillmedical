/**
 * SlideLayoutTextWithFigure
 *
 * Stacked layout: heading, then image with caption, then body text
 * and optional callout underneath.
 */

import { Stack } from "@mantine/core";
import Heading from "@/components/typography/Heading";
import MarkdownView from "@/components/typography/MarkdownView";
import Figure from "@/components/teaching/figure/Figure";
import Callout from "@/components/teaching/callout/Callout";
import type { CompiledSlide } from "@/features/teaching/types";

export interface SlideLayoutTextWithFigureProps {
  slide: CompiledSlide;
}

export default function SlideLayoutTextWithFigure({
  slide,
}: SlideLayoutTextWithFigureProps) {
  return (
    <Stack gap="md">
      <Heading>{slide.title}</Heading>
      {slide.imageSrc && (
        <Figure
          src={slide.imageSrc}
          alt={slide.imageAlt ?? slide.title}
          caption={slide.imageCaption}
        />
      )}
      {slide.body && <MarkdownView source={slide.body} />}
      {slide.calloutType && slide.calloutBody && (
        <Callout type={slide.calloutType}>{slide.calloutBody}</Callout>
      )}
    </Stack>
  );
}
