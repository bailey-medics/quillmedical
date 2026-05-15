/**
 * Figure Component
 *
 * Image with optional caption for learning content slides.
 * In Phase 1 uses direct image URLs; in V2 the `src` filename
 * will be resolved to a signed GCS URL at runtime.
 */

import { Image, Stack } from "@mantine/core";
import BodyText from "@/components/typography/BodyText";

export interface FigureProps {
  /** Image source URL (or filename to be resolved) */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Optional caption displayed below the image */
  caption?: string;
}

export default function Figure({ src, alt, caption }: FigureProps) {
  return (
    <Stack gap="xs" component="figure" style={{ margin: 0 }}>
      <Image src={src} alt={alt} radius="sm" fit="contain" mah="60vh" />
      {caption && (
        <BodyText c="dimmed" justify="centre">
          {caption}
        </BodyText>
      )}
    </Stack>
  );
}
