/**
 * ConfirmModal Component
 *
 * A reusable confirmation modal for destructive or irreversible actions.
 * Acts as a safety gate _before_ submission — not a post-action acknowledgement.
 *
 * @example
 * ```tsx
 * <ConfirmModal
 *   opened={showConfirm}
 *   onClose={() => setShowConfirm(false)}
 *   onAccept={handleRemoveStaff}
 *   title="Remove staff member"
 *   acceptLabel="Remove"
 *   icon={<IconAlertTriangle />}
 * >
 *   Are you sure you want to remove Dr Smith from this organisation?
 * </ConfirmModal>
 * ```
 */

import { Box, Modal, Stack } from "@mantine/core";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useState } from "react";
import ButtonPairRed from "@/components/button/ButtonPairRed";
import Heading from "@/components/typography/Heading";
import BodyText from "@/components/typography/BodyText";
import Icon from "@/components/icons/Icon";

export interface ConfirmModalProps {
  /** Controls modal visibility */
  opened: boolean;
  /** Called on Cancel or Escape */
  onClose: () => void;
  /** Async-aware action handler; component manages loading state */
  onAccept: () => void | Promise<void>;
  /** Message body */
  children: ReactNode;
  /** Bold centred heading between icon and message */
  title?: string;
  /** Red action button label */
  acceptLabel?: string;
  /** Label shown on accept button during async operation (e.g. "Booking…") */
  submittingLabel?: string;
  /** Outline button label */
  cancelLabel?: string;
  /** Centred icon above title/message */
  icon?: ReactElement;
}

export default function ConfirmModal({
  opened,
  onClose,
  onAccept,
  children,
  title,
  acceptLabel = "Confirm",
  submittingLabel = "Confirming\u2026",
  cancelLabel = "Cancel",
  icon,
}: ConfirmModalProps) {
  const [loading, setLoading] = useState(false);

  const handleAccept = useCallback(async () => {
    setLoading(true);
    try {
      await onAccept();
      onClose();
    } catch {
      // Stay open — caller handles error display
      setLoading(false);
    }
  }, [onAccept, onClose]);

  const handleTransitionEnd = useCallback(() => {
    if (!opened) {
      setLoading(false);
    }
  }, [opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={false}
      closeOnEscape={!loading}
      withCloseButton={false}
      centered
      size="md"
      onTransitionEnd={handleTransitionEnd}
    >
      <Stack gap="md" py="md">
        {icon && (
          <Box ta="center" mb="calc(-1 * var(--mantine-spacing-xs))">
            <Icon icon={icon} size="xl" colour="var(--alert-color)" />
          </Box>
        )}
        {title && <Heading justify="centre">{title}</Heading>}
        <BodyText justify="centre">{children}</BodyText>
        <ButtonPairRed
          onAccept={handleAccept}
          onCancel={onClose}
          acceptLabel={acceptLabel}
          submittingLabel={submittingLabel}
          cancelLabel={cancelLabel}
          acceptDisabled={loading}
          acceptLoading={loading}
          justify="center"
        />
      </Stack>
    </Modal>
  );
}
