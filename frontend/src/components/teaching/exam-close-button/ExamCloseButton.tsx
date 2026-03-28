/**
 * ExamCloseButton Component
 *
 * A button + confirmation modal for ending an exam early.
 * Placed next to the timer in QuestionView during assessments.
 */

import { Button, Modal, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle } from "@tabler/icons-react";
import { ButtonPairRed } from "@/components/button";
import BodyTextBold from "@/components/typography/BodyTextBold";
import Icon from "@/components/icons/Icon";

interface ExamCloseButtonProps {
  /** Called when the user confirms they want to end the exam */
  onConfirm: () => void;
}

export default function ExamCloseButton({ onConfirm }: ExamCloseButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button variant="subtle" color="red" size="compact-sm" onClick={open}>
        End exam
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        centered
        withCloseButton={false}
        radius="md"
        styles={{ content: { border: "1px solid rgba(0, 0, 0, 0.1)" } }}
      >
        <Stack gap="md" align="center" pt="xl">
          <Icon icon={<IconAlertTriangle />} size="xl" colour="red" />
          <BodyTextBold justify="centre">
            Are you sure you want to end this exam early? Unanswered questions
            will be marked as incorrect.
          </BodyTextBold>
          <ButtonPairRed
            cancelLabel="Continue exam"
            acceptLabel="End exam"
            onCancel={close}
            onAccept={onConfirm}
          />
        </Stack>
      </Modal>
    </>
  );
}
