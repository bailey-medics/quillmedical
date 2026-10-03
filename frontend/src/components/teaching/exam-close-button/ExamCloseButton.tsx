/**
 * ExamCloseButton Component
 *
 * A button + confirmation modal for ending an exam early.
 * Placed next to the timer in the ribbon during an assessment.
 *
 * It looks like a badge, to pair with the timer, but it is a real
 * button: Tab reaches it, and Enter or Space opens the confirmation.
 */

import { Badge, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle } from "@/components/icons/appIcons";
import { ConfirmModal } from "@/components/confirm-modal";
import classes from "./ExamCloseButton.module.css";

interface ExamCloseButtonProps {
  /** Called when the user confirms they want to end the exam */
  onConfirm: () => void;
}

export default function ExamCloseButton({ onConfirm }: ExamCloseButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Badge
        component="button"
        type="button"
        color="var(--alert-color)"
        variant="filled"
        size="xl"
        className={classes.button}
        onClick={open}
      >
        <Text size="lg" fw={600}>
          End exam
        </Text>
      </Badge>

      <ConfirmModal
        opened={opened}
        onClose={close}
        onAccept={onConfirm}
        acceptLabel="End exam"
        cancelLabel="Continue"
        icon={<IconAlertTriangle />}
      >
        Are you sure you want to end this exam early? Unanswered questions will
        be marked as incorrect.
      </ConfirmModal>
    </>
  );
}
