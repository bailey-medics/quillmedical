/**
 * PictureActionCard Component
 *
 * A card with a title, optional cover image, description, and
 * call-to-action button. Extends the ActionCard pattern with an
 * image slot between the title and description.
 */

import { Image, Stack } from "@mantine/core";
import ActionCardButton from "@/components/button/ActionCardButton";
import BodyText from "@/components/typography/BodyText";
import Heading from "@/components/typography/Heading";
import BaseCard from "@/components/base-card/BaseCard";

export interface PictureActionCardProps {
  /** Card title */
  title: string;
  /** Cover image URL */
  imageSrc: string;
  /** Image alt text */
  imageAlt: string;
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
  buttonLabel,
  buttonUrl,
  onClick,
}: PictureActionCardProps) {
  return (
    <BaseCard maw="37.05rem" h="100%">
      <Stack gap="md" h="100%">
        <Heading>{title}</Heading>

        <Image src={imageSrc} alt={imageAlt} radius="md" h={160} fit="cover" />

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
