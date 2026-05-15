/**
 * SlideLayoutSectionTitle
 *
 * Full-slide section title layout with large centred heading and
 * optional body content. Used for intro/summary dividers (# headings).
 */

import { Center, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import BodyText from "@/components/typography/BodyText";
import type { CompiledSlide } from "@/features/teaching/types";

export interface SlideLayoutSectionTitleProps {
  slide: CompiledSlide;
}

export default function SlideLayoutSectionTitle({
  slide,
}: SlideLayoutSectionTitleProps) {
  return (
    <Center mih="60vh">
      <Stack gap="lg" align="center" maw="40rem" ta="center">
        <PageHeader title={slide.title} />
        {slide.body && <BodyText justify="centre">{slide.body}</BodyText>}
      </Stack>
    </Center>
  );
}
