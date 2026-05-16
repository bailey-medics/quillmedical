/**
 * Callout Component
 *
 * Styled call-out box for learning content. Uses BaseCard with a
 * status colour background, matching StateMessage and other coloured
 * cards across the app.
 *
 * Uses the shared status colour palette for visual consistency
 * with badges, StateMessage, and other coloured UI across the app.
 */

import { Box, Group, Stack } from "@mantine/core";
import {
  IconInfoCircle,
  IconAlertTriangle,
  IconCircleCheck,
} from "@/components/icons/appIcons";
import type { ReactElement, ReactNode } from "react";
import BaseCard from "@/components/base-card/BaseCard";
import Icon from "@/components/icons";
import BodyText from "@/components/typography/BodyText";
import { statusColours, type StatusColourName } from "@/styles/semanticColours";

export type CalloutType = Extract<
  StatusColourName,
  "info" | "warning" | "success"
>;

export interface CalloutProps {
  /** Callout variant */
  type: CalloutType;
  /** Callout content */
  children: ReactNode;
}

const iconMap: Record<CalloutType, ReactElement> = {
  info: <IconInfoCircle />,
  warning: <IconAlertTriangle />,
  success: <IconCircleCheck />,
};

export default function Callout({ type, children }: CalloutProps) {
  return (
    <BaseCard bg={statusColours[type].bg} role="alert">
      <Group gap="md" wrap="nowrap" align="center">
        <Box style={{ flexShrink: 0, transform: "translateY(4.5px)" }}>
          <Icon icon={iconMap[type]} size="lg" />
        </Box>
        <Stack gap={4}>
          <BodyText c="white">{children}</BodyText>
        </Stack>
      </Group>
    </BaseCard>
  );
}
