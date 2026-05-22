/**
 * Verify Email Page
 *
 * Handles the email verification token from the link sent to
 * the user's email. Calls the backend to mark the email as verified.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { useEffect, useState } from "react";
import { Center, Stack } from "@mantine/core";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { BodyText, TextLink } from "@components/typography";
import { ResultMessage, StateMessage } from "@components/message-cards";
import { IconClock, IconAlertCircle } from "@components/icons/appIcons";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">(
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

  if (status === "loading") {
    return (
      <Center mih="100vh">
        <StateMessage
          icon={<IconClock />}
          title="Verifying your email…"
          description="Please wait while we verify your email address."
          colour="info"
        />
      </Center>
    );
  }

  if (status === "success") {
    return (
      <Center mih="100vh">
        <Stack align="center" gap="md">
          <ResultMessage variant="success" title="Email verified" />
          <BodyText>Your email has been verified. You can now log in.</BodyText>
          <TextLink to="/login">Go to login</TextLink>
        </Stack>
      </Center>
    );
  }

  return (
    <Center mih="100vh">
      <Stack align="center" gap="md">
        <StateMessage
          icon={<IconAlertCircle />}
          title="Verification failed"
          description="This link is invalid or has expired. Please request a new verification email."
          colour="alert"
        />
        <TextLink to="/verify-email-pending">
          Resend verification email
        </TextLink>
      </Stack>
    </Center>
  );
}
