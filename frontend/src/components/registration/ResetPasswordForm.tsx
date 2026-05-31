/**
 * ResetPasswordForm Component
 *
 * Password reset form reached via the email reset link. Accepts a new
 * password and submits it with the reset token from the URL.
 */

import { Group, Stack } from "@mantine/core";
import BaseCard from "@components/base-card/BaseCard";
import { PasswordField } from "@components/form";
import { QuillLogo } from "@components/images";
import { Heading, TextLink } from "@components/typography";
import {
  Form,
  FormStatusNarrow,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";

interface ResetPasswordFormValues {
  password: string;
  confirm: string;
}

export interface ResetPasswordFormProps {
  /** Called when the form is submitted — should return a FormSubmitResult */
  onSubmit: (newPassword: string) => Promise<FormSubmitResult>;
}

function ResetPasswordFields() {
  const { methods } = useFormContext();

  return (
    <Stack>
      <Heading>Reset password</Heading>
      <PasswordField
        label="New password"
        {...methods.register("password", {
          required: true,
          minLength: 8,
        })}
        required
        autoComplete="new-password"
      />
      <PasswordField
        label="Confirm password"
        {...methods.register("confirm", {
          required: true,
          validate: (value: string) =>
            value === methods.getValues("password") || "Passwords do not match",
        })}
        required
        autoComplete="new-password"
      />
      <FormStatusNarrow />
      <SubmitButton />
      <Group justify="flex-end">
        <TextLink to="/login">Back to sign in</TextLink>
      </Group>
    </Stack>
  );
}

export default function ResetPasswordForm({
  onSubmit,
}: ResetPasswordFormProps) {
  async function handleSubmit(
    data: ResetPasswordFormValues,
  ): Promise<FormSubmitResult> {
    return onSubmit(data.password);
  }

  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <BaseCard maw={380} mx="auto" mt="xl">
        <Form<ResetPasswordFormValues>
          defaultValues={{ password: "", confirm: "" }}
          onSubmit={handleSubmit}
          submitLabel="Reset password"
          submittingLabel="Resetting…"
        >
          <ResetPasswordFields />
        </Form>
      </BaseCard>
    </>
  );
}
