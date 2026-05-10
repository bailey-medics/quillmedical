import { Group, Paper, Stack } from "@mantine/core";
import { EmailField, EMAIL_PATTERN } from "@components/form";
import { QuillLogo } from "@components/images";
import { BodyText, Heading, TextLink } from "@components/typography";
import {
  Form,
  FormStatusNarrow,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";

interface ForgotPasswordFormValues {
  email: string;
}

export interface ForgotPasswordFormProps {
  /** Called when the form is submitted — should return a FormSubmitResult */
  onSubmit: (email: string) => Promise<FormSubmitResult>;
}

function ForgotPasswordFields() {
  const { formState, statusMessage, methods } = useFormContext();
  const isSuccess = formState === "success";

  return (
    <Stack>
      <Heading>Forgot password</Heading>
      {isSuccess && statusMessage && (
        <BodyText>{statusMessage.description ?? statusMessage.title}</BodyText>
      )}
      {!isSuccess && (
        <>
          <BodyText>
            Enter your email address and we&apos;ll send you a link to reset
            your password.
          </BodyText>
          <EmailField
            label="Email"
            {...methods.register("email", {
              required: true,
              pattern: EMAIL_PATTERN,
            })}
            required
          />
          <FormStatusNarrow />
          <SubmitButton />
        </>
      )}
      <Group justify="flex-end">
        <TextLink to="/login">Back to sign in</TextLink>
      </Group>
    </Stack>
  );
}

export default function ForgotPasswordForm({
  onSubmit,
}: ForgotPasswordFormProps) {
  async function handleSubmit(
    data: ForgotPasswordFormValues,
  ): Promise<FormSubmitResult> {
    return onSubmit(data.email.trim());
  }

  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <Paper maw={380} mx="auto" p="lg" mt="xl" radius="md" withBorder>
        <Form<ForgotPasswordFormValues>
          defaultValues={{ email: "" }}
          onSubmit={handleSubmit}
          submitLabel="Send reset link"
          submittingLabel="Sending…"
        >
          <ForgotPasswordFields />
        </Form>
      </Paper>
    </>
  );
}
