/**
 * State Message Component
 *
 * Displays informational alert messages for different application states.
 * Used to indicate database initialisation, empty lists, and error conditions.
 */

import type { ReactElement } from "react";
import { Alert } from "@mantine/core";
import {
  IconAlertCircle,
  IconCalendar,
  IconClock,
  IconFileText,
  IconMail,
  IconMessage,
  IconPencil,
  IconUserOff,
} from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import { BodyTextBlack, HeaderText } from "@/components/typography";
import classes from "./StateMessage.module.css";

/** All supported state message types */
export type StateMessageType =
  | "database-initialising"
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
    colour: "blue",
    title: "Database is initialising",
    description:
      "The Quill databases are just warming up. This may take a few moments. The patient list will appear automatically once available.",
  },
  "no-patients": {
    icon: <IconUserOff />,
    colour: "gray",
    title: "No patients to show",
    description: "There are currently no patients in the system.",
  },
  "no-letters": {
    icon: <IconMail />,
    colour: "gray",
    title: "No letters to show",
    description: "There are no clinical letters for this patient yet.",
  },
  "no-messages": {
    icon: <IconMessage />,
    colour: "gray",
    title: "No messages to show",
    description: "Messages from your care team will appear here.",
  },
  "no-notes": {
    icon: <IconPencil />,
    colour: "gray",
    title: "No notes to show",
    description: "There are no clinical notes for this patient yet.",
  },
  "no-documents": {
    icon: <IconFileText />,
    colour: "gray",
    title: "No documents to show",
    description: "There are no documents for this patient yet.",
  },
  "no-appointments": {
    icon: <IconCalendar />,
    colour: "gray",
    title: "No appointments to show",
    description: "There are no appointments scheduled for this patient.",
  },
};

const alertStyles = {
  root: classes.root,
  icon: classes.icon,
  title: classes.title,
};

/**
 * State Message
 *
 * Renders context-aware alert messages for application states.
 * Uses appropriate icons and colours to distinguish between
 * system initialisation, empty state, and error conditions.
 */
export default function StateMessage(props: Props) {
  if (props.type === "error") {
    return (
      <Alert
        icon={<Icon icon={<IconAlertCircle />} size="xl" />}
        title={<HeaderText>Error loading data</HeaderText>}
        color="red"
        variant="light"
        classNames={alertStyles}
      >
        <BodyTextBlack>{props.message}</BodyTextBlack>
      </Alert>
    );
  }

  const { icon, colour, title, description } = STATE_CONFIG[props.type];

  return (
    <Alert
      icon={<Icon icon={icon} size="xl" />}
      title={<HeaderText>{title}</HeaderText>}
      color={colour}
      variant="light"
      classNames={alertStyles}
    >
      <BodyTextBlack>{description}</BodyTextBlack>
    </Alert>
  );
}
