/**
 * FeedbackModal Component
 *
 * Where somebody tells us something is wrong, or could be better. One
 * required message, an optional category, and a confirmation once it has
 * arrived.
 *
 * A modal rather than a page: routing away would lose the screen being
 * described, and people describe better what they can still see behind
 * the modal.
 *
 * The message may well contain patient data — somebody describing a bug
 * pastes what they were looking at — so the field says not to, and the
 * server treats what arrives as though it might anyway.
 *
 * Sending is the caller's `onSubmit`, so the modal knows nothing of the
 * network: the app passes `sendFeedback`, stories and tests pass a stub.
 *
 * @example
 * ```tsx
 * <FeedbackModal
 *   opened={opened}
 *   onClose={() => setOpened(false)}
 *   onSubmit={sendFeedback}
 * />
 * ```
 */

import { Modal, Stack } from "@mantine/core";
import { useState } from "react";
import { Controller } from "react-hook-form";
import ButtonPair from "@/components/button/ButtonPair";
import {
  Form,
  FormStatusNarrow,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import SelectField from "@/components/form/SelectField";
import TextAreaField from "@/components/form/TextAreaField";
import ResultMessage from "@/components/message-cards/ResultMessage";
import BodyText from "@/components/typography/BodyText";
import Heading from "@/components/typography/Heading";
import {
  FEEDBACK_CATEGORY_OPTIONS,
  type FeedbackCategory,
  type FeedbackInput,
} from "@/lib/feedback/sendFeedback";

export interface FeedbackModalProps {
  /** Whether the modal is open */
  opened: boolean;
  /** Called on Cancel, Close or Escape */
  onClose: () => void;
  /** Sends the feedback; rejecting shows the sender it did not arrive */
  onSubmit: (input: FeedbackInput) => Promise<unknown>;
}

interface FeedbackFormValues {
  category: FeedbackCategory | null;
  message: string;
}

/** Inner fields — needs the Form context to reach React Hook Form. */
function FeedbackFields({ onClose }: { onClose: () => void }) {
  const { methods } = useFormContext();
  const { register, control } = methods;

  return (
    <Stack gap="md">
      <BodyText>
        Tell us what went wrong, or what would make this better.
      </BodyText>

      <Controller
        name="category"
        control={control}
        render={({ field }) => (
          <SelectField
            label="What is it about?"
            placeholder="Choose one (optional)"
            data={[...FEEDBACK_CATEGORY_OPTIONS]}
            value={field.value as string | null}
            onChange={field.onChange}
          />
        )}
      />

      <TextAreaField
        label="Message"
        description="Do not include patient details."
        minRows={4}
        autosize
        maxRows={10}
        maxLength={5000}
        required
        data-autofocus
        {...register("message", {
          required: true,
          validate: (value: unknown) =>
            typeof value === "string" && value.trim().length > 0,
        })}
      />

      <FormStatusNarrow />
      <SubmitButton onCancel={onClose} cancelLabel="Cancel" />
    </Stack>
  );
}

export default function FeedbackModal({
  opened,
  onClose,
  onSubmit,
}: FeedbackModalProps) {
  const [sent, setSent] = useState(false);

  const handleClose = () => {
    setSent(false);
    onClose();
  };

  const handleSubmit = async (
    data: FeedbackFormValues,
  ): Promise<FormSubmitResult> => {
    try {
      await onSubmit({ category: data.category, message: data.message });
    } catch {
      return {
        state: "error",
        message: {
          title: "Your feedback was not sent",
          description: "Please try again.",
        },
      };
    }
    setSent(true);
    return { state: "success", message: { title: "Feedback sent" } };
  };

  if (!opened) return null;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={<Heading>Send feedback</Heading>}
      size="lg"
      centered
    >
      {sent ? (
        <Stack gap="md">
          <ResultMessage
            variant="success"
            title="Feedback sent"
            subtitle="Thank you for telling us."
          />
          <ButtonPair acceptLabel="Close" onAccept={handleClose} />
        </Stack>
      ) : (
        <Form<FeedbackFormValues>
          defaultValues={{ category: null, message: "" }}
          onSubmit={handleSubmit}
          submitLabel="Send feedback"
          submittingLabel={"Sending…"}
          blockNavigation={false}
        >
          <FeedbackFields onClose={handleClose} />
        </Form>
      )}
    </Modal>
  );
}
