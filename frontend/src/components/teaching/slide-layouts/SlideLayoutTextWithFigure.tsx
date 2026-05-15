/**
 * SlideLayoutTextWithFigure
 *
 * Split layout: text on one side, image on the other.
 * On mobile the image stacks below the text.
 */

import { SimpleGrid, Stack } from "@mantine/core";
import Heading from "@/components/typography/Heading";
import BodyText from "@/components/typography/BodyText";
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
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Stack gap="md">
          {slide.body && <BodyText>{slide.body}</BodyText>}
          {slide.calloutType && slide.calloutBody && (
            <Callout type={slide.calloutType}>{slide.calloutBody}</Callout>
          )}
        </Stack>
        {slide.imageSrc && (
          <Figure
            src={slide.imageSrc}
            alt={slide.imageAlt ?? slide.title}
            caption={slide.imageCaption}
          />
        )}
      </SimpleGrid>
    </Stack>
  );
}
