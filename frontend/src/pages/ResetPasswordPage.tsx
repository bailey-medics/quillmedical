/**
 * Reset Password Page Module
 *
 * Allows users to set a new password using a token from
 * the password reset email. Redirects to login on success.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { api } from "@/lib/api";
import { ResetPasswordForm } from "@components/registration";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(newPassword: string) {
    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", {
        token,
        new_password: newPassword,
      });
      window.location.assign("/login");
    } catch (err: unknown) {
      let msg = "Password reset failed";
      if (err instanceof Error && err.message) msg = err.message;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResetPasswordForm
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
    />
  );
}
