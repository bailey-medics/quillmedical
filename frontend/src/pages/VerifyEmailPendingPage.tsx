/**
 * Verify Email Pending Page
 *
 * Shown after registration to inform the user they need to check
 * their email. Provides a resend button with rate limiting feedback.
 * Delegates rendering to VerifyEmailPending.
 */

// Auth pages use the logo-and-card layout of the sign-in forms, not Container

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { VerifyEmailPending } from "@components/registration";

export default function VerifyEmailPendingPage() {
  const location = useLocation();
  const email: string = (location.state as { email?: string })?.email ?? "";
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    if (!email) return;
    setLoading(true);
    try {
      await api.post("/auth/resend-verification", { email });
      setResent(true);
    } catch {
      // Silently handle - rate limit or other error
    } finally {
      setLoading(false);
    }
  }

  return (
    <VerifyEmailPending
      email={email}
      resent={resent}
      loading={loading}
      onResend={handleResend}
    />
  );
}
