/**
 * ExamCloseButton Component
 *
 * A button + confirmation modal for ending an exam early.
 * Placed next to the timer in QuestionView during assessments.
 */

import { Badge, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle } from "@/components/icons/appIcons";
import { ConfirmModal } from "@/components/confirm-modal";

interface ExamCloseButtonProps {
  /** Called when the user confirms they want to end the exam */
  onConfirm: () => void;
}

export default function ExamCloseButton({ onConfirm }: ExamCloseButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Badge
        color="var(--alert-color)"
        variant="filled"
        size="xl"
        style={{ cursor: "pointer", textTransform: "none" }}
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
