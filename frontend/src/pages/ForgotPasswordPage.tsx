/**
 * Forgot Password Page Module
 *
 * Allows users to request a password reset email by entering their
 * email address. Delegates form rendering to ForgotPasswordForm.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { api } from "@/lib/api";
import type { FormSubmitResult } from "@/components/form/Form";
import { ForgotPasswordForm } from "@components/registration";

export default function ForgotPasswordPage() {
  async function handleSubmit(email: string): Promise<FormSubmitResult> {
    try {
      await api.post("/auth/forgot-password", { email });
      return {
        state: "success",
        message: {
          title: "Check your inbox",
          description:
            "If an account with that email exists, we've sent a reset link. Please check your inbox.",
        },
      };
    } catch {
      return {
        state: "error",
        message: {
          title: "Something went wrong",
          description: "Please try again.",
        },
      };
    }
  }

  return <ForgotPasswordForm onSubmit={handleSubmit} />;
}
