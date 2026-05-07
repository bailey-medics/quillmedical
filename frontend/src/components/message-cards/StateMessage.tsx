/**
 * State Message Component
 *
 * Displays informational messages for different application states.
 * Uses BaseCard with a background colour — border is automatically
 * removed, text set to white.
 */

import type { ReactElement } from "react";
import { Box, Group, Stack } from "@mantine/core";
import {
  IconAlertCircle,
  IconCalendar,
  IconClock,
  IconFileText,
  IconMail,
  IconMessage,
  IconPencil,
  IconShieldCheck,
  IconUserOff,
} from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import BaseCard from "@/components/base-card/BaseCard";
import { BodyTextInline, Heading } from "@/components/typography";
import { statusColours } from "@/styles/semanticColours";

/** All supported state message types */
export type StateMessageType =
  | "database-initialising"
  | "no-access"
  | "no-patients"
  | "no-letters"
  | "no-messages"
  | "no-notes"
  | "no-documents"
  | "no-appointments"
  | "error";

type Props =
  | {
      /** Type of message to display */
      type: Exclude<StateMessageType, "error">;
    }
  | {
      /** Error type requires a message */
      type: "error";
      /** Error message to display */
      message: string;
    };

type StateConfig = {
  icon: ReactElement;
  colour: string;
  title: string;
  description: string;
};

const STATE_CONFIG: Record<Exclude<StateMessageType, "error">, StateConfig> = {
  "database-initialising": {
    icon: <IconClock />,
    colour: statusColours.info.bg,
    title: "Database is initialising",
    description:
      "The Quill databases are just warming up. This may take a few moments. The patient list will appear automatically once available.",
  },
  "no-access": {
    icon: <IconShieldCheck />,
    colour: statusColours.info.bg,
    title: "No access yet",
    description:
      "Your account doesn't have access to this feature yet. Please contact your organisation administrator for assistance.",
  },
  "no-patients": {
    icon: <IconUserOff />,
    colour: statusColours.warning.bg,
    title: "No patients to show",
    description: "There are currently no patients in the system.",
  },
  "no-letters": {
    icon: <IconMail />,
    colour: statusColours.warning.bg,
    title: "No letters to show",
    description: "There are no clinical letters for this patient yet.",
  },
  "no-messages": {
    icon: <IconMessage />,
    colour: statusColours.warning.bg,
    title: "No messages to show",
    description: "Messages from your care team will appear here.",
  },
  "no-notes": {
    icon: <IconPencil />,
    colour: statusColours.warning.bg,
    title: "No notes to show",
    description: "There are no clinical notes for this patient yet.",
  },
  "no-documents": {
    icon: <IconFileText />,
    colour: statusColours.warning.bg,
    title: "No documents to show",
    description: "There are no documents for this patient yet.",
  },
  "no-appointments": {
    icon: <IconCalendar />,
    colour: statusColours.warning.bg,
    title: "No appointments to show",
    description: "There are no appointments scheduled for this patient.",
  },
};

/**
 * State Message
 *
 * Renders context-aware messages for application states.
 * Uses BaseCard with status colours to distinguish between
 * system initialisation, empty state, and error conditions.
 */
export default function StateMessage(props: Props) {
  if (props.type === "error") {
    return (
      <BaseCard bg={statusColours.alert.bg} data-testid="state-message">
        <Group gap="md" wrap="nowrap" align="flex-start">
          <Box style={{ flexShrink: 0 }}>
            <Icon icon={<IconAlertCircle />} size="lg" />
          </Box>
          <Stack gap={4}>
            <Heading c="white">Error loading data</Heading>
            <BodyTextInline c="white">{props.message}</BodyTextInline>
          </Stack>
        </Group>
      </BaseCard>
    );
  }

  const { icon, colour, title, description } = STATE_CONFIG[props.type];

  return (
    <BaseCard bg={colour} data-testid="state-message">
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
