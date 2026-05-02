import { Button, Group, Paper, Stack } from "@mantine/core";
import { useState } from "react";
import { TextField } from "@components/form";
import { QuillLogo } from "@components/images";
import {
  BodyText,
  ErrorText,
  HeaderText,
  HyperlinkText,
} from "@components/typography";

export interface ForgotPasswordFormProps {
  /** Called when the form is submitted */
  onSubmit: (email: string) => void;
  /** Whether the form is currently submitting */
  submitting?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Success message to display after submission */
  success?: string | null;
}

export default function ForgotPasswordForm({
  onSubmit,
  submitting = false,
  error = null,
  success = null,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(email.trim());
  }

  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <Paper maw={380} mx="auto" p="lg" mt="xl" radius="md" withBorder>
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            <HeaderText>Forgot password</HeaderText>
            {!success && (
              <BodyText>
                Enter your email address and we&apos;ll send you a link to reset
                your password.
              </BodyText>
            )}
            {!success && (
              <>
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  required
                  autoComplete="email"
                />
                {error && <ErrorText>{error}</ErrorText>}
              </>
            )}
            {success && <BodyText>{success}</BodyText>}
            {!success && (
              <Button type="submit" loading={submitting} size="lg">
                Send reset link
              </Button>
            )}
            <Group justify="flex-end">
              <HyperlinkText to="/login">Back to sign in</HyperlinkText>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
