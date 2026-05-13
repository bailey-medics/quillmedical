/**
 * OfflineModal Component
 *
 * Contextual modal shown when a user attempts a navigation or mutation
 * while offline. Wraps the OfflineOverlay card content in a Mantine
 * Modal with a single dismiss button.
 *
 * Pure presentational — visibility controlled by parent via `opened`.
 */

import { Modal, Stack } from "@mantine/core";
import Icon from "@/components/icons";
import { BodyText, Heading } from "@/components/typography";
import ButtonPair from "@/components/button/ButtonPair";
import { IconWifiOff } from "@/components/icons/appIcons";

export interface OfflineModalProps {
  /** Controls modal visibility */
  opened: boolean;
  /** Called when the user dismisses the modal */
  onClose: () => void;
}

/**
 * Offline Modal
 *
 * Informs the user that their action could not be completed because
 * the app is offline. Single "OK" button to dismiss — the blocked
 * action is not retried.
 */
export default function OfflineModal({ opened, onClose }: OfflineModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      closeOnClickOutside
      centered
      size="md"
    >
      <Stack align="center" gap="md" py="md">
        <Icon icon={<IconWifiOff />} size="xl" colour="var(--alert-color)" />
        <Heading justify="centre">You are offline</Heading>
        <BodyText justify="centre">
          Quill is offline. Your text is preserved in this form. Reconnect to
          save.
        </BodyText>
        <ButtonPair onAccept={onClose} />
      </Stack>
    </Modal>
  );
}
