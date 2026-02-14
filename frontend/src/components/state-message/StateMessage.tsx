/**
 * State Message Component
 *
 * Displays informational alert messages for different patient list states.
 * Used to indicate database initialization status and empty patient lists.
 *
 * States:
 * - database-initialising: Blue alert with clock icon when FHIR is loading
 * - no-patients: Gray alert with user-off icon when list is empty
 */

import { Alert, Text } from "@mantine/core";
import { IconClock, IconUserOff } from "@tabler/icons-react";

/**
 * StateMessage Props
 */
type Props = {
  /** Type of message to display */
  type: "database-initialising" | "no-patients";
};

/**
 * State Message
 *
 * Renders context-aware alert messages for patient list states.
 * Uses appropriate icons and colors to distinguish between
 * system initialization and empty state conditions.
 *
 * @param props - Component props
 * @returns Alert component with state-specific message
 */
export default function StateMessage({ type }: Props) {
  if (type === "no-patients") {
    return (
      <Alert
        icon={<IconUserOff size={20} />}
        title="No patients to show"
        color="gray"
        variant="light"
        styles={{
          root: { maxWidth: 600 },
        }}
      >
        <Text size="sm">There are currently no patients in the system.</Text>
      </Alert>
    );
  }

  // type === "database-initialising"
  return (
    <Alert
      icon={<IconClock size={20} />}
      title="Database is initialising"
      color="blue"
      variant="light"
      styles={{
        root: { maxWidth: 600 },
      }}
    >
      <Text size="sm">
        Patient data is being retrieved. This may take a few moments. The
        patient list will appear automatically once available.
      </Text>
    </Alert>
  );
}
