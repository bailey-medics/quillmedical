import { Group, Paper, Stack } from "@mantine/core";
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
  const password = methods.watch("password") as string;
  const confirm = methods.watch("confirm") as string;

  return (
    <Stack>
      <Heading>Reset password</Heading>
      <PasswordField
        label="New password"
        value={password}
        onChange={(e) =>
          methods.setValue("password", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
        required
        autoComplete="new-password"
      />
      <PasswordField
        label="Confirm password"
        value={confirm}
        onChange={(e) =>
          methods.setValue("confirm", e.currentTarget.value, {
            shouldDirty: true,
          })
        }
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
    if (data.password.length < 8) {
      return {
        state: "validation_error",
        message: {
          title: "Password must be at least 8 characters",
        },
      };
    }
    if (data.password !== data.confirm) {
      return {
        state: "validation_error",
        message: {
          title: "Passwords do not match",
        },
      };
    }
    return onSubmit(data.password);
  }

  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <Paper maw={380} mx="auto" p="lg" mt="xl" radius="md" withBorder>
        <Form<ResetPasswordFormValues>
          defaultValues={{ password: "", confirm: "" }}
          onSubmit={handleSubmit}
          submitLabel="Reset password"
          submittingLabel="Resetting…"
        >
          <ResetPasswordFields />
        </Form>
      </Paper>
    </>
  );
}
