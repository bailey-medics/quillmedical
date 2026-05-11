/**
 * Reset Password Page Module
 *
 * Allows users to set a new password using a token from
 * the password reset email. Redirects to login on success.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { api } from "@/lib/api";
import type { FormSubmitResult } from "@/components/form/Form";
import { ResetPasswordForm } from "@components/registration";
import { useSearchParams } from "react-router-dom";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  async function handleSubmit(newPassword: string): Promise<FormSubmitResult> {
    if (!token) {
      return {
        state: "error",
        message: {
          title: "Missing reset token",
          description: "Please use the link from your email.",
        },
      };
    }
    try {
      await api.post("/auth/reset-password", {
        token,
        new_password: newPassword,
      });
      window.location.assign("/login");
      return {
        state: "success",
        message: { title: "Password reset successfully" },
      };
    } catch (err: unknown) {
      let msg = "Password reset failed";
      if (err instanceof Error && err.message) msg = err.message;
      return {
        state: "error",
        message: { title: msg },
      };
    }
  }

  return <ResetPasswordForm onSubmit={handleSubmit} />;
}
