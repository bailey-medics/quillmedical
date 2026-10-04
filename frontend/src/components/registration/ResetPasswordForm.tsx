/**
 * ResetPasswordForm Component
 *
 * Password reset form reached via the email reset link. Accepts a new
 * password and submits it with the reset token from the URL.
 */

import { Group, Stack } from "@mantine/core";
import PageHeader from "@/components/page-header";
import BaseCard from "@components/base-card/BaseCard";
import { PasswordField } from "@components/form";
import CheckboxField from "@components/form/CheckboxField";
import {
  MARKETING_OPT_OUT_DESCRIPTION,
  MARKETING_OPT_OUT_LABEL,
} from "@lib/marketing/wording";
import { QuillLogo } from "@components/images";
import { TextLink } from "@components/typography";
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
  marketingOptOut: boolean;
}

export interface ResetPasswordFormProps {
  /**
   * Called when the form is submitted – should return a FormSubmitResult.
   * `marketingOptOut` is given only when the question was asked.
   */
  onSubmit: (
    newPassword: string,
    marketingOptOut?: boolean,
  ) => Promise<FormSubmitResult>;
  /**
   * Ask the marketing question. For somebody setting their first password
   * from an invite: their account was made for them, so this is the only
   * form they see, and the question a registration form would have asked
   * is asked here. Never for an ordinary reset.
   */
  askAboutMarketing?: boolean;
}

function ResetPasswordFields({
  askAboutMarketing,
}: {
  askAboutMarketing: boolean;
}) {
  const { methods } = useFormContext();

  return (
    <Stack>
      <PageHeader title="Reset password" />
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
      {/* The same opt-out, in the same words, as the registration form:
          left unticked, they are sent news. Never pre-ticked. */}
      {askAboutMarketing && (
        <CheckboxField
          label={MARKETING_OPT_OUT_LABEL}
          description={MARKETING_OPT_OUT_DESCRIPTION}
          {...methods.register("marketingOptOut")}
        />
      )}
      <FormStatusNarrow />
      <SubmitButton />
      <Group justify="flex-end">
        <TextLink standalone to="/login">
          Back to sign in
        </TextLink>
      </Group>
    </Stack>
  );
}

export default function ResetPasswordForm({
  onSubmit,
  askAboutMarketing = false,
}: ResetPasswordFormProps) {
  async function handleSubmit(
    data: ResetPasswordFormValues,
  ): Promise<FormSubmitResult> {
    // An answer is passed on only when the question was on the page, so
    // an ordinary reset can never be read as "shown it and did not tick".
    return askAboutMarketing
      ? onSubmit(data.password, data.marketingOptOut)
      : onSubmit(data.password);
  }

  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <BaseCard maw={380} mx="auto" mt="xl">
        <Form<ResetPasswordFormValues>
          defaultValues={{ password: "", confirm: "", marketingOptOut: false }}
          onSubmit={handleSubmit}
          submitLabel="Reset password"
          submittingLabel="Resetting…"
        >
          <ResetPasswordFields askAboutMarketing={askAboutMarketing} />
        </Form>
      </BaseCard>
    </>
  );
}
