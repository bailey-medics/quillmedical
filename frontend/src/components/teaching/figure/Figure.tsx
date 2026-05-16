/**
 * Figure Component
 *
 * Image with optional caption for learning content slides.
 * In Phase 1 uses direct image URLs; in V2 the `src` filename
 * will be resolved to a signed GCS URL at runtime.
 */

import { Box, Image, Stack } from "@mantine/core";
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
    <Stack gap="xs" component="figure" style={{ margin: 0 }} align="center">
      <Box
        style={{
          overflow: "hidden",
          borderRadius: "var(--mantine-radius-md)",
          width: "fit-content",
          maxWidth: "100%",
        }}
      >
        <Image
          src={src}
          alt={alt}
          style={{ maxHeight: "80vh", maxWidth: "100%", display: "block" }}
        />
      </Box>
      {caption && <BodyText justify="centre">{caption}</BodyText>}
    </Stack>
  );
}
