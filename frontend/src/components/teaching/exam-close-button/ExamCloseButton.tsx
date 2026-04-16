/**
 * ExamCloseButton Component
 *
 * A button + confirmation modal for ending an exam early.
 * Placed next to the timer in QuestionView during assessments.
 */

import { Badge, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle } from "@/components/icons/appIcons";
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
      <Badge
        color="red"
        variant="filled"
        size="xl"
        style={{ cursor: "pointer", textTransform: "none" }}
        onClick={open}
      >
        <Text size="lg" fw={600}>
          End exam
        </Text>
      </Badge>

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
