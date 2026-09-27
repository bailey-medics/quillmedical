/**
 * InstallAppModal Component
 *
 * Asks whether to install Quill on this device, or explains how. What it
 * shows depends on the install route from `lib/pwa/installRoute.ts`:
 *
 * - `prompt` — the browser lets Quill start the install, so "Install" hands
 *   over to the browser's own confirmation.
 * - a manual route — the steps for that platform, with one "Got it" button.
 * - `unsupported` — why this browser cannot install Quill, and which can.
 *
 * Pure presentational: visibility and the install itself are the parent's.
 * The steps are data, in `installSteps.tsx`, so adding a platform is one
 * entry.
 */

import { Group, List, Modal, Stack } from "@mantine/core";
import { useCallback, useState } from "react";
import ButtonPair from "@/components/button/ButtonPair";
import Icon from "@/components/icons/Icon";
import { IconAlertCircle, IconDownload } from "@/components/icons/appIcons";
import { BodyText, Heading } from "@/components/typography";
import { installSteps, type InstallModalRoute } from "./installSteps";

const HEADING = "Install Quill on this device?";
const BENEFIT =
  "Installed, Quill opens full screen from its own icon and can send you notifications.";

export interface InstallAppModalProps {
  /** Controls modal visibility */
  opened: boolean;
  /** How this device installs, from `detectInstallRoute` */
  route: InstallModalRoute;
  /**
   * Start the browser's install. Only called on the `prompt` route. The
   * modal shows a loading state until it settles, then closes.
   */
  onInstall: () => void | Promise<void>;
  /** Called on "Not now", "Got it" or Escape */
  onClose: () => void;
}

export default function InstallAppModal({
  opened,
  route,
  onInstall,
  onClose,
}: InstallAppModalProps) {
  const [installing, setInstalling] = useState(false);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      await onInstall();
    } finally {
      setInstalling(false);
      onClose();
    }
  }, [onInstall, onClose]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnEscape={!installing}
      withCloseButton={false}
      centered
      size="md"
    >
      <Stack gap="md" py="md">
        <Group justify="center">
          <Icon
            icon={
              route === "unsupported" ? <IconAlertCircle /> : <IconDownload />
            }
            size="xl"
            colour="var(--info-color)"
          />
        </Group>
        {route === "unsupported" ? (
          <>
            <Heading justify="centre">
              This browser cannot install Quill
            </Heading>
            <BodyText justify="centre">
              To install Quill, open it in Chrome or Edge, or in Safari on an
              iPhone, iPad or Mac.
            </BodyText>
            <ButtonPair
              acceptLabel="Got it"
              onAccept={onClose}
              justify="center"
            />
          </>
        ) : (
          <>
            <Heading justify="centre">{HEADING}</Heading>
            <BodyText justify="centre">{BENEFIT}</BodyText>
            {route === "prompt" ? (
              <ButtonPair
                acceptLabel="Install"
                cancelLabel="Not now"
                onAccept={handleInstall}
                onCancel={onClose}
                acceptLoading={installing}
                acceptDisabled={installing}
                justify="center"
              />
            ) : (
              <>
                <List type="ordered" spacing="sm">
                  {installSteps[route].map((step) => (
                    <List.Item key={step.text}>
                      <Group gap="xs" wrap="nowrap" align="flex-start">
                        <BodyText>{step.text}</BodyText>
                        {step.icon && <Icon icon={step.icon} size="sm" />}
                      </Group>
                    </List.Item>
                  ))}
                </List>
                <ButtonPair
                  acceptLabel="Got it"
                  onAccept={onClose}
                  justify="center"
                />
              </>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
