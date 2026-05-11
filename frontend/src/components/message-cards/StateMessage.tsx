/**
 * State Message Component
 *
 * Displays informational messages for different application states.
 * Uses BaseCard with a background colour — border is automatically
 * removed, text set to white.
 *
 * All content is passed via props — icon, title, description, and colour.
 * The colour prop is constrained to the design system's StatusColourName.
 */

import type { ReactElement, ReactNode } from "react";
import { Box, Group, Stack } from "@mantine/core";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import { BodyTextInline, Heading } from "@/components/typography";
import { statusColours, type StatusColourName } from "@/styles/semanticColours";

export interface StateMessageProps {
  /** Tabler icon element to display */
  icon: ReactElement;
  /** Bold title text */
  title: string;
  /** Body text or JSX content */
  description: ReactNode;
  /** Status colour name from the design system (defaults to "info") */
  colour?: StatusColourName;
}

/**
 * State Message
 *
 * Renders a coloured card with an icon, title, and description.
 * Used for empty states, informational messages, and error feedback.
 */
export default function StateMessage({
  icon,
  title,
  description,
  colour = "info",
}: StateMessageProps) {
  return (
    <BaseCard bg={statusColours[colour].bg} data-testid="state-message">
      <Group gap="md" wrap="nowrap" align="flex-start">
        <Box style={{ flexShrink: 0 }}>
          <Icon icon={icon} size="lg" />
        </Box>
        <Stack gap={4}>
          <Heading c="white">{title}</Heading>
          <BodyTextInline c="white">{description}</BodyTextInline>
        </Stack>
      </Group>
    </BaseCard>
  );
}
