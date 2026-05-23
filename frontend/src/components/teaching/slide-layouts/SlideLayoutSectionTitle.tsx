/**
 * SlideLayoutSectionTitle
 *
 * Full-slide section title layout with large centred heading and
 * optional body content. Used for intro/summary dividers (# headings).
 */

import { Center, Stack } from "@mantine/core";
import PageHeader from "@/components/typography/PageHeader";
import MarkdownView from "@/components/typography/MarkdownView";
import type { CompiledSlide } from "@/features/teaching/types";

export interface SlideLayoutSectionTitleProps {
  slide: CompiledSlide;
}

export default function SlideLayoutSectionTitle({
  slide,
}: SlideLayoutSectionTitleProps) {
  return (
    <Center mih="60vh">
      <Stack gap="lg" align="center" maw="40rem">
        <PageHeader title={slide.title} />
        {slide.body && <MarkdownView source={slide.body} />}
      </Stack>
    </Center>
  );
}
