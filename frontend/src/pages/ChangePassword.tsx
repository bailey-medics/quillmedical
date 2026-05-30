/**
 * Change Password Page Module
 *
 * Allows authenticated users to change their password by providing
 * their current password and a new password with confirmation.
 */

import { Container, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import PasswordField from "@/components/form/PasswordField";
import PageHeader from "@/components/page-header";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { api } from "@/lib/api";

interface ChangePasswordFormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

function ChangePasswordFields() {
  const navigate = useNavigate();
  const { methods, formState } = useFormContext();
  const newPasswordValue = methods.watch("newPassword");

  useEffect(() => {
    if (formState === "success") {
      methods.reset({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    }
  }, [formState, methods]);

  return (
    <Stack gap="md">
      <PageHeader title="Change password" />
      <BaseCard maw={480} mx="auto">
        <Stack>
          <FormStatus />
          <PasswordField
            label="Current password"
            {...methods.register("currentPassword", {
              required: "Current password is required",
            })}
            error={methods.formState.errors.currentPassword?.message as string}
            withAsterisk
          />
          <PasswordField
            label="New password"
            {...methods.register("newPassword", {
              required: "New password is required",
              minLength: {
                value: 8,
                message: "New password must be at least 8 characters",
              },
            })}
            error={methods.formState.errors.newPassword?.message as string}
            withAsterisk
          />
          <PasswordField
            label="Confirm new password"
            {...methods.register("confirmPassword", {
              required: "Please confirm your new password",
              validate: (v: string) =>
                v === newPasswordValue || "New passwords do not match",
            })}
            error={methods.formState.errors.confirmPassword?.message as string}
            withAsterisk
          />
          <SubmitButton onCancel={() => navigate("/settings")} />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function ChangePassword() {
  async function handleSubmit(
    data: ChangePasswordFormValues,
  ): Promise<FormSubmitResult> {
    try {
      await api.post("/auth/change-password", {
        current_password: data.currentPassword,
        new_password: data.newPassword,
      });
      return {
        state: "success",
        message: { title: "Password changed" },
      };
    } catch (err) {
      return {
        state: "error",
        message: {
          title: "Failed to change password",
          description:
            err instanceof Error ? err.message : "An unexpected error occurred",
        },
      };
    }
  }

  return (
    <Container size="lg">
      <Form<ChangePasswordFormValues>
        defaultValues={{
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }}
        onSubmit={handleSubmit}
        submitLabel="Change password"
        submittingLabel="Changing…"
      >
        <ChangePasswordFields />
      </Form>
    </Container>
  );
}
