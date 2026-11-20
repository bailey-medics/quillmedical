/**
 * ConfirmModal Component
 *
 * A reusable confirmation modal for destructive or irreversible actions.
 * Acts as a safety gate _before_ submission - not a post-action acknowledgement.
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

import { Box, Modal, Stack, VisuallyHidden } from "@mantine/core";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import ButtonPair from "@/components/button/ButtonPair";
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
  /**
   * The dialog's name for a screen reader when there is no `title`.
   * Hidden on screen. Ignored when `title` is given.
   */
  accessibleTitle?: string;
  /** Red action button label */
  acceptLabel?: string;
  /** Label shown on accept button during async operation (e.g. "Booking…") */
  submittingLabel?: string;
  /** Outline button label */
  cancelLabel?: string;
  /** Centred icon above title/message */
  icon?: ReactElement;
  /** Use red (destructive) or blue (non-destructive) accept button. Defaults to true */
  destructive?: boolean;
  /**
   * A field the action needs, beneath the message: a password, say.
   * Kept out of `children`, which is a paragraph and cannot hold one.
   */
  field?: ReactNode;
}

export default function ConfirmModal({
  opened,
  onClose,
  onAccept,
  children,
  title,
  accessibleTitle = "Confirm action",
  acceptLabel = "Confirm",
  submittingLabel = "Confirming\u2026",
  cancelLabel = "Cancel",
  icon,
  destructive = true,
  field,
}: ConfirmModalProps) {
  // `pending` runs from a press of the accept button until onAccept
  // settles, and is the only thing that blocks a second press. The ref
  // answers before React has re-rendered, so two clicks in one tick still
  // call onAccept once; the state drives what is drawn.
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  // `succeeded` keeps the button on its submitting label while the modal
  // fades out, so it does not flick back to its resting label.
  const [succeeded, setSucceeded] = useState(false);
  const loading = pending || succeeded;

  // Each opening has its own number, so a request started in one opening
  // cannot close a later one when it finally settles.
  const openingRef = useRef(0);
  useEffect(() => {
    if (opened) openingRef.current += 1;
  }, [opened]);

  const handleAccept = useCallback(async () => {
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    const opening = openingRef.current;

    try {
      await onAccept();
      if (opening === openingRef.current) {
        setSucceeded(true);
        onClose();
      }
    } catch {
      // Stay open - caller handles error display
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, [onAccept, onClose]);

  // `succeeded` must be off again by the next time the modal opens, and
  // the same instance is usually reused: its parent keeps it mounted and
  // only flips `opened`.
  //
  // Two resets, because the first has been missed before. This used to
  // hang off `onTransitionEnd`, which Mantine's Modal does not have: it
  // fell through to the DOM as the browser's `transitionend` event, and
  // that races the timer Mantine unmounts the modal on. When the unmount
  // won, or there was no animation at all (reduced motion), nothing
  // cleared it and the button came back disabled, reading "Confirming…",
  // until the page was left.
  const handleExited = useCallback(() => setSucceeded(false), []);

  // Adjusted during render rather than in an effect, so the modal never
  // paints open with the stale state. `pending` is left alone: a modal
  // reopened while its request still runs stays blocked until it settles.
  const [wasOpened, setWasOpened] = useState(opened);
  if (opened !== wasOpened) {
    setWasOpened(opened);
    if (opened) setSucceeded(false);
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={false}
      closeOnEscape={!loading}
      withCloseButton={false}
      centered
      size="lg"
      onExitTransitionEnd={handleExited}
    >
      <Stack gap="md" py="md">
        {icon && (
          <Box ta="center" mb="calc(-1 * var(--mantine-spacing-xs))">
            <Icon icon={icon} size="xl" colour="var(--alert-color)" />
          </Box>
        )}
        {/*
          Mantine's modal title, so the dialog is named by it
          (`aria-labelledby`) and a screen reader announces "Delete site,
          dialog" rather than an unnamed dialog. Drawn as a plain wrapper
          round our own heading, which stays the h2. Without a title the
          name is still given, hidden, so the dialog is never unnamed.
        */}
        {title ? (
          <Modal.Title renderRoot={(props) => <div {...props} />}>
            <Heading justify="centre">{title}</Heading>
          </Modal.Title>
        ) : (
          <Modal.Title renderRoot={(props) => <VisuallyHidden {...props} />}>
            {accessibleTitle}
          </Modal.Title>
        )}
        <BodyText justify="centre">{children}</BodyText>
        {field}
        {destructive ? (
          <ButtonPairRed
            onAccept={handleAccept}
            onCancel={onClose}
            acceptLabel={acceptLabel}
            submittingLabel={submittingLabel}
            cancelLabel={cancelLabel}
            acceptDisabled={loading}
            acceptLoading={loading}
            cancelDisabled={pending}
            justify="center"
          />
        ) : (
          <ButtonPair
            onAccept={handleAccept}
            onCancel={onClose}
            acceptLabel={acceptLabel}
            cancelLabel={cancelLabel}
            acceptLoading={loading}
            acceptDisabled={loading}
            cancelDisabled={pending}
            justify="center"
          />
        )}
      </Stack>
    </Modal>
  );
}
