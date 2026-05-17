/**
 * SlideLayoutDefault
 *
 * Standard text-and-content slide layout. Used for ## headings
 * with no explicit layout attribute.
 */

import { Stack } from "@mantine/core";
import Heading from "@/components/typography/Heading";
import BodyText from "@/components/typography/BodyText";
import Callout from "@/components/teaching/callout/Callout";
import type { CompiledSlide } from "@/features/teaching/types";

export interface SlideLayoutDefaultProps {
  slide: CompiledSlide;
}

export default function SlideLayoutDefault({ slide }: SlideLayoutDefaultProps) {
  return (
    <Stack gap="md">
      <Heading>{slide.title}</Heading>
      {slide.body && <BodyText>{slide.body}</BodyText>}
      {slide.calloutType && slide.calloutBody && (
        <Callout type={slide.calloutType}>{slide.calloutBody}</Callout>
      )}
    </Stack>
  );
}
