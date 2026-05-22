/**
 * Verify Email Pending Page
 *
 * Shown after registration to inform the user they need to check
 * their email. Provides a resend button with rate limiting feedback.
 */

/* eslint-disable no-restricted-syntax */
// Auth pages use centred form layout, not Container

import { useState } from "react";
import { Button, Center, Stack } from "@mantine/core";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { Heading, BodyText, TextLink } from "@components/typography";

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
      // Silently handle — rate limit or other error
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center mih="100vh">
      <Stack align="center" gap="md" maw={420}>
        <Heading>Check your email</Heading>
        <BodyText justify="centre">
          We&apos;ve sent a verification link to{" "}
          {email ? <strong>{email}</strong> : "your email address"}. Please
          click the link to activate your account.
        </BodyText>
        <BodyText justify="centre" c="dimmed">
          The link expires in 60 minutes. Check your spam folder if you
          don&apos;t see it.
        </BodyText>
        {email && !resent && (
          <Button variant="subtle" onClick={handleResend} loading={loading}>
            Resend verification email
          </Button>
        )}
        {resent && <BodyText c="green">Verification email resent.</BodyText>}
        <TextLink to="/login">Back to login</TextLink>
      </Stack>
    </Center>
  );
}
