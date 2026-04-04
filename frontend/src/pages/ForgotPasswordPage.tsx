/**
 * Forgot Password Page Module
 *
 * Allows users to request a password reset email by entering their
 * email address. Delegates form rendering to ForgotPasswordForm.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { api } from "@/lib/api";
import { ForgotPasswordForm } from "@components/registration";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(email: string) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post("/auth/forgot-password", { email });
      setSuccess(
        "If an account with that email exists, we've sent a reset link. Please check your inbox.",
      );
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ForgotPasswordForm
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      success={success}
    />
  );
}
