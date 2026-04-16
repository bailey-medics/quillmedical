/**
 * State Message Component
 *
 * Displays informational alert messages for different application states.
 * Used to indicate database initialisation, empty lists, and error conditions.
 *
 * States:
 * - database-initialising: Blue alert with clock icon when FHIR is loading
 * - no-patients: Grey alert with user-off icon when list is empty
 * - error: Red alert with alert-circle icon for error conditions
 */

import { Alert } from "@mantine/core";
import {
  IconAlertCircle,
  IconClock,
  IconUserOff,
} from "@/components/icons/appIcons";
import Icon from "@/components/icons";
import { BodyTextBlack, HeaderText } from "@/components/typography";
import classes from "./StateMessage.module.css";

/**
 * StateMessage Props
 */
type Props =
  | {
      /** Type of message to display */
      type: "database-initialising" | "no-patients";
    }
  | {
      /** Error type requires a message */
      type: "error";
      /** Error message to display */
      message: string;
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

  if (props.type === "no-patients") {
    return (
      <Alert
        icon={<Icon icon={<IconUserOff />} size="xl" />}
        title={<HeaderText>No patients to show</HeaderText>}
        color="gray"
        variant="light"
        classNames={alertStyles}
      >
        <BodyTextBlack>
          There are currently no patients in the system.
        </BodyTextBlack>
      </Alert>
    );
  }

  // type === "database-initialising"
  return (
    <Alert
      icon={<Icon icon={<IconClock />} size="xl" />}
      title={<HeaderText>Database is initialising</HeaderText>}
      color="blue"
      variant="light"
      classNames={alertStyles}
    >
      <BodyTextBlack>
        The Quill databases are just warming up. This may take a few moments.
        The patient list will appear automatically once available.
      </BodyTextBlack>
    </Alert>
  );
}
