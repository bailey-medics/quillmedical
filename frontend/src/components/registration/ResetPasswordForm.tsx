import { Button, Group, Paper, Stack } from "@mantine/core";
import { useState } from "react";
import { PasswordField } from "@components/form";
import { QuillLogo } from "@components/images";
import { ErrorMessage, Heading, TextLink } from "@components/typography";

export interface ResetPasswordFormProps {
  /** Called when the form is submitted */
  onSubmit: (newPassword: string) => void;
  /** Whether the form is currently submitting */
  submitting?: boolean;
  /** Error message to display */
  error?: string | null;
}

export default function ResetPasswordForm({
  onSubmit,
  submitting = false,
  error = null,
}: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setLocalError("Passwords do not match");
      return;
    }
    onSubmit(password);
  }

  const displayError = error ?? localError;

  return (
    <>
      <Stack align="center" justify="center" mt="xl">
        <QuillLogo height={8} />
      </Stack>

      <Paper maw={380} mx="auto" p="lg" mt="xl" radius="md" withBorder>
        <form onSubmit={handleSubmit} noValidate>
          <Stack>
            <Heading>Reset password</Heading>
            <PasswordField
              label="New password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
              autoComplete="new-password"
            />
            <PasswordField
              label="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              required
              autoComplete="new-password"
            />
            {displayError && <ErrorMessage>{displayError}</ErrorMessage>}
            <Button type="submit" loading={submitting} size="lg">
              Reset password
            </Button>
            <Group justify="flex-end">
              <TextLink to="/login">Back to sign in</TextLink>
            </Group>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
