/**
 * SlideLayoutDefault
 *
 * Standard text-and-content slide layout. Used for ## headings
 * with no explicit layout attribute.
 */

import { Stack } from "@mantine/core";
import Heading from "@/components/typography/Heading";
import MarkdownView from "@/components/typography/MarkdownView";
import Callout from "@/components/teaching/callout/Callout";
import type { CompiledSlide } from "@/features/teaching/types";

export interface SlideLayoutDefaultProps {
  slide: CompiledSlide;
}

export default function SlideLayoutDefault({ slide }: SlideLayoutDefaultProps) {
  return (
    <Stack gap="md">
      <Heading>{slide.title}</Heading>
      {slide.body && <MarkdownView source={slide.body} />}
      {slide.calloutType && slide.calloutBody && (
        <Callout type={slide.calloutType}>{slide.calloutBody}</Callout>
      )}
    </Stack>
  );
}
