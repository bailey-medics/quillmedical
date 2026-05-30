/**
 * Account Page Module
 *
 * Allows authenticated users to update their profile (full name, email)
 * and change their password in a single form. Username is read-only.
 */

import { Container, Stack } from "@mantine/core";
import BaseCard from "@/components/base-card/BaseCard";
import Divider from "@/components/divider/Divider";
import PasswordField from "@/components/form/PasswordField";
import TextField from "@/components/form/TextField";
import PageHeader from "@/components/page-header";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/auth/AuthContext";
import {
  Form,
  FormStatus,
  SubmitButton,
  useFormContext,
} from "@/components/form/Form";
import type { FormSubmitResult } from "@/components/form/Form";
import { api } from "@/lib/api";

interface AccountFormValues {
  fullName: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

function AccountFields() {
  const navigate = useNavigate();
  const { state } = useAuth();
  const { methods, formState } = useFormContext();
  const newPasswordValue = methods.watch("newPassword");

  useEffect(() => {
    if (formState === "success") {
      methods.reset({
        fullName: methods.getValues("fullName"),
        email: methods.getValues("email"),
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    }
  }, [formState, methods]);

  const username = state.status === "authenticated" ? state.user.username : "";

  return (
    <Stack gap="md">
      <PageHeader title="Account" />
      <BaseCard>
        <Stack>
          <FormStatus />
          <TextField
            label="Full name"
            {...methods.register("fullName")}
            error={methods.formState.errors.fullName?.message as string}
          />
          <TextField label="Username" value={username} disabled />
          <TextField
            label="Email"
            type="email"
            {...methods.register("email", {
              required: "Email is required",
            })}
            error={methods.formState.errors.email?.message as string}
            withAsterisk
          />
          <Divider my="sm" />
          <PasswordField
            label="Current password"
            {...methods.register("currentPassword", {
              validate: (v: string) => {
                const newPw = methods.getValues("newPassword");
                if (newPw && !v) return "Current password is required";
                return true;
              },
            })}
            error={methods.formState.errors.currentPassword?.message as string}
          />
          <PasswordField
            label="New password"
            {...methods.register("newPassword", {
              validate: (v: string) => {
                if (v && v.length < 8)
                  return "New password must be at least 8 characters";
                return true;
              },
            })}
            error={methods.formState.errors.newPassword?.message as string}
          />
          <PasswordField
            label="Confirm new password"
            {...methods.register("confirmPassword", {
              validate: (v: string) => {
                if (newPasswordValue && !v)
                  return "Please confirm your new password";
                if (v && v !== newPasswordValue)
                  return "New passwords do not match";
                return true;
              },
            })}
            error={methods.formState.errors.confirmPassword?.message as string}
          />
          <SubmitButton onCancel={() => navigate("/settings")} />
        </Stack>
      </BaseCard>
    </Stack>
  );
}

export default function AccountPage() {
  const { state, reload } = useAuth();

  const defaultValues: AccountFormValues = {
    fullName: state.status === "authenticated" ? (state.user.name ?? "") : "",
    email: state.status === "authenticated" ? state.user.email : "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  };

  async function handleSubmit(
    data: AccountFormValues,
  ): Promise<FormSubmitResult> {
    const errors: string[] = [];
    let profileUpdated = false;
    let passwordChanged = false;

    // Update profile if name or email changed
    const nameChanged =
      state.status === "authenticated" &&
      data.fullName !== (state.user.name ?? "");
    const emailChanged =
      state.status === "authenticated" && data.email !== state.user.email;

    if (nameChanged || emailChanged) {
      try {
        await api.patch("/auth/profile", {
          ...(nameChanged ? { full_name: data.fullName } : {}),
          ...(emailChanged ? { email: data.email } : {}),
        });
        profileUpdated = true;
      } catch (err) {
        errors.push(
          err instanceof Error ? err.message : "Failed to update profile",
        );
      }
    }

    // Change password if fields are filled
    if (data.newPassword) {
      try {
        await api.post("/auth/change-password", {
          current_password: data.currentPassword,
          new_password: data.newPassword,
        });
        passwordChanged = true;
      } catch (err) {
        errors.push(
          err instanceof Error ? err.message : "Failed to change password",
        );
      }
    }

    if (profileUpdated) {
      await reload();
    }

    if (errors.length > 0) {
      const anySuccess = profileUpdated || passwordChanged;
      return {
        state: anySuccess ? "partial_success" : "error",
        message: {
          title: anySuccess ? "Partially updated" : "Failed to save changes",
          description: errors.join(". "),
        },
      };
    }

    if (!profileUpdated && !passwordChanged) {
      return {
        state: "error",
        message: { title: "No changes to save" },
      };
    }

    const parts: string[] = [];
    if (profileUpdated) parts.push("Profile updated");
    if (passwordChanged) parts.push("Password changed");

    return {
      state: "success",
      message: { title: parts.join(". ") },
    };
  }

  return (
    <Container size="lg">
      <Form<AccountFormValues>
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        submitLabel="Save"
        submittingLabel="Saving…"
      >
        <AccountFields />
      </Form>
    </Container>
  );
}
