/**
 * PictureActionCard Component
 *
 * A card with a title, optional cover image, description, and
 * call-to-action button. Extends the ActionCard pattern with an
 * image slot between the title and description.
 */

import { Image, Stack, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import ActionCardButton from "@/components/button/ActionCardButton";
import BodyText from "@/components/typography/BodyText";
import Heading from "@/components/typography/Heading";
import BaseCard from "@/components/base-card/BaseCard";

export interface PictureActionCardProps {
  /** Card title */
  title: string;
  /** Cover image URL (null hides the image) */
  imageSrc?: string | null;
  /** Image alt text */
  imageAlt?: string;
  /** Focal point for vertical image cropping (0 = top, 50 = centre, 100 = bottom) */
  imageFocus?: number | null;
  /** Card description */
  description: string;
  /** Button label text */
  buttonLabel: string;
  /** Button destination URL */
  buttonUrl: string;
  /** Optional onClick handler (overrides URL navigation if provided) */
  onClick?: () => void;
}

export default function PictureActionCard({
  title,
  description,
  imageSrc,
  imageAlt,
  imageFocus,
  buttonLabel,
  buttonUrl,
  onClick,
}: PictureActionCardProps) {
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);

  return (
    <BaseCard maw="50rem" h="100%">
      <Stack gap="md" h="100%">
        <Heading>{title}</Heading>

        {imageSrc && (
          <Image
            src={imageSrc}
            alt={imageAlt || title}
            radius="md"
            w="100%"
            h={isMobile ? 180 : 200}
            fit="cover"
            style={{ objectPosition: `50% ${imageFocus ?? 50}%` }}
          />
        )}

        <BodyText>{description}</BodyText>

        <div
          style={{
            marginTop: "auto",
            marginBottom: "calc(var(--mantine-spacing-md) * -0.5)",
          }}
        />

        <ActionCardButton
          label={buttonLabel}
          url={buttonUrl}
          onClick={onClick}
        />
      </Stack>
    </BaseCard>
  );
}
