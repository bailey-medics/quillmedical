/**
 * Dirty Form Navigation Warning Component
 *
 * Modal that warns users when attempting to navigate away from a page
 * with unsaved form changes. Uses React Router's useBlocker functionality.
 *
 * @module DirtyFormNavigation
 */

import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import type { Blocker } from "react-router-dom";

/**
 * Props for DirtyFormNavigation component
 */
interface DirtyFormNavigationProps {
  /** Blocker object from React Router's useBlocker hook */
  blocker: Blocker;
  /** Callback function to execute before proceeding with navigation (e.g., clear dirty flag) */
  onProceed?: () => void;
}

/**
 * Dirty Form Navigation Warning Component
 *
 * Displays a confirmation modal when a user attempts to navigate away
 * from a form with unsaved changes. Provides options to stay on the page
 * or proceed with navigation (discarding changes).
 *
 * @example
 * ```tsx
 * const [dirty, setDirty] = useState(false);
 * const blocker = useBlocker(
 *   ({ currentLocation, nextLocation }) =>
 *     dirty && currentLocation.pathname !== nextLocation.pathname
 * );
 *
 * <DirtyFormNavigation
 *   blocker={blocker}
 *   onProceed={() => setDirty(false)}
 * />
 * ```
 *
 * @param props - Component props
 * @returns Modal component for navigation confirmation
 */
export default function DirtyFormNavigation({
  blocker,
  onProceed,
}: DirtyFormNavigationProps) {
  function handleProceed() {
    if (onProceed) {
      onProceed();
    }
    blocker.proceed?.();
  }

  return (
    <Modal
      opened={blocker.state === "blocked"}
      onClose={() => blocker.reset?.()}
      title="Unsaved Changes"
      centered
    >
      <Stack gap="md" align="center">
        <IconAlertCircle size={48} color="var(--mantine-color-red-6)" />
        <Text ta="center">
          You have unsaved changes. Are you sure you want to leave this page?
        </Text>
        <Group justify="flex-end" style={{ width: "100%" }}>
          <Button variant="default" onClick={() => blocker.reset?.()}>
            Stay on Page
          </Button>
          <Button color="red" onClick={handleProceed}>
            Leave Page
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
