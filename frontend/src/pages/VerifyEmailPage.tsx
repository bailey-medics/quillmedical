/**
 * Verify Email Page
 *
 * Handles the email verification token from the link sent to
 * the user's email. Calls the backend to mark the email as verified.
 * Delegates rendering to VerifyEmail.
 */

// Auth pages use the logo-and-card layout of the sign-in forms, not Container

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { VerifyEmail, type VerifyEmailStatus } from "@components/registration";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<VerifyEmailStatus>(
    token ? "loading" : "error",
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    api
      .post("/auth/verify-email", { token })
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  return <VerifyEmail status={status} />;
}
