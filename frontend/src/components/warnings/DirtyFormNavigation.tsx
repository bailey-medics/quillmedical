/**
 * Dirty Form Navigation Warning Component
 *
 * Modal that warns users when attempting to navigate away from a page
 * with unsaved form changes. Uses React Router's useBlocker functionality.
 *
 * @module DirtyFormNavigation
 */

import { Modal, Stack } from "@mantine/core";
import { IconAlertTriangle } from "@/components/icons/appIcons";
import type { Blocker } from "react-router-dom";

import { ButtonPairRed } from "@/components/button";
import BodyTextBold from "@/components/typography/BodyTextBold";
import Icon from "@/components/icons/Icon";

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
      centered
      withCloseButton={false}
      radius="md"
      styles={{
        content: {
          border: "1px solid rgba(0, 0, 0, 0.1)",
        },
      }}
    >
      <Stack gap="md" align="center" pt="xl">
        <Icon icon={<IconAlertTriangle />} size="xl" colour="red" />
        <BodyTextBold justify="centre">
          You have unsaved changes. Are you sure you want to leave this page?
        </BodyTextBold>
        <ButtonPairRed
          cancelLabel="Stay on page"
          acceptLabel="Leave page"
          onCancel={() => blocker.reset?.()}
          onAccept={handleProceed}
        />
      </Stack>
    </Modal>
  );
}
