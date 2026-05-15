/**
 * SlideLayoutImage
 *
 * Single image with optional caption. For image-only slides
 * (e.g. PowerPoint-style full-image exports).
 */

import { Stack } from "@mantine/core";
import Heading from "@/components/typography/Heading";
import Figure from "@/components/teaching/figure/Figure";
import type { CompiledSlide } from "@/features/teaching/types";

export interface SlideLayoutImageProps {
  slide: CompiledSlide;
}

export default function SlideLayoutImage({ slide }: SlideLayoutImageProps) {
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
    </Stack>
  );
}
